# Packet 6 — real SanGIS acquisition rehearsal

Baseline: `/Users/ops/trulot-web-parcel`, branch `codex/trulot-parcel-v1-hardening`, clean HEAD `75d5dc1f017465f76806d97f4a3247971c17c2bb`, tree `bc1bb8de87fdb3bf35b031fbf0202fae1c320d53`.

## Source and complete export

Verified publisher/portal owner **SanGIS**, public host **SANDAG**, item `032a5dcf654c4ccbb18711ad8a0ee754`, layer index **0**, service layer name **Parcels**, XML metadata title **PARCELS_ALL**. Source: <https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0>; XML metadata appends `/metadata`. Native CRS is EPSG:2230 (legacy WKID 102646), Polygon, `hasZ=true`, `hasM=false`. The source advertises Query/Extract, maxRecordCount 2,000, pagination and ordering, count/ID queries, and CSV, Excel, featureCollection, file geodatabase, GeoJSON, KML, shapefile and SQLite exports. Full before/after metadata, portal item/license, warehouse PDF, HTTP headers, job requests/responses and executed scripts are preserved and individually hashed outside Git.

No authoritative standalone archive was linked to the verified item. The selected complete service export uses `POST .../FeatureServer/createReplica`, `syncModel=none`, layer 0, queryOption=all, useGeometry=false, includeRelated=false, replicaSR=4326, dataFormat=geojson, returnAttachments=false and async=true. There is no where/spatial subset. [Esri documents](https://developers.arcgis.com/rest/services-reference/enterprise/create-replica/) that syncModel=none exports without creating a synchronized replica. No source records were edited. No pagination was necessary. Failed pages were not skipped. A complete unique object-ID inventory, count and edit timestamp were captured; count/edit metadata stayed unchanged across export, and every advertised ID occurred exactly once in the artifact. This establishes observed consistency, not a separately guaranteed database transaction or native-source archive.

## Immutable acquisition

- ID: `sangis-20260924T183743Z`.
- Acquired: `2026-09-24T18:43:39.950969+00:00`.
- Directory: `/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z`.
- Original server filename: `_ags_GeoJson_EB07F5BCE8A34D208D2A6A7801151FB3.geojson`.
- Type: GeoJSON FeatureCollection, EPSG:4326 longitude/latitude.
- Size: **3,936,218,739 bytes**, matching HTTP Content-Length.
- SHA-256: `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544`.
- All 37 raw/metadata/provenance files are read-only, with sizes and SHA-256 recorded. Inventory aggregate SHA-256: `8d4dd54fb20ae25dd3fbdccaa8adec0fab1f6e74ff3164b3027204085491a420`.
- Aggregate rule: UTF-8 compact JSON of files sorted by path, with keys sorted (`byteSize`, `path`, `sha256`), then SHA-256. `acquisition.json` is the manifest, not a self-hashed member.
- Actual acquisition tool: Python 3.14.6 urllib; executed discovery/export/downloader scripts are archived with hashes. The maintained `acquire-sangis-parcels.py` consolidates that process and has an offline service-stub test; it was not used to reacquire a second snapshot.
- Terms: captured portal item `licenseInfo` and [SanGIS terms reference](https://gis.sangis.org/sanportal/apps/storymaps/stories/d26146d84e834ff6bcd58e4e620a983a). Derived output is not represented as original SanGIS data.

Source dates remain separate:

| Meaning | Source-reported value | Evidence |
|---|---|---|
| Service modification | 2026-09-02T15:10:55.582Z | layer editingInfo.lastEditDate |
| Warehouse upload | 2026-08-31 | captured Layer_Update_Report.pdf, Parcels row |
| Metadata temporal extent | 2026-08-29T00:00:00, no timezone asserted | metadata/dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition |
| TruLot acquisition | 2026-09-24T18:43:39.950969+00:00 | completed byte download |

The portal item's modified time is separately preserved in item metadata; it is not substituted for parcel currency.

## Actual schema

All 14 required fields exist with expected types, and every acquired feature was checked for presence/type (zero missing-field/type rejections).

| Expected concept | Actual field | Source type | Present? | Action |
|---|---|---|---|---|
| Object ID | objectid | OID/integer | Yes | retain; require unique |
| APN | apn | String | Yes | exact Packet 5 normalization; reject malformed/duplicate |
| Parcel identifier | parcelid | Integer | Yes | retain; nonunique |
| Situs number | situs_address | Integer | Yes | compose only if positive and street present |
| Situs direction/street/suffix/fraction/building/suite | situs_pre_dir, situs_street, situs_suffix, situs_post_dir, situs_fraction, situs_building, situs_suite | String | Yes | retain raw components; no invented address |
| Situs ZIP | situs_zip | String | Yes | retain |
| Situs jurisdiction | situs_juris | String | Yes | contract code or null; reject unknown nonnull code |
| Taxable acreage | acreage | Double | Yes | separately labeled, never legal lot area |
| Geometry | GeoJSON geometry | Polygon/MultiPolygon | Yes | strict original geometry validator |
| CRS | layer extent / requested replicaSR | native 2230 / exported 4326 | Yes | preserve both identities |

The full excluded-field list is in `report.json`. The raw export includes assessor valuations (`asr_land`, `asr_impr`, `asr_total`), assessed zoning/use, unit quantity, effective year, living area, bedrooms/baths, garage/carport/pool and other characteristics. These were **excluded** from normalized Parcel Base V2. Raw extra names are retained in row validation artifacts. GeoJSON uses `shape_Length`/`shape_Area` where REST metadata names `SHAPE__Length`/`SHAPE__Area`; neither is imported as a parcel-base fact. Raw source remains unchanged outside Git.

## Counts and geometry

| Metric | Count |
|---|---:|
| Source advertised / unique advertised IDs | 1,089,758 |
| Acquired / parsed | 1,089,758 |
| Accepted | 1,088,430 |
| Rejected, retained with reasons | 1,328 |
| Duplicate APN rows, all quarantined | 10 |
| Duplicate object-ID rows | 0 |
| Malformed APN rows | 1,016 |
| Missing composed situs address | 99,849 |
| Null jurisdiction | 1,016 |
| Unknown nonnull jurisdiction codes | 0 |
| Merged / unexplained lost rows | 0 |
| Polygon | 1,067,816 |
| MultiPolygon / multipart rows | 21,942 |
| Rows with holes / interior rings | 6,625 / 17,339 |
| Geometry rejected | 314 |
| Null geometry | 0 |
| All coordinates 2D | 1,089,758 |
| Z/M coordinates in export | 0 |
| Derived centroid outside polygon | 18,086 |

Geometry rejection reasons: 313 `INVALID_GEOMETRY`, 1 `UNCLOSED_OR_SHORT_RING`. APN rejection reason occurrences: 1,016 `INVALID_APN`, 10 `DUPLICATE_APN_OR_OBJECTID`. Reasons overlap; 1,340 reason occurrences represent 1,328 distinct rejected rows. No auto-repair, APN padding/truncation, winner selection or silent dropping occurred. Missing situs is retained as null and does not itself reject a parcel. The centroid-outside count is measured for geometry-valid rows, including rows rejected for attributes; separate point-on-surface is retained and checked to lie in the polygon.

The authoritative exporter performed native 2230 → 4326 conversion; its internal transformation implementation is not independently reproduced from a native artifact. Offline measurement/centroid derivation uses Shapely 2.1.2, GEOS 3.13.1, pyproj 3.7.2, PROJ 9.5.1, network OFF, always_xy, allow_ballpark=false, EPSG:4326 → 2230 → 4326. Exact selected PROJ pipelines and 4-meter reported transformation accuracy are in `report.json`. Areas are approximate US-survey square feet. No claim of legal/survey accuracy is made. Rings, multipart geometry and holes are not repaired or flattened.

## Stacked parcels

`source-stack-audit.json` covers **all 1,089,758 source rows**, including malformed APNs. Repeated parcel IDs: **12,489 groups / 353,580 rows**. Distinct canonical APNs sharing parcel IDs: **12,487 groups / 353,576 rows**. Representable valid geometry hashes cover 1,089,444 rows; repeated identical geometry: **12,481 groups / 353,423 rows**; distinct canonical APNs sharing identical geometry: **12,479 groups / 353,419 rows**. Identity means GEOS-normalized WKB equivalence, not approximate spatial matching; missing/invalid geometry hashes are excluded.

Among accepted rows, **12,480 parcel-ID groups / 353,419 rows** remain stacked; **12,479 identical-geometry groups / 353,419 rows** remain separate. Zero merges. The original `report.json` source stack tables restrict membership to valid canonical APNs; the supplementary source-wide audit explicitly restores malformed-APN rows to group population totals. Both include complete group-size frequency distributions.

## Repeatability and samples

Two independent full parses/geometry validations used the same immutable bytes, separate processes and separate new directories ending `-pass1` / `-pass2`. Both validated the raw artifact hash before and after processing. Complete reports are byte-identical, SHA-256 `8d6aa8ea2b827e79573ec896ca7edae7fac053967e9ac68f1a06e734f2118ec5`. All row output: 106,114,287 compressed bytes, SHA-256 `95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868`. Rejections: 135,091 compressed bytes, SHA-256 `f04e55fa5b60a5fce7112495cbd6c0981ae8c47d431a16a5524c515f27e50522`. Full equality includes counts, reasons, schema, geometry, jurisdictions, stacks and samples. Independent supplemental sample/stack extraction also matches.

`deterministic-samples.json` preserves Packet 5's first three accepted rows by SHA-256(artifact hash + colon + source object ID), numeric-ID tie break, plus minimum-ranked representatives for ordinary, missing situs, multipart, holes, stacked, duplicate APN, rejected anomaly, centroid outside and all 19 jurisdictions. No raw APNs, situs addresses or coordinates are committed in these samples. Large row outputs retain canonical APNs, composed-address/null status, jurisdiction, geometry status, centroid/point-on-surface, approximate area and rejection reasons outside Git.

## Offline reproduction

From the isolated repository, using already installed dependencies and the exact pinned geometry libraries:

```sh
node scripts/verify-sangis-acquisition.mjs /Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z
node --max-old-space-size=8192 scripts/rehearse-sangis-acquisition.mjs /Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z /absolute/new-pass-directory
node scripts/compare-sangis-rehearsals.mjs /absolute/pass1 /absolute/pass2
node scripts/sample-sangis-rehearsal.mjs /absolute/pass1
PYTHONDONTWRITEBYTECODE=1 python3 scripts/audit-sangis-stacks.py /absolute/pass1
```

The acquisition verifier checks every inventory hash plus source identity, metadata currency, schema, export parameters and count/ID evidence. The stream rehearsal independently checks raw hashes, full ID coverage, schema, unchanged count/edit metadata and all row semantics. Use both. Parser failures/truncation abort; they never become a successful subset. Outputs require a new external directory; intermediate files from a failed run are diagnostic only. This retains separate raw, pre-duplicate and final/rejected layers without editing the source.

To acquire a **future** snapshot when authorized, `python3 scripts/acquire-sangis-parcels.py /absolute/new-acquisition-directory` uses public endpoints only, requires unchanged verified identity, captures provenance, retries bounded metadata GETs, never retries export POST blindly, and fails on source change, truncated download, timeout or export failure. It never installs dependencies or connects to a database. Export filenames/job URLs may change; reproducibility here is full deterministic processing of an immutable snapshot, not a promise that a future live export has the same bytes.

## Validation and limits

PASS: Packet 5 receipt (23), Packet 5 source (32), new acquisition regression tests (37), strict stream/geometry tests (7 groups), stub acquisition tests (3), real receipt/all 37 file hashes, two complete real rehearsals and output comparison; Parcel Truth (19), overlay (43), SDA (6 groups), foundation (25), foundation/data validators, production freeze (18), dry-run parser and production-adapter fixtures. `next typegen`, TypeScript `--noEmit --incremental false`, ESLint on changed JavaScript, and Git whitespace checks pass. Global lint retains one unrelated `supabase/functions/nearby-parcels/index.ts:125:67` no-explicit-any error and six unchanged warnings.

Deviations from Packet 5 assumptions: bulk export uses replicaSR and cannot send returnZ; the receipt records returnZ=null, while geometry remains strictly 2D and synthetic receipts require false. Full-artifact parsing is streamed beyond the synthetic harness's 100-feature limit and reuses its unchanged normalizer/geometry function. Category samples supplement the original first-three policy. Actual data demonstrates duplicate/malformed APNs and invalid geometry; these are quarantined rather than weakening acceptance. Extra assessor fields remain excluded. Source-wide stack totals explicitly include malformed APNs. Source modification, warehouse upload, temporal extent and acquisition are separate evidence.

Optional local database rehearsal **skipped**: filesystem validation sufficed; no database was provisioned or contacted. Proven: clean V2 source identity → acquired immutable bytes → receipt and metadata → full deterministic normalization/reconciliation. Not proven: native export transform internals, destination DDL/import/indexes, database APN lookups, staging/recovery, production data state, enrichment cardinality or serving compatibility. V1 historical classifications remain unchanged. `productionReady=false`; no live manifest or serving relation is replaced.

Original checkout `/Users/ops/trulot-web`: branch `codex/elevate-row-interview`, HEAD `8d82378e5b6a3cb2aba1153b96f025bc71a78d16`, identical before/after Git status/diffs/untracked inventory and hashes of all 57 tracked/nonignored files. Existing modified nearby-parcels source, untracked SDA discovery document and `supabase/.temp/` remain intact. No application source, SQL, migrations, packages, production, deployment or remote Git state was changed by Packet 6.

REAL_SANGIS_ACQUISITION_REHEARSAL_PASS
