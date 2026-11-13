"""Leitor de elevação LOLA para conferências: elevation_at(latitude_rad, longitude_rad).

Devolve a elevação radial do chão em metros acima da esfera R = 1 737 400 m (as alturas dos DEMs LOLA
do PGDA), no frame MOON_ME_DE421. Usa o DEM mais fino que tiver dado válido no ponto:
recortes de 5 m → mosaico 80 m (80–90°S) → mosaico 240 m (60–90°S). Fora de todos: NaN.

Interpolação bilinear. Os GeoTIFFs contam a partir do canto do pixel; map_coordinates usa o centro,
por isso o -0,5. Perto da borda de um DEM (menos de meio pixel), a bilinear sai NaN e o leitor cai
para o próximo DEM, nunca extrapola.

Uso:
    from dem_reader import make_elevation_at
    elevation_at = make_elevation_at()          # carrega os DEMs de data/raw (~0,5 GB em memória)
    z = elevation_at(np.radians(-89.464), np.radians(-137.87))   # ≈ 1934,7 m

Funciona com escalares ou arrays NumPy (mesma forma na entrada e na saída).
Para o build_sampled_horizon da Zarina, passe elevation_at direto.
"""
from pathlib import Path

import numpy as np
import rasterio
from scipy.ndimage import map_coordinates

R_M = 1737400.0
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
FINE_TILES = ["Site01", "Site04", "Site07", "Site11"]
MOSAICS = ["LDEM_80S_80MPP_ADJ.TIF", "LDEM_60S_240MPP_ADJ.TIF"]


class _Dem:
    def __init__(self, path):
        with rasterio.open(path) as ds:
            self.z = ds.read(1).astype(np.float32)
            self.left, self.top = ds.bounds.left, ds.bounds.top
            self.right, self.bottom = ds.bounds.right, ds.bounds.bottom
            self.res = ds.res[0]
        self.name = Path(path).name

    def sample(self, x, y):
        """Bilinear em (x, y) da estereográfica; NaN fora do DEM ou perto de NaN."""
        out = np.full(x.shape, np.nan)
        inside = (x >= self.left) & (x <= self.right) & (y >= self.bottom) & (y <= self.top)
        if inside.any():
            col = (x[inside] - self.left) / self.res - 0.5
            row = (self.top - y[inside]) / self.res - 0.5
            out[inside] = map_coordinates(self.z, [row, col], order=1, mode="constant", cval=np.nan)
        return out


def latlon_to_xy(lat_rad, lon_rad):
    """Estereográfica polar sul em esfera (relatorio.md A.3): ρ = 2R·tan((90°+lat)/2)."""
    rho = 2 * R_M * np.tan((np.pi / 2 + lat_rad) / 2)
    return rho * np.sin(lon_rad), rho * np.cos(lon_rad)


BLEND_5M_M = 500.0     # 5 m tile -> 80 m: transition zone inside the tile edge
BLEND_80M_M = 5000.0   # 80 m mosaic -> 240 m: transition zone inside the mosaic edge


def make_elevation_at(raw_dir=RAW, fine_tiles=FINE_TILES, mosaics=MOSAICS, return_source=False,
                      blend=True):
    """blend=True removes the elevation step at DEM seams (check_bounds_seams.py, 2026-11-07):
    inside a transition zone along the edge of a finer DEM, the weight goes linearly from 0 (edge)
    to 1 (zone width inside), mixing with the next coarser DEM. Outside the zone, it is pure finest DEM."""
    fine = [_Dem(Path(raw_dir) / f"{t}_final_adj_5mpp_surf.tif") for t in fine_tiles]
    coarse = [_Dem(Path(raw_dir) / m) for m in mosaics]
    levels = fine + coarse   # ordem = do mais fino para o mais grosso
    widths = [BLEND_5M_M] * len(fine) + [BLEND_80M_M] * len(coarse)
    widths[-1] = 0.0         # o último nível não mistura com nada

    def edge_weight(dem, width, x, y):
        if not blend or width == 0:
            return np.ones(x.shape)
        dist = np.minimum.reduce([x - dem.left, dem.right - x, y - dem.bottom, dem.top - y]) - dem.res
        return np.clip(dist / width, 0.0, 1.0)

    def elevation_at(latitude_rad, longitude_rad):
        lat = np.asarray(latitude_rad, dtype=float)
        lon = np.asarray(longitude_rad, dtype=float)
        shape = np.broadcast(lat, lon).shape
        lat, lon = np.broadcast_to(lat, shape).ravel(), np.broadcast_to(lon, shape).ravel()
        x, y = latlon_to_xy(lat, lon)
        acc = np.zeros(x.shape)          # soma ponderada
        rem = np.ones(x.shape)           # peso que ainda falta
        src = np.full(x.shape, -1)       # DEM mais fino que contribuiu
        for k, (dem, width) in enumerate(zip(levels, widths)):
            todo = np.flatnonzero(rem > 0)
            if todo.size == 0:
                break
            v = dem.sample(x[todo], y[todo])
            ok = ~np.isnan(v)
            idx, v = todo[ok], v[ok]
            w = edge_weight(dem, width, x[idx], y[idx])
            w = np.where(w > 0, w, 0.0)
            take = w > 0
            idx, v, w = idx[take], v[take], w[take]
            acc[idx] += rem[idx] * w * v
            src[idx] = np.where(src[idx] < 0, k, src[idx])
            rem[idx] *= 1.0 - w
        used = 1.0 - rem
        z = np.where(used > 0, acc / np.where(used > 0, used, 1.0), np.nan)
        z = z.reshape(shape)
        if return_source:
            return z, src.reshape(shape), [d.name for d in levels]
        return z if shape else float(z)

    return elevation_at
