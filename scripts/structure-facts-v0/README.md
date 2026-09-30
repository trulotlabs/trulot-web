# Structure Facts V0

This packet builds an offline, provenance-preserving structure-fact layer. It does not evaluate compliance or capacity and it does not connect to a database.

## Inputs

- sealed SanGIS Parcel V2 acquisition `sangis-20260924T183743Z`;
- accepted City Parcel V2 rows from Packet 6;
- official City/SANDAG Building Outlines acquired as `building-outlines-city-20260930T161931Z`;
- sealed Base Zoning V2 and Coastal Context V0 mappings for fixture context.

The full artifacts live under `/Users/ops/trulot-data/structure-facts-v0/`. Compact decisions, counts, provenance, fixtures, and fingerprints are committed under `data/structure-facts-v0/`.

## Commands

`python3 scripts/structure-facts-v0/acquire.py --output <new-empty-directory>` acquires a new public building-outline snapshot. It requires network access and never uses credentials.

`python3 scripts/structure-facts-v0/full_linkage.py` reconstructs the full normalized footprint and conservative spatial linkage from the sealed offline source files. It requires the bundled `geopandas`, `numpy`, `pandas`, `pyogrio`, and `shapely` libraries. It does not select an APN for a footprint that crosses physical parcel groups, and it keeps stacked parcel identities at group scope.

`python3 scripts/structure-facts-v0/build.py` rebuilds the compact evidence and the canonical parcel-fact stream from the sealed normalized artifacts.

`python3 scripts/structure-facts-v0/test.py` validates source schema, exact APN linkage, ambiguous and duplicate handling, concept separation, null/zero behavior, fixtures, Packet 14 integration, Parcel Truth vocabulary, integrity, and deterministic output rebuilding.

Source zero values stay unknown. An empty footprint list never means vacant. Historical footprint area never becomes living area or gross floor area.
