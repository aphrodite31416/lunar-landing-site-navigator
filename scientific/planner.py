"""Search a declared grid of landing dates using indexed operational intervals."""

from dataclasses import asdict, dataclass

import numpy as np

from .intervals import IntervalIndex, SampleIntegral


@dataclass(frozen=True)
class Mission:
    duration_s: float = 7 * 86400.0
    landing_step_s: float = 6 * 3600.0
    max_darkness_s: float | None = None
    max_insufficient_light_s: float | None = None
    max_earth_gap_s: float | None = None
    min_sunlight_fraction: float | None = None
    min_joint_s: float | None = None
    min_energy_wh: float | None = None

    def __post_init__(self):
        for key, value in asdict(self).items():
            if value is not None and (not np.isfinite(value) or value < 0):
                raise ValueError(f"{key} must be finite and nonnegative.")
        if self.duration_s == 0 or self.landing_step_s == 0:
            raise ValueError("Mission duration and landing-date step must be positive.")
        if self.min_sunlight_fraction is not None and self.min_sunlight_fraction > 1:
            raise ValueError("Minimum sunlight fraction must be in [0,1].")
        if self.min_joint_s is not None and self.min_joint_s > self.duration_s:
            raise ValueError("Required joint duration cannot exceed mission duration.")


def candidate_starts(start, end, mission):
    last = end - mission.duration_s
    if last < start:
        return np.array([])
    grid = np.arange(start, last, mission.landing_step_s)
    if len(grid) == 0 or abs(grid[-1] - last) > 1e-8:
        grid = np.r_[grid, last]
    return grid


def search_site(site_id, analysis, mission, clock):
    indexes = {key: IntervalIndex(windows) for key, windows in analysis.windows.items()}
    fractions = SampleIntegral(analysis.times_s, [row["sun_fraction"] for row in analysis.states])
    power = (None if analysis.panel is None else
             SampleIntegral(analysis.times_s, [row["power_w"] for row in analysis.states]))
    candidates = []
    for start in candidate_starts(analysis.times_s[0], analysis.times_s[-1], mission):
        start, end = float(start), float(start + mission.duration_s)
        metrics = {
            "sunlight_time_fraction": indexes["sunlight"].total(start, end) / mission.duration_s,
            "joint_s": indexes["joint"].total(start, end),
            "longest_joint_s": indexes["joint"].longest(start, end),
            "longest_darkness_s": indexes["darkness"].longest(start, end),
            "longest_insufficient_light_s": indexes["insufficient_light"].longest(start, end),
            "longest_earth_gap_s": indexes["earth_gap"].longest(start, end),
            "mean_sun_visible_fraction": fractions.total(start, end) / mission.duration_s,
            "energy_wh": None if power is None else power.total(start, end) / 3600.0,
        }
        constraints = [
            ("max_darkness_s", "longest_darkness_s", "maximum"),
            ("max_insufficient_light_s", "longest_insufficient_light_s", "maximum"),
            ("max_earth_gap_s", "longest_earth_gap_s", "maximum"),
            ("min_sunlight_fraction", "sunlight_time_fraction", "minimum"),
            ("min_joint_s", "joint_s", "minimum"),
            ("min_energy_wh", "energy_wh", "minimum"),
        ]
        violations = []
        for name, metric, direction in constraints:
            limit = getattr(mission, name)
            actual = metrics[metric]
            if limit is None:
                continue
            if actual is None or (actual > limit + 1e-8 if direction == "maximum" else actual < limit - 1e-8):
                violations.append({"constraint": name, "limit": limit, "actual": actual,
                                   "reason": "panel_model_required" if actual is None else "constraint_not_met"})
        candidates.append({"site_id": site_id, "landing_utc": clock.utc(start),
                           "mission_end_utc": clock.utc(end), "start_offset_s": start,
                           "end_offset_s": end, "metrics": metrics,
                           "feasible": not violations, "violations": violations})
    return candidates


def objective(candidate):
    values = candidate["metrics"]
    return (-values["joint_s"], values["longest_insufficient_light_s"], values["longest_earth_gap_s"])


def mark_pareto(candidates):
    feasible = [candidate for candidate in candidates if candidate["feasible"]]
    for candidate in candidates:
        point = objective(candidate)
        candidate["pareto_optimal"] = candidate["feasible"] and not any(
            all(a <= b for a, b in zip(other, point)) and any(a < b for a, b in zip(other, point))
            for other in (objective(row) for row in feasible))
    return candidates


def plan(analyses, mission, clock):
    candidates = []
    for site_id, analysis in analyses.items():
        candidates.extend(search_site(site_id, analysis, mission, clock))
    mark_pareto(candidates)
    candidates.sort(key=lambda row: (not row["feasible"], *objective(row), row["landing_utc"], row["site_id"]))
    feasible = [row for row in candidates if row["feasible"]]
    return {"schema_version": "1.0", "kind": "mission_plan", "mission": asdict(mission),
            "search": {"site_ids": sorted(analyses), "candidate_count": len(candidates),
                       "feasible_count": len(feasible),
                       "scope": "best_among_evaluated_sites_and_landing_dates",
                       "ranking": ["joint_s_desc", "longest_insufficient_light_s_asc", "longest_earth_gap_s_asc"],
                       "pareto_objectives": ["max_joint_s", "min_longest_insufficient_light_s", "min_longest_earth_gap_s"]},
            "status": "feasible" if feasible else "no_feasible_candidates",
            "recommendations": feasible[:10], "candidates": candidates}
