"""Validate the existing four-site frontend contract before copying ready data."""

from pathlib import Path
from datetime import datetime

import numpy as np
from jsonschema import Draft202012Validator

from .inputs import SITE_IDS, file_hash, read_json


def validate_frontend(directory, schema_path):
    directory, repo = Path(directory), Path(schema_path).resolve().parents[1]
    manifest = read_json(directory / "manifest.json")
    sites = read_json(directory / manifest["sites_url"])["sites"]
    if manifest["status"] != "ready" or sorted(row["site_id"] for row in sites) != sorted(SITE_IDS):
        raise ValueError("Frontend data must contain all four ready sites, once each.")
    validator = Draft202012Validator(read_json(schema_path))
    dataset = next(row for row in manifest["datasets"] if row["kind"] == "terrain_scenarios")
    summaries = {row["site_id"]: row for row in dataset["scenarios"]}
    if sorted(summaries) != sorted(SITE_IDS) or len(dataset["scenarios"]) != len(SITE_IDS):
        raise ValueError("Manifest summaries must contain all four sites, once each.")
    periods, rows = set(), []

    def close(actual, expected, label, atol=1e-6):
        if not np.allclose(actual, expected, rtol=0, atol=atol):
            raise ValueError(f"Inconsistent frontend data: {label}.")

    for site in sites:
        site_id = site["site_id"]
        if site["terrain_status"] != "ready":
            raise ValueError(f"{site_id}: terrain not ready.")
        scenario = read_json(directory / site["scenario_url"])
        errors = list(validator.iter_errors(scenario))
        if errors:
            raise ValueError(f"{site_id}: scenario schema: {errors[0].message}")
        if scenario["model"]["settings"] != manifest["settings"]:
            raise ValueError(f"{site_id}: manifest and scenario settings disagree.")
        if summaries[site_id]["url"] != site["scenario_url"] or summaries[site_id]["metrics"] != scenario["metrics"]:
            raise ValueError(f"{site_id}: manifest summary and scenario disagree.")
        horizon = read_json(directory / site["horizon_url"])
        geometry = read_json(directory / site["geometry_url"])
        for document in (scenario, horizon, geometry):
            if document["site_id"] != site_id:
                raise ValueError(f"{site_id}: linked file belongs to another site.")
        if site["observer_height_m"] is None:
            raise ValueError(f"{site_id}: observer height is missing.")
        close(site["observer_height_m"], horizon["observer_height_m"], "observer height")
        close(site["observer_xyz_m"], horizon["observer_xyz_m"], "observer position")
        close([site["latitude_deg"], site["longitude_deg"]], [horizon["lat_deg"], horizon["lon_deg"]], "site coordinates")
        horizon_hash = file_hash(directory / site["horizon_url"])
        if scenario["provenance"]["horizon_sha256"] != horizon_hash:
            raise ValueError(f"{site_id}: stale horizon provenance.")
        if scenario["provenance"]["kernel_sha256"] != manifest["kernel_sha256"]:
            raise ValueError(f"{site_id}: inconsistent kernel provenance.")
        if scenario["provenance"]["input_sha256"] != geometry["provenance"]["input_sha256"]:
            raise ValueError(f"{site_id}: geometry and scenario use different inputs.")
        if horizon.get("dem_sources"):
            checks = read_json(repo / f"terrain/data/derived/horizons/site_{site_id[4:]}_checks.json")
            if not checks.get("pass") or checks.get("horizon_sha256") != horizon_hash:
                raise ValueError(f"{site_id}: stale or failing terrain convergence checks.")
            terrain = read_json(repo / f"data/terrain/site_{site_id[4:]}_terrain.json")
            close([terrain["site"]["lat_deg"], terrain["site"]["lon_deg"]],
                  [site["latitude_deg"], site["longitude_deg"]], "3D marker coordinates")
            close(terrain["site"]["ground_elevation_m"], horizon["ground_elevation_m"], "3D marker height", atol=0.02)
        periods.add(tuple(datetime.fromisoformat(scenario["period"][key].replace("Z", "+00:00"))
                          for key in ("start_utc", "end_utc")))
        duration = scenario["period"]["duration_s"]
        times = np.array([row["offset_s"] for row in scenario["series"]])
        if np.any(np.diff(times) <= 0):
            raise ValueError(f"{site_id}: non-increasing timeline.")
        close([times[0], times[-1]], [0, duration], "timeline bounds")
        if np.max(np.diff(times)) > scenario["model"]["settings"]["search_max_step_s"] + 1e-5:
            raise ValueError(f"{site_id}: timeline exceeds declared search step.")
        for sample in scenario["series"]:
            if sample["sun_visible_fraction"] > sample["sun_terrain_visible_fraction"]:
                raise ValueError(f"{site_id}: occultation increased sunlight.")
        for name, windows in scenario["windows"].items():
            previous_end = 0.0
            for window in windows:
                a, b = window["start_offset_s"], window["end_offset_s"]
                if not previous_end <= a < b <= duration:
                    raise ValueError(f"{site_id}: invalid {name} window order or bounds.")
                close(window["duration_s"], b - a, "window duration")
                previous_end = b
        for name, metric in (("sunlight", "sunlight_s"), ("earth", "earth_visible_s"), ("joint", "joint_s")):
            close(scenario["metrics"][metric], sum(w["duration_s"] for w in scenario["windows"][name]), metric)
        close(scenario["metrics"]["sunlight_time_fraction"], scenario["metrics"]["sunlight_s"] / duration, "sunlight fraction")
        for event in scenario["events"]:
            if not 0 <= event["offset_s"] <= duration:
                raise ValueError(f"{site_id}: event outside analysis period.")
        rows.append({"site_id": site_id, "series_samples": len(times), "observer_height_m": site["observer_height_m"],
                     "horizon_sha256": horizon_hash, "sunlight_time_fraction": scenario["metrics"]["sunlight_time_fraction"]})
    if len(periods) != 1:
        raise ValueError("Sites have different analysis periods.")
    if periods != {tuple(datetime.fromisoformat(dataset[key].replace("Z", "+00:00"))
                        for key in ("start_utc", "end_utc"))}:
        raise ValueError("Manifest and scenario periods disagree.")
    planner = read_json(directory / manifest["planner_url"])
    if not planner["coverage_complete"] or sorted(planner["available_site_ids"]) != sorted(SITE_IDS):
        raise ValueError("Planner is missing a site.")
    return {"status": "pass", "kind": "frontend_consistency_report", "sites": rows}
