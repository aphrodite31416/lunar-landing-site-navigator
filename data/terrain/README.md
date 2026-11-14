# 3D terrain for the 4 sites (for R3F)

For each site XX = 01, 04, 07, 11:
- `site_XX_height.png`: **real data**. 16-bit grayscale, 1024 × 1024, LOLA 5 m resampled by mean, no exaggeration.
- `site_XX_hillshade.png`: **visual only**. 8-bit shaded relief for the texture. The light is synthetic (azimuth 315°, altitude 45°), not the real Sun.
- `site_XX_terrain.json`: metadata (same format for all 4).

Decode: `z = zmin_m + DN / 65535 * (zmax_m - zmin_m)` (metres above the 1737.4 km sphere). Row 0 = top of the image = max y. Pixel = 15.625 m, tile = 16 × 16 km. Rounding error from the 16 bits is at most 0.5 · (zmax − zmin) / 65535, i.e. 0.019–0.035 m. No NaN in any of the 4 tiles (`nodata_dn` = null).

Scene (Y-up): X = x − center_x, Y = z, Z = −(y − center_y). The landing point is `site.scene_xyz_m` / `site.px`:

| Site | landing px (col, row) | scene_xyz_m | zmin / zmax (m) |
|---|---|---|---|
| Site01 | (493.7, 522.7) | (−286.2, 1956.38, 167.7) | −520.7 / 1959.0 |
| Site04 | (396.1, 489.3) | (−1810.6, 1729.34, −354.5) | −2847.0 / 1804.1 |
| Site07 | (515.9, 518.8) | (61.4, 1648.36, 106.7) | −417.6 / 1648.5 |
| Site11 | (477.4, 519.6) | (−540.6, 1814.19, 118.0) | −804.7 / 1815.4 |

The landing points moved (centroid of the largest sunlit RoI instead of the RoI bounding box centre); see `terrain/README.md`.

North: near the pole it isn't a fixed direction on the image. It always points away from the pole (`north.pole_px`). For Site04 the pole is inside the image, at px (576, 64). At the landing point, north is `north.north_at_site_deg` clockwise from image up (= the longitude).
