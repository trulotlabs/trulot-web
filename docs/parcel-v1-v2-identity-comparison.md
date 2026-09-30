# Parcel V1 / V2 identity comparison

## Decision

`PARCEL_V2_IDENTITY_PARITY_NOT_PROVEN`

Parcel V2 is a materially stronger parcel-identity foundation in source traceability, immutable geometry, explicit quarantine, and preservation of stacked APNs. It is not ready to replace Parcel V1: 175 V1 APNs are absent from accepted V2, including 72 whose current-source rows were quarantined; 10,175 shared APNs lose a V1 address; 96,745 shared addresses differ materially under bounded normalization; and material lineage/coordinate review sets remain. This finding does not authorize cutover.

The machine-readable evidence is [`data/parcel-v1-v2-comparison/report.json`](../data/parcel-v1-v2-comparison/report.json). The comparison used read-only production `SELECT` queries plus exact local source artifacts. Production was not mutated.

## Sources and field semantics

| Meaning | Parcel V1 | Parcel V2 |
| --- | --- | --- |
| Corpus | `public.parcel_page_api_v2` | `trulot_v2.parcel_base_sangis_v2`, acquisition `sangis-20260924T183743Z` |
| APN | `apn_norm`, ten-digit primary key; `apn_raw` is also canonical in the exact export | `apn_norm`, ten-digit acquisition identity; original `apn_raw` retained |
| Parcel ID | Not exposed by the serving table; historical `core.parcels` lineage supplies non-APN `parcelid` | SanGIS `parcel_id`; intentionally nonunique for stacked/repeated parcel identities |
| Address | Legacy/enriched situs presentation; title case in live serving rows | Address assembled from raw SanGIS situs components; nullable and uppercase source form |
| Jurisdiction | `city` is locality/enrichment text and is not a reliable jurisdiction predicate | `situs_juris='SD'` is the explicit City scope used by the validated import |
| Lot area | `lot_area_sqft`, historically geometry-derived but without a complete current serving provenance receipt | `approximate_geometry_area_sqft`, derived in EPSG:2230, explicitly approximate |
| Acreage | `lot_area_acres` derives from V1 lot area | `taxable_acreage` is a separate nullable source attribute; it is not legal-lot or geometry area |
| Point | Live `lat`/`lng`; historical derivation lineage is incomplete | Projected-geometry centroid plus a separate point-on-surface and `centroid_within` flag |
| Geometry | Live serving `geom` is null for all rows; the historical lineage export retains geometry | Valid source Polygon/MultiPolygon retained with canonical geometry SHA-256 |
| Row identity | Tax parcel/APN presentation. Legal-lot and condo-unit status are not proven. | Source tax parcel/APN. Repeated parcel IDs can represent stacked units; legal-lot status is not inferred. |

V1 `lot_area_sqft`, V2 `taxable_acreage`, and V2 `approximate_geometry_area_sqft` are different fields. Their numeric comparison is diagnostic and does not establish which value is legally correct. APN is not parcel ID, and neither field proves a legal lot.

## Exact APN reconciliation

| Measure | Count |
| --- | ---: |
| V1 distinct City APNs | 393,364 |
| V2 distinct City APNs | 393,733 |
| Intersection | 393,189 |
| V1-only | 175 |
| V2-only | 544 |

Both identities were independently reproduced from production and the sealed local artifacts:

- V1 sorted APN-set SHA-256: `70a7bd054178b27d2e1df309bb6f3ab752f243f9deb692b8001eae6291e69c9f`
- V2 sorted APN-set SHA-256: `3d9f9b91b3fc32ffee71b5dbb1fb43c0c3e853afb1ebc24e6db434c77e79e22c`

The accounting identities hold exactly:

```text
393,189 intersection + 175 V1-only = 393,364 V1
393,189 intersection + 544 V2-only = 393,733 V2
```

## Set-difference classification

Every V2-only APN falls into one of these evidence-bounded categories:

| V2-only category | Count | Share | Evidence |
| --- | ---: | ---: | --- |
| Stacked or repeated parcel-ID group | 457 | 84.0% | Current V2 parcel ID occurs on multiple APNs; every repeated group has one identical geometry hash. |
| Current-source addition or historical V1 omission, unresolved | 87 | 16.0% | Present in current SanGIS and absent from exact V1 APN set; no historical cadastral record proves why. |

Every V1-only APN falls into one of these categories:

