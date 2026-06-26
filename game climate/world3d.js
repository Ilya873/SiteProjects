// world3d.js — 3D-вид мира на Three.js: рельеф, океан, поселения по эпохам, дороги по суше, транспорт.
// Читает состояние симуляции (W, cities, states). ЛКМ — рисование инструментом, ПКМ — поворот камеры.
'use strict';

let mode3D = false;
const HS = 13;
let AXIS_Y;
const _bfsPar = new Int32Array(GRID.N);
const _3d = {
  ok: false, scene: null, cam: null, rend: null, canvas: null, sun: null,
  terrain: null, terGeo: null, water: null, _waterBase: null,
  bld: null, roads: null, mov: null, movers: [],
  m4: null, q: null, v3a: null, v3b: null, col: null, ray: null, ndc: null,
  view: { az: 0.7, el: 0.7, dist: 60, tx: GRID.W / 2, ty: 2, tz: GRID.H / 2 },
  drag: null, paint: false, frame: 0, last: 0, _t: 0, _lastCityN: -1,
};

function three3dReady() { return typeof THREE !== 'undefined'; }
function heightCell(i) { return (W.elev[i] - W.seaLevel) * HS; }
function rnd2(a, b) { let h = (a * 73856093) ^ (b * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h >>> 0) % 100000) / 100000; }
function stateOf3(i) { const s = W.stateId[i]; return s >= 0 && states[s] && states[s].alive ? states[s] : null; }
function disposeChildren(grp) {
  while (grp.children.length) { const c = grp.children.pop(); c.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); } }); }
}

// ---- прототипы построек по эпохам (склеенная геометрия) ----
function mergeGeos(list) {
  let total = 0; const parts = [];
  for (const g of list) { const ng = g.index ? g.toNonIndexed() : g; parts.push(ng); total += ng.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2); let o = 0, ou = 0;
  for (const ng of parts) { pos.set(ng.attributes.position.array, o); nor.set(ng.attributes.normal.array, o); if (ng.attributes.uv) uv.set(ng.attributes.uv.array, ou); o += ng.attributes.position.array.length; ou += ng.attributes.position.count * 2; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));   // UV — иначе текстуры зданий чёрные
  return m;
}
function geoTent() { const c = new THREE.ConeGeometry(0.42, 0.72, 7); c.translate(0, 0.36, 0); return c; }                                  // вигвам
function geoHouse() { const b = new THREE.BoxGeometry(0.5, 0.42, 0.6); b.translate(0, 0.21, 0); const r = new THREE.ConeGeometry(0.46, 0.34, 4); r.rotateY(Math.PI / 4); r.translate(0, 0.42 + 0.17, 0); return mergeGeos([b, r]); }  // дом с крышей
function geoFactory() { const b = new THREE.BoxGeometry(0.72, 0.5, 0.6); b.translate(0, 0.25, 0); const ch = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6); ch.translate(0.24, 0.5 + 0.35, -0.16); return mergeGeos([b, ch]); }  // завод с трубой
function geoTower() { const b = new THREE.BoxGeometry(0.4, 1, 0.4); b.translate(0, 0.5, 0); return b; }                                       // высота — через scale.y
function geoLandmark() { const base = new THREE.BoxGeometry(0.95, 0.34, 0.95); base.translate(0, 0.17, 0); const mid = new THREE.BoxGeometry(0.62, 0.42, 0.62); mid.translate(0, 0.34 + 0.21, 0); const top = new THREE.BoxGeometry(0.32, 0.4, 0.32); top.translate(0, 0.76 + 0.2, 0); return mergeGeos([base, mid, top]); }  // дворец/храм
function geoField() { const p = new THREE.PlaneGeometry(0.82, 0.82); p.rotateX(-Math.PI / 2); return p; }                                     // поле
function geoTreeBillboard() { const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0); const b = new THREE.PlaneGeometry(1, 1); b.rotateY(Math.PI / 2); b.translate(0, 0.5, 0); return mergeGeos([a, b]); }   // крест из двух вертикальных квадов (дерево/куст), основание в y=0
function geoPerson() { const body = new THREE.BoxGeometry(0.07, 0.16, 0.07); body.translate(0, 0.08, 0); const head = new THREE.BoxGeometry(0.07, 0.07, 0.07); head.translate(0, 0.195, 0); return mergeGeos([body, head]); }  // человечек
function geoVehicle() { const hull = new THREE.BoxGeometry(0.5, 0.16, 0.3); hull.translate(0, 0.08, 0); const tur = new THREE.BoxGeometry(0.26, 0.13, 0.22); tur.translate(0, 0.22, 0); const bar = new THREE.CylinderGeometry(0.028, 0.028, 0.36, 6); bar.rotateZ(Math.PI / 2); bar.translate(0.3, 0.22, 0); return mergeGeos([hull, tur, bar]); }   // танк/артиллерия

const ERA_HOUSE_COL = [0x6b4a2e, 0x9a7c4e, 0xb6a488, 0xb08a6a, 0x9fc0e0, 0xd0ecff];
const ERA_LAND_COL = [0x8a6a44, 0xd9b25a, 0xe8e2d0, 0xc97a4a, 0xbfd4e6, 0xe6f4ff];
// чёрный силуэт человека (для жителей и солдат)
let _silTex = null;
function personSilhouetteTex() {
  if (_silTex || typeof THREE === 'undefined') return _silTex;
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#0b0b0e';
  x.beginPath(); x.arc(16, 13, 6.5, 0, 7); x.fill();          // голова
  x.fillRect(11, 19, 10, 24);                                 // тело
  x.fillRect(8, 27, 16, 5);                                   // руки
  x.fillRect(12, 41, 3.4, 18); x.fillRect(16.6, 41, 3.4, 18); // ноги
  _silTex = new THREE.CanvasTexture(cv); _silTex.minFilter = THREE.LinearFilter; return _silTex;
}

// ---- текстуры: камень/трава/песок/снег/доски/вода + фасады зданий ----
const TEX_NAMES = ['grass', 'sand', 'snow', 'rock', 'cobble', 'planks', 'water', 'wall_stone', 'wall_timber', 'wall_glass', 'wall_concrete', 'tree_broadleaf', 'tree_conifer', 'tree_jungle', 'bush', 'field'];
const TEX = {};
function loadTextures(onEach) {
  for (const n of TEX_NAMES) {
    const img = new Image(); const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX[n] = { img, tex: t, ok: false };
    img.onload = (function (nn, tt) { return function () { TEX[nn].ok = true; tt.needsUpdate = true; if (onEach) onEach(); }; })(n, t);
    img.src = (typeof TEXDATA !== 'undefined' && TEXDATA[n]) ? TEXDATA[n] : 'tex/' + n + '.png';   // встроенные data-URI (без CORS-проблем file://)
  }
}
const BIOME_TEXN = ['rock', 'sand', 'sand', 'grass', 'grass', 'snow', 'snow', 'grass', 'sand', 'grass', 'grass', 'grass', 'grass', 'sand', 'grass', 'grass', 'grass', 'rock', 'rock'];
// растительность по биомам: какой меш дерева/куста и базовая густота (деревьев на клетку при veg=1)
const VEG_BIOME = {
  7:  { mesh: 'conifer',   d: 5 },     // тайга — хвойный лес
  10: { mesh: 'broadleaf', d: 5 },     // широколиственный лес
  11: { mesh: 'broadleaf', d: 6 },     // дождевой лес умеренной зоны
  15: { mesh: 'broadleaf', d: 4 },     // сезонный тропический лес
  16: { mesh: 'jungle',    d: 6 },     // тропический дождевой лес — джунгли
  6:  { mesh: 'bush',      d: 1.1 },   // тундра — редкий кустарник
  9:  { mesh: 'bush',      d: 0.9 },   // степь — кусты иногда
  12: { mesh: 'bush',      d: 1.3 },   // средиземноморье — маквис
  14: { mesh: 'bush',      d: 1.0 },   // саванна — редколесье/кусты
};
const VEG_SIZE = { broadleaf: [0.62, 0.85], conifer: [0.72, 0.6], jungle: [0.88, 0.9], bush: [0.42, 1.4] };  // [высота, относит. ширина] — деревья ниже (кусты не трогаем)
function terrTexName(i) {   // (оставлено для совместимости / диагностики)
  if (W.isWater[i]) return W.seaDepth[i] > 250 ? 'rock' : 'sand';
  const t = W.temp[i], lh = landH(i);
  if (t < -2 || (t < 2.5 && lh > 0.45)) return 'snow';
  return BIOME_TEXN[W.biome[i]] || 'grass';
}

// ---- слой-веса материалов (плавные переходы вместо жёстких клеток) ----
function slopeAt(i) {              // макс. перепад высоты к соседям-СУШЕ (вода игнорируется → берег не «каменеет»)
  const x = i % GRID.W, y = (i / GRID.W) | 0, hC = heightCell(i); let mx = 0;
  for (const d of NB4) { const nx = x + d[0], ny = y + d[1]; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (W.isWater[ni]) continue; const dh = Math.abs(heightCell(ni) - hC); if (dh > mx) mx = dh; }
  return mx;
}
function snowWeight(i) { if (W.isWater[i]) return 0; const t = W.temp[i], lh = landH(i); return clamp01((0.5 - t) / 6.5) * clamp01(0.12 + lh * 1.7); }
function rockWeight(i) { if (W.isWater[i]) return 0; const lh = landH(i), s = slopeAt(i); const steep = clamp01((s - 0.7) / 1.9), high = clamp01((lh - 0.7) / 0.28) * 0.6; return clamp01(Math.max(steep, high) * (1 - 0.22 * W.veg[i])); }
function sandWeight(i) {
  if (W.isWater[i]) return 0; const lh = landH(i); let w = 0;
  if (W.distOcean[i] <= 1) w = clamp01((0.06 - lh) / 0.06) * 0.9;                  // пляжи у берега (узкая полоса)
  const desert = clamp01((0.22 - W.veg[i]) / 0.22) * clamp01((W.temp[i] - 12) / 12);  // песок только где жарко И голо (мало растительности)
  return clamp01(Math.max(w, desert));
}

