// civ.js — население и цивилизации по научным моделям.
// • Рост Ферхюльста (логистика) к ёмкости среды + демографический переход.
// • Сельхоз-производительность даёт ИЗБЫТОК продовольствия → урбанизация (городская революция).
// • Распределение городов по теории центральных мест / правилу ранг-размер (Ципф).
// • Гравитационная модель миграции (демпфированная) — без осцилляций.
// • Территория = заселённая земля; обезлюдевшие клетки и пустые государства исчезают.
'use strict';

let states = [];
let ships = [];
let cities = [];
let battles = [];                       // метки сражений для карты (x, y, life, color)
let selectedState = null;
let highlightedState = null;
let _stateSeq = 0;
// ---- ХРОНИКА человечества: лента важных событий (войны, державы, эпохи, колонии, расколы) ----
let worldEvents = [], _eventsChanged = false;
function logEvent(type, text) {
  const year = (typeof W !== 'undefined') ? Math.floor(W.simYear) : 0;
  const last = worldEvents[0];
  if (last && last.text === text && year - last.year < 4) return;   // не дублируем подряд одно и то же
  worldEvents.unshift({ year, type, text });
  if (worldEvents.length > 260) worldEvents.length = 260;
  _eventsChanged = true;
}

const CIV = {
  // демография
  R_BASE: 0.05,                       // базовый прирост/тик (доиндустриальный)
  TRANSITION: [0.0, 0.15, 0.45, 0.80, 0.90, 0.96],  // демографический переход по эпохам
  TERRA_TECH: 6, TERRA_MAX: 0.80,     // технологическое освоение суровых земель (начинается раньше, плавно)
  ADAPT_MAX: 0.55, ADAPT_RATE: 0.0011, ADAPT_DECAY: 0.997,   // адаптация населения к климату со временем (эскимосы/бедуины)
  SUBSIST_BASE: 35, SUBSIST_TECH: 7, SUBSIST_HAB: 120, SUBSIST_CAP: 420,   // прокорм кочевников — РЕДКОЕ население на грани, не город
  HARSH_DECAY: 0.95,                  // мягкий отток из непригодной клетки (НЕ мгновенная гибель)
  K_FOOD_MAX: 4400,                   // макс. прокорм клетки (чел.)
  INHABITED_MIN: 40,                  // ниже — клетка необжита (даёт расселяться на рубежи)
  STATE_MIN_POP: 700,                 // государство гибнет ниже этого
  // сельское хозяйство и урбанизация
  PROD_BASE: 1.25, PROD_TECH: 0.45,   // производительность = база + tech (избыток растёт с tech)
  IMPORT_TECH: 0.22,                  // транспорт/торговля позволяют кормить города импортом
  URB_RATE: 0.05,                     // скорость роста/спада городской ёмкости
  URBAN_CELL_MAX: 180000,             // потолок населения одной клетки (мегаполис)
  CITY_POP_MIN: 11000, CITY_URBAN_MIN: 2800,  // пороги «город» (маркеры/учёт)
  // миграция (гравитационная)
  MIG_RATE: 0.08, MIG_COMFORT: 0.62, MIG_MIN: 50, PIONEER: 0.03,   // пионеры активно осваивают пустующие пригодные земли
  // государства
  SEED_ABS: 1300, SEED_FILL: 0.6, STATE_CAP: 48, BASE_REACH: 8, EXPAND_P: 0.4, MAX_NUCLEATE: 1,
  TECH_RATE: 0.0055, TECH_CAP: 22, ERA_TECH: [2, 5, 9, 13, 17],
  AGRI: [0.3, 1.2, 2.6, 6.0, 11.0, 18.0], ERA_MIL: [0.5, 1.0, 1.6, 2.5, 3.6, 5.0], SEAFAR: [0, 1, 1, 2, 3, 4],
  TAX: 0.1, WAR_THRESH: -0.4, WAR_P: 0.08, SACK: 0.25,
  PLAGUE_BASE: 0.0006, PLAGUE_LETHAL: 0.12,
  ERA_RU: ['Племена', 'Аграрная', 'Классическая', 'Индустриальная', 'Современная', 'Космическая'],
};

const _popBuf = new Float32Array(GRID.N);

// ---- названия держав/городов, форма правления ----
const NAME_A = ['Ка', 'Та', 'Вел', 'Мор', 'Сел', 'Дра', 'Эл', 'Ун', 'Ар', 'Бе', 'Но', 'За', 'Ми', 'Лу', 'Гор', 'Тан', 'Вес', 'Кел', 'Ом', 'Рав', 'Син', 'Лор', 'Фен', 'Дун', 'Аск', 'Бур', 'Ил', 'Эст', 'Кар', 'Тир', 'Вол', 'Нар'];
const NAME_B = ['рия', 'ланд', 'град', 'бург', 'ос', 'ария', 'ен', 'дор', 'хейм', 'тон', 'ск', 'ия', 'а', 'ум', 'ор', 'ад', 'ест', 'ния', 'стан', 'полис', 'весь', 'мир', 'аль', 'инд'];
function genName() { return NAME_A[(Math.random() * NAME_A.length) | 0] + NAME_B[(Math.random() * NAME_B.length) | 0]; }
const cityNames = {};
function cityName(i) { return cityNames[i] || (cityNames[i] = genName()); }
function governmentOf(st) {
  const e = st.era;
  if (e === 0) return st.area > 6 ? 'Вождество' : 'Племя';
  if (e === 1) return 'Раннее царство';
  if (e === 2) return st.stability > 0.6 ? 'Империя' : 'Город-государство';
  if (e === 3) return st.urbanPct > 0.3 ? 'Республика' : 'Монархия';
  if (e === 4) return st.stability > 0.5 ? 'Демократия' : 'Диктатура';
  return 'Технократия';
}

function eraOf(t) { const E = CIV.ERA_TECH; for (let e = E.length; e > 0; e--) if (t >= E[e - 1]) return e; return 0; }
const productivity = tech => CIV.PROD_BASE + tech * CIV.PROD_TECH;   // прокорм на одного крестьянина

