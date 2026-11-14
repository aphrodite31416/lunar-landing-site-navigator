import unittest
from dataclasses import replace

import numpy as np

from scientific.analysis import Analysis, Settings
from scientific.intervals import IntervalIndex, SampleIntegral
from scientific.planner import Mission, candidate_starts, mark_pareto, search_site


class Clock:
    def utc(self, value):
        return str(value)


def analysis_fixture():
    return Analysis(np.array([0., 10., 20., 30.]),
                    [{"sun_fraction": value, "power_w": None} for value in (1., 1., 0., 1.)],
                    {"sunlight": [(0., 12.), (20., 30.)], "earth": [(0., 8.), (16., 30.)],
                     "joint": [(0., 8.), (20., 30.)], "darkness": [(14., 18.)],
                     "insufficient_light": [(12., 20.)], "earth_gap": [(8., 16.)]},
                    [], {}, Settings(), 4)


class IntervalTests(unittest.TestCase):
    def test_index_matches_independent_clipping_on_random_queries(self):
        rng = np.random.default_rng(42)
        edges = np.sort(rng.uniform(-100, 100, 80))
        windows = list(zip(edges[::2], edges[1::2]))
        index = IntervalIndex(windows)
        for start, end in np.sort(rng.uniform(-120, 120, (300, 2)), axis=1):
            clipped = [max(0., min(b, end) - max(a, start)) for a, b in windows]
            self.assertAlmostEqual(index.total(start, end), sum(clipped))
            self.assertAlmostEqual(index.longest(start, end), max(clipped, default=0.))

    def test_empty_overlapping_touching_and_boundary_intervals(self):
        self.assertEqual(IntervalIndex([]).longest(0, 1), 0)
        self.assertEqual(IntervalIndex([]).total(0, 1), 0)
        index = IntervalIndex([(0, 1), (1, 3), (2, 5)])
        self.assertEqual(index.longest(1, 4), 3)
        self.assertEqual(index.total(-1, 10), 5)
        self.assertEqual(index.longest(5, 7), 0)
        self.assertEqual(index.longest(2, 2), 0)

    def test_piecewise_linear_integral_matches_analytic_ramp(self):
        integral = SampleIntegral([0, 1, 4, 10], [0, 2, 8, 20])
        self.assertAlmostEqual(integral.total(0.4, 7.6), 7.6**2 - 0.4**2)
        with self.assertRaises(ValueError):
            integral.total(-1, 5)


class PlannerTests(unittest.TestCase):
    def test_actual_overlapping_windows_and_explanations(self):
        result = search_site("site01", analysis_fixture(),
                             Mission(duration_s=10, landing_step_s=10, max_earth_gap_s=3), Clock())
        self.assertEqual([row["start_offset_s"] for row in result], [0., 10., 20.])
        self.assertEqual([row["metrics"]["joint_s"] for row in result], [8., 0., 10.])
        self.assertEqual([row["feasible"] for row in result], [True, False, True])
        self.assertEqual(result[1]["violations"][0]["constraint"], "max_earth_gap_s")
        self.assertEqual(result[1]["violations"][0]["actual"], 6.)

    def test_clipped_gaps_darkness_and_low_light_are_distinct(self):
        rows = search_site("site01", analysis_fixture(), Mission(duration_s=20, landing_step_s=10), Clock())
        self.assertEqual(rows[0]["metrics"]["longest_darkness_s"], 4)
        self.assertEqual(rows[0]["metrics"]["longest_insufficient_light_s"], 8)
        self.assertEqual(rows[1]["metrics"]["longest_earth_gap_s"], 6)

    def test_energy_requirement_without_panel_fails_explicitly(self):
        rows = search_site("site01", analysis_fixture(),
                           Mission(duration_s=30, min_energy_wh=1), Clock())
        self.assertFalse(rows[0]["feasible"])
        self.assertEqual(rows[0]["violations"][0]["reason"], "panel_model_required")

    def test_finite_grid_has_exact_final_candidate_and_no_extrapolation(self):
        np.testing.assert_allclose(candidate_starts(0, 31, Mission(duration_s=10, landing_step_s=10)), [0, 10, 20, 21])
        self.assertEqual(len(candidate_starts(0, 9, Mission(duration_s=10))), 0)
        np.testing.assert_allclose(candidate_starts(0, 10, Mission(duration_s=10)), [0])

    def test_pareto_preserves_tradeoffs_and_rejects_dominated_points(self):
        def row(joint, light, earth, feasible=True):
            return {"feasible": feasible, "metrics": {"joint_s": joint,
                    "longest_insufficient_light_s": light, "longest_earth_gap_s": earth}}
        rows = mark_pareto([row(10, 5, 5), row(9, 6, 6), row(8, 1, 1), row(100, 0, 0, False)])
        self.assertEqual([item["pareto_optimal"] for item in rows], [True, False, True, False])

    def test_mission_rejects_nonfinite_or_impossible_constraints(self):
        for changes in ({"duration_s": 0}, {"landing_step_s": -1}, {"max_darkness_s": float("nan")},
                        {"min_sunlight_fraction": 2}, {"duration_s": 1, "min_joint_s": 2}):
            with self.assertRaises(ValueError):
                Mission(**changes)


if __name__ == "__main__":
    unittest.main()
