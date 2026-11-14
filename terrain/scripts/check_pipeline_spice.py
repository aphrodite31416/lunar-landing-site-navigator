"""Real-SPICE check of the team pipeline's own functions against JPL Horizons, all 4 sites.

Calls scientific.mini_model.body_vector_from_spice (spkcpo, CN+S, refloc OBSERVER), local_basis and
azimuth_elevation with the real kernels of scientific.ephemeris.spice (DE421, moon_pa_de421, moon_080317.tf),
and compares with the JPL Horizons az/el stored in terrain/data/derived/validation/spice_vs_horizons.json
(made by terrain/scripts/check_spice_vs_horizons.py; no network needed here).

This covers MaKenna's "no real-SPICE test" item and the azimuth convention (0 = N, 90 = E): a mix-up would
show up as a large azimuth difference.

Run from the repo root (kernels via: python -c "from scientific.ephemeris.spice import fetch_kernels; fetch_kernels('data/kernels')"):
    python terrain/scripts/check_pipeline_spice.py
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import spiceypy as sp

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from scientific import mini_model as mm                     # noqa: E402
from scientific.ephemeris.spice import KernelPool, KERNEL_URLS   # noqa: E402

HZ = REPO / "terrain" / "data" / "derived" / "horizons"
REF = REPO / "terrain" / "data" / "derived" / "validation" / "spice_vs_horizons.json"


def main():
    ref = json.loads(REF.read_text())
    kernels = [REPO / "data" / "kernels" / k for k in KERNEL_URLS]
    worst = 0.0
    with KernelPool(kernels):
        for s in ("01", "04", "07", "11"):
            hz = json.loads((HZ / f"site_{s}.json").read_text())
            obs = np.array(hz["observer_xyz_m"])
            basis = mm.local_basis(math.radians(hz["lat_deg"]), math.radians(hz["lon_deg"]))
            for row in ref[f"Site{s}"]:
                et = sp.str2et(row["epoch_utc"])
                v = mm.body_vector_from_spice(row["target"], et, obs, "MOON_ME_DE421")
                az, el = (math.degrees(float(x)) for x in mm.azimuth_elevation(v, basis))
                daz = (az - row["horizons_az"] + 180) % 360 - 180
                d = max(abs(el - row["horizons_el"]), abs(daz) * math.cos(math.radians(el)))
                worst = max(worst, d)
                print(f"Site{s} {row['epoch_utc']} {row['target']:5} az {az:9.5f} (Horizons {row['horizons_az']:9.5f}) "
                      f"el {el:8.5f} (Horizons {row['horizons_el']:8.5f})")
    print(f"max |pipeline - Horizons| = {worst:.6f} deg")
    if worst > 0.001:
        raise SystemExit("FAIL: pipeline SPICE disagrees with JPL Horizons by more than 0.001 deg")
    print("OK")


if __name__ == "__main__":
    main()
