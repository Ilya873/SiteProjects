// ui.js — интерфейс: инструменты, рисование, инспектор, HUD, слои, горячие клавиши.
'use strict';

const uiState = { tool: 'terrain', dir: 1, biome: 'temperateDeciduous', brush: 3, layer: 'biome', speed: 1, strength: 5, persistentSrc: true, showCities: false };
let _painting = false, _terrainTouched = false, _currentTouched = false, _windTouched = false, _hudFrame = 0;
let _hoverCell = -1, _lastCX = 0, _lastCY = 0, _dragDX = 0, _dragDY = 0;

// подписи кнопок направления по инструменту (интуитивно: что делает «+» и «−»)
const DIR_LABELS = {
  temp: ['🔥 Нагрев', '❄️ Охлаждение'],
  precip: ['💧 Увлажнить', '☀️ Осушить'],
  elevation: ['⛰️ Поднять', '🌊 Опустить'],
  water: ['🌊 Залить водой', '⛰️ Поднять сушу'],
  population: ['👥 Заселить', '➖ Убрать'],
};

// репрезентативные климат-точки биомов для кисти «рельеф»
const BIOME_PAINT = {
  deepOcean:        { water: true },
  tropRainforest:    { t: 26, p: 3000 },
  tropSeasonalForest:{ t: 25, p: 1400 },
  savanna:           { t: 24, p: 600 },
  mangrove:          { t: 25, p: 2000, low: true },
  temperateDeciduous:{ t: 12, p: 1000 },
  temperateRainforest:{ t: 10, p: 2600 },
  temperateGrassland:{ t: 12, p: 380 },
  marsh:             { t: 14, p: 1800, low: true },
  subtropicalDesert: { t: 29, p: 70 },
  coldDesert:        { t: 2,  p: 110 },
  borealForest:      { t: 2,  p: 600 },
  tundra:            { t: -8, p: 240 },
  iceSheet:          { t: -28, p: 90 },
  alpine:            { t: 1,  p: 800, mountain: true },
  barrenRock:        { t: 0,  p: 200, mountain: true },
};

function bindUI() {
  const canvas = document.getElementById('worldCanvas');
  const cursor = document.getElementById('brush-cursor');

  // --- инструменты ---
  document.querySelectorAll('#tools .tool').forEach(el => el.addEventListener('click', () => setTool(el.dataset.tool)));
  document.querySelectorAll('#tool-dir [data-dir]').forEach(el => el.addEventListener('click', () => {
    uiState.dir = parseInt(el.dataset.dir);
    document.querySelectorAll('#tool-dir [data-dir]').forEach(b => b.classList.toggle('on', b === el));
  }));
  const terrainSel = document.getElementById('terrainType');
  terrainSel.addEventListener('change', () => { uiState.biome = terrainSel.value; setTool('terrain'); });
  uiState.biome = terrainSel.value || 'temperateDeciduous';
  document.getElementById('brushSizeSlider').addEventListener('input', e => { uiState.brush = parseInt(e.target.value); updateBrushBadge(); });
  const ss = document.getElementById('strengthSlider');
  if (ss) ss.addEventListener('input', e => { uiState.strength = parseInt(e.target.value); const b = document.getElementById('strength-badge'); if (b) b.textContent = uiState.strength; });
  const gt = document.getElementById('globalTempSlider');
  if (gt) gt.addEventListener('input', e => { W.globalForce = parseFloat(e.target.value); const o = document.getElementById('global-temp-val'); if (o) o.textContent = `${W.globalForce > 0 ? '+' : ''}${W.globalForce}°`; });

  // --- переключатель постоянный/временный источник ---
  document.querySelectorAll('#persist-toggle [data-persist]').forEach(el => el.addEventListener('click', () => {
    uiState.persistentSrc = el.dataset.persist === '1';
    document.querySelectorAll('#persist-toggle [data-persist]').forEach(b => b.classList.toggle('on', b === el));
  }));

  // --- панель «Планета» (глобальные ползунки климата) ---
  const planet = document.getElementById('planet');
  if (planet) {
    document.getElementById('btn-planet').addEventListener('click', () => planet.classList.toggle('show'));
    planet.querySelector('.planet-close').addEventListener('click', () => planet.classList.remove('show'));
    bindSlider('solarSlider', v => { W.solar = v; }, 'solar-val', v => v.toFixed(2) + '×');
    bindSlider('tiltSlider', v => { W.tiltMul = v; }, 'tilt-val', v => v.toFixed(1) + '×');
    bindSlider('windSpeedSlider', v => { W.windMul = v; recomputeWinds(); }, 'windspd-val', v => v.toFixed(1) + '×');
    bindSlider('currentSpeedSlider', v => { W.currentMul = v; computeCurrents(); }, 'curspd-val', v => v.toFixed(1) + '×');
    bindSlider('co2Slider', v => { W.co2 = v; W.co2ppm = Math.round(280 * v); }, 'co2-val', v => Math.round(280 * v) + ' ppm');
    const sl = document.getElementById('seaLevelSlider');
    if (sl) {
      sl.addEventListener('input', e => { W.seaLevel = parseFloat(e.target.value); recomputeStatic(true); markDirty('base'); markDirty('borders'); const o = document.getElementById('sea-val'); if (o) o.textContent = Math.round(W.seaLevel * 100) + '%'; });
      sl.addEventListener('change', () => { recomputeStatic(); for (let k = 0; k < 3; k++) climateStep(); ecologyStep(); refreshCapacities(); markDirty('base'); markDirty('borders'); });
    }
  }

  // --- слои ---
  document.querySelectorAll('#layer-toggles .layer').forEach(el => el.addEventListener('click', () => setLayer(el.dataset.layer)));

  // --- мир ---
  document.getElementById('generateWorld').addEventListener('click', () => regen());
  document.getElementById('btn-regen').addEventListener('click', () => regen());
  document.getElementById('btn-reset').addEventListener('click', () => resetLife());
  document.getElementById('worldType').addEventListener('change', () => regen());

  // --- управление временем ---
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-step').addEventListener('click', stepOnce);
  document.querySelectorAll('#speed-control [data-speed]').forEach(el => el.addEventListener('click', () => {
    uiState.speed = parseFloat(el.dataset.speed);
    document.querySelectorAll('#speed-control [data-speed]').forEach(b => b.classList.toggle('on', b === el));
  }));
  const b3d = document.getElementById('btn-3d');
  if (b3d) b3d.addEventListener('click', () => {
    const on = !(window.mode3D);
    if (typeof set3DMode === 'function' && set3DMode(on)) { b3d.classList.toggle('on', on); b3d.textContent = on ? '2D' : '3D'; }
    else { b3d.textContent = '✕'; setTimeout(() => { b3d.textContent = '3D'; }, 1500); }   // Three.js не загрузился (нет интернета)
  });
  document.getElementById('btn-help').addEventListener('click', () => document.getElementById('coach').classList.toggle('show'));
  const coach = document.getElementById('coach'), hideChk = document.getElementById('coach-hide');
  const setHide = v => { try { localStorage.setItem('earthsim.hideHelp', v ? '1' : '0'); } catch (e) {} };
  if (hideChk) { hideChk.checked = coachHidden(); hideChk.addEventListener('change', () => setHide(hideChk.checked)); }
  coach.querySelector('.coach-close').addEventListener('click', () => { coach.classList.remove('show'); setHide(hideChk && hideChk.checked); });
  if (!coachHidden()) coach.classList.add('show');

  // --- указатель ---
  let _pan2 = null;
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.button === 1 || e.button === 2) { _pan2 = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); return; }   // средняя/правая — панорама
    _painting = true; canvas.setPointerCapture(e.pointerId);
    const c = cellAt(e.clientX, e.clientY, rect);
    if (currentOverlay === 'battles') { const bt = findNearestBattle(c.x, c.y, 2); if (bt) { _painting = false; openBattleModal(bt); return; } }   // клик по очагу битвы — подробности
    _lastCX = c.x; _lastCY = c.y; _dragDX = 0; _dragDY = 0;
    if (uiState.tool === 'inspect') { _painting = false; selectStateAt(c.i); const city = cityAtCell(c.i); if (city) openCityModal(city); else if (selectedState) openStateModal(selectedState); return; }   // осмотр: клик открывает подробное окно города/державы
    selectStateAt(c.i); applyTool(c.x, c.y); liveRecompute(); markDirty('base');
  });
  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    if (_pan2) { pan2d(e.clientX - _pan2.x, e.clientY - _pan2.y, rect); _pan2.x = e.clientX; _pan2.y = e.clientY; return; }
    const c = cellAt(e.clientX, e.clientY, rect);
    _hoverCell = c.i;
    moveCursor(e, rect); updateInspector(c.i); hoverState(c.i); showTip(c.i, e, rect);
    if (_painting) {
      _dragDX = c.x - _lastCX; _dragDY = c.y - _lastCY; _lastCX = c.x; _lastCY = c.y;
      applyTool(c.x, c.y); liveRecompute(); markDirty('base');
    }
  });
  const stop = () => { _pan2 = null; if (!_painting) return; _painting = false; finishPaint(); };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); const rect = canvas.getBoundingClientRect(); zoom2dAt(e.clientX, e.clientY, rect, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  canvas.addEventListener('pointerleave', () => { cursor.style.opacity = 0; _hoverCell = -1; hideTip(); });
  canvas.addEventListener('pointerenter', () => { cursor.style.opacity = 1; });

  // --- клавиатура ---
  document.addEventListener('keydown', onKey);

  setTool('terrain'); setLayer('biome'); updateBrushBadge();
  document.querySelector('#tool-dir [data-dir="1"]').classList.add('on');
  document.querySelector('#speed-control [data-speed="1"]').classList.add('on');
  setupCityModal();
  setupEventsPanel();
}

