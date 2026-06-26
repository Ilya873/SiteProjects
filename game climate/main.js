// main.js — оркестратор: генерация стартового мира и главный цикл (rAF).
'use strict';

const CLIMATE_MS = 166;   // ~6 Гц: климат + экология
const CIV_MS = 250;       // 4 Гц: цивилизации
let _last = 0, _climateAcc = 0, _civAcc = 0, _frame = 0;

function loop(now) {
  const dt = Math.min(now - _last, 200); _last = now;
  if (!W.paused) {
    const s = uiState.speed;
    _climateAcc += dt * s; _civAcc += dt * s;
    let guard = 0;
    while (_climateAcc >= CLIMATE_MS && guard++ < 6) { climateStep(); ecologyStep(); _climateAcc -= CLIMATE_MS; }
    guard = 0;
    while (_civAcc >= CIV_MS && guard++ < 6) { civTick(); _civAcc -= CIV_MS; }
  }
  if (window.mode3D && typeof render3D === 'function') {
    render3D(now);                           // 3D-вид
  } else {
    if (W.dirty.base) { buildBase(); W.dirty.base = false; }
    if (W.dirty.borders) { buildBorders(); W.dirty.borders = false; }
    renderFrame(now);
    if (_frame % 4 === 0) refreshHover();     // живое обновление инфо под курсором
  }
  _frame++;
  if (_frame % 10 === 0) updateHud();
  requestAnimationFrame(loop);
}

function _applyBootParams(cfg) {
  let re = false;
  if (typeof cfg.seaLevel === 'number') { W.seaLevel = cfg.seaLevel; re = true; }
  if (typeof cfg.co2 === 'number') { W.co2 = cfg.co2; re = true; }
  if (typeof cfg.solar === 'number') { W.solar = cfg.solar; re = true; }
  if (re) {   // пересчитать мир под выбранные параметры (уровень моря/CO₂/солнце)
    recomputeStatic();
    _settleSmoothed(6);
    for (let i = 0; i < GRID.N; i++) { const b = classifyBiome(i); W.biome[i] = b; W.biomeCand[i] = b; W.biomeHold[i] = 0; }
    ecologyStep(); ecologyStep();
    if (typeof refreshCapacities === 'function') refreshCapacities();
  }
}
function start() {
  initRender();
  bindUI();
  let started = false;
  if (typeof _boot !== 'undefined' && _boot) {
    try {
      if (_boot.mode === 'load' && _boot.key && typeof loadWorldFromStorage === 'function') started = loadWorldFromStorage(_boot.key);
      else if (_boot.mode === 'new') { worldgen(_boot.type || 'continents'); _applyBootParams(_boot); started = true; }
    } catch (e) { console.warn('boot config failed:', e); }
    try { sessionStorage.removeItem('earthsim.boot'); } catch (e) { }
  }
  if (!started) worldgen('continents');     // мир по умолчанию (или фон под меню)
  refreshCapacities();
  buildBase();
  buildBorders();
  updateHud();
  requestAnimationFrame(loop);
  if (typeof installMenuButton === 'function') installMenuButton();
  const ld = document.getElementById('loader'); if (ld) setTimeout(() => ld.classList.add('hide'), 400);
  // чистый старт (не из меню) → показать главное меню поверх
  if (!(typeof _boot !== 'undefined' && _boot) && typeof showMainMenu === 'function') setTimeout(showMainMenu, 380);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
