// core.js — глобальное состояние, константы, генерация мира, статические поля.
// Структура-массивов (SoA) на типизированных массивах: ноль аллокаций в горячем цикле.
'use strict';

// конфиг загрузки из главного меню (размеры/режим) — читается ДО создания массивов, чтобы мир сразу был нужного размера
const _boot = (function () { try { return JSON.parse(sessionStorage.getItem('earthsim.boot') || 'null'); } catch (e) { return null; } })();
const GRID = { W: 80, H: 60, N: 0 };
if (_boot && _boot.w >= 24 && _boot.w <= 220 && _boot.h >= 24 && _boot.h <= 220) { GRID.W = _boot.w | 0; GRID.H = _boot.h | 0; }
GRID.N = GRID.W * GRID.H;
const CELL = 10;                       // логический размер клетки (800/80)
const CANVAS_W = GRID.W * CELL;        // 800
const CANVAS_H = GRID.H * CELL;        // 600

const NB8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const NB4 = [[0,-1],[-1,0],[1,0],[0,1]];

const F32 = () => new Float32Array(GRID.N);
const U8  = () => new Uint8Array(GRID.N);
const U16 = () => new Uint16Array(GRID.N);
const I16 = () => new Int16Array(GRID.N);
const I8  = () => new Int8Array(GRID.N);

// ---- Глобальное состояние мира (общий контракт всех модулей) ----
const W = {
  // статичные / рельеф (пересчёт только при правке земли)
  elev: F32(), isWater: U8(), seaDepth: F32(), isCoast: U8(), slope: F32(),
  distOcean: I16(), basinSide: I8(), riverFlux: F32(), volcanic: F32(),
  windU: F32(), windV: F32(),
  // климат
  baseTemp: F32(), sst: F32(), temp: F32(), tempSmoothed: F32(), precip: F32(), precipSmoothed: F32(), iceAlbedo: U8(),
  tempForce: F32(), tempPulse: F32(), precipMul: F32(),   // форсирование кистей: постоянное/временное тепло, влага
  currentU: F32(), currentV: F32(), stir: F32(),  // течения
  curAddU: F32(), curAddV: F32(),              // ручное направленное течение (кисть)
  windAddU: F32(), windAddV: F32(),            // ручная правка ветра
  upwindWet: F32(),                            // увлажнение по ветру с моря (наветренные берега)
  _pIndex: F32(), _scratch: F32(), _scratch2: F32(),
  // экология
  npp: F32(), veg: F32(), fertility: F32(), biome: U8(), biomeAge: U16(),
  biomeCand: U8(), biomeHold: U16(),           // гистерезис смены биома: кандидат и сколько шагов он держится (гасит сезонное мерцание)
  eco: F32(),                                  // здоровье экосистемы 0..1 (биоразнообразие/чистота)
  // цивилизации
  pop: F32(), capacity: F32(), foodCap: F32(), foodCapS: F32(), urban: F32(), hab: F32(), habEff: F32(),
  rTier: U8(),                                 // отрисованный тип застройки (село/посёлок/город) с гистерезисом — чтобы не мерцал по сезонам
  adapt: F32(),                                // местная адаптация к суровому климату (растёт со временем заселения + tech)
  stateId: I16(), unrest: F32(), devLevel: U8(), disease: F32(),
  pollution: F32(), industry: F32(),           // загрязнение и промышленность (заводы)
  capDirty: U8(),
  // флаги и глобальные
  dirty: { terrain: true, climate: true, base: true, borders: true },
  dayOfYear: 0, seasonPhase: 0,
  co2: 1.0, solar: 1.0, seaLevel: 0.40, globalForce: 0,   // глобальные ползунки климата
  poleCold: 0,                                            // доп. охлаждение полюсов (>0 только для карты «реальная Земля»)
  tiltMul: 1.0, windMul: 1.0, currentMul: 1.0,
  co2ppm: 280, globalEmissions: 0, ecoGlobal: 1,
  paused: false, simYear: 0, simTick: 0,
};
W.stateId.fill(-1);
W.precipMul.fill(1);
W.eco.fill(1);
W.tempSmoothed.fill(15);
W.precipSmoothed.fill(800);
W.rTier.fill(255);   // 255 = тип застройки ещё не определён