function coachHidden() { try { return localStorage.getItem('earthsim.hideHelp') === '1'; } catch (e) { return false; } }
function updateBrushBadge() { const b = document.getElementById('brush-badge'); if (b) b.textContent = uiState.brush; }

function setTool(name) {
  uiState.tool = name;
  document.querySelectorAll('#tools .tool').forEach(el => el.classList.toggle('active', el.dataset.tool === name));
  const dirTools = DIR_LABELS[name] !== undefined;
  document.getElementById('tool-dir').classList.toggle('hidden', !dirTools);
  document.getElementById('biome-pick').classList.toggle('hidden', name !== 'terrain');
  const strTools = name === 'temp' || name === 'precip' || name === 'elevation' || name === 'population' || name === 'current' || name === 'wind' || name === 'smooth';
  document.getElementById('strength-field').classList.toggle('hidden', !strTools);
  const pf = document.getElementById('persist-field'); if (pf) pf.classList.toggle('hidden', name !== 'temp');
  if (name === 'current') setLayer('currents');   // видно, что закручиваешь
  else if (name === 'wind') setLayer('wind');      // видно потоки воздуха
  else if (name === 'temp') setLayer('temperature');  // видно, что нагреваешь/охлаждаешь
  else if (name === 'precip') setLayer('humidity');   // видно, где меняешь влагу
  if (dirTools) {
    const [pos, neg] = DIR_LABELS[name];
    const bp = document.querySelector('#tool-dir [data-dir="1"]'), bn = document.querySelector('#tool-dir [data-dir="-1"]');
    if (bp) bp.textContent = pos; if (bn) bn.textContent = neg;
  }
  const hint = document.getElementById('stage-hint');
  const hints = {
    terrain: 'Рисуйте биом на суше — климат подстроится',
    temp: 'Грейте/охлаждайте сушу и океан. Тепло растекается; на воде рождает течения',
    precip: 'Увлажнение / осушение участка', elevation: 'Поднять горы / опустить впадины и моря',
    water: 'Залить водой / поднять сушу', population: 'Подселить / убрать людей',
    smooth: 'Сглаживание рельефа (мягкие горы и берега)',
    wind: 'Тяните в нужную сторону — задаёте направление ветра (он несёт дожди)',
    current: 'Тяните в нужную сторону — рисуете течение (греет/холодит берега)',
    city: 'Клик — основать город и державу',
    eraser: 'Стереть людей, заводы, ветер, течения и границы',
    inspect: 'Осмотр: кликайте по державам, городам, ячейкам — смотрите данные, ничего не меняя',
  };
  if (hint) hint.textContent = hints[name] || '';
}

function setLayer(name) {
  uiState.layer = name; setOverlay(name);
  document.querySelectorAll('#layer-toggles .layer').forEach(el => { if (el.dataset.layer) el.classList.toggle('active', el.dataset.layer === name); });   // не трогаем независимый тумблер «Города»
  const ramp = document.getElementById('legend-ramp'), mn = document.getElementById('legend-min'), mx = document.getElementById('legend-max'), lbl = document.getElementById('legend-label');
  const cfg = {
    biome:       { g: 'linear-gradient(90deg,#2f7a32,#b7c06a,#e0c489,#eef4fa)', a: 'Биомы', mn: '', mx: '' },
    temperature: { g: 'linear-gradient(90deg,#1432ff,#22dcdc,#ffd200,#ff2b2b)', a: 'Температура', mn: '−30°', mx: '+45°' },
    humidity:    { g: 'linear-gradient(90deg,#f5f5f5,#14b4d2,#1450c8)', a: 'Осадки', mn: '0', mx: '3000 мм' },
    currents:    { g: 'linear-gradient(90deg,#3c96eb,#46c7b8,#eb5b46)', a: 'Течения', mn: 'холод.', mx: 'тёплое' },
    wind:        { g: 'linear-gradient(90deg,#3a4a6a,#9fc0e8,#eaf2ff)', a: 'Ветер', mn: 'слабый', mx: 'сильный' },
    political:   { g: 'linear-gradient(90deg,#e94560,#f3a,#5af,#5fa)', a: 'Государства', mn: '', mx: '' },
    population:  { g: 'linear-gradient(90deg,#ffda50,#ff7a2b,#d21414)', a: 'Население', mn: '0', mx: 'плотно' },
    eco:         { g: 'linear-gradient(90deg,#a8463c,#b0a050,#3cb446)', a: 'Экология', mn: 'мертво', mx: 'цветёт' },
    pollution:   { g: 'linear-gradient(90deg,#5a7a5a,#8c7820,#5a1e50)', a: 'Загрязнение', mn: '0', mx: 'смог' },
    battles:     { g: 'linear-gradient(90deg,#ff8a3a,#ff1744,#b71c1c)', a: 'Битвы — клик по очагу', mn: '', mx: '' },
  }[name] || {};
  if (ramp) ramp.style.background = cfg.g; if (mn) mn.textContent = cfg.mn || ''; if (mx) mx.textContent = cfg.mx || '';
  if (lbl) lbl.textContent = cfg.a || '';
}

