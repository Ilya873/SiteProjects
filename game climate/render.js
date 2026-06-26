// render.js — отрисовка «атласа»: затенённый рельеф, мягкие переходы биомов,
// анимированная вода, плавные слои-оверлеи, векторные границы государств.
'use strict';

const RES_W = 400, RES_H = 300, SX = RES_W / GRID.W, SY = RES_H / GRID.H;          // вода/слои (мягкие)
const BASE_W = CANVAS_W, BASE_H = CANVAS_H, SXB = BASE_W / GRID.W, SYB = BASE_H / GRID.H;  // база суши (резкая, полный размер)
// шероховатость процедурной текстуры по биомам (0 — гладко, 1 — зернисто)
const BIOME_TEX = [0, 0, 0, 0.6, 0.5, 0.12, 0.4, 0.72, 0.5, 0.5, 0.82, 0.85, 0.6, 0.55, 0.5, 0.8, 0.9, 0.5, 0.72];

let mainCanvas, ctx;
let baseCanvas, baseCtx, baseImg;
let waterCanvas, waterCtx, waterImg;
let overlayCanvas, overlayCtx, overlayImg;
let borderCanvas, borderCtx;

let currentOverlay = 'biome';
let view2d = { zoom: 1, ox: 0, oy: 0 };   // зум/панорама 2D-карты (в пикселях холста)
const colR = new Float32Array(GRID.N), colG = new Float32Array(GRID.N), colB = new Float32Array(GRID.N);
const heightF = new Float32Array(GRID.N), heightB = new Float32Array(GRID.N);
let oceanMask, seaDepthRes, coldRes, tintTbl, detailTbl;
let _bx0, _bx1, _bfx, _bnx, _by0, _by1, _bfy, _bny;   // предрасчёт выборки базового слоя
const DET = 512;

const SUN = (() => { const az = 315 * Math.PI / 180, el = 45 * Math.PI / 180; return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]; })();

