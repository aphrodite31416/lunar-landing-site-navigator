"""Export the supplied body directions without claiming terrain visibility."""

import numpy as np

from .. import mini_model as model


def geometry_json(ephemeris, clock):
    series = []
    sun_az, sun_el = model.azimuth_elevation(ephemeris.sun_vectors_m, ephemeris.basis)
    earth_az, earth_el = model.azimuth_elevation(ephemeris.earth_vectors_m, ephemeris.basis)
    for i, time_s in enumerate(ephemeris.times_s):
        row = {"offset_s": float(time_s), "utc": clock.utc(time_s)}
        for key, value in {"sun_azimuth_deg": sun_az[i], "sun_elevation_deg": sun_el[i],
                           "earth_azimuth_deg": earth_az[i], "earth_elevation_deg": earth_el[i]}.items():
            number = float(np.rad2deg(value))
            row[key] = number if np.isfinite(number) else None
        series.append(row)
    return {"schema_version": "1.0", "kind": "body_positions", "site_id": ephemeris.site_id,
            "frame": ephemeris.metadata["frame"], "abcorr": ephemeris.metadata["abcorr"],
            "terrain_applied": False, "series": series,
            "provenance": {"input_sha256": ephemeris.hashes},
            "warnings": ["Elevation is relative to the local tangent plane. Terrain visibility has not been evaluated."]}
