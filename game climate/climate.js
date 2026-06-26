// climate.js — реалистичная климатическая модель.
// Инсоляция → широтная температура+сезоны → лапс-рейт → континентальность →
// океанские течения → парниковый/альбедо-фидбэк → адвекция влаги и осадки.
'use strict';

const CLIM = {
  T_equator: 30, T_pole: -25, fatten: 1.25,
  latTiltDeg: 12, seasonAmpMax: 22,
  lapseK: 32.5,               // 6.5°C/1000м × 5000м
  continSat: 8, maritime: 0.9, continSwing: 0.9,     // влияние океана/течений достаёт ДАЛЬШЕ вглубь суши (≈8 клеток) и сильнее
  oceanInertia: 0.09, landRelax: 0.5,    // быстрее подходит к равновесию — изменения видны сразу
  oceanSeason: 0.25,                     // океан почти не следует за сезоном (большая теплоёмкость) → тёплое течение остаётся тёплым зимой
  diffLand: 0.21, diffWater: 0.28,       // теплопроводность ВЫШЕ — тепло течений/ветра быстрее растекается на сушу
  advectSST: 0.82, forceDecay: 0.975,    // течения сильнее и дальше переносят тепло
  windHeat: 0.38,                        // адвекция тепла ветром СИЛЬНЕЕ — прев. ветер заметно несёт тепло/холод по суше
  gyre: 8,
  oroMul: 9, convLatDeg: 9, precipScale: 2200, precipBase: 60,
  co2Sens: 8, iceThresh: -2, meltThresh: 2, iceCool: 6,   // лёд отражает свет → охлаждение (обратная связь альбедо)
};

// инсоляция по широте с учётом сезонного наклона оси (0..1)
function insolation(lat, phase) {
  const latEff = lat - CLIM.latTiltDeg * W.tiltMul * phase;
  const c = (Math.cos(latEff * Math.PI / 180) + 1) / 2;
  return Math.pow(clamp01(c), CLIM.fatten);
}

// ветра: широтные пояса (пассаты/западные/полярные) + влияние рельефа (огибание гор)
function recomputeWinds() {
  const Wd = GRID.W, Hd = GRID.H;
  // 1. зональная основа
  for (let y = 0; y < Hd; y++) {
    const lat = latOf(y), a = Math.abs(lat), hemi = lat >= 0 ? 1 : -1;
    let u, v;
    if (a < 30) { u = -0.7; v = 0.30 * hemi; }
    else if (a < 60) { u = 0.9; v = -0.30 * hemi; }
    else { u = -0.6; v = 0.25 * hemi; }
    if (a > 26 && a < 34) { const t = (a - 26) / 8; u = lerp(-0.7, 0.9, t); v = lerp(0.30, -0.30, t) * hemi; }
    if (a > 56 && a < 64) { const t = (a - 56) / 8; u = lerp(0.9, -0.6, t); v = lerp(-0.30, 0.25, t) * hemi; }
    for (let x = 0; x < Wd; x++) { const i = idx(x, y); W.windU[i] = u; W.windV[i] = v; }
  }
  // 2. рельеф: горы тормозят ветер и отклоняют его (поток огибает возвышенности)
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y); if (W.isWater[i]) continue;
    const lh = landH(i); if (lh < 0.08) continue;
    const gx = (landH(idx(Math.min(Wd - 1, x + 1), y)) - landH(idx(Math.max(0, x - 1), y))) * 0.5;
    const gy = (landH(idx(x, Math.min(Hd - 1, y + 1))) - landH(idx(x, Math.max(0, y - 1)))) * 0.5;
    let u = W.windU[i], v = W.windV[i];
    const into = u * gx + v * gy;                       // компонента «в гору»
    if (into > 0) { const d = into * 5; u -= gx * d; v -= gy * d; }   // отклоняем вдоль склона
    const slow = 1 - lh * 0.55;                          // торможение над горами
    W.windU[i] = u * slow; W.windV[i] = v * slow;
  }
  // 3. глобальная скорость ветра + ручные добавки (кисть «Ветер»)
  for (let i = 0; i < GRID.N; i++) { W.windU[i] = W.windU[i] * W.windMul + W.windAddU[i]; W.windV[i] = W.windV[i] * W.windMul + W.windAddV[i]; }
}

