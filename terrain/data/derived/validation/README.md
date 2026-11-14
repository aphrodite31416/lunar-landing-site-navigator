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
