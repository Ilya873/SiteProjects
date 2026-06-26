# -*- coding: utf-8 -*-
# Генератор бесшовных текстур для Симулятора Земли.
# Делает связные многооктавные текстуры (не шум-«соль-перец»), пишет textures.js (data-URI).
import numpy as np
from PIL import Image
import io, base64, json, os

SZ = 256  # размер текстуры (степень двойки → бесшовно)

def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)

def tile_noise(size, period, seed):
    """Бесшовный value-noise: решётка period×period, период делит size → тайлится."""
    r = np.random.default_rng(seed)
    grid = r.random((period, period))
    grid = np.concatenate([grid, grid[:, :1]], axis=1)
    grid = np.concatenate([grid, grid[:1, :]], axis=0)        # (period+1, period+1) с заворотом
    coords = np.linspace(0, period, size, endpoint=False)
    xi = np.floor(coords).astype(int)
    xf = fade(coords - xi)
    X0 = xi[None, :]; X1 = xi[None, :] + 1; FX = xf[None, :]
    Y0 = xi[:, None]; Y1 = xi[:, None] + 1; FY = xf[:, None]
    v00 = grid[Y0, X0]; v10 = grid[Y0, X1]; v01 = grid[Y1, X0]; v11 = grid[Y1, X1]
    top = v00 * (1 - FX) + v10 * FX
    bot = v01 * (1 - FX) + v11 * FX
    return top * (1 - FY) + bot * FY

def fbm(size, periods, seed, persistence=0.5):
    out = np.zeros((size, size)); amp = 1.0; tot = 0.0
    for k, p in enumerate(periods):
        out += amp * tile_noise(size, p, seed * 131 + k * 17)
        tot += amp; amp *= persistence
    return out / tot

def norm(a):
    a = a - a.min()
    m = a.max()
    return a / m if m > 1e-9 else a

def ramp(t, c_lo, c_hi):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(c_lo, float)[None, None] * (1 - t) + np.array(c_hi, float)[None, None] * t

def finalize(col):
    return np.clip(col, 0, 255).astype(np.uint8)

# ---------------- материалы ----------------
def make_grass():
    n = norm(fbm(SZ, [4, 8, 16, 32], 1))
    det = fbm(SZ, [32, 64, 128], 2)
    col = ramp(n, [58, 84, 38], [104, 134, 60])
    dry = np.clip((fbm(SZ, [3, 6, 12], 9) - 0.52) * 4, 0, 1)
    col = col * (1 - 0.55 * dry[..., None]) + np.array([126, 122, 58])[None, None] * (0.55 * dry[..., None])
    col *= (0.86 + 0.26 * det)[..., None]
    return finalize(col)

def make_sand():
    n = norm(fbm(SZ, [8, 16, 32], 8))
    col = ramp(n, [196, 170, 120], [228, 206, 152])
    xx = np.arange(SZ)[None, :]
    rip = np.sin(xx * 0.30 + fbm(SZ, [6, 12], 10) * 7) * 0.5 + 0.5
    col *= (0.93 + 0.10 * rip[..., None])
    speck = (fbm(SZ, [64, 128], 11) > 0.80).astype(float)
    col *= (1 - 0.18 * speck[..., None])
    return finalize(col)

def make_snow():
    n = norm(fbm(SZ, [8, 16, 32, 64], 3))
    col = ramp(n, [206, 214, 230], [244, 248, 255])   # белый со слабой холодной тенью в ложбинах
    spark = (fbm(SZ, [64, 128], 4) > 0.82).astype(float)
    col = col * (1 - spark[..., None]) + np.array([255, 255, 255])[None, None] * spark[..., None]
    return finalize(col)

def make_rock():
    n = norm(fbm(SZ, [4, 8, 16], 5))
    strata = np.sin((np.arange(SZ)[:, None]) * 0.16 + fbm(SZ, [2, 4], 6) * 5) * 0.5 + 0.5
    base = ramp(n, [96, 92, 96], [150, 148, 150])
    base *= (0.86 + 0.18 * strata[..., None])
    crack = np.abs(fbm(SZ, [16, 32, 64], 7) - 0.5)
    cm = np.clip((0.05 - crack) * 16, 0, 1)
    base *= (1 - 0.45 * cm[..., None])
    return finalize(base)

def make_water():
    n = norm(fbm(SZ, [8, 16, 32, 64], 12))
    col = ramp(n, [16, 64, 102], [40, 112, 150])
    return finalize(col)

