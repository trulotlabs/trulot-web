# RS parcel condition inputs V0

This offline-only layer inventories Parcel V2 facts needed by the sealed RS standards. Geometry diagnostics remain explicitly non-legal and cannot populate lot width, depth, frontage, or corner-lot facts.

```sh
python3 scripts/rs-parcel-condition-inputs-v0/build.py
python3 scripts/rs-parcel-condition-inputs-v0/test.py
```

Both commands operate only on committed repository evidence.
