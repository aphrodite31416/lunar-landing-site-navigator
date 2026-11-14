# NASA SPICE kernel files

The files in `data/kernels/` are official NASA/JPL data used by the SPICE
library. They were downloaded from the NASA Navigation and Ancillary
Information Facility (NAIF) using:

```sh
.venv/bin/python -m scientific fetch-kernels
```

The selected filenames match the kernel list declared in the team's monthly
ephemeris handoff. Download URLs are defined in
`scientific/ephemeris/spice.py`.

## Purpose of each file

| File | Contents and purpose |
| --- | --- |
| `de421.bsp` | Planetary ephemerides used to calculate the positions of the Sun, Earth, Moon, and other bodies over time. |
| `moon_pa_de421_1900-2050.bpc` | Lunar orientation data used to account for the Moon's rotation and libration. |
| `moon_080317.tf` | Definitions of lunar reference frames, including `MOON_ME_DE421`, compatible with the DE421 lunar orientation kernel. |
| `naif0012.tls` | Leap-second and time-conversion data used to convert between UTC and SPICE ephemeris time. |
| `pck00011.tpc` | Reference size, shape, and orientation parameters for natural bodies. |

## How the project uses these files

The default `build` command reads the supplied Sun and Earth vectors from NPZ
files. It loads `naif0012.tls` to convert their elapsed ephemeris times into UTC
timestamps.

With `build --spice`, the declared kernel set is loaded and Sun/Earth positions
are recomputed relative to each site's observer position. This also allows new
evaluations when refining detected visibility transitions between input samples.

The `validate-handoff` command uses the same kernel set to recompute positions
at 17 epochs per site and compare them with the supplied vectors. This checks
reproducibility of the handoff using its declared settings.

`pck00011.tpc` is included to match the team's declared kernel set. The current
visibility calculation uses explicit Sun and Earth radius constants in
`scientific/analysis.py`; it does not read those radii from this file.

## Frontend integration

The frontend reads the generated JSON files in `frontend/public/data/`.
The SPICE kernels are used during scientific data generation and validation;
they are not loaded by the browser.

## Official sources

- [NASA NAIF generic kernel overview](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/aareadme.txt)
- [DE421 planetary ephemeris archive](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/)
- [DE421 lunar reference-frame definitions](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf)
- [Planetary constants kernel pck00011.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc)
