// menu.js — главное меню: новая карта (размер/тип/параметры), загрузка/сохранение карт.
// Смена размера/загрузка делаются через перезагрузку страницы с конфигом в sessionStorage —
// так ВСЕ массивы создаются сразу нужного размера (без сложного resize «на лету»).
'use strict';

const SAVE_PREFIX = 'earthsim.save.';

// ---------- сериализация мира ----------
const _SCAL_KEYS = ['co2', 'solar', 'seaLevel', 'globalForce', 'tiltMul', 'windMul', 'currentMul', 'poleCold',
  'co2ppm', 'globalEmissions', 'ecoGlobal', 'simYear', 'simTick', 'dayOfYear', 'seasonPhase', 'paused'];

function _ab2b64(view) {
  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function _b642ab(b64) {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8.buffer;
}
function serializeWorld() {
  const save = { v: 1, w: GRID.W, h: GRID.H, ts: 0, scal: {}, arrays: {}, states: [], stateSeq: (typeof _stateSeq !== 'undefined' ? _stateSeq : 0), events: (typeof worldEvents !== 'undefined' ? worldEvents.slice(0, 260) : []) };
  for (const k of _SCAL_KEYS) save.scal[k] = W[k];
  for (const k in W) { const v = W[k]; if (ArrayBuffer.isView(v)) save.arrays[k] = { t: v.constructor.name, b: _ab2b64(v) }; }
  if (typeof states !== 'undefined') for (const st of states) save.states.push({
    id: st.id, alive: st.alive, color: st.color, capital: st.capital, pop: st.pop, area: st.area,
    tech: st.tech, era: st.era, treasury: st.treasury, military: st.military, stability: st.stability,
    industry: st.industry, pollution: st.pollution, economy: st.economy, atWar: st.atWar,
    cityCount: st.cityCount, largestCity: st.largestCity, urbanPct: st.urbanPct, name: st.name,
    history: st.history || [], cells: Array.from(st.cells), relations: Array.from(st.relations),
  });
  return save;
}
function applyLoadedSave(save) {
  for (const k in save.arrays) {
    const a = save.arrays[k]; if (!W[k] || !ArrayBuffer.isView(W[k])) continue;
    const Ctor = window[a.t]; if (!Ctor) continue;
    const arr = new Ctor(_b642ab(a.b));
    if (arr.length === W[k].length) W[k].set(arr);
  }
  for (const k of _SCAL_KEYS) if (k in save.scal) W[k] = save.scal[k];
  if (typeof _stateSeq !== 'undefined') _stateSeq = save.stateSeq || 0;
  if (typeof states !== 'undefined') {
    states.length = 0;
    let maxId = -1; for (const ss of save.states) if (ss.id > maxId) maxId = ss.id;
    for (let i = 0; i <= maxId; i++) states[i] = { id: i, alive: false, color: [120, 120, 120], capital: -1, cells: new Set(), relations: new Map(), pop: 0, area: 0, tech: 0, era: 0, treasury: 0, military: 0, stability: 1, industry: 0, pollution: 0, economy: 0, atWar: 0, cityCount: 0, largestCity: 0, urbanPct: 0, name: '', history: [] };
    for (const ss of save.states) states[ss.id] = Object.assign(states[ss.id], ss, { cells: new Set(ss.cells), relations: new Map(ss.relations), history: ss.history || [] });
    if (typeof ships !== 'undefined') ships.length = 0;
    if (typeof battles !== 'undefined') battles.length = 0;
    if (typeof selectedState !== 'undefined') selectedState = null;
    if (typeof highlightedState !== 'undefined') highlightedState = null;
  }
  if (typeof worldEvents !== 'undefined' && Array.isArray(save.events)) { worldEvents.length = 0; for (const e of save.events) worldEvents.push(e); if (typeof _eventsChanged !== 'undefined') _eventsChanged = true; }
  if (typeof recomputeStatic === 'function') recomputeStatic(true);   // пересчитать производные поля (вода/берег/склон) из elev
  if (typeof rebuildCities === 'function') rebuildCities();
  if (typeof refreshCapacities === 'function') refreshCapacities();
  markDirty('base'); markDirty('borders');
  return true;
}
function loadWorldFromStorage(key) {
  const raw = localStorage.getItem(key); if (!raw) return false;
  let save; try { save = JSON.parse(raw); } catch (e) { return false; }
  if (save.w !== GRID.W || save.h !== GRID.H) return false;   // размер выставляется через boot до создания массивов
  return applyLoadedSave(save);
}

// ---------- сохранение текущего мира ----------
function listSaves() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(SAVE_PREFIX) === 0) out.push(k.slice(SAVE_PREFIX.length)); }
  return out.sort();
}
function saveWorldToStorage(name) {
  name = (name || '').trim() || ('Карта ' + (Math.floor(W.simYear) || 0) + 'г');
  const save = serializeWorld();
  try { localStorage.setItem(SAVE_PREFIX + name, JSON.stringify(save)); return name; }
  catch (e) { alert('Не удалось сохранить (возможно, не хватает места в браузере для карты такого размера).'); return null; }
}
function downloadWorldFile() {
  const save = serializeWorld();
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'earthsim_' + GRID.W + 'x' + GRID.H + '_' + (Math.floor(W.simYear) || 0) + 'y.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// перезагрузка с конфигом «новая карта»
function bootNewMap(cfg) { sessionStorage.setItem('earthsim.boot', JSON.stringify(Object.assign({ mode: 'new' }, cfg))); location.reload(); }
// перезагрузка с конфигом «загрузить» (localStorage-ключ)
function bootLoadMap(key, w, h) { sessionStorage.setItem('earthsim.boot', JSON.stringify({ mode: 'load', key, w, h })); location.reload(); }

// ---------- интерфейс главного меню ----------
let _menuEl = null;
function _buildMenu() {
  if (_menuEl) return _menuEl;
  const css = document.createElement('style'); css.textContent = `
  #main-menu{position:fixed;inset:0;z-index:400;display:none;align-items:center;justify-content:center;background:radial-gradient(1200px 700px at 50% -10%,#1b2a44,#080c16 70%);backdrop-filter:blur(2px);font-family:"Segoe UI",system-ui,sans-serif;color:#e8ecf6}
  #main-menu.show{display:flex}
  .mm-card{width:min(760px,95vw);max-height:92vh;overflow:auto;background:linear-gradient(rgba(16,22,36,.96),rgba(10,14,24,.98));border:1px solid #2a3550;border-radius:16px;padding:20px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6)}
  .mm-title{font-size:24px;font-weight:800;letter-spacing:.5px;margin-bottom:2px}.mm-sub{font-size:12px;color:#90a0c0;margin-bottom:16px}
  .mm-tabs{display:flex;gap:6px;margin-bottom:14px}
  .mm-tab{flex:1;padding:9px;border-radius:9px;border:1px solid #2a3550;background:rgba(255,255,255,.04);color:#b9c3dc;cursor:pointer;font-weight:600;font-size:13px}
  .mm-tab.on{background:#3a5bd0;color:#fff;border-color:#3a5bd0}
  .mm-pane{display:none}.mm-pane.on{display:block}
  .mm-row{display:flex;align-items:center;gap:10px;margin:9px 0}.mm-row label{width:150px;font-size:13px;color:#c2cce0}
  .mm-row input[type=number]{width:84px}.mm-row input[type=range]{flex:1}
  .mm-row select,.mm-row input[type=number],.mm-row input[type=text]{background:#0d1426;border:1px solid #2a3550;color:#e8ecf6;border-radius:7px;padding:6px 8px;font-size:13px}
  .mm-row .val{width:54px;text-align:right;font-size:12px;color:#9fb0c8}
  .mm-btn{padding:10px 16px;border-radius:9px;border:1px solid #2a3550;background:rgba(255,255,255,.05);color:#dde6f7;cursor:pointer;font-weight:700;font-size:13px}
  .mm-btn.go{background:#2e7d46;border-color:#2e7d46;color:#fff}.mm-btn.alt{background:#3a5bd0;border-color:#3a5bd0;color:#fff}
  .mm-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .mm-saves{max-height:200px;overflow:auto;border:1px solid #2a3550;border-radius:9px;margin:8px 0}
  .mm-save{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px}
  .mm-save .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mm-save button{padding:4px 9px;border-radius:6px;border:1px solid #2a3550;background:rgba(255,255,255,.05);color:#dde6f7;cursor:pointer;font-size:12px}
  .mm-save button.del{color:#e88;border-color:#5a2a2a}
  .mm-hint{font-size:11px;color:#7e8aa6;margin-top:6px}
  #mm-open{position:fixed;top:8px;left:8px;z-index:120;padding:6px 11px;border-radius:8px;border:1px solid #2a3550;background:rgba(12,18,30,.85);color:#dde6f7;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit}
  #mm-open:hover{background:rgba(40,60,110,.9)}`;
  document.head.appendChild(css);

  const m = document.createElement('div'); m.id = 'main-menu';
  m.innerHTML = `<div class='mm-card'>
    <div class='mm-title'>🌍 Earth Simulator</div><div class='mm-sub'>Создайте новый мир или загрузите сохранённую карту</div>
    <div class='mm-tabs'><button class='mm-tab on' data-tab='new'>🆕 Новая карта</button><button class='mm-tab' data-tab='load'>📂 Загрузить</button></div>
    <div class='mm-pane on' data-pane='new'>
      <div class='mm-row'><label>Размер карты</label><input id='mm-w' type='number' min='24' max='220' value='80'> × <input id='mm-h' type='number' min='24' max='220' value='60'> клеток</div>
      <div class='mm-row'><label>Рельеф</label><select id='mm-type'><option value='earth'>🌍 Реальная Земля</option><option value='continents' selected>Континенты</option><option value='pangea'>Пангея</option><option value='islands'>Острова</option><option value='empty'>Пустая (океан)</option><option value='flat'>Пустая (ровная суша)</option></select></div>
      <div class='mm-row'><label>Уровень моря</label><input id='mm-sea' type='range' min='25' max='60' value='40'><span class='val' id='mm-sea-v'>40%</span></div>
      <div class='mm-row'><label>CO₂ (парник)</label><input id='mm-co2' type='range' min='40' max='320' value='100'><span class='val' id='mm-co2-v'>1.0×</span></div>
      <div class='mm-row'><label>Солнце</label><input id='mm-sun' type='range' min='88' max='112' value='100'><span class='val' id='mm-sun-v'>1.00×</span></div>
      <div class='mm-actions'><button class='mm-btn go' id='mm-create'>Создать мир</button><button class='mm-btn' id='mm-play'>▶ Играть в текущий</button></div>
      <div class='mm-hint'>«Пустую» карту можно лепить инструментами рельефа. Большие карты считаются медленнее.</div>
    </div>
    <div class='mm-pane' data-pane='load'>
      <div class='mm-saves' id='mm-savelist'></div>
      <div class='mm-actions'><label class='mm-btn alt' style='cursor:pointer'>📥 Из файла…<input id='mm-file' type='file' accept='.json,application/json' style='display:none'></label></div>
      <div class='mm-hint'>Сохранения хранятся в этом браузере. Файлом можно перенести карту между устройствами.</div>
    </div>
    <hr style='border:none;border-top:1px solid #243049;margin:16px 0 10px'>
    <div class='mm-row'><label>Сохранить текущую</label><input id='mm-savename' type='text' placeholder='название карты' style='flex:1'><button class='mm-btn' id='mm-save'>💾 В браузер</button><button class='mm-btn' id='mm-export'>⬇ Файл</button></div>
  </div>`;
  document.body.appendChild(m); _menuEl = m;

  // вкладки
  m.querySelectorAll('.mm-tab').forEach(t => t.addEventListener('click', () => {
    m.querySelectorAll('.mm-tab').forEach(x => x.classList.toggle('on', x === t));
    m.querySelectorAll('.mm-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    if (t.dataset.tab === 'load') _refreshSaveList();
  }));
  // ползунки → подписи
  const bind = (id, vid, fmt) => { const el = m.querySelector('#' + id), v = m.querySelector('#' + vid); const upd = () => v.textContent = fmt(+el.value); el.addEventListener('input', upd); upd(); };
  bind('mm-sea', 'mm-sea-v', x => x + '%'); bind('mm-co2', 'mm-co2-v', x => (x / 100).toFixed(1) + '×'); bind('mm-sun', 'mm-sun-v', x => (x / 100).toFixed(2) + '×');
  // создать
  m.querySelector('#mm-create').addEventListener('click', () => {
    const w = clamp(+m.querySelector('#mm-w').value | 0, 24, 220), h = clamp(+m.querySelector('#mm-h').value | 0, 24, 220);
    bootNewMap({ w, h, type: m.querySelector('#mm-type').value, seaLevel: +m.querySelector('#mm-sea').value / 100, co2: +m.querySelector('#mm-co2').value / 100, solar: +m.querySelector('#mm-sun').value / 100 });
  });
  m.querySelector('#mm-play').addEventListener('click', hideMainMenu);
  // сохранения
  m.querySelector('#mm-save').addEventListener('click', () => { const n = saveWorldToStorage(m.querySelector('#mm-savename').value); if (n) { m.querySelector('#mm-savename').value = ''; _refreshSaveList(); flash('Сохранено: ' + n); } });
  m.querySelector('#mm-export').addEventListener('click', downloadWorldFile);
  m.querySelector('#mm-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const save = JSON.parse(r.result); const key = SAVE_PREFIX + '_imported'; localStorage.setItem(key, JSON.stringify(save)); bootLoadMap(key, save.w, save.h); } catch (err) { alert('Не удалось прочитать файл карты.'); } };
    r.readAsText(f);
  });
  return m;
}
function _refreshSaveList() {
  const box = _menuEl && _menuEl.querySelector('#mm-savelist'); if (!box) return;
  const saves = listSaves();
  box.innerHTML = saves.length ? '' : `<div class='mm-save'><i style='color:#7e8aa6'>нет сохранений</i></div>`;
  for (const name of saves) {
    const key = SAVE_PREFIX + name; let dim = ''; try { const s = JSON.parse(localStorage.getItem(key)); dim = s.w + '×' + s.h; } catch (e) {}
    const row = document.createElement('div'); row.className = 'mm-save';
    row.innerHTML = `<span class='nm'>${name}</span><span style='color:#8b97b2;font-size:11px'>${dim}</span><button class='ld'>Загрузить</button><button class='del'>✕</button>`;
    row.querySelector('.ld').addEventListener('click', () => { try { const s = JSON.parse(localStorage.getItem(key)); bootLoadMap(key, s.w, s.h); } catch (e) { alert('Сохранение повреждено.'); } });
    row.querySelector('.del').addEventListener('click', () => { if (confirm('Удалить «' + name + '»?')) { localStorage.removeItem(key); _refreshSaveList(); } });
    box.appendChild(row);
  }
}
function showMainMenu() { const m = _buildMenu(); _refreshSaveList(); m.classList.add('show'); if (typeof W !== 'undefined') W.paused = true, syncPlayGlyph(); }
function hideMainMenu() { if (_menuEl) _menuEl.classList.remove('show'); }
function syncPlayGlyph() { const g = document.getElementById('play-glyph'); if (g) g.textContent = W.paused ? '▶' : '❚❚'; const b = document.getElementById('btn-play'); if (b) b.classList.toggle('paused', W.paused); }
function flash(msg) { let f = document.getElementById('mm-flash'); if (!f) { f = document.createElement('div'); f.id = 'mm-flash'; f.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:500;background:#234;color:#dfe;padding:8px 16px;border-radius:9px;font-family:system-ui;font-size:13px;border:1px solid #3a5;transition:opacity .4s'; document.body.appendChild(f); } f.textContent = msg; f.style.opacity = '1'; clearTimeout(f._t); f._t = setTimeout(() => f.style.opacity = '0', 1800); }
// кнопка открытия меню в углу
function installMenuButton() { if (document.getElementById('mm-open')) return; const b = document.createElement('button'); b.id = 'mm-open'; b.textContent = '☰ Меню'; b.addEventListener('click', showMainMenu); document.body.appendChild(b); }
