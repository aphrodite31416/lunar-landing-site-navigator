"""Convert the historical Colab CSV handoff to frontend JSON."""

import csv
from pathlib import Path

import numpy as np

from ..inputs import SITE_IDS, file_hash, write_json


def export_history(source, output):
    source, output = Path(source), Path(output)
    daily_path = source / "four_year_daily_visibility_estimate.csv"
    summary_path = source / "four_year_visibility_summary_estimate.csv"
    if not daily_path.exists() or not summary_path.exists():
        return None
    with daily_path.open(newline="", encoding="utf-8") as stream:
        daily = list(csv.DictReader(stream))
    with summary_path.open(newline="", encoding="utf-8") as stream:
        summary = list(csv.DictReader(stream))
    if not daily or len(summary) != len(SITE_IDS):
        raise ValueError("Historical handoff must include daily and summary data for four sites.")
    sites = []
    for site_id in SITE_IDS:
        rows = [row for row in daily if row["site_id"] == site_id]
        summaries = [row for row in summary if row["site_id"] == site_id]
        if not rows or len(summaries) != 1:
            raise ValueError(f"Missing or duplicate historical data for {site_id}.")
        times = [row["utc"] for row in rows]
        if times != sorted(set(times)):
            raise ValueError("Historical days must be distinct and sorted.")
        last_date = rows[-1]["utc"][:10]
        series = []
        for row in rows:
            sun, earth = float(row["sun_visible_fraction"]), float(row["earth_center_visible"])
            if not np.isfinite([sun, earth]).all() or not 0 <= sun <= 1 or not 0 <= earth <= 1:
                raise ValueError("Historical daily visibility fractions must be in [0,1].")
            series.append({"date": row["utc"][:10], "mean_sun_visible_fraction": sun,
                           "earth_center_visible_sample_fraction": earth,
                           "partial_day": row["utc"][:10] == last_date})
        row = summaries[0]
        metrics = {"sample_count": int(row["samples"]),
                   "mean_sun_visible_fraction": float(row["mean_sun_visible_fraction_pct"]) / 100,
                   "sun_fraction_ge_0_8_sample_fraction": float(row["samples_with_sun_fraction_ge_80_pct"]) / 100,
                   "earth_center_visible_sample_fraction": float(row["earth_center_above_terrain_pct"]) / 100,
                   "sun_visible_fraction_min": float(row["sun_fraction_min"]),
                   "sun_visible_fraction_max": float(row["sun_fraction_max"])}
        if metrics["sample_count"] <= 0 or any(not 0 <= v <= 1 for k, v in metrics.items() if k != "sample_count"):
            raise ValueError("Invalid historical summary metrics.")
        document = {"schema_version": "1.0", "kind": "historical_daily_aggregates", "site_id": site_id,
                    "period": {"start_date": rows[0]["utc"][:10], "end_date": last_date},
                    "aggregation": "sample_mean", "solar_disc_samples": 256,
                    "metrics": metrics, "series": series,
                    "warnings": ["Historical 2009–2013 sample statistics are not a forecast for 2026.",
                                 "Daily averages cannot reconstruct event times or longest interruptions.",
                                 "Final day contains the terminal endpoint only; exclude it from full-day comparisons.",
                                 "Daily date labels are preserved from the source notebook."],
                    "provenance": {"input_sha256": {daily_path.name: file_hash(daily_path),
                                                    summary_path.name: file_hash(summary_path)}}}
        relative = f"historical/{site_id}.json"
        write_json(output / relative, document)
        sites.append({"site_id": site_id, "url": relative, "metrics": metrics})
    return {"id": "historical-2009-2013", "kind": "historical_daily_aggregates",
            "start_utc": "2009-07-01T00:00:00Z", "end_utc": "2013-07-01T00:00:00Z",
            "sites": sites}
