# Team architecture and responsibility boundaries

The demo uses Site01, Site04, Site07, and Site11 as representative candidate
locations. They are a fixed dataset for this release. The mathematical approach
can be applied to more lunar south-pole locations once corresponding terrain,
observer, and ephemeris inputs are prepared and validated.

The responsibility assignments below are a proposed team split. Only Zarina's
original mathematical solution is explicitly attributed. The authors' names for
the two linked notebooks and the terrain handoff still need confirmation.
Integration adapters are new repository code; they are not presented as unchanged
code written by a notebook author.

| Block | Code / data | Input or source | Proposed responsible person |
| --- | --- | --- | --- |
| Mathematical core | `scientific/mini_model.py`, original mathematical README, audit and tests | Zarina's original solution | Zarina |
| Terrain profiles | `scientific/inputs.py` (`Horizon`, `load_horizon`), `data/input/horizons/` | Four real horizon-v2 JSONs | Terrain-data author; name to confirm |
| Ephemerides and time | `scientific/ephemeris/`, `Ephemeris` adapter in `scientific/inputs.py`, `data/input/ephemeris/` | Second Colab and the separate monthly JSON/NPZ handoff | Author of second Colab; handoff authorship to confirm |
| Historical analysis | `scientific/historical/`, `data/input/historical/` | First Colab and four-year CSVs | Author of first Colab |
| Monthly visibility | `scientific/analysis.py` | Common mathematical core + validated ephemerides + horizon | Zarina / scientific integration |
| Landing-date planning | `scientific/planner.py`, `scientific/intervals.py` | Visibility windows + mission constraints | Zarina / scientific integration |
| Assembly and JSON handoff | `scientific/export.py`, `scientific/handoff.py`, schemas and frontend types | Outputs from all scientific blocks | Zarina / scientific integration |
| Frontend and demo | `frontend/` | Versioned JSON contract | Esha and the teammate who requested the frontend handoff |

## Source 1: four-year visibility analysis

[Original Colab](https://colab.research.google.com/drive/1mT3LhdHljT8v7uso0KXSyIeerWiZQ2nw)

Source snapshot: `scientific/notebooks/four_year_visibility.ipynb`.
Runtime adapter: `scientific/historical/export.py`.

This block owns the historical 2009–2013 sample summaries and daily trends. The
adapter imports existing CSV results, preserves their meaning, marks the partial
terminal day, and exports historical JSON. It does not rerun the four-year
calculation. Reproduction of the notebook requires its historical vector archive
and real horizon profiles, which are not yet in the input handoff.

## Source 2: SPICE exploration

[Original Colab](https://colab.research.google.com/drive/1osvjZfl2AQAgawIo5MyQR3bnK9bGuUee)

Source snapshot: `scientific/notebooks/spice_exploration.ipynb`.
Runtime package: `scientific/ephemeris/`.

This block owns kernel loading, time conversion, observer-relative Sun/Earth
vectors, and the body-position JSON. The production adapter uses the monthly
handoff's declared `MOON_ME_DE421`, `CN+S`, and observer position. The exploratory
notebook uses different settings and includes artificial terrain examples; those
examples are not production terrain data.

## Common core and integration

The two source notebooks stay separate. Shared physical calculations live in
Zarina's reviewed `mini_model.py`. `analysis.py` combines them with the supplied
data and finds terrain-aware windows. `planner.py` searches landing dates and
explains constraint failures. `export.py` orchestrates these blocks and writes
the agreed frontend format; scientific computations do not depend on React.

All four sites use `analyze_scenario` with different inputs. The original sampled
analysis and the adaptive pipeline share one `visibility_metrics` function.
Horizon interpolation uses `mini_model.make_horizon`. Saved notebook functions
are reference material and are not imported by the production pipeline.

Module boundaries are Python interfaces inside one scientific application, not
separate web services. The demo frontend loads precomputed JSON as static assets.
An API is optional future work if users need on-demand calculations.

```text
Monthly ephemeris handoff + SPICE adapter ─┐
                                        ├─ monthly visibility ─ mission planner ─┐
Horizon-v2 profiles + mathematical core ──┘                                      │
                                                                               ├─ JSON assembly ─ frontend
Four-year Colab CSVs ─ historical adapter ───────────────────────────────────────┘
```

## Interfaces between contributors

1. The ephemeris block supplies elapsed ET times, unnormalised observer-relative
   vectors in metres, UTC bounds, frame/correction metadata, and observer XYZ.
2. The terrain block supplies a complete periodic horizon for the same observer
   and frame. A geometry-only output is not accepted as a terrain result.
3. The common visibility block supplies sampled states, actual detected events,
   clipped operational windows, and explicitly defined metrics.
4. The planner supplies evaluated landing dates, constraints, feasibility,
   violations, and a Pareto flag. It does not alter raw input data.
5. The historical block supplies daily sample aggregates under its separate
   historical period; these are not mixed with monthly mission results.
6. The JSON assembly layer converts units for display, includes provenance and
   limitations, and publishes the same shape for all four sites.
7. The frontend owns site selection, terrain presentation, comparisons, timeline
   playback, and understandable labels. It consumes JSON without reimplementing
   the scientific formulas in JavaScript.

## Handoff for Esha and the frontend team

- [JSON field meanings and loading example](data-contract.md)
- [TypeScript interfaces](../frontend/src/types/science.ts)
- [Terrain-scenario JSON Schema](../schemas/scenario.schema.json)
- [Actual three-record examples](../data/processed/examples/index.json)
- [Site01 body-position sample](../data/processed/examples/site01.body_positions.sample.json)
- [Site01 historical sample](../data/processed/examples/site01.historical_daily_aggregates.sample.json)

The available examples contain real values. Full terrain-aware examples will
appear after the four real horizon profiles arrive. `awaiting_horizons` remains
visible in the manifest until then. To preview the available files through Vite,
run `python -m scientific sync-frontend` and load `/data/manifest.json`.

No individual GitHub handles or CODEOWNERS entries are guessed from first names.
