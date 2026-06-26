// ecology.js — экология: классификация биомов (Уиттекер), NPP, плодородие, сукцессия.
// Здесь же общие таблицы биомов: названия, цвета атласа и параметры для цивилизаций.
'use strict';

// 19 биомов. Индекс = id (хранится в W.biome).
const BIOME = [
  { key: 'deepOcean',          ru: 'Глубокий океан' },        // 0
  { key: 'oceanShelf',         ru: 'Шельф' },                 // 1
  { key: 'coral',              ru: 'Коралловый риф' },        // 2
  { key: 'mangrove',           ru: 'Мангры' },                // 3
  { key: 'marsh',              ru: 'Болото' },                // 4
  { key: 'iceSheet',           ru: 'Ледник' },                // 5
  { key: 'tundra',             ru: 'Тундра' },                // 6
  { key: 'borealForest',       ru: 'Тайга' },                 // 7
  { key: 'coldDesert',         ru: 'Холодная пустыня' },      // 8
  { key: 'temperateGrassland', ru: 'Степь' },                 // 9
  { key: 'temperateDeciduous', ru: 'Широколиственный лес' },  // 10
  { key: 'temperateRainforest',ru: 'Дождевой лес умер. зоны' },// 11
  { key: 'mediterranean',      ru: 'Средиземноморье' },       // 12
  { key: 'subtropicalDesert',  ru: 'Пустыня' },               // 13
  { key: 'savanna',            ru: 'Саванна' },               // 14
  { key: 'tropSeasonalForest', ru: 'Сезонный тропич. лес' },  // 15
  { key: 'tropRainforest',     ru: 'Тропич. дождевой лес' },  // 16
  { key: 'alpine',             ru: 'Альпийские луга' },       // 17
  { key: 'barrenRock',         ru: 'Скалы' },                 // 18
];
const BID = {}; BIOME.forEach((b, i) => BID[b.key] = i);

// цвета атласа: base — скудная растительность, lush — пышная (смешиваются по veg)
const BIOME_RENDER = [
  { base: [12, 39, 71],   lush: [12, 39, 71] },    // 0 deepOcean (вода рисуется отдельно)
  { base: [26, 79, 107],  lush: [26, 79, 107] },   // 1 oceanShelf
  { base: [40, 150, 160], lush: [70, 199, 184] },  // 2 coral
  { base: [63, 92, 52],   lush: [47, 86, 48] },    // 3 mangrove
  { base: [93, 107, 58],  lush: [111, 125, 68] },  // 4 marsh
  { base: [236, 244, 250],lush: [236, 244, 250] }, // 5 iceSheet
  { base: [150, 160, 140],lush: [156, 175, 142] }, // 6 tundra
  { base: [60, 86, 64],   lush: [47, 80, 54] },    // 7 borealForest
  { base: [188, 175, 140],lush: [196, 184, 150] }, // 8 coldDesert
  { base: [176, 180, 110],lush: [149, 178, 82] },  // 9 temperateGrassland
  { base: [96, 140, 70],  lush: [79, 139, 59] },   // 10 temperateDeciduous
  { base: [60, 110, 70],  lush: [44, 122, 69] },   // 11 temperateRainforest
  { base: [168, 181, 106],lush: [143, 159, 84] },  // 12 mediterranean
  { base: [224, 196, 137],lush: [216, 184, 120] }, // 13 subtropicalDesert
  { base: [194, 168, 90], lush: [184, 154, 72] },  // 14 savanna
  { base: [120, 160, 70], lush: [95, 155, 52] },   // 15 tropSeasonalForest
  { base: [62, 130, 64],  lush: [39, 122, 44] },   // 16 tropRainforest
  { base: [150, 165, 130],lush: [143, 163, 122] }, // 17 alpine
  { base: [154, 144, 136],lush: [168, 158, 147] }, // 18 barrenRock
];

// параметры для цивилизаций: arable — пахотный потенциал (вклад в ёмкость)
const BIOME_CIV = [
  { arable: 0.0 },  { arable: 0.0 },  { arable: 0.0 },  { arable: 0.30 }, // 0..3
  { arable: 0.45 }, { arable: 0.0 },  { arable: 0.08 }, { arable: 0.28 }, // 4..7
  { arable: 0.04 }, { arable: 0.85 }, { arable: 0.72 }, { arable: 0.55 }, // 8..11
  { arable: 0.62 }, { arable: 0.04 }, { arable: 0.50 }, { arable: 0.58 }, // 12..15
  { arable: 0.35 }, { arable: 0.08 }, { arable: 0.02 },                   // 16..18
];

const ECO = { GROW: 0.020, DECAY: 0.065, FERT_RATE: 0.012, SNOW_T: 0, ICE_T: -12, BIOME_CONFIRM: 60 };  // BIOME_CONFIRM — сколько шагов новый биом должен держаться, чтобы смениться (> сезона ⇒ нет мерцания)

// Miami-модель NPP (0..1)
function computeNPP(temp, precip) {
  const nppT = 3000 / (1 + Math.exp(1.315 - 0.119 * temp));
  const nppP = 3000 * (1 - Math.exp(-0.000664 * precip));
  return clamp01(Math.min(nppT, nppP) / 3000);
}