// ---- математические помощники ----
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const idx = (x, y) => y * GRID.W + x;
const inB = (x, y) => x >= 0 && x < GRID.W && y >= 0 && y < GRID.H;
// верх (y=0) = +90° (Северный полюс), низ = -90° (Южный)
const latOf = y => 90 * (1 - 2 * y / (GRID.H - 1));

// нормализованная высота суши над уровнем моря (0 у берега .. 1 на пике 5000 м)
function landH(i) {
  if (W.isWater[i]) return 0;
  const s = W.seaLevel;
  return clamp01((W.elev[i] - s) / (1 - s));
}

// билинейная выборка произвольного Float-поля в координатах сетки (gx,gy)
function bilinear(field, gx, gy) {
  if (gx < 0) gx = 0; else if (gx > GRID.W - 1) gx = GRID.W - 1;
  if (gy < 0) gy = 0; else if (gy > GRID.H - 1) gy = GRID.H - 1;
  const x0 = gx | 0, y0 = gy | 0;
  const x1 = x0 < GRID.W - 1 ? x0 + 1 : x0;
  const y1 = y0 < GRID.H - 1 ? y0 + 1 : y0;
  const fx = gx - x0, fy = gy - y0;
  const a = field[y0 * GRID.W + x0], b = field[y0 * GRID.W + x1];
  const c = field[y1 * GRID.W + x0], d = field[y1 * GRID.W + x1];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function markDirty(flag) { W.dirty[flag] = true; }
function markCapDirty(i) { W.capDirty[i] = 1; }

// ---- детерминированный value-noise для генерации рельефа ----
let worldSeed = 1;
function rand2(i, j) {
  let h = (i * 374761393 + j * 668265263 + worldSeed * 362437) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const aa = rand2(xi, yi), ba = rand2(xi + 1, yi);
  const ab = rand2(xi, yi + 1), bb = rand2(xi + 1, yi + 1);
  return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
}
function fbm(x, y, oct = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * freq, y * freq); norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm;
}

// ---- сброс одной клетки к «океану» по умолчанию ----
function makeCell(i) {
  W.elev[i] = 0.20; W.isWater[i] = 1; W.seaDepth[i] = 2000; W.isCoast[i] = 0;
  W.slope[i] = 0; W.distOcean[i] = 0; W.basinSide[i] = 0; W.riverFlux[i] = 0; W.volcanic[i] = 0;
  W.baseTemp[i] = 15; W.sst[i] = 15; W.temp[i] = 15; W.precip[i] = 1000; W.iceAlbedo[i] = 0;
  W.tempForce[i] = 0; W.tempPulse[i] = 0; W.precipMul[i] = 1; W.currentU[i] = 0; W.currentV[i] = 0; W.stir[i] = 0; W.curAddU[i] = 0; W.curAddV[i] = 0; W.windAddU[i] = 0; W.windAddV[i] = 0; W.upwindWet[i] = 0.5; W.habEff[i] = 0;
  W.npp[i] = 0; W.veg[i] = 0; W.fertility[i] = 0; W.biome[i] = 0; W.biomeAge[i] = 0; W.eco[i] = 1;
  W.pop[i] = 0; W.capacity[i] = 0; W.foodCap[i] = 0; W.urban[i] = 0; W.hab[i] = 0; W.adapt[i] = 0;
  W.stateId[i] = -1; W.unrest[i] = 0; W.devLevel[i] = 0; W.disease[i] = 0; W.pollution[i] = 0; W.industry[i] = 0;
}