function hslToRgb(h, s, l) {
  h /= 360; const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

// ---- среда обитания и ёмкость ----
function habitability(i) {
  if (W.isWater[i] || W.iceAlbedo[i]) return 0;
  const t = W.temp[i];
  const tC = Math.exp(-((t - 14) * (t - 14)) / (2 * 13 * 13));
  const humN = W.precip[i] / 3000;
  const wC = clamp01((humN - 0.05) / 0.35) * (1 - 0.25 * clamp01((humN - 0.8) / 0.2));
  const eC = 1 - clamp01((landH(i) - 0.5) / 0.5) * 0.85;
  return clamp01(tC * wC * eC);
}

// продовольственная ёмкость клетки (использует habEff — с учётом терраформирования)
function foodCapacity(i) {
  const hab = W.hab[i]; if (hab <= 0) return 0;   // ЗЕМЛЕДЕЛИЕ — по природной пригодности (адаптация даёт лишь редкий прокорм, не фермы в тундре)
  const b = W.biome[i];
  const arable = BIOME_CIV[b] ? BIOME_CIV[b].arable : 0;
  // СГЛАЖЕННАЯ продуктивность (NPP по сглаженному климату) → урбанизация/ёмкость не скачут по сезонам, а значит и тип застройки (поля↔дома) не мерцает
  const nppS = computeNPP(W.tempSmoothed[i], W.precipSmoothed[i]);
  const foodPot = clamp01(0.35 * nppS + 1.1 * arable * (0.45 + 0.55 * W.fertility[i]));
  let water = 1.0; if (W.riverFlux[i] > 0.3) water = 1.4; else if (W.isCoast[i]) water = 1.25;
  const ecoF = 0.55 + 0.45 * W.eco[i];
  return CIV.K_FOOD_MAX * foodPot * hab * water * ecoF;
}

function stateOf(i) { const s = W.stateId[i]; return s >= 0 && states[s] && states[s].alive ? states[s] : null; }
// две державы ВОЮЮТ? (отношения ниже порога войны) — торговля между ними не идёт. Отношения симметричны → достаточно одной стороны
function atWar(a, b) { if (!a || !b || a === b || !a.alive || !b.alive) return false; return (a.relations.get(b.id) || 0) < CIV.WAR_THRESH; }
// выбор порта-назначения для ТОРГОВЛИ: не свой, НЕ враг; 40% — к ДАЛЁКОМУ (межконтинентальная торговля), иначе к ближайшему
function pickTradeDest(fromI, owner, exclude, ports) {
  const fx = fromI % GRID.W, fy = (fromI / GRID.W) | 0, safe = [];
  for (const p of ports) { if (p === fromI || p === exclude) continue; if (atWar(owner, stateOf(p))) continue; safe.push(p); }
  if (!safe.length) return -1;
  if (Math.random() < 0.4) {                                   // к ДАЛЁКОМУ порту — из дальней трети
    safe.sort((a, b) => (((b % GRID.W - fx) ** 2 + ((b / GRID.W | 0) - fy) ** 2) - ((a % GRID.W - fx) ** 2 + ((a / GRID.W | 0) - fy) ** 2)));
    return safe[(Math.random() * Math.max(1, Math.ceil(safe.length / 3))) | 0];
  }
  let best = -1, bd = Infinity;                                // к БЛИЖАЙШЕМУ
  for (const p of safe) { const dd = (p % GRID.W - fx) ** 2 + ((p / GRID.W | 0) - fy) ** 2; if (dd < bd) { bd = dd; best = p; } }
  return best;
}

// hab, foodCap и итоговая ёмкость = (сельская = foodCap/производительность) + городская
function refreshCapacities() {
  for (let i = 0; i < GRID.N; i++) {
    W.hab[i] = habitability(i);
    if (W.isWater[i]) { W.habEff[i] = 0; W.foodCap[i] = 0; W.capacity[i] = 0; continue; }
    const st = stateOf(i);
    const era = st ? st.era : 0, tech = st ? st.tech : 0;
    // эффективная пригодность = природная + (технологии + базовое выживание + накопленная адаптация)
    const terra = clamp01((tech - CIV.TERRA_TECH) / 12) * CIV.TERRA_MAX;   // технологическое освоение
    const base = 0.02 + clamp01(tech / CIV.TECH_CAP) * 0.06;               // люди выживают даже на грани (кочевники)
    const adaptBoost = W.adapt[i] * CIV.ADAPT_MAX;                         // местная адаптация со временем
    W.habEff[i] = clamp01(W.hab[i] + (1 - W.hab[i]) * clamp01(base + terra + adaptBoost));
    const agri = 1 + CIV.AGRI[era] * tech / 8;
    const fc = foodCapacity(i) * agri;
    W.foodCap[i] = fc;
    W.foodCapS[i] = W.foodCapS[i] > 0 ? W.foodCapS[i] + (fc - W.foodCapS[i]) * 0.015 : fc;   // СГЛАЖЕННЫЙ продкап для урбанизации → урбан не скачет по сезонам (тип застройки не мерцает)
    const ruralCap = fc / productivity(tech);          // крестьян нужно меньше, чем кормит земля
    // прокорм собирателей/кочевников: суровая земля кормит МАЛО (редкое население), но не ноль
    const subsist = clamp(CIV.SUBSIST_BASE + tech * CIV.SUBSIST_TECH + W.habEff[i] * CIV.SUBSIST_HAB, 0, CIV.SUBSIST_CAP);
    W.capacity[i] = ruralCap + subsist + W.urban[i];   // + городская ёмкость (живёт на избыток)
  }
}

// адаптация к климату: заселённые клетки со временем (и с технологиями) становятся пригоднее
function stepAdaptation() {
  for (let i = 0; i < GRID.N; i++) {
    if (W.isWater[i]) continue;
    if (W.pop[i] > 30) {
      const st = stateOf(i); const tech = st ? st.tech : 0;
      W.adapt[i] = Math.min(1, W.adapt[i] + CIV.ADAPT_RATE * (0.5 + tech / 9) * (1 - W.adapt[i]));
    } else if (W.adapt[i] > 0) { W.adapt[i] *= CIV.ADAPT_DECAY; if (W.adapt[i] < 0.001) W.adapt[i] = 0; }
  }
}

// ---- демография: логистика Ферхюльста + демографический переход ----
function stepPopulation() {
  for (let i = 0; i < GRID.N; i++) {
    let P = W.pop[i];
    // городская ёмкость без населения/государства медленно ветшает
    if (W.urban[i] > 0 && (W.stateId[i] < 0 || P < CIV.INHABITED_MIN)) { W.urban[i] *= 0.97; if (W.urban[i] < 1) W.urban[i] = 0; }
    if (P <= 0) { if (W.disease[i] > 0) W.disease[i] *= 0.85; continue; }
    const K = W.capacity[i], hab = W.habEff[i];
    if (hab < 0.02 || K < 1) {
      P *= CIV.HARSH_DECAY;                              // совсем непригодно — мягкий отток, не мгновенная гибель
    } else {
      const st = stateOf(i);
      const r = CIV.R_BASE * hab * (1 - CIV.TRANSITION[st ? st.era : 0]);
      P += r * P * (1 - P / K);                         // логистика: плавно, без скачков и переполнения
      if (P > K * 1.05 && K > 3000 && Math.random() < CIV.PLAGUE_BASE) W.disease[i] = 0.55;
      W.unrest[i] = clamp01(W.unrest[i] + (P > K ? 0.03 : -0.02));
    }
    if (W.disease[i] > 0.01) { P *= (1 - W.disease[i] * CIV.PLAGUE_LETHAL); W.disease[i] *= 0.85; }
    W.pop[i] = P < 0 ? 0 : P > CIV.URBAN_CELL_MAX ? CIV.URBAN_CELL_MAX : P;
  }
}

// ---- миграция: гравитационная модель, демпфированная (село → города) ----
function stepMigration() {
  _popBuf.set(W.pop);
  for (let y = 0; y < GRID.H; y++) {
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      const P = W.pop[i]; if (P < CIV.MIG_MIN) continue;
      const K = W.capacity[i] || 1, hab = W.habEff[i];
      const surplus = Math.max(0, P - K * CIV.MIG_COMFORT);   // избыток сверх комфорта
      const misery = P * Math.max(0, 0.3 - hab) * 1.5;
      // ПИОНЕРЫ: часть населения всегда ищет новые земли (уезжают, только если рядом есть куда — см. cand)
      const out = CIV.MIG_RATE * (surplus + misery) + CIV.PIONEER * P * hab;
      if (out < 1) continue;
      const sid = W.stateId[i];
      const seaRange = sid >= 0 && states[sid] ? CIV.SEAFAR[states[sid].era] : 0;
      const cand = []; let wsum = 0;
      for (const [dx, dy] of NB8) {
        let nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
        let ni = idx(nx, ny);
        if (W.isWater[ni]) { if (seaRange <= 0) continue; nx += dx; ny += dy; if (!inB(nx, ny)) continue; ni = idx(nx, ny); if (W.isWater[ni]) continue; }
        const head = Math.max(0, (W.capacity[ni] || 0) - W.pop[ni]);
        if (head <= 0) continue;
        const cityPull = 1 + clamp01(W.urban[ni] / 4000) * 2.5;   // города притягивают сильнее
        const wt = head * (0.2 + W.habEff[ni]) * cityPull;
        if (wt > 0) { cand.push([ni, wt]); wsum += wt; }
      }
      if (wsum <= 0) continue;
      _popBuf[i] -= out;
      for (const [ni, wt] of cand) _popBuf[ni] += out * (wt / wsum);
    }
  }
  W.pop.set(_popBuf);
}

