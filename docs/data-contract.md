# Frontend JSON contract v1

Generate with `python -m scientific build`, then run `python -m scientific
sync-frontend`. Vite serves the copied files from `/data/`. Python is only needed
for generation; loading precomputed data needs no application server.

`frontend/src/types/science.ts` contains the TypeScript interfaces. The terrain
scenario also has a machine-readable schema in `schemas/scenario.schema.json`.

## Loading

```ts
import type { Manifest, Site, TerrainScenario, MissionPlan } from './types/science';

const manifestUrl = new URL('data/manifest.json', document.baseURI);
const manifest: Manifest = await fetch(manifestUrl).then(r => r.json());
const { sites }: { sites: Site[] } = await fetch(
  new URL(manifest.sites_url, manifestUrl)
).then(r => r.json());

const site = sites[0];
if (site.terrain_status === 'ready' && site.scenario_url) {
  const scenario: TerrainScenario = await fetch(
    new URL(site.scenario_url, manifestUrl)
  ).then(r => r.json());
  // Draw scenario.series, scenario.windows and scenario.events.
}
const plan: MissionPlan = await fetch(
  new URL(manifest.planner_url, manifestUrl)
).then(r => r.json());
```

All manifest/site URLs are relative to the manifest directory. For a deployment
under a subpath, set the app base URL accordingly. Fetch handling should check
HTTP status before parsing in application code.

## Files and UI meaning

| File | Use |
| --- | --- |
| `manifest.json` | Units, datasets, periods, settings, availability |
| `sites.json` | Four observer positions and links to their available datasets |
| `geometry/siteXX.json` | Real Sun/Earth azimuth/elevation; no terrain visibility |
| `horizons/siteXX.json` | The validated original horizon-v2 profile |
| `scenarios/monthly-2026-11/siteXX.json` | Terrain-aware timeline, windows, events, metrics |
| `planner.json` | Landing-date grid, constraint failures, recommendations, Pareto flags |
| `historical/siteXX.json` | 2009–2013 daily aggregates and sample summaries |
| `ephemeris_validation.json` | Reproduction check against the declared NASA kernels |
| `examples/index.json` | Three-record excerpts from real available outputs for frontend development |

`manifest.examples_url` points to the example index. It includes examples for all
four sites. Terrain-scenario examples are added automatically once real horizons
are supplied. The excerpt notice distinguishes a short `series` from metrics and
windows that still describe the full source period.

Check `manifest.status` and each site's `terrain_status`. `awaiting_horizons`
means full terrain analyses are incomplete. Missing scenario/horizon URLs are
`null`, not links to synthetic profiles. Geometry files have kind `body_positions`
and `terrain_applied: false`; their elevations alone do not indicate visibility.

`observer_height_m` is populated from each supplied horizon (1 m for all four
sites). Horizon arrays have their own `az_deg` and `n_az`: Site04's refined
profile has 14,400 directions; the other sites have 7,200. Read the actual
array and interpolate periodically instead of assuming a fixed length.

## Units and coordinates

- Angles: degrees. Azimuth is clockwise from north: 0° north, 90° east.
- Positions: metres in `MOON_ME_DE421`; latitude is planetocentric and east
  longitude is positive. Site height is fixed by the supplied observer XYZ.
  All four supplied horizons use a 1 m radial observer height; `sites.json`
  reads that value from the horizon metadata. The README's 2 m examples are
  illustrative and do not change these observers.
- Durations and offsets: seconds. `offset_s` is elapsed ET seconds, not Unix time.
- Timestamps: UTC ISO 8601, converted with SPICE; no browser time zone is applied.
- Fractions: 0 through 1. Convert to percentages only when displaying them.
- Power: watts; energy: watt-hours. Missing panel outputs are `null`, not zero.
- An undefined zenith/nadir azimuth is `null`. No NaN/Infinity is emitted.

## Visibility and events

`sun_visible_fraction` accounts for terrain and Earth occulting the sampled
solar disc. `sun_terrain_visible_fraction` applies terrain only. Neither is the
fraction of time in sunlight. `sunlight_available` applies the configured disc
fraction threshold; the default is 0.8. `earth_center_visible` means the centre
direction is strictly above terrain, not that a particular ground station has a
working link.

Each event has `kind`, `active_after`, `offset_s`, and `utc`. For the current
timeline offset, find the first future event of the relevant kind. The remaining
duration is `event.offset_s - currentOffset`. If none exists, show that no event
was found within the loaded period; do not use the period end as a sunset.

Every interval contains UTC/offset boundaries, its duration, and `start_clipped`
and `end_clipped`. A clipped interval continues to the edge of the analysis data;
its actual start or end may lie outside the loaded period. Durations are measured
over the analysis period. Boundaries have finite numerical and model error.

Use the explicit period fields for labels: `monthly-2026-11` covers
2026-11-14 through 2026-12-14 UTC, not calendar November. Refined samples around
events are included in the exported timeline and integration; do not assume
every adjacent sample is the same number of seconds apart. The numerical
event tolerance is not a physical accuracy guarantee.

For sky rendering, compare the body's elevation with its horizon elevation and
render the finite solar disc. At zenith/nadir, azimuth and the displayed horizon
direction are undefined (`null`). For timeline playback, interpolate vectors or
angles carefully across azimuth wrap; precomputed event windows remain the
authority for displayed state transitions.

## Historical charts and planner

Historical `earth_center_visible_sample_fraction` is a daily sample mean, not a
boolean. Exclude `partial_day` rows from comparisons of full days. Historical
sample percentages and current mission-window metrics have distinct labels.

Planner `recommendations` contain feasible candidates only. Display each rejected
candidate's `violations` to explain the result. `no_feasible_candidates` is a valid
result. `coverage_complete: false` means the planner evaluated only the available
sites. `pareto_optimal` identifies candidates not dominated on all three declared
objectives; their tradeoffs may differ.

The example mission and panel files contain illustrative user inputs. Present
them as editable assumptions, not measured spacecraft specifications.
