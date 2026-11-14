# Terrain horizon profiles (schema v2)

`site_01.json`, `site_04.json`, `site_07.json`, `site_11.json`: one per site.
Site04 uses 14,400 azimuths at 0.025°; the other sites use 7,200 at 0.05°.
Azimuth is 0 = local North, 90 = East, with no duplicate 360°; interpolate
periodically using `az_deg`, not an assumed fixed array length.

## What's in each file
- Site: `lat_deg`, `lon_deg` (planetocentric, lon east), `stereo_xy_m`, `ground_elevation_m` (z0, bilinear on the 5 m DEM), `observer_height_m` = 1 (radial), `observer_radius_m`, `observer_xyz_m` (metres, MOON_ME_DE421), `R_m` = 1737400.
- Per azimuth: `horizon_deg` (above the local horizontal plane, negatives kept), `valid`, `blocking_arc_distance_m` (arc on the surface, R·ψ), `blocker_lat_deg`, `blocker_lon_deg`, `blocker_elevation_m`.
- `coverage_status` = `complete` for all 4 sites (no `null`). If a future file says `incomplete`, stop instead of computing metrics.
- `coverage`: search limit from Zarina's README §9.1 with r_min = R − 9229 m and r_max = R + 10 892 m (global LOLA extremes −9.129 / +10.792 km, Smith et al. 2017, Icarus 283, 70–91, + 100 m margin; updated 2026-11-08, profiles unchanged). Limit = 458–461 km; the farthest blocker is at 121–199 km, so the margin is big.
- `diagnostics`: no blocker falls in a DEM seam transition zone at any site.

## Method
Great-circle rays from the site; elevation angle with Zarina's exact formula (README §8.3), β = atan2(r·cosψ − r_o, r·sinψ). Elevations from `elevation_at` (5 m tile → 80 m → 240 m, blended across seams). Distance steps: 2.5 m to 15 km, 40 m to 300 km, 120 m to the limit; Site04 uses half these steps (1.25 / 20 / 60 m). The 8 highest local maxima of each ray are re-sampled at step/10 and the best one at step/100 (the peak often sits on a kink of the bilinear surface between two samples).

## Original profile summary (before the refined Site04 release)
| Site | horizon min / max (deg) | farthest blocker (km) | blockers inside the 5 m tile |
|---|---|---|---|
| Site01 | −2.616 / +0.354 | 198.6 | 4003 of 7200 |
| Site04 | −2.554 / +1.299 | 120.9 | 3479 |
| Site07 | −2.535 / −0.276 | 161.9 | 5014 |
| Site11 | −3.574 / +0.339 | 166.5 | 2770 |

Current convergence checks on all 4 sites (`site_XX_checks.json`), criterion |Δh| ≤ 0.01°. Each file records the exact checked horizon SHA-256:

| Site | Half azimuth step: max / p99 | Azimuths above 0.01° | Half distance steps: max / p99 | Smooth sphere |
|---|---|---|---|---|
| Site01 | 0.0050° / 0.0013° | 0 | 0.0013° / 0.0006° | −0.06144° ✓ |
| Site04 | 0.0064° / 0.0009° | 0 | 0.0058° / 0.0005° | −0.06144° ✓ |
| Site07 | 0.0049° / 0.0014° | 0 | 0.0020° / 0.0002° | −0.06144° ✓ |
| Site11 | 0.0058° / 0.0015° | 0 | 0.0033° / 0.0003° | −0.06144° ✓ |

Site04's original 0.05° profile exceeded the target. Finer azimuths also exposed
an along-ray sampling discrepancy, so both sampling dimensions were refined.
The current checks pass in both dimensions. Convergence concerns the sampled
DEM surface; it does not bound missing terrain features or DEM height errors.

Re-run from the repo root:

```sh
python terrain/scripts/horizon.py Site01 -89.45270 -137.1523 "Connecting ridge (Site01, largest RoI)" --checks
python terrain/scripts/horizon.py Site04 -89.76205 -157.075 "Shackleton rim (Site04, largest RoI)" --az-step-deg 0.025 --distance-step-scale 0.5 --checks
```

`--no-plot` skips only the PNG preview. Repeat the default-step command for
Site07 and Site11 with their recorded coordinates. Copy the checked JSONs to
`data/input/horizons/` before rebuilding the frontend dataset.