// ---- территория ↔ население: обезлюдевшие клетки покидают государство ----
function releaseDepopulated() {
  for (let i = 0; i < GRID.N; i++) {
    if (W.stateId[i] >= 0 && W.pop[i] < CIV.INHABITED_MIN) clearOwner(i);
  }
}

function setOwner(i, st) { const o = W.stateId[i]; if (o === st.id) return; if (o >= 0 && states[o]) states[o].cells.delete(i); W.stateId[i] = st.id; st.cells.add(i); }
function clearOwner(i) { const o = W.stateId[i]; if (o >= 0 && states[o]) states[o].cells.delete(i); W.stateId[i] = -1; }
function killState(st) { if (st.alive && st.name) logEvent('collapse', 'Держава ' + st.name + ' прекратила существование'); if (st.cells.size) Array.from(st.cells).forEach(clearOwner); st.alive = false; }

function nucleateStates() {
  if (states.filter(s => s.alive).length >= CIV.STATE_CAP) return;
  let made = 0;
  for (let scan = 0; scan < 500 && made < CIV.MAX_NUCLEATE; scan++) {
    const i = (Math.random() * GRID.N) | 0;
    if (W.stateId[i] !== -1 || W.isWater[i]) continue;
    const fc = W.foodCap[i];
    if (W.pop[i] > CIV.SEED_ABS && fc > 0 && W.pop[i] / fc > CIV.SEED_FILL && Math.random() < 0.5) {
      let slot = -1; for (let k = 0; k < states.length; k++) if (!states[k].alive) { slot = k; break; }
      const id = slot >= 0 ? slot : states.length;
      if (slot >= 0) for (const o of states) o.relations.delete(id);
      const hue = (_stateSeq * 67.5) % 360; _stateSeq++;
      const st = {
        id, alive: true, color: hslToRgb(hue, 0.62, 0.55), capital: i, cells: new Set(),
        pop: 0, area: 0, tech: 0, era: 0, treasury: 0, military: 0, stability: 1, relations: new Map(),
        industry: 0, pollution: 0, economy: 0, atWar: 0, cityCount: 0, largestCity: 0, urbanPct: 0,
        name: genName(), history: [],
      };
      if (slot >= 0) states[slot] = st; else states.push(st);
      setOwner(i, st); made++; logEvent('found', 'Зародилась цивилизация: ' + st.name);
    }
  }
}