const BAKE_CELL = 16;     // px на клетку в запечённой текстуре (1280×960)
const BAKE_TILE = 96;     // период повтора текстуры (px) ≈ 6 клеток
let _terCanvas, _terCtx, _terTex, _bake = null;
function tiledCanvas(name) {
  const e = TEX[name]; if (!e || !e.ok) return null;
  const c = document.createElement('canvas'); c.width = _bake.W; c.height = _bake.H; const x = c.getContext('2d'); x.imageSmoothingEnabled = true;
  const tp = BAKE_TILE, iw = e.img.width, ih = e.img.height;
  for (let yy = 0; yy < c.height; yy += tp) for (let xx = 0; xx < c.width; xx += tp) x.drawImage(e.img, 0, 0, iw, ih, xx, yy, tp, tp);   // бесшовный тайл
  return c;
}
function bakeTerrain() {
  if (!_bake) _bake = { W: GRID.W * BAKE_CELL, H: GRID.H * BAKE_CELL };
  const BW = _bake.W, BH = _bake.H;
  if (!_terCanvas) { _terCanvas = document.createElement('canvas'); _terCanvas.width = BW; _terCanvas.height = BH; _terCtx = _terCanvas.getContext('2d'); }
  const cx = _terCtx;
  if (!_bake.tiles) _bake.tiles = {};
  const T = _bake.tiles; let texOk = true;
  for (const n of ['grass', 'sand', 'rock', 'snow']) { if (!T[n]) T[n] = tiledCanvas(n); if (!T[n]) texOk = false; }
  if (!_bake.wsmall) { const w = document.createElement('canvas'); w.width = GRID.W; w.height = GRID.H; _bake.wsmall = w; _bake.wctx = w.getContext('2d'); }
  if (!_bake.tmp) { const t = document.createElement('canvas'); t.width = BW; t.height = BH; _bake.tmp = t; _bake.tctx = t.getContext('2d'); }
  const wctx = _bake.wctx, tmp = _bake.tmp, tctx = _bake.tctx, N = GRID.N;

  if (!texOk) {   // запасной вариант, пока текстуры грузятся
    for (let y = 0; y < GRID.H; y++) for (let x = 0; x < GRID.W; x++) { const i = idx(x, y); cx.fillStyle = W.isWater[i] ? '#15364c' : '#566b39'; cx.fillRect(x * BAKE_CELL, y * BAKE_CELL, BAKE_CELL, BAKE_CELL); }
    if (!_terTex) { _terTex = new THREE.CanvasTexture(_terCanvas); _terTex.flipY = false; if (_3d.rend) _terTex.anisotropy = _3d.rend.capabilities.getMaxAnisotropy(); } else _terTex.needsUpdate = true; return;
  }

  const wImg = wctx.createImageData(GRID.W, GRID.H), wd = wImg.data;
  function pushWeights(fn) { for (let i = 0; i < N; i++) { wd[i * 4] = 255; wd[i * 4 + 1] = 255; wd[i * 4 + 2] = 255; wd[i * 4 + 3] = Math.round(clamp01(fn(i)) * 255); } wctx.putImageData(wImg, 0, 0); }
  function blend(name, fn) {
    tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, BW, BH); tctx.drawImage(T[name], 0, 0);
    pushWeights(fn);
    tctx.imageSmoothingEnabled = true; tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(_bake.wsmall, 0, 0, GRID.W, GRID.H, 0, 0, BW, BH);          // апскейл весов с билинейным сглаживанием → плавные границы
    tctx.globalCompositeOperation = 'source-over';
    cx.drawImage(tmp, 0, 0);
  }
  cx.globalCompositeOperation = 'source-over'; cx.imageSmoothingEnabled = true;
  cx.drawImage(T.grass, 0, 0);          // база — трава
  blend('sand', sandWeight);            // пляжи/пустыни
  blend('rock', rockWeight);            // склоны/голые вершины
  blend('snow', snowWeight);            // холод/высота

  // ЦВЕТ БИОМА поверх текстуры — теми же цветами BIOME_RENDER, что и в 2D (чтобы 3D совпадал с 2D), текстура просвечивает
  for (let i = 0; i < N; i++) { if (W.isWater[i]) { wd[i * 4 + 3] = 0; continue; } const bd = BIOME_RENDER[W.biome[i]], v = W.veg[i]; wd[i * 4] = lerp(bd.base[0], bd.lush[0], v) | 0; wd[i * 4 + 1] = lerp(bd.base[1], bd.lush[1], v) | 0; wd[i * 4 + 2] = lerp(bd.base[2], bd.lush[2], v) | 0; wd[i * 4 + 3] = Math.round(clamp01(0.52 + v * 0.26) * 255); }
  wctx.putImageData(wImg, 0, 0);
  cx.globalCompositeOperation = 'source-over'; cx.drawImage(_bake.wsmall, 0, 0, GRID.W, GRID.H, 0, 0, BW, BH);

  // дно водоёмов — затемнённое по глубине (под полупрозрачной водой читается как глубина)
  for (let i = 0; i < N; i++) { if (!W.isWater[i]) { wd[i * 4 + 3] = 0; continue; } const dep = clamp01(W.seaDepth[i] / 600); wd[i * 4] = lerp(32, 9, dep) | 0; wd[i * 4 + 1] = lerp(90, 38, dep) | 0; wd[i * 4 + 2] = lerp(120, 64, dep) | 0; wd[i * 4 + 3] = 255; }
  wctx.putImageData(wImg, 0, 0);
  cx.drawImage(_bake.wsmall, 0, 0, GRID.W, GRID.H, 0, 0, BW, BH);

  // СЛОЙ ДАННЫХ поверх рельефа (температура/осадки/экология/загрязнение/население/государства)
  const ov = (typeof currentOverlay !== 'undefined') ? currentOverlay : 'biome';
  if (ov !== 'biome' && ov !== 'currents' && ov !== 'wind') {
    for (let i = 0; i < N; i++) { const cc = overlayCell3D(i, ov); wd[i * 4] = cc[0]; wd[i * 4 + 1] = cc[1]; wd[i * 4 + 2] = cc[2]; wd[i * 4 + 3] = cc[3]; }
    wctx.putImageData(wImg, 0, 0);
    cx.drawImage(_bake.wsmall, 0, 0, GRID.W, GRID.H, 0, 0, BW, BH);
  }

  if (!_terTex) { _terTex = new THREE.CanvasTexture(_terCanvas); _terTex.flipY = false; if (_3d.rend) _terTex.anisotropy = _3d.rend.capabilities.getMaxAnisotropy(); } else _terTex.needsUpdate = true;
}
// цвет слоя данных для клетки (те же шкалы, что и в 2D) → [r,g,b,a]
function overlayCell3D(i, ov) {
  if (ov === 'temperature') { const t = clamp01((W.temp[i] + 30) / 75); return [clamp(t * 2, 0, 1) * 255 | 0, clamp(1 - Math.abs(t - 0.5) * 2, 0, 1) * 220 | 0, clamp((1 - t) * 2, 0, 1) * 255 | 0, 170]; }
  if (ov === 'humidity') { if (W.isWater[i]) return [0, 0, 0, 0]; const t = clamp01(W.precip[i] / 3000); return [lerp(245, 20, t) | 0, lerp(245, 90, t) | 0, lerp(245, 200, t) | 0, 170]; }
  if (ov === 'population') { if (W.isWater[i] || W.pop[i] <= 30) return [0, 0, 0, 0]; const t = clamp01(Math.log(W.pop[i]) / Math.log(120000)); return [lerp(255, 210, t) | 0, lerp(220, 30, t) | 0, lerp(80, 20, t) | 0, clamp(70 + t * 180, 0, 225) | 0]; }
  if (ov === 'political') { const sid = W.stateId[i]; if (sid < 0 || !states[sid] || !states[sid].alive) return [0, 0, 0, 0]; const c = states[sid].color; return [c[0], c[1], c[2], 150]; }
  if (ov === 'eco') { if (W.isWater[i]) return [0, 0, 0, 0]; const e = W.eco[i]; return [lerp(168, 60, e) | 0, lerp(70, 180, e) | 0, lerp(40, 70, e) | 0, 170]; }
  if (ov === 'pollution') { if (W.isWater[i]) return [0, 0, 0, 0]; const v = W.pollution[i]; if (v <= 0.02) return [0, 0, 0, 0]; return [lerp(140, 90, v) | 0, lerp(120, 30, v) | 0, lerp(120, 80, v) | 0, clamp(50 + v * 230, 0, 225) | 0]; }
  return [0, 0, 0, 0];
}