// ---- «Реальная Земля»: материки по широте/долготе (эллипсы) + хребты + плато ----
// x=0 → ~180°з.д. (середина Тихого), центр карты ≈ Африка/Атлантика; y по широте (latOf)
function genEarth() {
  const Wd = GRID.W, Hd = GRID.H;
  const lonOf = x => -180 + (x + 0.5) / Wd * 360;

  // --- маска суши Земли (84×44): сегменты [c0,c1] столбцов-суши по строкам-широтам ---
  // строка r → широта 90−(r+0.5)·4.09 ; столбец c → долгота −180+(c+0.5)·4.286 (левый край ≈ 180°з.д., центр карты ≈ Африка)
  const EW = 84, EH = 44;
  const SEG = [
    [], [], [[24, 27], [31, 37]], [[14, 27], [29, 38], [52, 67]], [[5, 8], [10, 27], [29, 38], [43, 83]],
    [[4, 8], [9, 26], [29, 38], [43, 83]], [[3, 19], [25, 28], [31, 33], [43, 83]], [[4, 9], [11, 19], [24, 29], [39, 40], [43, 83]],
    [[12, 20], [24, 28], [39, 41], [42, 83]], [[12, 29], [38, 73], [78, 83]], [[13, 26], [40, 73]], [[14, 25], [39, 72], [73, 75]],
    [[14, 25], [39, 41], [44, 69], [71, 75]], [[15, 23], [39, 44], [50, 69], [72, 74]], [[16, 22], [40, 55], [57, 60], [64, 69]],
    [[16, 19], [22, 22], [38, 48], [50, 54], [57, 62], [64, 68]], [[17, 19], [22, 23], [38, 48], [50, 54], [58, 62], [63, 68]],
    [[19, 20], [38, 52], [58, 60], [65, 67], [70, 71]], [[20, 22], [25, 27], [38, 53], [59, 60], [65, 67], [70, 71]],
    [[21, 29], [39, 53], [65, 67], [70, 71]], [[23, 30], [40, 52], [65, 68]], [[24, 30], [41, 52], [64, 68]],
    [[25, 30], [44, 52], [65, 69], [73, 76]], [[25, 31], [44, 51], [66, 69], [73, 76]], [[25, 32], [45, 51], [67, 68], [72, 76]],
    [[26, 33], [45, 50], [52, 53], [71, 75]], [[26, 33], [45, 50], [52, 53], [69, 76]], [[25, 30], [45, 49], [52, 53], [68, 77]],
    [[25, 29], [45, 49], [68, 77]], [[25, 28], [45, 48], [69, 77]], [[24, 27], [46, 47], [69, 76], [80, 82]],
    [[24, 26], [75, 76], [80, 82]], [[24, 26], [75, 76], [80, 81]], [[24, 25], [80, 80]], [[24, 25]], [],
    [[26, 28]], [[0, 20], [24, 83]], [[0, 83]], [[0, 83]], [[0, 83]], [[0, 83]], [[0, 83]], [[0, 83]],
  ];
  const mask = new Uint8Array(EW * EH);
  for (let r = 0; r < EH; r++) { const segs = SEG[r] || []; for (const s of segs) for (let c = s[0]; c <= s[1]; c++) mask[r * EW + c] = 1; }
  const at = (lon, lat) => {                            // 1 = суша в точке (долгота заворачивается по краю)
    let c = Math.floor((lon + 180) / 360 * EW); c = ((c % EW) + EW) % EW;
    let r = Math.floor((90 - lat) / 180 * EH); if (r < 0) r = 0; else if (r >= EH) r = EH - 1;
    return mask[r * EW + c];
  };
  const nearLand = (lon, lat) => { for (let dl = -4; dl <= 4; dl += 4) for (let db = -4; db <= 4; db += 4) if (at(lon + dl, lat + db)) return true; return false; };
  // плато (поднятия) [долгота, широта, радиус_дол°, радиус_шир°, +высота]
  const PLATEAUS = [
    [88, 33, 12, 6, 0.26], [50, 36, 12, 5, 0.12], [39, 9, 5, 6, 0.16], [35, -3, 5, 8, 0.10], [-67, -20, 4, 8, 0.20],
    [-103, 22, 7, 6, 0.10], [-42, 73, 9, 7, 0.12], [-45, -15, 8, 8, 0.06], [25, -25, 9, 9, 0.07], [77, 18, 6, 6, 0.06],
  ];
  // горные хребты [точки [долгота,широта]..], ширина°, +высота
  const RANGES = [
    { p: [[-72, 8], [-74, -3], [-71, -16], [-70, -28], [-72, -38], [-73, -48]], w: 3.5, h: 0.30 }, // Анды
    { p: [[-122, 60], [-118, 52], [-114, 44], [-109, 38], [-106, 33]], w: 4, h: 0.22 },             // Скалистые
    { p: [[-123, 47], [-121, 40], [-117, 34]], w: 2.5, h: 0.16 },                                   // Сьерра/Каскады
    { p: [[-82, 34], [-78, 39], [-72, 44]], w: 2.5, h: 0.10 },                                       // Аппалачи
    { p: [[71, 36], [78, 34], [85, 30], [92, 28], [96, 29]], w: 3.5, h: 0.36 },                       // Гималаи
    { p: [[68, 40], [76, 42], [84, 43]], w: 3, h: 0.22 },                                             // Тянь-Шань/Памир
    { p: [[5, 46], [10, 47], [15, 47]], w: 2, h: 0.16 },                                              // Альпы
    { p: [[41, 43], [45, 42], [48, 41]], w: 1.8, h: 0.18 },                                           // Кавказ
    { p: [[60, 66], [60, 58], [59, 52]], w: 1.8, h: 0.12 },                                           // Урал
    { p: [[46, 35], [51, 31], [55, 28]], w: 2.5, h: 0.18 },                                           // Загрос
    { p: [[-7, 31], [-1, 32], [6, 34], [10, 35]], w: 2, h: 0.14 },                                    // Атлас
    { p: [[7, 60], [12, 64], [18, 68]], w: 2, h: 0.14 },                                              // Скандинавские
    { p: [[146, -22], [148, -30], [149, -37]], w: 2, h: 0.12 },                                       // Б. Водораздельный
    { p: [[27, -30], [29, -29], [31, -27]], w: 2, h: 0.12 },                                          // Драконовы
  ];

  const segDist = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    const c1 = vx * wx + vy * wy; if (c1 <= 0) return Math.hypot(px - ax, py - ay);
    const c2 = vx * vx + vy * vy; if (c2 <= c1) return Math.hypot(px - bx, py - by);
    const t = c1 / c2; return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  };
  const rangeDist = (lon, lat, pts) => { let md = 1e9; for (let i = 0; i < pts.length - 1; i++) md = Math.min(md, segDist(lon, lat, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return md; };
  // (суша/океан определяются маской at(); горы/плато накладываются ниже)

  for (let y = 0; y < Hd; y++) {
    const lat = latOf(y);
    for (let x = 0; x < Wd; x++) {
      const lon = lonOf(x);
      // рваность берегов — доменное искажение шумом
      const wlon = lon + (fbm(lat * 0.35 + 10, lon * 0.35, 3) - 0.5) * 4;
      const wlat = lat + (fbm(lon * 0.35 + 40, lat * 0.35, 3) - 0.5) * 3;
      let e;
      if (at(wlon, wlat)) {                             // СУША
        e = 0.45 + (fbm(lon * 0.06 + 5, lat * 0.06 + 5, 3) - 0.5) * 0.05;
        for (const pl of PLATEAUS) {
          let dlon = lon - pl[0]; if (dlon > 180) dlon -= 360; else if (dlon < -180) dlon += 360;
          const t = 1 - (dlon / pl[2]) ** 2 - ((lat - pl[1]) / pl[3]) ** 2;
          if (t > 0) e += pl[4] * Math.min(1, t) * 0.9;
        }
        for (const r of RANGES) { const d = rangeDist(lon, lat, r.p); if (d < r.w) { const k = 1 - d / r.w; e += k * k * r.h; } }
        if (lat < -64) e += clamp01((-64 - lat) / 22) * 0.20;   // ледяной купол Антарктиды (выше → холоднее → стабильный лёд)
      } else {                                          // ОКЕАН (шельф у берега → глубже вдали)
        e = nearLand(wlon, wlat) ? 0.37 : 0.31;
      }
      W.elev[idx(x, y)] = clamp01(e);
    }
  }
  W.seaLevel = 0.40;
  W.poleCold = 15;                                    // реальная Земля холоднее у полюсов → тайга/тундра/льды, как на Земле
}

// разогон климата + старт сглаженных полей (по ним классифицируются БИОМЫ)
function _settleSmoothed(spin) {
  if ((W.poleCold || 0) > 0) {                       // «реальная Земля»: усредняем за ГОД → биомы по среднегодовому климату (без сезонного перекоса)
    for (let k = 0; k < spin; k++) climateStep();
    const tA = new Float32Array(GRID.N), pA = new Float32Array(GRID.N), YR = 56;
    for (let k = 0; k < YR; k++) { climateStep(); for (let i = 0; i < GRID.N; i++) { tA[i] += W.temp[i]; pA[i] += W.precip[i]; } }
    const inv = 1 / YR; for (let i = 0; i < GRID.N; i++) { W.tempSmoothed[i] = tA[i] * inv; W.precipSmoothed[i] = pA[i] * inv; }
    W.dayOfYear = 80; W.seasonPhase = Math.sin(2 * Math.PI * W.dayOfYear / 360);
  } else {                                            // обычные карты: прежнее поведение (моментальный снимок поля)
    for (let k = 0; k < spin; k++) climateStep();
    W.tempSmoothed.set(W.temp); W.precipSmoothed.set(W.precip);
  }
}

// ---- генерация мира: плиты-лайт + фрактальный шум + хребты + реки ----
function worldgen(type) {
  worldSeed = (Math.random() * 1e9) | 0;
  W.poleCold = 0;                                    // сброс (genEarth включит для «реальной Земли»)
  const Wd = GRID.W, Hd = GRID.H;

  if (type === 'empty' || type === 'flat') {           // ПУСТАЯ карта: без генерации рельефа (игрок лепит сам)
    W.seaLevel = 0.4;
    const lvl = (type === 'flat') ? 0.47 : 0.34;       // flat = ровная мелкая суша; empty = почти весь океан
    for (let i = 0; i < GRID.N; i++) W.elev[i] = lvl;
  } else if (type === 'earth') {                       // РЕАЛЬНАЯ ЗЕМЛЯ: материки/рельеф по широте-долготе
    genEarth();
  } else {

  let seeds = [];
  let target, noiseAmp, seedR;
  if (type === 'pangea') {
    target = 0.46; noiseAmp = 0.55; seedR = 26;
    seeds.push({ x: Wd * 0.5, y: Hd * 0.5, r: seedR, s: 1.0 });
    seeds.push({ x: Wd * 0.38, y: Hd * 0.42, r: 16, s: 0.6 });
    seeds.push({ x: Wd * 0.62, y: Hd * 0.6, r: 16, s: 0.6 });
  } else if (type === 'islands') {
    target = 0.20; noiseAmp = 0.75; seedR = 6;
    const n = 11 + (Math.random() * 4 | 0);
    for (let k = 0; k < n; k++) seeds.push({ x: Math.random() * Wd, y: (0.15 + Math.random() * 0.7) * Hd, r: 4 + Math.random() * 5, s: 0.7 + Math.random() * 0.4 });
  } else { // continents
    target = 0.40; noiseAmp = 0.6; seedR = 15;
    const n = 4 + (Math.random() * 3 | 0);
    for (let k = 0; k < n; k++) seeds.push({ x: Math.random() * Wd, y: (0.18 + Math.random() * 0.64) * Hd, r: 11 + Math.random() * 8, s: 0.7 + Math.random() * 0.5 });
  }

  // 1. высотное поле: сумма гауссиан от плит + fbm
  const noff = Math.random() * 1000;
  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const i = idx(x, y);
      let h = 0;
      for (const s of seeds) {
        const dx = x - s.x, dy = (y - s.y) * 1.15;
        const d2 = (dx * dx + dy * dy) / (s.r * s.r);
        h += s.s * Math.exp(-d2);
      }
      const n = fbm((x + noff) * 0.09, (y + noff) * 0.09, 4);
      h = h * 0.7 + (n - 0.5) * noiseAmp + 0.18;
      // мягкое затухание у полюсов и краёв карты, чтобы суша не липла к рамке
      const edge = Math.min(x, Wd - 1 - x, y * 1.4, (Hd - 1 - y) * 1.4) / 8;
      h *= smoothstep(edge);
      W.elev[i] = h;
    }
  }

  // 2. нормализация в 0..1 и подбор уровня моря под целевую долю суши
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < GRID.N; i++) { const e = W.elev[i]; if (e < mn) mn = e; if (e > mx) mx = e; }
  const span = (mx - mn) || 1;
  for (let i = 0; i < GRID.N; i++) W.elev[i] = (W.elev[i] - mn) / span;
  W.seaLevel = percentile(W.elev, 1 - target);

  // 3. горные хребты вдоль границ плит (там, где две плиты сопоставимы)
  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const i = idx(x, y);
      if (W.elev[i] < W.seaLevel) continue;
      let b1 = 0, b2 = 0;
      for (const s of seeds) {
        const dx = x - s.x, dy = (y - s.y) * 1.15;
        const v = s.s * Math.exp(-(dx * dx + dy * dy) / (s.r * s.r));
        if (v > b1) { b2 = b1; b1 = v; } else if (v > b2) b2 = v;
      }
      const ridge = b2 / (b1 + 1e-6);           // ~1 на стыке плит
      if (ridge > 0.55) {
        const lift = (ridge - 0.55) / 0.45 * 0.4 * (0.6 + fbm(x * 0.3, y * 0.3, 2));
        W.elev[i] = Math.min(1, W.elev[i] + lift);
      }
    }
  }

  // 3b. гипсометрия: большая часть суши — низменности, горы редки (степенная кривая)
  for (let i = 0; i < GRID.N; i++) {
    if (W.elev[i] <= W.seaLevel) continue;
    const lh = (W.elev[i] - W.seaLevel) / (1 - W.seaLevel);
    W.elev[i] = W.seaLevel + Math.pow(clamp01(lh), 2.3) * (1 - W.seaLevel);
  }
  }   // ← конец генерации рельефа (для 'empty'/'flat' пропускается)

  // 4. базовые статические поля (вода, берег, склон, расстояние до океана, ветра, бассейны)
  recomputeStatic();

  // 5. реки-лайт: спуск по градиенту от локальных максимумов суши
  carveRivers();

  // 6. инициализация климата/экологии до равновесия, население — ноль
  W.dayOfYear = 80; W.seasonPhase = Math.sin(2 * Math.PI * W.dayOfYear / 360);
  for (let i = 0; i < GRID.N; i++) {
    W.pop[i] = 0; W.urban[i] = 0; W.foodCap[i] = 0; W.stateId[i] = -1; W.unrest[i] = 0; W.adapt[i] = 0;
    W.devLevel[i] = 0; W.disease[i] = 0; W.capacity[i] = 0; W.hab[i] = 0; W.veg[i] = 0;
    W.tempForce[i] = 0; W.tempPulse[i] = 0; W.precipMul[i] = 1; W.eco[i] = 1; W.pollution[i] = 0; W.industry[i] = 0; W.stir[i] = 0; W.curAddU[i] = 0; W.curAddV[i] = 0; W.windAddU[i] = 0; W.windAddV[i] = 0;
  }
  W.co2 = 1.0; W.co2ppm = 280; W.globalEmissions = 0; W.ecoGlobal = 1;
  if (typeof states !== 'undefined') { states.length = 0; ships.length = 0; if (typeof battles !== 'undefined') battles.length = 0; selectedState = null; highlightedState = null; }
  if (typeof worldEvents !== 'undefined') { worldEvents.length = 0; logEvent('dawn', 'Сотворён новый мир'); }
  // сидируем температуру по широте (и сушу, и океан), чтобы поле стартовало у равновесия
  for (let y = 0; y < GRID.H; y++) {
    const ins0 = insolation(latOf(y), 0);
    const tl = (CLIM.T_pole + (CLIM.T_equator - CLIM.T_pole) * ins0) * W.solar - (W.poleCold || 0) * (1 - ins0);
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      const t = W.isWater[i] ? tl : tl - CLIM.lapseK * landH(i);
      W.temp[i] = t; W.sst[i] = tl;
    }
  }
  _settleSmoothed(8);                               // старт сглаженных полей (биомы — по ним; для Земли — среднегодовые)
  for (let i = 0; i < GRID.N; i++) W.npp[i] = computeNPP(W.temp[i], W.precip[i]);
  for (let i = 0; i < GRID.N; i++) { const b = classifyBiome(i); W.biome[i] = b; W.biomeCand[i] = b; W.biomeHold[i] = 0; }  // прямой посев биомов (без гистерезиса) — мир сразу с биомами
  ecologyStep();                                   // даёт npp + классификацию биомов
  for (let i = 0; i < GRID.N; i++) { W.veg[i] = W.npp[i]; W.capDirty[i] = 1; }  // старт в равновесии
  ecologyStep();
  if (typeof refreshCapacities === 'function') refreshCapacities();  // hab/ёмкость готовы сразу (кисть «Люди» на паузе)
  W.simYear = 0;
  markDirty('base'); markDirty('borders');
}

