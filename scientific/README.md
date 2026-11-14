# Lunar ephemeris export (DE421)

This Colab notebook generates observer-relative Sun and Earth center vectors for one site supplied by Lucas. It is designed to hand vectors to Zarina's visibility engine; it does not calculate visibility windows or metrics.

## Contract

- Frame: `MOON_ME_DE421`; kernels: `de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00011.tpc`, and `naif0012.tls`.
- Correction: `CN+S`, using `spkcpo` with `refloc="OBSERVER"` and Lucas's observer XYZ in metres from JSON, converted to km for SPICE.
- Period: 2026-11-14 00:00:00 UTC through 2026-12-14 00:00:00 UTC, inclusive, every 300 seconds (8641 epochs). This follows Zarina's README recommendation; `vectors_at(et)` can supply extra evaluations while refining transitions to 30–60 seconds.
- Outputs: elapsed ET seconds from start and unnormalized observer-to-body-center vectors in metres, shape `(N, 3)`. `vectors_at(et)` supports extra evaluations.

## Run

1. Open `lunar_ephemeris_de421.ipynb` in Colab.
2. Upload the latest schema v2 `horizons/site_XX.json` (or place it in the notebook working directory) and set `SITE_JSON_PATH` to its path. The notebook expects `observer_xyz_m` in `MOON_ME_DE421` and converts it to km for `spkcpo`.
3. Run all cells. The notebook checks frame and required position fields and stops if the input is missing or inconsistent.
4. Share the generated `.npz` vectors and `.json` metadata sidecar with Zarina. The notebook also writes a first-48-hour CSV with Sun/Earth azimuth and elevation, the terrain horizon at each azimuth, and center-versus-horizon diagnostic flags for Lucas's comparison. These flags do not replace Zarina's Sun-disc and occultation analysis.

The updated ROI centroid coordinates are checked when latitude/longitude are available: Site01 −89.45270, −137.1523; Site04 −89.76205, −157.0750; Site07 −88.80737, 123.7767; Site11 −88.66832, −68.3754. Zarina confirmed that the engine expects `sun_vectors_m` and `earth_vectors_m`, each with shape `(N, 3)`, in metres, unnormalized. `times_s` is strictly increasing elapsed ET seconds from the first sample; UTC bounds are recorded separately in each JSON sidecar.

The all-site ZIP contains the verified 2026 exports for Site01, Site04, Site07, and Site11. Lucas independently checked the vector geometry against JPL Horizons. The separate 2009–2013 visibility comparison remains preliminary and should not be treated as the pipeline's final metrics; those belong to Zarina's `analyze` function.

## Reference

NAIF's `moon_080317.tf` defines `MOON_ME_DE421` and pairs with the DE421 lunar orientation kernel. See [NAIF lunar FK](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf) and [SPKCPO documentation](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/spicelib/spkcpo.html).
