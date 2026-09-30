# Structure Facts V0

Decision: **`STRUCTURE_FACTS_V0_READY_FOR_RULE_EVALUATION`**.

This is a bounded input-readiness decision. Exact-APN, source-reported dwelling-unit facts can now supply the existing-unit input to a later dwelling-protection evaluator. Proposed-project scope remains absent, so no dwelling-protection conclusion is made. No other RS structure-dependent family is complete.

## Source inventory

| Evidence | Classification | Finding |
|---|---|---|
| Sealed SanGIS Parcel snapshot `sangis-20260924T183743Z` | Authoritative current source | SanGIS states that parcel attributes come from County ARCC Master Property Record and Parcel Assessment Record data. The snapshot has a 2026-08-29 stated currency and exact APNs. |
| City/SANDAG Building Outlines | Authoritative historical source | Official polygons were created from Spring 2017 regional imagery using EagleView/Pictometry ChangeFinder. The acquired records have null creation/edit dates and no stated update cadence, so current completeness is not proven. |
| `assessor_structures_sdcounty_v1` | Non-reproducible | The repository names the source but retains no source artifact, schema, importer, vintage, row count, or checksum. |
| `public.parcel_page_api_v2` | Derived | The downstream view exposes assessor-style fields but is not upstream source evidence. |
| Parcel V1 “existing structure coverage” | Heuristic/derived | It divides assessor living area by parcel geometry area. That value is neither authoritative lot coverage nor changed by this packet. |
| Permit descriptions/valuation | Conditional evidence | They do not establish present structure size, count, units, or occupancy. |
| Bedrooms, baths, garage, effective-year, and use codes | Raw/unknown | These remain raw because exact encoding, currentness, or legal semantics are not fully sealed. |

## Authoritative sources

The parcel source is the [SanGIS Parcels FeatureServer](https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0). Its sealed source content SHA-256 is `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544`. Native geometry is EPSG:2230; the acquired Parcel V2 artifact is EPSG:4326. The official City field evidence defines `UNITQTY` as the number of units currently constructed on the parcel and `TOTAL_LVG_AREA` as total living area currently constructed on the parcel. MPR-derived fields are documented as weekly, while this packet relies on the sealed snapshot rather than assuming live currency.