function initRender() {
  mainCanvas = document.getElementById('worldCanvas');
  mainCanvas.width = CANVAS_W; mainCanvas.height = CANVAS_H;
  ctx = mainCanvas.getContext('2d');
  baseCanvas = mk(BASE_W, BASE_H); baseCtx = baseCanvas.getContext('2d'); baseImg = baseCtx.createImageData(BASE_W, BASE_H);
  waterCanvas = mk(RES_W, RES_H); waterCtx = waterCanvas.getContext('2d'); waterImg = waterCtx.createImageData(RES_W, RES_H);
  overlayCanvas = mk(RES_W, RES_H); overlayCtx = overlayCanvas.getContext('2d'); overlayImg = overlayCtx.createImageData(RES_W, RES_H);
  borderCanvas = mk(CANVAS_W, CANVAS_H); borderCtx = borderCanvas.getContext('2d');
  oceanMask = new Uint8Array(RES_W * RES_H);
  seaDepthRes = new Float32Array(RES_W * RES_H);
  coldRes = new Float32Array(RES_W * RES_H);
  // низкочастотная вариация цвета
  tintTbl = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) tintTbl[y * 256 + x] = fbm(x * 0.05, y * 0.05, 3) - 0.5;
  // высокочастотная процедурная текстура (зерно рельефа)
  detailTbl = new Float32Array(DET * DET);
  for (let y = 0; y < DET; y++) for (let x = 0; x < DET; x++) {
    const n = fbm(x * 0.16, y * 0.16, 3) - 0.5 + (fbm(x * 0.5 + 99, y * 0.5 + 99, 2) - 0.5) * 0.5;
    detailTbl[y * DET + x] = n;
  }
  // предрасчёт координат билинейной выборки для базового слоя (горячий путь)
  _bx0 = new Int16Array(BASE_W); _bx1 = new Int16Array(BASE_W); _bfx = new Float32Array(BASE_W); _bnx = new Int16Array(BASE_W);
  for (let px = 0; px < BASE_W; px++) {
    let gx = (px + 0.5) / SXB - 0.5; gx = gx < 0 ? 0 : gx > GRID.W - 1 ? GRID.W - 1 : gx;
    const x0 = gx | 0; _bx0[px] = x0; _bx1[px] = x0 < GRID.W - 1 ? x0 + 1 : x0; _bfx[px] = gx - x0; _bnx[px] = Math.round(gx);
  }
  _by0 = new Int16Array(BASE_H); _by1 = new Int16Array(BASE_H); _bfy = new Float32Array(BASE_H); _bny = new Int16Array(BASE_H);
  for (let py = 0; py < BASE_H; py++) {
    let gy = (py + 0.5) / SYB - 0.5; gy = gy < 0 ? 0 : gy > GRID.H - 1 ? GRID.H - 1 : gy;
    const y0 = gy | 0; _by0[py] = y0; _by1[py] = y0 < GRID.H - 1 ? y0 + 1 : y0; _bfy[py] = gy - y0; _bny[py] = Math.round(gy);
  }
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---- запекание цветов рельефа на сетке (биом+veg, снег, пляж, hillshade, шум) ----
function bakeColors() {
  for (let i = 0; i < GRID.N; i++) {
    heightF[i] = W.isWater[i] ? -0.12 * clamp01(W.seaDepth[i] / 3500) : 0.05 + landH(i) * 0.95;
  }
  boxBlur(heightF, heightB); // heightB := blur(heightF); heightF restored below
  // boxBlur пишет в tmp и копирует обратно в src → используем отдельный путь
  // (boxBlur(src,tmp): src становится размытым). Поэтому пересоберём heightF заново.
  for (let i = 0; i < GRID.N; i++) heightF[i] = W.isWater[i] ? -0.12 * clamp01(W.seaDepth[i] / 3500) : 0.05 + landH(i) * 0.95;

  for (let y = 0; y < GRID.H; y++) {
    for (let x = 0; x < GRID.W; x++) {
      const i = idx(x, y);
      const bd = BIOME_RENDER[W.biome[i]];
      const veg = W.veg[i];
      let r = lerp(bd.base[0], bd.lush[0], veg);
      let g = lerp(bd.base[1], bd.lush[1], veg);
      let b = lerp(bd.base[2], bd.lush[2], veg);
      if (!W.isWater[i]) {
        const hf = landH(i), tC = W.temp[i];
        // снег на холодной суше
        const snow = clamp01((0.5 - tC) / 7) * clamp01(0.25 + hf * 1.6);
        if (snow > 0) { r = lerp(r, 240, snow); g = lerp(g, 244, snow); b = lerp(b, 250, snow); }
        // мягкий пляж у уреза воды
        if (hf < 0.06) { const t = (1 - hf / 0.06) * 0.7; r = lerp(r, 222, t); g = lerp(g, 204, t); b = lerp(b, 150, t); }
        // hillshade
        const hl = heightB[idx(Math.max(0, x - 1), y)], hr = heightB[idx(Math.min(GRID.W - 1, x + 1), y)];
        const hu = heightB[idx(x, Math.max(0, y - 1))], hd2 = heightB[idx(x, Math.min(GRID.H - 1, y + 1))];
        const dzdx = (hr - hl) * 9, dzdy = (hd2 - hu) * 9;
        const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const dot = (-dzdx * SUN[0] - dzdy * SUN[1] + SUN[2]) / len;
        const lit = 0.46 + 0.66 * clamp01(dot);             // более выраженный рельеф
        r *= lit; g *= lit; b *= lit;
        // лёгкая вариация цвета
        const tn = tintTbl[((y * 4 & 255) * 256) + (x * 4 & 255)] * 0.07;
        r *= 1 + tn; g *= 1 + tn; b *= 1 + tn;
        // повышение насыщенности и яркости — карта читается чётче
        const lum = 0.30 * r + 0.59 * g + 0.11 * b;
        r = (lum + (r - lum) * 1.32) * 1.06; g = (lum + (g - lum) * 1.32) * 1.06; b = (lum + (b - lum) * 1.32) * 1.06;
      }
      colR[i] = clamp(r, 0, 255); colG[i] = clamp(g, 0, 255); colB[i] = clamp(b, 0, 255);
    }
  }
}