// основать державу в клетке вручную (инструмент «Город»)
function foundStateAt(i) {
  if (W.isWater[i] || W.stateId[i] >= 0) return;
  let slot = -1; for (let k = 0; k < states.length; k++) if (!states[k].alive) { slot = k; break; }
  const id = slot >= 0 ? slot : states.length;
  if (slot >= 0) for (const o of states) o.relations.delete(id);
  const hue = (_stateSeq * 67.5) % 360; _stateSeq++;
  const st = {
    id, alive: true, color: hslToRgb(hue, 0.62, 0.55), capital: i, cells: new Set(),
    pop: 0, area: 0, tech: 0, era: 0, treasury: 0, military: 0, stability: 1, relations: new Map(),
    industry: 0, pollution: 0, economy: 0, atWar: 0, cityCount: 0, largestCity: 0, urbanPct: 0,
    name: genName(), history: [],
  };
  if (slot >= 0) states[slot] = st; else states.push(st);
  setOwner(i, st); logEvent('found', 'Основана держава: ' + st.name);
}

// ---- урбанизация: распределение сельхоз-избытка по лучшим местам (ранг-размер) ----
function siteScore(i, st) {
  let s = 1 + (W.isCoast[i] ? 1.6 : 0) + (W.riverFlux[i] > 0.3 ? 1.1 : 0) + W.fertility[i] * 1.1;   // только СТАБИЛЬНЫЕ факторы (без сезонной hab) → урбан не перераспределяется по сезонам
  if (i === st.capital) s *= 3.2;                       // столица — первичный город (primate city)
  return s;
}
function allocateUrbanization(st) {
  // чистый продовольственный избыток государства (плюс импорт по технологиям транспорта)
  let foodTot = 0, popTot = 0;
  st.cells.forEach(i => { foodTot += W.foodCapS[i]; popTot += W.pop[i]; });   // СГЛАЖЕННЫЙ продкап → стабильная урбанизация по сезонам
  const budget = Math.max(0, foodTot * (1 + st.tech * CIV.IMPORT_TECH) - popTot);
  // веса по теории центральных мест (степень >1 → концентрация в немногих городах)
  let totalW = 0; const sites = [];
  st.cells.forEach(i => { if (W.pop[i] < 150) return; const w = Math.pow(siteScore(i, st), 1.9); sites.push([i, w]); totalW += w; });
  if (totalW <= 0) return;
  for (const [i, w] of sites) {
    const target = Math.min(CIV.URBAN_CELL_MAX, budget * (w / totalW));
    W.urban[i] += (target - W.urban[i]) * CIV.URB_RATE;
    if (W.urban[i] < 1) W.urban[i] = 0;
  }
}

function updateStateEconomyTech(st) {
  let pop = 0, area = 0, ind = 0, pol = 0, cityN = 0, maxCity = 0, urbanPop = 0;
  st.cells.forEach(i => {
    pop += W.pop[i]; area++; ind += W.industry[i]; pol += W.pollution[i];
    if (W.urban[i] > CIV.CITY_URBAN_MIN && W.pop[i] > CIV.CITY_POP_MIN) { cityN++; urbanPop += Math.min(W.pop[i], W.urban[i]); if (W.pop[i] > maxCity) maxCity = W.pop[i]; }
  });
  st.pop = pop; st.area = area; st.industry = ind; st.pollution = area ? pol / area : 0;
  st.cityCount = cityN; st.largestCity = maxCity; st.urbanPct = pop > 0 ? clamp01(urbanPop / pop) : 0;
  const production = pop * 0.0006 + ind * 0.05 + cityN * 0.05;
  st.treasury += CIV.TAX * production;
  st.economy = pop * (1 + st.tech * 0.3) + ind * 4000;
  const drive = clamp01(pop / 120000 + cityN * 0.06 + st.urbanPct * 0.5 + st.treasury * 0.002 + ind * 0.015);
  st.techRate = CIV.TECH_RATE * drive * (1 - st.tech / CIV.TECH_CAP);   // скорость исследований (наука растёт с населением/городами/экономикой)
  st.tech += st.techRate;
  if (area === 0) st.tech = Math.max(0, st.tech - 0.01);
  const ne = eraOf(st.tech); if (ne !== st.era) { if (ne > st.era) logEvent('era', st.name + ' вступает в эпоху: ' + CIV.ERA_RU[ne]); st.era = ne; st.cells.forEach(i => W.capDirty[i] = 1); }
  // АРМИЯ — доля населения под ружьём (мобилизация растёт с эпохой/технологиями), но всегда МЕНЬШЕ населения
  st.military = pop * Math.min(0.4, 0.02 + CIV.ERA_MIL[st.era] * 0.05 + st.tech * 0.008) * st.stability;
  let wars = 0; st.relations.forEach(v => { if (v < CIV.WAR_THRESH) wars++; }); st.atWar = wars;
  if ((W.simTick & 7) === 0) { st.history.push([Math.round(st.pop), +st.tech.toFixed(1)]); if (st.history.length > 80) st.history.shift(); }   // история для графиков
}

function expandState(st) {
  const maxClaims = Math.max(1, Math.round(1.5 + st.tech * 0.6 + st.area * 0.025));
  let claims = 0; const targets = [];
  st.cells.forEach(i => {
    if (claims >= maxClaims) return;
    const x = i % GRID.W, y = (i / GRID.W) | 0;
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (W.stateId[ni] !== -1 || W.isWater[ni] || W.pop[ni] < CIV.INHABITED_MIN) continue;  // заселённые рубежи (порог снижен)
      const attract = 0.4 + W.pop[ni] / 8000 + W.habEff[ni] * 0.5;   // тянутся и к землям, которые СМОГУТ освоить
      if (Math.random() < CIV.EXPAND_P * attract) targets.push(ni);
    }
  });
  for (const ni of targets) { if (claims >= maxClaims) break; setOwner(ni, st); claims++; }
}