function mkInst(geo, max, texName, matOpts) {
  const o = matOpts || {}; if (texName && TEX[texName]) o.map = TEX[texName].tex;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(o), max);
  m.count = 0; m.userData = { max }; m.frustumCulled = false;
  // ЯВНО создаём буфер цветов (иначе шейдер компилируется без instanceColor → дома белые)
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  _3d.scene.add(m); return m;
}
// высота вершины меша (мелкое дно у берега — без глубоких обрывов)
const OCEAN_FLOOR = -0.7;
function meshH(j) { return W.isWater[j] ? Math.max(OCEAN_FLOOR, heightCell(j)) : heightCell(j); }
// точная высота ПОВЕРХНОСТИ рельефа в произвольной точке (билинейно) — объекты на ней не висят
function surfAt(gx, gz) {
  if (gx < 0) gx = 0; else if (gx > GRID.W - 1) gx = GRID.W - 1;
  if (gz < 0) gz = 0; else if (gz > GRID.H - 1) gz = GRID.H - 1;
  const x0 = gx | 0, z0 = gz | 0, x1 = Math.min(GRID.W - 1, x0 + 1), z1 = Math.min(GRID.H - 1, z0 + 1), fx = gx - x0, fz = gz - z0;
  const a = meshH(z0 * GRID.W + x0), b = meshH(z0 * GRID.W + x1), c = meshH(z1 * GRID.W + x0), d = meshH(z1 * GRID.W + x1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}
function buildBaseY(x, y) { return Math.max(0.02, surfAt(x + 0.5, y + 0.5)); }

function init3D() {
  if (_3d.scene) return true;
  if (!three3dReady()) return false;
  const cv = document.getElementById('canvas3d'); if (!cv) return false;
  let rend;
  try { rend = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { return false; }
  rend.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _3d.canvas = cv; _3d.rend = rend;
  AXIS_Y = new THREE.Vector3(0, 1, 0);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1020);
  scene.fog = new THREE.Fog(0x0a1020, 130, 320);
  _3d.scene = scene;
  _3d.cam = new THREE.PerspectiveCamera(52, 1.6, 0.1, 2000);
  const sun = new THREE.DirectionalLight(0xfff1d8, 0.8); sun.position.set(-55, 95, 35); scene.add(sun); _3d.sun = sun;
  scene.add(new THREE.HemisphereLight(0x9fb6d8, 0x35302a, 0.42));
  scene.add(new THREE.AmbientLight(0x404858, 0.2));
  _3d.m4 = new THREE.Matrix4(); _3d.q = new THREE.Quaternion(); _3d.v3a = new THREE.Vector3(); _3d.v3b = new THREE.Vector3(); _3d.col = new THREE.Color();
  _3d.ray = new THREE.Raycaster(); _3d.ndc = new THREE.Vector2();
  loadTextures(function () { if (_3d.ok) { bakeTerrain(); rebuild3D(); } });   // текстуры подгрузятся → перепечём
  bakeTerrain();
  _3d.bld = {
    tent: mkInst(geoTent(), 9000), house: mkInst(geoHouse(), 26000, 'wall_timber'), factory: mkInst(geoFactory(), 6000, 'wall_stone'),
    tower: mkInst(geoTower(), 14000, 'wall_glass'), landmark: mkInst(geoLandmark(), 1600, 'wall_stone'),
    field: mkInst(geoField(), 28000, 'field', { side: THREE.DoubleSide }), person: mkInst(geoPerson(), 8000),
  };
  // РАСТИТЕЛЬНОСТЬ: деревья/кусты — биллборды (крест из квадов) с прозрачной RGBA-текстурой, по биомам
  _3d.veg = {
    broadleaf: mkInst(geoTreeBillboard(), 16000, 'tree_broadleaf', { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
    conifer:   mkInst(geoTreeBillboard(), 16000, 'tree_conifer',   { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
    jungle:    mkInst(geoTreeBillboard(), 12000, 'tree_jungle',    { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
    bush:      mkInst(geoTreeBillboard(),  9000, 'bush',           { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
  };
  _3d.roads = new THREE.Group(); scene.add(_3d.roads);
  _3d.mov = new THREE.Group(); scene.add(_3d.mov);
  // курсор кисти в 3D — кольцо на рельефе
  _3d.brushRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 44), new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
  _3d.brushRing.rotation.x = -Math.PI / 2; _3d.brushRing.renderOrder = 999; _3d.brushRing.visible = false; scene.add(_3d.brushRing);
  // 3D-визуализация ВЕТРА: летящие штрихи над рельефом (видны при выборе инструмента «Ветер»)
  const WN = 320; const wpos = new Float32Array(WN * 2 * 3);
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  const wmesh = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({ color: 0xdcefff, transparent: true, opacity: 0.6 }));
  wmesh.frustumCulled = false; wmesh.visible = false; scene.add(wmesh);
  _3d.windL = { mesh: wmesh, pos: wpos, parts: [] };
  for (let k = 0; k < WN; k++) _3d.windL.parts.push({ x: Math.random() * GRID.W, y: Math.random() * GRID.H, life: Math.random() * 50 });
  // 3D-визуализация ТЕЧЕНИЙ: штрихи на воде, цвет по температуре (видны при слое/инструменте «Течения»)
  const CN = 300; const cpos = new Float32Array(CN * 2 * 3), ccol = new Float32Array(CN * 2 * 3);
  const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cgeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const cmesh = new THREE.LineSegments(cgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
  cmesh.frustumCulled = false; cmesh.visible = false; scene.add(cmesh);
  _3d.curL = { mesh: cmesh, pos: cpos, col: ccol, parts: [] };
  for (let k = 0; k < CN; k++) _3d.curL.parts.push({ x: Math.random() * GRID.W, y: Math.random() * GRID.H, life: Math.random() * 40 });
  // корабли-КОЛОНИСТЫ из симуляции (с флагом державы) — плывут к новым берегам, видны в 3D
  _3d.simShips = { pool: [], group: new THREE.Group() }; scene.add(_3d.simShips.group);
  for (let k = 0; k < 180; k++) {   // ≥ SHIP_CAP (150), чтобы ВСЕ суда отображались разом
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshLambertMaterial({ color: 0x6b4a2e })));
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), new THREE.MeshLambertMaterial({ color: 0x4a3320 })); mast.position.y = 0.32; g.add(mast);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.28), new THREE.MeshLambertMaterial({ color: 0xffffff })); flag.position.set(0, 0.46, 0.15); g.add(flag);
    g.visible = false; g.scale.setScalar(0.5); g.userData = { flag }; _3d.simShips.group.add(g); _3d.simShips.pool.push(g);   // корабли вдвое меньше
  }
  // метки СРАЖЕНИЙ в 3D — красные вспышки над спорной территорией
  _3d.battleM = [];
  for (let k = 0; k < 28; k++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.85, depthWrite: false })); m.visible = false; scene.add(m); _3d.battleM.push(m); }
  // подписи городов в 3D (слой «Города»)
  _3d.cityLabels = { pool: [], cache: {} };
  for (let k = 0; k < 34; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); sp.visible = false; sp.renderOrder = 1001; scene.add(sp); _3d.cityLabels.pool.push(sp); }
  // ЖИТЕЛИ (силуэты, ходят у населённых клеток вблизи камеры)
  _3d.people = { pool: [], active: [] };
  for (let k = 0; k < 260; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: personSilhouetteTex(), transparent: true, depthWrite: false })); sp.visible = false; sp.scale.set(0.09, 0.18, 1); scene.add(sp); _3d.people.pool.push(sp); }   // мельче домов
  // АРМИИ: солдаты (силуэты), флаги держав, техника (3D), снаряды/дроны (спрайты), окопы
  _3d.war = { soldiers: [], flags: [], proj: [], projState: [], trenches: [], vehN: 0 };
  for (let k = 0; k < 240; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: personSilhouetteTex(), transparent: true, depthWrite: false })); sp.visible = false; sp.scale.set(0.2, 0.4, 1); scene.add(sp); _3d.war.soldiers.push(sp); }
  for (let k = 0; k < 26; k++) { const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5), new THREE.MeshBasicMaterial({ color: 0x2a2a2a })); pole.position.y = 0.42; g.add(pole); const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); cloth.position.set(0.17, 0.72, 0); g.add(cloth); g.visible = false; g.userData = { cloth }; scene.add(g); _3d.war.flags.push(g); }
  for (let k = 0; k < 60; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd070, transparent: true, depthWrite: false, depthTest: false })); sp.visible = false; sp.scale.set(0.11, 0.11, 1); sp.renderOrder = 990; scene.add(sp); _3d.war.proj.push(sp); }
  for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.16), new THREE.MeshLambertMaterial({ color: 0x3a2e22 })); m.visible = false; scene.add(m); _3d.war.trenches.push(m); }
  _3d.war.vehM = mkInst(geoVehicle(), 90, null, {});
  buildTerrain3D(); buildWater3D(); bindCam3D(); resize3D();
  _3d.ok = true; return true;
}
// метки сражений в 3D (синхронизируются с массивом battles)
function updateBattles3D() {
  if (!_3d.battleM || typeof battles === 'undefined') return;
  const pool = _3d.battleM; let n = 0;
  const onDiplo = (typeof currentOverlay !== 'undefined') && (currentOverlay === 'political' || currentOverlay === 'battles');   // метки — на слоях «Дипломатия»/«Битвы»
  if (!onDiplo) { for (let k = 0; k < pool.length; k++) pool[k].visible = false; return; }
  for (let k = 0; k < battles.length && n < pool.length; k++) {
    const b = battles[k], m = pool[n++], pulse = 0.7 + 0.3 * Math.sin(_3d._t * 0.4 + b.x);
    m.visible = true; m.position.set(b.x + 0.5, surfAt(b.x + 0.5, b.y + 0.5) + 0.7 + pulse * 0.25, b.y + 0.5);
    m.scale.setScalar(0.7 + pulse * 0.5); m.material.opacity = clamp(0.4 + 0.5 * (b.life / 12), 0, 0.9); m.rotation.y = _3d._t * 0.1;
  }
  for (; n < pool.length; n++) pool[n].visible = false;
}
// текстура подписи города (кэш по имени)
function cityLabelTex(text, cap) {
  const L = _3d.cityLabels, key = (cap ? '*' : '') + text;
  if (L.cache[key]) return L.cache[key];
  const cv = document.createElement('canvas'), x = cv.getContext('2d');
  x.font = 'bold 30px system-ui, sans-serif'; const w = x.measureText(text).width;
  cv.width = Math.ceil(w + 26); cv.height = 44;
  x.font = 'bold 30px system-ui, sans-serif'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(8,12,22,0.74)'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = cap ? '#ffe28c' : '#eef4ff'; x.fillText(text, 13, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv); tex.userData = { aspect: cv.width / cv.height };
  L.cache[key] = tex; return tex;
}
// подписи городов (биллборды) — слой «Города», с проекцией и защитой от наслаивания
function updateCityLabels3D() {
  const L = _3d.cityLabels; if (!L) return;
  const show = typeof uiState !== 'undefined' && uiState.showCities && typeof cities !== 'undefined' && cities.length;
  if (!show) { for (let k = 0; k < L.pool.length; k++) L.pool[k].visible = false; return; }
  if (!_3d._lblV) _3d._lblV = new THREE.Vector3();
  const cam = _3d.cam, v = _3d._lblV, sorted = cities.slice().sort((a, b) => b.pop - a.pop), placed = []; let n = 0;
  for (const c of sorted) {
    if (n >= L.pool.length) break;
    const yy = surfAt(c.x + 0.5, c.y + 0.5) + 1.1; v.set(c.x + 0.5, yy, c.y + 0.5); v.project(cam);
    if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
    if (placed.some(p => Math.abs(p[0] - v.x) < 0.11 && Math.abs(p[1] - v.y) < 0.06)) continue;
    placed.push([v.x, v.y]);
    const sp = L.pool[n++], tex = cityLabelTex(c.name, c.capital);
    sp.material.map = tex; sp.material.needsUpdate = true; sp.visible = true;
    sp.position.set(c.x + 0.5, yy, c.y + 0.5);
    const dist = cam.position.distanceTo(sp.position), sc = clamp(dist * 0.035, 0.4, 4);
    sp.scale.set(sc * (tex.userData.aspect || 4), sc, 1);
  }
  for (; n < L.pool.length; n++) L.pool[n].visible = false;
}
// ЖИТЕЛИ: чёрные силуэты ходят у населённых клеток ВБЛИЗИ камеры; количество ∝ плотности
function updatePeople3D(dt) {
  const P = _3d.people; if (!P) return; const v = _3d.view;
  if (v.dist > 110) { if (P.active.length) { for (const a of P.active) { a.sp.visible = false; P.pool.push(a.sp); } P.active.length = 0; } return; }
  const radius = 6 + (110 - v.dist) / 12;
  const CITY_MIN = CIV.CITY_URBAN_MIN, TOWN_MIN = 700;
  for (let k = P.active.length - 1; k >= 0; k--) { const a = P.active[k], dx = a.gx - v.tx, dz = a.gz - v.tz; if (dx * dx + dz * dz > radius * radius * 1.4) { a.sp.visible = false; P.pool.push(a.sp); P.active.splice(k, 1); } }
  if ((_3d.frame & 3) === 0) {
    const cnt = {}; for (const a of P.active) cnt[a.cell] = (cnt[a.cell] || 0) + 1;
    const cx = Math.round(v.tx), cz = Math.round(v.tz), r = Math.ceil(radius);
    const cand = [];
    for (let y = cz - r; y <= cz + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inB(x, y)) continue; const i = idx(x, y); if (W.isWater[i] || W.pop[i] < 250) continue;
      const ddx = x + 0.5 - v.tx, ddz = y + 0.5 - v.tz, d2 = ddx * ddx + ddz * ddz; if (d2 > radius * radius) continue;
      cand.push([d2, i, x, y]);
    }
    cand.sort((a, b) => a[0] - b[0]);   // ближние к фокусу камеры — первыми (толпа собирается там, куда смотрим, а не на краю)
    for (let ci = 0; ci < cand.length && P.pool.length; ci++) {
      const i = cand[ci][1], x = cand[ci][2], y = cand[ci][3];
      const urb = W.urban[i] || 0, rt = W.rTier[i];
      // ТОЛПЫ только в посёлках/городах (по ОТРИСОВАННОМУ типу застройки), между полей — ОДИНОЧКИ; часть идёт ВДОЛЬ дорог
      let want = 0, wanderR = 0.6;
      if (rt === 2) { want = clamp(3 + Math.round(urb / 1400), 3, 9); wanderR = 0.42; }        // город — толпа
      else if (rt === 1) { want = clamp(1 + Math.round(urb / 1800), 1, 4); wanderR = 0.5; }     // деревня/посёлок — несколько
      else if (W.pop[i] > 1500 && rnd2(i, 3) < 0.5) want = 1;                                    // сельская местность — ОДИНОЧКА
      const have = cnt[i] || 0;
      const rang = (_3d.roadAng && _3d.roadAng[i] < 998) ? _3d.roadAng[i] : null;
      for (let n = have; n < want && P.pool.length; n++) {
        const sp = P.pool.pop(), sd = rnd2(i, n); sp.visible = true;
        if (rang !== null && rnd2(i, n + 13) < 0.5) {   // идёт ВДОЛЬ дороги
          const lim = 0.7 + sd * 0.7;
          P.active.push({ sp, cell: i, gx: x + 0.5, gz: y + 0.5, onRoad: true, rdx: Math.cos(rang), rdz: Math.sin(rang), perp: (rnd2(i, n + 5) - 0.5) * 0.12, lim, along: (sd - 0.5) * lim * 2, adir: rnd2(i, n + 9) < 0.5 ? 1 : -1, spd: 0.6 + sd * 0.9, px: 0, pz: 0, wait: 0 });
        } else {
          const px = (sd - 0.5) * wanderR * 1.4, pz = (rnd2(i, n + 7) - 0.5) * wanderR * 1.4;
          P.active.push({ sp, cell: i, gx: x + 0.5, gz: y + 0.5, onRoad: false, px, pz, tx: px, tz: pz, spd: 0.5 + sd * 0.9, range: wanderR, wait: 0 });
        }
      }
    }
  }
  // ДВИЖЕНИЕ: каждый идёт к своей точке-цели; дойдя — пауза и НОВАЯ случайная точка (свободное блуждание, а не «влево-вправо» на месте)
  const frozen = W.paused || (typeof uiState !== 'undefined' && uiState.speed === 0);   // на ПАУЗЕ люди стоят на месте
  for (const a of P.active) {
    if (!frozen) {
      if (a.onRoad) {
        // идёт ВДОЛЬ дороги туда-обратно (вдоль оси rdx,rdz), со смещением на «свою сторону» улицы
        a.along += a.adir * a.spd * dt * 0.1;
        if (a.along > a.lim) { a.along = a.lim; a.adir = -1; } else if (a.along < -a.lim) { a.along = -a.lim; a.adir = 1; }
        a.px = a.along * a.rdx - a.perp * a.rdz; a.pz = a.along * a.rdz + a.perp * a.rdx;
      } else {
        const dx = a.tx - a.px, dz = a.tz - a.pz, d = Math.hypot(dx, dz);
        const step = a.spd * dt * 0.12;
        if (a.wait > 0) { a.wait -= dt; }
        else if (d < 0.04 || d <= step) {
          a.px = a.tx; a.pz = a.tz;
          a.wait = 0.2 + Math.random() * 1.4;
          const ang = Math.random() * 6.2832, rr = a.range * (0.3 + Math.random() * 0.7);
          a.tx = Math.cos(ang) * rr; a.tz = Math.sin(ang) * rr;
        } else {
          const mv = Math.min(step, d);
          a.px += dx / d * mv; a.pz += dz / d * mv;
        }
      }
    }
    const gx = a.gx + a.px, gz = a.gz + a.pz;
    a.sp.position.set(gx, surfAt(gx, gz) + 0.17, gz);
  }
}
// РАСТИТЕЛЬНОСТЬ: деревья/кусты-биллборды по биомам (леса широколиственные/тайга/джунгли, в степях кусты)
function updateVegetation3D() {
  const V = _3d.veg; if (!V) return; const v = _3d.view;
  const ref = { broadleaf: { n: 0 }, conifer: { n: 0 }, jungle: { n: 0 }, bush: { n: 0 } };
  const flush = () => { for (const k in V) { V[k].count = ref[k].n; V[k].instanceMatrix.needsUpdate = true; if (V[k].instanceColor) V[k].instanceColor.needsUpdate = true; } };
  if (v.dist > 165) { flush(); return; }                 // слишком далеко — лес не рисуем
  if ((_3d.frame % 3) !== 0) return;                      // деревья статичны — пересобираем не каждый кадр (между сборками инстансы сохраняются)
  const radius = clamp(8 + (165 - v.dist) * 0.10, 10, 20);
  const cx = Math.round(v.tx), cz = Math.round(v.tz), r = Math.ceil(radius);
  let budget = 13000;
  for (let y = cz - r; y <= cz + r && budget > 0; y++) for (let x = cx - r; x <= cx + r && budget > 0; x++) {
    if (!inB(x, y)) continue; const i = idx(x, y); if (W.isWater[i]) continue;
    const ddx = x + 0.5 - v.tx, ddz = y + 0.5 - v.tz; if (ddx * ddx + ddz * ddz > radius * radius) continue;
    const spec = VEG_BIOME[W.biome[i]]; if (!spec) continue;
    const dev = clamp01((W.urban[i] || 0) / 2200) + 0.25 * clamp01(W.pop[i] / 22000);   // города/поля вырубают лес
    let count = Math.floor(spec.d * W.veg[i] * (1 - clamp01(dev) * 0.85) + rnd2(i, 1));   // дробную часть добиваем псевдослучайно
    if (count <= 0) continue; if (count > spec.d + 1) count = (spec.d + 1) | 0;
    const mesh = V[spec.mesh], rr = ref[spec.mesh], sz = VEG_SIZE[spec.mesh];
    for (let n = 0; n < count && budget > 0; n++, budget--) {
      const a1 = rnd2(i * 2 + 1, n * 7 + 3), a2 = rnd2(i * 5 + 2, n * 11 + 5), a3 = rnd2(i * 9 + 4, n * 13 + 7);
      const px = x + 0.12 + a1 * 0.76, pz = y + 0.12 + a2 * 0.76;
      const h = sz[0] * (0.7 + a3 * 0.6), w = h * sz[1];
      setInst(mesh, rr, px, surfAt(px, pz), pz, w, h, w, 0xffffff, 0.72 + a3 * 0.28, a1 * 6.2832);   // цвет берётся из текстуры; tint — лёгкая вариация яркости
    }
  }
  flush();
}
// АРМИИ у битв: две стороны солдат-силуэтов с флагами держав, техника (3D), окопы, снаряды/дроны (спрайты)
function updateBattleArmies3D(dt) {
  const Wr = _3d.war; if (!Wr) return; const v = _3d.view, vehM = Wr.vehM, vref = { n: 0 };
  let si = 0, fi = 0, ti = 0;
  if (v.dist < 95 && typeof battles !== 'undefined' && battles.length) {
    const list = battles.slice().sort((a, b) => ((a.x - v.tx) * (a.x - v.tx) + (a.y - v.tz) * (a.y - v.tz)) - ((b.x - v.tx) * (b.x - v.tx) + (b.y - v.tz) * (b.y - v.tz)));
    for (const b of list) {
      if (si > Wr.soldiers.length - 16) break;
      const dx = b.x + 0.5 - v.tx, dz = b.y + 0.5 - v.tz; if (dx * dx + dz * dz > 45 * 45) continue;
      const fx = b.x + 0.5, fz = b.y + 0.5, era = b.era || 0, inten = clamp01(0.4 + b.life / 14), nSol = clamp(Math.round(3 + inten * 4), 2, 7);
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1, col = side === 0 ? (b.attColor || [200, 200, 200]) : (b.defColor || [210, 90, 80]), baseX = fx + sign * 0.42;
        for (let n = 0; n < nSol && si < Wr.soldiers.length; n++) {
          const sp = Wr.soldiers[si++]; sp.visible = true;
          const ox = baseX + sign * (n % 2) * 0.16, oz = fz + (((n / 2) | 0) - nSol / 4) * 0.17 + Math.sin(_3d._t * 0.25 + n + side) * 0.03;
          sp.position.set(ox, surfAt(ox, oz) + 0.2, oz); sp.material.color.setRGB(0.12 + col[0] / 600, 0.12 + col[1] / 600, 0.12 + col[2] / 600);
        }
        if (fi < Wr.flags.length) { const g = Wr.flags[fi++]; g.visible = true; const flx = baseX + sign * 0.12, flz = fz - 0.32; g.position.set(flx, surfAt(flx, flz) + 0.02, flz); g.userData.cloth.material.color.setRGB(col[0] / 255, col[1] / 255, col[2] / 255); }
        if (era >= 3 && vref.n < 88) { const vx = baseX + sign * 0.32, vz = fz + 0.36; setInst(vehM, vref, vx, surfAt(vx, vz) + 0.02, vz, 0.72, 0.72, 0.72, (col[0] << 16) | (col[1] << 8) | col[2], 0.6, sign > 0 ? Math.PI : 0); }
      }
      if (!b.naval && era >= 2 && ti < Wr.trenches.length) { const m = Wr.trenches[ti++]; m.visible = true; m.position.set(fx, surfAt(fx, fz) + 0.05, fz); m.rotation.y = Math.PI / 2; }
      if (era >= 2 && b.life > 2 && Wr.projState.length < 50 && Math.random() < 0.13) Wr.projState.push({ x0: fx - 0.4, z0: fz, x1: fx + 0.4, z1: fz + (Math.random() - 0.5) * 0.4, t: 0, drone: era >= 4 && Math.random() < 0.4 });
    }
  }
  for (; si < Wr.soldiers.length; si++) Wr.soldiers[si].visible = false;
  for (; fi < Wr.flags.length; fi++) Wr.flags[fi].visible = false;
  for (; ti < Wr.trenches.length; ti++) Wr.trenches[ti].visible = false;
  vehM.count = vref.n; vehM.instanceMatrix.needsUpdate = true; if (vehM.instanceColor) vehM.instanceColor.needsUpdate = true;
  let pIdx = 0;
  for (let k = Wr.projState.length - 1; k >= 0; k--) {
    const p = Wr.projState[k]; p.t += dt * (p.drone ? 0.04 : 0.09);
    if (p.t >= 1 || pIdx >= Wr.proj.length) { if (p.t >= 1) Wr.projState.splice(k, 1); continue; }
    const sp = Wr.proj[pIdx++]; sp.visible = true;
    const gx = lerp(p.x0, p.x1, p.t), gz = lerp(p.z0, p.z1, p.t), arc = p.drone ? 1.4 : Math.sin(p.t * Math.PI) * 0.9;
    sp.position.set(gx, surfAt(gx, gz) + 0.3 + arc, gz); sp.material.color.setHex(p.drone ? 0xbfd6ff : 0xffd070);
  }
  for (; pIdx < Wr.proj.length; pIdx++) Wr.proj[pIdx].visible = false;
}
// показать корабли-колонисты (массив ships из симуляции) в 3D
function updateSimShips3D(dt) {
  if (!_3d.simShips || typeof ships === 'undefined') return;
  const pool = _3d.simShips.pool; let n = 0;
  const gs = (typeof uiState !== 'undefined' && !W.paused) ? uiState.speed : 0;
  const ease = Math.min(0.5, 0.14 * gs);   // дисплейный индекс плавно догоняет логический pi (быстрее на высокой скорости игры; на паузе — стоп)
  for (let k = 0; k < ships.length && n < pool.length; k++) {
    const sh = ships[k];                       // показываем ВСЕ суда: торговые, колонисты, десанты
    const g = pool[n++]; g.visible = true;
    let gx, gz, hx = 0, hz = 0;
    if (sh.path && sh.path.length >= 2) {
      // ПЛАВНОЕ движение: дробный индекс sh.dispU скользит к sh.pi, позиция интерполируется между клетками пути (без рывков по клеткам)
      if (sh.dispU === undefined) sh.dispU = sh.pi;
      sh.dispU += (sh.pi - sh.dispU) * ease;
      const maxU = sh.path.length - 1, u = sh.dispU < 0 ? 0 : sh.dispU > maxU ? maxU : sh.dispU;
      const seg = Math.min(sh.path.length - 2, Math.floor(u)), f = u - seg;
      const a = sh.path[seg], b = sh.path[seg + 1];
      const ax = a % GRID.W, az = (a / GRID.W) | 0, bx = b % GRID.W, bz = (b / GRID.W) | 0;
      gx = lerp(ax, bx, f) + 0.5; gz = lerp(az, bz, f) + 0.5; hx = bx - ax; hz = bz - az;
    } else { gx = sh.x + 0.5; gz = sh.y + 0.5; }
    g.position.set(gx, 0.12 + Math.sin(_3d._t * 0.1 + gx) * 0.03, gz);
    if (hx || hz) g.rotation.y = Math.atan2(-hz, hx);
    const fc = sh.invade ? [230, 40, 40] : (sh.color || [255, 255, 255]);   // флаг: десант — красный, иначе цвет державы
    g.userData.flag.material.color.setRGB(fc[0] / 255, fc[1] / 255, fc[2] / 255);
  }
  for (; n < pool.length; n++) pool[n].visible = false;
}
// поток течений: частицы дрейфуют по полю течений (только вода), цвет по температуре (тёплое/холодное)
function updateCurrents3D(dt) {
  const L = _3d.curL, parts = L.parts, pos = L.pos, col = L.col;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k], cx = clamp(Math.round(p.x), 0, GRID.W - 1), cy = clamp(Math.round(p.y), 0, GRID.H - 1), ci = idx(cx, cy);
    const u = W.isWater[ci] ? bilinear(W.currentU, p.x - 0.5, p.y - 0.5) : 0, v = W.isWater[ci] ? bilinear(W.currentV, p.x - 0.5, p.y - 0.5) : 0;
    const nx = p.x + u * 0.5 * dt, ny = p.y + v * 0.5 * dt; p.life -= dt; const o = k * 6;
    if (!W.isWater[ci] || Math.hypot(u, v) < 0.04 || p.life <= 0 || nx < 0 || nx >= GRID.W || ny < 0 || ny >= GRID.H) {
      p.x = Math.random() * GRID.W; p.y = Math.random() * GRID.H; p.life = 18 + Math.random() * 40;
      pos[o] = pos[o + 3] = p.x; pos[o + 2] = pos[o + 5] = p.y; pos[o + 1] = pos[o + 4] = -8; continue;   // спрятать до следующего кадра
    }
    const warm = clamp01((W.temp[ci] - 6) / 18), r = lerp(0.24, 0.92, warm), g = lerp(0.62, 0.37, warm), b = lerp(0.92, 0.29, warm);
    pos[o] = p.x; pos[o + 1] = 0.05; pos[o + 2] = p.y; pos[o + 3] = nx; pos[o + 4] = 0.05; pos[o + 5] = ny;
    col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
    p.x = nx; p.y = ny;
  }
  L.mesh.geometry.attributes.position.needsUpdate = true; L.mesh.geometry.attributes.color.needsUpdate = true;
}
// поток воздуха: частицы дрейфуют по полю ветра, рисуем короткие штрихи (хвост→голова)
function updateWind3D(dt) {
  const L = _3d.windL, parts = L.parts, pos = L.pos;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    const u = bilinear(W.windU, p.x - 0.5, p.y - 0.5), v = bilinear(W.windV, p.x - 0.5, p.y - 0.5);
    const nx = p.x + u * 0.6 * dt, ny = p.y + v * 0.6 * dt; p.life -= dt;
    if (p.life <= 0 || nx < 0 || nx >= GRID.W || ny < 0 || ny >= GRID.H) { p.x = Math.random() * GRID.W; p.y = Math.random() * GRID.H; p.life = 24 + Math.random() * 46; continue; }
    const o = k * 6;
    pos[o] = p.x; pos[o + 1] = surfAt(p.x, p.y) + 1.3; pos[o + 2] = p.y;
    pos[o + 3] = nx; pos[o + 4] = surfAt(nx, ny) + 1.3; pos[o + 5] = ny;
    p.x = nx; p.y = ny;
  }
  L.mesh.geometry.attributes.position.needsUpdate = true;
}

