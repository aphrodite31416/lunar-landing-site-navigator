# Team input data

`ephemeris/` contains the four original JSON/NPZ handoffs for 2026-11-14 through
2026-12-14, copied without changing their contents. Vectors are relative to the
surface observer in metres, not Moon-centred vectors or unit directions.

`historical/` contains the two supplied CSVs from the four-year notebook. The
historical vectors and four real horizon profiles were not part of these local
handoffs. Place the original horizon-v2 JSONs in `horizons/` before generating
terrain-aware scenarios. No placeholder terrain is included.

The original Colab source snapshots are in `scientific/notebooks/`. Saved outputs
and Colab user/session metadata are removed; code cells are retained for reference.
Production calculations use the `scientific` Python modules rather than notebook
execution order or interactive uploads.