// создать пустой объект государства (для нуклеации/основания/раскола)
function newStateObj(capital) {
  let slot = -1; for (let k = 0; k < states.length; k++) if (!states[k].alive) { slot = k; break; }
  const id = slot >= 0 ? slot : states.length;
  if (slot >= 0) for (const o of states) o.relations.delete(id);
  const hue = (_stateSeq * 67.5) % 360; _stateSeq++;
  const st = {
    id, alive: true, color: hslToRgb(hue, 0.62, 0.55), capital, cells: new Set(),
    pop: 0, area: 0, tech: 0, era: 0, treasury: 0, military: 0, stability: 1, relations: new Map(),
    industry: 0, pollution: 0, economy: 0, atWar: 0, cityCount: 0, largestCity: 0, urbanPct: 0, name: genName(), history: [],
  };
  if (slot >= 0) states[slot] = st; else states.push(st);
  return st;
}
// РАСКОЛ: оторвавшийся кусок территории становится НОВЫМ государством (наследует часть технологий)
function secedeChunk(cells, parent) {
  let cap = cells[0], bp = -1; for (const i of cells) if (W.pop[i] > bp) { bp = W.pop[i]; cap = i; }
  const st = newStateObj(cap); st.tech = parent.tech * 0.82; st.era = eraOf(st.tech); st.capital = cap;
  for (const i of cells) setOwner(i, st);
  st.relations.set(parent.id, -0.2); parent.relations.set(st.id, -0.2);   // отделились — отношения прохладные
  logEvent('secede', st.name + ' откололась от державы ' + parent.name);
}
const _secDist = new Float64Array(GRID.N);
function checkSecession(st) {
  if (st.cells.size <= 2) return;
  const reach = CIV.BASE_REACH + st.tech * 0.8 + st.era * 2.5;
  // 1) основная территория: BFS ТОЛЬКО по своей суше от столицы (без блуждания по океану)
  const dist = _secDist; dist.fill(Infinity); dist[st.capital] = 0;
  const q = [st.capital]; let h = 0;
  while (h < q.length) {
    const i = q[h++], d = dist[i]; if (d > reach) continue; const x = i % GRID.W, y = (i / GRID.W) | 0;
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny);
      if (W.stateId[ni] !== st.id || W.isWater[ni]) continue;        // только своя суша
      const nd = d + 1 + W.slope[ni] * 3 + landH(ni) * 2;
      if (nd + 1e-3 < dist[ni]) { dist[ni] = nd; q.push(ni); }       // эпсилон — без зацикливания
    }
  }
  // 2) ЗАМОРСКИЕ владения держатся, если в пределах морского хода от основного берега (мореходство по эпохе)
  const seaReach = st.era >= 3 ? 16 : st.era >= 1 ? 9 : 0, sr2 = seaReach * seaReach;
  const mainCoast = []; st.cells.forEach(i => { if (dist[i] <= reach && W.isCoast[i]) mainCoast.push(i); });
  const free = [];
  st.cells.forEach(i => {
    if (dist[i] <= reach) return;                                    // основная территория — остаётся с державой
    const x = i % GRID.W, y = (i / GRID.W) | 0; let held = false;
    for (const c of mainCoast) { const dx = c % GRID.W - x, dy = (c / GRID.W | 0) - y; if (dx * dx + dy * dy <= sr2) { held = true; break; } }
    if (!held) free.push(i);                                         // слишком далеко — отколется
  });
  if (!free.length) return;
  // связные куски: крупные ОТКАЛЫВАЮТСЯ в новое государство, мелкие — освобождаются
  const freeSet = new Set(free), visited = new Set();
  for (const start of free) {
    if (visited.has(start)) continue;
    const chunk = [start]; visited.add(start); const stack = [start];
    while (stack.length) { const i = stack.pop(), x = i % GRID.W, y = (i / GRID.W) | 0; for (const [dx, dy] of NB8) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (freeSet.has(ni) && !visited.has(ni)) { visited.add(ni); chunk.push(ni); stack.push(ni); } } }
    let cp = 0; for (const i of chunk) cp += W.pop[i];
    if (chunk.length >= 3 && cp > CIV.STATE_MIN_POP) secedeChunk(chunk, st); else for (const i of chunk) clearOwner(i);
  }
}

function updateStability(st) {
  const reach = CIV.BASE_REACH + st.tech * 0.8 + st.era * 2.5;
  let unrest = 0, n = 0; st.cells.forEach(i => { unrest += W.unrest[i]; n++; }); unrest = n ? unrest / n : 0;
  const oversize = clamp01((st.area - reach * 6) / (reach * 6));
  const target = clamp01(1 - unrest * 0.6 - oversize * 0.5);
  st.stability += (target - st.stability) * 0.1;
  if (st.stability < 0.25 && st.area > 4) {
    const cx = st.capital % GRID.W, cy = (st.capital / GRID.W) | 0;
    const arr = Array.from(st.cells).map(i => [i, Math.hypot(i % GRID.W - cx, ((i / GRID.W) | 0) - cy)]).sort((a, b) => b[1] - a[1]);
    const drop = Math.ceil(arr.length * 0.35);
    for (let k = 0; k < drop; k++) clearOwner(arr[k][0]);
    st.stability = 0.5;
  }
}

