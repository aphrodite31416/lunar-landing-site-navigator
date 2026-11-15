"""Lightweight four-site comparison summary for the frontend Compare view.

The Compare view needs only each site's visibility windows, events and metrics,
not the full sample series (about 9.5 MB per site). This module copies exactly
those fields, verbatim, from the exported terrain scenarios: no value is
recomputed, so every window boundary, event offset and UTC string is identical
to the source. Each source scenario is pinned by SHA-256, and the output is
deterministic: the same exports always produce byte-identical JSON.
"""

import hashlib
import json
from pathlib import Path

# Self-contained on purpose (standard library only), so the summary can be made and
# checked without the numerical stack. The JSON format matches inputs.write_json, but
# the file is written as raw bytes with an LF newline, so it is identical on every OS.
# A unit test keeps SITE_IDS in step with inputs.py.
SITE_IDS = ("site01", "site04", "site07", "site11")


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    def reject_constant(value):
        raise ValueError(f"Non-finite JSON constant: {value}")
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject_constant)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(serialize(value))

SUMMARY_NAME = "compare_summary.json"
WINDOW_KINDS = ("sunlight", "earth", "joint", "darkness", "insufficient_light", "earth_gap")


def scenario_dataset(manifest):
    rows = [row for row in manifest["datasets"] if row["kind"] == "terrain_scenarios"]
    if len(rows) != 1:
        raise ValueError("Expected exactly one terrain_scenarios dataset in the manifest.")
    return rows[0]


def summary_path(directory, dataset):
    """The summary sits next to the dataset's scenario files."""
    folders = {Path(entry["url"]).parent.as_posix() for entry in dataset["scenarios"]}
    if len(folders) != 1:
        raise ValueError("The scenario files of one dataset must share a directory.")
    return Path(directory) / folders.pop() / SUMMARY_NAME


def build_compare_summary(directory):
    """Summary document derived from manifest.json and the scenarios it lists."""
    directory = Path(directory)
    manifest = read_json(directory / "manifest.json")
    if manifest["status"] != "ready":
        raise ValueError("A comparison summary needs a ready manifest with all four terrain scenarios.")
    dataset = scenario_dataset(manifest)
    sites = []
    for entry in dataset["scenarios"]:
        path = directory / entry["url"]
        scenario = read_json(path)
        if scenario["site_id"] != entry["site_id"]:
            raise ValueError(f"{entry['url']}: scenario belongs to {scenario['site_id']}, not {entry['site_id']}.")
        series = scenario["series"]
        sites.append({
            "site_id": scenario["site_id"],
            "scenario_url": entry["url"],
            "scenario_sha256": file_hash(path),
            "period": scenario["period"],
            "origin_offset_s": series[0]["offset_s"],
            "end_offset_s": series[-1]["offset_s"],
            "windows": {kind: scenario["windows"][kind] for kind in WINDOW_KINDS},
            "events": scenario["events"],
            "metrics": scenario["metrics"],
        })
    return {
        "schema_version": "1.0",
        "kind": "compare_summary",
        "dataset_id": dataset["id"],
        "start_utc": dataset["start_utc"],
        "end_utc": dataset["end_utc"],
        "settings": {"minimum_sun_fraction": manifest["settings"]["minimum_sun_fraction"]},
        "sites": sites,
    }


def serialize(value):
    """Compact JSON as in inputs.write_json, UTF-8, one LF newline: identical bytes on every OS."""
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")


def write_compare_summary(directory):
    directory = Path(directory)
    summary = build_compare_summary(directory)
    path = summary_path(directory, scenario_dataset(read_json(directory / "manifest.json")))
    write_json(path, summary)
    return path


def validate_compare_summary(directory, schema_path=None):
    """Check the stored summary against the manifest, the scenarios and the schema."""
    directory = Path(directory)
    manifest = read_json(directory / "manifest.json")
    dataset = scenario_dataset(manifest)
    path = summary_path(directory, dataset)
    if not path.is_file():
        raise ValueError(f"Missing {path.relative_to(directory).as_posix()}; run python -m scientific compare-summary.")
    stored = read_json(path)
    if schema_path is not None:
        from jsonschema import Draft202012Validator
        errors = list(Draft202012Validator(read_json(schema_path)).iter_errors(stored))
        if errors:
            raise ValueError(f"compare summary schema: {errors[0].message}")

    manifest_rows = {row["site_id"]: row for row in dataset["scenarios"]}
    ids = [site["site_id"] for site in stored["sites"]]
    if sorted(ids) != sorted(SITE_IDS) or len(set(ids)) != len(ids) or sorted(manifest_rows) != sorted(ids):
        raise ValueError("The comparison summary must contain all four sites of the manifest, once each.")
    if (stored["dataset_id"], stored["start_utc"], stored["end_utc"]) != (dataset["id"], dataset["start_utc"], dataset["end_utc"]):
        raise ValueError("The comparison summary describes a different dataset or period from the manifest.")
    if stored["settings"]["minimum_sun_fraction"] != manifest["settings"]["minimum_sun_fraction"]:
        raise ValueError("The comparison summary uses a different sunlight threshold from the manifest.")
    for site in stored["sites"]:
        row = manifest_rows[site["site_id"]]
        if site["scenario_url"] != row["url"] or site["metrics"] != row["metrics"]:
            raise ValueError(f"{site['site_id']}: summary and manifest metrics disagree.")
        if file_hash(directory / site["scenario_url"]) != site["scenario_sha256"]:
            raise ValueError(f"{site['site_id']}: the scenario changed since the summary was made; regenerate it.")

    expected = build_compare_summary(directory)
    if stored != expected:
        raise ValueError("The comparison summary differs from its source scenarios; regenerate it.")
    if path.read_bytes() != serialize(expected):
        raise ValueError("The comparison summary is not in canonical form; regenerate it.")
    windows = sum(len(w) for site in stored["sites"] for w in site["windows"].values())
    events = sum(len(site["events"]) for site in stored["sites"])
    return {"status": "pass", "kind": "compare_summary_report", "path": path.relative_to(directory).as_posix(),
            "bytes": path.stat().st_size, "windows": windows, "events": events}
