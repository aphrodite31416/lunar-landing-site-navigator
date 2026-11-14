"""Independent Sun-visibility check with real SPICE (DE421 + MOON_ME_DE421) and our horizon profiles,
for the time period and metric of NASA's AVGVISIB_85S_060M map.

Why: the NASA map is an hourly average over a full ~18.6-year nodal cycle (https://pgda.gsfc.nasa.gov/products/69).
The START/STOP_TIME in its .LBL (2009-07-13..2013-07-18) is the LOLA data span, not the simulation period.
Its .LBL defines the value as "the percentage of timesteps where each pixel was sunlit (by any fraction of the
solar disc)". So we compute, per site, at the observer of data/derived/horizons/site_XX.json:
  - any_part   : fraction of time steps with any part of the disc above the terrain horizon
  - mean_frac  : time-average of the visible disc fraction
  - centre     : fraction of time steps with the disc centre above the horizon
for (A) 2009-07-01..2013-07-01 (Umar's 4-year run) and (B, C) two full 18.6-year windows.

Disc model (as Mazarico/Barker): the disc is cut by a horizontal line at the horizon elevation taken at
the disc-centre azimuth; u = (el - h) / r_sun, visible fraction = (pi - acos(u) + u*sqrt(1-u^2)) / pi.
Sun: spkpos SUN wrt MOON, CN+S, MOON_ME_DE421, minus the observer offset (topocentric).
Terrain only: Earth eclipses of the Sun are not modelled.

Kernels (NAIF generic): naif0012.tls, de421.bsp, pck00011.tpc, moon_pa_de421_1900-2050.bpc, moon_080317.tf
in data/raw/kernels/ (the team pipeline downloads the same set with scientific.ephemeris.spice.fetch_kernels).

Run: .venv/Scripts/python scripts/sun_visibility_periods.py
Writes data/derived/validation/sun_visibility_periods.json.
"""
import json
import math
import time
from pathlib import Path

import numpy as np
import spiceypy as sp

ROOT = Path(__file__).resolve().parent.parent
HZ = ROOT / "data" / "derived" / "horizons"
KER = ROOT / "data" / "raw" / "kernels"
if not KER.is_dir():                       # in the team repo: the pipeline's kernel folder
    KER = ROOT.parent / "data" / "kernels"
OUT = ROOT / "data" / "derived" / "validation" / "sun_visibility_periods.json"
KERNELS = ["naif0012.tls", "de421.bsp", "pck00011.tpc", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf"]
SUN_R_KM = 696000.0
NODAL_DAYS = 6798.38            # 18.61 yr
PERIODS = {
    "A_2009-07-01_4yr_hourly": ("2009-07-01T00:00:00", 4 * 365.25 + 0.0, 3600.0),
    "B_2009-07-01_18.6yr_hourly": ("2009-07-01T00:00:00", NODAL_DAYS, 3600.0),
    "C_1995-01-01_18.6yr_hourly": ("1995-01-01T00:00:00", NODAL_DAYS, 3600.0),
}
UMAR_5MIN_ANY = {"Site01": 0.8776, "Site04": 0.7852, "Site07": 0.8209, "Site11": 0.8506}


def sun_vectors(start_utc, days, step_s):
    et0 = sp.str2et(start_utc)
    ets = et0 + np.arange(0.0, days * 86400.0, step_s)
    pos = np.empty((ets.size, 3))
    for i, et in enumerate(ets):
        pos[i] = sp.spkpos("SUN", et, "MOON_ME_DE421", "CN+S", "MOON")[0]
    return ets, pos


def basis(lat, lon):
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return east, north, up


def metrics(sun_km, hz):
    obs_km = np.array(hz["observer_xyz_m"]) / 1000.0
    v = sun_km - obs_km
    dist = np.linalg.norm(v, axis=1)
    vn = v / dist[:, None]
    # local frame from the observer position itself (radial up), as in the horizon files
    lat = math.asin(obs_km[2] / np.linalg.norm(obs_km))
    lon = math.atan2(obs_km[1], obs_km[0])
    e, n, u = basis(lat, lon)
    el = np.degrees(np.arcsin(np.clip(vn @ u, -1, 1)))
    az = np.degrees(np.arctan2(vn @ e, vn @ n)) % 360
    prof = np.array(hz["horizon_deg"], float)
    step = hz["az_step_deg"]
    x = az / step
    i0 = np.floor(x).astype(int) % prof.size
    f = x - np.floor(x)
    h = prof[i0] * (1 - f) + prof[(i0 + 1) % prof.size] * f
    r = np.degrees(np.arcsin(SUN_R_KM / dist))
    uu = np.clip((el - h) / r, -1, 1)
    frac = (np.pi - np.arccos(uu) + uu * np.sqrt(1 - uu ** 2)) / np.pi
    return {"any_part": float(((el - h) > -r).mean()), "mean_frac": float(frac.mean()),
            "centre": float((el > h).mean()), "ge_80pct_disc": float((frac >= 0.8).mean()),
            "sun_el_min_max_deg": [round(float(el.min()), 3), round(float(el.max()), 3)]}


def main():
    for k in KERNELS:
        sp.furnsh(str(KER / k))
    pgda = json.loads((ROOT / "data" / "derived" / "validation" / "umar_5min_vs_pgda.json").read_text())
    sites = {f"Site{s}": json.loads((HZ / f"site_{s}.json").read_text()) for s in ("01", "04", "07", "11")}
    out = {k: {} for k in sites}
    for pname, (start, days, step) in PERIODS.items():
        t0 = time.time()
        ets, sun = sun_vectors(start, days, step)
        print(f"{pname}: {ets.size} steps, SPICE {time.time() - t0:.0f} s, "
              f"{sp.et2utc(ets[0], 'ISOC', 0)} .. {sp.et2utc(ets[-1], 'ISOC', 0)}")
        for key, hz in sites.items():
            out[key][pname] = metrics(sun, hz)
    print(f"\n{'site':6} {'period':28} {'any':>6} {'mean':>6} {'centre':>6} | NASA pixel / bilinear | Umar 5min any")
    for key in sites:
        nasa = pgda[key]["nasa_sun_any_part"]
        out[key]["nasa_pixel"] = nasa["nearest"]
        out[key]["nasa_bilinear"] = nasa["bilinear"]
        out[key]["nasa_5x5_min_max"] = nasa["5x5_min_max"]
        out[key]["umar_any_part_5min_2009_2013"] = UMAR_5MIN_ANY[key]
        for pname in PERIODS:
            m = out[key][pname]
            print(f"{key:6} {pname:28} {m['any_part']:6.3f} {m['mean_frac']:6.3f} {m['centre']:6.3f} | "
                  f"{nasa['nearest']:.3f} / {nasa['bilinear']:.3f} | {UMAR_5MIN_ANY[key]:.3f}")
    out["_note"] = ("Real SPICE (DE421, MOON_ME_DE421, CN+S) + our horizon profiles, terrain only, hourly. NASA map "
                    "AVGVISIB_85S_060M_201608 = hourly average over ~18.6 yr, any part of the disc (.LBL), from the "
                    "60 m LDEM_85S_060M. Disc cut by a horizontal line at the horizon elevation at the centre azimuth.")
    OUT.write_text(json.dumps(out, indent=2))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
