"""Build frontend datasets without substituting synthetic terrain for missing data."""

from dataclasses import asdict
from pathlib import Path
import shutil

import numpy as np

from . import mini_model as model
from .analysis import Settings, analyze_scenario, scenario_json
from .inputs import SITE_IDS, file_hash, find_horizons, load_ephemeris, load_horizon, write_json
from .planner import Mission, plan
from .ephemeris import KernelPool, SpiceClock, SpiceProvider, geometry_json
from .historical import export_history
from .handoff import export_examples
from .compare_summary import write_compare_summary


def build(root, horizons=None, output=None, kernel_dir=None, settings=None, mission=None,
          panel=None, use_spice=False, sensitivity_margin_deg=None):
    root = Path(root)
    output = Path(output) if output is not None else root / "data/processed"
    kernel_dir = Path(kernel_dir) if kernel_dir is not None else root / "data/kernels"
    settings, mission = settings or Settings(), mission or Mission()
    profiles = find_horizons(horizons if horizons is not None else root / "data/input/horizons")
    ephemerides = {site_id: load_ephemeris(root / f"data/input/ephemeris/ephemeris_{site_id}.json")
                   for site_id in SITE_IDS}
    # Validate every supplied terrain profile before replacing any output files.
    loaded_horizons = {site: load_horizon(path, ephemerides[site]) for site, path in profiles.items()}
    starts = {e.metadata["start_utc"] for e in ephemerides.values()}
    ends = {e.metadata["end_utc"] for e in ephemerides.values()}
    if len(starts) != 1 or len(ends) != 1:
        raise ValueError("Compared sites must have matching analysis periods.")
    names = ["naif0012.tls"]
    if use_spice:
        sets = {tuple(e.metadata["kernel_filenames"]) for e in ephemerides.values()}
        if len(sets) != 1:
            raise ValueError("Compared sites must declare the same SPICE kernel set.")
        names = list(next(iter(sets)))
    paths = [kernel_dir / name for name in names]
    kernel_hashes = {path.name: file_hash(path) for path in paths}
    analyses, sites, scenarios, sensitivity = {}, [], [], {}
    with KernelPool(paths):
        clock = SpiceClock(next(iter(starts)))
        for site_id, ephemeris in ephemerides.items():
            print(f"Building {site_id}", flush=True)
            expected_end = clock.elapsed(ephemeris.metadata["end_utc"])
            if abs(expected_end - ephemeris.times_s[-1]) > 0.01:
                raise ValueError(f"{site_id}: ET array end disagrees with declared UTC end.")
            radius, lat, lon = model.spherical_coordinates(ephemeris.observer_m)
            site = {"site_id": site_id, "name": f"Site {site_id[4:]}",
                    "latitude_deg": float(np.rad2deg(lat)), "longitude_deg": float(np.rad2deg(lon)),
                    "coordinate_source": "derived_from_authoritative_observer_xyz",
                    "observer_xyz_m": ephemeris.observer_m.tolist(), "observer_radius_m": float(radius),
                    "observer_height_m": None, "frame": ephemeris.metadata["frame"],
                    "geometry_url": f"geometry/{site_id}.json", "horizon_url": None, "scenario_url": None,
                    "terrain_status": "awaiting_horizon"}
            write_json(output / site["geometry_url"], geometry_json(ephemeris, clock))
            if site_id in profiles:
                horizon = loaded_horizons[site_id]
                site["latitude_deg"], site["longitude_deg"] = horizon.document["lat_deg"], horizon.document["lon_deg"]
                site["coordinate_source"] = "horizon_handoff"
                site["observer_height_m"] = horizon.document.get("observer_height_m")
                site["terrain_status"] = "ready"
                site["horizon_url"] = f"horizons/{site_id}.json"
                site["scenario_url"] = f"scenarios/monthly-2026-11/{site_id}.json"
                horizon_output = output / site["horizon_url"]
                horizon_output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(profiles[site_id], horizon_output)
                provider = SpiceProvider(ephemeris, clock) if use_spice else ephemeris.vectors_at
                method = "spice_spkcpo_cn+s" if use_spice else "linear_interpolation_of_handoff_vectors"
                if use_spice:
                    for index in (0, len(ephemeris.times_s) // 2, len(ephemeris.times_s) - 1):
                        fresh = provider(float(ephemeris.times_s[index]))
                        stored = (ephemeris.sun_vectors_m[index], ephemeris.earth_vectors_m[index])
                        if any(np.linalg.norm(a - b) > 1.0 for a, b in zip(fresh, stored)):
                            raise ValueError(f"{site_id}: loaded kernels disagree with handoff vectors by >1 m.")
                result = analyze_scenario(ephemeris, horizon, provider, settings, panel)
                analyses[site_id] = result
                write_json(output / site["scenario_url"],
                           scenario_json(ephemeris, horizon, result, clock, method, kernel_hashes))
                scenarios.append({"site_id": site_id, "url": site["scenario_url"], "metrics": result.metrics})
                if sensitivity_margin_deg is not None:
                    if not np.isfinite(sensitivity_margin_deg) or sensitivity_margin_deg <= 0:
                        raise ValueError("Sensitivity margin must be finite and positive.")
                    variants = {}
                    for label, sign in (("lower", -1), ("higher", 1)):
                        shifted = horizon.shifted(sign * sensitivity_margin_deg)
                        alternate = analyze_scenario(ephemeris, shifted, provider, settings, panel)
                        variants[label] = alternate
                        write_json(output / f"sensitivity/{site_id}_{label}.json",
                                   scenario_json(ephemeris, shifted, alternate, clock, method, kernel_hashes))
                    sensitivity[site_id] = variants
            sites.append(site)
        planner = plan(analyses, mission, clock)
        planner["available_site_ids"] = sorted(analyses)
        planner["missing_site_ids"] = [site_id for site_id in SITE_IDS if site_id not in analyses]
        planner["coverage_complete"] = len(analyses) == len(SITE_IDS)
        planner["warnings"] = ["Feasibility uses sampled geometric visibility and is limited by search and terrain resolution."]
        if not analyses:
            planner["status"] = "awaiting_horizons"
        if sensitivity:
            for label in ("lower", "higher"):
                variant_plan = plan({site: variants[label] for site, variants in sensitivity.items()}, mission, clock)
                write_json(output / f"planner_sensitivity_{label}.json", variant_plan)
            planner["sensitivity"] = {"uniform_horizon_margin_deg": sensitivity_margin_deg,
                                      "interpretation": "sensitivity_scenarios_not_statistical_confidence_intervals",
                                      "lower_horizon_url": "planner_sensitivity_lower.json",
                                      "higher_horizon_url": "planner_sensitivity_higher.json"}
        write_json(output / "planner.json", planner)
    write_json(output / "sites.json", {"schema_version": "1.0", "sites": sites})
    datasets = [{"id": "monthly-2026-11", "kind": "terrain_scenarios",
                 "start_utc": next(iter(starts)), "end_utc": next(iter(ends)),
                 "site_ids": list(SITE_IDS), "scenarios": scenarios,
                 "missing_horizon_site_ids": [site["site_id"] for site in sites if site["terrain_status"] != "ready"]}]
    history = export_history(root / "data/input/historical", output)
    if history:
        datasets.append(history)
    examples_url = export_examples(output)
    manifest = {"schema_version": "1.0", "status": "ready" if len(analyses) == len(SITE_IDS) else "awaiting_horizons",
                "units": {"angles": "deg", "length": "m", "duration": "s", "power": "W", "energy": "Wh",
                          "fractions": "0..1", "timestamps": "UTC_ISO8601", "offsets": "elapsed_ET_seconds"},
                "sites_url": "sites.json", "planner_url": "planner.json", "examples_url": examples_url, "datasets": datasets,
                "settings": asdict(settings), "kernel_sha256": kernel_hashes}
    write_json(output / "manifest.json", manifest)
    if manifest["status"] == "ready":
        # Windows, events and metrics only, copied verbatim, for the frontend Compare view.
        write_compare_summary(output)
    return manifest
