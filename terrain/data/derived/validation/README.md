# Check of Umar's ephemeris exports (2026-11-08)

`umar_check.json`, made by `scripts/check_umar.py`, from Umar's `ephemeris_siteXX_exports` (Nov 14 – Dec 14 2026, 5 min).

## Results, all 4 sites
- `observer_position_xyz_m` = our `observer_xyz_m`, exactly. Frame MOON_ME_DE421, CN+S, refloc OBSERVER.
- Az/el recomputed from the NPZ vectors with our local frame (radial up, 0 = N, 90 = E) = the CSV, to 1e-13°.
- The terrain horizon in the CSV = our `site_XX.json` at the same azimuth (periodic interpolation), Δ = 0. The 48 h "centre above horizon" flags: 0 mismatches.
- **Independent check against JPL Horizons** (DE441, Site01, 2026-11-14 00:00 / 12:00, 11-15 00:00 UTC): Sun and Earth az/el agree with the CSV to ≤ 0.00001°.

## What the month looks like (Nov 14 – Dec 14 2026)
| Site | Sun elevation (deg) | Sun centre above horizon | ≥ 80% of the disc | Earth centre above horizon |
|---|---|---|---|---|
| Site01 | 0.99 to 2.00 | 100% | 100% | 46.9% |
| Site04 | 1.29 to 1.68 | 99.9% | 98.3% | 37.3% |
| Site07 | 0.29 to 2.75 | 100% | 100% | 42.2% |
| Site11 | 0.07 to 2.81 | 100% | 100% | 48.9% |

The disc fraction is a linear approximation (Sun radius ≈ 0.267°), only a sanity check; the official metric is Zarina's `analyze`.

This month is southern summer on the Moon: the Sun sits ~1.5° above the horizontal at the pole and only swings by the site's co-latitude (0.5–1.3°). So ~100% sunlight is expected here, and it isn't representative of a whole year.

## NASA PGDA average-illumination maps (60 m, 2009-07 to 2013-07, any part of the disc)
| Site | Sun: pixel (3×3 min–max) | Earth: pixel (3×3 min–max) |
|---|---|---|
| Site01 | 0.68 (0.45–0.86) | 0.57 (0.51–0.58) |
| Site04 | 0.67 (0.43–0.76) | 0.47 (0.37–0.51) |
| Site07 | 0.86 (0.17–0.86) | 0.56 (0.44–0.56) |
| Site11 | 0.70 (0.38–0.83) | 0.61 (0.27–0.61) |

These are 4-year averages, so they can't be compared directly with one summer month. The fair comparison is a multi-year run with the same horizon: ideally Umar's vectors over 2009-07..2013-07, or at least a full year. The 3×3 spread shows that 60 m pixels mix very different terrain around these ~100 m sites. Map orientation was checked on the Shackleton floor (value 0, permanent shadow).
# Umar's 4-year run vs NASA PGDA maps (2026-11-11)

`umar_4y_vs_pgda.json`, made by `scripts/compare_umar_4y.py`, from Umar's `four_year_visibility_results` (2009-07-01 to 2013-07-01, same period as the NASA maps).

The NASA map counts the % of time *any part* of the disc is visible. Umar's summary gives the *mean visible disc fraction*, a different metric, so the "any part" column below comes from his daily file (00:00 UTC, 1462 samples per site; its mean disc fraction matches his 5-min summary to 0.01 pt).

| Site | Umar mean disc | Umar any part | NASA Sun any part: pixel (3×3) | Umar Earth centre | NASA Earth any part: pixel (3×3) |
|---|---|---|---|---|---|
| Site01 | 82.7% | 92.1% | 68.5% (45–86) | 55.0% | 57.5% (51–58) |
| Site04 | 73.3% | 86.7% | 67.2% (43–76) | 46.0% | 46.9% (37–51) |
| Site07 | 78.5% | 84.7% | 86.0% (17–86) | 51.7% | 56.5% (44–57) |
| Site11 | 81.4% | 89.5% | 70.2% (38–83) | 58.2% | 61.1% (27–61) |

- Earth agrees: Umar's centre-visible is 1–5 pts under NASA's any-part on all sites, as expected.
- Sun: Site07 agrees; Site01/04/11 are 17–24 pts above NASA, above even the 3×3 max. Site01 (92.1%) is above the maximum of the whole NASA map (88.4%, DERIVED_MAXIMUM in the .LBL). Open question: our 5 m DEM + 1 m observer vs NASA's 60 m DEM explains part of it at most; Zarina's `analyze` cross-check is pending.

# Umar's 5-minute "any part of the Sun" vs NASA PGDA map (2026-11-14)

