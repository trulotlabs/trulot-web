# Coastal Context V0

This offline packet maps the accepted 393,733-parcel City of San Diego Parcel V2 corpus to the official City `Coastal Overlay Zone (Permit Jurisdictions)` union. It does not implement Coastal RS standards, compliance, capacity, or application runtime behavior.

Commands:

```bash
python3 scripts/coastal-context-v0/acquire.py --verify-dir /Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z
python3 scripts/coastal-context-v0/build.py --check
python3 scripts/coastal-context-v0/test.py
```

The complete mapping can be reproduced with:

```bash
python3 scripts/coastal-context-v0/map.py \
  --parcels /Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z/_ags_GeoJson_EB07F5BCE8A34D208D2A6A7801151FB3.geojson \
  --accepted-rows /Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz \
  --coastal-source /Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z/coastal-overlay.geojson \
  --output /tmp/parcel-coastal-mapping.ndjson \
  --summary /tmp/parcel-coastal-summary.json
```

Only positive polygon area establishes inside coverage. A parcel with positive area on both sides remains `BOUNDARY_AMBIGUOUS`; point-on-surface is diagnostic only. The `0.000001` square-foot epsilon suppresses floating-point noise and does not express a legal materiality threshold.