function percentile(arr, p) {
  const c = Float32Array.from(arr); c.sort();
  return c[clamp((p * c.length) | 0, 0, c.length - 1)];
}

// реки: трассируем спуск воды, накапливаем поток
function carveRivers() {
  W.riverFlux.fill(0);
  const order = [];
  for (let i = 0; i < GRID.N; i++) if (!W.isWater[i]) order.push(i);
  order.sort((a, b) => W.elev[b] - W.elev[a]);   // от высоких к низким
  const flux = W.riverFlux;
  for (const i of order) {
    flux[i] += 1;
    const x = i % GRID.W, y = (i / GRID.W) | 0;
    let bestI = -1, bestE = W.elev[i];
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (W.elev[ni] < bestE) { bestE = W.elev[ni]; bestI = ni; }
    }
    if (bestI >= 0 && !W.isWater[bestI]) flux[bestI] += flux[i];
  }
  let fmax = 1;
  for (let i = 0; i < GRID.N; i++) if (flux[i] > fmax) fmax = flux[i];
  const norm = 1 / Math.sqrt(fmax);
  for (let i = 0; i < GRID.N; i++) flux[i] = W.isWater[i] ? 0 : clamp01(Math.sqrt(flux[i]) * norm * 1.4 - 0.15);
}

// ---- статические поля (после любой правки рельефа) ----
// skipCurrents=true — пропустить дорогой пересчёт течений (для живого рисования)
function recomputeStatic(skipCurrents) {
  const { W: Wd, H: Hd } = GRID;
  // вода / глубина
  for (let i = 0; i < GRID.N; i++) {
    if (W.elev[i] < W.seaLevel) {
      W.isWater[i] = 1;
      W.seaDepth[i] = (W.seaLevel - W.elev[i]) / (W.seaLevel || 1) * 4000;
    } else { W.isWater[i] = 0; W.seaDepth[i] = 0; }
  }
  // берег
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y); let coast = 0;
    for (const [dx, dy] of NB4) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
      if (W.isWater[idx(nx, ny)] !== W.isWater[i]) { coast = 1; break; }
    }
    W.isCoast[i] = (coast && (W.isWater[i] === 0 || W.seaDepth[i] < 600)) ? 1 : 0;
  }
  // склон
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    const l = W.elev[idx(Math.max(0, x - 1), y)], r = W.elev[idx(Math.min(Wd - 1, x + 1), y)];
    const u = W.elev[idx(x, Math.max(0, y - 1))], d = W.elev[idx(x, Math.min(Hd - 1, y + 1))];
    W.slope[i] = clamp01(Math.hypot(r - l, d - u) * 3.0);
  }
  // расстояние до океана (многоисточниковый BFS, 8-связность ≈ Чебышёв)
  computeDistOcean();
  // бассейны океанских течений
  computeBasins();
  // ветра по широтным поясам
  if (typeof recomputeWinds === 'function') recomputeWinds();
  // поверхностные течения (дорого — пропускаем при живом рисовании)
  if (!skipCurrents) computeCurrents();
  computeUpwindMoisture();        // увлажнение наветренных берегов (зависит от ветра)
  markDirty('base');
}