`umar_5min_vs_pgda.json`, made by `scripts/compare_umar_5min.py`. Umar recomputed "any part of the Sun visible" over the full 5-minute series (2009-07..2013-07, terrain only, preliminary, message of 2026-11-14) instead of the daily 00:00 UTC samples. NASA map: `AVGVISIB_85S_060M_201608` (Sun, any part of the disc, 60 m, from LDEM_85S_060M), read at the same coordinates as our horizons (centroid of the largest RoI).

| Site | Umar 5 min | Umar daily (11/11) | NASA pixel | NASA bilinear | NASA 3×3 max | NASA 5×5 max | NASA max over the site's RoI centroids | Umar − NASA pixel |
|---|---|---|---|---|---|---|---|---|
| Site01 | 87.8% | 92.1% | 68.5% | 67.1% | 86.4% | 86.4% | 86.3% | +19.3 pts |
| Site04 | 78.5% | 86.7% | 67.2% | 66.8% | 76.0% | 81.6% | 80.2% | +11.3 pts |
| Site07 | 82.1% | 84.7% | 86.0% | 83.7% | 86.0% | 86.0% | 86.0% | −3.9 pts |
| Site11 | 85.1% | 89.5% | 70.2% | 72.2% | 82.7% | 82.7% | 70.2% | +14.8 pts |

- The 5-min series brings Umar's numbers down 3–8 pts (the 00:00 samples were biased high), so the gap shrinks from 17–24 to 11–19 pts, but it does not close.
- Site07 agrees (within the pixel/bilinear range). Site04 is above the 3×3 max but inside the 5×5 (±120 m) range. Site01 and Site11 are still above every NASA value within ±120 m and at every RoI centroid of the site.
- Site01 (87.8%) is now below the whole-map maximum (88.4%), so it is no longer physically "impossible" for the map, just much brighter than the map says at that spot.
- The site points fall 2–20 m from the nearest pixel centre, so pixel choice is not the issue.
- Still open: our 5 m DEM + 1 m observer vs NASA's 60 m DEM (observer height of the map not checked) explains part of it at most; Zarina's `analyze` cross-check is pending.

# Horizon uncertainty from the DEM's vertical error (2026-11-14)

`horizon_uncertainty.json`, made by `scripts/horizon_uncertainty.py`. Height errors come from NASA's own per-pixel error maps for the 5 m DEMs (`SiteXX_final_adj_5mpp_toterr.tif`, "Total Z uncertainty in meters (formally, the RMS error)", https://pgda.gsfc.nasa.gov/products/78), described in Barker et al. 2021, *Planet. Space Sci.* 203, 105119 (median RMS height error ~0.30–0.50 m inside the RoIs). For each azimuth, the error at the blocker point and at the observer is turned into an angle: σ_h ≈ √(σ_blocker² + σ_observer²) / d (small angle, independent errors).

| Site | σ_z at the site | Azimuths with blocker in the 5 m tile | σ_z at those blockers (median) | σ_h, blocker ≥ 100 m away (median / p95) | Blocker < 100 m away (share of azimuths) |
|---|---|---|---|---|---|
| Site01 | 0.27 m | 56% | 0.23 m | 0.044° / 0.20° | 36% |
| Site04 | 0.56 m | 48% | 0.36 m | 0.020° / 0.47° | 27% |
| Site07 | 0.37 m | 70% | 0.20 m | 0.17° / 0.23° | 36% |
| Site11 | 0.55 m | 39% | 0.25 m | 0.24° / 0.37° | 15% |

- The shares of blockers in the 5 m tile match MaKenna's numbers (56 / 48 / 70 / 38%).
- **The DEM's height error is the largest error in the horizon**: hundredths to tenths of a degree, against ≤ 0.01° from the azimuth/distance sampling (convergence checks). With the Sun only a few degrees above the horizon at the pole, that is hours in event times.
- Blockers closer than 100 m (15–36% of azimuths) give σ_h of 0.4–2° with this formula, but there the blocker and the observer share the same interpolation error, so the formula overstates them. These near blockers sit mostly below the horizontal (median horizon −0.3 to −1.7°).
- Far blockers (80/240 m mosaics, 46–85 km median distance) have no published error map. Sensitivity: 0.0007–0.002° per metre of height error.
- Barker et al. 2021 also show the errors bias the horizon **up** on average (one positive bump along the ray is enough), so illumination with errors is usually worse than nominal. This RMS estimate is symmetric and does not include that bias. A proper propagation would rerun the horizon on NASA's 100 error "clones" per site (also on product 78).
- Barker et al. 2021, Table 2: at Site01, 1 m above the surface, 2024–2026, the 1st percentile of the RoI-averaged mean illumination over the 100 clones is 67–71% (our point is in their RoI 4: 69.6%). That is NASA's own number with the same 5 m DEM and the same 1 m height, and it is close to the RoI definition (> 70%).
