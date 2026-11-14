"""Compare Umar's 4-year "any part of the Sun visible" from the full 5-minute series (2026-11-14,
preliminary, terrain only) with the NASA PGDA average-illumination map AVGVISIB_85S_060M (Sun,
hourly over ~18.6 years, any part of the disc), at the same site coordinates (centroid of the largest RoI,
data/derived/horizons/site_XX.json).

Map read as in check_umar.py (orientation checked on the Shackleton floor = 0). Extra statistics:
bilinear value, 3x3 (+-60 m) and 5x5 (+-120 m) windows, and the map at every RoI centroid of the site.

Run: .venv/Scripts/python scripts/compare_umar_5min.py
Writes data/derived/validation/umar_5min_vs_pgda.json.
"""
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
HZ = ROOT / "data" / "derived" / "horizons"
VAL_IN = ROOT / "data" / "raw" / "validacao"
OUT = ROOT / "data" / "derived" / "validation" / "umar_5min_vs_pgda.json"
R = 1737400.0
SCALE = 0.00004

# Umar, message of 2026-11-14: any part of the Sun visible over the full 5-min series, terrain only.
UMAR_5MIN = {"Site01": 0.8776, "Site04": 0.7852, "Site07": 0.8209, "Site11": 0.8506}
# Umar, 2026-11-11 daily 00:00 UTC samples (data/derived/validation/umar_4y_vs_pgda.json).
OLD = json.loads((ROOT / "data" / "derived" / "validation" / "umar_4y_vs_pgda.json").read_text())


def pix(lat, lon):
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    return 2528.5 + x / 60.0 - 0.5, 2528.5 - y / 60.0 - 0.5     # (col, row), 0-based, pixel centres


def stats(img, lat, lon):
    col, row = pix(lat, lon)
    c, r = int(round(col)), int(round(row))
    c0, r0 = int(math.floor(col)), int(math.floor(row))
    fc, fr = col - c0, row - r0
    q = img[r0:r0 + 2, c0:c0 + 2]
    bil = (q[0, 0] * (1 - fc) * (1 - fr) + q[0, 1] * fc * (1 - fr) + q[1, 0] * (1 - fc) * fr + q[1, 1] * fc * fr)
    w3, w5 = img[r - 1:r + 2, c - 1:c + 2], img[r - 2:r + 3, c - 2:c + 3]
    return {"nearest": float(img[r, c]), "bilinear": float(bil),
            "3x3_min_max": [float(w3.min()), float(w3.max())],
            "5x5_min_max": [float(w5.min()), float(w5.max())],
            "offset_from_pixel_centre_m": [round((col - c) * 60, 1), round((row - r) * 60, 1)]}


def main():
    img = np.fromfile(VAL_IN / "AVGVISIB_85S_060M_201608.IMG", dtype="<i2").reshape(5058, 5058) * SCALE
    rois = json.loads((ROOT / "data" / "derived" / "rois.json").read_text())
    out = {}
    print(f"{'site':6} {'Umar5m':>6} {'old':>5} | {'near':>5} {'bilin':>5} {'3x3 max':>7} {'5x5 max':>7} {'RoIs max':>8} | {'U-near':>6}")
    for s in ("01", "04", "07", "11"):
        key = "Site" + s
        hz = json.loads((HZ / f"site_{s}.json").read_text())
        st = stats(img, hz["lat_deg"], hz["lon_deg"])
        roi_vals = [stats(img, r["centroid_lat_deg"], r["centroid_lon_deg"])["nearest"] for r in rois[key]]
        u = UMAR_5MIN[key]
        out[key] = {"lat_deg": hz["lat_deg"], "lon_deg": hz["lon_deg"],
                    "umar_any_part_5min": u, "umar_any_part_daily_20261111": OLD[key]["umar_sun_any_part_daily"],
                    "nasa_sun_any_part": st, "nasa_at_roi_centroids": roi_vals,
                    "diff_vs_nearest_pts": round((u - st["nearest"]) * 100, 2),
                    "above_5x5_max": u > st["5x5_min_max"][1]}
        print(f"{key:6} {u:6.3f} {OLD[key]['umar_sun_any_part_daily']:5.3f} | {st['nearest']:5.3f} {st['bilinear']:5.3f} "
              f"{st['3x3_min_max'][1]:7.3f} {st['5x5_min_max'][1]:7.3f} {max(roi_vals):8.3f} | {(u - st['nearest']) * 100:+6.1f}")
    out["_note"] = ("Umar 5-min values from his message of 2026-11-14 (preliminary, terrain only). NASA map: "
                    "AVGVISIB_85S_060M_201608, Sun, any part of the disc, hourly over ~18.6 years, 60 m, LDEM_85S_060M. "
                    "Map max over the whole product: 0.884 (DERIVED_MAXIMUM in the .LBL).")
    OUT.write_text(json.dumps(out, indent=2))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
