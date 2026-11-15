# Scientific Validation: Limitations and Concerns

Lunar Landing Site Navigator, NASA Space Apps Challenge. Prepared by the scientific validation role, covering the terrain-aware sunlight and Earth-visibility calculations.

## Summary

Lucas, Umar and Zarina did a terrific job. The core geometry is correct. I re-derived the key numbers by hand (the 2 m smooth-sphere horizon dip, the offset-disc fraction, the 20-minute crossing example, the ENU example, and the −0.06144° smooth-sphere check at 1 m), and all of them agree with the code. The SPICE setup uses a matched kernel set (DE421 with `MOON_ME_DE421`) and the correct `spkcpo` arguments. The horizon scan converges: Site01 changes by at most 0.0051° when azimuth sampling is halved and 0.0013° when distance steps are halved, against a 0.01° target. Lucas has since rerun the checks on all four sites, and all four released profiles pass. Site04's first profile (0.05° rays) had 2 of 7,200 azimuths at 0.0104°, so it was recomputed with 0.025° rays and half the distance steps; the refined, deployed profile changes by at most 0.0064° (azimuth) and 0.0058° (distance). The formula audit (154 equations mapped to code and tests) is unusually thorough. The items below are the honest limits of the model, not errors in it.

## Verification results (Lucas, 2026-11-14)

Lucas's checks confirm the calculations and show that the main uncertainty is terrain height error, not sampling. Details: `terrain/data/derived/validation/README.md` and `terrain/data/derived/horizons/README.md`.

| Check | Result | Files |
| --- | --- | --- |
| Horizon convergence, all four sites | All four released profiles pass the 0.01° target. Site04 was recomputed with 0.025° rays and half the distance steps (max changes 0.0064° azimuth, 0.0058° distance); its first 0.05° profile had 2 of 7,200 azimuths at 0.0104°. Each check records the hash of the profile it tested, which matches the deployed horizon | `terrain/data/derived/horizons/site_XX_checks.json` |
| Pipeline SPICE vs JPL Horizons | Maximum difference 0.000011° for Sun and Earth (5 epochs, 40 comparisons, all four sites), using the pipeline's own functions and real DE421 kernels; also rules out an azimuth-convention mix-up | `terrain/scripts/check_pipeline_spice.py`, `terrain/scripts/check_spice_vs_horizons.py` |
| Horizon uncertainty from DEM height error | 0.02–0.24° (median) for blockers at least 100 m away, from the published per-pixel height error of the 5 m DEMs (Barker et al. 2021, RMS about 0.3–0.5 m). Largest error in the horizon; worth hours in event times | `terrain/scripts/horizon_uncertainty.py` |
| Independent rerun of long-term sunlight | Real SPICE, hourly, our horizons: matches Umar's 5-minute results to within 0.1 percentage point; no calculation error found | `terrain/scripts/sun_visibility_periods.py`, `terrain/scripts/compare_umar_5min.py` |

## Sunlight versus NASA's illumination map

Our long-term sunlight agrees with NASA's map at Site07 but is 15–19 points higher at Sites 01 and 11. Site04 is 11 points higher but within NASA's ±120 m range. NASA's map is `AVGVISIB_85S_060M_201608` ([product page](https://pgda.gsfc.nasa.gov/products/69)): 60 m resolution, hourly average over about 18.6 years. Its label counts timesteps where any part of the solar disc is visible, which matches our any-part metric. The 2009–2013 dates in the label are the LOLA data span, not the simulation period.

| Site | Any part, 4 yr (2009–13) | Any part, 18.6 yr | Mean disc fraction, 18.6 yr | Umar (any part, 5 min, 2009–13) | NASA pixel |
| --- | --- | --- | --- | --- | --- |
| Site01 | 87.8% | 87.3% | 82.3% | 87.8% | 68.5% |
| Site04 | 78.6% | 78.4% | 73.0% | 78.5% | 67.2% |
| Site07 | 82.2% | 81.9% | 78.3% | 82.1% | 86.0% |
| Site11 | 85.1% | 84.7% | 81.1% | 85.1% | 70.2% |

Period (4 vs 18.6 years) moves our result by 1 point or less, and the metric (any part vs mean fraction) by 3.6–5.4 points, so neither closes the gap. Lucas attributes it to terrain: our 5 m DEM with a 1 m observer versus NASA's 60 m DEM, consistent with Barker et al. 2021, who show that the older DEM predicts less light than the new one. This explanation has not been tested directly yet (see open items at the end).

## 1. Terrain data (DEM)