// база суши рисуется в полном разрешении 800×600 (резко) + процедурное зерно.
// горячий путь: инлайн-билинейка по предрасчитанным таблицам выборки.
function buildBase() {
  bakeColors();
  const d = baseImg.data, Wd = GRID.W;
  let p = 0;
  for (let py = 0; py < BASE_H; py++) {
    const y0 = _by0[py], fy = _bfy[py], row0 = y0 * Wd, row1 = _by1[py] * Wd;
    const biRow = _bny[py] * Wd, ny = (py % DET) * DET;
    for (let px = 0; px < BASE_W; px++) {
      const x0 = _bx0[px], x1 = _bx1[px], fx = _bfx[px];
      const i00 = row0 + x0, i01 = row0 + x1, i10 = row1 + x0, i11 = row1 + x1;
      let t = colR[i00], r = (t + (colR[i01] - t) * fx); r += ((colR[i10] + (colR[i11] - colR[i10]) * fx) - r) * fy;
      t = colG[i00]; let g = (t + (colG[i01] - t) * fx); g += ((colG[i10] + (colG[i11] - colG[i10]) * fx) - g) * fy;
      t = colB[i00]; let b = (t + (colB[i01] - t) * fx); b += ((colB[i10] + (colB[i11] - colB[i10]) * fx) - b) * fy;
      const rough = BIOME_TEX[W.biome[biRow + _bnx[px]]];
      if (rough > 0) { const f = 1 + detailTbl[ny + (px % DET)] * rough * 0.30; r *= f; g *= f; b *= f; }
      d[p] = r < 0 ? 0 : r > 255 ? 255 : r; d[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b; d[p + 3] = 255;
      p += 4;
    }
  }
  baseCtx.putImageData(baseImg, 0, 0);
  buildWaterCaches();
}

// кэши воды/слоёв в пониженном разрешении (вода мягкая)
function buildWaterCaches() {
  let k = 0;
  for (let py = 0; py < RES_H; py++) {
    const gy = (py + 0.5) / SY - 0.5;
    for (let px = 0; px < RES_W; px++, k++) {
      const gx = (px + 0.5) / SX - 0.5;
      oceanMask[k] = bilinear(W.isWater, gx, gy) > 0.5 ? 1 : 0;
      seaDepthRes[k] = bilinear(W.seaDepth, gx, gy);
      coldRes[k] = bilinear(W.temp, gx, gy);
    }
  }
}

// ---- анимированная вода (каждый кадр): мягкая зыбь, без полос ----
function buildWater(now) {
  const t = now * 0.0006, d = waterImg.data;
  let k = 0, p = 0;
  for (let py = 0; py < RES_H; py++) {
    for (let px = 0; px < RES_W; px++, k++, p += 4) {
      if (!oceanMask[k]) { d[p + 3] = 0; continue; }
      const dn = clamp01(seaDepthRes[k] / 3500);
      let r = lerp(66, 10, dn), g = lerp(150, 36, dn), b = lerp(180, 76, dn);
      // крупная медленная зыбь — две перекрёстные низкочастотные волны
      const swell = Math.sin(px * 0.055 + py * 0.03 + t * 1.1) + Math.sin(px * 0.022 - py * 0.05 - t * 0.8);
      const ripple = swell * 3.2 * (1 - dn * 0.45);
      r += ripple; g += ripple; b += ripple;
      // редкие солнечные блики
      const s = Math.sin(px * 0.05 - py * 0.072 + t * 1.4) * Math.sin(py * 0.04 + t);
      if (s > 0.8) { const spec = (s - 0.8) * 5 * 26 * (1 - dn); r += spec; g += spec; b += spec * 0.7; }
      // прибой у берега
      if (seaDepthRes[k] < 300) { const f = 1 - seaDepthRes[k] / 300; const fn = Math.max(0, Math.sin(px * 0.35 + py * 0.3 - t * 2.4)) * f * f * 55; r += fn; g += fn; b += fn; }
      if (coldRes[k] < -1) { const ice = clamp01((-1 - coldRes[k]) / 6); r = lerp(r, 206, ice); g = lerp(g, 219, ice); b = lerp(b, 229, ice); }
      d[p] = clamp(r, 0, 255); d[p + 1] = clamp(g, 0, 255); d[p + 2] = clamp(b, 0, 255); d[p + 3] = 255;
    }
  }
  waterCtx.putImageData(waterImg, 0, 0);
}

// ---- слои-оверлеи ----
function rampTemp(v) { const t = clamp01((v + 30) / 75); return [clamp(t * 2, 0, 1) * 255, clamp(1 - Math.abs(t - 0.5) * 2, 0, 1) * 220, clamp((1 - t) * 2, 0, 1) * 255]; }
function rampPrecip(v) { const t = clamp01(v / 3000); return [lerp(245, 20, t), lerp(245, 90, t), lerp(245, 200, t)]; }

function buildOverlay() {
  const d = overlayImg.data; let k = 0, p = 0;
  for (let py = 0; py < RES_H; py++) {
    const gy = (py + 0.5) / SY - 0.5;
    for (let px = 0; px < RES_W; px++, k++, p += 4) {
      const gx = (px + 0.5) / SX - 0.5;
      let r = 0, g = 0, b = 0, a = 0;
      if (currentOverlay === 'temperature') { const c = rampTemp(bilinear(W.temp, gx, gy)); r = c[0]; g = c[1]; b = c[2]; a = 150; }
      else if (currentOverlay === 'humidity') { if (bilinear(W.isWater, gx, gy) < 0.5) { const c = rampPrecip(bilinear(W.precip, gx, gy)); r = c[0]; g = c[1]; b = c[2]; a = 150; } }
      else if (currentOverlay === 'population') { const v = bilinear(W.pop, gx, gy); if (v > 30) { const t = clamp01(Math.log(v) / Math.log(120000)); r = lerp(255, 210, t); g = lerp(220, 30, t); b = lerp(80, 20, t); a = clamp(60 + t * 180, 0, 220); } }
      else if (currentOverlay === 'political' || currentOverlay === 'battles') { const gi = idx(clamp(Math.round(gx), 0, GRID.W - 1), clamp(Math.round(gy), 0, GRID.H - 1)); const sid = W.stateId[gi]; if (sid >= 0 && states[sid] && states[sid].alive) { const c = states[sid].color; r = c[0]; g = c[1]; b = c[2]; a = currentOverlay === 'battles' ? 95 : 150; } }
      else if (currentOverlay === 'eco') { if (bilinear(W.isWater, gx, gy) < 0.5) { const e = bilinear(W.eco, gx, gy); r = lerp(168, 60, e); g = lerp(70, 180, e); b = lerp(40, 70, e); a = 160; } }
      else if (currentOverlay === 'pollution') { if (bilinear(W.isWater, gx, gy) < 0.5) { const v = bilinear(W.pollution, gx, gy); if (v > 0.02) { r = lerp(140, 90, v); g = lerp(120, 30, v); b = lerp(120, 80, v); a = clamp(40 + v * 230, 0, 220); } } }
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a;
    }
  }
  overlayCtx.putImageData(overlayImg, 0, 0);
}

// ---- векторные границы и берег ----
function buildBorders() {
  borderCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  // берег
  const coast = new Path2D();
  for (let y = 0; y < GRID.H; y++) for (let x = 0; x < GRID.W; x++) {
    const i = idx(x, y), w0 = W.isWater[i];
    if (x < GRID.W - 1 && W.isWater[idx(x + 1, y)] !== w0) { coast.moveTo((x + 1) * CELL, y * CELL); coast.lineTo((x + 1) * CELL, (y + 1) * CELL); }
    if (y < GRID.H - 1 && W.isWater[idx(x, y + 1)] !== w0) { coast.moveTo(x * CELL, (y + 1) * CELL); coast.lineTo((x + 1) * CELL, (y + 1) * CELL); }
  }
  borderCtx.strokeStyle = 'rgba(20,42,60,0.5)'; borderCtx.lineWidth = 1.5; borderCtx.stroke(coast);
  // границы государств — по цвету
  const paths = new Map();
  const seg = (col, x0, y0, x1, y1) => { let pth = paths.get(col); if (!pth) { pth = new Path2D(); paths.set(col, pth); } pth.moveTo(x0, y0); pth.lineTo(x1, y1); };
  for (let y = 0; y < GRID.H; y++) for (let x = 0; x < GRID.W; x++) {
    const i = idx(x, y), sid = W.stateId[i]; if (sid < 0) continue;
    const st = states[sid]; if (!st || !st.alive) continue;
    const col = `rgb(${st.color[0]},${st.color[1]},${st.color[2]})`;
    for (const [dx, dy] of NB4) {
      const nx = x + dx, ny = y + dy;
      const other = inB(nx, ny) ? W.stateId[idx(nx, ny)] : -1;
      if (other !== sid) {
        if (dx === 1) seg(col, (x + 1) * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL);
        else if (dx === -1) seg(col, x * CELL, y * CELL, x * CELL, (y + 1) * CELL);
        else if (dy === 1) seg(col, x * CELL, (y + 1) * CELL, (x + 1) * CELL, (y + 1) * CELL);
        else seg(col, x * CELL, y * CELL, (x + 1) * CELL, y * CELL);
      }
    }
  }
  borderCtx.lineWidth = 2; borderCtx.lineCap = 'round';
  paths.forEach((pth, col) => { borderCtx.strokeStyle = col; borderCtx.stroke(pth); });
}

function fillStateCells(st, style) {
  if (!st || !st.alive) return; ctx.fillStyle = style;
  st.cells.forEach(i => { const x = i % GRID.W, y = (i / GRID.W) | 0; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); });
}

