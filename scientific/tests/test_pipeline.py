from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from jsonschema import Draft202012Validator

from scientific import mini_model as model
from scientific.analysis import Evaluator, Settings, analyze_scenario, find_windows, scenario_json, search_grid
from scientific.export import build
from scientific.inputs import Ephemeris, Horizon, load_ephemeris, load_horizon, write_json
from scientific.ephemeris import KernelPool, SpiceClock
from scientific.frontend_validation import png_header, validate_frontend, validate_terrain_assets
from scientific.__main__ import main as cli
from scientific.inputs import file_hash

ROOT = Path(__file__).resolve().parents[2]


class DataTests(unittest.TestCase):
    def test_real_handoffs_are_valid_and_observer_relative(self):
        for site_id in ("site01", "site04", "site07", "site11"):
            data = load_ephemeris(ROOT / f"data/input/ephemeris/ephemeris_{site_id}.json")
            self.assertEqual(data.sun_vectors_m.shape, (8641, 3))
            np.testing.assert_allclose(data.basis.T @ data.basis, np.eye(3), atol=1e-14)

    def test_horizon_rejects_different_observer_missing_coverage_and_bad_mask(self):
        data = load_ephemeris(ROOT / "data/input/ephemeris/ephemeris_site01.json")
        _, lat, lon = model.spherical_coordinates(data.observer_m)
        document = {"schema_version": 2, "site_id": "site01", "frame": "MOON_ME_DE421",
                    "coverage_status": "complete", "observer_xyz_m": data.observer_m.tolist(),
                    "lat_deg": float(np.rad2deg(lat)), "lon_deg": float(np.rad2deg(lon)),
                    "az_deg": [0, 90, 180, 270], "horizon_deg": [-1, 2, 0, 3], "valid": [True] * 4}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "horizon.json"
            write_json(path, document)
            horizon = load_horizon(path, data)
            self.assertAlmostEqual(float(horizon(0)), np.deg2rad(-1))
            self.assertAlmostEqual(float(horizon(np.deg2rad(359.9))), float(horizon(np.deg2rad(-0.1))))
            for changes in ({"coverage_status": "partial"}, {"valid": [True, False, True, True]},
                            {"valid": [1, 1, 1, 1]}, {"observer_xyz_m": [0, 0, -1737400]},
                            {"frame": "IAU_MOON"}, {"az_deg": [0, 90, 180, 360]},
                            {"observer_height_m": -1}, {"observer_height_m": True},
                            {"observer_height_m": 1, "R_m": 1737400, "ground_elevation_m": 0},
                            {"observer_height_direction": "slope_normal"}, {"angle_units": "rad"},
                            {"az_convention": "0 = East, counterclockwise"}, {"n_az": 7200}, {"az_step_deg": 45}):
                write_json(path, {**document, **changes})
                with self.assertRaises(ValueError):
                    load_horizon(path, data)

    def test_et_utc_conversion_handles_leap_seconds(self):
        with KernelPool([ROOT / "data/kernels/naif0012.tls"]):
            clock = SpiceClock("2016-12-31T23:59:59Z")
            self.assertEqual(clock.utc(1), "2016-12-31T23:59:60.000Z")
            self.assertEqual(clock.utc(2), "2017-01-01T00:00:00.000Z")
            self.assertAlmostEqual(clock.elapsed("2017-01-01T00:00:00Z"), 2, places=5)

    def test_missing_horizons_export_real_geometry_without_terrain_claims(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = build(ROOT, horizons=output / "missing", output=output)
            self.assertEqual(manifest["status"], "awaiting_horizons")
            sites = json.loads((output / "sites.json").read_text())["sites"]
            self.assertEqual(len(sites), 4)
            self.assertTrue(all(site["scenario_url"] is None for site in sites))
            planner = json.loads((output / "planner.json").read_text())
            self.assertEqual(planner["status"], "awaiting_horizons")
            self.assertEqual(planner["recommendations"], [])
            history = json.loads((output / "historical/site01.json").read_text())
            self.assertIsInstance(history["series"][0]["earth_center_visible_sample_fraction"], float)
            self.assertTrue(history["series"][-1]["partial_day"])
            self.assertFalse(history["series"][-2]["partial_day"])

    def test_complete_build_and_sensitivity_with_explicit_test_only_terrain(self):
        from scientific.planner import Mission
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with KernelPool([ROOT / "data/kernels/naif0012.tls"]):
                clock = SpiceClock("2026-11-14T00:00:00Z")
                for site_id in ("site01", "site04", "site07", "site11"):
                    original = load_ephemeris(ROOT / f"data/input/ephemeris/ephemeris_{site_id}.json")
                    metadata = {**original.metadata, "sample_count": 9,
                                "end_utc": clock.utc(original.times_s[8])}
                    path = root / f"data/input/ephemeris/ephemeris_{site_id}.json"
                    write_json(path, metadata)
                    np.savez(path.with_suffix(".npz"), times_s=original.times_s[:9],
                             sun_vectors_m=original.sun_vectors_m[:9], earth_vectors_m=original.earth_vectors_m[:9])
                    _, lat, lon = model.spherical_coordinates(original.observer_m)
                    write_json(root / f"data/input/horizons/{site_id}.json", {
                        "schema_version": 2, "site_id": site_id, "frame": "MOON_ME_DE421",
                        "coverage_status": "complete", "observer_xyz_m": original.observer_m.tolist(),
                        "lat_deg": float(np.rad2deg(lat)), "lon_deg": float(np.rad2deg(lon)),
                        "az_deg": [0, 90, 180, 270], "horizon_deg": [0, 0, 0, 0],
                        "valid": [True] * 4, "test_fixture_only": True,
                        "observer_height_m": 1.0,
                    })
            output = root / "processed"
            manifest = build(root, output=output, kernel_dir=ROOT / "data/kernels",
                             settings=Settings(disc_samples=32),
                             mission=Mission(duration_s=600, landing_step_s=300), sensitivity_margin_deg=0.1)
            self.assertEqual(manifest["status"], "ready")
            planner = json.loads((output / "planner.json").read_text())
            self.assertTrue(planner["coverage_complete"])
            self.assertEqual(planner["missing_site_ids"], [])
            self.assertGreater(planner["search"]["candidate_count"], 0)
            self.assertTrue((output / "planner_sensitivity_higher.json").is_file())
            schema = json.loads((ROOT / "schemas/scenario.schema.json").read_text())
            validator = Draft202012Validator(schema)
            for scenario in output.glob("scenarios/*/*.json"):
                validator.validate(json.loads(scenario.read_text()))
            for alternate in output.glob("sensitivity/*.json"):
                validator.validate(json.loads(alternate.read_text()))
            sites = json.loads((output / "sites.json").read_text())["sites"]
            for site in sites:
                self.assertEqual(site["observer_height_m"], 1.0)
                scenario = json.loads((output / site["scenario_url"]).read_text())
                self.assertEqual(scenario["provenance"]["horizon_sha256"], file_hash(output / site["horizon_url"]))
            self.assertEqual(validate_frontend(output, ROOT / "schemas/scenario.schema.json")["status"], "pass")
            sites[0]["observer_height_m"] = 2.0
            write_json(output / "sites.json", {"sites": sites})
            with self.assertRaisesRegex(ValueError, "observer height"):
                validate_frontend(output, ROOT / "schemas/scenario.schema.json")
            sites[0]["observer_height_m"] = 1.0
            write_json(output / "sites.json", {"sites": sites})
            manifest["datasets"][0]["scenarios"][0]["metrics"]["sunlight_s"] += 1
            write_json(output / "manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "manifest summary"):
                validate_frontend(output, ROOT / "schemas/scenario.schema.json")


class TerrainAssetTests(unittest.TestCase):
    """The 3D terrain handoff must reach the frontend with the scientific JSON."""

    def test_real_terrain_assets_are_complete(self):
        report = validate_terrain_assets(ROOT / "data/terrain")
        self.assertEqual([row["site_id"] for row in report["sites"]], ["site01", "site04", "site07", "site11"])
        for row in report["sites"]:
            self.assertEqual(png_header(ROOT / "data/terrain" / row["height_png"]), (1024, 1024, 16, 0))
            self.assertEqual(png_header(ROOT / "data/terrain" / row["hillshade_png"]), (1024, 1024, 8, 0))

    def test_terrain_validation_rejects_missing_or_wrong_images(self):
        with tempfile.TemporaryDirectory() as directory:
            terrain = Path(directory)
            for path in (ROOT / "data/terrain").glob("site_*"):
                (terrain / path.name).write_bytes(path.read_bytes())
            (terrain / "site_07_hillshade.png").unlink()
            with self.assertRaisesRegex(ValueError, "site07: hillshade_png"):
                validate_terrain_assets(terrain)
            (terrain / "site_07_hillshade.png").write_bytes((terrain / "site_07_height.png").read_bytes())
            with self.assertRaisesRegex(ValueError, "16-bit"):
                validate_terrain_assets(terrain)

    def test_sync_frontend_copies_json_and_terrain(self):
        with tempfile.TemporaryDirectory() as directory:
            source, destination = Path(directory) / "processed", Path(directory) / "public"
            write_json(source / "manifest.json", {"status": "awaiting_horizons"})
            with patch("sys.stdout"):
                self.assertEqual(cli(["sync-frontend", "--source", str(source), "--destination", str(destination)]), 0)
            self.assertTrue((destination / "manifest.json").is_file())
            copied = sorted(path.name for path in (destination / "terrain").iterdir())
            self.assertEqual(len(copied), 12)
            for site in ("01", "04", "07", "11"):
                for suffix in ("height.png", "hillshade.png", "terrain.json"):
                    name = f"site_{site}_{suffix}"
                    self.assertIn(name, copied)
                    self.assertEqual((destination / "terrain" / name).read_bytes(),
                                     (ROOT / "data/terrain" / name).read_bytes())


class SyntheticGeometryTests(unittest.TestCase):
    """Synthetic geometry is confined to tests and never used as a terrain handoff."""

    def test_refinement_samples_prevent_integrating_a_shadow_as_a_coarse_ramp(self):
        metadata = {"site_id": "site01", "observer_position_xyz_m": [1737400, 0, 0]}
        eph = Ephemeris(metadata, np.array([0., 10.]), np.ones((2, 3)), np.ones((2, 3)), {})
        def visibility(sun, *args):
            fraction = float(sun[0] >= 3.7)
            return {"sun_fraction": fraction, "terrain_fraction": fraction,
                    "earth_center_visible": True, "earth_clearance_rad": 1.0}
        with patch("scientific.analysis.model.solar_visibility", side_effect=visibility):
            result = analyze_scenario(eph, Horizon({}, np.array([0., 180.]), np.zeros(2), "test"),
                vectors_at=lambda t: (np.array([t, 0, 0]), np.ones(3)),
                settings=Settings(event_tolerance_s=0.001))
        self.assertAlmostEqual(result.metrics["equivalent_full_disc_s"], 6.3, delta=0.002)

    def test_detected_boundary_refines_against_new_evaluations(self):
        # A body crosses a flat horizon at t=3.7 s between source epochs 0 and 10.
        def vectors_at(t):
            angle = (t - 3.7) * 0.01
            return np.array([1e11, 0, 1e11]), 3.8e8 * np.array([np.cos(angle), 0, np.sin(angle)])
        evaluator = Evaluator(np.eye(3), lambda az: np.zeros_like(az), vectors_at,
                              Settings(disc_samples=32, search_max_step_s=10, event_tolerance_s=0.001))
        windows, events = find_windows(evaluator, [0, 10], "earth")
        self.assertAlmostEqual(events[0]["offset_s"], 3.7, delta=0.001)
        self.assertAlmostEqual(windows[0][0], 3.7, delta=0.001)
        self.assertEqual(windows[0][1], 10)
        self.assertEqual(find_windows(evaluator, [5, 10], "earth")[1], [])

    def test_subdivision_can_find_an_event_with_equal_source_endpoint_states(self):
        class Pulse:
            settings = Settings(search_max_step_s=2, event_tolerance_s=0.001)
            def state(self, kind, t):
                return 4 <= t < 6
        windows, events = find_windows(Pulse(), search_grid([0, 10], 2), "sunlight")
        self.assertEqual(len(events), 2)
        self.assertAlmostEqual(windows[0][0], 4, delta=0.001)
        self.assertAlmostEqual(windows[0][1], 6, delta=0.001)

    def test_full_pipeline_has_no_fabricated_power_and_no_clipping_events(self):
        metadata = {"site_id": "site01", "observer_position_xyz_m": [1737400, 0, 0], "frame": "MOON_ME_DE421"}
        times = np.array([0., 10., 20.])
        eph = Ephemeris(metadata, times, np.tile([1e11, 0, 0], (3, 1)),
                        np.tile([3.8e8, 0, 0], (3, 1)), {})
        # Earth and Sun align here, so move Earth north to keep the Sun unobscured.
        eph.earth_vectors_m[:] = [3.8e8, 0, 1e8]
        horizon = Horizon({}, np.array([0., 90., 180., 270.]), np.zeros(4), "test-only")
        result = analyze_scenario(eph, horizon, settings=Settings(disc_samples=32))
        self.assertEqual(result.events, [])
        self.assertEqual(result.evaluation_count, 3)
        self.assertEqual(result.metrics["joint_s"], 20)
        self.assertIsNone(result.metrics["energy_wh"])
        class Clock:
            def utc(self, t):
                return f"2026-11-14T00:00:{int(t):02d}.000Z"
        doc = scenario_json(eph, horizon, result, Clock(), "linear_interpolation_of_handoff_vectors", {})
        json.dumps(doc, allow_nan=False)
        schema = json.loads((ROOT / "schemas/scenario.schema.json").read_text())
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema).validate(doc)
        self.assertTrue(doc["windows"]["joint"][0]["start_clipped"])
        self.assertTrue(doc["windows"]["joint"][0]["end_clipped"])
        self.assertIsNone(doc["series"][0]["sun_azimuth_deg"])


if __name__ == "__main__":
    unittest.main()
