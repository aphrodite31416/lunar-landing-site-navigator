"""Terrain horizon profile h(A) for a site, schema v2 (docs/research/roteiro-horizonte.md §6).

Rays follow great circles from the site; the terrain elevation angle uses Zarina's exact formula
(README 8.3): beta = atan2(r*cos(psi) - r_o, r*sin(psi)). h(A) = max beta along the ray.
Elevations come from dem_reader.elevation_at (5 m -> 80 m -> 240 m, blended across seams).

Run:
    .venv/Scripts/python scripts/horizon.py Site01 -89.464 -137.87 "Connecting ridge (Site01)" [--checks]
Output: data/derived/horizons/site_01.json (+ site_01.png quick-look plot).
--checks also runs the convergence checks (0.025 deg azimuth, half distance steps) and writes
data/derived/horizons/site_01_checks.json.
"""
import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dem_reader import BLEND_5M_M, BLEND_80M_M, R_M, RAW, _Dem, latlon_to_xy, make_elevation_at  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "derived" / "horizons"
H_OBS = 1.0
Z_LO, Z_HI = -9229.0, 10892.0          # global LOLA extremes -9129 / +10792 m (Smith et al. 2017, Icarus 283) + 100 m margin
BANDS = ((15000.0, 2.5), (300000.0, 40.0), (None, 120.0))   # (end of band in m, step in m)
DEM_FILES = ["{site}_final_adj_5mpp_surf.tif", "LDEM_80S_80MPP_ADJ.TIF", "LDEM_60S_240MPP_ADJ.TIF"]


def coverage_limit_m(z0, h=H_OBS):
    ro, rmin, rmax = R_M + z0 + h, R_M + Z_LO, R_M + Z_HI
    return (math.acos(rmin / ro) + math.acos(rmin / rmax)) * R_M


def distances(limit_m, scale=1.0):
    d, start = [], 0.0
    for end, step in BANDS:
        end = limit_m if end is None else min(end, limit_m)
        step *= scale
        d.append(np.arange(start + step, end + step / 2, step))
        start = end
        if end >= limit_m:
            break
    return np.concatenate(d)


def basis(lat, lon):
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return east, north, up


REFINE_PEAKS, REFINE_PTS = 8, 21    # 8 highest local maxima of each ray, 21 points over +-1 step


def _ray_points(e, n, u, a, psi):
    """a: (n_az, 1, 1) azimuth in rad; psi: (n_d,) or (n_az, n_d) arc angle -> lat, lon of the samples."""
    psi = psi[None, :, None] if psi.ndim == 1 else psi[..., None]
    dirs = np.cos(psi) * u + np.sin(psi) * (np.cos(a) * n + np.sin(a) * e)
    return np.arcsin(np.clip(dirs[..., 2], -1, 1)), np.arctan2(dirs[..., 1], dirs[..., 0])


