"""Angular uncertainty of the terrain horizon from the vertical uncertainty of the 5 m LDEM.

Source of the height errors: NASA PGDA "Total Z uncertainty" maps (SiteXX_final_adj_5mpp_toterr.tif,
"formally, the RMS error", https://pgda.gsfc.nasa.gov/products/78), from Barker et al. 2021,
Planet. Space Sci. 203, 105119 (median RMS Z error ~0.30-0.50 m inside the RoIs).

For each azimuth of data/derived/horizons/site_XX.json, the blocker point (blocker_lat/lon) and
the observer are looked up in the error map. Small-angle propagation:
    sigma_h ~ sqrt(sigma_blocker^2 + sigma_observer^2) / d     (rad; d = blocking_arc_distance_m)
treating the two errors as independent. Blockers outside the 5 m tile (80/240 m mosaics) have no
published error map: for them we only report the sensitivity (deg per metre of height error).

Caveat (Barker et al. 2021, sec. 5): height errors bias the horizon UP on average (one positive
bump along the ray is enough to raise it), so illumination with errors is usually worse than nominal.
This RMS estimate is symmetric and does not capture that bias.

Run: .venv/Scripts/python scripts/horizon_uncertainty.py
Writes data/derived/validation/horizon_uncertainty.json.
"""
import json
import hashlib
import math
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parent.parent
HZ = ROOT / "data" / "derived" / "horizons"
ERR = ROOT / "data" / "raw" / "incerteza"
OUT = ROOT / "data" / "derived" / "validation" / "horizon_uncertainty.json"
R = 1737400.0


def stereo_xy(lat_deg, lon_deg):
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    rho = 2 * R * np.tan((np.pi / 2 + lat) / 2)
    return rho * np.sin(lon), rho * np.cos(lon)


def sample(ds, band, x, y):
    rows, cols = rasterio.transform.rowcol(ds.transform, np.atleast_1d(x), np.atleast_1d(y))
    rows, cols = np.asarray(rows), np.asarray(cols)
    ok = (rows >= 0) & (rows < ds.height) & (cols >= 0) & (cols < ds.width)
    out = np.full(rows.shape, np.nan)
    out[ok] = band[rows[ok], cols[ok]]
    return out


def pct(a, q):
    return round(float(np.percentile(a, q)), 4) if a.size else None


def main():
    out = {}
    print(f"{'site':6} {'sig_obs':>7} {'in5m':>5} | {'med':>6} {'p95':>6} {'max':>6} deg (5 m tile) | far: med d km, deg/m")
    for s in ("01", "04", "07", "11"):
        hz = json.loads((HZ / f"site_{s}.json").read_text())
        with rasterio.open(ERR / f"Site{s}_final_adj_5mpp_toterr.tif") as ds:
            band = ds.read(1, masked=True).astype(float).filled(np.nan)
            band[band < 0] = np.nan
            ox, oy = stereo_xy(hz["lat_deg"], hz["lon_deg"])
            assert abs(ox - hz["stereo_xy_m"][0]) < 1 and abs(oy - hz["stereo_xy_m"][1]) < 1, "projection mismatch"
            sig_o = float(sample(ds, band, ox, oy)[0])
            if not np.isfinite(sig_o):
                raise ValueError(f"Site{s}: missing valid observer height uncertainty.")
            bx, by = stereo_xy(np.array(hz["blocker_lat_deg"], float), np.array(hz["blocker_lon_deg"], float))
            sig_b = sample(ds, band, bx, by)
        d = np.array(hz["blocking_arc_distance_m"], float)
        valid = np.array(hz["valid"], bool)
        if np.any(valid & (~np.isfinite(d) | (d <= 0))):
            raise ValueError(f"Site{s}: invalid blocker distance.")
        near = valid & np.isfinite(sig_b)
        far = valid & ~np.isfinite(sig_b)
        sig_h = np.degrees(np.sqrt(sig_b[near] ** 2 + sig_o ** 2) / d[near])
        sens_far = np.degrees(1.0 / d[far])                     # deg per metre of height error
        key = "Site" + s
        out[key] = {
            "horizon_sha256": hashlib.sha256((HZ / f"site_{s}.json").read_bytes()).hexdigest(),
            "error_map_sha256": hashlib.sha256((ERR / f"Site{s}_final_adj_5mpp_toterr.tif").read_bytes()).hexdigest(),
            "method": "independent_height_errors_at_fixed_nominal_blockers_small_angle",
            "scope": "Valid error-map pixels only; >=100 m medians cover a subset of all azimuths. No full horizon or timing confidence bound.",
            "physical_event_time_uncertainty_s": None,
            "observer_sigma_z_m": round(sig_o, 3),
            "n_azimuths": int(valid.sum()),
            "frac_blocker_in_5m_tile": round(float(near.sum() / valid.sum()), 3),
            "blocker_sigma_z_m_in_tile": {"median": pct(sig_b[near], 50), "p95": pct(sig_b[near], 95)},
            "blocker_distance_m_in_tile": {"median": pct(d[near], 50), "min": pct(d[near], 0)},
            "horizon_sigma_deg_in_tile": {"median": pct(sig_h, 50), "p95": pct(sig_h, 95), "max": pct(sig_h, 100),
                                          "frac_above_0.01": round(float((sig_h > 0.01).mean()), 3) if sig_h.size else None},
            # Blockers closer than 100 m (20 px) share interpolation error with the observer pixel, so the
            # independent-error formula overstates them; >= 100 m is the more trustworthy figure.
            "horizon_sigma_deg_blocker_lt_100m": {"frac_of_azimuths": round(float((d[near] < 100).sum() / valid.sum()), 3),
                                                  "median": pct(sig_h[d[near] < 100], 50),
                                                  "horizon_deg_median": pct(np.array(hz["horizon_deg"], float)[near][d[near] < 100], 50)},
            "horizon_sigma_deg_blocker_ge_100m": {"frac_of_azimuths": round(float((d[near] >= 100).sum() / valid.sum()), 3),
                                                  "median": pct(sig_h[d[near] >= 100], 50),
                                                  "p95": pct(sig_h[d[near] >= 100], 95)},
            "far_blockers": {"median_distance_km": pct(d[far] / 1000, 50),
                             "deg_per_m_height_error_median": pct(sens_far, 50),
                             "deg_per_m_height_error_max": pct(sens_far, 100)},
        }
        o = out[key]
        print(f"{key:6} {sig_o:7.2f} {o['frac_blocker_in_5m_tile']:5.2f} | {pct(sig_h, 50):6.3f} {pct(sig_h, 95):6.3f} "
              f"{pct(sig_h, 100):6.3f} | {o['far_blockers']['median_distance_km']} km, {o['far_blockers']['deg_per_m_height_error_median']}")
    out["_note"] = ("sigma_h = sqrt(sigma_blocker^2 + sigma_observer^2)/d, small-angle, independent errors at fixed nominal blockers; "
                    "the >=100 m medians apply only to the reported subset of azimuths, not the whole horizon or event times. "
                    "Spatial covariance and blocker changes have not been propagated. Height errors from "
                    "NASA PGDA SiteXX_final_adj_5mpp_toterr.tif (Barker et al. 2021, PSS 203, 105119). Symmetric RMS: does "
                    "not include the upward bias of the horizon described by Barker et al. Far blockers (80/240 m mosaics) "
                    "have no error map included in this calculation; only sensitivity in deg per metre is given.")
    OUT.write_text(json.dumps(out, indent=2))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