- **Resolution varies by distance.** Elevations come from a 5 m tile near each site, an 80 m mosaic, then a 240 m mosaic, blended across seams. Coarse grids with bilinear interpolation round off narrow ridge tops, so far-field horizons are probably slightly low (optimistic: more light, more Earth visibility). Only 38% of Site11's blockers fall inside the 5 m tile, versus about 56% at Site01, 48% at Site04 and 70% at Site07. Site11 is therefore the least certain. *Files:* `terrain/scripts/dem_reader.py`, `terrain/scripts/horizon.py`.
- **DEM height error adds 0.02–0.24° of horizon uncertainty.** The horizon margin (`margin_deg`) defaults to 0°, so the headline results do not include DEM uncertainty. Lucas propagated the published per-pixel height error of the 5 m DEMs (Barker et al. 2021, RMS about 0.3–0.5 m) into a horizon uncertainty of 0.02–0.24° (median) for blockers at least 100 m away. That is the largest error in the horizon and is worth hours in event times. *Files:* `scientific/inputs.py` (`Horizon.shifted`), `scientific/mini_model.py` (`elevation_uncertainty`).
- **Seam blending is synthetic.** Heights inside blend zones are mixtures of two DEMs, not measurements. The horizon files report that no blocker falls in a transition zone at any site. *Files:* `terrain/scripts/dem_reader.py`, `terrain/scripts/horizon.py`.
- **Each site is a single point** (the centroid of the largest region of interest). Horizons change quickly near ridges, so results apply to that point, not the whole region. *File:* `terrain/scripts/horizon.py`.

## 2. Horizon computation

- **Finite sampling.** The scan uses 0.05° azimuth steps (about 13 m at 15 km range, about 380 m at 440 km) and distance steps of 2.5 m, 40 m and 120 m, with peak refinement; Site04 uses 0.025° steps and half the distance steps (1.25 m, 20 m and 60 m). Narrow distant peaks can still slip between rays. All four released profiles pass the 0.01° convergence target (largest change 0.0064°, at Site04). Site04's first profile, at 0.05°, had 2 of 7,200 azimuths at 0.0104° and was replaced by the refined profile. *Files:* `terrain/scripts/horizon.py`, `terrain/data/derived/horizons/site_XX_checks.json`.
- **Observer height is 1 m**, while the README examples use 2 m, and `observer_height_m` is `null` in the site manifest. The team lead has decided to keep 1 m (the choice in the architecture doc). Barker et al. 2021 show that 1 m versus 5 m changes the predicted light a lot, so the submission should state that results apply to a 1 m observer and would change for a taller lander or panel. *Files:* `terrain/scripts/horizon.py`, `data/processed/sites.json`.
- **"Up" is the radial direction**, with no local slope or tilt, so a lander on a slope would see a different horizon. *Files:* `scientific/mini_model.py` (`local_basis`), `terrain/scripts/horizon.py`.
- **Spherical reference.** The Moon is modeled as a sphere of radius 1,737,400 m with DEM heights added. Scan range (about 458–461 km) is set from global LOLA elevation extremes with a 100 m margin; the farthest actual blocker is 121–199 km away, so the margin is large. *File:* `terrain/scripts/horizon.py`.

## 3. Ephemeris and time

- **DEM and ephemeris frames must match.** Both use `MOON_ME_DE421`, enforced in the loader. The loader check is a label match, but the Horizons comparison confirms the azimuth convention. *Files:* `scientific/inputs.py`, `scientific/ephemeris/spice.py`.
- **DE421 is an older ephemeris** (the kernels cover about 1900–2050). It is consistent with the lunar orientation kernel, but DE440 is newer. *File:* `scientific/ephemeris/spice.py`.
- **Real SPICE verified against JPL Horizons.** The audit tests SPICE only with a stub, but Lucas ran the pipeline's own functions with the real DE421 kernels against JPL Horizons at all four sites: the maximum difference is 0.000011° (5 epochs, 40 comparisons). Horizons validates the Sun and Earth directions, not the terrain. *Files:* `scientific/ephemeris/spice.py`, `scientific/mini_model.py` (`body_vector_from_spice`).
- **Kernel hashes are not recorded** in the position export. Input file hashes are. *Files:* `scientific/ephemeris/positions.py`, `scientific/analysis.py`.

## 4. Sunlight model