function renderFrame(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.setTransform(view2d.zoom, 0, 0, view2d.zoom, view2d.ox, view2d.oy);   // зум/панорама 2D
  ctx.drawImage(baseCanvas, 0, 0);                       // база в полном разрешении (резко)
  buildWater(now);
  ctx.drawImage(waterCanvas, 0, 0, RES_W, RES_H, 0, 0, CANVAS_W, CANVAS_H);
  if (currentOverlay === 'currents') drawCurrents(now);
  ctx.drawImage(borderCanvas, 0, 0);
  if (currentOverlay === 'wind') drawWind(now);
  else if (currentOverlay !== 'biome' && currentOverlay !== 'currents') {
    buildOverlay(); ctx.drawImage(overlayCanvas, 0, 0, RES_W, RES_H, 0, 0, CANVAS_W, CANVAS_H);
    if (currentOverlay === 'temperature') drawIsolines(W.temp, TEMP_LEVELS, 'rgba(0,0,0,0.45)', 1);
    else if (currentOverlay === 'humidity') drawIsolines(W.precip, PRECIP_LEVELS, 'rgba(8,28,55,0.5)', 1);
  }
  if (highlightedState) fillStateCells(highlightedState, 'rgba(255,255,255,0.12)');
  if (selectedState) fillStateCells(selectedState, 'rgba(233,69,96,0.20)');
  // корабли + торговые маршруты к портам
  for (const sh of ships) {
    const cx = sh.x * CELL + CELL / 2, cy = sh.y * CELL + CELL / 2;
    if (sh.dest >= 0) {
      const dx2 = (sh.dest % GRID.W + 0.5) * CELL, dy2 = ((sh.dest / GRID.W | 0) + 0.5) * CELL;
      ctx.strokeStyle = `rgba(${sh.color[0]},${sh.color[1]},${sh.color[2]},0.16)`; ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx2, dy2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = `rgb(${sh.color[0]},${sh.color[1]},${sh.color[2]})`;
    ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,24,0.72)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  drawCities();
  if (currentOverlay === 'political' || currentOverlay === 'battles') drawBattles(now);   // стычки — на слоях «Дипломатия»/«Битвы»
  ctx.setTransform(1, 0, 0, 1, 0, 0);                     // экранные координаты
  drawCityLabels();
  drawLayerLabel();
}

// ---- слой «Города»: названия с защитой от наслаивания (экранные координаты) ----
function drawCityLabels() {
  if (typeof uiState === 'undefined' || !uiState.showCities || !cities.length) return;
  const sorted = cities.slice().sort((a, b) => b.pop - a.pop), placed = [];
  ctx.save(); ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const c of sorted) {
    const sx = (c.x + 0.5) * CELL * view2d.zoom + view2d.ox, sy = (c.y + 0.5) * CELL * view2d.zoom + view2d.oy;
    if (sx < -40 || sx > CANVAS_W + 40 || sy < 0 || sy > CANVAS_H) continue;
    const w = ctx.measureText(c.name).width, lx = sx + 7, box = [lx - 3, sy - 9, lx + w + 3, sy + 9];
    if (placed.some(p => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
    placed.push(box);
    ctx.fillStyle = 'rgba(8,12,22,0.72)'; ctx.fillRect(box[0], sy - 8, w + 6, 16);
    ctx.fillStyle = c.capital ? '#ffe28c' : '#eaf0ff'; ctx.fillText(c.name, lx, sy);
  }
  ctx.restore();
}

// ---- метки сражений: пульсирующие «скрещённые мечи» там, где идут стычки ----
function drawBattles(now) {
  if (typeof battles === 'undefined' || !battles.length) return;
  const t = now * 0.012;
  ctx.save(); ctx.lineCap = 'round';
  for (const b of battles) {
    const cx = (b.x + 0.5) * CELL, cy = (b.y + 0.5) * CELL, pulse = 0.55 + 0.45 * Math.sin(t * 3 + b.x), r = 4 + 3 * pulse, al = clamp(0.35 + 0.5 * (b.life / 12), 0, 0.9);
    ctx.strokeStyle = `rgba(255,${(70 + 90 * pulse) | 0},40,${al.toFixed(2)})`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
  }
  ctx.restore();
}

// города: маркеры размером по населению (столицы — золотые с ядром)
function drawCities() {
  if (!cities.length) return;
  ctx.save(); ctx.lineWidth = 1.2;
  for (const c of cities) {
    const cx = (c.x + 0.5) * CELL, cy = (c.y + 0.5) * CELL;
    const r = clamp(2.2 + Math.sqrt(c.pop) / 42, 2.2, 9);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);
    ctx.fillStyle = c.capital ? 'rgba(255,226,140,0.96)' : 'rgba(248,248,255,0.92)';
    ctx.fill(); ctx.strokeStyle = 'rgba(15,18,30,0.75)'; ctx.stroke();
    if (c.capital) { ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, 7); ctx.fillStyle = 'rgba(150,40,45,0.95)'; ctx.fill(); }
  }
  ctx.restore();
}

