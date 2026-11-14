"""Strict adapters for the team's horizon-v2 and observer-vector handoffs."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

import numpy as np

from . import mini_model as model

SITE_IDS = ("site01", "site04", "site07", "site11")
FRAME = "MOON_ME_DE421"
AZIMUTH_CONVENTION = "0 = local North, 90 = East (clockwise); horizontal plane perpendicular to the radial vertical"


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    def reject_constant(value):
        raise ValueError(f"Non-finite JSON constant: {value}")
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject_constant)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               separators=(",", ":")) + "\n", encoding="utf-8")


def finite_array(value, name, shape=None):
    result = np.asarray(value, dtype=float)
    if (shape is not None and result.shape != shape) or not np.isfinite(result).all():
        raise ValueError(f"{name}: expected finite values with shape {shape}.")
    return result


@dataclass
class Ephemeris:
    metadata: dict
    times_s: np.ndarray
    sun_vectors_m: np.ndarray
    earth_vectors_m: np.ndarray
    hashes: dict

    @property
    def observer_m(self):
        return np.asarray(self.metadata["observer_position_xyz_m"], dtype=float)

    @property
    def site_id(self):
        return self.metadata["site_id"]

    @property
    def basis(self):
        _, lat, lon = model.spherical_coordinates(self.observer_m)
        return model.local_basis(lat, lon)

    def vectors_at(self, time_s):
        if not self.times_s[0] <= time_s <= self.times_s[-1]:
            raise ValueError("Requested time is outside ephemeris coverage.")
        return tuple(np.array([np.interp(time_s, self.times_s, v[:, axis])
                               for axis in range(3)])
                     for v in (self.sun_vectors_m, self.earth_vectors_m))


def load_ephemeris(metadata_path):
    metadata_path = Path(metadata_path)
    doc = read_json(metadata_path)
    required = {
        "frame": FRAME, "observer_center": "MOON", "abcorr": "CN+S",
        "spkcpo_refloc": "OBSERVER", "vector_units": "m",
        "vector_origin": "surface observer", "vector_target": "body centre",
        "vectors_normalized": False, "time_scale": "elapsed ET seconds from et_start",
    }
    for key, expected in required.items():
        if doc.get(key) != expected:
            raise ValueError(f"{metadata_path.name}: {key} must be {expected!r}.")
    if doc.get("site_id") not in SITE_IDS:
        raise ValueError("This release supports site01, site04, site07 and site11.")
    observer = finite_array(doc["observer_position_xyz_m"], "observer", (3,))
    if not 1_600_000 < np.linalg.norm(observer) < 1_900_000:
        raise ValueError("Observer position is inconsistent with lunar metre coordinates.")
    npz_path = metadata_path.with_suffix(".npz")
    with np.load(npz_path, allow_pickle=False) as data:
        times = finite_array(data["times_s"], "times_s").copy()
        if times.ndim != 1 or times.size < 2 or times[0] != 0 or np.any(np.diff(times) <= 0):
            raise ValueError("Elapsed ET times must start at zero and strictly increase.")
        n = len(times)
        if n != doc["sample_count"]:
            raise ValueError("Sample count does not match metadata.")
        sun = finite_array(data[doc["sun_key"]], "Sun vectors", (n, 3)).copy()
        earth = finite_array(data[doc["earth_key"]], "Earth vectors", (n, 3)).copy()
    if np.any(np.linalg.norm(sun, axis=1) < 1e10) or np.any(np.linalg.norm(earth, axis=1) < 1e8):
        raise ValueError("Expected unnormalised observer-relative vectors in metres.")
    cadence = float(doc["cadence_seconds_nominal"])
    if not np.isfinite(cadence) or cadence <= 0 or np.max(np.diff(times)) > cadence * 1.01:
        raise ValueError("Cadence metadata does not describe the time series.")
    return Ephemeris(doc, times, sun, earth,
                     {metadata_path.name: file_hash(metadata_path), npz_path.name: file_hash(npz_path)})


@dataclass
class Horizon:
    document: dict
    azimuth_deg: np.ndarray
    elevation_deg: np.ndarray
    sha256: str
    margin_deg: float = 0.0

    def __post_init__(self):
        self._profile = model.make_horizon(np.deg2rad(self.azimuth_deg),
                                           np.deg2rad(self.elevation_deg))

    def __call__(self, azimuth_rad):
        return self._profile(azimuth_rad) + np.deg2rad(self.margin_deg)

    def shifted(self, margin_deg):
        if not np.isfinite(margin_deg):
            raise ValueError("Horizon margin must be finite.")
        return Horizon(self.document, self.azimuth_deg, self.elevation_deg,
                       self.sha256, self.margin_deg + margin_deg)


def load_horizon(path, ephemeris):
    doc = read_json(path)
    for key, expected in {"schema_version": 2, "site_id": ephemeris.site_id,
                          "frame": FRAME, "coverage_status": "complete"}.items():
        if doc.get(key) != expected:
            raise ValueError(f"{Path(path).name}: {key} must be {expected!r}.")
    observer = finite_array(doc["observer_xyz_m"], "horizon observer", (3,))
    for key, expected in {"angle_units": "deg", "az_convention": AZIMUTH_CONVENTION,
                          "observer_height_direction": "radial"}.items():
        if key in doc and doc[key] != expected:
            raise ValueError(f"{Path(path).name}: unsupported {key}: {doc[key]!r}.")
    if "observer_height_m" in doc:
        height = doc["observer_height_m"]
        if isinstance(height, bool) or not isinstance(height, (int, float)) or not np.isfinite(height) or height < 0:
            raise ValueError("Observer height must be a finite nonnegative number in metres.")
        if "R_m" in doc and "ground_elevation_m" in doc:
            radius = float(doc["R_m"]) + float(doc["ground_elevation_m"]) + height
            if not np.isfinite(radius) or abs(radius - np.linalg.norm(observer)) > 0.02:
                raise ValueError("Observer height and ground elevation disagree with observer XYZ.")
    if not np.allclose(observer, ephemeris.observer_m, rtol=0, atol=0.02):
        raise ValueError("Horizon and ephemeris must use the same observer position (within 2 cm).")
    lat, lon = float(doc["lat_deg"]), float(doc["lon_deg"])
    if not np.isfinite([lat, lon]).all() or not -90 <= lat <= 90 or not -360 <= lon <= 360:
        raise ValueError("Invalid planetocentric latitude or east longitude.")
    predicted = np.linalg.norm(observer) * model.radial_direction(*np.deg2rad([lat, lon]))
    if np.linalg.norm(predicted - observer) > 1.0:
        raise ValueError("Horizon coordinates and observer XYZ disagree by more than 1 metre.")
    az = finite_array(doc["az_deg"], "horizon azimuth")
    el = finite_array(doc["horizon_deg"], "horizon elevation", az.shape)
    valid = np.asarray(doc["valid"])
    if (az.ndim != 1 or len(az) < 2 or valid.shape != az.shape
            or valid.dtype != np.dtype(bool) or not valid.all()):
        raise ValueError("Every horizon direction must have an explicit true validity flag.")
    if np.any((az < 0) | (az >= 360)) or np.any(np.diff(az) <= 0) or np.any(np.abs(el) > 90):
        raise ValueError("Use sorted distinct azimuths in [0,360) and elevations in [-90,90].")
    if "n_az" in doc and doc["n_az"] != len(az):
        raise ValueError("Horizon direction count disagrees with n_az.")
    if "az_step_deg" in doc:
        step = float(doc["az_step_deg"])
        if not np.isfinite(step) or step <= 0 or not np.allclose(np.diff(np.r_[az, az[0] + 360]), step, rtol=0, atol=1e-6):
            raise ValueError("Horizon azimuths disagree with the declared periodic sampling step.")
    return Horizon(doc, az, el, file_hash(path))


def find_horizons(directory):
    found = {}
    if directory is None or not Path(directory).exists():
        return found
    for path in sorted(Path(directory).glob("*.json")):
        doc = read_json(path)
        site_id = doc.get("site_id")
        if site_id in SITE_IDS:
            if site_id in found:
                raise ValueError(f"Duplicate horizon for {site_id}.")
            found[site_id] = path
    return found
