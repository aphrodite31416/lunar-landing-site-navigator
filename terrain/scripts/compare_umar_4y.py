"""Compare Umar's four-year visibility estimates (2009-07..2013-07) with the NASA PGDA
average-illumination maps (AVGVISIB_85S_060M, Sun and Earth, same period).

The NASA map counts the fraction of timesteps with ANY part of the disc visible.
Umar's summary gives the MEAN visible fraction of the solar disc (a different metric) and
the Earth CENTRE above terrain. From his daily file (00:00 UTC samples) we also derive
"any part of the Sun visible" (fraction > 0), which is the metric comparable to the map.

Run: .venv/Scripts/python scripts/compare_umar_4y.py
Writes data/derived/validation/umar_4y_vs_pgda.json.
"""
import collections
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "entrada" / "umar" / "four_year_visibility_results"
CHECK = ROOT / "data" / "derived" / "validation" / "umar_check.json"
OUT = ROOT / "data" / "derived" / "validation" / "umar_4y_vs_pgda.json"


def main():
    summary = {r["site_id"]: r for r in csv.DictReader(open(IN / "four_year_visibility_summary_estimate.csv"))}
    daily = collections.defaultdict(list)
    for r in csv.DictReader(open(IN / "four_year_daily_visibility_estimate.csv")):
        daily[r["site_id"]].append((float(r["sun_visible_fraction"]), float(r["earth_center_visible"])))
    pgda = json.load(open(CHECK))

    out = {}
    print(f"{'site':6} {'U mean':>7} {'U any':>6} {'NASA sun [3x3]':>22} | {'U earthC':>8} {'NASA earth [3x3]':>22}")
    for sid, s in summary.items():
        key = "Site" + sid[-2:]
        d = daily[sid]
        n = len(d)
        u_mean = float(s["mean_sun_visible_fraction_pct"]) / 100
        u_any = sum(x[0] > 0 for x in d) / n
        u_full = sum(x[0] >= 0.999 for x in d) / n
        u_earth = float(s["earth_center_above_terrain_pct"]) / 100
        m = pgda[key]["pgda_map_at_site"]
        out[key] = {
            "umar_sun_mean_disc_fraction": u_mean,
            "umar_sun_any_part_daily": u_any,
            "umar_sun_full_disc_daily": u_full,
            "umar_sun_mean_disc_fraction_daily": sum(x[0] for x in d) / n,
            "umar_earth_centre": u_earth,
            "nasa_sun_any_part": m["sun"],
            "nasa_earth_any_part": m["earth"],
            "daily_samples": n,
        }
        fmt = lambda v: f"{v[0]:.3f} [{v[1]:.3f}-{v[2]:.3f}]"
        print(f"{key:6} {u_mean:7.3f} {u_any:6.3f} {fmt(m['sun']):>22} | {u_earth:8.3f} {fmt(m['earth']):>22}")
    out["_note"] = ("NASA values: [centre pixel, 3x3 min, 3x3 max], 60 m map, any part of the disc. "
                    "Umar any-part/full-disc come from his daily 00:00 UTC samples (1462 per site).")
    OUT.write_text(json.dumps(out, indent=2))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