// морское влияние: температура океана (несёт тепло течений) распространяется на сушу,
// горы её блокируют. Всё в «приведённом к уровню моря» виде, лапс-рейт применяется отдельно.
const _oceanInf = new Float32Array(GRID.N);
const _oiTmp = new Float32Array(GRID.N);
function computeOceanInfluence() {
  const Wd = GRID.W, Hd = GRID.H;
  for (let i = 0; i < GRID.N; i++) _oceanInf[i] = W.isWater[i] ? W.temp[i] : W.temp[i] + CLIM.lapseK * landH(i);
  for (let it = 0; it < 8; it++) {
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
      const i = idx(x, y);
      if (W.isWater[i]) { _oiTmp[i] = _oceanInf[i]; continue; }   // океан — фиксированный источник
      let s = 0, n = 0;
      if (x > 0) { s += _oceanInf[i - 1]; n++; } if (x < Wd - 1) { s += _oceanInf[i + 1]; n++; }
      if (y > 0) { s += _oceanInf[i - Wd]; n++; } if (y < Hd - 1) { s += _oceanInf[i + Wd]; n++; }
      const k = 0.5 * (1 - clamp01(landH(i) * 1.3));     // горы блокируют морской воздух
      _oiTmp[i] = _oceanInf[i] + (s / n - _oceanInf[i]) * k;
    }
    _oceanInf.set(_oiTmp);
  }
}

// предрасчёт по строкам (зависит только от широты и сезона)
const _tLatRow = new Float32Array(GRID.H);   // годовое среднее (без сезона)
const _tInsRow = new Float32Array(GRID.H);   // с сезоном
function climateRows() {
  const phase = W.seasonPhase;
  for (let y = 0; y < GRID.H; y++) {
    const lat = latOf(y);
    const ins = insolation(lat, phase);
    const insMean = insolation(lat, 0);
    const tLat = (CLIM.T_pole + (CLIM.T_equator - CLIM.T_pole) * insMean) * W.solar;
    const seasonAmp = CLIM.seasonAmpMax * W.tiltMul * (Math.abs(lat) / 90);
    const hemi = lat >= 0 ? 1 : -1;
    const cold = (W.poleCold || 0) * (1 - insMean);   // доп. охлаждение высоких широт («реальная Земля»; 0 для прочих карт)
    _tLatRow[y] = tLat - cold;
    _tInsRow[y] = (CLIM.T_pole + (CLIM.T_equator - CLIM.T_pole) * ins) * W.solar + seasonAmp * phase * hemi - cold;
  }
}

// одношаговая диффузия поля (растекание тепла); land/water — разный коэффициент
function diffuseField(f, tmp, kLand, kWater) {
  const Wd = GRID.W, Hd = GRID.H;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    let s = 0, n = 0;
    if (x > 0) { s += f[i - 1]; n++; } if (x < Wd - 1) { s += f[i + 1]; n++; }
    if (y > 0) { s += f[i - Wd]; n++; } if (y < Hd - 1) { s += f[i + Wd]; n++; }
    const k = W.isWater[i] ? kWater : kLand;
    tmp[i] = f[i] + (s / n - f[i]) * k;
  }
  f.set(tmp);
}

// полу-лагранжева адвекция поля по течениям (только вода) — аномалии «плывут» по потоку
function advectWater(f, tmp, amount) {
  const Wd = GRID.W, Hd = GRID.H;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    if (!W.isWater[i]) { tmp[i] = f[i]; continue; }
    const ux = x - W.currentU[i], uy = y - W.currentV[i];   // апстрим
    // не подмешиваем температуру суши в океан: адвекция только вдоль воды
    const nux = clamp(Math.round(ux), 0, GRID.W - 1), nuy = clamp(Math.round(uy), 0, GRID.H - 1);
    if (!W.isWater[idx(nux, nuy)]) { tmp[i] = f[i]; continue; }
    tmp[i] = lerp(f[i], bilinear(f, ux, uy), amount);
  }
  f.set(tmp);
}

