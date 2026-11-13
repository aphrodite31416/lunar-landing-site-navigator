"""Checks asked by Zarina (2026-11-07) before integration.

1. Coverage bound (README 9.1): sensitivity of the cutoff to r_min / r_max margins
   (DEM smoothing + elevation uncertainty).
2. Seams: elevation steps where 5 m meets 80 m and where 80 m meets 240 m,
   and what that step means as a horizon angle seen from Site01.

Run: .venv/Scripts/python scripts/check_bounds_seams.py
"""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dem_reader import RAW, _Dem, latlon_to_xy  # noqa: E402

R = 1737400.0
Z_MIN_240, Z_MAX_80, Z_MAX_240 = -9127.11, 7026.33, 7024.77
SITE01 = (-89.464, -137.87)
Z0, H = 1934.7, 1.0


def cutoff_km(z0, zmin, zmax, h=H):
    ro, rmin, rmax = R + z0 + h, R + zmin, R + zmax
    return (math.acos(rmin / ro) + math.acos(rmin / rmax)) * R / 1000


print("== 1. Coverage cutoff vs margin (Site01, z0 = 1934.7 m, h = 1 m) ==")
base = cutoff_km(Z0, Z_MIN_240, Z_MAX_80)
print(f"no margin: {base:.1f} km")
for m in (50, 100, 250, 500, 1000, 2000):
    k = cutoff_km(Z0, Z_MIN_240 - m, Z_MAX_80 + m)
    print(f"margin ±{m:5d} m: {k:6.1f} km (+{k - base:4.1f})")
# Global lunar extremes (LOLA): ~ -9.1 km (Antoniadi) and ~ +10.8 km (Selenean summit)
print(f"global-Moon bounds (-9130 / +10790 m): {cutoff_km(Z0, -9130, 10790):.1f} km")

# Where are the extremes? distance from Site01
x0, y0 = latlon_to_xy(math.radians(SITE01[0]), math.radians(SITE01[1]))
for name, fname, fn in (("min 240 m", "LDEM_60S_240MPP_ADJ.TIF", np.nanargmin),
                        ("max 80 m", "LDEM_80S_80MPP_ADJ.TIF", np.nanargmax),
                        ("max 240 m", "LDEM_60S_240MPP_ADJ.TIF", np.nanargmax)):
    d = _Dem(RAW / fname)
    r, c = np.unravel_index(fn(d.z), d.z.shape)
    x = d.left + (c + 0.5) * d.res
    y = d.top - (r + 0.5) * d.res
    rho = math.hypot(x, y)
    lat = -(90 - 2 * math.degrees(math.atan(rho / (2 * R))))
    print(f"{name}: z = {d.z[r, c]:.1f} m at lat {lat:.2f}, lon {math.degrees(math.atan2(x, y)):.2f}, "
          f"{math.hypot(x - x0, y - y0) / 1000:.0f} km (projected) from Site01")
    del d

print("\n== 2. Seams ==")
m80 = _Dem(RAW / "LDEM_80S_80MPP_ADJ.TIF")
m240 = _Dem(RAW / "LDEM_60S_240MPP_ADJ.TIF")


def ring(left, right, bottom, top, inset, n=4000):
    t = np.linspace(0, 1, n, endpoint=False)
    xs = np.concatenate([left + inset + t * (right - left - 2 * inset), np.full(n, right - inset),
                         right - inset - t * (right - left - 2 * inset), np.full(n, left + inset)])
    ys = np.concatenate([np.full(n, bottom + inset), bottom + inset + t * (top - bottom - 2 * inset),
                         np.full(n, top - inset), top - inset - t * (top - bottom - 2 * inset)])
    return xs, ys


def stats(label, d, dist_km):
    d = d[~np.isnan(d)]
    a = np.abs(d)
    ang = np.degrees(np.percentile(a, 95) / (dist_km * 1000))
    angmax = np.degrees(a.max() / (dist_km * 1000))
    print(f"{label}: n={d.size}, median {np.median(d):+.2f} m, p95 |Δ| {np.percentile(a, 95):.2f} m, "
          f"max |Δ| {a.max():.1f} m -> seen from {dist_km:.1f} km: p95 {ang:.4f}°, max {angmax:.4f}°")


for site in ("Site01", "Site04", "Site07", "Site11"):
    t = _Dem(RAW / f"{site}_final_adj_5mpp_surf.tif")
    xs, ys = ring(t.left, t.right, t.bottom, t.top, inset=10.0)   # 10 m inside the 5 m tile edge
    d = t.sample(xs, ys) - m80.sample(xs, ys)
    if site == "Site01":
        dist = float(np.min(np.hypot(xs - x0, ys - y0))) / 1000
    else:
        dist = float("nan")
    stats(f"5 m − 80 m at {site} edge", d, dist if site == "Site01" else 8.0)
    del t

xs, ys = ring(m80.left, m80.right, m80.bottom, m80.top, inset=200.0, n=20000)
d = m80.sample(xs, ys) - m240.sample(xs, ys)
dist80 = float(np.min(np.hypot(xs - x0, ys - y0))) / 1000
stats("80 m − 240 m at 80 m edge", d, dist80)
