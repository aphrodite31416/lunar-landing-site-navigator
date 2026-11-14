# Terrain and validation findings (Lucas, 2026-11-14)

Answers to the terrain, Sun-visibility and SPICE items of MaKenna's review. Everything here lives under `terrain/` (scripts and outputs); nothing in `scientific/` or the frontend was changed. Details and full tables: `terrain/data/derived/validation/README.md` and `terrain/data/derived/horizons/README.md`.

## Status of the review items

| Review item | Status | Result | Files |
|---|---|---|---|
| Convergence checks only for Site01 | **Done, all 4 sites** | All pass the 0.01° target, except 2 of 7200 azimuths at Site04 (0.0104°). Profiles unchanged. | `terrain/data/derived/horizons/site_XX_checks.json` |
| DEM vertical accuracy not propagated | **Figure added** | NASA's per-pixel height error for the 5 m DEMs (Barker et al. 2021, RMS ~0.3–0.5 m) gives a horizon uncertainty of **0.02–0.24° (median)** for blockers ≥ 100 m away. Biggest error in the horizon; hours in event times. | `terrain/scripts/horizon_uncertainty.py`, `.../validation/horizon_uncertainty.json` |
| No real-SPICE test | **Done, all 4 sites** | The pipeline's own `body_vector_from_spice` + `local_basis` + `azimuth_elevation`, with the real DE421 kernels, vs JPL Horizons: max **0.000011°** (Sun and Earth, 5 epochs, 40 comparisons). Also rules out an azimuth-convention mix-up. | `terrain/scripts/check_pipeline_spice.py`, `check_spice_vs_horizons.py`, `.../validation/spice_vs_horizons.json` |
| Compare with NASA illumination maps | **Done, gap explained in part** | See below. | `terrain/scripts/sun_visibility_periods.py`, `compare_umar_5min.py` |
| Observer height (1 m) | Unchanged | 1 m is the team's choice (architecture doc). Barker et al. 2021 show 1 m vs 5 m changes the light a lot, so a real lander/panel height would matter. | |

## Sun visibility vs NASA's map

NASA map: `AVGVISIB_85S_060M_201608` (https://pgda.gsfc.nasa.gov/products/69), 60 m, from the old LDEM_85S_060M.
- **Period:** hourly average over a full ~18.6-year cycle (product page). The 2009–2013 dates in its label are the LOLA data span, not the simulation period (we had this wrong before 2026-11-14).
- **Metric:** the label says "percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)". The product page doesn't define it, so we report both metrics.

| Site | Any part, 4 yr (2009–13) | Any part, 18.6 yr | Mean disc fraction, 18.6 yr | Umar (any part, 5 min, 2009–13) | NASA pixel |
|---|---|---|---|---|---|
| Site01 | 87.8% | 87.3% | 82.3% | 87.8% | 68.5% |
| Site04 | 78.6% | 78.4% | 73.0% | 78.5% | 67.2% |
| Site07 | 82.2% | 81.9% | 78.3% | 82.1% | 86.0% |
| Site11 | 85.1% | 84.7% | 81.1% | 85.1% | 70.2% |

- Our independent run (real SPICE, hourly, our horizons) reproduces Umar's numbers to ≤ 0.1 pt. **No calculation error found.**
- Period (4 vs 18.6 years) changes ≤ 1 pt. Metric (any part vs mean fraction) changes 3.6–5.4 pts. Neither closes the gap at Site01/04/11.
- So the difference is in the **terrain**: our 5 m DEM + 1 m observer vs NASA's 60 m DEM. Barker et al. 2021 (the paper behind the 5 m DEMs) show the old DEM predicts less light than the new one. Site07 agrees with NASA; Site01 and Site11 remain 15–19 pts brighter, Site04 is within NASA's ±120 m range.

## Suggested additions to the submission wording

- "Horizon profiles carry a 0.02–0.24° (median) uncertainty from the published height error of the 5 m LOLA DEMs (Barker et al. 2021)."
- "Sun and Earth directions were verified against JPL Horizons at all four sites (≤ 0.00002°)."
- "Long-term sunlight agrees with NASA's 60 m illumination map at Site07; at the other sites our higher-resolution terrain gives more light, consistent with Barker et al. 2021. We list this as an open validation item."

## Re-run

From the repo root, with the pipeline kernels in `data/kernels` (`python -c "from scientific.ephemeris.spice import fetch_kernels; fetch_kernels('data/kernels')"`):
- `python terrain/scripts/check_pipeline_spice.py` (no network, ~1 s)
- `python terrain/scripts/sun_visibility_periods.py` (~20 s)
- `python terrain/scripts/download_data.py incerteza` then `python terrain/scripts/horizon_uncertainty.py`
