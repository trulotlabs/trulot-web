# City of San Diego Base Zoning V2 rehearsal

Decision: `BASE_ZONING_V2_REHEARSAL_PASS`. This is an offline lineage and parcel-mapping rehearsal. It does not promote data, modify production, or connect zoning to Parcel V1.

## Authority and semantics

The source is the City of San Diego Planning **Zoning** dataset, published through SanGIS as item `e99981214e6348de8ddc3674f799c75d`, layer `Zoning_Base_SD/FeatureServer/0`. The City Open Data catalog describes it as current base-zone designations from the Official Zoning Map and subsequent rezone updates, with a weekly update cadence. The official Development Services zoning page distinguishes base zoning from supplemental overlays; planned/community-plan land use is also a separate City dataset and concept.

The source layer is polygon geometry in native `EPSG:2230`. `OBJECTID` is source identity, `ZONE_NAME` is the raw municipal designation, `IMP_DATE` is per-feature implementation-date evidence, and `ORDNUM` is the ordinance field. The layer supplies no zone-description field, so the rehearsal preserves each `ZONE_NAME` verbatim and does not attach standards or legal interpretations. Whether the polygons intentionally include rights-of-way or nonparcel areas is not explicit in the authoritative metadata and remains unresolved.

Source-reported service modification (`2026-08-10T22:44:01.705Z`), item modification (`2026-08-10T22:44:05.100Z`), per-feature `IMP_DATE`, and TruLot acquisition (`2026-09-24T20:11:39.821623Z`) remain separate timestamps.

## Immutable acquisition and validation

The official complete GeoJSON download produced 3,706 features and 19,627,631 bytes with SHA-256 `7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6`. Count and layer metadata were captured before and after download and stayed stable. The full artifact and HTTP evidence remain outside Git; the compact receipt is in `data/base-zoning-v2/acquisition.json`.

Validation parsed all 3,706 source features, found 3,706 distinct object IDs and 183 distinct nonnull raw zone codes, accepted 3,680 valid source polygons, and quarantined 26 self-intersecting source polygons. The source table contains only unrepaired valid geometry. Two independent validation runs produced identical accepted, rejected, and report bytes.

Discarding the 26 invalid features would remove evidence from 69,786 City parcels. The mapping layer therefore retains the raw quarantine and creates a separate, explicit `EXPLICIT_MAKE_VALID` derivative for each invalid feature using GEOS linework make-valid. Every derivation is labeled and retains source area, mapping area, absolute delta, and relative delta. All 26 derivatives are valid polygons; aggregate absolute area delta is about 0.0002104 square feet and the largest relative delta is about `2.19e-9%`. This is mapping geometry, not a silent change to source geometry.

## Parcel mapping model

The rehearsal loads the accepted Parcel Base V2 population, selects the 393,733 rows with authoritative `SITUS_JURIS=SD`, and retains every APN. For each parcel it calculates positive-area intersections against all zoning source features, aggregates area by raw zone code, and records contributing source object IDs and geometry state. Ordering is deterministic; no first intersection is selected.

The mapping method `base-zoning-city-sd-v2-area-coverage-v1` applies these rules:

| State | Rule |
|---|---|
| `SINGLE_ZONE` | Exactly one raw zone code and total coverage from 99.99% through 100.01% |
| `MULTI_ZONE` | More than one code, effectively full coverage, and material secondary area |
| `BOUNDARY_SLIVER` | Effectively full coverage and the sum of all secondary zones is at most both 0.01% and 10 square feet |
| `UNMAPPED` | No positive-area intersection; never translated to “unzoned” |
| `INDETERMINATE` | Evidence exists, but summed coverage is outside 99.99% through 100.01% |

The joint sliver threshold follows the full empirical distribution. Among 74,874 parcels with more than one raw zone code, all-secondary coverage percent has p01 `0.002279`, p05 `0.047281`, median `1.628163`, p95 `41.119422`, and p99 `48.774727`; all-secondary area has p01 `2.2343`, p05 `32.6252`, median `898.5283`, p95 `77,221.7869`, and p99 `242,010.1843` square feet. Requiring both limits treats only 1,097 parcels as slivers and retains 73,064 genuine material multi-zone conclusions.

| Mapping state | Parcel count |
|---|---:|
| `SINGLE_ZONE` | 317,604 |
| `MULTI_ZONE` | 73,064 |
| `BOUNDARY_SLIVER` | 1,097 |
| `UNMAPPED` | 327 |
| `INDETERMINATE` | 1,641 |
| **Total** | **393,733** |

