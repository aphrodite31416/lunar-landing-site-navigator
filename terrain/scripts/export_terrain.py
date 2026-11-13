"""Exporta o terreno de um sítio para o 3D (Esha): heightmap PNG 16 bits, hillshade PNG 8 bits e JSON.

Spec: docs/research/roteiro-horizonte.md §7.

Uso:
    .venv/Scripts/python scripts/export_terrain.py Site01 -89.464 -137.87 "Connecting ridge (Site01)"
"""
import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from scipy.ndimage import map_coordinates

R_M = 1737400.0
ROOT = Path(__file__).resolve().parent.parent
OUT_PX = 1024
HILLSHADE_AZ = 315.0
HILLSHADE_ALT = 45.0


def latlon_to_xy(lat_deg, lon_deg):
    """Estereográfica polar sul em esfera (relatorio.md A.3)."""
    rho = 2 * R_M * math.tan(math.radians(90 + lat_deg) / 2)
    lon = math.radians(lon_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def hillshade(z, cell_m, az_deg, alt_deg):
    """Relevo sombreado: produto escalar da normal com a direção da luz.

    Linha 0 = maior y, então dz/dy (para o norte da grade) = -gradiente nas linhas.
    """
    dz_drow, dz_dcol = np.gradient(z, cell_m)
    dzdx, dzdy = dz_dcol, -dz_drow
    norm = np.sqrt(dzdx**2 + dzdy**2 + 1.0)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    light = (math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt))
    shade = (-dzdx * light[0] - dzdy * light[1] + light[2]) / norm
    return np.clip(np.round(np.clip(shade, 0, 1) * 255), 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site")          # ex.: Site01
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float)
    ap.add_argument("name")
    a = ap.parse_args()

    site_id = a.site.lower()                     # site01
    stem = f"site_{a.site[-2:]}"                 # site_01
    src = ROOT / "data" / "raw" / f"{a.site}_final_adj_5mpp_surf.tif"
    out = ROOT / "data" / "derived" / "terrain"
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(src) as ds:
        full = ds.read(1)
        b = ds.bounds
        res = ds.res[0]
        small = ds.read(1, out_shape=(OUT_PX, OUT_PX), resampling=Resampling.average)

    if np.isnan(small).any():
        raise SystemExit("NaN no recorte: implementar nodata_dn = 0 antes de exportar")

    width_m = b.right - b.left
    pixel_m = width_m / OUT_PX
    zmin, zmax = float(small.min()), float(small.max())
    dn = np.round((small - zmin) / (zmax - zmin) * 65535).astype(np.uint16)
    Image.fromarray(dn).save(out / f"{stem}_height.png")
    Image.fromarray(hillshade(small.astype(np.float64), pixel_m, HILLSHADE_AZ, HILLSHADE_ALT)).save(
        out / f"{stem}_hillshade.png")

    # Sítio: posição na grade, elevação bilinear no 5 m original (centro de pixel em +0,5)
    x, y = latlon_to_xy(a.lat, a.lon)
    col5, row5 = (x - b.left) / res - 0.5, (b.top - y) / res - 0.5
    z0 = float(map_coordinates(full, [[row5], [col5]], order=1)[0])
    cx, cy = (b.left + b.right) / 2, (b.bottom + b.top) / 2
    px = ((x - b.left) / pixel_m, (b.top - y) / pixel_m)
    pole_px = ((0 - b.left) / pixel_m, (b.top - 0) / pixel_m)

    meta = {
        "schema_version": 1,
        "site_id": site_id, "name": a.name,
        "height_png": f"{stem}_height.png", "hillshade_png": f"{stem}_hillshade.png",
        "width_px": OUT_PX, "height_px": OUT_PX, "pixel_m": pixel_m,
        "width_m": width_m, "height_m": b.top - b.bottom,
        "crs": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400",
        "x_range_m": [b.left, b.right], "y_range_m": [b.bottom, b.top],
        "center_xy_m": [cx, cy],
        "row0": "top = max y",
        "pixel_origin": "corner of the top-left pixel (pixel centres at +0.5)",
        "elevation": {
            "units": "m",
            "reference": "height above the 1737.4 km sphere",
            "png_bits": 16,
            "zmin_m": round(zmin, 3), "zmax_m": round(zmax, 3),
            "decode": "z = zmin_m + DN / 65535 * (zmax_m - zmin_m)",
            "nodata_dn": None,
            "nodata_rule": "if not null, DN = nodata_dn means no data and valid DN run 1..65535",
        },
        "north": {
            "rule": "local north points away from the pole; clockwise angle from image up = longitude",
            "pole_px": [round(pole_px[0], 3), round(pole_px[1], 3)],
            "north_at_site_deg": round(math.degrees(math.atan2(x, y)), 3),
        },
        "site": {
            "lat_deg": a.lat, "lon_deg": a.lon,
            "xy_m": [round(x, 1), round(y, 1)],
            "px": [round(px[0], 3), round(px[1], 3)],
            "scene_xyz_m": [round(x - cx, 1), round(z0, 2), round(-(y - cy), 1)],
            "ground_elevation_m": round(z0, 2),
        },
        "scene": {"up": "Y", "x": "x - center_x", "y": "z", "z": "-(y - center_y)"},
        "vertical_exaggeration_in_data": 1,
        "visual_only": ["hillshade_png"],
        "hillshade": {"sun_azimuth_deg": HILLSHADE_AZ, "sun_altitude_deg": HILLSHADE_ALT,
                      "note": "synthetic light for texture, not the real Sun"},
        "source": f"LOLA 5 m, PGDA {src.name}, resampled 3200 -> {OUT_PX} by mean",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (out / f"{stem}_terrain.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