// боевая мощь: армия × технологии × стабильность × экономика (от неё зависит исход войны)
function powerOf(st) { return st.military * (1 + st.tech * 0.12) * (0.55 + 0.45 * st.stability) * (1 + clamp01(st.economy / 6e5) * 0.5); }
// единая точка создания «битвы» — с подробностями для армий в 3D и слоя «Битвы»
function pushBattle(cell, att, def, type, life) {
  battles.push({
    x: cell % GRID.W, y: (cell / GRID.W) | 0, life: life || 12, color: att ? att.color : [220, 60, 60],
    attackerId: att ? att.id : -1, defenderId: def ? def.id : -1, attName: att ? att.name : '—', defName: def ? def.name : '—',
    attColor: att ? att.color : [200, 200, 200], defColor: def ? def.color : [210, 90, 80],
    era: Math.max(att ? att.era : 0, def ? def.era : 0), type: type || 'land', naval: type === 'naval' || type === 'invasion',
    startTick: W.simTick, cellsTaken: 1, strA: att ? powerOf(att) : 0, strD: def ? powerOf(def) : 0,
  });
}
function diplomacyAndWar() {
  for (let b = battles.length - 1; b >= 0; b--) { if (--battles[b].life <= 0) battles.splice(b, 1); }   // затухание меток боёв
  const alive = states.filter(s => s.alive && s.cells.size > 0);
  for (const a of alive) {
    if (!a.alive) continue;
    const neigh = new Map();                                  // сосед → граничная клетка
    for (const i of a.cells) {
      const x = i % GRID.W, y = (i / GRID.W) | 0;
      for (const [dx, dy] of NB4) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const sid = W.stateId[idx(nx, ny)]; if (sid >= 0 && sid !== a.id && states[sid] && states[sid].alive && !neigh.has(sid)) neigh.set(sid, idx(nx, ny)); }
    }
    for (const foeId of neigh.keys()) {
      const foe = states[foeId]; if (!foe || !foe.alive) continue;
      const rel = a.relations.get(foeId) || 0, techGap = a.tech - foe.tech;
      // отношения: большой разрыв в развитии/эпохах → напряжение; ровня → теплеет (возможен союз)
      const drift = (Math.random() - 0.5) * 0.07 - Math.abs(techGap) * 0.005 - (a.era !== foe.era ? 0.02 : -0.012);
      const nrel = clamp(rel + drift, -1, 1);
      a.relations.set(foeId, nrel); foe.relations.set(a.id, nrel);
      if (a.id < foeId) {   // событие на пару — один раз (а не с обеих сторон)
        if (rel >= CIV.WAR_THRESH && nrel < CIV.WAR_THRESH) logEvent('war', 'Война: ' + a.name + ' против ' + foe.name);
        else if (rel <= 0.5 && nrel > 0.5) logEvent('alliance', 'Союз: ' + a.name + ' и ' + foe.name);
      }
      if (nrel > 0.5) {                                       // СОЮЗ: научный обмен — отстающий подтягивается к лидеру
        if (a.tech > foe.tech) foe.tech += (a.tech - foe.tech) * 0.03; else a.tech += (foe.tech - a.tech) * 0.03;
        continue;
      }
      const colonial = techGap > 4;                           // развитая держава vs отсталая (колониальная война)
      if (!(nrel < CIV.WAR_THRESH || colonial)) continue;
      const pa = powerOf(a), pf = powerOf(foe);
      if (pa > pf * 1.15 && Math.random() < CIV.WAR_P * (colonial ? 3 : 1.3)) {
        a.relations.set(foeId, clamp(nrel - 0.12, -1, 1)); foe.relations.set(a.id, clamp(nrel - 0.12, -1, 1));
        const ratio = clamp(pa / (pf + 1), 1, 5);             // чем сильнее перевес — тем больше захват
        const grabN = Math.min(foe.cells.size - 1, Math.round(1 + ratio + (colonial ? 2 : 0)));
        const grabs = [];
        for (const i of a.cells) { const x = i % GRID.W, y = (i / GRID.W) | 0; for (const [dx, dy] of NB8) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (W.stateId[ni] === foeId) grabs.push(ni); } }
        grabs.sort((u, v) => (W.foodCap[v] + W.pop[v]) - (W.foodCap[u] + W.pop[u]));   // ХОРОШИЕ земли — в первую очередь
        const seen = new Set(); let taken = 0;
        for (const ni of grabs) { if (taken >= grabN) break; if (seen.has(ni)) continue; seen.add(ni); setOwner(ni, a); W.pop[ni] *= (1 - CIV.SACK); pushBattle(ni, a, foe, 'land', 12); taken++; }
      }
    }
  }
}

// промышленность (в городах), загрязнение, вырубка, глобальный CO2
function stepCivEcology() {
  let emit = 0, vegSum = 0;
  for (let i = 0; i < GRID.N; i++) {
    if (W.isWater[i]) continue;
    vegSum += W.veg[i];
    const p = W.pop[i];
    if (p > 50) {
      const st = stateOf(i); const era = st ? st.era : 0, tech = st ? st.tech : 0;
      const urbanF = clamp01(W.urban[i] / 6000);        // заводы — в городах
      const targetInd = (0.2 + urbanF) * clamp01(p / 7000) * (era >= 3 ? 1 : era >= 2 ? 0.5 : era >= 1 ? 0.15 : 0.03) * clamp01(0.2 + tech / 10);
      W.industry[i] += (targetInd - W.industry[i]) * 0.05;
      W.pollution[i] = clamp01(W.pollution[i] + (W.industry[i] * 0.9 + clamp01(p / 14000) * 0.12) * 0.06);
      if (W.pollution[i] > 0.4) W.unrest[i] = clamp01(W.unrest[i] + 0.02);
      emit += W.industry[i] + clamp01(p / 14000) * 0.05;
      const lu = clamp01(p / Math.max(W.foodCap[i], 1));
      if (W.veg[i] > 0.08) W.veg[i] = Math.max(0.05, W.veg[i] - lu * 0.004);
    } else if (W.industry[i] > 0) W.industry[i] *= 0.97;
  }
  W.globalEmissions = emit;
  const sink = (W.co2 - 1) * (0.0022 + vegSum * 3e-6);
  W.co2 = clamp(W.co2 + emit * 2.2e-6 - sink, 0.7, 4.5);
  W.co2ppm = Math.round(280 * W.co2);
}

