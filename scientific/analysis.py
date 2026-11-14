"""Terrain-aware sampled visibility with re-evaluation of detected event boundaries."""

from dataclasses import asdict, dataclass
import math

import numpy as np

from . import mini_model as model

SUN_RADIUS_M = 695_700_000.0
EARTH_RADIUS_M = 6_378_136.6
AU_M = 149_597_870_700.0


@dataclass(frozen=True)
class Settings:
    minimum_sun_fraction: float = 0.8
    disc_samples: int = 512
    search_max_step_s: float = 300.0
    event_tolerance_s: float = 1.0

    def __post_init__(self):
        if not np.isfinite([self.minimum_sun_fraction, self.search_max_step_s,
                            self.event_tolerance_s]).all():
            raise ValueError("Calculation settings must be finite.")
        if not 0 <= self.minimum_sun_fraction <= 1:
            raise ValueError("Solar fraction threshold must be in [0,1].")
        if isinstance(self.disc_samples, bool) or not isinstance(self.disc_samples, int) or self.disc_samples < 16:
            raise ValueError("Use an integer solar disc sample count of at least 16.")
        if not 0 < self.event_tolerance_s < self.search_max_step_s:
            raise ValueError("Require 0 < event tolerance < search step.")


@dataclass(frozen=True)
class Panel:
    area_m2: float
    efficiency: float
    normal_enu: tuple
    irradiance_at_1au_w_m2: float = 1361.0

    def __post_init__(self):
        if not np.isfinite([self.area_m2, self.efficiency, self.irradiance_at_1au_w_m2]).all():
            raise ValueError("Panel parameters must be finite.")
        if self.area_m2 <= 0 or not 0 < self.efficiency <= 1 or self.irradiance_at_1au_w_m2 <= 0:
            raise ValueError("Invalid panel area, efficiency or reference irradiance.")
        normal = np.asarray(self.normal_enu, dtype=float)
        if normal.shape != (3,):
            raise ValueError("Panel normal must contain three ENU components.")
        model.unit_vector(normal)


class Evaluator:
    """Keep compact states in memory; discard per-ray arrays after each evaluation."""

    def __init__(self, basis, horizon, vectors_at, settings, panel=None):
        self.basis, self.horizon, self.vectors_at = basis, horizon, vectors_at
        self.settings, self.panel = settings, panel
        self.cache = {}
        self.normal = None if panel is None else model.local_to_global(
            model.unit_vector(panel.normal_enu), basis)

    def __call__(self, time_s):
        time_s = float(time_s)
        if time_s not in self.cache:
            sun, earth = self.vectors_at(time_s)
            raw = model.solar_visibility(sun, earth, SUN_RADIUS_M, EARTH_RADIUS_M,
                                         self.basis, self.horizon, self.settings.disc_samples)
            state = {key: value for key, value in raw.items() if key not in ("rays", "open_mask")}
            state["power_w"] = None
            if self.panel is not None:
                irradiance = model.irradiance_at_distance(self.panel.irradiance_at_1au_w_m2,
                                                          AU_M, np.linalg.norm(sun))
                state["power_w"] = float(model.panel_power(
                    self.panel.area_m2, self.panel.efficiency, irradiance,
                    state["sun_fraction"], self.normal, sun))
            self.cache[time_s] = state
        return self.cache[time_s]

    def state(self, kind, time_s):
        row = self(time_s)
        if kind == "sunlight":
            return bool(model.illumination_indicator(row["sun_fraction"], self.settings.minimum_sun_fraction))
        if kind == "earth":
            return bool(row["earth_center_visible"])
        if kind == "darkness":
            return row["sun_fraction"] == 0.0
        raise ValueError(f"Unknown state: {kind}")


def search_grid(source_times, maximum_step_s):
    """Preserve every source epoch and subdivide long cells, including equal-state cells."""
    result = [float(source_times[0])]
    for a, b in zip(source_times[:-1], source_times[1:]):
        count = max(1, math.ceil((b - a) / maximum_step_s - 1e-7))
        result.extend(float(t) for t in np.linspace(a, b, count + 1)[1:])
    return np.array(result)


def find_windows(evaluator, times, kind):
    active = [evaluator.state(kind, time) for time in times]
    windows, events = [], []
    start = float(times[0]) if active[0] else None
    for i in range(len(times) - 1):
        if active[i] == active[i + 1]:
            continue
        a, b = float(times[i]), float(times[i + 1])
        if kind == "earth":
            crossing = model.refine_transition(lambda t: evaluator(t)["earth_clearance_rad"],
                                               a, b, evaluator.settings.event_tolerance_s)
        else:
            crossing = model.refine_state_transition(lambda t: evaluator.state(kind, t),
                                                     a, b, evaluator.settings.event_tolerance_s)
        events.append({"kind": kind, "active_after": active[i + 1], "offset_s": crossing})
        if active[i + 1]:
            start = crossing
        else:
            windows.append((start, crossing))
            start = None
    if active[-1]:
        windows.append((start, float(times[-1])))
    return model.merge_windows(windows), events


@dataclass
class Analysis:
    times_s: np.ndarray
    states: list
    windows: dict
    events: list
    metrics: dict
    settings: Settings
    evaluation_count: int
    panel: Panel | None = None