// ---- рельеф ----
function vColor(i, out) {
  if (W.isWater[i]) { out[0] = 0.05; out[1] = 0.14; out[2] = 0.26; return; }
  const bd = BIOME_RENDER[W.biome[i]], veg = W.veg[i];
  let r = lerp(bd.base[0], bd.lush[0], veg) / 255, g = lerp(bd.base[1], bd.lush[1], veg) / 255, b = lerp(bd.base[2], bd.lush[2], veg) / 255;
  const lh = (W.elev[i] - W.seaLevel) / (1 - W.seaLevel), tC = W.temp[i];
  const snow = clamp01((0.5 - tC) / 7) * clamp01(0.25 + lh * 1.6);
  if (snow > 0) { r = lerp(r, 0.92, snow); g = lerp(g, 0.94, snow); b = lerp(b, 0.97, snow); }
  out[0] = clamp01(r * 0.9); out[1] = clamp01(g * 0.9); out[2] = clamp01(b * 0.9);
}
function buildTerrain3D() {
  const Wd = GRID.W, Hd = GRID.H, N = Wd * Hd;
  let geo = _3d.terGeo; const fresh = !geo;
  if (fresh) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
    const idxA = []; for (let y = 0; y < Hd - 1; y++) for (let x = 0; x < Wd - 1; x++) { const a = y * Wd + x; idxA.push(a, a + Wd, a + 1, a + 1, a + Wd, a + Wd + 1); }
    geo.setIndex(idxA); _3d.terGeo = geo;
    const uv = geo.attributes.uv.array;
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = y * Wd + x; uv[i * 2] = x / (Wd - 1); uv[i * 2 + 1] = y / (Hd - 1); }
  }
  const pos = geo.attributes.position.array;
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = y * Wd + x, vi = i * 3; pos[vi] = x; pos[vi + 1] = meshH(i); pos[vi + 2] = y; }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  if (fresh) { _3d.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: _terTex })); _3d.scene.add(_3d.terrain); }
}
function buildWater3D() {
  const geo = new THREE.PlaneGeometry(GRID.W + 2, GRID.H + 2, 36, 28); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x174f70, transparent: true, opacity: 0.74, shininess: 24, specular: 0x21384a }));   // мягкий блик — без белого «зеркала»
  m.position.set(GRID.W / 2, -0.12, GRID.H / 2); _3d.water = m; _3d.scene.add(m);   // ниже уровня — мелкий берег не затоплен
  _3d._waterBase = Float32Array.from(geo.attributes.position.array);
}