// ---- применение инструмента к области кисти ----
function applyTool(cx, cy) {
  if (uiState.tool === 'inspect') return;                 // режим осмотра — мир не меняем
  const r = uiState.brush, r2 = (r + 0.5) * (r + 0.5), tool = uiState.tool, dir = uiState.dir;
  const S = uiState.strength / 5;                 // сила кисти: 1..10 → 0.2x..2x
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inB(x, y)) continue;
      const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r2) continue;
      const i = idx(x, y);
      if (tool === 'terrain') paintBiome(i);
      else if (tool === 'temp') { const d = dir * 1.8 * S; if (uiState.persistentSrc) W.tempForce[i] = clamp(W.tempForce[i] + d, -60, 60); else W.tempPulse[i] = clamp(W.tempPulse[i] + d, -60, 60); W.temp[i] = clamp(W.temp[i] + d, -90, 90); if (W.isWater[i]) W.sst[i] = W.temp[i]; markCapDirty(i); }
      else if (tool === 'precip') { const f = dir > 0 ? 1 + 0.18 * S : 1 - 0.15 * S; W.precipMul[i] = clamp(W.precipMul[i] * f, 0.05, 12); W.precip[i] = clamp(W.precip[i] * f, 0, 6000); markCapDirty(i); }
      else if (tool === 'elevation') { W.elev[i] = clamp01(W.elev[i] + dir * 0.05 * S); _terrainTouched = true; }
      else if (tool === 'smooth') { let s = 0, n = 0; for (const o of NB8) { const nx = x + o[0], ny = y + o[1]; if (inB(nx, ny)) { s += W.elev[idx(nx, ny)]; n++; } } W.elev[i] = lerp(W.elev[i], s / n, clamp01(0.5 * S)); _terrainTouched = true; }
      else if (tool === 'water') { W.elev[i] = dir > 0 ? Math.min(W.elev[i], W.seaLevel - 0.07) : Math.max(W.elev[i], W.seaLevel + 0.05); _terrainTouched = true; }
      else if (tool === 'wind') { const m = Math.hypot(_dragDX, _dragDY); if (m > 0.001) { W.windAddU[i] = clamp(_dragDX / m * 0.2 * S, -2, 2); W.windAddV[i] = clamp(_dragDY / m * 0.2 * S, -2, 2); _windTouched = true; } }
      else if (tool === 'current') { if (W.isWater[i]) { const m = Math.hypot(_dragDX, _dragDY); if (m > 0.001) { const du = _dragDX / m * 0.5 * S, dv = _dragDY / m * 0.5 * S; W.curAddU[i] = clamp(W.curAddU[i] + du * 0.25, -2.5, 2.5); W.curAddV[i] = clamp(W.curAddV[i] + dv * 0.25, -2.5, 2.5); W.currentU[i] = clamp(W.currentU[i] + du * 0.25, -3, 3); W.currentV[i] = clamp(W.currentV[i] + dv * 0.25, -3, 3); _currentTouched = true; } } }
      else if (tool === 'population') { if (!W.isWater[i] && W.hab[i] > 0.02) W.pop[i] = Math.max(0, W.pop[i] + dir * 500 * S); }
      else if (tool === 'city') { if (!W.isWater[i] && W.hab[i] > 0.04 && i === idx(cx, cy)) foundCity(i); }
      else if (tool === 'eraser') { W.pop[i] = 0; W.urban[i] = 0; W.industry[i] = 0; W.pollution[i] = 0; W.tempForce[i] = 0; W.tempPulse[i] = 0; W.precipMul[i] = 1; if (W.windAddU[i] !== 0 || W.windAddV[i] !== 0) { W.windAddU[i] = 0; W.windAddV[i] = 0; _windTouched = true; } if (W.isWater[i] && (W.stir[i] !== 0 || W.curAddU[i] !== 0 || W.curAddV[i] !== 0)) { W.stir[i] = 0; W.curAddU[i] = 0; W.curAddV[i] = 0; W.currentU[i] = 0; W.currentV[i] = 0; _currentTouched = true; } if (W.stateId[i] >= 0 && states[W.stateId[i]]) { states[W.stateId[i]].cells.delete(i); } W.stateId[i] = -1; }
    }
  }
}

function paintBiome(i) {
  const bp = BIOME_PAINT[uiState.biome]; if (!bp) return;
  if (bp.water) { W.elev[i] = Math.min(W.elev[i], W.seaLevel - 0.08); _terrainTouched = true; return; }
  // суша
  if (W.isWater[i]) { W.elev[i] = W.seaLevel + (1 - W.seaLevel) * (bp.mountain ? 0.6 : bp.low ? 0.03 : 0.12); _terrainTouched = true; }
  else if (bp.mountain && landH(i) < 0.5) { W.elev[i] = W.seaLevel + (1 - W.seaLevel) * 0.6; _terrainTouched = true; }
  else if (bp.low && landH(i) > 0.08) { W.elev[i] = W.seaLevel + (1 - W.seaLevel) * 0.03; _terrainTouched = true; }
  // форсируем климат к целевой точке (стабильно держит биом)
  W.tempForce[i] = clamp(bp.t - W.temp[i] + W.tempForce[i], -60, 60);
  const unforcedP = W.precip[i] / (W.precipMul[i] || 1);
  W.precipMul[i] = clamp(bp.p / Math.max(unforcedP, 30), 0.05, 10);
  W.temp[i] = bp.t; W.precip[i] = bp.p;
  W.biome[i] = BID[uiState.biome]; W.veg[i] = computeNPP(bp.t, bp.p); markCapDirty(i);
}

function finishPaint() {
  if (_terrainTouched) { recomputeStatic(); climateStep(); ecologyStep(); _terrainTouched = false; _windTouched = false; }
  else if (_windTouched) { recomputeWinds(); computeUpwindMoisture(); computeCurrents(); _windTouched = false; }  // ветер влияет на дожди и течения
  else if (_currentTouched) { computeCurrents(); _currentTouched = false; }   // пересчёт функции тока
  markDirty('base'); markDirty('borders');
}

// ---- инспектор ----
function updateInspector(i) {
  const x = i % GRID.W, y = (i / GRID.W) | 0;
  setText('insp-xy', `${x}, ${y}`);
  const b = W.biome[i]; setText('insp-biome-name', BIOME[b].ru);
  const sw = document.getElementById('insp-biome-sw'); if (sw) { const c = BIOME_RENDER[b].lush; sw.style.background = `rgb(${c[0]},${c[1]},${c[2]})`; }
  setText('insp-temp', `${W.temp[i].toFixed(1)}°C`);
  setText('insp-hum', `${Math.round(W.precip[i])} мм`);
  const ef = document.getElementById('insp-elev-fill'); if (ef) ef.style.width = `${Math.round((W.isWater[i] ? 0 : landH(i)) * 100)}%`;
  setText('insp-elev-val', W.isWater[i] ? `−${Math.round(W.seaDepth[i])} м` : `${Math.round(landH(i) * 5000)} м`);
  setText('insp-pop', fmt(Math.round(W.pop[i])));
  setText('insp-fert', `${Math.round(W.fertility[i] * 100)}%`);
  setText('insp-eco', W.isWater[i] ? '—' : `${Math.round(W.eco[i] * 100)}%`);
  setText('insp-poll', W.isWater[i] ? '—' : `${Math.round(W.pollution[i] * 100)}%`);
  let settle = '—';
  if (!W.isWater[i] && W.pop[i] >= 1) {
    if (W.urban[i] > 2800 && W.pop[i] > 11000) settle = `🏙️ Город (${fmt(Math.round(W.pop[i]))})`;
    else if (W.urban[i] > 800 && W.pop[i] > 3500) settle = `🏘️ Городок (${fmt(Math.round(W.pop[i]))})`;
    else if (W.pop[i] > 400) settle = '🌾 Село';
    else settle = '· хутор';
  }
  setText('insp-settle', settle);
}