def scan(lat_deg, lon_deg, elevation_at, az_deg, dist_m, z0, h=H_OBS, block=40, refine=True):
    """Max elevation angle per azimuth. With refine=True, the 8 highest local maxima of the sampled
    profile are re-sampled at step/10 over +-1 step, then the best one at step/100, so the peak between
    two samples (often a kink of the bilinear surface) isn't missed."""
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    e, n, u = basis(lat, lon)
    ro = R_M + z0 + h
    psi = dist_m / R_M
    left = np.diff(dist_m, prepend=0.0)
    step = np.maximum(left, np.append(left[1:], left[-1]))       # local step at each sample
    t = np.linspace(-1.0, 1.0, REFINE_PTS)
    out = {k: np.full(az_deg.size, np.nan) for k in ("h", "d", "blat", "blon", "bz")}
    valid = np.zeros(az_deg.size, dtype=bool)
    for i in range(0, az_deg.size, block):
        a = np.radians(az_deg[i:i + block])[:, None, None]
        plat, plon = _ray_points(e, n, u, a, psi)
        z = elevation_at(plat, plon)
        r = R_M + z
        beta = np.arctan2(r * np.cos(psi)[None, :] - ro, r * np.sin(psi)[None, :])
        ok = np.isfinite(beta).all(axis=1)
        nb = beta.shape[0]
        dd = np.broadcast_to(dist_m, beta.shape)
        if refine:
            b = np.where(np.isfinite(beta), beta, -np.inf)
            peak = np.ones_like(b, dtype=bool)
            peak[:, 1:] &= b[:, 1:] >= b[:, :-1]
            peak[:, :-1] &= b[:, :-1] >= b[:, 1:]
            kk = np.argpartition(-np.where(peak, b, -np.inf), REFINE_PEAKS - 1, axis=1)[:, :REFINE_PEAKS]
            dr = np.clip(dist_m[kk][..., None] + step[kk][..., None] * t, 0.5, dist_m[-1]).reshape(nb, -1)
            pr = dr / R_M
            rlat, rlon = _ray_points(e, n, u, a, pr)
            zr = elevation_at(rlat, rlon)
            rr = R_M + zr
            br = np.arctan2(rr * np.cos(pr) - ro, rr * np.sin(pr))
            beta, z = np.concatenate([beta, br], 1), np.concatenate([z, zr], 1)
            plat, plon = np.concatenate([plat, rlat], 1), np.concatenate([plon, rlon], 1)
            dd = np.concatenate([dd, dr], 1)
            # stage 2: around the best point so far, +-1 stage-1 spacing (step/10) at step/100 (kinks of the bilinear surface)
            rows = np.arange(nb)
            k = np.argmax(np.where(np.isfinite(beta), beta, -np.inf), axis=1)
            near = np.abs(dist_m[None, :] - dd[rows, k][:, None]).argmin(axis=1)
            st2 = 2 * step[near] / (REFINE_PTS - 1)
            dr2 = np.clip(dd[rows, k][:, None] + st2[:, None] * t, 0.5, dist_m[-1])
            pr2 = dr2 / R_M
            rlat2, rlon2 = _ray_points(e, n, u, a, pr2)
            zr2 = elevation_at(rlat2, rlon2)
            rr2 = R_M + zr2
            br2 = np.arctan2(rr2 * np.cos(pr2) - ro, rr2 * np.sin(pr2))
            beta, z = np.concatenate([beta, br2], 1), np.concatenate([z, zr2], 1)
            plat, plon = np.concatenate([plat, rlat2], 1), np.concatenate([plon, rlon2], 1)
            dd = np.concatenate([dd, dr2], 1)
        k = np.argmax(np.where(np.isfinite(beta), beta, -np.inf), axis=1)
        rows = np.arange(nb)
        sl = slice(i, i + nb)
        valid[sl] = ok
        out["h"][sl] = np.where(ok, np.degrees(beta[rows, k]), np.nan)
        out["d"][sl] = np.where(ok, dd[rows, k], np.nan)
        out["blat"][sl] = np.where(ok, np.degrees(plat[rows, k]), np.nan)
        out["blon"][sl] = np.where(ok, np.degrees(plon[rows, k]), np.nan)
        out["bz"][sl] = np.where(ok, z[rows, k], np.nan)
    return out, valid


def blend_zone_flags(site, blat, blon):
    """Azimuths whose blocker lies inside a seam transition zone (or outside the 5 m tile)."""
    x, y = latlon_to_xy(np.radians(blat), np.radians(blon))
    t = _Dem.__new__(_Dem)
    import rasterio
    with rasterio.open(RAW / DEM_FILES[0].format(site=site)) as ds:
        b = ds.bounds
    dist_fine = np.minimum.reduce([x - b.left, b.right - x, y - b.bottom, b.top - y])
    edge80 = 304000.0
    dist80 = np.minimum.reduce([x + edge80, edge80 - x, y + edge80, edge80 - y])
    in5 = dist_fine > 0
    zone5 = (dist_fine > -1) & (dist_fine < BLEND_5M_M + 5)
    zone80 = (dist80 > -1) & (dist80 < BLEND_80M_M + 80)
    del t
    return in5, zone5, zone80