def make_cobble():
    bw, bh = 56, 38
    col = np.zeros((SZ, SZ, 3))
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    row = yy // bh
    off = (row % 2) * (bw // 2)
    bx = ((xx + off) % bw)
    by = (yy % bh)
    rid = (yy // bh) * 97 + ((xx + off) // bw) * 31
    tint = (np.sin(rid.astype(float)) * 0.5 + 0.5) * 0.4 + 0.78
    n = fbm(SZ, [16, 32, 64], 21)
    base = np.array([120, 116, 110])[None, None] * (0.7 + 0.6 * n[..., None])
    col = base * tint[..., None]
    mortar = ((bx < 3) | (by < 3) | (bx > bw - 3) | (by > bh - 3)).astype(float)
    col = col * (1 - 0.6 * mortar[..., None]) + np.array([54, 50, 46])[None, None] * (0.6 * mortar[..., None])
    return finalize(col)

def make_planks():
    pw = 64
    xx = np.arange(SZ)[None, :]
    grain = fbm(SZ, [3, 96, 192], 22)
    col = ramp(norm(grain), [112, 76, 44], [156, 110, 66])
    pid = (np.arange(SZ) // pw)
    r = np.random.default_rng(40)
    ptint = (r.random(SZ // pw + 2) * 0.34 - 0.17)
    for p in np.unique(pid):
        col[:, pid == p] *= (1 + ptint[p])
    gap = ((np.arange(SZ) % pw) < 2) | ((np.arange(SZ) % pw) > pw - 2)
    col[:, gap] *= 0.45
    knot = (fbm(SZ, [8, 16], 24) > 0.86).astype(float)
    col *= (1 - 0.3 * knot[..., None])
    return finalize(col)

def make_wall_stone():
    bw, bh = 42, 26
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    row = yy // bh
    off = (row % 2) * (bw // 2)
    bx = ((xx + off) % bw); by = (yy % bh)
    n = fbm(SZ, [16, 32], 31)
    col = np.array([150, 138, 118])[None, None] * (0.75 + 0.5 * n[..., None])
    mortar = ((bx < 2) | (by < 2)).astype(float)
    col = col * (1 - 0.5 * mortar[..., None]) + np.array([96, 88, 76])[None, None] * (0.5 * mortar[..., None])
    return finalize(col)

def make_wall_timber():
    # фахверк: светлая штукатурка + тёмные брёвна (рама + раскосы)
    col = np.full((SZ, SZ, 3), 0.0)
    n = fbm(SZ, [16, 32], 33)
    plaster = np.array([198, 180, 150])[None, None] * (0.85 + 0.3 * n[..., None])
    col = plaster.repeat(1, 0)
    col = np.broadcast_to(plaster, (SZ, SZ, 3)).copy()
    beam = np.array([84, 56, 34], float)
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    m = np.zeros((SZ, SZ), bool)
    for c in (0, SZ // 2, SZ - 14):
        m |= (np.abs(xx - c) < 8)
    for c in (0, SZ // 2, SZ - 14):
        m |= (np.abs(yy - c) < 8)
    diag = np.abs((xx + yy) % SZ - SZ // 2) < 7
    m |= diag
    col[m] = beam
    return finalize(col)

def make_wall_glass():
    pw, ph = 32, 40
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    n = fbm(SZ, [8, 16], 35)
    col = ramp(norm(n), [150, 178, 198], [196, 220, 236])
    frame = (((xx % pw) < 3) | ((yy % ph) < 3)).astype(float)
    col = col * (1 - 0.55 * frame[..., None]) + np.array([90, 104, 116])[None, None] * (0.55 * frame[..., None])
    # блик по диагонали
    gleam = np.clip(((xx - yy) % SZ) / SZ, 0, 1)
    col += (np.array([30, 34, 40])[None, None] * (gleam[..., None] ** 3))
    return finalize(col)

def make_wall_concrete():
    n = fbm(SZ, [8, 16, 32, 64], 37)
    col = np.array([176, 176, 172])[None, None] * (0.86 + 0.22 * n[..., None])
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    seam = (((xx % 128) < 2) | ((yy % 86) < 2)).astype(float)
    col *= (1 - 0.18 * seam[..., None])
    stain = np.clip((fbm(SZ, [4, 8], 38) - 0.6) * 3, 0, 1)
    col *= (1 - 0.12 * stain[..., None])
    return finalize(col)

# ---------------- деревья/кусты (RGBA-биллборды, прозрачный фон) ----------------
def _tree(canopy_lo, canopy_hi, trunk, shape, seed, fill=1.0):
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(float)
    cx = SZ / 2.0
    n = fbm(SZ, [4, 8, 16, 32], seed)
    img = np.zeros((SZ, SZ, 4))
    if shape == 'round':
        cyc, cr = SZ * 0.40, SZ * 0.36
        d = np.sqrt((xx - cx) ** 2 + (yy - cyc) ** 2)
        canopy = d < cr * (0.78 + 0.5 * n) * fill
    elif shape == 'cone':
        top, bot = SZ * 0.06, SZ * 0.78
        prog = np.clip((yy - top) / (bot - top), 0, 1)
        halfw = (prog ** 0.9) * SZ * 0.30 * (0.8 + 0.4 * n)
        canopy = (np.abs(xx - cx) < halfw) & (yy > top) & (yy < bot)
    elif shape == 'tall':
        cyc, cr = SZ * 0.32, SZ * 0.40
        d = np.sqrt((xx - cx) ** 2 + ((yy - cyc) * 1.25) ** 2)
        canopy = d < cr * (0.8 + 0.45 * n) * fill
    else:  # bush
        cyc, cr = SZ * 0.62, SZ * 0.34
        d = np.sqrt((xx - cx) ** 2 + ((yy - cyc) * 1.3) ** 2)
        canopy = d < cr * (0.8 + 0.5 * n)
    tw = SZ * (0.04 if shape != 'bush' else 0.0)
    tt = SZ * (0.55 if shape == 'round' else 0.62 if shape == 'tall' else 0.7)
    trunk_m = (np.abs(xx - cx) < tw) & (yy > tt) & (yy < SZ * 0.96)
    col = ramp(n, canopy_lo, canopy_hi)
    shade = np.clip((yy - SZ * 0.2) / (SZ * 0.6), 0, 1)
    col = col * (1 - 0.25 * shade[..., None])
    img[..., :3] = col
    img[trunk_m, :3] = trunk
    a = np.zeros((SZ, SZ)); a[canopy] = 1.0; a[trunk_m] = 1.0
    holes = (fbm(SZ, [16, 32], seed + 5) > 0.80)
    a[canopy & holes] = 0.0
    img[..., 3] = a * 255
    return finalize(img)

def make_tree_broadleaf(): return _tree([54, 96, 38], [96, 150, 66], [86, 60, 40], 'round', 101)
def make_tree_conifer():   return _tree([28, 66, 44], [50, 96, 66], [70, 50, 34], 'cone', 102)
def make_tree_jungle():    return _tree([30, 84, 28], [70, 150, 50], [92, 70, 44], 'tall', 103, fill=1.1)
def make_bush():           return _tree([92, 116, 50], [134, 158, 78], [0, 0, 0], 'bush', 104)

def make_field():
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(float)
    n = fbm(SZ, [8, 16, 32], 110)
    col = ramp(norm(n), [150, 132, 84], [186, 168, 116])
    rows = (np.sin(yy * (2 * np.pi / 16.0)) * 0.5 + 0.5)
    col *= (0.84 + 0.22 * rows[..., None])
    furrow = ((yy % 16) < 2).astype(float)
    col *= (1 - 0.25 * furrow[..., None])
    green = np.clip((fbm(SZ, [6, 12], 111) - 0.45) * 3, 0, 1)
    col = col * (1 - 0.4 * green[..., None]) + np.array([110, 140, 60])[None, None] * (0.4 * green[..., None])
    return finalize(col)

MAKERS = {
    'grass': make_grass, 'sand': make_sand, 'snow': make_snow, 'rock': make_rock,
    'cobble': make_cobble, 'planks': make_planks, 'water': make_water,
    'wall_stone': make_wall_stone, 'wall_timber': make_wall_timber,
    'wall_glass': make_wall_glass, 'wall_concrete': make_wall_concrete,
    'tree_broadleaf': make_tree_broadleaf, 'tree_conifer': make_tree_conifer,
    'tree_jungle': make_tree_jungle, 'bush': make_bush, 'field': make_field,
}

out = {}
sizes = {}
for name, fn in MAKERS.items():
    arr = fn()
    mode = 'RGBA' if (arr.ndim == 3 and arr.shape[2] == 4) else 'RGB'
    img = Image.fromarray(arr, mode)
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    b = buf.getvalue()
    out[name] = 'data:image/png;base64,' + base64.b64encode(b).decode('ascii')
    sizes[name] = len(b)
    # также положим обычные png в tex/ (на всякий случай / для http)
    img.save(os.path.join('tex', name + '.png'))

js = '// textures.js — встроенные бесшовные текстуры (data-URI), генерируются _gen_textures.py\n'
js += 'var TEXDATA = ' + json.dumps(out) + ';\n'
with open('textures.js', 'w', encoding='utf-8') as f:
    f.write(js)

total = sum(sizes.values())
print('written textures.js, total PNG bytes:', total, '(~%.0f KB base64)' % (total * 1.34 / 1024))
for k, v in sorted(sizes.items(), key=lambda kv: -kv[1]):
    print('  %-14s %6d B' % (k, v))