// ---- поселения по эпохам ----
function setInst(mesh, ref, x, y, z, sx, sy, sz, hex, tint, yaw) {
  if (ref.n >= mesh.userData.max) return;
  _3d.q.setFromAxisAngle(AXIS_Y, yaw || 0); _3d.v3b.set(x, y, z); _3d.v3a.set(sx, sy, sz); _3d.m4.compose(_3d.v3b, _3d.q, _3d.v3a);
  mesh.setMatrixAt(ref.n, _3d.m4); _3d.col.setHex(hex).multiplyScalar(tint || 1); mesh.setColorAt(ref.n, _3d.col); ref.n++;
}
function updateSettlements3D() {
  const B = _3d.bld; if (!B) return;
  const c = { tent: { n: 0 }, house: { n: 0 }, factory: { n: 0 }, tower: { n: 0 }, landmark: { n: 0 }, field: { n: 0 }, person: { n: 0 } };
  const TOWN_MIN = 700, CITY_MIN = CIV.CITY_URBAN_MIN;   // пороги: посёлок / настоящий город
  const lmCount = {};                                     // лимит храмов/дворцов на державу (чтобы берега не были в «пирамидах»)
  let budget = 32000;   // запас под пригороды/разросшиеся города (инстансы дешёвые)
  // единый масштаб зданий в МИРОВЫХ единицах: put(kind, x, by, z, ширина_следа, полная_высота, ...) — небоскрёбы реально выше домов, а не наоборот
  const GB = { house: [0.5, 0.76], tower: [0.4, 1.0], factory: [0.72, 0.5], tent: [0.84, 0.72] };   // [база ширины, база высоты] геометрий
  const put = (kind, px, by, pz, w, h, hex, tint, yaw) => { const g = GB[kind]; setInst(B[kind], c[kind], px, by, pz, w / g[0], h / g[1], w / g[0], hex, tint, yaw); };
  // ПОЛЕ по рельефу: плоскость НАКЛОНЯЕТСЯ по склону (нормаль рельефа), а не висит горизонтально
  const _up = new THREE.Vector3(0, 1, 0), _nrm = new THREE.Vector3(), _qt = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qf = new THREE.Quaternion();
  const putField = (fx, fz, w, hex, tint, yaw) => {
    const e = 0.34; _nrm.set(surfAt(fx - e, fz) - surfAt(fx + e, fz), 2 * e, surfAt(fx, fz - e) - surfAt(fx, fz + e)).normalize();
    _qt.setFromUnitVectors(_up, _nrm); _qy.setFromAxisAngle(AXIS_Y, yaw || 0); _qf.copy(_qt).multiply(_qy);
    _3d.v3b.set(fx, surfAt(fx, fz) + 0.03, fz); _3d.v3a.set(w, 1, w); _3d.m4.compose(_3d.v3b, _qf, _3d.v3a);
    B.field.setMatrixAt(c.field.n, _3d.m4); _3d.col.setHex(hex).multiplyScalar(tint || 1); B.field.setColorAt(c.field.n, _3d.col); c.field.n++;
  };
  for (let i = 0; i < GRID.N && budget > 0; i++) {
    const pop = W.pop[i]; if (W.isWater[i] || pop < 200) continue;
    const x = i % GRID.W, y = (i / GRID.W) | 0, st = stateOf3(i), sid = st ? st.id : -1, era = st ? st.era : 0, isCap = st && st.capital === i;
    const baseY = buildBaseY(x, y);
    const popF = clamp01(pop / 80000);
    const urban = W.urban[i] || 0, urbanF = clamp01(urban / 8000);
    // ВИЗУАЛЬНАЯ крутизна по 3D-высоте (HS=13 ⇒ небольшой перепад elev = крутой склон на экране) — НЕ W.slope
    const sl3 = Math.hypot(surfAt(x + 1.5, y + 0.5) - surfAt(x - 0.5, y + 0.5), surfAt(x + 0.5, y + 1.5) - surfAt(x + 0.5, y - 0.5)) * 0.5;
    const slopeNoBuild = sl3 > 0.7, slopeNoField = sl3 > 1.5;     // на склоне нет зданий; на обрыве нет и полей
    // КЛАСС ЗАСТРОЙКИ с ГИСТЕРЕЗИСОМ: 2=город · 1=центр поселения (деревня) · 0=село. Скопления домов — ТОЛЬКО в центрах (лок. максимумах урбана), между ними поля → «здесь село, здесь город», и НЕ мерцает по сезонам
    let maxNb = 0; for (const d of NB8) { const nx = x + d[0], ny = y + d[1]; if (!inB(nx, ny)) continue; const u = W.urban[idx(nx, ny)] || 0; if (u > maxNb) maxNb = u; }
    let rc; const pc = W.rTier[i];
    if (pc === 255) rc = (urban >= CITY_MIN && pop >= CIV.CITY_POP_MIN) ? 2 : (urban >= 450 && urban >= maxNb) ? 1 : 0;
    else {
      rc = pc;
      if (rc < 2 && urban >= CITY_MIN + 600 && pop >= CIV.CITY_POP_MIN + 2000) rc = 2;            // повышение до города — с запасом
      else if (rc === 0 && urban >= 600 && urban >= maxNb + 120) rc = 1;                           // до центра — явный локальный максимум
      if (rc === 2 && (urban < CITY_MIN - 600 || pop < CIV.CITY_POP_MIN - 2500)) rc = (urban >= 350 && urban >= maxNb * 0.7) ? 1 : 0;
      else if (rc === 1 && (urban < 300 || urban < maxNb * 0.7)) rc = 0;
    }
    W.rTier[i] = rc;
    const cityNow = rc === 2, center = rc === 1;
    // дистанция до ближайшего ГОРОДА (в радиусе 2) + размер этого города → город РАЗРАСТАЕТСЯ на соседние клетки (метрополия)
    let cityDist = 9, cityPop = 0;
    if (!cityNow) { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (W.rTier[ni] === 2) { const dd = Math.max(Math.abs(dx), Math.abs(dy)); if (dd < cityDist) cityDist = dd; if (W.pop[ni] > cityPop) cityPop = W.pop[ni]; } } }
    // ЛЕНДМАРК столицы — всегда (резиденция)
    if (isCap && !slopeNoBuild) setInst(B.landmark, c.landmark, x + 0.5, baseY, y + 0.5, 0.5 + popF * 0.2, 0.6 + popF * 0.4 + era * 0.06, 0.5 + popF * 0.2, 0xeee6d6, 0.95, rnd2(i, 99) * 6.28);

    // ===== ГОРОД: плотная застройка (каждая городская клетка = метрополия), небоскрёбы только эпоха 4+ =====
    if (cityNow && !slopeNoBuild) {
      if (!isCap && urban > 6500 && era >= 2 && (lmCount[sid] || 0) < 1) { lmCount[sid] = 1; setInst(B.landmark, c.landmark, x + 0.5, baseY, y + 0.5, 0.42 + popF * 0.18, 0.5 + popF * 0.35 + era * 0.05, 0.42 + popF * 0.18, era >= 4 ? 0xdfeaf4 : 0xe2dccb, 0.92, rnd2(i, 77) * 6.28); }
      const cnt = clamp(Math.round(7 + urbanF * urbanF * 12 + popF * 12), 7, 26);             // больше население → больше зданий (город растёт)
      const gridN = Math.max(2, Math.ceil(Math.sqrt(cnt))), usable = 0.86 + popF * 0.95, step = usable / gridN, fw = Math.min(0.2, step * 0.6);   // крупный город ЗАМЕТНО выходит за клетку (центр разрастается на соседние)
      const half = (gridN - 1) / 2, maxDc = Math.hypot(half, half) || 1;
      const rang = (_3d.roadAng && _3d.roadAng[i] < 998) ? _3d.roadAng[i] : (rnd2(i, 71) - 0.5) * 3.14159, ca = Math.cos(rang), sa = Math.sin(rang);
      for (let b = 0; b < cnt && budget > 0; b++, budget--) {
        const gx = b % gridN, gy = (b / gridN) | 0;
        const a1 = rnd2(i * 3 + 1, b * 13 + 3), a2 = rnd2(i * 7 + 5, b * 17 + 9), a3 = rnd2(i * 11 + 2, b * 23 + 7);
        const lx = (gx - half) * step * 1.12 + (a1 - 0.5) * step * 0.45, lz = (gy - half) * step * 0.95 + (a2 - 0.5) * step * 0.45;
        const px = x + 0.5 + lx * ca - lz * sa, pz = y + 0.5 + lx * sa + lz * ca, yaw = rang + (a3 - 0.5) * 0.5;
        const by = Math.max(0.02, surfAt(px, pz)), central = 1 - Math.hypot(gx - half, gy - half) / maxDc;
        if (era >= 4) {
          const big = central * (0.55 + urbanF * 0.45);
          if (big > 0.4 && a3 < 0.9) put('tower', px, by, pz, fw * (0.95 + central * 0.25), 0.5 + big * 0.8 + a3 * 0.2, era >= 5 ? 0xdfedff : 0xc9dae8, 0.84 + a3 * 0.28, yaw);
          else if (a3 < 0.62) put('tower', px, by, pz, fw * 0.9, 0.3 + a3 * 0.4 + central * 0.3, 0xc2d0da, 0.85 + a3 * 0.2, yaw);
          else if (a3 < 0.8) put('factory', px, by, pz, fw, 0.22 + a3 * 0.16, 0xdde3e9, 0.85, yaw);
          else put('house', px, by, pz, fw, 0.2 + a3 * 0.12, 0xe7ecf0, 0.85, yaw);
        } else if (era === 3) {
          if (a1 < 0.3) put('factory', px, by, pz, fw * 1.05, 0.26 + a3 * 0.2, 0xd6c8b2, 0.85, yaw);
          else put('house', px, by, pz, fw * 1.05, 0.2 + a3 * 0.16, 0xd9cbb2, 0.85, yaw);
        } else put('house', px, by, pz, fw, 0.19 + a3 * 0.1, era >= 2 ? 0xe6ddc8 : 0xd8c39c, 0.82 + a3 * 0.3, yaw);
      }
      continue;
    }

    // ===== ПОЛЯ — сельхоз-фон (везде, кроме плотного города, ближнего кольца метрополии и обрыва) =====
    if (era >= 1 && pop > 300 && !slopeNoField && cityDist > 1) { const nf = 3 + ((rnd2(i, 21) * 3) | 0); for (let q = 0; q < nf && budget > 0; q++, budget--) {
      const fx = x + 0.16 + rnd2(i, q * 5 + 1) * 0.68, fz = y + 0.16 + rnd2(i, q * 5 + 2) * 0.68;
      putField(fx, fz, 0.28 + rnd2(i, q * 5 + 3) * 0.2, 0xf3efe0, 0.9 + rnd2(i, q * 5 + 4) * 0.18, rnd2(i, q * 5 + 5) * 1.57);
    } }
    if (slopeNoBuild) continue;   // на склоне — только поля, без домов

    // ===== РАЗРАСТАНИЕ МЕТРОПОЛИИ на соседние клетки: ближнее кольцо (1) — высотки ПОНИЖЕ центра; дальнее (2) — малоэтажки =====
    if (cityDist <= 2 && era >= 1) {
      const bigF = clamp01(cityPop / 50000), inner = cityDist === 1;     // масштаб соседнего города; ближнее кольцо плотнее/выше
      const cnt = inner ? clamp(Math.round(6 + bigF * 11), 6, 17) : clamp(Math.round(5 + bigF * 6), 5, 12);
      const gridN = Math.max(3, Math.ceil(Math.sqrt(cnt))), usable = inner ? 0.88 : 0.82, step = usable / gridN, fw = Math.min(0.19, step * 0.6);
      const half = (gridN - 1) / 2;
      const rang = (_3d.roadAng && _3d.roadAng[i] < 998) ? _3d.roadAng[i] : (rnd2(i, 71) - 0.5) * 3.14159, ca = Math.cos(rang), sa = Math.sin(rang);
      const hMul = inner ? (0.5 + bigF * 0.38) : 0.4;                     // высота относительно центра города → ниже к окраинам
      for (let b = 0; b < cnt && budget > 0; b++, budget--) {
        const gx = b % gridN, gy = (b / gridN) | 0;
        const a1 = rnd2(i * 3 + 1, b * 13 + 3), a2 = rnd2(i * 7 + 5, b * 17 + 9), a3 = rnd2(i * 11 + 2, b * 23 + 7);
        const lx = (gx - half) * step * 1.12 + (a1 - 0.5) * step * 0.45, lz = (gy - half) * step * 0.95 + (a2 - 0.5) * step * 0.45;
        const px = x + 0.5 + lx * ca - lz * sa, pz = y + 0.5 + lx * sa + lz * ca, yaw = rang + (a3 - 0.5) * 0.5, by = Math.max(0.02, surfAt(px, pz));
        if (era >= 4 && inner && bigF > 0.3) {
          if (a3 < 0.3 + bigF * 0.25) put('tower', px, by, pz, fw * 0.95, (0.45 + bigF * 0.5 + a3 * 0.2) * hMul + 0.15, era >= 5 ? 0xdfedff : 0xc9dae8, 0.84 + a3 * 0.24, yaw);   // НЕБОСКРЁБ пониже центра (разрастание!)
          else if (a3 < 0.6) put('tower', px, by, pz, fw * 0.9, 0.25 + a3 * 0.3, 0xc2d0da, 0.85, yaw);                                          // средняя застройка
          else if (a3 < 0.78) put('factory', px, by, pz, fw, 0.22 + a3 * 0.14, 0xdde3e9, 0.85, yaw);
          else put('house', px, by, pz, fw, 0.17 + a3 * 0.08, 0xe7ecf0, 0.85, yaw);
        } else if (era >= 3 && inner && a1 < 0.28) put('factory', px, by, pz, fw, 0.22 + a3 * 0.16, 0xd6c8b2, 0.85, yaw);
        else put('house', px, by, pz, 0.15 + a1 * 0.04, 0.15 + a3 * 0.06, era >= 4 ? 0xeef2f6 : era >= 2 ? 0xe6ddc8 : 0xd8c39c, 0.84 + a3 * 0.28, yaw);
      }
      continue;
    }

    // ===== ЦЕНТР ПОСЕЛЕНИЯ: деревня/посёлок — СКОПЛЕНИЕ домов (только в локальных пиках урбана, не на каждой клетке) =====
    if (center) {
      const n = clamp(Math.round(2 + (urban - 450) / 280), 2, 9);
      const rang = (_3d.roadAng && _3d.roadAng[i] < 998) ? _3d.roadAng[i] : (rnd2(i, 71) - 0.5) * 3.14159, ca = Math.cos(rang), sa = Math.sin(rang);
      const vcx = x + 0.5 + (rnd2(i, 53) - 0.5) * 0.24, vcz = y + 0.5 + (rnd2(i, 54) - 0.5) * 0.24;
      for (let b = 0; b < n && budget > 0; b++, budget--) {
        const a1 = rnd2(i * 3 + 1, b * 13 + 3), a2 = rnd2(i * 7 + 5, b * 17 + 9), a3 = rnd2(i * 11 + 2, b * 23 + 7);
        const lx = (a1 - 0.5) * 0.5, lz = (b - n / 2) * 0.12 + (a2 - 0.5) * 0.12;
        const px = vcx + lx * ca - lz * sa, pz = vcz + lx * sa + lz * ca, yaw = rang + (a3 - 0.5) * 0.5, by = Math.max(0.02, surfAt(px, pz));
        if (era >= 3 && b === 0 && a1 < 0.4) put('factory', px, by, pz, 0.2, 0.24, era >= 4 ? 0xdde3e9 : 0xd6c8b2, 0.85, yaw);
        else put('house', px, by, pz, 0.17 + a1 * 0.04, 0.16 + a3 * 0.06, era >= 4 ? 0xe7ecf0 : era >= 2 ? 0xe6ddc8 : 0xd8c39c, 0.82 + a3 * 0.3, yaw);
      }
      continue;
    }

    // ===== СЕЛЬСКАЯ МЕСТНОСТЬ (не центр): только поля + ОЧЕНЬ редкий одиночный дом/хутор =====
    let nb = 0; const rr0 = rnd2(i, 41);
    if (era === 0) nb = rnd2(i, 44) < 0.35 ? 1 : 0;                                   // редкие кочевья
    else if (rr0 < 0.07 && urban > 150) nb = 1 + (rnd2(i, 42) < 0.4 ? 1 : 0);          // изредка дом-два (хутор)
    const hcx = x + 0.3 + rnd2(i, 51) * 0.4, hcz = y + 0.3 + rnd2(i, 52) * 0.4;
    for (let b = 0; b < nb && budget > 0; b++, budget--) {
      const a1 = rnd2(i * 3 + 1, b * 13 + 3), a2 = rnd2(i * 7 + 5, b * 17 + 9), a3 = rnd2(i * 11 + 2, b * 23 + 7);
      const px = hcx + (a1 - 0.5) * 0.22, pz = hcz + (a2 - 0.5) * 0.22, yaw = a3 * 6.28, by = Math.max(0.02, surfAt(px, pz));
      if (era === 0) put('tent', px, by, pz, 0.30, 0.26, 0x7a5230, 0.8 + a3 * 0.3, yaw);
      else put('house', px, by, pz, 0.18, 0.17, era >= 2 ? 0xe6ddc8 : 0xd8c39c, 0.85, yaw);
    }
  }
  for (const k in B) { B[k].count = c[k].n; B[k].instanceMatrix.needsUpdate = true; if (B[k].instanceColor) B[k].instanceColor.needsUpdate = true; }
}