function computeDistOcean() {
  const d = W.distOcean; d.fill(30);
  let queue = [];
  for (let i = 0; i < GRID.N; i++) if (W.isWater[i]) { d[i] = 0; queue.push(i); }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]; const x = i % GRID.W, y = (i / GRID.W) | 0; const nd = d[i] + 1;
    if (nd > 30) continue;
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (nd < d[ni]) { d[ni] = nd; queue.push(ni); }
    }
  }
}

function computeBasins() {
  // +1 «тёплое» (западная граница бассейна), -1 «холодное» (восточная), 0 — суша
  for (let y = 0; y < GRID.H; y++) {
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      if (!W.isWater[i]) { W.basinSide[i] = 0; continue; }
      let dw = 99, de = 99;
      for (let k = 1; k <= 20; k++) { if (x - k < 0) { dw = k; break; } if (!W.isWater[idx(x - k, y)]) { dw = k; break; } }
      for (let k = 1; k <= 20; k++) { if (x + k >= GRID.W) { de = k; break; } if (!W.isWater[idx(x + k, y)]) { de = k; break; } }
      W.basinSide[i] = dw < de ? 1 : de < dw ? -1 : 0;  // суша ближе к западу => зап. граница => тёплое течение
    }
  }
}

// ---- течения: баротропная модель Стоммела (функция тока) ----
// Решаем ε∇²ψ + ∂ψ/∂x = −(curl ветра + ручное закручивание), ψ=0 на суше.
// Скорость = (−∂ψ/∂y, ∂ψ/∂x) → поток БЕЗДИВЕРГЕНТЕН и КАСАТЕЛЕН к берегам:
// возникают круговороты, западные пограничные течения, обтекание материков.
const CUR = { windGain: 1.0, stirGain: 1.0, eps: 2.2, omega: 1.7, iters: 600, peak: 1.5, sign: -1 };
const _psi = new Float32Array(GRID.N);
const _curlF = new Float32Array(GRID.N);