// ---- слой течений: криволинейные линии тока (огибают берега) с бегущими штрихами ----
function drawCurrents(now) {
  const t = now * 0.0012;
  ctx.save(); ctx.lineCap = 'round';
  for (let y = 1; y < GRID.H; y += 3) {
    for (let x = 1; x < GRID.W; x += 3) {
      const i = idx(x, y);
      if (!W.isWater[i]) continue;
      const sp0 = Math.hypot(W.currentU[i], W.currentV[i]); if (sp0 < 0.06) continue;
      // трассируем линию тока вперёд по полю скоростей (изгибается у берегов)
      let px = x + 0.5, py = y + 0.5; const pts = [];
      for (let k = 0; k < 9; k++) {
        const cx = Math.round(px), cy = Math.round(py);
        if (cx < 0 || cx >= GRID.W || cy < 0 || cy >= GRID.H || !W.isWater[idx(cx, cy)]) break;
        const u = bilinear(W.currentU, px - 0.5, py - 0.5), v = bilinear(W.currentV, px - 0.5, py - 0.5);
        if (Math.hypot(u, v) < 0.02) break;
        pts.push(px * CELL, py * CELL);
        px += u * 0.85; py += v * 0.85;
      }
      if (pts.length < 4) continue;
      const warm = clamp01((W.temp[i] - 6) / 18);
      const r = lerp(60, 235, warm) | 0, g = lerp(155, 95, warm) | 0, b = lerp(235, 75, warm) | 0;
      ctx.strokeStyle = `rgba(${r},${g},${b},${clamp(0.35 + sp0 * 0.4, 0, 0.9).toFixed(2)})`;
      ctx.lineWidth = clamp(1 + sp0 * 1.6, 1, 3.2);
      ctx.setLineDash([5, 9]); ctx.lineDashOffset = -((t * 70 * (0.4 + sp0)) % 14);
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]); ctx.restore();
}