// ---- дороги: путь по СУШЕ (BFS от столицы), лента по рельефу, огибает воду ----
function bfsLand(start) {
  _bfsPar.fill(-1); _bfsPar[start] = start; const q = [start]; let h = 0;
  while (h < q.length) { const i = q[h++], x = i % GRID.W, y = (i / GRID.W) | 0; for (const d of NB8) { const nx = x + d[0], ny = y + d[1]; if (!inB(nx, ny)) continue; const ni = idx(nx, ny); if (W.isWater[ni] || (_3d.slope3D && _3d.slope3D[ni] > 0.95) || _bfsPar[ni] !== -1) continue; _bfsPar[ni] = i; q.push(ni); } }   // дороги огибают ВИЗУАЛЬНО крутые склоны (3D-высота), берег не считаем крутым
  return _bfsPar;
}
function buildRoadRibbon(path, out, width) {
  const Wd = width || 0.12, lift = 0.14;
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    const ax = a % GRID.W + 0.5, az = (a / GRID.W | 0) + 0.5, bx = b % GRID.W + 0.5, bz = (b / GRID.W | 0) + 0.5;
    const ay = buildBaseY(a % GRID.W, (a / GRID.W) | 0) + lift, by = buildBaseY(b % GRID.W, (b / GRID.W) | 0) + lift;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, px = -dz / L * Wd, pz = dx / L * Wd;
    out.push(ax + px, ay, az + pz, bx + px, by, bz + pz, ax - px, ay, az - pz, ax - px, ay, az - pz, bx + px, by, bz + pz, bx - px, by, bz - pz);
  }
}
// заметные поселения державы (НЕ только «города») — узлы дорожной сети во все эпохи
function settlementNodes(sid, cap) {
  const out = [];
  const st = states[sid]; if (!st) return out;
  st.cells.forEach(i => { if (i !== cap && (W.urban[i] > 400 || W.pop[i] > 2200)) out.push(i); });
  return out;
}
const ERA_ROAD_W = [0.07, 0.09, 0.12, 0.16, 0.20, 0.22];                          // тропа → мощёная дорога
const ERA_ROAD_COL = [0x6e5a3e, 0x796244, 0x8a7351, 0x9a8a78, 0xa7a39a, 0xb6b3ab];
function updateRoads3D() {
  // 3D-крутизна клетки (по экранной высоте, HS=13) — чтобы дороги ОГИБАЛИ крутые склоны, а не W.slope (он мал на видимо-крутом рельефе)
  if (!_3d.slope3D) _3d.slope3D = new Float32Array(GRID.N);
  for (let i = 0; i < GRID.N; i++) { if (W.isWater[i]) { _3d.slope3D[i] = 0; continue; } const x = i % GRID.W, y = (i / GRID.W) | 0; _3d.slope3D[i] = Math.hypot(surfAt(x + 1.5, y + 0.5) - surfAt(x - 0.5, y + 0.5), surfAt(x + 0.5, y + 1.5) - surfAt(x + 0.5, y - 0.5)) * 0.5; }
  buildTradeRoutes();
  // карта НАПРАВЛЕНИЯ дороги в клетке (для расстановки домов ВДОЛЬ улиц) — 999 = дороги нет
  if (!_3d.roadAng) _3d.roadAng = new Float32Array(GRID.N);
  _3d.roadAng.fill(999);
  for (const r of _3d.routes.land) { const p = r.path; for (let k = 0; k < p.length - 1; k++) { const a = p[k], b = p[k + 1]; const ang = Math.atan2((b / GRID.W | 0) - (a / GRID.W | 0), (b % GRID.W) - (a % GRID.W)); _3d.roadAng[a] = ang; _3d.roadAng[b] = ang; } }
  disposeChildren(_3d.roads);
  const byEra = {};
  for (const r of _3d.routes.land) { const era = clamp(r.era | 0, 0, 5); (byEra[era] = byEra[era] || []); buildRoadRibbon(r.path, byEra[era], ERA_ROAD_W[era] * (r.inter ? 1.3 : 1)); }
  for (const eraStr in byEra) {
    const verts = byEra[eraStr], era = +eraStr; if (!verts.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3)); g.computeVertexNormals(); g.computeBoundingSphere();
    _3d.roads.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: ERA_ROAD_COL[era], side: THREE.DoubleSide, transparent: true, opacity: era <= 1 ? 0.8 : 0.95 })));
  }
}