function hoverState(i) {
  const sid = W.stateId[i];
  // под курсором держава → показываем её; над пустой землёй НЕ сбрасываем (чтобы дойти до кнопки/панели)
  if (sid >= 0 && states[sid] && states[sid].alive) highlightedState = states[sid];
  renderStatePanel(highlightedState || selectedState);
}
function selectStateAt(i) {
  const sid = W.stateId[i];
  selectedState = (sid >= 0 && states[sid] && states[sid].alive) ? states[sid] : null;
  renderStatePanel(selectedState);
}
function renderStatePanel(st) {
  const panel = document.getElementById('inspector-state');
  if (!st) { panel.classList.remove('show'); return; }
  panel.classList.add('show');
  const sw = document.getElementById('insp-state-sw'); if (sw) sw.style.background = `rgb(${st.color[0]},${st.color[1]},${st.color[2]})`;
  setText('insp-state-name', `${CIV.ERA_RU[st.era]} держава`);
  // технологии: значение + прогресс исследований до следующей эпохи (видно, как изучается)
  const E = CIV.ERA_TECH, curT = st.era > 0 ? E[st.era - 1] : 0, nxtT = st.era < 5 ? E[st.era] : CIV.TECH_CAP;
  const techPct = Math.round(clamp01((st.tech - curT) / (nxtT - curT || 1)) * 100);
  setText('insp-state-tech', st.era < 5 ? `${st.tech.toFixed(1)} · ${techPct}% → ${CIV.ERA_RU[st.era + 1]}` : `${st.tech.toFixed(1)} · макс.`);
  setText('insp-state-pop', fmt(Math.round(st.pop)));
  setText('insp-state-cells', st.area);
  setText('insp-state-cities', `${st.cityCount || 0}${st.largestCity ? ' (макс. ' + fmt(Math.round(st.largestCity)) + ')' : ''}`);
  setText('insp-state-urban', `${Math.round((st.urbanPct || 0) * 100)}%`);
  setText('insp-state-econ', fmt(Math.round(st.economy || 0)));
  setText('insp-state-ind', (st.industry || 0).toFixed(1));
  setText('insp-state-poll', `${Math.round((st.pollution || 0) * 100)}%`);
  setText('insp-state-stab', `${Math.round(st.stability * 100)}%`);
  let dWars = 0, dFriends = 0; if (st.relations) st.relations.forEach(v => { if (v < CIV.WAR_THRESH) dWars++; else if (v > 0.3) dFriends++; });
  setText('insp-state-wars', `⚔ ${dWars} · 🤝 ${dFriends}`);
}

// ---- HUD ----
function updateHud() {
  let tSum = 0, tN = 0, pop = 0, water = 0, ecoSum = 0;
  for (let i = 0; i < GRID.N; i++) {
    if (W.isWater[i]) water++; else { tSum += W.temp[i]; ecoSum += W.eco[i]; tN++; }
    pop += W.pop[i];
  }
  let maxEra = 0, alive = 0;
  for (const s of states) if (s.alive && s.cells.size > 0) { alive++; if (s.era > maxEra) maxEra = s.era; }
  W.ecoGlobal = tN ? ecoSum / tN : 1;
  setText('stat-temp', `${(tN ? tSum / tN : 0).toFixed(1)}°C`);
  setText('stat-pop', fmt(Math.round(pop)));
  setText('stat-sea', `${Math.round(water / GRID.N * 100)}%`);
  setText('stat-states', alive);
  setText('stat-co2', `${W.co2ppm}`);
  setText('stat-eco', `${Math.round(W.ecoGlobal * 100)}%`);
  setText('hud-era', CIV.ERA_RU[maxEra]);
  setText('hud-year', `${Math.floor(W.simYear)} г.`);
  if (_eventsOpen && typeof _eventsChanged !== 'undefined' && _eventsChanged) renderEventsPanel();   // обновляем ленту хроники при новых событиях
}

// ---- ХРОНИКА человечества: лента событий ----
const _EVENT_ICON = { dawn: '🌅', found: '🏛️', collapse: '💀', era: '📈', war: '⚔️', alliance: '🤝', secede: '🚩', colony: '⛵' };
let _eventsOpen = false;
function setupEventsPanel() {
  if (document.getElementById('events-panel')) return;
  const css = document.createElement('style'); css.id = 'ev-style'; css.textContent = `
  #events-toggle{position:fixed;top:8px;right:8px;z-index:120;padding:6px 11px;border-radius:8px;border:1px solid #2a3550;background:rgba(12,18,30,.85);color:#dde6f7;cursor:pointer;font:700 13px "Segoe UI",system-ui}
  #events-toggle:hover{background:rgba(40,60,110,.9)}
  #events-panel{position:fixed;top:44px;right:8px;width:300px;max-height:70vh;z-index:119;display:none;flex-direction:column;background:linear-gradient(rgba(16,22,36,.97),rgba(10,14,24,.98));border:1px solid #2a3550;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.5);font-family:"Segoe UI",system-ui;color:#e8ecf6;overflow:hidden}
  #events-panel.show{display:flex}
  .ev-head{padding:9px 12px;font-weight:700;font-size:13px;border-bottom:1px solid #243049;display:flex;justify-content:space-between;align-items:center}
  .ev-head button{all:unset;cursor:pointer;color:#9fb0c8;font-size:14px;padding:0 4px}
  .ev-list{overflow:auto;padding:2px 0}
  .ev-row{display:flex;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px;align-items:baseline}
  .ev-row .ic{font-size:14px;flex:none}.ev-row .yr{color:#7e8aa6;font-size:11px;flex:none;width:46px}.ev-row .tx{flex:1;line-height:1.3}
  .ev-row.war .tx{color:#ff9a8a}.ev-row.alliance .tx{color:#9ce0a0}.ev-row.found .tx{color:#bcd0ff}.ev-row.collapse .tx{color:#caa9bd}.ev-row.era .tx{color:#ffd98a}.ev-row.colony .tx{color:#9fd6e0}.ev-row.secede .tx{color:#e0c69f}
  .ev-empty{padding:14px;color:#7e8aa6;font-size:12px;text-align:center}`;
  document.head.appendChild(css);
  const btn = document.createElement('button'); btn.id = 'events-toggle'; btn.textContent = '📜 Хроника';
  btn.addEventListener('click', toggleEventsPanel); document.body.appendChild(btn);
  const p = document.createElement('div'); p.id = 'events-panel';
  p.innerHTML = `<div class='ev-head'><span>📜 Хроника человечества</span><button title='Закрыть'>✕</button></div><div class='ev-list' id='ev-list'></div>`;
  p.querySelector('.ev-head button').addEventListener('click', toggleEventsPanel);
  document.body.appendChild(p);
}
function toggleEventsPanel() { _eventsOpen = !_eventsOpen; const p = document.getElementById('events-panel'); if (p) p.classList.toggle('show', _eventsOpen); if (_eventsOpen) renderEventsPanel(); }
function _evEsc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function renderEventsPanel() {
  const box = document.getElementById('ev-list'); if (!box) return;
  if (typeof worldEvents === 'undefined' || !worldEvents.length) { box.innerHTML = `<div class='ev-empty'>Пока ничего не произошло…</div>`; return; }
  let html = '';
  for (let k = 0; k < worldEvents.length && k < 140; k++) { const e = worldEvents[k];
    html += `<div class='ev-row ${e.type}'><span class='ic'>${_EVENT_ICON[e.type] || '•'}</span><span class='yr'>${e.year} г.</span><span class='tx'>${_evEsc(e.text)}</span></div>`; }
  box.innerHTML = html; _eventsChanged = false;
}

// ---- управление временем / миром ----
function togglePlay() { W.paused = !W.paused; setText('play-glyph', W.paused ? '▶' : '❚❚'); document.getElementById('btn-play').classList.toggle('paused', W.paused); }
function stepOnce() { climateStep(); ecologyStep(); civTick(); markDirty('base'); markDirty('borders'); }
function regen() { worldgen(document.getElementById('worldType').value); markDirty('base'); markDirty('borders'); }
function resetLife() {
  for (let i = 0; i < GRID.N; i++) { W.pop[i] = 0; W.foodStock[i] = 0; W.stateId[i] = -1; W.unrest[i] = 0; W.disease[i] = 0; W.devLevel[i] = 0; }
  states.length = 0; ships.length = 0; selectedState = null; highlightedState = null;
  markDirty('borders');
}