// ---- слой ветров: линии тока воздуха (огибают горы), цвет/толщина по скорости, со стрелками ----
function drawWind(now) {
  const t = now * 0.0016;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let y = 1; y < GRID.H; y += 2) {
    for (let x = 1; x < GRID.W; x += 2) {
      const i = idx(x, y);
      const sp0 = Math.hypot(W.windU[i], W.windV[i]); if (sp0 < 0.05) continue;
      let px = x + 0.5, py = y + 0.5; const pts = [];
      for (let k = 0; k < 10; k++) {
        if (px < 0 || px >= GRID.W || py < 0 || py >= GRID.H) break;
        const u = bilinear(W.windU, px - 0.5, py - 0.5), v = bilinear(W.windV, px - 0.5, py - 0.5);
        if (Math.hypot(u, v) < 0.03) break;
        pts.push(px * CELL, py * CELL); px += u * 0.9; py += v * 0.9;
      }
      if (pts.length < 4) continue;
      // цвет по скорости: слабый — голубой, сильный — бело-жёлтый
      const sp = clamp01((sp0 - 0.1) / 1.5);
      const r = lerp(140, 255, sp) | 0, g = lerp(205, 238, sp) | 0, b = lerp(255, 140, sp) | 0;
      const al = clamp(0.32 + sp0 * 0.5, 0, 0.88);
      ctx.strokeStyle = `rgba(${r},${g},${b},${al.toFixed(2)})`;
      ctx.lineWidth = clamp(0.9 + sp0 * 2.0, 0.9, 3.6);
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -((t * 95 * (0.4 + sp0)) % 10);
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
      ctx.stroke();
      // стрелка-указатель направления на конце линии тока
      const n = pts.length, ex = pts[n - 2], ey = pts[n - 1], bx = pts[n - 4], by = pts[n - 3];
      const ang = Math.atan2(ey - by, ex - bx), ah = clamp(3.2 + sp0 * 2.4, 3.2, 6.5);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang - 0.42) * ah, ey - Math.sin(ang - 0.42) * ah);
      ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang + 0.42) * ah, ey - Math.sin(ang + 0.42) * ah);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]); ctx.restore();
}