// ---- торговые маршруты: внутри- и МЕЖгосударственные (суша / море / воздух) ----
function eraOfCell3(i) { const st = stateOf3(i); return st ? st.era : 0; }
function tracePath(par, cap, target) {
  if (target !== cap && par[target] === -1) return null;
  const path = []; let cur = target, guard = 0;
  while (cur !== cap && cur !== -1 && guard++ < 700) { path.push(cur); cur = par[cur]; }
  path.push(cap); return path.length >= 2 ? path.reverse() : null;
}
function pPoint(i) { return [i % GRID.W + 0.5, (i / GRID.W | 0) + 0.5]; }
function cellsToPoints(cells) { const o = []; for (const i of cells) o.push(pPoint(i)); return o; }
function portWaterCell(i) { const x = i % GRID.W, y = (i / GRID.W) | 0; for (const d of NB8) { const nx = x + d[0], ny = y + d[1]; if (inB(nx, ny) && W.isWater[idx(nx, ny)]) return idx(nx, ny); } return -1; }
function d2cell(a, b) { const dx = a % GRID.W - b % GRID.W, dy = (a / GRID.W | 0) - (b / GRID.W | 0); return dx * dx + dy * dy; }
function landPath(fromI, toI) {   // путь по суше между двумя клетками (огибает воду)
  const par = bfsLand(fromI);
  if (toI !== fromI && par[toI] === -1) return null;
  const path = []; let cur = toI, guard = 0;
  while (cur !== fromI && cur !== -1 && guard++ < 700) { path.push(cur); cur = par[cur]; }
  path.push(fromI); return path.length >= 2 ? path.reverse() : null;
}
function buildTradeRoutes() {
  const land = [], sea = [], air = [], alive = states.filter(s => s.alive);
  // 1) внутри державы: ДЕРЕВО дорог (каждый узел → ближайший уже подключённый) — ветвящаяся сеть, не «макароны»
  for (const st of alive) {
    const cap = st.capital, nodes = [];
    st.cells.forEach(i => { if (i !== cap && (W.urban[i] > 900 || W.pop[i] > 6000)) nodes.push(i); });   // только заметные поселения
    nodes.sort((a, b) => W.pop[b] - W.pop[a]); if (nodes.length > 24) nodes.length = 24;
    nodes.sort((a, b) => d2cell(a, cap) - d2cell(b, cap));                                                // ближние к столице — первыми
    const connected = [cap];
    for (const n of nodes) {
      let best = cap, bd = Infinity;
      for (const c of connected) { const d = d2cell(n, c); if (d < bd) { bd = d; best = c; } }              // ближайший уже подключённый узел
      const p = landPath(best, n); if (p) land.push({ path: p, era: st.era, inter: false });
      connected.push(n);
    }
  }
  // 2) между СОСЕДНИМИ державами: дорога столица↔столица + авиамаршрут (эпоха 4+)
  const pairs = new Set();
  for (let i = 0; i < GRID.N; i++) {
    const a = W.stateId[i]; if (a < 0) continue; const x = i % GRID.W, y = (i / GRID.W) | 0;
    if (x < GRID.W - 1) { const b = W.stateId[i + 1]; if (b >= 0 && b !== a) pairs.add(Math.min(a, b) + '_' + Math.max(a, b)); }
    if (y < GRID.H - 1) { const b = W.stateId[i + GRID.W]; if (b >= 0 && b !== a) pairs.add(Math.min(a, b) + '_' + Math.max(a, b)); }
  }
  const airSeen = new Set();
  for (const k of pairs) {
    const u = k.indexOf('_'), a = +k.slice(0, u), b = +k.slice(u + 1), sa = states[a], sb = states[b];
    if (!sa || !sb || !sa.alive || !sb.alive) continue;
    if (typeof atWar === 'function' && atWar(sa, sb)) continue;   // воюющие державы не торгуют (ни по суше, ни по воздуху)
    const p = landPath(sa.capital, sb.capital);
    if (p) land.push({ path: p, era: Math.max(sa.era, sb.era), inter: true });
    if (sa.era >= 4 || sb.era >= 4) { airSeen.add(k); air.push({ path: [pPoint(sa.capital), pPoint(sb.capital)], era: Math.max(sa.era, sb.era) }); }
  }
  // 2b) ДАЛЬНЯЯ авиация (эпоха 4+): между КРУПНЕЙШИМИ столицами — межконтинентальные рейсы, а не только к соседям
  const aircaps = alive.filter(s => s.era >= 4 && s.capital >= 0).sort((p, q) => (W.pop[q.capital] || 0) - (W.pop[p.capital] || 0));
  if (aircaps.length > 10) aircaps.length = 10;
  for (let a = 0; a < aircaps.length; a++) {
    const ca = aircaps[a].capital;
    const others = aircaps.filter((_, b) => b !== a).sort((p, q) => d2cell(ca, q.capital) - d2cell(ca, p.capital));   // самые ДАЛЁКИЕ — первыми
    for (let k = 0; k < Math.min(2, others.length); k++) {
      const cb = others[k].capital; if (d2cell(ca, cb) < 400) continue;                       // ближние уже покрыты соседскими маршрутами
      const key = Math.min(ca, cb) + '_' + Math.max(ca, cb); if (airSeen.has(key)) continue; airSeen.add(key);
      air.push({ path: [pPoint(ca), pPoint(cb)], era: Math.max(aircaps[a].era, others[k].era) });
    }
  }
  // 3) МОРЕ: каждый порт → ближайший подходящий, крупные → ещё и ДАЛЁКИЙ (межконтинентальный). Равномерно по всей карте, НЕ между воюющими
  const wAt = (pa, pb) => typeof atWar === 'function' && atWar(stateOf3(pa), stateOf3(pb));   // владельцы портов воюют?
  const ports = []; for (let i = 0; i < GRID.N; i++) if (W.isCoast[i] && !W.isWater[i] && (W.urban[i] > 200 || W.pop[i] > 1200)) ports.push(i);
  ports.sort((a, b) => (W.pop[b] + W.urban[b]) - (W.pop[a] + W.urban[a]));   // по ВАЖНОСТИ: крупные первыми (они разбросаны по карте) → при лимите выживают важные разбросанные линии, а не один угол
  const seen = new Set();
  const addSea = (pa, pb) => {
    if (wAt(pa, pb)) return; const key = Math.min(pa, pb) + '_' + Math.max(pa, pb); if (seen.has(key)) return;
    const sw = portWaterCell(pa); if (sw < 0) return; const wp = waterPathTo(sw, pb);
    if (wp && wp.length >= 6) { seen.add(key); sea.push({ path: cellsToPoints(wp), era: Math.max(eraOfCell3(pa), eraOfCell3(pb)) }); }
  };
  // 3a) каждый порт → ближайший подходящий (не враг) — линии есть ВЕЗДЕ, где есть порты
  for (let a = 0; a < ports.length; a++) {
    const pa = ports[a]; let best = -1, bd = Infinity;
    for (let b = 0; b < ports.length; b++) { if (b === a) continue; const pb = ports[b]; const d = d2cell(pa, pb); if (d >= 64 && d < 6400 && d < bd && !wAt(pa, pb)) { bd = d; best = pb; } }
    if (best >= 0) addSea(pa, best);
  }
  // 3b) крупные порты → самый ДАЛЁКИЙ подходящий (>50 клеток) — межконтинентальная торговля, ≥1 на крупный порт
  const major = ports.slice(0, 28);
  for (let a = 0; a < major.length; a++) {
    const pa = major[a]; let far = -1, fd = -1;
    for (let b = 0; b < major.length; b++) { if (b === a) continue; const pb = major[b]; const d = d2cell(pa, pb); if (d > 2500 && d > fd && !wAt(pa, pb)) { fd = d; far = pb; } }
    if (far >= 0) addSea(pa, far);
  }
  _3d.routes = { land, sea, air };
}

// ---- транспорт: едет по реальному пути (дорога/морской путь/воздух), нос — ПО ХОДУ движения ----
function moverMesh(kind, era) {
  if (kind === 'sea') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.42), new THREE.MeshLambertMaterial({ color: era >= 3 ? 0x7a4636 : 0x6b4a2e }));
    if (era >= 4) { for (let k = 0; k < 3; k++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.32), new THREE.MeshLambertMaterial({ color: [0xb5532f, 0x2f6fb5, 0x3aa05a][k] })); cr.position.set((k - 1) * 0.24, 0.18, 0); m.add(cr); } }
    else { const sail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.42), new THREE.MeshLambertMaterial({ color: era >= 2 ? 0xeae0d0 : 0xd8cbb4 })); sail.position.y = 0.36; m.add(sail); const crate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.26), new THREE.MeshLambertMaterial({ color: 0x9c6f3a })); crate.position.set(-0.28, 0.18, 0); m.add(crate); }
    m.scale.setScalar(0.5);   // корабли вдвое меньше
    return m;
  }
  if (kind === 'air') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.22), new THREE.MeshLambertMaterial({ color: era >= 5 ? 0xeaf2fa : 0xdfe7ef }));
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.8), new THREE.MeshLambertMaterial({ color: 0xc2ccd6 })); m.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.04), new THREE.MeshLambertMaterial({ color: 0xc2ccd6 })); tail.position.set(-0.27, 0.09, 0); m.add(tail);
    return m;
  }
  if (era >= 4) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.2), new THREE.MeshLambertMaterial({ color: 0xdde6ee })); const tr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0xc24a3a })); tr.position.set(-0.36, 0.05, 0); m.add(tr); return m; }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), new THREE.MeshLambertMaterial({ color: era >= 3 ? 0xcc4444 : era >= 2 ? 0x8a6a42 : 0x7a5a3a }));
  if (era >= 1) { const load = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.18), new THREE.MeshLambertMaterial({ color: 0xb98a4a })); load.position.y = 0.16; m.add(load); }
  return m;
}
function addMoverPath(grp, key, path, era, kind, offset) {
  if (!path || path.length < 2) return;
  const mesh = moverMesh(kind, era); grp.add(mesh);
  const base = kind === 'sea' ? 0.022 : kind === 'air' ? 0.04 : era >= 4 ? 0.045 : 0.03;   // базовая скорость (× скорость игры)
  const spd = base * (0.8 + rnd2((path[0][0] * 7) | 0, (path[0][1] * 5) | 0) * 0.4);
  _3d.movers.push({ key, mesh, path, kind, era, u: (offset || 0) % (path.length - 1), spd, fly: kind === 'air' });
}
// СВЕРКА транспорта с маршрутами: существующие суда ОСТАЮТСЯ на месте (сохраняют ход), убираются только исчезнувшие, добавляются только новые — НЕТ массового пересоздания (никаких «миганий»)
function spawnMovers3D() {
  if (!_3d.routes) buildTradeRoutes();
  const grp = _3d.mov, rev = p => p.slice().reverse(), pk = p => (p[0] | 0) + ',' + (p[1] | 0);
  const desired = []; let mLi = 0, mA = 0, mS = 0, mLd = 0;   // ОТДЕЛЬНЫЕ лимиты на тип (общий счётчик «голодал» морские суда → отображались не все)
  for (const r of _3d.routes.land) { if (!r.inter || mLi >= 50) continue; desired.push({ key: 'Li' + r.path[0] + '>' + r.path[r.path.length - 1], path: cellsToPoints(r.path), era: r.era, kind: 'land', off: 0 }); mLi++; }
  for (const r of _3d.routes.air) { if (mA >= 90) break; const p = r.path, k = 'A' + pk(p[0]) + '>' + pk(p[p.length - 1]); desired.push({ key: k, path: p, era: r.era, kind: 'air', off: 0 }); mA++; if (mA < 90) { desired.push({ key: k + 'r', path: rev(p), era: r.era, kind: 'air', off: 0 }); mA++; } }
  for (const r of _3d.routes.sea) { if (mS >= 220) break; const L = r.path.length, ships = clamp(Math.round(L / 6), 1, 3), k = 'S' + pk(r.path[0]) + '>' + pk(r.path[L - 1]); for (let s2 = 0; s2 < ships && mS < 220; s2++) { desired.push({ key: k + '#' + s2, path: r.path, era: r.era, kind: 'sea', off: s2 * (L - 1) / ships }); mS++; } if (mS < 220) { desired.push({ key: k + 'v', path: rev(r.path), era: r.era, kind: 'sea', off: (L - 1) / 2 }); mS++; } }
  for (const r of _3d.routes.land) { if (r.inter || mLd >= 220) continue; desired.push({ key: 'Ld' + r.path[0] + '>' + r.path[r.path.length - 1], path: cellsToPoints(r.path), era: r.era, kind: 'land', off: 0 }); mLd++; }
  const want = new Set(desired.map(d => d.key));
  for (let i = _3d.movers.length - 1; i >= 0; i--) { const m = _3d.movers[i]; if (!want.has(m.key)) { grp.remove(m.mesh); if (m.mesh.geometry) m.mesh.geometry.dispose(); _3d.movers.splice(i, 1); } }
  const have = {}; for (const m of _3d.movers) have[m.key] = m;
  for (const d of desired) {
    const ex = have[d.key];
    if (ex) { ex.path = d.path; ex.era = d.era; const last = d.path.length - 1; if (ex.u > last) ex.u = last; }   // обновить путь, СОХРАНИВ позицию (ход)
    else addMoverPath(grp, d.key, d.path, d.era, d.kind, d.off);
  }
}
function animateMovers3D(dt) {
  // транспорт замирает на паузе и ускоряется со скоростью игры (×1/×3/×10/×20)
  const gs = (typeof uiState !== 'undefined' && !W.paused) ? uiState.speed : 0;
  if (gs === 0) return;
  for (const m of _3d.movers) {
    const path = m.path, last = path.length - 1; if (last < 1) continue;
    if (m.dir === undefined) m.dir = 1;
    m.u += m.dir * m.spd * dt * gs;
    if (m.u >= last) { m.u = last; m.dir = -1; } else if (m.u <= 0) { m.u = 0; m.dir = 1; }   // длинный рейс «туда-обратно» (без телепортов)
    let seg = m.u | 0; if (seg < 0) seg = 0; else if (seg > last - 1) seg = last - 1;
    const f = m.u - seg, a = path[seg], b = path[seg + 1];
    if (!a || !b) continue;
    const gx = lerp(a[0], b[0], f), gz = lerp(a[1], b[1], f);
    const dx = (b[0] - a[0]) * m.dir, dz = (b[1] - a[1]) * m.dir;   // нос — по фактическому ходу (учёт направления)
    let yy;
    if (m.kind === 'sea') yy = 0.06 + Math.sin(_3d._t * 0.12 + gx) * 0.03;
    else if (m.kind === 'air') yy = surfAt(gx, gz) + 2.6 + Math.sin(_3d._t * 0.05 + gx) * 0.15;
    else yy = surfAt(gx, gz) + 0.12;
    m.mesh.position.set(gx, yy, gz);
    if (dx || dz) m.mesh.rotation.y = Math.atan2(-dz, dx);     // нос ПО ходу движения (не боком)
  }
}

