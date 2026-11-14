# Outliers: lunar terrain and horizons (NASA Space Apps 2026, Lunar Landing Site Navigator)

Terrain side of the project. It covers the LOLA DEM reader, terrain horizon profiles for the science pipeline, and 3D terrain for the web view.

This folder is self-contained: run every command below from `terrain/`. The scripts write to `terrain/data/derived/` and read the DEMs from `terrain/data/raw/` (not in git). After regenerating, copy the results to where the rest of the app reads them:
- `data/derived/horizons/site_XX.json` → `../data/input/horizons/` (input of `python -m scientific build`)
- `data/derived/terrain/site_XX_*` → `../data/terrain/` (3D terrain for the frontend)

| Path | For | What |
|---|---|---|
| `data/derived/horizons/` | Zarina, Umar | Horizon profiles h(A), schema v2, for Site01/04/07/11, plus plots. `site_01_checks.json` holds the convergence checks. |
| `data/derived/terrain/` | Esha | Heightmap: 16-bit PNG, 1024², real data. Hillshade: visual only. Plus a JSON per site. |
| `data/derived/validation/` | MaKenna, Umar | Check of Umar's ephemeris exports against our horizons and JPL Horizons. |
| `data/derived/rois.json` | everyone | Sunlit regions (RoIs) of each site and their centroids. |
| `scripts/` | anyone re-running | Reader, horizon, terrain, checks. |

## Landing points
We use the centroid of the largest PGDA sunlit region (RoI, mean illumination > 70%, Barker et al. 2021) of each site. The centre of the RoI bounding box falls outside the RoIs.

| Site | lat (deg) | lon (deg) | ground z (m) |
|---|---|---|---|
| Site01 Connecting ridge | −89.45270 | −137.1523 | 1956.38 |
| Site04 Shackleton rim | −89.76205 | −157.0750 | 1729.34 |
| Site07 Peak near Shackleton | −88.80737 | 123.7767 | 1648.36 |
| Site11 de Gerlache rim | −88.66832 | −68.3754 | 1814.19 |

## Setup
```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Python 3.12 (numpy 1.26.4)
.venv/Scripts/python scripts/download_data.py      # 6 LOLA DEMs from NASA PGDA, ~570 MB -> data/raw/
```
The DEMs are not in git. The two mosaics are 189 and 219 MB, over GitHub's 100 MB limit. The RoI shapefiles (`data/raw/rois/`) are small and included.

## Scripts
- `dem_reader.py`: `make_elevation_at()` returns `elevation_at(lat_rad, lon_rad)`. That is the radial elevation in metres above R = 1 737 400 m, from the finest valid DEM (5 m → 80 m → 240 m), blended across seams, NaN outside coverage. Tests: `test_dem_reader.py`.
- `horizon.py`: `python scripts/horizon.py Site01 -89.45270 -137.1523 "Connecting ridge (Site01, largest RoI)" [--checks]`. About 1 min per site. Run one site at a time (memory).
- `export_terrain.py`: `python scripts/export_terrain.py Site01 -89.45270 -137.1523 "Connecting ridge (Site01)"`.
- `rois.py`: reads the RoI shapefiles and writes `data/derived/rois.json`.
- `check_bounds_seams.py`: sensitivity of the coverage bounds and statistics of the DEM seams.
- `check_umar.py`: checks Umar's exports. It expects them in `entrada/umar/` and the PGDA illumination maps in `data/raw/validacao/` (not in git).

## Horizon method (short)
- Rays follow great circles. The elevation angle uses the exact formula from Zarina's README §8.3: β = atan2(r·cosψ − r_o, r·sinψ).
- Search limit: Zarina's §9.1, with r_min = R − 9229 m and r_max = R + 10 892 m. Those are the global LOLA extremes (Smith et al. 2017, Icarus 283) plus 100 m.
- Steps: 2.5 m out to 15 km, 40 m out to 300 km, then 120 m. The peaks along each ray are refined.
- Convergence passes 0.01° on all four supplied profiles; the check files include their horizon hashes. Site04 uses 0.025° rays and half the default distance steps (1.25 / 20 / 60 m), checked again at half those spacings: max 0.0064° in azimuth and 0.0058° in distance. Other sites retain 0.05° rays and the default distance steps. See `data/derived/horizons/README.md` for all results.