| V1-only category | Count | Share | Evidence |
| --- | ---: | ---: | --- |
| V2 quarantine exclusion | 72 | 41.1% | APN occurs in current-source quarantine and is not promoted. |
| Same parcel-ID APN replacement pattern | 6 | 3.4% | Historical parcel ID occurs under one or more different current APNs; this is a pattern, not legal-history proof. |
| Retired/stale, jurisdiction difference, or current-source omission, unresolved | 97 | 55.4% | Absent from current accepted V2 and quarantine; bounded evidence cannot select among causes. |

Representative V2-only APNs include stacked `3064242800`, `3080420101`, `3080420102`, and unresolved `3003725200`, `3013101500`. Representative V1-only APNs include quarantine exclusions `2672905400`, `2673626100`, `2748821301`; replacement-pattern APNs `3080420100`, `3080420200`; and unresolved `3003725000`, `3013101200`.

## APN normalization and stacked identities

All 393,364 V1 raw APNs and all 393,733 accepted City V2 raw APNs are already canonical ten-digit values. No set difference is punctuation-only, padding-only, truncation-only, or an 8/9/10-digit conversion. Normalization explains zero of the `+369` delta.

V2 contains 5,446 repeated parcel-ID groups covering 126,239 APNs. All 5,446 groups have identical geometry within their group, consistent with stacked/repeated tax identities. V1 contains 125,782 of those APNs. The 457 V2-only APNs all belong to repeated groups, and 50 groups are not fully represented in V1. V2 therefore preserves distinct canonical APNs that V1 did not serve; it does not treat identical geometry as a duplicate error.

## Shared APN comparison

### Address and jurisdiction

| Address comparison | Count |
| --- | ---: |
| Exact raw | 0 |
| Bounded normalized match | 281,404 |
| V1 missing / V2 present | 286 |
| V1 present / V2 missing | 10,175 |
| Both missing | 4,579 |
| Material difference | 96,745 |

Raw equality is zero because V1 presentation is title case and V2 preserves uppercase source form. Normalization is limited to case, whitespace, and safe token punctuation. It does not erase unit, fraction, hyphen, apostrophe, or street-token meaning.

The V1 `city` values for shared APNs are San Diego 393,073; Oceanside Escondido 107; Ramona 7; Mountain Empire 1; and Valley Center 1. All corresponding V2 rows have `situs_juris='SD'`. This proves V1 `city` is not the City boundary predicate; it does not prove those APNs are jurisdiction errors.

### Parcel ID, coordinates, and geometry

Historical V1 parcel ID equals current V2 parcel ID for 392,855 shared APNs and differs for 334. None is missing from the historical lineage file. A parcel-ID change is a lineage-review flag, not an APN mismatch.

Live stored centroid diagnostics over all 393,189 shared APNs:

| Distance band | Count |
| --- | ---: |
| less than 1 ft | 777 |
| 1–10 ft | 268,376 |
| 10–50 ft | 94,013 |
| 50–250 ft | 26,134 |
| over 250 ft | 3,889 |

Average distance is 19.45 ft and maximum is 4,561.25 ft. These are diagnostic bands, not correctness thresholds. Historical V1 geometry examples show source-boundary changes: APN `4375706100` shifts about 519 ft between historical geometry centroids, while `3487300501` shifts about 259 ft. The larger live maximum means live V1 coordinate lineage requires its own parcel-level review.

Live V1 serving geometry is null for every row. Historical V1 source geometry exists for all rows, while V2 stores valid source geometry for every accepted row. Geometry hashes are therefore not directly comparable across the live serving tables.

### Area semantics

V1 lot area versus V2 approximate geometry area is within 1% for 392,797 shared APNs; 227 are 1–5%, 76 are 5–10%, and 89 exceed 10%. None differs by an order of magnitude. Historical examples include `3487300501` (V2/V1 geometry area ratio 1.86) and `4375706100` (ratio 0.217).

V2 taxable acreage is null for 374,195 shared APNs. For nonnull rows converted to square feet, 9,229 are within 1% of V1 lot area; 6,235 are 1–5%; 1,958 are 5–10%; 1,572 exceed 10%; and 191 differ by at least an order of magnitude. These counts demonstrate semantic mismatch; they do not identify an error.

## Quarantine impact