- **"Sunlight" means at least 80% of the solar disc visible** (default threshold 0.8), not any light. Results at 0.5 and "any light" should be reported alongside. *File:* `scientific/analysis.py` (`Settings.minimum_sun_fraction`).
- **The Sun is a uniform disc**, sampled with 512 points by default (1,024 elsewhere). There is no limb darkening, so the visible fraction is an area fraction, not a power fraction. *Files:* `scientific/analysis.py`, `scientific/mini_model.py` (`disc_sample_directions`).
- **Darkness includes Earth eclipses of the Sun.** The visible fraction combines terrain shadow and Earth occultation, so the two are mixed unless `terrain_fraction` is used separately. Earth is modeled as an opaque sphere with no atmosphere. *Files:* `scientific/mini_model.py` (`solar_visibility`), `scientific/analysis.py`.
- **Sunrise and sunset times are very sensitive at these sites.** All four sites are within about 1.4° of the South Pole, where the Sun stays within a few degrees of the horizon and moves slowly. A horizon error of only 0.01° can shift an event by an hour or more, so the 0.02–0.24° height uncertainty is worth hours. The 1-second event tolerance is numerical, not physical accuracy. *File:* `scientific/analysis.py` (`Settings.event_tolerance_s`).
- **Short events can be missed.** The search subdivides to at most 300 s steps. Shadows or lit periods shorter than that may not be detected. *File:* `scientific/analysis.py` (`search_grid`).
- **Energy and mean fractions use trapezoids** on the sampled grid, while window boundaries are refined, a small inconsistency. *File:* `scientific/mini_model.py` (`time_integral`).

## 5. Earth visibility

- **Visibility is tested at Earth's center only** (the exported criterion is `centre_strictly_above_terrain`). Earth is about 1.9° wide, so partial visibility near the horizon counts as not visible. It is geometric line of sight, not a radio link budget. *Files:* `scientific/analysis.py`, `scientific/mini_model.py`.
- **Libration is included implicitly** through the ephemeris, so Earth's elevation wobbles as it should, but it has not been compared against an independent source. *File:* `scientific/ephemeris/positions.py`.

## 6. Scope of the analysis

- **One month only.** The scenario is November 2026. Polar illumination follows a cycle of about 347 days (the Moon's axial tilt is only 1.54°), and a longer nodal cycle of about 18.6 years, so one month is not representative of year-round conditions. Lucas's long-term runs (4 and 18.6 years, any-part sunlight) differ by 1 point or less, so the sunlight fraction is stable over time; no long-term Earth-visibility result has been reported. *File:* `data/processed/scenarios/monthly-2026-11/`.
- **Four sites only**, all near the South Pole, so results do not generalize to other latitudes. *File:* `data/processed/sites.json`.
- **Slope, roughness, boulders, temperature, dust, and radiation are not modeled.** The panel model is flat, with constant efficiency, no terrain-reflected light, no dust or temperature losses. *Files:* `scientific/analysis.py` (`Panel`), `scientific/mini_model.py` (`panel_power`).

## 7. Verification gaps

- The audit proves code matches the documented equations. It is not a proof of physical accuracy, and it says so itself. *File:* `scientific/FORMULA_AUDIT.md`.
- Convergence checks now exist for all four sites and test sampling only, not DEM error; they run with `--checks`. *File:* `terrain/scripts/horizon.py`.
- Sunlight was compared with NASA's 60 m illumination map: it agrees at Site07 but is 15–19 points higher at Sites 01 and 11 (Site04 is within NASA's ±120 m range), and the terrain explanation is untested. Published Shackleton rim studies have not been compared.
- Items marked above as needing a figure (event-time uncertainty in hours) should be filled in before final submission.

## Remaining open items

1. Test the NASA gap directly: rerun Sites 01, 04, and 11 with the 80 m DEM only and a 0 m observer height. If the result moves toward NASA's value, the terrain explanation is confirmed.
2. Apply the horizon uncertainty: rerun the sunlight analysis with the horizon shifted by 0.02° and 0.24° in both directions (`Horizon.shifted` in `scientific/inputs.py`), and report the range of sunlight fraction per site. Check whether NASA's value falls inside it.
3. Write the chosen 1 m into `observer_height_m` in `data/processed/sites.json`, which is currently `null`.
4. Report sunlight at thresholds of 0.5, 0.8, and any light, and rename the 80% metric so it is not read as any-light (`scientific/analysis.py`).
5. Rerun with a 60 s search step to confirm that short events are not missed (`scientific/analysis.py`).
6. Separate Earth eclipses from terrain shadow using `terrain_fraction` wherever darkness is reported.
7. Record kernel hashes and DEM names in the scenario output.

## Suggested wording for the final submission

"Illumination and Earth-visibility results are geometric estimates from a spherical-Moon model with LOLA-derived terrain at 5 m to 240 m resolution, an observer height of 1 m, and the Sun modeled as a disc. Horizon profiles carry a 0.02–0.24° (median) uncertainty from the published height error of the 5 m DEMs (Barker et al. 2021); near the pole this is worth hours in sunrise and sunset times. Sun and Earth directions were verified against JPL Horizons at all four sites (maximum difference 0.000011°). Long-term sunlight agrees with NASA's 60 m illumination map at Site07; at Sites 01 and 11 our higher-resolution terrain gives more light (15–19 points), while Site04 is within NASA's ±120 m range, consistent with the finer terrain, and we list this as an open validation item. Earth visibility is center-point line of sight, not a link budget. Slope, dust, thermal effects, and terrain-reflected light are not modeled."