// адвекция поля по полю ветра (всей сетки). landOnly=true — менять только сушу,
// но ВЫБОРКА upstream может быть с моря → морской воздух заносится ветром вглубь.
function advectByWind(f, tmp, amount, landOnly) {
  const Wd = GRID.W, Hd = GRID.H;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = idx(x, y);
    if (landOnly && W.isWater[i]) { tmp[i] = f[i]; continue; }
    tmp[i] = lerp(f[i], bilinear(f, x - W.windU[i], y - W.windV[i]), amount);
  }
  f.set(tmp);
}

function climateStep() {
  // 1. время года
  W.dayOfYear = (W.dayOfYear + 6) % 360;
  W.seasonPhase = Math.sin(2 * Math.PI * W.dayOfYear / 360);
  W.simYear += 6 / 360;
  climateRows();

  const co2dT = (W.co2 - 1) * CLIM.co2Sens;
  const gForce = W.globalForce;
  const tgt = W._scratch, tmp = W._scratch2;
  computeOceanInfluence();                              // тепло течений → побережья

  // 2. целевая температура (равновесие климата) — в буфер tgt
  for (let y = 0; y < GRID.H; y++) {
    const lat = latOf(y), a = Math.abs(lat);
    const tIns = _tInsRow[y], tLat = _tLatRow[y];
    const seasonRaw = tIns - tLat;
    const green = co2dT * (1 + 0.5 * a / 90);          // парниковый эффект, сильнее к полюсам
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      const force = W.tempForce[i] + W.tempPulse[i] + gForce;   // постоянный + временный источник + глобальный
      if (W.isWater[i]) {
        const cur = W.basinSide[i] * CLIM.gyre * Math.sin(a * Math.PI / 90);
        // океан почти не следует за сезоном: цель = годовое среднее + слабая сезонная добавка.
        // → тёплое течение (адвекция тёплой воды/источник тепла) остаётся тёплым и зимой.
        tgt[i] = tLat + seasonRaw * CLIM.oceanSeason + cur + green + force;
      } else {
        const lh = landH(i);
        let t = tIns - CLIM.lapseK * lh;
        const contin = clamp01(W.distOcean[i] / CLIM.continSat);
        const maritimeRef = _oceanInf[i] - CLIM.lapseK * lh;   // воздух с моря (несёт тепло/холод течений)
        t = lerp(t, maritimeRef, (1 - contin) * CLIM.maritime);
        t += seasonRaw * contin * CLIM.continSwing;            // глубинка — резче
        tgt[i] = t + green + force;
      }
      if (W.iceAlbedo[i]) tgt[i] -= CLIM.iceCool;           // обратная связь альбедо льда (ледниковые периоды)
    }
  }

  // 3. релаксация фактической температуры к цели (вода инертна, суша быстрее)
  for (let i = 0; i < GRID.N; i++) {
    const rate = W.isWater[i] ? CLIM.oceanInertia : CLIM.landRelax;
    W.temp[i] += (tgt[i] - W.temp[i]) * rate;
  }

  // 4. течения переносят тепловые аномалии по океану
  advectWater(W.temp, tmp, CLIM.advectSST);

  // 4b. ветер переносит тепло над сушей (тёплый/холодный воздух плывёт по ветру; морской воздух заносится вглубь)
  advectByWind(W.temp, tmp, CLIM.windHeat, true);

  // 5. теплопроводность: тепло растекается к соседям (вода сильнее)
  diffuseField(W.temp, tmp, CLIM.diffLand, CLIM.diffWater);

  // 6. лёд (альбедо, гистерезис таяния) и фиксация baseTemp/sst
  for (let i = 0; i < GRID.N; i++) {
    let t = W.temp[i];
    if (W.iceAlbedo[i]) { if (t > CLIM.meltThresh) W.iceAlbedo[i] = 0; }
    else if (t < CLIM.iceThresh) W.iceAlbedo[i] = 1;
    W.baseTemp[i] = t;
    if (W.isWater[i]) W.sst[i] = t;
  }

  // временные источники (tempPulse) затухают; постоянные (tempForce) держатся
  for (let i = 0; i < GRID.N; i++) { if (W.tempPulse[i] !== 0) { W.tempPulse[i] *= 0.95; if (Math.abs(W.tempPulse[i]) < 0.1) W.tempPulse[i] = 0; } }
  // сглаженная температура (медленная) — по ней классифицируются БИОМЫ, чтобы они не скакали по сезонам
  for (let i = 0; i < GRID.N; i++) W.tempSmoothed[i] += (W.temp[i] - W.tempSmoothed[i]) * 0.012;
  precipitationPass();
  // сглаженные осадки — по ним тоже классифицируются БИОМЫ (осадки сезонны; иначе биом скачет через пороги Уиттекера → мерцание полей/зданий)
  for (let i = 0; i < GRID.N; i++) W.precipSmoothed[i] += (W.precip[i] - W.precipSmoothed[i]) * 0.012;
}