function computeFertility(i) {
  const b = W.biome[i];
  const base = BIOME_CIV[b] ? Math.max(0.15, BIOME_CIV[b].arable) : 0.2;
  const p = W.precip[i], t = W.temp[i];
  const precipF = Math.exp(-((p - 800) * (p - 800)) / (2 * 700 * 700));
  const tempF = Math.exp(-((t - 18) * (t - 18)) / (2 * 22 * 22));
  let f = base * (0.5 + 0.5 * precipF) * (0.6 + 0.4 * tempF);
  f += 0.30 * W.volcanic[i] + 0.35 * W.riverFlux[i] - 0.40 * W.slope[i];
  f *= 0.45 + 0.55 * W.eco[i];          // деградация экосистемы снижает плодородие
  f -= 0.30 * W.pollution[i];           // загрязнение отравляет почву
  return clamp01(f);
}

// классификация Уиттекера (каскад приоритетов)
function classifyBiome(i) {
  const t = W.tempSmoothed[i], p = W.precipSmoothed[i];   // СГЛАЖЕННЫЕ температура и осадки → биом стабилен по сезонам (снег/лёд/засуха рисуются отдельно по факт. значениям)
  // --- вода ---
  if (W.isWater[i]) {
    if (W.seaDepth[i] > 200) return BID.deepOcean;
    if (t >= 20 && W.seaDepth[i] <= 60 && W.isCoast[i]) return BID.coral;
    return BID.oceanShelf;
  }
  const lh = landH(i), slope = W.slope[i], npp = W.npp[i];
  // --- влажные низины ---
  if (lh < 0.05 && slope < 0.05 && p > 1400 && t > 2) {
    return (t >= 20 && W.isCoast[i]) ? BID.mangrove : BID.marsh;
  }
  // --- горы ---
  const mountainous = lh > 0.5 || slope > 0.55;
  if (mountainous) {
    if (t < -7) return BID.iceSheet;
    if (t < 3) return BID.alpine;
    if (slope > 0.55 && npp < 0.22) return BID.barrenRock;
  }
  // --- полярный лёд ---
  if (t < -12) return BID.iceSheet;
  // --- диаграмма Уиттекера ---
  return whittaker(t, p);
}

function whittaker(t, p) {
  if (t < -5) return p < 125 ? BID.iceSheet : BID.tundra;
  if (t < 3) {
    if (p < 125) return BID.coldDesert;
    if (p < 500) return BID.tundra;
    return BID.borealForest;
  }
  if (t < 7) {
    if (p < 250) return BID.coldDesert;
    if (p < 500) return BID.temperateGrassland;
    if (p < 2000) return BID.borealForest;
    return BID.temperateRainforest;
  }
  if (t < 15) {
    if (p < 125) return BID.coldDesert;
    if (p < 500) return BID.temperateGrassland;
    if (p < 2000) return BID.temperateDeciduous;
    return BID.temperateRainforest;
  }
  if (t < 20) {
    if (p < 125) return BID.subtropicalDesert;
    if (p < 250) return BID.temperateGrassland;
    if (p < 550) return t >= 14 ? BID.mediterranean : BID.temperateGrassland;  // тёплая полусухая зона — маквис
    if (p < 2000) return BID.temperateDeciduous;
    return BID.temperateRainforest;
  }
  // t >= 20
  if (p < 250) return BID.subtropicalDesert;
  if (p < 500) return BID.savanna;
  if (p < 1000) return BID.tropSeasonalForest;
  return BID.tropRainforest;
}

function ecologyStep() {
  for (let i = 0; i < GRID.N; i++) {
    const npp = computeNPP(W.temp[i], W.precip[i]);
    W.npp[i] = npp;
    // сукцессия: медленный рост, быстрый упадок растительности
    const v = W.veg[i];
    W.veg[i] = v + (npp - v) * (npp > v ? ECO.GROW : ECO.DECAY);
    // классификация с ГИСТЕРЕЗИСОМ: смена биома подтверждается, только если новый держится BIOME_CONFIRM шагов
    // (сезон длится меньше → сезонные «качели» биома не проходят; настоящий сдвиг климата всё равно сменит биом)
    const nb = classifyBiome(i);
    if (nb === W.biome[i]) {
      W.biomeHold[i] = 0; W.biomeCand[i] = nb;
      if (W.biomeAge[i] < 65000) W.biomeAge[i]++;
    } else {
      if (nb === W.biomeCand[i]) W.biomeHold[i]++; else { W.biomeCand[i] = nb; W.biomeHold[i] = 1; }
      if (W.biomeHold[i] >= ECO.BIOME_CONFIRM) { W.biome[i] = nb; W.biomeAge[i] = 0; W.biomeHold[i] = 0; markCapDirty(i); }
    }
    // плодородие релаксирует к расчётному
    const tf = computeFertility(i);
    W.fertility[i] += (tf - W.fertility[i]) * ECO.FERT_RATE;
    // здоровье экосистемы: медленно восстанавливается к природному потолку, быстро деградирует
    if (!W.isWater[i]) {
      const ecoTarget = clamp01(0.25 + 0.75 * W.veg[i] - W.pollution[i] * 1.4);
      W.eco[i] += (ecoTarget - W.eco[i]) * (ecoTarget > W.eco[i] ? 0.02 : 0.09);
      if (W.pollution[i] > 0.3) W.veg[i] = Math.max(0, W.veg[i] - 0.012 * W.pollution[i]);  // кислотные осадки
    }
    // загрязнение рассеивается
    if (W.pollution[i] > 0.002) W.pollution[i] *= 0.96; else W.pollution[i] = 0;
  }
  if ((++_ecoCount & 1) === 0) markDirty('base');   // перерисовка цвета ~3 Гц (климат меняется медленно)
}
let _ecoCount = 0;
