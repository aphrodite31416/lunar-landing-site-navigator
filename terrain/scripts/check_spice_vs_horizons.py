"""Real-SPICE check against JPL Horizons for all 4 sites (Sun and Earth azimuth/elevation).

Ours: spiceypy spkcpo(target, et, MOON_ME_DE421, OBSERVER, CN+S, observer_xyz, MOON, MOON_ME_DE421) with the
same kernel set as the team pipeline (DE421, moon_pa_de421, moon_080317.tf), az/el in the local frame of the
horizon files (radial up, 0 = N, 90 = E).
Horizons: OBSERVER table, CENTER='coord@301', SITE_COORD='lon,lat,alt_km' (alt above the 1737.4 km sphere =
ground_elevation + 1 m), QUANTITIES='4' (apparent az/el, airless), DE441.

Run: .venv/Scripts/python scripts/check_spice_vs_horizons.py
Writes data/derived/validation/spice_vs_horizons.json.
"""
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import spiceypy as sp

ROOT = Path(__file__).resolve().parent.parent
HZ = ROOT / "data" / "derived" / "horizons"
KER = ROOT / "data" / "raw" / "kernels"
if not KER.is_dir():                       # in the team repo: the pipeline's kernel folder
    KER = ROOT.parent / "data" / "kernels"
OUT = ROOT / "data" / "derived" / "validation" / "spice_vs_horizons.json"
KERNELS = ["naif0012.tls", "de421.bsp", "pck00011.tpc", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf"]
EPOCHS = ["2026-11-14 00:00", "2026-11-20 06:00", "2026-12-01 12:00", "2027-03-15 18:00", "2027-06-21 00:00"]
TARGETS = {"SUN": "10", "EARTH": "399"}
API = "https://ssd.jpl.nasa.gov/api/horizons.api"


def horizons_azel(cmd, lon, lat, alt_km, epoch):
    q = {"format": "json", "COMMAND": f"'{cmd}'", "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'",
         "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon:.6f},{lat:.6f},{alt_km:.6f}'",
         "TLIST": f"'{epoch}'", "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "EXTRA_PREC": "'YES'",
         "CSV_FORMAT": "'YES'", "OBJ_DATA": "'NO'", "TIME_TYPE": "'UT'"}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "lunar-site-check/1.0"})
    res = json.loads(urllib.request.urlopen(req, timeout=60).read())["result"]
    row = res.split("$$SOE")[1].split("$$EOE")[0].strip().split(",")
    vals = [c.strip() for c in row]
    nums = [float(c) for c in vals if c.replace(".", "", 1).replace("-", "", 1).isdigit()]
    return nums[-2], nums[-1]          # azimuth, elevation (last two numeric columns)


def basis(obs):
    lat = math.asin(obs[2] / np.linalg.norm(obs)); lon = math.atan2(obs[1], obs[0])
    e = np.array([-math.sin(lon), math.cos(lon), 0.0])
    n = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    u = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    return e, n, u


def main():
    for k in KERNELS:
        sp.furnsh(str(KER / k))
    out, worst = {}, 0.0
    for s in ("01", "04", "07", "11"):
        hz = json.loads((HZ / f"site_{s}.json").read_text())
        obs = np.array(hz["observer_xyz_m"]) / 1000.0
        e, n, u = basis(obs)
        alt_km = (np.linalg.norm(obs) - 1737.4)
        rows = []
        for ep in EPOCHS:
            et = sp.str2et(ep)
            for name, cmd in TARGETS.items():
                v = sp.spkcpo(name, et, "MOON_ME_DE421", "OBSERVER", "CN+S", obs, "MOON", "MOON_ME_DE421")[0][:3]
                v = v / np.linalg.norm(v)
                el = math.degrees(math.asin(v @ u)); az = math.degrees(math.atan2(v @ e, v @ n)) % 360
                haz, hel = horizons_azel(cmd, hz["lon_deg"], hz["lat_deg"], alt_km, ep)
                daz = (az - haz + 180) % 360 - 180
                rows.append({"epoch_utc": ep, "target": name, "spice_az": round(az, 6), "spice_el": round(el, 6),
                             "horizons_az": haz, "horizons_el": hel, "d_az_deg": round(daz, 6),
                             "d_el_deg": round(el - hel, 6)})
                worst = max(worst, abs(el - hel), abs(daz) * math.cos(math.radians(el)))
                print(f"Site{s} {ep} {name:5} az {az:9.5f} vs {haz:9.5f}  el {el:8.5f} vs {hel:8.5f}")
        out[f"Site{s}"] = rows
    out["_summary"] = {"max_abs_diff_deg": round(worst, 6),
                       "note": "Horizons uses DE441 and its own lunar orientation; ours DE421 + MOON_ME_DE421. "
                               "Azimuth differences are scaled by cos(el)."}
    OUT.write_text(json.dumps(out, indent=2))
    print("max |diff| (deg):", round(worst, 6), "\nwrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