def rnd(a, nd):
    return [None if not np.isfinite(v) else round(float(v), nd) for v in a]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site"); ap.add_argument("lat", type=float); ap.add_argument("lon", type=float)
    ap.add_argument("name"); ap.add_argument("--checks", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    stem = f"site_{a.site[-2:]}"
    t0 = time.time()

    elev = make_elevation_at()
    z0 = float(elev(math.radians(a.lat), math.radians(a.lon)))
    limit = coverage_limit_m(z0)
    d = distances(limit)
    az = np.arange(7200) * 0.05
    res, valid = scan(a.lat, a.lon, elev, az, d, z0)
    in5, zone5, zone80 = blend_zone_flags(a.site, res["blat"], res["blon"])
    print(f"{a.site}: z0 = {z0:.2f} m, limit = {limit / 1000:.1f} km, {d.size} samples/azimuth, "
          f"{time.time() - t0:.0f} s")

    lat, lon = math.radians(a.lat), math.radians(a.lon)
    ro = R_M + z0 + H_OBS
    xy = latlon_to_xy(lat, lon)
    status = "complete" if valid.all() else "incomplete"
    doc = {
        "schema_version": 2,
        "site_id": a.site.lower(), "name": a.name,
        "lat_deg": a.lat, "lon_deg": a.lon,
        "coord_type": "planetocentric; lon east, -180..180",
        "site_definition": "centroid of the largest PGDA RoI of the site (data/derived/rois.json, docs/knowledge/sites.md)",
        "stereo_xy_m": [round(xy[0], 1), round(xy[1], 1)],
        "frame": "MOON_ME_DE421",
        "dem_crs": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400",
        "height_reference": "radial height above the sphere R_m (LOLA heights)",
        "R_m": R_M,
        "ground_elevation_m": round(z0, 2),
        "observer_height_m": H_OBS,
        "observer_height_direction": "radial",
        "observer_radius_m": round(ro, 2),
        "observer_xyz_m": [round(ro * math.cos(lat) * math.cos(lon), 2),
                           round(ro * math.cos(lat) * math.sin(lon), 2), round(ro * math.sin(lat), 2)],
        "angle_units": "deg",
        "az_convention": "0 = local North, 90 = East (clockwise); horizontal plane perpendicular to the radial vertical",
        "az_start_deg": 0.0, "az_step_deg": 0.05, "n_az": int(az.size),
        "az_wrap": "7200 unique directions 0..359.95; no duplicate 360; periodic when interpolating",
        "coverage_status": status,
        "coverage": {
            "limit_arc_m": round(limit, 1),
            "formula": "Zarina README 9.1: psi = acos(r_min/r_o) + acos(r_min/r_max)",
            "r_min_m": R_M + Z_LO, "r_max_m": R_M + Z_HI,
            "bounds_source": "global LOLA extremes -9129 / +10792 m (Smith et al. 2017, Icarus 283, 70-91) + 100 m margin; DEM extremes are -9127.11 (240 m) / +7026.33 (80 m)",
            "max_blocking_arc_distance_m": round(float(np.nanmax(res["d"])), 1),
        },
        "sampling": {
            "distance_bands_m": [{"to_m": e if e else round(limit, 1), "step_m": s} for e, s in BANDS],
            "samples_per_azimuth": int(d.size),
            "peak_refinement": f"{REFINE_PEAKS} highest local maxima per ray re-sampled at step/10 over +-1 step, then the best point at step/100 over +-step/10",
            "dem_blend": {"5m_to_80m_m": BLEND_5M_M, "80m_to_240m_m": BLEND_80M_M},
            "convergence": f"see {stem}_checks.json",
        },
        "dem_sources": [f.format(site=a.site) for f in DEM_FILES],
        "method": "max terrain elevation angle along great circles, exact curvature (Zarina README 8.3), "
                  "bilinear, finest valid DEM blended across seams",
        "diagnostics": {
            "n_blocker_in_5m_tile": int(in5.sum()),
            "n_blocker_in_5m_blend_zone": int((zone5 & valid).sum()),
            "n_blocker_in_80m_blend_zone": int((zone80 & valid).sum()),
            "az_blocker_in_blend_zone_deg": rnd(az[(zone5 | zone80) & valid], 2),
            "horizon_min_deg": round(float(np.nanmin(res["h"])), 4),
            "horizon_max_deg": round(float(np.nanmax(res["h"])), 4),
        },
        "az_deg": rnd(az, 2),
        "horizon_deg": rnd(res["h"], 4),
        "valid": [bool(v) for v in valid],
        "blocking_arc_distance_m": rnd(res["d"], 1),
        "blocker_lat_deg": rnd(res["blat"], 5),
        "blocker_lon_deg": rnd(res["blon"], 5),
        "blocker_elevation_m": rnd(res["bz"], 1),
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (OUT / f"{stem}.json").write_text(json.dumps(doc), encoding="utf-8")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(2, 1, figsize=(11, 6), sharex=True)
    ax[0].plot(az, res["h"], lw=0.8)
    ax[0].axhline(-math.degrees(math.acos(R_M / (R_M + H_OBS))), color="gray", lw=0.6, ls="--")
    ax[0].set_ylabel("horizon (deg)"); ax[0].set_title(f"{a.name}: terrain horizon, observer 1 m")
    ax[1].plot(az, res["d"] / 1000, ".", ms=1)
    ax[1].set_ylabel("blocker distance (km)"); ax[1].set_xlabel("azimuth (deg, 0 = N, 90 = E)")
    ax[1].set_xlim(0, 360); ax[1].set_xticks(range(0, 361, 45))
    fig.tight_layout(); fig.savefig(OUT / f"{stem}.png", dpi=110)

    print(json.dumps({k: doc[k] for k in ("coverage_status", "coverage", "diagnostics")}, indent=1)[:2500])

    if not a.checks:
        return
    checks = {}
    # 1. Azimuth: midpoints at 0.025 deg vs periodic interpolation of the 0.05 deg profile
    t1 = time.time()
    mid = az + 0.025
    rm, vm = scan(a.lat, a.lon, elev, mid, d, z0)
    interp = np.interp(mid, az, res["h"], period=360)
    da = np.abs(rm["h"] - interp)
    checks["azimuth_0.025_vs_0.05"] = {
        "n": int(mid.size), "max_abs_deg": round(float(np.nanmax(da)), 4),
        "p99_abs_deg": round(float(np.nanpercentile(da, 99)), 4),
        "p95_abs_deg": round(float(np.nanpercentile(da, 95)), 4),
        "mean_abs_deg": round(float(np.nanmean(da)), 5),
        "frac_above_0.01_deg": round(float(np.mean(da > 0.01)), 4),
        "az_of_max_deg": round(float(mid[np.nanargmax(da)]), 3),
        "seconds": round(time.time() - t1)}
    # 2. Along-profile: half distance steps, same azimuths
    t1 = time.time()
    d2 = distances(limit, scale=0.5)
    r2, v2 = scan(a.lat, a.lon, elev, az, d2, z0)
    dd = np.abs(r2["h"] - res["h"])
    checks["distance_half_steps"] = {
        "samples_per_azimuth": int(d2.size), "max_abs_deg": round(float(np.nanmax(dd)), 4),
        "p99_abs_deg": round(float(np.nanpercentile(dd, 99)), 4),
        "mean_abs_deg": round(float(np.nanmean(dd)), 5),
        "frac_above_0.01_deg": round(float(np.mean(dd > 0.01)), 4),
        "az_of_max_deg": round(float(az[np.nanargmax(dd)]), 2),
        "seconds": round(time.time() - t1)}
    # 3. Smooth sphere: constant z = z0 everywhere -> -acos(r_s/(r_s+h)) with r_s = R + z0
    flat = lambda la, lo: np.full(np.broadcast(la, lo).shape, z0)  # noqa: E731
    rs, _ = scan(a.lat, a.lon, flat, az[::360], d, z0)
    exact = -math.degrees(math.acos((R_M + z0) / (R_M + z0 + H_OBS)))
    checks["smooth_sphere"] = {"expected_deg": round(exact, 5),
                               "got_min_deg": round(float(np.min(rs["h"])), 5),
                               "got_max_deg": round(float(np.max(rs["h"])), 5)}
    (OUT / f"{stem}_checks.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    print(json.dumps(checks, indent=1))


if __name__ == "__main__":
    main()
