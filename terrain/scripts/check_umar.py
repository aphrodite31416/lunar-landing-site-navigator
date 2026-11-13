"""Independent check of Umar's ephemeris exports (entrada/umar/ephemeris_siteXX_exports/).

For each site:
1. JSON: observer XYZ equals ours; frame / abcorr / refloc as agreed.
2. Recompute az/el from his NPZ vectors with our local basis (radial up, 0 = N, 90 = E) and compare with his CSV.
3. Terrain horizon at the Sun/Earth azimuth from our site_XX.json (periodic interpolation) vs his CSV column.
4. Flags: centre above horizon, plus sun disc fraction (radius 0.2666 deg, linear approx) over the full month.
5. NASA PGDA average-illumination map (Sun and Earth, 60 m, 2009-2013) at the site, 3x3 neighbourhood.

Run: .venv/Scripts/python scripts/check_umar.py
Writes data/derived/validation/umar_check.json.
"""
import csv
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "entrada" / "umar"
HZ = ROOT / "data" / "derived" / "horizons"
VAL = ROOT / "data" / "raw" / "validacao"
R = 1737400.0
SUN_R_KM = 696000.0


def basis(lat, lon):
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return east, north, up


def azel(v, e, n, u):
    vn = v / np.linalg.norm(v, axis=1)[:, None]
    el = np.degrees(np.arcsin(np.clip(vn @ u, -1, 1)))
    az = np.degrees(np.arctan2(vn @ e, vn @ n)) % 360
    return az, el, np.linalg.norm(v, axis=1)


def angdiff(a, b):
    return (a - b + 180) % 360 - 180


def load_map(name):
    return np.fromfile(VAL / name, dtype="<i2").reshape(5058, 5058)


def map_value(img, lat, lon, ysign):
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    col = 2528.5 + x / 60.0 - 0.5      # 0-based pixel index whose centre is nearest
    row = 2528.5 - ysign * y / 60.0 - 0.5
    c, r = int(round(col)), int(round(row))
    win = img[r - 1:r + 2, c - 1:c + 2] * 0.00004
    return float(img[r, c] * 0.00004), float(win.min()), float(win.max())


def main():
    sun_map, earth_map = load_map("AVGVISIB_85S_060M_201608.IMG"), load_map("AVGVISIB_85S_060M_201608_EARTH.IMG")
    # orientation test: Shackleton floor (permanent shadow) near -89.67, 129.8 must be ~0
    for ys in (1, -1):
        print("orientation ysign", ys, "Shackleton floor sun:", map_value(sun_map, -89.67, 129.8, ys))
    rois = json.loads((ROOT / "data" / "derived" / "rois.json").read_text(encoding="utf-8"))
    report = {}
    for sid in ("01", "04", "07", "11"):
        d = IN / f"ephemeris_site{sid}_exports"
        meta = json.loads((d / f"ephemeris_site{sid}.json").read_text(encoding="utf-8"))
        npz = np.load(d / f"ephemeris_site{sid}.npz")
        hz = json.loads((HZ / f"site_{sid}.json").read_text(encoding="utf-8"))
        lat, lon = math.radians(hz["lat_deg"]), math.radians(hz["lon_deg"])
        e, n, u = basis(lat, lon)
        az_g = np.array(hz["az_deg"]); h_g = np.array(hz["horizon_deg"], dtype=float)
        hor = lambda a: np.interp(a, az_g, h_g, period=360)  # noqa: E731
        r = {"observer_xyz_max_diff_m": float(np.max(np.abs(np.array(meta["observer_position_xyz_m"]) - np.array(hz["observer_xyz_m"])))),
             "frame": meta["frame"], "abcorr": meta["abcorr"], "refloc": meta["spkcpo_refloc"],
             "kernels": meta["kernel_filenames"], "utc": [meta["utc_start"], meta["utc_end"]], "n_month": int(meta["sample_count"])}
        saz, sel, sdist = azel(npz["sun_vectors_m"], e, n, u)
        eaz, eel, _ = azel(npz["earth_vectors_m"], e, n, u)
        # CSV (first 48 h)
        with open(d / f"ephemeris_site{sid}_az_el_first_48h.csv", newline="") as f:
            rows = list(csv.DictReader(f))
        k = len(rows)
        col = lambda name: np.array([float(x[name]) for x in rows])  # noqa: E731
        flag = lambda name: np.array([x[name] == "True" for x in rows])  # noqa: E731
        r["csv_rows"] = k
        r["csv_vs_vectors_max_deg"] = {
            "sun_az": float(np.max(np.abs(angdiff(col("sun_azimuth_deg"), saz[:k])))),
            "sun_el": float(np.max(np.abs(col("sun_elevation_deg") - sel[:k]))),
            "earth_az": float(np.max(np.abs(angdiff(col("earth_azimuth_deg"), eaz[:k])))),
            "earth_el": float(np.max(np.abs(col("earth_elevation_deg") - eel[:k])))}
        r["csv_horizon_vs_ours_max_deg"] = {
            "sun": float(np.max(np.abs(col("sun_terrain_horizon_deg") - hor(col("sun_azimuth_deg"))))),
            "earth": float(np.max(np.abs(col("earth_terrain_horizon_deg") - hor(col("earth_azimuth_deg")))))}
        s_up = sel[:k] > hor(saz[:k]); e_up = eel[:k] > hor(eaz[:k])
        r["csv_flag_mismatches"] = {"sun": int(np.sum(s_up != flag("sun_center_above_terrain_horizon"))),
                                    "earth": int(np.sum(e_up != flag("earth_center_above_terrain_horizon")))}
        r["csv_48h"] = {"sun_centre_up_frac": float(s_up.mean()), "earth_centre_up_frac": float(e_up.mean()),
                        "sun_el_range": [float(sel[:k].min()), float(sel[:k].max())],
                        "earth_el_range": [float(eel[:k].min()), float(eel[:k].max())],
                        "min_sun_margin_deg": float(np.min(sel[:k] - hor(saz[:k]))),
                        "max_earth_margin_deg": float(np.max(eel[:k] - hor(eaz[:k])))}
        # full month
        sun_rad = np.degrees(np.arcsin(SUN_R_KM * 1000 / sdist))
        smarg = sel - hor(saz)
        frac = np.clip((smarg + sun_rad) / (2 * sun_rad), 0, 1)     # linear disc-fraction approx
        emarg = eel - hor(eaz)
        r["month"] = {"sun_centre_up_frac": float(np.mean(smarg > 0)), "sun_any_part_up_frac": float(np.mean(frac > 0)),
                      "sun_ge80pct_frac": float(np.mean(frac >= 0.8)), "mean_disc_fraction": float(frac.mean()),
                      "earth_centre_up_frac": float(np.mean(emarg > 0)),
                      "sun_el_range": [float(sel.min()), float(sel.max())], "earth_el_range": [float(eel.min()), float(eel.max())]}
        site = f"Site{sid}"
        big = max(rois[site], key=lambda x: x["area_m2"])
        r["pgda_map_at_site"] = {"sun": map_value(sun_map, hz["lat_deg"], hz["lon_deg"], 1),
                                 "earth": map_value(earth_map, hz["lat_deg"], hz["lon_deg"], 1),
                                 "note": "2009-07..2013-07 average, any part of the disc; [centre, 3x3 min, 3x3 max]",
                                 "roi": big["roi"]}
        report[site] = r
        print(site, json.dumps(r, indent=1))
    out = ROOT / "data" / "derived" / "validation"
    out.mkdir(parents=True, exist_ok=True)
    (out / "umar_check.json").write_text(json.dumps(report, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
