# Current City of San Diego Base Zoning V2 lineage

Decision: `BASE_ZONING_V2_READY_FOR_BOUNDED_PRODUCTION_LOAD`.

This packet establishes current source lineage and repeats the complete local mapping and serving rehearsal. It does not load production zoning, create production mapping rows, select a V2 snapshot, enable shadow reads, change Parcel V1, interpret development standards, deploy, or push.

## Authoritative source

The authority is the City of San Diego Planning **Zoning** dataset published through SanGIS: portal item `e99981214e6348de8ddc3674f799c75d`, service `Zoning_Base_SD/FeatureServer/0`. The [City catalog](https://data.sandiego.gov/datasets/gis-zoning/) describes it as current base-zone designations and boundaries updated after rezone actions, with weekly cadence. The [ArcGIS item](https://geo.sandag.org/portal/home/item.html?id=e99981214e6348de8ddc3674f799c75d) attributes the data to City Planning, rezone ordinances, and Development Services map data. Its published use terms are the [SanGIS public-data agreement](https://gis.sangis.org/sanportal/apps/storymaps/stories/d26146d84e834ff6bcd58e4e620a983a).

The source is polygon geometry in native `EPSG:2230`; the complete GeoJSON artifact is `EPSG:4326`. `OBJECTID` is source identity, `ZONE_NAME` is the raw designation, `IMP_DATE` is per-feature implementation-date evidence, and `ORDNUM` is the ordinance field. The dataset describes base zoning. Overlay zones, community-plan land use, and regulatory standards remain separate.

The current acquisition `zoning-city-sd-20260930T024032Z` completed at `2026-09-30T02:40:39.064005Z`. The service reports modification at `2026-08-10T22:44:01.705Z`; the portal item reports `2026-08-10T22:44:05.100Z`. The publisher does not state one dataset-wide legal effective date, so these timestamps remain separate from each feature's `IMP_DATE`. The source is byte-identical to the September 24 artifact.

## Source and geometry contract

The download has 3,706 features, 19,627,631 bytes, and SHA-256 `7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6`. Before/after metadata, count, and object-ID captures remained stable during acquisition. Large raw and normalized files remain in external immutable storage; compact receipts are committed in `data/base-zoning-v2-lineage`.

Two validation runs were byte-identical. They found 3,706 distinct object IDs, 183 nonnull raw codes, 3,705 Polygon features, and one MultiPolygon. They accepted 3,680 valid source polygons and quarantined 26 self-intersecting polygons. No null/malformed zone codes, empty geometries, duplicate IDs, or unexpected geometry collections were found.

The normalization rule is deliberately narrow: trim outer whitespace and uppercase. It never guesses malformed values. Every current raw code already equals its normalized code, so the observed change count is zero. Both values remain explicit in normalized records and in the complete domain inventory. Descriptive categories cover residential, commercial, industrial, mixed, planned/special, other base zones, and the literal source value `UNZONED`; they do not imply standards or capacity.

Invalid source geometry remains quarantined. A separate mapping geometry applies the existing bounded `GEOS_MAKE_VALID_LINEWORK` derivative, records its method and area delta, and retains source identity. All 3,706 features therefore have explicit mapping geometry without rewriting the accepted source table. The 26 derivative features intersect 69,786 City APNs.

## Deterministic parcel mapping

The mapping uses validated parcel acquisition `sangis-20260924T183743Z`, selects the 393,733 `SITUS_JURIS=SD` APNs, and calculates every positive-area parcel/polygon intersection in `EPSG:2230`. Evidence is aggregated by raw zone code and ordered by intersected area descending, then code. Every contributing source feature and intersection area remains available.

Method `base-zoning-city-sd-v2-area-coverage-v1` treats 99.99% through 100.01% as effectively complete coverage. A parcel with multiple codes is a boundary-sliver single-zone conclusion only when all secondary evidence is at most both 0.01% and 10 square feet; the secondary evidence is retained. Every other complete multi-code result is split-zone. No first intersection or blended zone is selected.

| Canonical state | Count |
|---|---:|
| `SINGLE_ZONE` | 318,701 |
| `SPLIT_ZONE` | 73,064 |
| `UNMAPPED` | 327 |
| `AMBIGUOUS` | 1,641 |
| **Total** | **393,733** |

The detailed evidence states retain 317,604 pure `SINGLE_ZONE`, 1,097 `BOUNDARY_SLIVER`, 73,064 `MULTI_ZONE`, 327 `UNMAPPED`, and 1,641 `INDETERMINATE` rows. This preserves the established internal contract while presenting the four Packet 9 truth states.

All unmapped parcels have positive distance to the nearest authoritative base-zoning geometry: 21 are 1–10 feet away, 38 are 10–100 feet away, and 268 are more than 100 feet away. They are coverage gaps or nonparcel-area cases, never “unzoned.” Among ambiguous rows, 1,375 have partial coverage below 99.99%, 112 have partial coverage involving a repaired source feature, 152 exceed 100.01% because source coverage overlaps, and two exceed it while involving a repaired source feature.

There are no duplicate mapping rows, orphan parcel references, or orphan zoning references. Two full intersection exports, mapping classifications, and compressed outputs are byte-identical.

## Parcel V1 comparison and casebook

Parcel V1 is comparison evidence, not zoning authority. A deterministic 146-APN stratified sample used exact read-only calls to the existing Parcel V1 API. All calls completed: 134 V1 rows were present and 12 were absent. Results were 63 exact single-code matches, 43 split-zone V2 rows where the V1 code remains among the source-backed codes, five split-zone material differences, three single-zone material differences, 12 V1-missing/V2-present cases, and 20 V1-present/V2-unmapped cases. No formatting-only matches were observed because both sources already used canonical formatting.

This sample is not a population-wide V1 zoning export. That limitation is explicit and does not make V1 authoritative. The 30-case casebook includes exact matches, V1-missing/V2-present, V1-present/V2-unmapped, material differences, split zones, boundary slivers, explicit quarantine derivatives, Packet 8 identity exceptions, and ambiguous coverage. No current scenario could honestly represent a formatting-only match, so the zero count is recorded rather than fabricated.

## Provenance, fingerprints, and serving

Every mapped fact follows:

```text
parcel acquisition/source object
  → parcel-zone mapping and intersection evidence
  → zoning acquisition/source feature
  → official City/SanGIS dataset and metadata
```

Portable fingerprints use sorted-key compact UTF-8 JSON and explicit float rendering:

| Artifact | SHA-256 |
|---|---|
| Source artifact | `7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6` |
| Normalized source identity | `559598ae4bf70a40356ff357c561b816fd415f0554d0f9761d6eede8fdc5d9a1` |
| Accepted normalized rows | `1119ce400cef7a3604897400c7081e6a7c9218702bd30371aa264344408ce1de` |
| Quarantine rows | `ec9db509e7c177d3c3357a39d8561921ace24a394aeb3d5a3836e1b8cea08632` |
| Zone domain | `e566224c06cb7b91b4893c9d8c5a178259be9f48d7ed2287ae14ce8a34e9411c` |
| Parcel-zone mapping | `531cd0b9457f273de676d3ca975d6746d20604d74bcdd697d09cb7bbb44f40b2` |
| Mapping-state distribution | `e2e11a3e1fe30d5ab06720e9bac09634b039d69f6a96fa5c47e482d71be3881c` |
| Integrated City output | `f08c6169b3dc7a9efba011e86bf51fe0cce449c95ca26f25ac41b5f4a1f1a680` |

Two integrated serving builds were byte-identical. Both retained 393,733 APNs, zero missing or duplicate joins, APN-set fingerprint `93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25`, and Parcel Serving full-row fingerprint `a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f`. `UNMAPPED` stays unknown, `INDETERMINATE` stays partial/ambiguous, and split-zone evidence remains multi-value. No development standards or capacity conclusions are present.

## Readiness and remaining boundaries

The current source, normalization, geometry handling, mapping, provenance, fingerprints, and integrated serving rehearsal support a separately authorized bounded production load into isolated `trulot_v2` zoning and mapping objects.

Packet 8 identity exceptions still block identity-dependent shadow serving and cutover. Production must preserve 327 unmapped and 1,641 ambiguous states, the 26 source quarantines and their labeled derivatives, the unknown dataset-wide legal effective date, and unresolved rights-of-way/nonparcel coverage semantics. A full V1 population zoning comparison remains unavailable from sealed offline evidence, but V1 is not the authoritative zoning source. Production load, selection, shadow reads, and Parcel V1 changes remain separately authorized actions.

`BASE_ZONING_V2_READY_FOR_BOUNDED_PRODUCTION_LOAD`
