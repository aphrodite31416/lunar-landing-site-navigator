"""Explicit, scoped SPICE kernel loading; ET/UTC conversion never uses datetime addition."""

from contextlib import AbstractContextManager
from pathlib import Path
import urllib.request

import spiceypy as spice

from .. import mini_model as model

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNEL_URLS = {
    "naif0012.tls": NAIF + "lsk/naif0012.tls",
    "de421.bsp": NAIF + "spk/planets/a_old_versions/de421.bsp",
    "pck00011.tpc": NAIF + "pck/pck00011.tpc",
    "moon_pa_de421_1900-2050.bpc": NAIF + "pck/moon_pa_de421_1900-2050.bpc",
    "moon_080317.tf": NAIF + "fk/satellites/moon_080317.tf",
}


def fetch_kernels(directory, time_only=False):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    names = ["naif0012.tls"] if time_only else list(KERNEL_URLS)
    for name in names:
        target = directory / name
        if not target.exists():
            temporary = target.with_suffix(target.suffix + ".part")
            print(f"Downloading {name}", flush=True)
            with urllib.request.urlopen(KERNEL_URLS[name], timeout=60) as source, temporary.open("wb") as out:
                while block := source.read(1024 * 1024):
                    out.write(block)
            temporary.replace(target)


class KernelPool(AbstractContextManager):
    def __init__(self, paths):
        self.paths = [str(Path(path).resolve()) for path in paths]
        self.loaded = []

    def __enter__(self):
        try:
            for path in self.paths:
                if not Path(path).is_file():
                    raise FileNotFoundError(f"Missing SPICE kernel: {path}")
                spice.furnsh(path)
                self.loaded.append(path)
        except Exception:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, *exc):
        for path in reversed(self.loaded):
            spice.unload(path)
        self.loaded.clear()


class SpiceClock:
    def __init__(self, start_utc):
        self.start_et = spice.str2et(start_utc)

    def utc(self, elapsed_s):
        return spice.et2utc(self.start_et + float(elapsed_s), "ISOC", 3) + "Z"

    def elapsed(self, utc):
        return float(spice.str2et(utc) - self.start_et)


class SpiceProvider:
    method = "spice_spkcpo_cn+s"

    def __init__(self, ephemeris, clock):
        self.ephemeris, self.clock = ephemeris, clock

    def __call__(self, elapsed_s):
        if not self.ephemeris.times_s[0] <= elapsed_s <= self.ephemeris.times_s[-1]:
            raise ValueError("Requested time is outside the declared scenario period.")
        et = self.clock.start_et + elapsed_s
        return tuple(model.body_vector_from_spice(body, et, self.ephemeris.observer_m,
                                                  self.ephemeris.metadata["frame"])
                     for body in ("SUN", "EARTH"))
