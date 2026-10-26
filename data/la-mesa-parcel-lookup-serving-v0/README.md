# La Mesa parcel lookup serving V0

Deterministic private/local serving artifacts for the 17,391 canonical SanGIS `situs_juris = LM` APNs. Search reuses `formatApn`, `normalizeAddress`, `normalizeApnInput`, and `searchParcelLookup` from the jurisdiction-neutral Parcel Lookup contract. No La Mesa-specific parser or ranker is present.

Search rows contain public identity only. Regulatory evaluation is independently keyed by APN in `evaluation-index.ndjson.gz`, so selecting a result causes the downstream engine to re-resolve the sealed evaluation rather than trust regulatory facts copied into a search row.

The four jurisdiction-conflict rows remain searchable and fail closed. Unsupported/TBD rows resolve identity without a rule conclusion. Production Parcel Lookup, public routing, and deployment are unchanged.

## Artifacts

- `serving-rows.ndjson.gz`: one public search row for each canonical La Mesa APN.
- `cross-jurisdiction-comparison.ndjson.gz`: bounded same-address comparison rows that retain their actual jurisdiction.
- `evaluation-index.ndjson.gz`: separately keyed public evaluation results used after candidate selection.
- `schema.json`, `receipt.json`, `row-count-report.json`, `duplicate-address-report.json`, and `artifact-integrity.json`: reproducibility and population evidence.
- `performance.json`: local load/search measurements for the private-pilot implementation.
- `production-serving-design.json` and `future-route-design.json`: design only; no production schema, RPC, or route was implemented.
- `review-evidence/`: static desktop/mobile browser evidence and its own integrity manifest.

## Reproduction and validation

Run the builder from the repository root:

```text
npx tsx scripts/la-mesa-parcel-lookup-serving-v0/build.ts
```

The builder consumes the locally sealed county source and Packet 63–67 artifacts. It performs no network or production access. Packet 69 tests validate all 17,391 APNs, the 663 APN-only rows, address collisions, jurisdiction conflicts, unsupported rows, bounded result behavior, and the deterministic 100-parcel sample.
