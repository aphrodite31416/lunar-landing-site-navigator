"""Small real-data excerpts for frontend developers; never fill missing terrain values."""

from pathlib import Path

from .inputs import read_json, write_json


def export_examples(output):
    output = Path(output)
    sites_doc = read_json(output / "sites.json")
    write_json(output / "examples/sites.sample.json", sites_doc)
    samples = []
    for site in sites_doc["sites"]:
        for kind, source in (("body_positions", site["geometry_url"]),
                             ("terrain_scenario", site["scenario_url"]),
                             ("historical_daily_aggregates", f"historical/{site['site_id']}.json")):
            if source is None or not (output / source).is_file():
                continue
            document = read_json(output / source)
            document["series"] = document["series"][:3]
            notice = "Three-record excerpt. Any period metrics or windows still refer to the full source dataset."
            if kind == "terrain_scenario":
                document["quality"]["warnings"].append(notice)
            else:
                document["warnings"].append(notice)
            relative = f"{site['site_id']}.{kind}.sample.json"
            write_json(output / "examples" / relative, document)
            samples.append({"site_id": site["site_id"], "kind": kind, "url": relative})
    index = {"schema_version": "1.0", "samples": samples,
             "sites_sample_url": "sites.sample.json",
             "terrain_scenario_samples_available": any(row["kind"] == "terrain_scenario" for row in samples),
             "notice": "URLs in this index are relative to examples/. URLs inside site records remain relative to the manifest directory."}
    write_json(output / "examples/index.json", index)
    return "examples/index.json"
