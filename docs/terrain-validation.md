# Terrain and validation findings (Lucas, 2026-11-14)

Answers to the terrain, Sun-visibility and SPICE items of MaKenna's review, with integration corrections added after Lucas's checks. Updated profiles feed `scientific/`; the frontend receives regenerated scenarios and corrected observer metadata through the existing TypeScript interfaces and JSON contract. Validation reports remain separate from the frontend interface. Details: `terrain/data/derived/validation/README.md`, `terrain/data/derived/horizons/README.md`, and `docs/data-contract.md`.

## Status of the review items

| Review item | Status | Result | Files |
|---|---|---|---|
| Convergence checks only for Site01 | **Done, all 4 sites pass** | Site04 was recomputed with 0.025° rays and half the original distance steps: max changes 0.0064° (azimuth) and 0.0058° (distance). All four checks now pass 0.01° and record the checked profile hash. | `terrain/data/derived/horizons/site_XX_checks.json` |
| DEM vertical accuracy not propagated | **Partial estimate; full propagation open** | The independent-error estimate gives site medians of **0.02–0.24°** only for blockers inside the 5 m error map and ≥100 m away (about 19–34% of azimuths). It is not a bound for the whole horizon or an event-time confidence interval. | `terrain/scripts/horizon_uncertainty.py`, `.../validation/horizon_uncertainty.json` |
| No real-SPICE test | **Done, all 4 sites** | The pipeline's own `body_vector_from_spice` + `local_basis` + `azimuth_elevation`, with the real DE421 kernels, vs JPL Horizons: max **0.000011°** (Sun and Earth, 5 epochs, 40 comparisons). Also rules out an azimuth-convention mix-up. | `terrain/scripts/check_pipeline_spice.py`, `check_spice_vs_horizons.py`, `.../validation/spice_vs_horizons.json` |
| Compare with NASA illumination maps | **Done, gap explained in part** | See below. | `terrain/scripts/sun_visibility_periods.py`, `compare_umar_5min.py` |
| Observer height (1 m) | **Export corrected** | The horizon's 1 m radial height now reaches the site manifest and scenarios; it is checked against the observer XYZ and 3D terrain marker. It remains a model assumption until a lander or antenna height is specified. | `scientific/export.py`, `scientific/inputs.py` |

The frontend release covers 2026-11-14 through 2026-12-14 UTC and retains the
existing 80% sunlight criterion and JSON structure. Mean fractions and optional
energy include samples bracketing refined event boundaries. Threshold comparisons,
±0.01° sensitivity experiments and convergence results are validation artifacts;
they do not add frontend features. Physical event-time confidence bounds remain
unquantified. `validate-frontend` checks all four sites before `sync-frontend`
copies a ready dataset. The horizon export now preserves the input bytes, so
the recorded horizon hash also matches the file delivered to the frontend.

## Sun visibility vs NASA's map

The long-term tables below describe Lucas's original 0.05° horizon experiment;
the current frontend's monthly scenarios use the profiles identified by their
own hashes. These long-term comparisons remain validation context, not the
frontend's monthly values.

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
- Terrain resolution and observer height are plausible remaining causes; they have not been isolated by a calculation with matched DEMs and heights. Site07 is closer to NASA but remains below both the nearest-pixel and bilinear estimates. The range across neighbouring pixels is spatial variability, not a confidence interval.

## Suggested additions to the submission wording

- "For nominal blockers within the 5 m error maps and at least 100 m away, site median angular error estimates are 0.02–0.24° under an independent-height-error approximation. These subsets cover about 19–34% of directions; full physical timing uncertainty remains unquantified."
- "Sun and Earth directions were verified against JPL Horizons at all four sites (≤ 0.00002°)."
- "Long-term sunlight differs from NASA's 60 m illumination map. Terrain resolution and observer height are candidate explanations; the comparison remains an open validation item."

## Re-run

From the repo root, with the pipeline kernels in `data/kernels` (`python -c "from scientific.ephemeris.spice import fetch_kernels; fetch_kernels('data/kernels')"`):
- `python terrain/scripts/check_pipeline_spice.py` (no network, ~1 s)
- `python terrain/scripts/sun_visibility_periods.py` (~20 s)
- `python terrain/scripts/download_data.py incerteza` then `python terrain/scripts/horizon_uncertainty.py`
