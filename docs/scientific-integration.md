# Scientific integration

The first release supports `site01`, `site04`, `site07`, and `site11`. The Python
geometry accepts arbitrary coordinates, but this release deliberately restricts
the data pipeline and planner to these four supplied observer positions.

## Local setup

Run from the repository root with Python 3.12:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m scientific fetch-kernels
.venv/bin/python -m scientific validate-handoff
.venv/bin/python -m scientific build --mission data/mission.example.json
.venv/bin/python -m scientific sync-frontend
```

The small leap-second kernel is included. `fetch-kernels` downloads the remaining
NASA DE421 kernels, including the archived DE421 planetary ephemeris. Large binary
kernels are ignored by Git. Downloads happen only through the explicit command.

Until all four terrain profiles are present, `build` exports body positions and
historical aggregates with status `awaiting_horizons`. It does not produce terrain
visibility or recommendations for an unprovided profile. Use `--require-terrain`
to return exit code 2 on an incomplete set:

```sh
.venv/bin/python -m scientific build --spice --require-terrain \
  --mission data/mission.example.json
```

`--spice` evaluates the Sun and Earth with `spkcpo` at every search epoch and
refinement epoch. Without it, vectors between supplied epochs are linearly
interpolated and the output records that approximation. Both paths use SPICE to
convert elapsed ET seconds to UTC, including leap seconds.

## Required terrain handoff

Place the original horizon-v2 JSON files in `data/input/horizons/`. Filenames may
vary; `site_id` identifies the profile. The loader expects the fields used by the
team's first Colab:

| Field | Requirement |
| --- | --- |
| `schema_version` | `2` |
| `site_id` | One of the four supported IDs |
| `frame` | `MOON_ME_DE421` |
| `coverage_status` | `complete` |
| `observer_xyz_m` | Same observer as the ephemeris, within 2 cm per component |
| `lat_deg`, `lon_deg` | Planetocentric latitude and east longitude, consistent with XYZ within 1 m |
| `az_deg` | Increasing, distinct azimuths in `[0,360)` |
| `horizon_deg` | Matching finite elevations; negative values are preserved |
| `valid` | Matching array of booleans, all `true` |

The horizon is periodically interpolated across north. Its spatial resolution
and provenance remain those of the supplied product. A declaration of complete
coverage is checked, not independently proved by this adapter. Original DEM,
reference-radius, scan-extent, observer-height, and error metadata should remain
in each profile. Changing observer height requires new horizon and ephemeris
inputs; the pipeline does not silently move the observer.

## Dataset boundaries

| Dataset | Period | Meaning |
| --- | --- | --- |
| Monthly ephemerides | 2026-11-14 through 2026-12-14 | 8,641 observer-relative samples per site, nominally 300 s apart |
| Historical statistics | 2009-07-01 through 2013-07-01 | Sample summaries and daily aggregates from the first Colab |

Historical percentages are converted to fractions. The historical field named
`earth_center_visible` in the CSV is a daily mean, so the frontend receives it as
`earth_center_visible_sample_fraction`, a number. The terminal historical day is
marked `partial_day: true` because it contains only the endpoint. Historical
averages cannot supply event times, interruptions, or 2026 forecasts. The source
historical vectors and horizon files are needed to reproduce those calculations.

## Mission-date search

`data/mission.example.json` contains illustrative constraints, not validated
mission requirements. No panel is assumed. Pass `--panel data/panel.example.json`
to calculate power and energy for that explicitly selected example panel.

For each site the planner evaluates a grid of landing dates for a fixed mission
duration. The last fully covered start date is included even when off-grid.
Dates outside ephemeris coverage are never extrapolated. Each candidate returns
metrics, feasibility, and individual constraint violations. An energy constraint
without a panel returns `panel_model_required`.

Operational windows are indexed with cumulative durations and a range-maximum
table. For W intervals, setup takes O(W log W) space/time and each overlap or
longest-clipped-gap query takes O(log W). A piecewise-linear antiderivative
handles partial time cells for mean disc visibility and energy. The planner
reuses these indexes across landing dates instead of rerunning visibility.

Feasible candidates are ordered by joint sunlight/Earth visibility duration,
then longest insufficient-light interruption, then longest Earth interruption.
The same three objectives define a Pareto frontier; no hidden weighted score is
used. The frontier comparison costs O(C²) for C candidates. The default 6-hour
landing grid keeps this small for four sites over one month. Results are best
among evaluated sites and dates, not a global optimum over the Moon.

`max_darkness_s` constrains complete sampled darkness. A partially visible disc
below the configured illumination threshold is constrained separately by
`max_insufficient_light_s`. These are screening metrics; battery state is not
simulated by this release.

## Event search and sensitivity

All supplied time cells are sampled, subdividing even equal-state endpoints
when the configured maximum step is smaller. Detected Earth-centre crossings
use continuous root refinement; sampled-disc illumination and darkness use
state-boundary refinement. One cached compact evaluation is reused by all three
state searches, and per-ray arrays are discarded immediately.

The default search step is 300 seconds and the numerical boundary tolerance is
1 second. Events or gaps shorter than the search step may be missed. A refined
boundary does not establish 1-second physical accuracy. Finite disc sampling,
horizon resolution, and ephemeris interpolation remain separate errors. The
`events` array contains detected transitions; a clipped interval endpoint is not
invented as a sunset or Earthset.

Run a measured time/disc convergence study on a supplied real horizon:

```sh
.venv/bin/python -m scientific convergence --site site01 --spice
```

The report compares the baseline, half the time step, and twice the solar-disc
sample count. It records event counts, boundary shifts, metric differences,
runtime, and evaluation counts. It does not prove completeness of the event set.

Optional `--sensitivity-margin-deg VALUE` also runs uniformly lowered and raised
horizons and exports separate planners. This is an explicitly chosen sensitivity
scenario, not a statistical confidence interval. No angular uncertainty is
invented when the input does not provide one.

## Validation

```sh
.venv/bin/python -B -m unittest discover -s scientific -t . -p 'test*.py'
.venv/bin/python -B scientific/verify_formulas.py --check
```

The NumPy model, mathematical README, formula registry, and tests remain in
`scientific/`. The original sampled-array entry point and the adaptive
`analyze_scenario` pipeline share `visibility_metrics`; the horizon adapter uses
the core's `make_horizon`. Each physical formula has one runtime implementation.
The additional tests compare interval indexes against
independent clipping, check constrained date selection, exercise event detection
and numerical refinement, validate terrain inputs and JSON output, and test a
UTC leap second. Synthetic horizons are confined to tests.

`validate-handoff` recomputes 17 epochs per site from the declared kernel set and
compares observer-relative position vectors with a 1 m tolerance. The report
includes all errors and SHA-256 hashes. It checks reproducibility, not independent
absolute accuracy. A separate comparison with Horizons requires matching frames,
observer position, time, and aberration settings.

## Sources

- [Team's four-year analysis notebook](https://colab.research.google.com/drive/1mT3LhdHljT8v7uso0KXSyIeerWiZQ2nw)
- [Team's SPICE exploration notebook](https://colab.research.google.com/drive/1osvjZfl2AQAgawIo5MyQR3bnK9bGuUee)
- [NASA LOLA south-polar terrain products](https://pgda.gsfc.nasa.gov/products/90)
- [NAIF observer-relative SPICE states](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkcpo_c.html)
- [NAIF event search, step size, and convergence](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/gf.html)
- [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html)