// список городов для отрисовки/инспектора
function rebuildCities() {
  cities.length = 0;
  for (let i = 0; i < GRID.N; i++) {
    if (W.urban[i] > CIV.CITY_URBAN_MIN && W.pop[i] > CIV.CITY_POP_MIN) {
      const st = stateOf(i);
      cities.push({ i, x: i % GRID.W, y: (i / GRID.W) | 0, pop: W.pop[i], color: st ? st.color : [220, 220, 220], capital: st ? st.capital === i : false, name: cityName(i), stateId: st ? st.id : -1 });
    }
  }
}

function civTick() {
  W.simTick++;
  refreshCapacities();
  stepPopulation();
  stepMigration();
  stepAdaptation();                                     // население адаптируется к климату со временем
  releaseDepopulated();                                 // обезлюдевшие клетки покидают государства
  nucleateStates();
  for (const st of states) {
    if (!st.alive) continue;
    if (st.cells.size === 0) { st.alive = false; continue; }
    if (W.stateId[st.capital] !== st.id || W.pop[st.capital] < CIV.INHABITED_MIN) {
      let best = -1, bp = 0; st.cells.forEach(i => { if (W.pop[i] > bp) { bp = W.pop[i]; best = i; } });
      if (best >= 0) st.capital = best; else { killState(st); continue; }
    }
    updateStateEconomyTech(st);
    allocateUrbanization(st);
    expandState(st);
    checkSecession(st);
    updateStability(st);
    if (st.pop < CIV.STATE_MIN_POP) killState(st);       // нет населения — нет государства
  }
  diplomacyAndWar();
  stepNavalWar();                                         // морские вторжения через океан
  stepCivEcology();
  processShips();
  rebuildCities();
  markDirty('borders');
}

// ---- корабли: морская ТОРГОВЛЯ между портами (умное движение по воде) ----
// прибрежные порты — заселённые береговые клетки (не только крупные города), чтобы было куда плыть
function listPorts() {
  const ports = [];
  for (let i = 0; i < GRID.N; i++) if (W.isCoast[i] && !W.isWater[i] && (W.pop[i] > 1500 || W.urban[i] > 300)) ports.push(i);
  return ports;
}
// поиск морского пути BFS по воде от старта до клетки рядом с портом-целью (огибает материки)
const _shipPar = new Int32Array(GRID.N);
function waterPathTo(startI, destI) {
  _shipPar.fill(-2); _shipPar[startI] = -1; const q = [startI]; let h = 0;
  const dx0 = destI % GRID.W, dy0 = (destI / GRID.W) | 0;
  while (h < q.length) {
    const i = q[h++], x = i % GRID.W, y = (i / GRID.W) | 0;
    if (Math.abs(x - dx0) <= 1 && Math.abs(y - dy0) <= 1) { const path = []; let c = i; while (c !== -1) { path.push(c); c = _shipPar[c]; } return path.reverse(); }
    for (const [dx, dy] of NB8) { const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (!W.isWater[ni] || _shipPar[ni] !== -2) continue; _shipPar[ni] = i; q.push(ni); }
  }
  return null;
}
function adjWater(i) { const x = i % GRID.W, y = (i / GRID.W) | 0; for (const [dx, dy] of NB8) { const nx = x + dx, ny = y + dy; if (inB(nx, ny) && W.isWater[idx(nx, ny)]) return idx(nx, ny); } return -1; }
// пустующие пригодные берега — цели для кораблей-колонистов
function frontierCoasts() { const f = []; for (let i = 0; i < GRID.N; i++) if (W.isCoast[i] && !W.isWater[i] && W.stateId[i] < 0 && W.habEff[i] > 0.22 && W.pop[i] < 200) f.push(i); return f; }