// ---- осадки: зональная модель (ITCZ + субтропические пустыни + штормовые широты),
// континентальность (сухо вглубь материка) и орография (наветренные склоны / тень) ----
function precipitationPass() {
  const P = W._pIndex;
  const gauss = (v, c, w) => { const z = (v - c) / w; return Math.exp(-z * z); };
  for (let y = 0; y < GRID.H; y++) {
    const lat = latOf(y), a = Math.abs(lat);
    // зональная база, мм/год
    const itcz = gauss(a, 4 * W.seasonPhase * (lat >= 0 ? 1 : -1), 10); // экв. дождевой пояс, смещается с сезоном
    const midlat = gauss(a, 52, 16);                                    // умеренные шторма
    const subtrop = gauss(a, 27, 11);                                   // субтропический минимум
    let base = 280 + 2350 * itcz + 950 * midlat - 380 * subtrop;
    if (base < 110) base = 110;
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      if (W.isWater[i]) { P[i] = base; continue; }
      // влага приходит ПО ВЕТРУ с моря: наветренные берега мокрые, заветренные — сухие (видно влияние ветра)
      // сильный ветер заносит влагу дальше вглубь, слабый — меньше
      const wspd = Math.hypot(W.windU[i], W.windV[i]);
      const ocl = 0.16 + 0.84 * W.upwindWet[i] * clamp(0.8 + wspd * 0.3, 0.65, 1.25);
      // орография по господствующему ветру
      const sx = W.windU[i] >= 0 ? -1 : 1, sy = W.windV[i] >= 0 ? -1 : 1;
      const up = idx(clamp(x + sx, 0, GRID.W - 1), clamp(y + sy, 0, GRID.H - 1));
      const dH = landH(i) - landH(up);
      const oro = dH >= 0 ? 1 + Math.min(dH * 8, 1.6) : 1 / (1 + (-dH) * 7);  // склон / дождевая тень
      // холодный воздух удерживает меньше влаги
      const warm = 0.35 + 0.65 * clamp01((W.temp[i] + 12) / 26);
      // тепловой купол: сильно перегретая суша иссушается (превращается в пустыню)
      const heatDome = W.temp[i] > 36 ? clamp01(1 - (W.temp[i] - 36) / 30) : 1;
      P[i] = base * ocl * oro * warm * heatDome;
    }
  }
  boxBlur(P, W._scratch);
  for (let i = 0; i < GRID.N; i++) W.precip[i] = clamp(P[i] * W.precipMul[i], 0, 6000);
}

function boxBlur(src, tmp) {
  const Wd = GRID.W, Hd = GRID.H;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue;
      s += src[idx(nx, ny)]; n++;
    }
    tmp[idx(x, y)] = s / n;
  }
  src.set(tmp);
}
