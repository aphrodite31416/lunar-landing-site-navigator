"""Run with python -m scientific; all files stay local until explicitly published."""

import argparse
import json
from pathlib import Path
import shutil
import sys

from .analysis import Panel, Settings
from .export import build
from .inputs import SITE_IDS, read_json, write_json
from .planner import Mission
from .ephemeris import fetch_kernels
from .validation import convergence_report, validate_handoffs
from .frontend_validation import terrain_asset_names, validate_frontend, validate_terrain_assets

ROOT = Path(__file__).resolve().parent.parent


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build four-site lunar planning JSON.")
    commands = parser.add_subparsers(dest="command", required=True)
    kernels = commands.add_parser("fetch-kernels", help="Download the declared NASA DE421 kernel set.")
    kernels.add_argument("--directory", type=Path, default=ROOT / "data/kernels")
    kernels.add_argument("--time-only", action="store_true")
    generate = commands.add_parser("build", help="Validate inputs and export frontend datasets.")
    generate.add_argument("--horizons", type=Path)
    generate.add_argument("--output", type=Path, default=ROOT / "data/processed")
    generate.add_argument("--kernel-dir", type=Path, default=ROOT / "data/kernels")
    generate.add_argument("--disc-samples", type=int, default=512)
    generate.add_argument("--search-step-s", type=float, default=300)
    generate.add_argument("--event-tolerance-s", type=float, default=1)
    generate.add_argument("--sun-threshold", type=float, default=0.8)
    generate.add_argument("--mission", type=Path, help="Mission constraints JSON.")
    generate.add_argument("--panel", type=Path, help="Panel parameters JSON; no power is invented when omitted.")
    generate.add_argument("--spice", action="store_true", help="Recompute vectors using the declared kernels.")
    generate.add_argument("--sensitivity-margin-deg", type=float)
    generate.add_argument("--require-terrain", action="store_true", help="Exit 2 unless all four horizons are available.")
    validate = commands.add_parser("validate-handoff", help="Compare supplied vectors with the declared NASA kernels.")
    validate.add_argument("--kernel-dir", type=Path, default=ROOT / "data/kernels")
    validate.add_argument("--output", type=Path, default=ROOT / "data/processed/ephemeris_validation.json")
    converge = commands.add_parser("convergence", help="Measure time-step and solar-disc convergence on real terrain.")
    converge.add_argument("--site", choices=SITE_IDS, default="site01")
    converge.add_argument("--horizons", type=Path, default=ROOT / "data/input/horizons")
    converge.add_argument("--kernel-dir", type=Path, default=ROOT / "data/kernels")
    converge.add_argument("--output", type=Path, default=ROOT / "data/processed/convergence.json")
    converge.add_argument("--spice", action="store_true")
    converge.add_argument("--disc-samples", type=int, default=512)
    converge.add_argument("--search-step-s", type=float, default=300)
    sync = commands.add_parser("sync-frontend", help="Copy generated JSON and 3D terrain assets into Vite's public/data.")
    sync.add_argument("--source", type=Path, default=ROOT / "data/processed")
    sync.add_argument("--terrain-source", type=Path, default=ROOT / "data/terrain")
    sync.add_argument("--destination", type=Path, default=ROOT / "frontend/public/data")
    frontend_check = commands.add_parser("validate-frontend", help="Check the complete four-site JSON/terrain handoff.")
    frontend_check.add_argument("--source", type=Path, default=ROOT / "data/processed")
    frontend_check.add_argument("--terrain-source", type=Path, default=ROOT / "data/terrain")
    frontend_check.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "fetch-kernels":
            fetch_kernels(args.directory, args.time_only)
        elif args.command == "validate-handoff":
            report = validate_handoffs(ROOT, args.kernel_dir)
            write_json(args.output, report)
            print(json.dumps({"status": report["status"], "output": str(args.output)}))
            return 0 if report["status"] == "pass" else 1
        elif args.command == "convergence":
            report = convergence_report(ROOT, args.kernel_dir, args.horizons, args.site,
                                        settings=Settings(disc_samples=args.disc_samples, search_max_step_s=args.search_step_s),
                                        use_spice=args.spice)
            write_json(args.output, report)
            print(f"Convergence report: {args.output}")
        elif args.command == "sync-frontend":
            manifest = read_json(args.source / "manifest.json")
            if manifest["status"] == "ready":
                validate_frontend(args.source, ROOT / "schemas/scenario.schema.json")
            names = terrain_asset_names(args.terrain_source)
            shutil.copytree(args.source, args.destination, dirs_exist_ok=True)
            terrain = args.destination / "terrain"
            terrain.mkdir(parents=True, exist_ok=True)
            for name in names:
                shutil.copy2(args.terrain_source / name, terrain / name)
            print(f"Frontend data: {args.destination} (terrain: {len(names)} files in {terrain})")
        elif args.command == "validate-frontend":
            report = validate_frontend(args.source, ROOT / "schemas/scenario.schema.json")
            report["terrain_assets"] = validate_terrain_assets(args.terrain_source)
            if args.output:
                write_json(args.output, report)
            print(json.dumps(report))
        else:
            settings = Settings(args.sun_threshold, args.disc_samples, args.search_step_s, args.event_tolerance_s)
            mission = Mission(**read_json(args.mission)) if args.mission else Mission()
            panel = Panel(**read_json(args.panel)) if args.panel else None
            manifest = build(ROOT, args.horizons, args.output, args.kernel_dir, settings,
                             mission, panel, args.spice, args.sensitivity_margin_deg)
            print(json.dumps({"status": manifest["status"], "output": str(args.output)}, ensure_ascii=False))
            if args.require_terrain and manifest["status"] != "ready":
                print("Missing terrain profiles: provide horizon-v2 JSON for all four sites.", file=sys.stderr)
                return 2
    except (ValueError, TypeError, KeyError, OSError) as error:
        print(f"Input/build error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