function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = e.key.toLowerCase();
  const tools = { '1': 'terrain', '2': 'elevation', '3': 'smooth', '4': 'water', '5': 'temp', '6': 'precip', '7': 'current', '8': 'wind', '9': 'population', '0': 'eraser' };
  if (tools[k]) { setTool(tools[k]); e.preventDefault(); return; }
  if (k === ' ') { togglePlay(); e.preventDefault(); }
  else if (k === 's') stepOnce();
  else if (k === '[') { uiState.brush = Math.max(0, uiState.brush - 1); syncBrush(); }
  else if (k === ']') { uiState.brush = Math.min(20, uiState.brush + 1); syncBrush(); }
  else if (k === 'b') setLayer('biome');
  else if (k === 't') setLayer('temperature');
  else if (k === 'h') setLayer('humidity');
  else if (k === 'c') setLayer('currents');
  else if (k === 'w') setLayer('wind');
  else if (k === 'g') setLayer('political');
  else if (k === 'p') setLayer('population');
  else if (k === 'e') setLayer('eco');
  else if (k === 'z') setLayer('pollution');
  else if (k === 'r') regen();
  else if (k === 'escape') { selectedState = null; highlightedState = null; renderStatePanel(null); }
  else if (k === '?') document.getElementById('coach').classList.toggle('show');
}
function syncBrush() { document.getElementById('brushSizeSlider').value = uiState.brush; updateBrushBadge(); }

// ---- курсор кисти ----
function moveCursor(e, rect) {
  const cur = document.getElementById('brush-cursor');
  const cellDisp = rect.width / GRID.W;
  const d = (uiState.brush * 2 + 1) * cellDisp * (typeof view2d !== 'undefined' ? view2d.zoom : 1);
  cur.style.width = cur.style.height = `${d}px`;
  cur.style.left = `${e.clientX - rect.left}px`;
  cur.style.top = `${e.clientY - rect.top}px`;
  cur.style.opacity = 1;
}

// ---- живое обновление / подсказка у курсора ----
function liveRecompute() {
  if (_terrainTouched) recomputeStatic(true);   // рельеф/берег/вода обновляются сразу под ЛКМ
  if (_windTouched) recomputeWinds();            // ветер обновляется сразу
}
// вызывается каждый кадр из main: инфо под курсором обновляется автоматически по ходу симуляции
function refreshHover() { if (_hoverCell >= 0 && !_painting) { updateInspector(_hoverCell); updateTipData(_hoverCell); } }
function settleLabel(i) {
  if (W.isWater[i] || W.pop[i] < 1) return '';
  if (W.urban[i] > 2800 && W.pop[i] > 11000) return '🏙️ Город';
  if (W.urban[i] > 800 && W.pop[i] > 3500) return '🏘️ Городок';
  if (W.pop[i] > 400) return '🌾 Село';
  return '· хутор';
}
function showTip(i, e, rect) {
  const tip = document.getElementById('cursor-tip'); if (!tip) return;
  tip.style.left = `${e.clientX - rect.left}px`; tip.style.top = `${e.clientY - rect.top}px`;
  tip.style.opacity = 1; updateTipData(i);
}
function updateTipData(i) {
  const tip = document.getElementById('cursor-tip'); if (!tip) return;
  let s = `<b>${BIOME[W.biome[i]].ru}</b> · ${W.temp[i].toFixed(0)}°C`;
  if (!W.isWater[i]) s += ` · ${Math.round(W.precip[i])}мм`;
  const lbl = settleLabel(i); if (lbl) s += `<br>${lbl} · 👥${fmt(Math.round(W.pop[i]))}`;
  const sid = W.stateId[i]; if (sid >= 0 && states[sid] && states[sid].alive) { const st = states[sid]; s += ` · <span style="color:rgb(${st.color[0]},${st.color[1]},${st.color[2]})">●</span>${CIV.ERA_RU[st.era]}`; }
  tip.innerHTML = s;
}
function hideTip() { const tip = document.getElementById('cursor-tip'); if (tip) tip.style.opacity = 0; }
function bindSlider(id, fn, valId, fmtFn) {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('input', e => { const v = parseFloat(e.target.value); fn(v); const o = document.getElementById(valId); if (o && fmtFn) o.textContent = fmtFn(v); });
}
function foundCity(i) {
  W.pop[i] = Math.max(W.pop[i], 14000); W.urban[i] = Math.max(W.urban[i], 9000); W.devLevel[i] = 200; W.hab[i] = Math.max(W.hab[i], 0.3);
  if (W.stateId[i] < 0 && typeof foundStateAt === 'function') foundStateAt(i);
  if (typeof rebuildCities === 'function') rebuildCities();
  markDirty('borders');
}

// ---- утилиты ----
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(1) + ' млрд'; if (n >= 1e6) return (n / 1e6).toFixed(1) + ' млн'; if (n >= 1e3) return (n / 1e3).toFixed(1) + ' тыс'; return '' + n; }