// ---- МОРСКАЯ ВОЙНА: переброска армий через море для захвата чужих земель на другом континенте ----
function stepNavalWar() {
  let active = 0; for (const sh of ships) if (sh.invade) active++;
  if (active >= 6) return;
  const alive = states.filter(s => s.alive && s.area > 3 && s.era >= 2 && s.military > 1000);
  for (const a of alive) {
    if (active >= 6) break;
    if (Math.random() > 0.02) continue;                            // редкий шанс начать вторжение
    let src = -1; for (const i of a.cells) if (W.isCoast[i] && !W.isWater[i]) { src = i; break; }
    if (src < 0) continue; const sw = adjWater(src); if (sw < 0) continue;
    const sx = src % GRID.W, sy = (src / GRID.W) | 0;
    let target = -1, foe = null, bd = 56 * 56;                      // цель: чужой берег, до которого доплыть, и мы СИЛЬНЕЕ
    for (const b of alive) {
      if (b === a || powerOf(a) < powerOf(b) * 1.2) continue;
      let bestB = -1, bbd = bd;
      for (const i of b.cells) { if (!W.isCoast[i] || W.isWater[i]) continue; const dx = i % GRID.W - sx, dy = (i / GRID.W | 0) - sy, dd = dx * dx + dy * dy; if (dd > 30 && dd < bbd) { bbd = dd; bestB = i; } }
      if (bestB >= 0 && bbd < bd) { bd = bbd; target = bestB; foe = b; }
    }
    if (target < 0 || !foe) continue;
    const path = waterPathTo(sw, target); if (!path || path.length < 3) continue;
    ships.push({ x: sw % GRID.W, y: (sw / GRID.W) | 0, color: a.color, owner: a, dest: target, foeId: foe.id, path, pi: 0, invade: true, army: a.military * 0.3, life: path.length + 180 });
    a.relations.set(foe.id, -0.6); foe.relations.set(a.id, -0.6);   // объявлена война
    active++;
  }
}
// высадка десанта: морское сражение → плацдарм (захват берега) или разгром
function resolveInvasion(sh) {
  const t = sh.dest, a = sh.owner, b = states[sh.foeId];
  if (!a || !a.alive || W.stateId[t] !== sh.foeId) return;         // цель уже не та
  const defStrength = (b && b.alive ? b.military * 0.35 : 0) + W.pop[t] * 0.4;
  if (sh.army * (0.6 + Math.random() * 0.9) > defStrength) {        // десант успешен — плацдарм + пара соседних клеток
    setOwner(t, a); W.pop[t] *= (1 - CIV.SACK); pushBattle(t, a, b, 'invasion', 14);
    logEvent('war', a.name + ' высадила морской десант' + (b && b.name ? ' против ' + b.name : ''));
    const tx = t % GRID.W, ty = (t / GRID.W) | 0; let g = 0;
    for (const [dx, dy] of NB8) { if (g >= 2) break; const nx = tx + dx, ny = ty + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (W.stateId[ni] === sh.foeId) { setOwner(ni, a); W.pop[ni] *= (1 - CIV.SACK); pushBattle(ni, a, b, 'invasion', 12); g++; } }
  } else { pushBattle(idx(sh.x, sh.y), a, b, 'naval', 12); }   // десант отбит — морской бой
}
function processShips() {
  const ports = listPorts(), frontier = frontierCoasts();
  // спавн судов из прибрежных городов: ТОРГОВЫЕ (к порту) и ИССЛЕДОВАТЕЛИ/КОЛОНИСТЫ (к пустому берегу)
  const SHIP_CAP = 150, PER_STATE = 6;
  if (ships.length < SHIP_CAP) {
    // равномерно по КАРТЕ: счётчик судов на державу, чтобы один регион не выбирал весь лимит (раньше первые державы забивали кап 80 → корабли только в одной части мира)
    const perOwner = {}; for (const s of ships) { if (s.owner) perOwner[s.owner.id] = (perOwner[s.owner.id] || 0) + 1; }
    for (const st of states) {
      if (!st.alive || st.era < 1 || ships.length >= SHIP_CAP) continue;
      if ((perOwner[st.id] || 0) >= PER_STATE) continue;
      st.cells.forEach(i => {
        if (ships.length >= SHIP_CAP || (perOwner[st.id] || 0) >= PER_STATE || !W.isCoast[i] || W.pop[i] < 700) return;
        const fx = i % GRID.W, fy = (i / GRID.W) | 0, si = adjWater(i); if (si < 0) return;
        const roll = Math.random();
        if (roll < 0.25 && ports.length > 1) {                       // ТОРГОВОЕ судно → порт (ближний ИЛИ дальний), НЕ к врагу
          const dest = pickTradeDest(i, st, -1, ports);
          if (dest < 0) return; const path = waterPathTo(si, dest);
          if (path && path.length > 1) { ships.push({ x: si % GRID.W, y: (si / GRID.W) | 0, color: st.color, owner: st, dest, path, pi: 0, trade: true, life: path.length + 100 }); perOwner[st.id] = (perOwner[st.id] || 0) + 1; }
        } else if (roll < 0.32 && W.pop[i] > 3000 && frontier.length) {  // КОЛОНИСТ → ближайший пустующий пригодный берег
          let tgt = -1, bd = 46 * 46;
          for (const fc of frontier) { const dx = fc % GRID.W - fx, dy = (fc / GRID.W | 0) - fy, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; tgt = fc; } }
          if (tgt < 0) return; const path = waterPathTo(si, tgt);
          if (path && path.length > 1) { ships.push({ x: si % GRID.W, y: (si / GRID.W) | 0, color: st.color, owner: st, dest: tgt, path, pi: 0, explore: true, life: path.length + 130 }); perOwner[st.id] = (perOwner[st.id] || 0) + 1; }
        }
      });
    }
  }
  // движение по морскому пути; прибытие = торговля / колония / морское вторжение
  for (let s = ships.length - 1; s >= 0; s--) {
    const sh = ships[s]; sh.life--;
    if (sh.life <= 0 || !sh.path) { ships.splice(s, 1); continue; }
    sh.pi++;
    if (sh.pi >= sh.path.length) {
      if (sh.invade) { resolveInvasion(sh); ships.splice(s, 1); continue; }                          // десант: вторжение/плацдарм
      if (sh.explore) { const t = sh.dest; if (W.stateId[t] < 0 && sh.owner && sh.owner.alive && W.habEff[t] > 0.1) { W.pop[t] += 900; setOwner(t, sh.owner); logEvent('colony', sh.owner.name + ' основала заморскую колонию'); } ships.splice(s, 1); continue; }   // колония
      // ТОРГОВЛЯ: начислить казну и отправить к НОВОМУ порту — судно продолжает рейсы (оживляет море), пока не кончится ресурс (life)
      if (sh.owner && sh.owner.alive) sh.owner.treasury += 3; const dst = stateOf(sh.dest); if (dst && dst.alive) dst.treasury += 2;
      const here = sh.path[sh.path.length - 1];
      const nd = pickTradeDest(here, sh.owner, sh.dest, ports);   // новый рейс: ближний/дальний порт, НЕ к врагу
      const np = (nd >= 0) ? waterPathTo(here, nd) : null;
      if (np && np.length > 1) { sh.path = np; sh.pi = 0; sh.dest = nd; sh.dispU = undefined; continue; }   // новый рейс
      ships.splice(s, 1); continue;
    }
    const cc = sh.path[sh.pi]; sh.x = cc % GRID.W; sh.y = (cc / GRID.W) | 0;
    // МОРСКОЕ СРАЖЕНИЕ: десант проходит мимо вражеского порта — его могут перехватить
    if (sh.invade && sh.owner) {
      const ex = sh.x, ey = sh.y;
      for (const [dx, dy] of NB8) {
        const nx = ex + dx, ny = ey + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny), sid = W.stateId[ni];
        if (sid >= 0 && sid !== sh.owner.id && !W.isWater[ni] && W.isCoast[ni] && W.urban[ni] > 600 && states[sid] && states[sid].alive) {
          if (Math.random() < 0.5) { pushBattle(idx(ex, ey), sh.owner, states[sid], 'naval', 9); if (Math.random() < 0.4) ships.splice(s, 1); }   // бой у берега, флот может быть потоплен
          break;
        }
      }
    }
  }
}