// ---- камера + рисование по 3D ----
function updateCamera3D() { const v = _3d.view, el = clamp(v.el, 0.12, 1.5); _3d.cam.position.set(v.tx + v.dist * Math.cos(el) * Math.sin(v.az), v.ty + v.dist * Math.sin(el), v.tz + v.dist * Math.cos(el) * Math.cos(v.az)); _3d.cam.lookAt(v.tx, v.ty, v.tz); }
function pick3D(e) {
  const r = _3d.canvas.getBoundingClientRect();
  _3d.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1; _3d.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  _3d.ray.setFromCamera(_3d.ndc, _3d.cam); const hit = _3d.ray.intersectObject(_3d.terrain, false); if (!hit.length) return null;
  const p = hit[0].point, x = clamp(Math.round(p.x), 0, GRID.W - 1), y = clamp(Math.round(p.z), 0, GRID.H - 1); return { x, y, i: idx(x, y) };
}
function paint3DLive() { if (_terrainTouched) { recomputeStatic(true); buildTerrain3D(); } if (_windTouched) recomputeWinds(); }
function setBrushRing(c) {
  const ring = _3d.brushRing; if (!ring) return;
  if (!c) { ring.visible = false; return; }
  const r = (typeof uiState !== 'undefined' ? uiState.brush : 3) + 0.5;
  ring.position.set(c.x + 0.5, surfAt(c.x + 0.5, c.y + 0.5) + 0.18, c.y + 0.5);
  ring.scale.set(r, r, r); ring.visible = true;
}
function bindCam3D() {
  const cv = _3d.canvas, v = _3d.view;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    // КЛИК ПО БИТВЕ в 3D (где видны метки сражений: слои «Битвы»/«Дипломатия») → окно битвы
    if (e.button === 0 && !e.shiftKey && typeof currentOverlay !== 'undefined' && (currentOverlay === 'battles' || currentOverlay === 'political') && typeof findNearestBattle === 'function') {
      const c = pick3D(e); if (c) { const bt = findNearestBattle(c.x, c.y, 2); if (bt) { openBattleModal(bt); return; } }
    }
    if (e.button === 0 && !e.shiftKey && typeof uiState !== 'undefined' && uiState.tool === 'inspect') { const c = pick3D(e); if (c) { selectStateAt(c.i); updateInspector(c.i); const city = (typeof cityAtCell === 'function') ? cityAtCell(c.i) : null; if (city) openCityModal(city); else if (typeof selectedState !== 'undefined' && selectedState) openStateModal(selectedState); } }   // осмотр: клик открывает окно города/державы
    else if (e.button === 0 && !e.shiftKey) { const c = pick3D(e); if (c) { _3d.paint = true; _lastCX = c.x; _lastCY = c.y; _dragDX = 0; _dragDY = 0; selectStateAt(c.i); applyTool(c.x, c.y); paint3DLive(); setBrushRing(c); } }
    else _3d.drag = { x: e.clientX, y: e.clientY, az: v.az, el: v.el, tx: v.tx, tz: v.tz, pan: (e.button === 1 || e.shiftKey) };
  });
  cv.addEventListener('pointermove', e => {
    if (_3d.paint) { const c = pick3D(e); if (c) { _dragDX = c.x - _lastCX; _dragDY = c.y - _lastCY; _lastCX = c.x; _lastCY = c.y; updateInspector(c.i); applyTool(c.x, c.y); paint3DLive(); setBrushRing(c); } return; }
    if (_3d.drag) {
      const d = _3d.drag, dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (d.pan) {
        // панорама по фактическим осям камеры (право/вперёд на земле) — корректно с ЛЮБОЙ стороны
        _3d.cam.updateMatrixWorld(); const el = _3d.cam.matrixWorld.elements;
        let rgx = el[0], rgz = el[2]; const rl = Math.hypot(rgx, rgz) || 1; rgx /= rl; rgz /= rl;
        let fgx = -el[8], fgz = -el[10]; const fl = Math.hypot(fgx, fgz) || 1; fgx /= fl; fgz /= fl;
        const s = v.dist * 0.0016;
        v.tx = d.tx - dx * rgx * s + dy * fgx * s;
        v.tz = d.tz - dx * rgz * s + dy * fgz * s;
      } else { v.az = d.az - dx * 0.005; v.el = clamp(d.el + dy * 0.005, 0.12, 1.5); }
      return;
    }
    const c = pick3D(e); setBrushRing(c);
    if (c) { _3d.hoverCell = c.i; updateInspector(c.i); hoverState(c.i); }   // под курсором — инфо клетки И державы
  });
  const end = () => { if (_3d.paint) { _3d.paint = false; finishPaint(); bakeTerrain(); buildTerrain3D(); updateSettlements3D(); updateRoads3D(); buildBorders3D(); } _3d.drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { setBrushRing(null); _3d.hoverCell = -1; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); v.dist = clamp(v.dist * (1 + Math.sign(e.deltaY) * 0.12), 8, 220); }, { passive: false });
}
function resize3D() { if (!_3d.rend) return; const cv = _3d.canvas, w = cv.clientWidth || 800, h = cv.clientHeight || 600; _3d.rend.setSize(w, h, false); _3d.cam.aspect = w / h; _3d.cam.updateProjectionMatrix(); }
function frameCamera3D() {
  let sx = 0, sz = 0, sw = 0;
  for (let i = 0; i < GRID.N; i++) { const p = W.pop[i]; if (p > 250 && !W.isWater[i]) { sx += (i % GRID.W) * p; sz += ((i / GRID.W) | 0) * p; sw += p; } }
  if (sw > 0) { _3d.view.tx = sx / sw; _3d.view.tz = sz / sw; _3d.view.dist = 48; }
  else { let lx = 0, lz = 0, ln = 0; for (let i = 0; i < GRID.N; i++) if (!W.isWater[i]) { lx += i % GRID.W; lz += (i / GRID.W) | 0; ln++; } if (ln) { _3d.view.tx = lx / ln; _3d.view.tz = lz / ln; } else { _3d.view.tx = GRID.W / 2; _3d.view.tz = GRID.H / 2; } _3d.view.dist = 78; }
  _3d.view.ty = 2; _3d.view.el = 0.68;
}

// ---- границы государств в 3D: цветные ленты по рельефу (видно, где чья территория) ----
function borderRibbon(ax, az, bx, bz, w, lift, out) {
  const ay = surfAt(ax, az) + lift, by = surfAt(bx, bz) + lift;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, px = -dz / L * w, pz = dx / L * w;
  out.push(ax + px, ay, az + pz, bx + px, by, bz + pz, ax - px, ay, az - pz, ax - px, ay, az - pz, bx + px, by, bz + pz, bx - px, by, bz - pz);
}
function buildBorders3D() {
  if (!_3d.borders) { _3d.borders = new THREE.Group(); _3d.scene.add(_3d.borders); }
  disposeChildren(_3d.borders);
  const byState = {};
  for (let y = 0; y < GRID.H; y++) for (let x = 0; x < GRID.W; x++) {
    const i = idx(x, y), sid = W.stateId[i]; if (sid < 0) continue;
    const st = states[sid]; if (!st || !st.alive) continue;
    const v = byState[sid] || (byState[sid] = []);
    if (x === GRID.W - 1 || W.stateId[i + 1] !== sid) borderRibbon(x + 1, y, x + 1, y + 1, 0.06, 0.3, v);
    if (x === 0 || W.stateId[i - 1] !== sid) borderRibbon(x, y, x, y + 1, 0.06, 0.3, v);
    if (y === GRID.H - 1 || W.stateId[i + GRID.W] !== sid) borderRibbon(x, y + 1, x + 1, y + 1, 0.06, 0.3, v);
    if (y === 0 || W.stateId[i - GRID.W] !== sid) borderRibbon(x, y, x + 1, y, 0.06, 0.3, v);
  }
  for (const sidStr in byState) {
    const verts = byState[sidStr]; if (!verts.length) continue; const col = states[+sidStr].color;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3)); g.computeVertexNormals(); g.computeBoundingSphere();
    _3d.borders.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: (col[0] << 16) | (col[1] << 8) | col[2], transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
  }
}
function rebuild3D() { bakeTerrain(); buildTerrain3D(); updateSettlements3D(); updateRoads3D(); buildBorders3D(); spawnMovers3D(); _3d._lastCityN = cities.length; }
function render3D(now) {
  if (!_3d.ok) return;
  const dt = Math.min((now - _3d.last) / 16.7, 4) || 1; _3d.last = now; _3d._t += dt; _3d.frame++;
  if (!_3d.paint) {
    if (_3d.frame % 40 === 1) buildTerrain3D();
    if (W.dirty.base || _3d.frame % 24 === 12) { bakeTerrain(); W.dirty.base = false; }   // перепекаем по сигналу смены биомов/данных (как 2D) + резерв каждые 24 кадра → 3D синхронен с 2D
    if (_3d.frame % 50 === 25) updateSettlements3D();
    if (_3d.frame % 80 === 30) {
      updateRoads3D(); buildBorders3D();
      spawnMovers3D();   // СВЕРКА маршрутов (не пересоздание!): существующие суда сохраняют ход, меняются только появившиеся/исчезнувшие → нет «миганий»
    }
    // живое обновление инфо под курсором (клетка + держава), как в 2D
    if (_3d.hoverCell >= 0 && _3d.frame % 8 === 4) { updateInspector(_3d.hoverCell); hoverState(_3d.hoverCell); }
  }
  if (_3d.water) { const p = _3d.water.geometry.attributes.position.array, base = _3d._waterBase, t = _3d._t * 0.045; for (let k = 0; k < p.length; k += 3) p[k + 1] = Math.sin(base[k] * 0.5 + t) * 0.05 + Math.sin(base[k + 2] * 0.45 - t * 1.3) * 0.035; _3d.water.geometry.attributes.position.needsUpdate = true; }
  // слои-векторы: ветер и течения (по выбранному слою ИЛИ инструменту)
  const ov = (typeof currentOverlay !== 'undefined') ? currentOverlay : 'biome';
  const showWind = ov === 'wind' || (typeof uiState !== 'undefined' && uiState.tool === 'wind');
  const showCur = ov === 'currents' || (typeof uiState !== 'undefined' && uiState.tool === 'current');
  if (_3d.windL) { _3d.windL.mesh.visible = showWind; if (showWind) updateWind3D(dt); }
  if (_3d.curL) { _3d.curL.mesh.visible = showCur; if (showCur) updateCurrents3D(dt); }
  animateMovers3D(dt); updatePeople3D(dt); updateVegetation3D(); updateBattleArmies3D(dt); updateSimShips3D(dt); updateBattles3D(); updateCityLabels3D(); updateCamera3D(); _3d.rend.render(_3d.scene, _3d.cam);
}

function set3DMode(on) {
  if (on) { if (!init3D()) return false; mode3D = true; window.mode3D = true; document.getElementById('stage').classList.add('mode-3d'); resize3D(); frameCamera3D(); rebuild3D(); }
  else { mode3D = false; window.mode3D = false; document.getElementById('stage').classList.remove('mode-3d'); markDirty('base'); markDirty('borders'); }
  return true;
}
window.addEventListener('resize', () => { if (mode3D) resize3D(); });
