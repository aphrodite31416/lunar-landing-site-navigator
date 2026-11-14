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
