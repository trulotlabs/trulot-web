# Packet 64 — La Mesa geometry classification

This package deterministically classifies the 17,391 canonical SanGIS parcels with `situs_juris=LM` against the sealed Packet 63 City boundary, zoning, overlay, adopted specific-plan, and planned-land-use snapshots. It contains mapped geometry observations only. It does not encode development rules or legal applicability.

## Inputs and scope

- Baseline commit: `20b8dbcafe9ee39248d98682f38cf28b31525a8b`
- Baseline tree: `33f0a23ce478ec8d07aa6ffbfb97eb2be25ae149`
- Canonical scope: 17,391 SanGIS rows and 17,391 distinct APNs
- Canonical APN fingerprint: `11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467`
- Projected normalization CRS: EPSG:2230
- Coordinate grid: 0.0001 foot

Packet 63 integrity was verified for all 42 sealed artifacts before processing. SanGIS attribution remains canonical; City-boundary geometry is QA and never silently adds or removes a parcel.

## Geometry repair

The pinned repair sequence preserves the raw source, diagnoses validity, applies GEOS `make_valid`, extracts polygonal components, unions them on the fixed grid, normalizes component order, and records before/after measurements and fingerprints. Acceptance requires a nonempty valid result, area delta no greater than 0.10%, and no component increase greater than 10.

Repaired source features: zoning 2, overlays 1, planned land use 5, adopted specific plans 2. All 10 repairs passed; maximum area delta was 0.001015675%; no empty geometry or topology collapse remained. The original receipts are in `geometry-repair-receipts.ndjson.gz`.

## Zoning doctrine and results

Zoning dissolves only contiguous geometry with the same zone code, status, and ordinance identity. APN is diagnostic and never a dissolve key. Repeated City APNs comprise 111 groups and 3,233 extra features: 110 groups are identical condominium/common-parcel republication and one is multipart/segmented same-zone geometry. Fourteen zoning features lack APN.

Secondary-zone slivers are sealed as coverage below 1% **or** intersection below 100 square feet. The dominant zone is never discarded because the entire parcel is small. Coverage reconciliation permits at most 0.5% or 25 square feet, whichever is larger. Results:

| State | Parcels |
|---|---:|
| `SINGLE_ZONE` | 15,373 |
| `BOUNDARY_SLIVER` | 1,951 |
| `MULTI_ZONE` | 58 |
| `INDETERMINATE` | 5 |
| `UNMAPPED` | 4 |

There were 2,012 second-zone intersections. Of these, 1,948 were below 0.25%, 4 were 0.25–0.5%, none were 0.5–1%, 51 were 1–2%, 3 were 2–5%, 5 were 5–10%, and one exceeded 10%. The 1%/100-square-foot policy preserves the clear empirical break while retaining 58 material multi-zone parcels.

`TBD` is retained as a mapped source code with unresolved operative profile. All 221 canonical parcels intersecting `TBD` fail closed and cannot be `RULE_PROFILE_READY`.

## Jurisdiction discrepancies

APNs `7601960217`–`7601960220` remain in canonical scope because their SanGIS `situs_juris` is `LM`, but their common 12,796,779.906943-square-foot geometry has 0% City-boundary coverage, point-on-surface outside the City, `overlay_juris=CN`, and `situs_community=FALLBROOK`. They remain `INDETERMINATE_JURISDICTION` and unmapped.

APN `4953350500` is not added to canonical scope. Its SanGIS attribution is `CN`, while 99.895448475% of its 11,444.341949-square-foot geometry and its point-on-surface fall inside the City boundary. It remains `INDETERMINATE_JURISDICTION` pending authoritative correction.

## Overlays and adopted plans

All nontrivial polygon intersections are recorded as `MAPPED_INTERSECTION`. Geometric materiality is descriptive only; Packet 65 must determine legal applicability from operative text.

Any-intersection overlay counts: BG 14, BT 84, D 2,328, F 339, G 372, H 344, MH 57, MU 1,047, NP 99, NP2 78, P 1,553. Signatures are order-independent and sorted. Complete combinations are in `report.json`.

Adopted specific-plan states: 15,753 none, 1,307 one adopted plan, and 331 boundary-review records. Draft Downtown/Grossmont updates are excluded. Planned land use is context only: 12,602 single designation, 609 multiple, 4,176 sliver, and 4 unmapped.

## Rule-profile readiness

| State | Parcels |
|---|---:|
| `RULE_PROFILE_READY` | 12,285 |
| `RULE_PROFILE_REVIEW_REQUIRED` | 4,878 |
| `RULE_PROFILE_UNAVAILABLE` | 228 |

Ready requires confirmed canonical scope, a defensible single/dominant non-`TBD` base zone, and no mapped overlay or adopted-plan intersection requiring Packet 65 interpretation. Multi-zone, overlay, specific-plan, and jurisdiction conflicts require review. `TBD`, unmapped, and indeterminate zoning are unavailable.

## Artifacts

- `parcel-classification.ndjson.gz`: one deterministic row per canonical APN
- `normalized-*.geojson.gz`: normalized/dissolved City geometry
- `geometry-repair-receipts.ndjson.gz`: per-source validity and repair receipts
- `report.json`: counts, sensitivity, benchmarks, QA, residential subset
- `fingerprints.json`: canonical output fingerprints
- `receipt.json`: sealed inputs, policies, row count, code version, fingerprints
- `artifact-integrity.json`: SHA-256 and byte count for every generated artifact
- `design.json`: production-load design and Packet 65 consumption contract

## Reproduction

Run `build.py` with the Packet 63 directory, sealed County rows, original County GeoJSON, output directory, and the sealed execution timestamp. Run `validate.py <output-directory>` afterward. Two clean local runs were byte-identical across every generated artifact.

## Decision

`LA_MESA_GEOMETRY_CLASSIFICATION_READY_FOR_RULE_PROFILES`

No production access, database mutation, production zoning load, selected-snapshot change, route/public page, rule conclusion, deployment, or push occurred.