def analyze_scenario(ephemeris, horizon, vectors_at=None, settings=None, panel=None):
    settings = settings or Settings()
    vectors_at = vectors_at or ephemeris.vectors_at
    evaluator = Evaluator(ephemeris.basis, horizon, vectors_at, settings, panel)
    times = search_grid(ephemeris.times_s, settings.search_max_step_s)
    windows, events = {}, []
    for kind in ("sunlight", "earth", "darkness"):
        windows[kind], found = find_windows(evaluator, times, kind)
        events.extend(found)
    # Integrate on the same refined samples that bracket detected boundaries.
    # Include both sides of a transition, not a coarse ramp across a shadow.
    times = np.unique(np.r_[times, list(evaluator.cache), [event["offset_s"] for event in events]])
    start, end = float(times[0]), float(times[-1])
    windows["joint"] = model.intersect_windows(windows["sunlight"], windows["earth"])
    windows["insufficient_light"] = model.complement_windows(windows["sunlight"], start, end)
    windows["earth_gap"] = model.complement_windows(windows["earth"], start, end)
    states = [evaluator(time) for time in times]
    fractions = np.array([row["sun_fraction"] for row in states])
    core_metrics = model.visibility_metrics(
        times, fractions, sun_windows=windows["sunlight"], earth_windows=windows["earth"],
        joint_windows=windows["joint"], dark_windows=windows["darkness"],
        sun_gaps=windows["insufficient_light"], earth_gaps=windows["earth_gap"],
    )
    metrics = {key.replace("_seconds", "_s"): value for key, value in core_metrics.items()}
    metrics["mean_sun_visible_fraction"] = metrics.pop("mean_sun_fraction")
    metrics["energy_wh"] = None
    if panel is not None:
        metrics["energy_wh"] = model.electrical_energy(times, [row["power_w"] for row in states])["watt_hours"]
    return Analysis(times, states, windows, sorted(events, key=lambda event: event["offset_s"]),
                    metrics, settings, len(evaluator.cache), panel)


def encoded_windows(windows, clock, start_s, end_s):
    return [{"start_utc": clock.utc(a), "end_utc": clock.utc(b),
             "start_offset_s": a, "end_offset_s": b, "duration_s": b - a,
             "start_clipped": a == start_s, "end_clipped": b == end_s}
            for a, b in windows]


def scenario_json(ephemeris, horizon, result, clock, vector_method, kernel_hashes):
    events = [{**event, "utc": clock.utc(event["offset_s"])} for event in result.events]
    series = []
    for time_s, row in zip(result.times_s, result.states):
        item = {"offset_s": float(time_s), "utc": clock.utc(time_s),
                "sun_visible_fraction": float(row["sun_fraction"]),
                "sun_terrain_visible_fraction": float(row["terrain_fraction"]),
                "sunlight_available": bool(model.illumination_indicator(
                    row["sun_fraction"], result.settings.minimum_sun_fraction)),
                "earth_center_visible": bool(row["earth_center_visible"]),
                "power_w": row["power_w"]}
        for body in ("sun", "earth"):
            for field in ("azimuth", "elevation", "clearance"):
                value = float(np.rad2deg(row[f"{body}_{field}_rad"]))
                item[f"{body}_{field}_deg"] = value if np.isfinite(value) else None
            item[f"{body}_horizon_deg"] = (
                item[f"{body}_elevation_deg"] - item[f"{body}_clearance_deg"]
                if item[f"{body}_azimuth_deg"] is not None else None)
        item["sun_angular_radius_deg"] = float(np.rad2deg(row["sun_radius_rad"]))
        series.append(item)
    start, end = float(result.times_s[0]), float(result.times_s[-1])
    warnings = [
        "Events and gaps shorter than the search step can be missed; event tolerance is not physical accuracy.",
        "Earth-centre visibility is geometric availability, not a station-specific radio link budget.",
        "Darkness means no sampled solar-disc point is visible; finite disc sampling has angular error.",
        "DEM error has not been fully propagated into physical event-time confidence intervals.",
    ]
    if vector_method == "linear_interpolation_of_handoff_vectors":
        warnings.append("Boundary refinement uses linearly interpolated ephemeris vectors.")
    return {
        "schema_version": "1.0", "kind": "terrain_scenario", "site_id": ephemeris.site_id,
        "period": {"start_utc": clock.utc(start), "end_utc": clock.utc(end), "duration_s": end - start},
        "model": {"frame": ephemeris.metadata["frame"], "abcorr": "CN+S", "refloc": "OBSERVER",
                  "earth_visibility_criterion": "centre_strictly_above_terrain",
                  "solar_visibility_model": "sampled_disc_with_terrain_and_earth_occultation",
                  "vector_method": vector_method, "settings": asdict(result.settings),
                  "panel": None if result.panel is None else asdict(result.panel),
                  "sun_radius_m": SUN_RADIUS_M, "earth_radius_m": EARTH_RADIUS_M,
                  "integration": "trapezoid_on_exported_samples",
                  "horizon_margin_deg": horizon.margin_deg},
        "provenance": {"input_sha256": ephemeris.hashes, "horizon_sha256": horizon.sha256,
                       "kernel_sha256": kernel_hashes},
        "quality": {"terrain_coverage": "complete", "warnings": warnings,
                    "evaluation_count": result.evaluation_count,
                    "search_max_gap_s": float(np.max(np.diff(result.times_s)))},
        "series": series,
        "windows": {key: encoded_windows(value, clock, start, end) for key, value in result.windows.items()},
        "events": events, "metrics": result.metrics,
    }
