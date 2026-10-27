# La Mesa building currentness v0

Packet 75 models the immutable Spring 2017 SanGIS/SANDAG building-outline snapshot as `OBSERVATIONAL_GEOMETRY`. It joins outlines to the 17,391 canonical Packet 64 APNs, composes bounded Packet 73 assessor and Packet 74 permit states, and emits jurisdiction-neutral records and summaries.

The artifact never equates footprints with dwellings, legal status, occupancy, or permitted use. A secondary candidate is an observational prompt only. `NO_FOOTPRINT_OBSERVED_IN_SOURCE` does not mean vacant. `NO_LATER_CHANGE_KNOWN` does not prove the old geometry is current.

## Rights boundary

The raw outline snapshot is not copied here. SanGIS/SANDAG restrictions on resale, repackaging, repurposing, and automatic redistribution remain unresolved for production reuse. This folder contains bounded derived facts for internal analysis. Raw or full derived polygons must not be publicly redistributed. No runtime integration was made.

## Reproduction

The build requires the sealed private source files and accepts them as explicit arguments:

```text
python3 scripts/la-mesa-building-currentness-v0/build.py \
  --building-snapshot /private/path/la-mesa-building-outlines.ndjson.gz \
  --parcel-geometries /private/path/trulot-p64-lm-parcels.geojsonl
python3 data/la-mesa-building-currentness-v0/validate.py
```

Source content SHA-256: `1895e34e2b26b6fd018ff775733d532de0451773c9a396b292fc2b40650166f5`.
Observation rows content SHA-256: `fa4a387bf90559440c14a0d24ce361d21eac738c71a5275dd5d0fd86af90bcce`.
Parcel summaries content SHA-256: `c239fdb5b5fed165009729d07b16b013338e7b6996018c22e6e39d8a7da2f4f4`.