The geometry source is the [City Building Outlines layer](https://webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer/1). It contains polygon geometry, `OBJECTID`, `outline_id`, `bldgID`, `GlobalID`, and area fields in EPSG:2230. It contains no APN, floor area, height, story, unit, occupancy, or use field. Its description establishes a Spring 2017 imagery baseline. The current service endpoint does not prove that the layer is a complete current structure inventory.

Official semantic evidence is archived with SHA-256:

- SanGIS parcel dictionary source: `8ce213b2820e674d866e9485f39417ff2aa110be8c5563b6480840fb5f4a3772`.
- City SanGIS field semantics: `35d493d6463ff269929b948b75ade615515932dcbdaded697f7636e5ba00f1f9`.

## Fact contract

Each fact carries APN, source record ID, fact key, typed value, unit, exact source semantics, fact state, source state, derivation class, acquisition, source vintage, linkage method, linkage confidence, provenance reference, limitations, and a state reason.

The contract uses the Parcel Truth states `supported`, `partial`, `unknown`, `not_applicable`, and `unavailable`; source states are `available`, `partial`, `source_unavailable`, and `not_evaluated`. Query failure is `unavailable/source_unavailable`. A missing source row is `unknown/available` with `NO_SOURCE_RECORD`. A source zero is `unknown/available` with `SOURCE_ZERO_UNRESOLVED`.

No empty footprint list is converted to a vacancy conclusion. No missing or zero area becomes `0` square feet.

## Concept separation

| Concept | Finding |
|---|---|
| Building footprint area | Derived plan-view area from official 2017 outline geometry; historical only. |
| Gross floor area | Unavailable. `FAR_NUMERATOR_NOT_YET_AVAILABLE`. |
| Living area | Parcel-level assessor `TOTAL_LVG_AREA`; not gross floor area and not footprint. |
| Assessed improvement area | Unavailable. `ASR_IMPR` is assessed value, not area. |
| Building count | Only a historical observed-outline count where spatial linkage is unambiguous. It is not current structure count. |
| Story count | Unavailable. |
| Structure height | Unavailable; no reference datum exists. |
| Dwelling units | Positive `UNITQTY` is supported at exact APN. Zero remains unknown. |
| Bedrooms | Raw encoded evidence only; no normalized fact. |
| Use/occupancy | Raw assessor use code only; it does not establish current legal occupancy. |

## Parcel linkage

The assessor path is exact APN: 393,733 source rows, 393,733 unique APNs, 393,733 matches, zero duplicate APNs, and zero orphans.

Building outlines have no APN. The offline spatial path groups identical Parcel V2 geometry first so stacked tax parcels are not mistaken for separate physical parcels. A positive-area intersection with one physical parcel group is eligible for linkage. Any outline intersecting more than one physical parcel group stays ambiguous with all candidate APNs and no selected winner. Touch-only intersections below 0.01 square foot are ignored.

| Outline linkage state | Count |
|---|---:|
| `SPATIAL_SINGLE_PARCEL` | 234,977 |
| `STACKED_PARCEL_GROUP` | 34,246 |
| `AMBIGUOUS_MULTI_PARCEL` | 115,836 |
| `ORPHAN_NO_PARCEL` | 1,158 |
| **Total** | **386,217** |

All three source identifier fields (`OBJECTID`, `GlobalID`, and `outline_id`) have zero duplicates in the City subset.

At APN scope, historical footprint states are:

| APN state | Count |
|---|---:|
| `ONE_FOOTPRINT` | 136,434 |
| `MULTIPLE_FOOTPRINTS` | 35,158 |
| `AMBIGUOUS_ONLY` | 83,846 |
| `NO_FOOTPRINT_RECORD` | 12,056 |
| `STACKED_GROUP_WITH_FOOTPRINTS` | 108,441 |
| `STACKED_GROUP_WITHOUT_FOOTPRINTS` | 17,798 |
| **Total** | **393,733** |

There are 272,940 physical parcel-geometry groups, including 5,446 stack groups covering 126,239 APNs. Stack-group footprints remain group evidence and are not copied into each APN as if separately owned.

## Coverage

Positive dwelling-unit counts are supported for 372,314 APNs. The 21,419 source-zero rows remain unknown. Supported living area exists for 368,171 APNs. Another 24,651 source-zero rows and 911 `99999` limit-value rows remain unknown, for 25,562 unknown living-area facts in total.

At least one supported current assessor structure fact exists for 374,090 APNs. The remaining 19,643 APNs have an exact source row but no promoted positive unit or living-area fact. That state is not “vacant.”

Historical outlines link directly and unambiguously to 171,592 APNs: 136,434 with one outline and 35,158 with multiple outlines. Current structure geometry, height, stories, and gross floor area remain supported for zero APNs.

## RS evaluation unlocks

| RS family | Structure facts needed | Available now? | Remaining blocker |
|---|---|---|---|
| Height | Height, datum, current geometry | No | No authoritative height or datum. |
| FAR | Gross floor area | No | `FAR_NUMERATOR_NOT_YET_AVAILABLE`; living area is excluded. Legal lot area and hillside context also remain unresolved. |
| Lot coverage | Current footprint area | No | Only historical 2017 footprints; legal premises area and hillside context remain unresolved. |
| Building spacing | Current structure geometry | No | Only historical geometry; proposed project scope remains absent. |
| Garage | Garage context and current geometry | No | Raw garage fields do not establish a current garage-context model. |
| Dwelling protection | Existing dwelling units | **Yes, for positive source values** | Zero remains unknown; proposed project scope is still required. |
| Third story | Story count, third-story dimensions, current geometry | No | None are available; proposed project scope is absent. |
| Accessory use/structure | Current use/type and geometry | No | Assessor use codes are approximate and do not identify accessory structures. |

This moves the Packet 14 dwelling-unit input from missing to source-supported where `UNITQTY > 0`. It does not make the whole rule family evaluable without project facts.

## Fixtures

Twenty-eight real Parcel V2 APNs cover no promoted structure fact, one and multiple historical footprints, stack/condo groups with and without outlines, RS-1-7 inside/outside/unknown Coastal contexts, another inside-Coastal RS case, split zoning, ambiguous zoning, missing addresses, available footprint facts, the unusable `99999` living-area value, source-zero behavior, and ambiguous footprint linkage.

Each fixture result carries zoning and Coastal context only for test stratification. No standard is applied and every fixture records `compliance_evaluated=false` and `capacity_calculated=false`.

## Provenance and fingerprints

Full artifacts are outside Git under `/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/`; compact evidence and integrity hashes are under `data/structure-facts-v0/`.

Canonical fingerprints:

| Output | SHA-256 |
|---|---|
| Source snapshot | `9264c361a88741a3d3c457c054b31d977a6fc98d825d0f55fb705a56fa04ed4c` |
| Source normalization | `7bb6ce2b672f986addf39b8fd2743b30867c8f0b0e385e1a266d8038f7fd9fc8` |
| Assessor normalization | `b23bf88b3b17eb34fc31a11788fd3bf4632973b47fa671c35f5a498bc865000f` |
| Footprint normalization | `27a5be27183810e8362b9a81dcacad17b3f46d8d7e1ece11ae11d21fab308651` |
| Parcel linkage | `ee4ec1da97e94d59cb8e8dee57446882752c8b55afeecd6bd2b1d8375ccdc576` |
| Structure fact outputs | `5773feb3818284e9ffada5d6a7069172b5e12647752b9f348ccf61561e96689c` |
| Fixture results | `4abdd3474832afb015c299248fd053496d9d1e2c8d3dd8d620e6f8e848272e1c` |

Canonical rendering is UTF-8 sorted-key compact JSON with no NaN, newline-delimited where applicable, and deterministic gzip `mtime=0`.

## Explicit limitations

- No structure-height or story source was found.
- No legally appropriate gross-floor-area source was found.
- No current authoritative building-footprint inventory with proven completeness was found.
- Spatial outline linkage is conditional and cannot supersede exact APN evidence.
- Condo/stack outlines remain group evidence.
- Source-zero units/area do not prove absence.
- Raw bedrooms, baths, garage, effective-year, usable-area, and use-code fields are not promoted.
- Parcel compliance, development capacity, FAR, lot coverage, and vacancy are not calculated.
- Parcel V1 and production runtime behavior are unchanged.