// ---- изолинии скалярного поля (marching squares) — наглядные контуры ----
const TEMP_LEVELS = [-30, -20, -10, 0, 10, 20, 30, 40];
const PRECIP_LEVELS = [250, 500, 1000, 1500, 2000, 2500];
const _MS = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];
function _edgePt(e, x, y, a, b, c, d, L) {
  let t;
  if (e === 0) { t = (L - a) / (b - a); return [(x + 0.5 + t) * CELL, (y + 0.5) * CELL]; }
  if (e === 1) { t = (L - b) / (c - b); return [(x + 1.5) * CELL, (y + 0.5 + t) * CELL]; }
  if (e === 2) { t = (L - c) / (d - c); return [(x + 1.5 - t) * CELL, (y + 1.5) * CELL]; }
  t = (L - d) / (a - d); return [(x + 0.5) * CELL, (y + 1.5 - t) * CELL];
}
function drawIsolines(field, levels, style, width) {
  ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width || 1; ctx.beginPath();
  for (let y = 0; y < GRID.H - 1; y++) for (let x = 0; x < GRID.W - 1; x++) {
    const a = field[idx(x, y)], b = field[idx(x + 1, y)], c = field[idx(x + 1, y + 1)], d = field[idx(x, y + 1)];
    for (let li = 0; li < levels.length; li++) {
      const L = levels[li];
      const cs = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
      const segs = _MS[cs]; if (!segs.length) continue;
      for (const s of segs) { const p = _edgePt(s[0], x, y, a, b, c, d, L), q = _edgePt(s[1], x, y, a, b, c, d, L); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    }
  }
  ctx.stroke(); ctx.restore();
}

const _LAYER_LABEL = { temperature: '🌡 Температура', humidity: '🌧 Осадки', currents: '🌊 Течения', wind: '💨 Ветер', eco: '🌿 Экология', pollution: '🏭 Загрязнение', population: '👥 Население', political: '🏛 Государства' };
function drawLayerLabel() {
  if (currentOverlay === 'biome') return;
  ctx.save();
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  const lbl = _LAYER_LABEL[currentOverlay] || currentOverlay;
  const w = ctx.measureText(lbl).width + 22;
  ctx.fillStyle = 'rgba(8,12,24,0.72)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(10, 10, w, 28, 7) : ctx.rect(10, 10, w, 28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(lbl, 21, 29);
  ctx.restore();
}

function setOverlay(name) { currentOverlay = name; if (window.mode3D && typeof bakeTerrain === 'function') bakeTerrain(); }   // в 3D — перекрасить рельеф под слой данных

function cellAt(clientX, clientY, rect) {
  const sx = mainCanvas.width / rect.width, sy = mainCanvas.height / rect.height;
  const cxp = (clientX - rect.left) * sx, cyp = (clientY - rect.top) * sy;
  const wx = (cxp - view2d.ox) / view2d.zoom, wy = (cyp - view2d.oy) / view2d.zoom;   // учёт зума/панорамы
  const x = clamp(Math.floor(wx / CELL), 0, GRID.W - 1);
  const y = clamp(Math.floor(wy / CELL), 0, GRID.H - 1);
  return { x, y, i: idx(x, y) };
}
// зум 2D к точке курсора (clientX,clientY); factor>1 — приблизить
function zoom2dAt(clientX, clientY, rect, factor) {
  const sx = mainCanvas.width / rect.width, cxp = (clientX - rect.left) * sx, cyp = (clientY - rect.top) * (mainCanvas.height / rect.height);
  const nz = clamp(view2d.zoom * factor, 1, 8);
  if (nz === view2d.zoom) return;
  // сохраняем точку под курсором на месте
  view2d.ox = cxp - (cxp - view2d.ox) * (nz / view2d.zoom);
  view2d.oy = cyp - (cyp - view2d.oy) * (nz / view2d.zoom);
  view2d.zoom = nz;
  clampPan2d();
}
function pan2d(ddx, ddy, rect) { const sx = mainCanvas.width / rect.width; view2d.ox += ddx * sx; view2d.oy += ddy * (mainCanvas.height / rect.height); clampPan2d(); }
function clampPan2d() {
  const maxX = 0, minX = CANVAS_W * (1 - view2d.zoom), maxY = 0, minY = CANVAS_H * (1 - view2d.zoom);
  view2d.ox = clamp(view2d.ox, minX, maxX); view2d.oy = clamp(view2d.oy, minY, maxY);
  if (view2d.zoom <= 1) { view2d.ox = 0; view2d.oy = 0; }
}