function computeCurrents() {
  const Wd = GRID.W, Hd = GRID.H;
  // 1. форсирование: ротор ветрового напряжения + ручное вихревое поле W.stir
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    if (!W.isWater[i]) { _curlF[i] = 0; continue; }
    const xe = x < Wd - 1 ? x + 1 : x, xw = x > 0 ? x - 1 : x;
    const yn = y > 0 ? y - 1 : y, ys = y < Hd - 1 ? y + 1 : y;
    const dVdx = (W.windV[idx(xe, y)] - W.windV[idx(xw, y)]) * 0.5;
    const dUdy = (W.windU[idx(x, ys)] - W.windU[idx(x, yn)]) * 0.5;
    _curlF[i] = CUR.sign * ((dVdx - dUdy) * CUR.windGain + W.stir[i] * CUR.stirGain);
  }
  // 2. SOR-релаксация функции тока (ψ=0 на суше — жёсткая граница)
  for (let i = 0; i < GRID.N; i++) if (!W.isWater[i]) _psi[i] = 0;
  const eps = CUR.eps, inv = 1 / (4 * eps), om = CUR.omega;
  for (let it = 0; it < CUR.iters; it++) {
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
      const i = idx(x, y); if (!W.isWater[i]) continue;
      const pe = (x < Wd - 1 && W.isWater[i + 1]) ? _psi[i + 1] : 0;
      const pw = (x > 0 && W.isWater[i - 1]) ? _psi[i - 1] : 0;
      const pn = (y > 0 && W.isWater[i - Wd]) ? _psi[i - Wd] : 0;
      const ps = (y < Hd - 1 && W.isWater[i + Wd]) ? _psi[i + Wd] : 0;
      const np = (eps * (pe + pw + pn + ps) + 0.5 * (pe - pw) + _curlF[i]) * inv;
      _psi[i] += om * (np - _psi[i]);
    }
  }
  // 3. скорость = ротор функции тока; заодно ищем максимум для нормировки
  let maxs = 1e-6;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    if (!W.isWater[i]) { W.currentU[i] = 0; W.currentV[i] = 0; continue; }
    const pe = (x < Wd - 1 && W.isWater[i + 1]) ? _psi[i + 1] : 0;
    const pw = (x > 0 && W.isWater[i - 1]) ? _psi[i - 1] : 0;
    const pn = (y > 0 && W.isWater[i - Wd]) ? _psi[i - Wd] : 0;
    const ps = (y < Hd - 1 && W.isWater[i + Wd]) ? _psi[i + Wd] : 0;
    const u = -(ps - pn) * 0.5, v = (pe - pw) * 0.5;
    W.currentU[i] = u; W.currentV[i] = v;
    const sp = u * u + v * v; if (sp > maxs) maxs = sp;
  }
  // 4. нормировка амплитуды + ручное направленное течение (кисть «Течение»)
  const k = CUR.peak * W.currentMul / Math.sqrt(maxs);
  for (let i = 0; i < GRID.N; i++) if (W.isWater[i]) { W.currentU[i] = W.currentU[i] * k + W.curAddU[i]; W.currentV[i] = W.currentV[i] * k + W.curAddV[i]; }
}

// увлажнение по ветру: марш против ветра до океана — наветренные берега мокрые, заветренные сухие
function computeUpwindMoisture() {
  const Wd = GRID.W, Hd = GRID.H;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    if (W.isWater[i]) { W.upwindWet[i] = 1; continue; }
    let px = x + 0.5, py = y + 0.5, steps = 30;
    for (let s = 1; s <= 16; s++) {
      px -= W.windU[i]; py -= W.windV[i];          // против ветра
      const cx = Math.round(px), cy = Math.round(py);
      if (cx < 0 || cx >= Wd || cy < 0 || cy >= Hd) { steps = s; break; }
      if (W.isWater[idx(cx, cy)]) { steps = s; break; }
    }
    W.upwindWet[i] = Math.exp(-steps / 6);          // близкий апвинд-океан => влажно
  }
}