There are 5,446 repeated physical-geometry groups containing 126,239 APNs. All groups have identical intersection evidence for identical geometry, while each APN remains a separate map row. This establishes APN-level results without claiming 126,239 unique physical sites.

## Contracts and Parcel Truth

`base_zoning_city_sd_v2` stores only valid raw source geometry and source attributes. `rejection` retains invalid raw source geometry and reasons. `mapping_geometry` contains all 3,706 explicitly labeled geometries used for intersection. `parcel_zone_intersection` and `parcel_zone_metric` define feature-level and code-level evidence. `parcel_base_zoning_map_v2` defines one APN row with acquisition IDs, method version, state, dominant and secondary coverage, distinct-code count, repaired-feature count, and complete JSON evidence. These are rehearsal definitions, not production migrations.

After the local import, the unpopulated final-map contract field was renamed from `invalid_source_envelope_count` to `repaired_source_feature_count` when the explicit derivative policy replaced the earlier envelope-only treatment. The import evidence retains both the executed DDL hash and final contract DDL hash. The populated source, quarantine, mapping-geometry, and parcel-input tables used by both read-only exports were unchanged.

The offline typed adapter returns supported facts for single, material multi, and boundary-sliver mappings while preserving every zone value. `UNMAPPED` becomes unknown with an available source, with an explicit statement that absence of coverage does not mean unzoned. `INDETERMINATE` returns partial evidence. Exceptions and malformed contracts return unavailable. Type-only Parcel Truth imports and dependency injection keep the adapter outside runtime.

## Historical evidence and checks

The legacy `base_zoning_mapping_v1` manifest remains unusable as lineage: it has no exact source, artifact, receipt, importer, or mapping definition. Reachable commit `b357bf8c711b3d703b0747aa4d2daabe71ba2b41` is a historical note that identifies the same official item and records bounded parcel examples. Five examples match their historical single code under the current mapping. APNs `5441922100` and `5490330700` now carry the historical code as dominant plus a material second zone; because the historical one-value sampling semantics are unknown, they are `LEGACY_SEMANTICS_UNKNOWN`, not mapping defects. APN `5442250200` lacks a recorded historical value and is also `LEGACY_SEMANTICS_UNKNOWN`. No historical value was used to tune current evidence.

The golden corpus covers every mapping state, a material split, a boundary sliver, a 64-row stacked group sample, a MultiPolygon parcel, an explicit source-geometry derivative, and historical APN `5490330700`.

## Determinism and performance

Two complete read-only PostGIS exports and two offline classifications from the same immutable inputs are byte-identical. The intersection export SHA-256 is `ded72029daf9f74a81efb39159f25513c720e8cc80a8fd8c66a757006f991945`; the compressed full map SHA-256 is `e90e223b3b06017b95e191aee8ec1de918dbb45abf836c4f209ae1c345cbf088`; the canonical mapping fingerprint is `313aa7ad46747bb97499a113842ac848de8f7357134e0558210692a1913a8ccf`.

The full read-only intersection exports took 62.684 and 63.791 seconds. Local warm `EXPLAIN ANALYZE` observations were 0.398 ms for parcel APN lookup, 0.680 ms for APN-to-zone spatial mapping, 35.318 ms for `RS-1-6` zone-to-parcel count, and 0.613 ms for a feature-level spatial probe. GiST geometry and B-tree APN/zone indexes are defined. These times describe the disposable local rehearsal, not production latency.

## Boundaries and decision

No production database, deployment, push, Parcel V1 runtime, zoning standards, density, FAR, height, capacity, overlay eligibility, or identity cutover changed. Parcel identity remains `IDENTITY_REQUIRES_FURTHER_RECONCILIATION`; independent zoning recovery does not change that decision.

The deterministic lineage is now:

```text
City base-zoning source → immutable acquisition → raw validation/quarantine
  → explicitly labeled mapping geometry → all-area parcel intersection
  → versioned mapping evidence → future Parcel Truth enrichment
```

Production promotion and serving integration require separate authorization.

Automatic approval review rejected the attempted DB-persisted local mapping rebuild because it classified the operation as database mutation. The completed path therefore used a read-only `SELECT`/`COPY` from the same guarded disposable inputs followed by deterministic offline classification. The two complete runs and full evidence hashes match; no persistent parcel mapping table was needed for this packet.

`BASE_ZONING_V2_REHEARSAL_PASS`

`READY_TO_DESIGN_ZONING_SERVING_INTEGRATION`