The sealed quarantine has 1,328 rows and 1,340 reason occurrences: 1,016 invalid APN, 313 invalid geometry, 10 duplicate APN/object ID, and one unclosed/short ring. Seventy-three rows are `SD`: 71 invalid geometry and two duplicate APN/object ID. All 73 City rows refer to APNs in V1, representing 72 distinct V1 APNs; one duplicated quarantine APN also has an accepted counterpart. The remaining 72 would become unavailable if V2 became authoritative without a reviewed exception policy.

No quarantined data was promoted.

## Exact `+369` bridge

```text
V1 distinct City APNs                                      393,364
+ V2-only stacked/repeated parcel-ID APNs                      457
+ current-source additions / historical omissions unresolved    87
- V2 quarantine exclusions                                     72
- same-parcel-ID replacement-pattern V1 APNs                     6
- retired/stale/jurisdiction/current-source omissions unresolved 97
-------------------------------------------------------------------
V2 distinct City APNs                                      393,733
```

The bridge balances exactly. The arithmetic is resolved; 184 additions/removals still lack authoritative historical cause (87 V2-only plus 97 V1-only).

## Representative casebook

The evidence report contains 22 parcel cases with both identities, difference, explanation, confidence, and user-visible impact. Coverage includes V2-only, V1-only, normalized and material address changes, missing addresses, repeated identity, quarantine, centroid outliers, and area semantics. Selected cases:

| APN | Case | Impact |
| --- | --- | --- |
| `3064242800` | V2-only repeated parcel ID | Improved identity |
| `3080420101` | V2-only stacked unit identity | Improved identity |
| `3003725200` | V2-only, historical cause unresolved | Needs review |
| `2672905400` | V1-only due invalid-geometry quarantine | Potential regression |
| `3080420100` | V1-only same-parcel-ID replacement pattern | Potential regression |
| `2410902500` | Same address after bounded normalization | No material impact |
| `2672311800` | `Wayne Hl` versus `WAYNE HLS` | Needs review |
| `3010702900` | V1 missing address, V2 has current situs | Improved identity |
| `2410603700` | V1 address present, V2 address null | Potential regression |
| `2392600700` | Both addresses null; V1 locality is not jurisdiction | No material impact |
| `4375706100` | Historical geometry/centroid and area change | Needs review |
| `4781101148` | Shared APN in repeated parcel-ID group | No material impact |

## User-visible impact

The primary partition covers all 393,908 APNs in the union. Presence is evaluated first, then live address state for shared APNs:

| Impact class | Count |
| --- | ---: |
| No material user impact | 285,983 |
| Improved identity | 743 |
| Potential regression | 10,350 |
| Needs review | 96,832 |

This is a mutually exclusive routing/address partition. Parcel-ID changes (334), live centroid shifts over 250 ft (3,889), and geometry-area differences over 10% (89) are overlapping diagnostic flags and are not added again.

Material regression candidates are the 175 V1-only APNs and 10,175 shared APNs with a V1 address but no V2 situs address. The 72 quarantine exclusions are the highest-confidence disappearance subset. The other 97 V1-only APNs need cadastral/recency evidence before they can be called stale or retired.

## Remaining questions

- Obtain authoritative historical parcel split/consolidation/retirement records for the 97 unresolved V1-only and 87 unresolved V2-only APNs.
- Define and review an exception policy for the 72 V1 APNs excluded by V2 quarantine.
- Explain the 334 same-APN parcel-ID changes from source lineage.
- Review the 10,175 V2-missing addresses and a bounded stratified sample of the 96,745 material address changes.
- Review the live parcel-level records behind the 3,889 centroid shifts over 250 ft, starting with the 4,561.25-ft maximum.

## Reproduction

The offline comparator has no network/database client and writes only its requested local output:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v1-v2-comparison/compare.py \
  --v1 /path/to/parcel_page_api_v2.csv \
  --v1-lineage /path/to/parcels_enriched_canon_v1.csv \
  --v2 /path/to/rows.ndjson.gz \
  --quarantine /path/to/rejected.ndjson.gz \
  --output /tmp/parcel-v1-v2-comparison.json
```

The committed report records the production field aggregates separately because the exact local V1 export is authoritative for its APN set but predates the live V1 address/coordinate population. Tests cover set accounting, bounded APN/address normalization, chunk completeness, category assignment, and exact bridge reconciliation.

## Preservation

The production checks were `SELECT` only. Parcel V1 was unchanged. V2 remains validated and dark with zero selected snapshots, zero zoning rows, zero mapping rows, and zero serving rows. No shadow read, deployment, or push occurred.
