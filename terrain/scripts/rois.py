"""Reads the PGDA RoI shapefiles (regions with mean illumination > 70%, Barker et al. 2021) and
prints each RoI: area, centroid (x, y, lat, lon), whether the centroid is inside the polygon, and DBF attributes.

Run: .venv/Scripts/python scripts/rois.py [Site01 ...]   (files in data/raw/rois/)
Also writes data/derived/rois.json.
"""
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROIS = ROOT / "data" / "raw" / "rois"
R = 1737400.0


def read_dbf(path):
    b = path.read_bytes()
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b"\0")[0].decode("ascii")
        fields.append((name, chr(b[off + 11]), b[off + 16]))
        off += 32
    rows = []
    for i in range(n):
        rec, pos, row = b[hlen + i * rlen: hlen + (i + 1) * rlen], 1, {}
        for name, typ, ln in fields:
            raw = rec[pos:pos + ln].decode("ascii", "replace").strip()
            pos += ln
            try:
                row[name] = float(raw) if typ in "NF" else raw
            except ValueError:
                row[name] = raw
        rows.append(row)
    return rows


def read_polygons(path):
    b = path.read_bytes()
    off, polys = 100, []
    while off < len(b):
        _, words = struct.unpack(">ii", b[off:off + 8])
        content = b[off + 8: off + 8 + words * 2]
        off += 8 + words * 2
        if struct.unpack("<i", content[:4])[0] != 5:
            polys.append([]); continue
        nparts, npts = struct.unpack("<ii", content[36:44])
        parts = list(struct.unpack(f"<{nparts}i", content[44:44 + 4 * nparts]))
        pts = struct.unpack(f"<{2 * npts}d", content[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts])
        xy = list(zip(pts[0::2], pts[1::2]))
        polys.append([xy[s:e] for s, e in zip(parts, parts[1:] + [npts])])
    return polys


def ring_area_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        c = x0 * y1 - x1 * y0
        a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    a /= 2
    return a, (cx / (6 * a), cy / (6 * a)) if a else ring[0]


def inside(pt, ring):
    x, y, c = pt[0], pt[1], False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            c = not c
    return c


def xy_to_latlon(x, y):
    rho = math.hypot(x, y)
    return -(90 - 2 * math.degrees(math.atan(rho / (2 * R)))), math.degrees(math.atan2(x, y))


def main():
    sites = sys.argv[1:] or ["Site01", "Site04", "Site07", "Site11"]
    out = {}
    for s in sites:
        polys = read_polygons(ROIS / f"{s}_ROIs.shp")
        attrs = read_dbf(ROIS / f"{s}_ROIs.dbf")
        out[s] = []
        for i, (rings, at) in enumerate(zip(polys, attrs)):
            # outer ring = largest |area|
            ar = [ring_area_centroid(r) for r in rings]
            k = max(range(len(rings)), key=lambda j: abs(ar[j][0]))
            area, (cx, cy) = ar[k]
            lat, lon = xy_to_latlon(cx, cy)
            item = {"roi": i, "area_m2": round(abs(area), 1), "centroid_xy_m": [round(cx, 1), round(cy, 1)],
                    "centroid_lat_deg": round(lat, 5), "centroid_lon_deg": round(lon, 4),
                    "centroid_inside": inside((cx, cy), rings[k]), "n_vertices": len(rings[k]),
                    "attrs": at}
            out[s].append(item)
            print(s, json.dumps(item))
    (ROOT / "data" / "derived").mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "derived" / "rois.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
