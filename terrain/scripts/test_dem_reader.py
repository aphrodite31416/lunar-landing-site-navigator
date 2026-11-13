"""Checks for dem_reader. Run: .venv/Scripts/python scripts/test_dem_reader.py"""
import math
import sys
from pathlib import Path

import numpy as np
import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dem_reader import RAW, latlon_to_xy, make_elevation_at  # noqa: E402

ok = True
def check(name, cond, info=""):
    global ok
    ok &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name, info)

elev, = (make_elevation_at(),)
elev_src = make_elevation_at(return_source=True)

# 1. Site01: mesmo valor do export_terrain (1934,7 m), vindo do 5 m
z, src, names = elev_src(math.radians(-89.464), math.radians(-137.87))
check("Site01 z0", abs(float(z) - 1934.7) < 0.05 and names[int(src)].startswith("Site01"), f"{float(z):.2f} m from {names[int(src)]}")

# 2. Centro de pixel exato = valor do pixel (registro do meio pixel)
with rasterio.open(RAW / "Site01_final_adj_5mpp_surf.tif") as ds:
    r, c = 1234, 2101
    x, y = ds.xy(r, c)               # centro do pixel
    pix = float(ds.read(1)[r, c])
rho = math.hypot(x, y)
lat = -(math.pi / 2 - 2 * math.atan(rho / (2 * 1737400.0)))
lon = math.atan2(x, y)
check("5 m pixel centre", abs(elev(lat, lon) - pix) < 1e-3, f"{elev(lat, lon):.4f} × {pix:.4f}")

# 3. Fontes por distância: 5 m, 80 m, 240 m, fora
pts = {"80 m (−86°, 0°)": (-86.0, 0.0, "LDEM_80S"), "240 m (−78°, 0°)": (-78.0, 0.0, "LDEM_60S"),
       "outside (−40°, 0°)": (-40.0, 0.0, None)}
for k, (la, lo, want) in pts.items():
    z, s, _ = elev_src(math.radians(la), math.radians(lo))
    got = None if int(s) < 0 else names[int(s)]
    check(f"source {k}", (got is None and np.isnan(z)) if want is None else (got or "").startswith(want), f"{float(z):.1f} m from {got}")

# 4. Vetorizado: forma preservada
lat = np.radians(np.linspace(-89.5, -75, 12)).reshape(3, 4)
check("shape (3, 4)", elev(lat, 0.3).shape == (3, 4))

# 5. 5 m × 80 m dentro do Site01: viés pequeno (mesmo registro)
rng = np.random.default_rng(0)
xs, ys = rng.uniform(-18500, -3500, 2000), rng.uniform(-19500, -4500, 2000)
rho = np.hypot(xs, ys)
la, lo = -(np.pi / 2 - 2 * np.arctan(rho / (2 * 1737400.0))), np.arctan2(xs, ys)
fine = elev(la, lo)
coarse_only = make_elevation_at(fine_tiles=[])
d = fine - coarse_only(la, lo)
check("bias 5 m − 80 m < 2 m", abs(np.median(d)) < 2, f"median {np.median(d):.2f} m, p95 |Δ| {np.percentile(abs(d), 95):.1f} m")

# 6. 80 m × 240 m no anel 82–86°S: viés pequeno
la = np.radians(rng.uniform(-86, -82, 2000)); lo = np.radians(rng.uniform(-180, 180, 2000))
only240 = make_elevation_at(fine_tiles=[], mosaics=["LDEM_60S_240MPP_ADJ.TIF"])
d = coarse_only(la, lo) - only240(la, lo)
check("bias 80 m − 240 m < 5 m", abs(np.nanmedian(d)) < 5, f"median {np.nanmedian(d):.2f} m, p95 |Δ| {np.nanpercentile(abs(d), 95):.1f} m")

# 7. Seam 5 m / 80 m: no step across the Site01 tile edge (blend), all 4 edges
def xy_to_latlon(x, y):
    rho = np.hypot(x, y)
    return -(np.pi / 2 - 2 * np.arctan(rho / (2 * 1737400.0))), np.arctan2(x, y)

raw = make_elevation_at(blend=False)
s = np.arange(-200.0, 800.0, 1.0)            # metres from the edge, positive = inside the tile
tvals = np.linspace(-18000, -5000, 40)       # positions along each edge (Site01 x/y range)
steps_blend, steps_raw = [], []
for edge in ("left", "right", "bottom", "top"):
    for t in tvals:
        if edge == "left":   xs, ys = -19000.0 + s, np.full(s.shape, t - 1000)
        if edge == "right":  xs, ys = -3000.0 - s, np.full(s.shape, t - 1000)
        if edge == "bottom": xs, ys = np.full(s.shape, t), -20000.0 + s
        if edge == "top":    xs, ys = np.full(s.shape, t), -4000.0 - s
        la, lo = xy_to_latlon(xs, ys)
        steps_blend.append(np.nanmax(np.abs(np.diff(elev(la, lo)))))
        steps_raw.append(np.nanmax(np.abs(np.diff(raw(la, lo)))))
check("seam 5 m/80 m: largest 1 m step with blend < largest without",
      max(steps_blend) < max(steps_raw),
      f"with blend {max(steps_blend):.2f} m, without {max(steps_raw):.2f} m (per 1 m)")

print("ALL OK" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