// ===== Слой «Города» + подробная карточка державы =====
function flagDataURI(st) {
  const c = st.color, hx = a => ('0' + (a | 0).toString(16)).slice(-2), rgb = a => `#${hx(a[0])}${hx(a[1])}${hx(a[2])}`;
  const main = rgb(c), dark = rgb([c[0] * 0.5, c[1] * 0.5, c[2] * 0.5]), light = rgb([clamp(c[0] + 95, 0, 255), clamp(c[1] + 95, 0, 255), clamp(c[2] + 95, 0, 255)]);
  const pat = (st.id * 7) % 4; let inner = '';
  if (pat === 0) inner = `<rect width='60' height='13.3' fill='${dark}'/><rect width='60' height='13.3' y='26.6' fill='${light}'/>`;
  else if (pat === 1) inner = `<rect width='20' height='40' fill='${dark}'/><rect width='20' height='40' x='40' fill='${light}'/>`;
  else if (pat === 2) inner = `<circle cx='30' cy='20' r='11' fill='${light}'/>`;
  else inner = `<polygon points='30,6 35,18 48,18 37,26 41,38 30,30 19,38 23,26 12,18 25,18' fill='${light}'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='40'><rect width='60' height='40' fill='${main}'/>${inner}<rect width='60' height='40' fill='none' stroke='#000' stroke-opacity='.35' stroke-width='2'/></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);   // base64 — надёжнее utf8 (флаг точно отрисуется в <img>)
}
let _modalLayer = 'political';
function openStateModal(st) {
  if (!st || !st.alive) return;
  let m = document.getElementById('state-modal');
  if (!m) { m = document.createElement('div'); m.id = 'state-modal'; document.body.appendChild(m); m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.remove('show'); }); }
  m.classList.add('show');
  const gov = governmentOf(st);
  const cs = cities.filter(c => c.stateId === st.id).sort((a, b) => b.pop - a.pop);
  const rels = []; st.relations.forEach((v, id) => { const o = states[id]; if (o && o.alive) rels.push({ name: o.name, v, color: o.color }); }); rels.sort((a, b) => b.v - a.v);
  const relWord = v => v > 0.5 ? 'союз' : v < CIV.WAR_THRESH ? 'война' : v > 0.2 ? 'дружба' : v < -0.15 ? 'вражда' : 'нейтр.';
  const relCol = v => v > 0.3 ? '#7c7' : v < CIV.WAR_THRESH ? '#e66' : '#cc8';
  m.innerHTML = `<div class='sm-card'>
    <div class='sm-head'><img class='sm-flag' src='${flagDataURI(st)}'><div class='sm-title'><div class='sm-name'>${st.name}</div><div class='sm-gov'>${gov} · эпоха: ${CIV.ERA_RU[st.era]}</div></div><button class='sm-close'>✕</button></div>
    <div class='sm-grid'>
      <div class='sm-stat'><b>${fmt(Math.round(st.pop))}</b><span>население</span></div><div class='sm-stat'><b>${st.area}</b><span>территория</span></div>
      <div class='sm-stat'><b>${st.cityCount || 0}</b><span>городов</span></div><div class='sm-stat'><b>${st.tech.toFixed(1)}</b><span>технологии</span></div>
      <div class='sm-stat'><b>${fmt(Math.round(st.economy || 0))}</b><span>экономика</span></div><div class='sm-stat'><b>${Math.round(st.stability * 100)}%</b><span>стабильность</span></div>
      <div class='sm-stat'><b>${fmt(Math.round(st.military))}</b><span>армия</span></div><div class='sm-stat'><b>${Math.round((st.urbanPct || 0) * 100)}%</b><span>урбанизация</span></div>
    </div>
    <div class='sm-cols'>
      <div class='sm-col'><h4>📈 Население / технологии</h4><canvas class='sm-chart' width='300' height='96'></canvas>
        <h4>🗺 Карта державы</h4><div class='sm-ml'>${['political', 'population', 'temperature', 'humidity', 'world'].map(l => `<button data-ml='${l}' class='${l === _modalLayer ? 'on' : ''}'>${({ political: 'Держава', population: 'Население', temperature: 'Темп.', humidity: 'Осадки', world: 'Мир' })[l]}</button>`).join('')}</div>
        <canvas class='sm-map' width='300' height='220'></canvas></div>
      <div class='sm-col'><h4>🤝 Дипломатия</h4><div class='sm-list'>${rels.length ? rels.map(r => `<div class='sm-rel'><span class='dot' style='background:rgb(${r.color[0]},${r.color[1]},${r.color[2]})'></span><span class='nm'>${r.name}</span><b style='color:${relCol(r.v)}'>${relWord(r.v)}</b></div>`).join('') : '<i>нет соседей</i>'}</div>
        <h4>🏙 Города (${cs.length})</h4><div class='sm-list'>${cs.length ? cs.slice(0, 20).map(c => `<div class='sm-rel sm-city' data-cell='${c.i}'>${c.capital ? '★ ' : ''}<span class='nm'>${c.name}</span><b>${fmt(Math.round(c.pop))}</b></div>`).join('') : '<i>нет городов</i>'}</div></div>
    </div></div>`;
  m.querySelector('.sm-close').addEventListener('click', () => m.classList.remove('show'));
  drawStateChart(m.querySelector('.sm-chart'), st);
  const mapC = m.querySelector('.sm-map'); drawStateMiniMap(mapC, st, _modalLayer);
  m.querySelectorAll('.sm-ml button').forEach(b => b.addEventListener('click', () => { _modalLayer = b.dataset.ml; m.querySelectorAll('.sm-ml button').forEach(x => x.classList.toggle('on', x === b)); drawStateMiniMap(mapC, st, _modalLayer); }));
  m.querySelectorAll('.sm-city').forEach(el => el.addEventListener('click', () => { const cc = cities.find(c => c.i === +el.dataset.cell); if (cc) openCityModal(cc); }));
}
// город в клетке (точное совпадение или ближайший в радиусе ~1 клетки) — для клика в режиме осмотра
function cityAtCell(i) {
  if (typeof cities === 'undefined' || !cities.length) return null;
  const x = i % GRID.W, y = (i / GRID.W) | 0; let near = null, nd = 3;
  for (const c of cities) { if (c.i === i) return c; const dx = c.x - x, dy = c.y - y, d = dx * dx + dy * dy; if (d <= 2 && d < nd) { nd = d; near = c; } }
  return near;
}
// ---- окно ПОДРОБНО О ГОРОДЕ ----
function openCityModal(c) {
  if (!c) return;
  const i = c.i, st = states[c.stateId];
  let m = document.getElementById('city-modal');
  if (!m) { m = document.createElement('div'); m.id = 'city-modal'; document.body.appendChild(m); m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.remove('show'); }); }
  m.classList.add('show');
  const biome = (typeof BIOME !== 'undefined' && BIOME[W.biome[i]]) ? BIOME[W.biome[i]].ru : '—';
  const urb = Math.round(W.urban[i] || 0), pop = Math.round(W.pop[i] || 0);
  const tier = urb >= CIV.CITY_URBAN_MIN ? 'Город' : urb >= 700 ? 'Городок' : 'Посёлок';
  const col = c.color || [200, 200, 200];
  m.innerHTML = `<div class='sm-card' style='width:min(440px,94vw)'>
    <div class='sm-head'><div style='width:42px;height:42px;border-radius:8px;background:rgb(${col[0]},${col[1]},${col[2]});display:flex;align-items:center;justify-content:center;font-size:22px'>${c.capital ? '★' : '🏙'}</div>
      <div class='sm-title'><div class='sm-name'>${c.capital ? '★ ' : ''}${c.name}</div><div class='sm-gov'>${tier}${c.capital ? ' · столица' : ''} · ${st ? st.name : 'вольный город'}${st ? ' · ' + CIV.ERA_RU[st.era] : ''}</div></div><button class='sm-close'>✕</button></div>
    <div class='sm-grid'>
      <div class='sm-stat'><b>${fmt(pop)}</b><span>население</span></div>
      <div class='sm-stat'><b>${fmt(urb)}</b><span>горожан</span></div>
      <div class='sm-stat'><b>${(W.industry[i] || 0).toFixed(1)}</b><span>промышл.</span></div>
      <div class='sm-stat'><b>${Math.round((W.pollution[i] || 0) * 100)}%</b><span>загрязн.</span></div>
      <div class='sm-stat'><b>${Math.round((W.eco[i] || 0) * 100)}%</b><span>экология</span></div>
      <div class='sm-stat'><b>${Math.round((W.fertility[i] || 0) * 100)}%</b><span>плодородие</span></div>
      <div class='sm-stat'><b>${W.temp[i].toFixed(1)}°</b><span>температура</span></div>
      <div class='sm-stat'><b>${Math.round(W.precip[i])}</b><span>осадки, мм</span></div>
    </div>
    <div class='sm-cols' style='grid-template-columns:1fr'>
      <div class='sm-col'><h4>🌿 Биом: ${biome}</h4>
        <canvas class='sm-map cm-loc' width='400' height='150'></canvas>
        ${st ? `<button class='cm-go' style='margin-top:8px;width:100%;padding:7px;border-radius:8px;border:1px solid var(--stroke,#2a3550);background:rgba(90,120,220,0.18);color:#cdd8f5;cursor:pointer;font-size:12px;font-weight:600'>🏛 Подробно о державе</button>` : ''}
      </div>
    </div></div>`;
  m.querySelector('.sm-close').addEventListener('click', () => m.classList.remove('show'));
  const go = m.querySelector('.cm-go'); if (go && st) go.addEventListener('click', () => { m.classList.remove('show'); openStateModal(st); });
  drawCityLocator(m.querySelector('.cm-loc'), c);
}
function drawCityLocator(cv, c) {
  const x = cv.getContext('2d'), Wd = cv.width, H = cv.height; x.clearRect(0, 0, Wd, H);
  const R = 9, minX = Math.max(0, c.x - R), maxX = Math.min(GRID.W - 1, c.x + R), minY = Math.max(0, c.y - R), maxY = Math.min(GRID.H - 1, c.y + R);
  const cw = maxX - minX + 1, ch = maxY - minY + 1, sc = Math.min(Wd / cw, H / ch), ox = (Wd - cw * sc) / 2, oy = (H - ch * sc) / 2;
  x.fillStyle = '#0b1426'; x.fillRect(0, 0, Wd, H);
  for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
    const i = idx(gx, gy); let col;
    if (W.isWater[i]) col = [18, 46, 74];
    else { const bd = BIOME_RENDER[W.biome[i]], v = W.veg[i]; col = [lerp(bd.base[0], bd.lush[0], v), lerp(bd.base[1], bd.lush[1], v), lerp(bd.base[2], bd.lush[2], v)]; }
    x.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; x.fillRect(ox + (gx - minX) * sc, oy + (gy - minY) * sc, sc + 0.7, sc + 0.7);
  }
  const cxp = ox + (c.x - minX + 0.5) * sc, cyp = oy + (c.y - minY + 0.5) * sc;
  x.beginPath(); x.arc(cxp, cyp, Math.max(4, sc * 0.5), 0, 7); x.fillStyle = c.capital ? '#ffd54a' : '#fff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#10131e'; x.stroke();
}
function drawStateChart(cv, st) {
  const x = cv.getContext('2d'), W2 = cv.width, H = cv.height; x.clearRect(0, 0, W2, H);
  const h = st.history || []; if (h.length < 2) { x.fillStyle = '#889'; x.font = '11px sans-serif'; x.fillText('накопление данных…', 8, H / 2); return; }
  const pmax = Math.max.apply(null, h.map(d => d[0])) || 1, tmax = Math.max.apply(null, h.map(d => d[1])) || 1;
  x.beginPath(); x.moveTo(0, H); h.forEach((d, i) => x.lineTo(i / (h.length - 1) * W2, H - d[0] / pmax * (H - 14) - 2)); x.lineTo(W2, H); x.closePath(); x.fillStyle = 'rgba(255,170,60,0.22)'; x.fill();
  x.beginPath(); h.forEach((d, i) => { const px = i / (h.length - 1) * W2, py = H - d[0] / pmax * (H - 14) - 2; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = '#ffb13c'; x.lineWidth = 1.6; x.stroke();
  x.beginPath(); h.forEach((d, i) => { const px = i / (h.length - 1) * W2, py = H - d[1] / tmax * (H - 14) - 2; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = '#5ac8ff'; x.lineWidth = 1.6; x.stroke();
  x.font = '10px sans-serif'; x.fillStyle = '#ffb13c'; x.fillText('население', 4, 11); x.fillStyle = '#5ac8ff'; x.fillText('технологии', 74, 11);
}
function drawStateMiniMap(cv, st, layer) {
  const x = cv.getContext('2d'), Wd = cv.width, H = cv.height; x.clearRect(0, 0, Wd, H);
  const worldView = (layer === 'world');
  // bbox территории державы (для обзорного «Мир» — весь мир)
  let minX = 0, minY = 0, maxX = GRID.W - 1, maxY = GRID.H - 1;
  if (!worldView) {
    minX = GRID.W; minY = GRID.H; maxX = -1; maxY = -1;
    st.cells.forEach(i => { const gx = i % GRID.W, gy = (i / GRID.W) | 0; if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy; });
    if (maxX < 0) { minX = 0; minY = 0; maxX = GRID.W - 1; maxY = GRID.H - 1; }
    const pad = 2; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(GRID.W - 1, maxX + pad); maxY = Math.min(GRID.H - 1, maxY + pad);
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1, sc = Math.min(Wd / cw, H / ch), ox = (Wd - cw * sc) / 2, oy = (H - ch * sc) / 2;
  x.fillStyle = '#0b1426'; x.fillRect(0, 0, Wd, H);
  const dlayer = worldView ? 'political' : layer;
  for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
    const i = idx(gx, gy); let col;
    if (W.isWater[i]) col = [18, 46, 74];
    else if (dlayer === 'temperature') col = rampTemp(W.temp[i]);
    else if (dlayer === 'humidity') col = rampPrecip(W.precip[i]);
    else if (dlayer === 'population') { const v = W.pop[i]; if (v > 30) { const t = clamp01(Math.log(v) / Math.log(120000)); col = [lerp(255, 210, t), lerp(220, 30, t), lerp(80, 20, t)]; } else col = [38, 52, 38]; }
    else { const sid = W.stateId[i]; if (sid === st.id) col = st.color; else if (sid >= 0 && states[sid] && states[sid].alive) { const o = states[sid].color; col = [o[0] * 0.5, o[1] * 0.5, o[2] * 0.5]; } else col = [40, 50, 42]; }
    if (!worldView && dlayer !== 'political' && !W.isWater[i] && W.stateId[i] !== st.id) { col = [col[0] * 0.45 + 8, col[1] * 0.45 + 10, col[2] * 0.45 + 8]; }   // чужая земля приглушена — выделяем свою
    x.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; x.fillRect(ox + (gx - minX) * sc, oy + (gy - minY) * sc, sc + 0.7, sc + 0.7);
  }
  // контур державы
  x.strokeStyle = '#fff'; x.globalAlpha = 0.6; x.lineWidth = 1;
  st.cells.forEach(i => { const gx = i % GRID.W, gy = (i / GRID.W) | 0; if (gx < minX || gx > maxX || gy < minY || gy > maxY) return; for (const [dx, dy] of NB4) { const nx = gx + dx, ny = gy + dy; if (!inB(nx, ny) || W.stateId[idx(nx, ny)] !== st.id) { const X0 = ox + (gx - minX) * sc, Y0 = oy + (gy - minY) * sc; x.beginPath(); if (dx === 1) { x.moveTo(X0 + sc, Y0); x.lineTo(X0 + sc, Y0 + sc); } else if (dx === -1) { x.moveTo(X0, Y0); x.lineTo(X0, Y0 + sc); } else if (dy === 1) { x.moveTo(X0, Y0 + sc); x.lineTo(X0 + sc, Y0 + sc); } else { x.moveTo(X0, Y0); x.lineTo(X0 + sc, Y0); } x.stroke(); } } });
  x.globalAlpha = 1;
  // ГОРОДА державы: белые точки + столица золотой звездой
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const c of cities) { if (c.stateId !== st.id || c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue; const cxp = ox + (c.x - minX + 0.5) * sc, cyp = oy + (c.y - minY + 0.5) * sc;
    if (c.capital) { x.fillStyle = '#ffd54a'; x.font = `${Math.max(11, sc * 1.2) | 0}px sans-serif`; x.fillText('★', cxp, cyp); }
    else { x.beginPath(); x.arc(cxp, cyp, Math.max(1.8, sc * 0.26), 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 0.8; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.stroke(); }
  }
}
function setupCityModal() {
  if (document.getElementById('sm-style')) return;
  const css = document.createElement('style'); css.id = 'sm-style';
  css.textContent = `
  #state-modal{position:fixed;inset:0;background:rgba(4,7,14,0.66);display:none;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(2px)}
  #state-modal.show{display:flex}
  #city-modal{position:fixed;inset:0;background:rgba(4,7,14,0.66);display:none;align-items:center;justify-content:center;z-index:202;backdrop-filter:blur(2px)}
  #city-modal.show{display:flex}
  .sm-city{cursor:pointer}.sm-city:hover{background:rgba(255,255,255,0.07)}
  .sm-card{width:min(720px,94vw);max-height:90vh;overflow:auto;background:linear-gradient(rgba(16,19,30,0.97),rgba(12,15,24,0.98));border:1px solid var(--stroke,#2a2f44);border-radius:14px;padding:16px 18px;color:#e8ecf6;box-shadow:0 20px 60px rgba(0,0,0,0.6)}
  .sm-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .sm-flag{width:54px;height:36px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.5)}
  .sm-title{flex:1}.sm-name{font-size:20px;font-weight:700}.sm-gov{font-size:12px;color:#9aa6c0}
  .sm-close{background:none;border:1px solid var(--stroke,#333);color:#ccc;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px}
  .sm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .sm-stat{background:rgba(255,255,255,0.04);border-radius:8px;padding:8px;text-align:center}
  .sm-stat b{display:block;font-size:16px;color:#fff}.sm-stat span{font-size:10px;color:#8b97b2}
  .sm-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:560px){.sm-cols{grid-template-columns:1fr}.sm-grid{grid-template-columns:repeat(2,1fr)}}
  .sm-col h4{margin:6px 0 6px;font-size:13px;color:#c7d0e6}
  .sm-chart,.sm-map{width:100%;border-radius:8px;background:#0b1426;border:1px solid var(--stroke,#26304a)}
  .sm-ml{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
  .sm-ml button{font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid var(--stroke,#2a3550);background:rgba(255,255,255,0.04);color:#aeb8d0;cursor:pointer}
  .sm-ml button.on{background:#3a5bd0;color:#fff;border-color:#3a5bd0}
  .sm-list{max-height:160px;overflow:auto;font-size:12px}
  .sm-rel{display:flex;align-items:center;gap:6px;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.05)}
  .sm-rel .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-rel .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .layer.lcities.active{outline:2px solid #ffd86b}
  #btn-state-detail{margin-top:8px;width:100%;padding:7px;border-radius:8px;border:1px solid var(--stroke,#2a3550);background:rgba(90,120,220,0.18);color:#cdd8f5;cursor:pointer;font-size:12px;font-weight:600}
  #battle-modal{position:fixed;inset:0;background:rgba(4,7,14,0.66);display:none;align-items:center;justify-content:center;z-index:201;backdrop-filter:blur(2px)}
  #battle-modal.show{display:flex}
  .bm-card{width:min(560px,94vw);max-height:86vh;overflow:auto;background:linear-gradient(rgba(20,14,16,0.97),rgba(14,11,16,0.98));border:1px solid #5a2a2a;border-radius:14px;padding:16px 18px;color:#e8ecf6;box-shadow:0 20px 60px rgba(0,0,0,0.6)}
  .bm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.bm-h{font-size:17px;font-weight:700;color:#ff8a5a}
  .bm-close{background:none;border:1px solid #444;color:#ccc;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px}
  .bm-title{font-size:15px;font-weight:700;text-align:center;margin-bottom:10px}
  .bm-sides{display:flex;align-items:center;justify-content:space-around;gap:10px;margin-bottom:12px}
  .bm-side{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1}.bm-side b{font-size:13px}.bm-side span{font-size:10px;color:#9aa6c0}
  .bm-flag{width:52px;height:34px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:1px solid rgba(0,0,0,0.4)}
  .bm-vs{font-size:13px;color:#ff6b6b;font-weight:700}
  .bm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}
  .bm-stat{background:rgba(255,255,255,0.04);border-radius:8px;padding:8px;text-align:center}.bm-stat b{display:block;font-size:14px;color:#fff}.bm-stat span{font-size:10px;color:#8b97b2}
  .bm-list h4{margin:6px 0;font-size:12px;color:#c7d0e6}
  .bm-war{display:flex;align-items:center;gap:6px;padding:4px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;font-size:12px}.bm-war:hover{background:rgba(255,255,255,0.05)}
  .bm-war .dot{width:9px;height:9px;border-radius:50%;flex:none}.bm-war b{margin-left:auto}`;
  document.head.appendChild(css);
  // кнопка слоя «Города» (можно включать вместе с другими слоями)
  const lt = document.getElementById('layer-toggles');
  if (lt && !document.getElementById('layer-cities')) {
    const b = document.createElement('button'); b.id = 'layer-cities'; b.className = 'layer lcities'; b.textContent = '🏙 Города';
    b.addEventListener('click', () => { uiState.showCities = !uiState.showCities; b.classList.toggle('active', uiState.showCities); });
    lt.appendChild(b);
  }
  // слой «Битвы» (обычный слой: клик по очагу — подробности)
  if (lt && !document.getElementById('layer-battles')) {
    const b = document.createElement('button'); b.id = 'layer-battles'; b.className = 'layer'; b.dataset.layer = 'battles'; b.textContent = '⚔ Битвы';
    b.addEventListener('click', () => setLayer('battles'));
    lt.appendChild(b);
  }
  // кнопка «Подробно о державе» в инспекторе
  const insp = document.getElementById('inspector-state');
  if (insp && !document.getElementById('btn-state-detail')) {
    const b = document.createElement('button'); b.id = 'btn-state-detail'; b.textContent = '📋 Подробно о державе';
    b.addEventListener('click', () => openStateModal(selectedState || highlightedState));
    insp.appendChild(b);
  }
  const closeBtn = document.getElementById('insp-state-close');
  if (closeBtn && !closeBtn._wired) { closeBtn._wired = true; closeBtn.addEventListener('click', () => { selectedState = null; highlightedState = null; renderStatePanel(null); }); }
}
// ---- слой «Битвы»: клик по очагу → подробности; агрегация очагов в войны ----
function findNearestBattle(cx, cy, maxd) {
  if (typeof battles === 'undefined' || !battles.length) return null;
  let best = null, bd = maxd * maxd;
  for (const b of battles) { const dx = b.x - cx, dy = b.y - cy, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = b; } }
  return best;
}
function _warKey(b) { return Math.min(b.attackerId, b.defenderId) + '_' + Math.max(b.attackerId, b.defenderId); }
function aggregateWars() {
  const m = new Map(); if (typeof battles === 'undefined') return [];
  for (const b of battles) {
    if (b.attackerId === undefined || b.attackerId < 0 || b.defenderId < 0) continue;
    const k = _warKey(b); let w = m.get(k);
    if (!w) { w = { key: k, attName: b.attName, defName: b.defName, attColor: b.attColor, defColor: b.defColor, era: b.era, naval: !!b.naval, cells: 0, start: b.startTick, count: 0 }; m.set(k, w); }
    w.cells += b.cellsTaken || 1; w.count++; w.start = Math.min(w.start, b.startTick); w.era = Math.max(w.era, b.era); if (b.naval) w.naval = true;
  }
  return Array.from(m.values()).sort((a, b) => b.count - a.count);
}
function openBattleModal(clicked) {
  const wars = aggregateWars();
  let w0 = wars[0];
  if (clicked && clicked.attackerId !== undefined) { const k = _warKey(clicked); w0 = wars.find(x => x.key === k) || w0; }
  if (!w0) w0 = { attName: '—', defName: '—', attColor: [150, 150, 150], defColor: [150, 80, 80], era: 0, naval: false, cells: 0, start: W.simTick, count: 0 };
  let m = document.getElementById('battle-modal');
  if (!m) { m = document.createElement('div'); m.id = 'battle-modal'; document.body.appendChild(m); m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.remove('show'); }); }
  m.classList.add('show');
  const flag = c => `<div class='bm-flag' style='background:rgb(${c[0]},${c[1]},${c[2]})'></div>`;
  function render(w) {
    const age = ((W.simTick - w.start) / 80).toFixed(1), cas = Math.round(w.cells * 220);
    const detail = `<div class='bm-title'>${w.naval ? '⚓' : '⚔'} ${w.attName} против ${w.defName}</div>
      <div class='bm-sides'><div class='bm-side'>${flag(w.attColor)}<b>${w.attName}</b><span>нападающий</span></div><div class='bm-vs'>⚔</div><div class='bm-side'>${flag(w.defColor)}<b>${w.defName}</b><span>обороняющийся</span></div></div>
      <div class='bm-stats'><div class='bm-stat'><b>${w.naval ? 'морская' : 'наземная'}</b><span>тип</span></div><div class='bm-stat'><b>${CIV.ERA_RU[w.era]}</b><span>эпоха</span></div><div class='bm-stat'><b>${age} лет</b><span>идёт</span></div><div class='bm-stat'><b>${w.cells}</b><span>захвачено клеток</span></div><div class='bm-stat'><b>~${fmt(cas)}</b><span>жертвы (оцен.)</span></div><div class='bm-stat'><b>${w.count}</b><span>очагов</span></div></div>`;
    const list = `<div class='bm-list'><h4>Все активные конфликты (${wars.length})</h4>${wars.length ? wars.map(x => `<div class='bm-war' data-k='${x.key}'><span class='dot' style='background:rgb(${x.attColor[0]},${x.attColor[1]},${x.attColor[2]})'></span>${x.attName} ⚔ ${x.defName}<b>${x.cells}</b></div>`).join('') : '<i>сейчас нет войн</i>'}</div>`;
    m.innerHTML = `<div class='bm-card'><div class='bm-head'><div class='bm-h'>⚔ Битвы</div><button class='bm-close'>✕</button></div>${detail}${list}</div>`;
    m.querySelector('.bm-close').addEventListener('click', () => m.classList.remove('show'));
    m.querySelectorAll('.bm-war').forEach(el => el.addEventListener('click', () => { const ww = wars.find(x => x.key === el.dataset.k); if (ww) render(ww); }));
  }
  render(w0);
}
