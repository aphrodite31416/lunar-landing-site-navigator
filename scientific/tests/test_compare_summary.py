"""The Compare summary must be current, verbatim, deterministic and tamper-evident."""

import json
from pathlib import Path
import shutil
import tempfile
import unittest

from scientific.compare_summary import (
    SITE_IDS, build_compare_summary, scenario_dataset, serialize, summary_path, validate_compare_summary,
)

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data/processed"
SCHEMA = ROOT / "schemas/compare_summary.schema.json"


def ready():
    path = PROCESSED / "manifest.json"
    return path.is_file() and json.loads(path.read_text(encoding="utf-8"))["status"] == "ready"


@unittest.skipUnless(ready(), "needs the exported four-site scenarios in data/processed")
class CompareSummaryTest(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((PROCESSED / "manifest.json").read_text(encoding="utf-8"))
        self.path = summary_path(PROCESSED, scenario_dataset(self.manifest))

    def test_summary_is_current_and_valid(self):
        report = validate_compare_summary(PROCESSED, SCHEMA)
        self.assertEqual(report["status"], "pass")

    def test_windows_events_and_metrics_are_verbatim(self):
        summary = json.loads(self.path.read_text(encoding="utf-8"))
        for site in summary["sites"]:
            scenario = json.loads((PROCESSED / site["scenario_url"]).read_text(encoding="utf-8"))
            for kind, windows in site["windows"].items():
                self.assertEqual(windows, scenario["windows"][kind], f"{site['site_id']} {kind}")
            self.assertEqual(site["events"], scenario["events"])
            self.assertEqual(site["metrics"], scenario["metrics"])
            self.assertEqual(site["period"], scenario["period"])
            self.assertEqual(site["origin_offset_s"], scenario["series"][0]["offset_s"])
            self.assertEqual(site["end_offset_s"], scenario["series"][-1]["offset_s"])

    def test_output_is_deterministic(self):
        self.assertEqual(serialize(build_compare_summary(PROCESSED)), self.path.read_bytes())

    def test_changed_boundary_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "processed"
            shutil.copytree(PROCESSED, copy, ignore=shutil.ignore_patterns("geometry", "historical", "examples"))
            target = summary_path(copy, scenario_dataset(self.manifest))
            document = json.loads(target.read_text(encoding="utf-8"))
            document["sites"][0]["windows"]["earth"][0]["end_offset_s"] += 1e-6
            target.write_bytes(serialize(document))
            with self.assertRaises(ValueError):
                validate_compare_summary(copy, SCHEMA)

    def test_site_ids_match_pipeline(self):
        try:
            from scientific.inputs import SITE_IDS as pipeline_ids
        except ImportError:
            self.skipTest("numerical stack not installed")
        self.assertEqual(SITE_IDS, pipeline_ids)


if __name__ == "__main__":
    unittest.main()
