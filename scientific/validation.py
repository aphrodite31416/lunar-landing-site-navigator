"""Measured consistency and convergence reports; never infer accuracy from a solver tolerance."""

from dataclasses import replace
from pathlib import Path
from time import perf_counter

import numpy as np

from .analysis import Settings, analyze_scenario
from .inputs import SITE_IDS, file_hash, find_horizons, load_ephemeris, load_horizon
from .ephemeris import KernelPool, SpiceClock, SpiceProvider


def validate_handoffs(root, kernel_dir, samples_per_site=17):
    root, kernel_dir = Path(root), Path(kernel_dir)
    ephemerides = [load_ephemeris(root / f"data/input/ephemeris/ephemeris_{site}.json") for site in SITE_IDS]
    paths = [kernel_dir / name for name in ephemerides[0].metadata["kernel_filenames"]]
    rows = []
    with KernelPool(paths):
        for ephemeris in ephemerides:
            clock = SpiceClock(ephemeris.metadata["start_utc"])
            provider = SpiceProvider(ephemeris, clock)
            indices = np.unique(np.linspace(0, len(ephemeris.times_s) - 1, samples_per_site, dtype=int))
            errors = []
            for index in indices:
                fresh = provider(float(ephemeris.times_s[index]))
                for body, current, original in zip(("sun", "earth"), fresh,
                        (ephemeris.sun_vectors_m[index], ephemeris.earth_vectors_m[index])):
                    errors.append({"body": body, "sample_index": int(index),
                                   "position_error_m": float(np.linalg.norm(current - original))})
            maximum = max(row["position_error_m"] for row in errors)
            rows.append({"site_id": ephemeris.site_id, "checked_epochs": len(indices),
                         "max_position_error_m": maximum, "pass": maximum <= 1.0,
                         "input_sha256": ephemeris.hashes, "errors": errors})
    return {"schema_version": "1.0", "kind": "ephemeris_consistency_report",
            "status": "pass" if all(row["pass"] for row in rows) else "fail",
            "comparison": "handoff_vectors_vs_recomputed_spkcpo_same_declared_kernels",
            "position_tolerance_m": 1.0, "sites": rows,
            "kernel_sha256": {path.name: file_hash(path) for path in paths},
            "limitations": ["Checks reproduction at sampled epochs, not independent absolute ephemeris accuracy."]}


def convergence_report(root, kernel_dir, horizon_dir, site_id, settings=None, use_spice=False):
    root, kernel_dir = Path(root), Path(kernel_dir)
    settings = settings or Settings()
    ephemeris = load_ephemeris(root / f"data/input/ephemeris/ephemeris_{site_id}.json")
    profiles = find_horizons(horizon_dir)
    if site_id not in profiles:
        raise ValueError(f"A real horizon-v2 profile is required for convergence at {site_id}.")
    horizon = load_horizon(profiles[site_id], ephemeris)
    names = ephemeris.metadata["kernel_filenames"] if use_spice else ["naif0012.tls"]
    paths = [kernel_dir / name for name in names]
    variants = {"baseline": settings,
                "half_time_step": replace(settings, search_max_step_s=settings.search_max_step_s / 2),
                "double_disc_samples": replace(settings, disc_samples=settings.disc_samples * 2)}
    results = {}
    timings = {}
    with KernelPool(paths):
        clock = SpiceClock(ephemeris.metadata["start_utc"])
        provider = SpiceProvider(ephemeris, clock) if use_spice else ephemeris.vectors_at
        for name, configuration in variants.items():
            print(f"Convergence {site_id}: {name}", flush=True)
            start = perf_counter()
            results[name] = analyze_scenario(ephemeris, horizon, provider, configuration)
            timings[name] = perf_counter() - start
    baseline = results["baseline"]
    comparisons = {}
    for name in ("half_time_step", "double_disc_samples"):
        alternate = results[name]
        events = {}
        for kind in ("sunlight", "earth", "darkness"):
            first = [event for event in baseline.events if event["kind"] == kind]
            second = [event for event in alternate.events if event["kind"] == kind]
            same_pattern = ([event["active_after"] for event in first] ==
                            [event["active_after"] for event in second])
            shifts = [abs(a["offset_s"] - b["offset_s"]) for a, b in zip(first, second)] if same_pattern else []
            events[kind] = {"baseline_count": len(first), "alternate_count": len(second),
                            "same_transition_pattern": same_pattern,
                            "max_boundary_shift_s": max(shifts, default=0.0) if same_pattern else None}
        comparisons[name] = {"events": events,
                             "metric_differences": {key: alternate.metrics[key] - value
                                                    for key, value in baseline.metrics.items() if value is not None}}
    return {"schema_version": "1.0", "kind": "convergence_report", "site_id": site_id,
            "comparisons": comparisons,
            "runs": {name: {"elapsed_s": timings[name], "evaluation_count": row.evaluation_count,
                             "exported_sample_count": len(row.times_s), "metrics": row.metrics}
                     for name, row in results.items()},
            "provenance": {"input_sha256": ephemeris.hashes, "horizon_sha256": horizon.sha256,
                           "kernel_sha256": {path.name: file_hash(path) for path in paths}},
            "limitations": ["This is a convergence study, not a proof that every short event is detected.",
                            "A finer numerical tolerance does not remove terrain or ephemeris error."]}
