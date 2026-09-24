# Packet 7 — Parcel Base V2 PostGIS import and San Diego scope

Baseline: clean `/Users/ops/trulot-web-parcel`, branch `codex/trulot-parcel-v1-hardening`, HEAD `2d93e2c281f4084916e787376674c359b568cec8`, tree `cfd9b409bd53cfd1a7baf5e5548fe22169e05738`.

## Isolation and provenance

PostgreSQL **17.9 Homebrew**, PostGIS **3.6.3**, GEOS **3.14.1**, PROJ **9.8.1**, with PROJ network disabled. A newly initialized private cluster lives at `/private/tmp/trulot-packet7-l_dqtez0/pgdata`, database `trulot_packet7`, schema `parcel_v2_rehearsal`. Connections use only `/private/tmp/trulot-packet7-l_dqtez0/socket`, port 55477, local role `ops`. `listen_addresses=''` means no TCP listener. Parent directory and socket permissions are 0700. Trust authentication is bounded to that private local socket; no production roles/grants are used.

`local.py` requires the dedicated temporary path, marker, fixed database/port/user, matching live data directory, empty listen addresses and Unix socket connection. It strips inherited database environment variables, does not read `.env` or production credentials, and rejects alternate targets before connection. No existing local/shared/Supabase database is used. The cluster was initialized with installed local binaries; no installation was needed. The maintained `cluster.py` records that workflow for future disposable runs.

Input: acquisition `sangis-20260924T183743Z`, immutable 3,936,218,739-byte GeoJSON SHA-256 `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544`. Packet 6's receipt/all 37 inventory hashes were reverified. Report SHA-256 `8d6aa8ea2b827e79573ec896ca7edae7fac053967e9ac68f1a06e734f2118ec5`; accepted/rejected row artifact SHA-256 `95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868`.

## Rehearsal schema and importer

`schema.sql` is a local rehearsal DDL file, **not a production migration**. It defines:

- Acquisition lineage: immutable raw/report/row hashes, counts, native and artifact CRS.
- Parcel base: acquisition-scoped source ID, raw/canonical APN, nonunique parcel ID, raw situs components/address/ZIP/jurisdiction, original WGS84 geometry, centroid, point-on-surface, containment flag, approximate geometry area and separately labeled taxable acreage.
- Quarantine audit: acquisition/source ID, raw APN and rejection reasons, separate from accepted parcels.

No zoning, permit, structure, overlay or opportunity fields enter the base. Original geometry is taken from the immutable raw artifact and checked against Packet 6's canonical geometry hash. Accepted/rejected decisions and normalized properties come from the checksum-verified Packet 6 row artifact. Raw/normalized positions and identities must match. Full CSV COPY occurs transactionally; any error rolls back, and no source geometry is repaired or reprojected by this importer.

PostGIS checks polygon/multipolygon type, 2D, nonempty and valid geometry. Packet 6's derived area/points are preserved rather than recalculated with different installed GEOS/PROJ versions. Independent database checks confirm zero point-on-surface containment failures and zero centroid-containment disagreements. PostGIS-normalized geometry group distributions independently equal Packet 6's GEOS-normalized WKB groups.

Primary key: **(acquisition_id, source_object_id)**. APN is a nonunique indexed business identifier; parcel ID and geometry are nonunique. Although accepted APNs are unique in this snapshot, they are unique partly because Packet 6 intentionally quarantines all repeated APNs. That does not establish APN as a universally unique source key. Actual temporary-table tests preserve repeated parcel IDs, identical geometry and repeated APNs, while rejecting duplicate acquisition/source IDs and malformed/null-required values. No winner row is selected and stacked APNs are never merged.

## Exact import reconciliation

Packet 6 values below refer to its **accepted population**, independently read from all retained row outputs. Its raw source totals include rejected rows and must not be compared directly to accepted-only database totals.

| Metric | Packet 6 accepted / audit | Database | Match |
|---|---:|---:|---|
| Accepted rows | 1,088,430 | 1,088,430 | Yes |
| Excluded rejected rows, separate audit | 1,328 | 1,328 | Yes |
| Accepted/quarantine overlap | 0 | 0 | Yes |
| Distinct canonical APNs | 1,088,430 | 1,088,430 | Yes |
| Distinct acquisition source IDs | 1,088,430 | 1,088,430 | Yes |
| Distinct parcel IDs | 747,491 | 747,491 | Yes |
| Repeated parcel-ID groups / rows | 12,480 / 353,419 | 12,480 / 353,419 | Yes |
| Shared geometry groups / rows | 12,479 / 353,419 | 12,479 / 353,419 | Yes |
| Polygon | 1,066,526 | 1,066,526 | Yes |
| MultiPolygon | 21,904 | 21,904 | Yes |
| Invalid / null geometry | 0 / 0 | 0 / 0 | Yes |
| Malformed / repeated accepted APNs | 0 / 0 | 0 / 0 | Yes |
| Missing situs address | 98,702 | 98,702 | Yes |
| Missing situs jurisdiction | 0 | 0 | Yes |
| Centroid outside | 17,812 | 17,812 | Yes |

All 1,088,430 accepted source-ID/APN pairs were compared individually with retained Packet 6 output. All 1,328 quarantine IDs/reasons matched individually. Samples, full jurisdiction distribution and full group-size histograms matched. No skipped/unexplained rows. Dataset count remains 1,089,758 = accepted + quarantine. Import receipts retain importer/DDL hashes, commands' inputs, durations and versions.

## Authoritative jurisdiction interpretation

The SanGIS REST field has **domain=null**; no coded-value domain is claimed. The authoritative XML `SITUS_JURIS` attribute definition supplies the table. `jurisdiction-metadata.xml` preserves the relevant attribute definitions; `jurisdiction-observation.json` records both its checksum and the original full metadata checksum. Tests parse the source definition to verify the mapping.

SanGIS defines situs jurisdiction as the jurisdiction in which the property is located, updated weekly from the first two digits of the assessor Master Property Record's six-digit Tax Rate Area. `08 → SD → City of San Diego`. `CN` is labeled County of San Diego; the accompanying `OVERLAY_JURIS` definition labels CN as Unincorporated. This supports the county/unincorporated category, but situs-jurisdiction membership is not an independent polygon-boundary determination. A `NULL` TRA prefix in that table is not permission to replace a null `situs_juris` with CN.

| Code | Authoritative situs name | Accepted rows |
|---|---|---:|
| CB | Carlsbad | 89,580 |
| CN | County of San Diego | 222,864 |
| CO | Coronado | 11,317 |
| CV | Chula Vista | 71,714 |
| DM | Del Mar | 4,793 |
| EC | El Cajon | 23,301 |
| EN | Encinitas | 23,785 |
| ES | Escondido | 38,824 |
| IB | Imperial Beach | 6,210 |
| LG | Lemon Grove | 7,403 |
| LM | La Mesa | 17,391 |
| NC | National City | 10,351 |
| OC | Oceanside | 64,041 |
| PW | Poway | 16,606 |
| SD | City of San Diego | 393,733 |
| SM | San Marcos | 28,475 |
| SO | Solana Beach | 13,107 |
| ST | Santee | 19,977 |
| VS | Vista | 24,958 |
| Null / unknown | Retained as unknown if present | 0 |
| **Total** | Countywide accepted source | **1,088,430** |

City SD: **393,733 distinct APNs**, **272,940 distinct parcel IDs**, **126,239 stacked rows in 5,446 groups**, **14,846 missing situs addresses**. Other incorporated cities total **471,833**; CN totals **222,864**. All 1,016 raw null-jurisdiction rows have null APNs and remain quarantined.

The source metadata separately defines `OVERLAY_JURIS` using a centroid overlay against `JUR_MUNICIPAL`. That field is not imported or used to replace the chosen situs rule. No independently verified municipal boundary geometry was found in the bounded local repository/acquisition evidence, so the optional city-boundary comparison was skipped; no new/unverified boundary dataset was introduced.

## Historical scope

**HISTORICAL_SCOPE_PARTIALLY_EXPLAINED**

Historical commit `23cbcc4351c4734a980e3303635758537701b51e` (April 19, 2026) claims **393,364** serving rows from `core.parcels` and `core.parcel_nearby_development_summary_v1`, with APN as serving PK. Its changes are frontend files, not an importer/filter. The homepage example `/parcel/5470501600/740-47th-st` is verified in the current local base as source object ID 2985, parcel ID 48354, jurisdiction **SD**.

Current source `SD` rows: **393,806**. Packet 6 excludes **73** of these (71 invalid geometry, 2 duplicate-APN rows), leaving **393,733**, which is **369 above** the historical claim. Thus current quarantine explains the raw-to-accepted delta, **not** the historical delta. City situs jurisdiction is an authoritative independently defined rule, and population size/example membership support a city-sized historical corpus. The exact previous scope filter and exact historical input remain unavailable. Vintage changes, import bugs or representation differences are possible explanations, not established findings. No equality was forced; no stacked rows or other source facts were changed to match 393k.

## Rejection review

All 1,328 quarantined rows were reviewed against the original raw feature stream. Disjoint categories:

| Category | Rows | Evidence and disposition |
|---|---:|---|
| Null APN only | 1,004 | Source APN, situs jurisdiction and situs number are null. Unsupported APN-bearing identity; exact source purpose unknown. |
| Null APN plus invalid geometry | 12 | Both source issues retained. |
| Invalid geometry only | 301 | Raw GEOS validity failures. |
| Repeated APNs | 10 | Five two-row groups, all retained in quarantine. |
| Short ring | 1 | Closed three-position ring; too few points, not a missing closure. |

Geometry detail: **169 ring self-intersections**, **144 self-intersections**, **1 too-few-points geometry component**. These are unusable under the present polygon validity contract; no automatic repair or topology reinterpretation was attempted. Source-null APNs are not numeric normalization failures, and should not be described as damaged digit strings. Their precise source semantics are not established.

Of five duplicate APN groups, **two** share parcel ID and identical geometry; **three** have different parcel IDs/geometries. The latter may be legitimate multi-row representations, but this evidence cannot adjudicate source business identity. They are unsupported by the current intentional duplicate-quarantine contract. Future serving design must not treat that quarantine-induced uniqueness as universal source APN uniqueness.

No normalizer defect was identified by these checks. No claim is made that all quarantined rows lack real-world meaning. Accepted population remains unchanged; any future recovery/adjudication requires an explicit separately reviewed contract change.

## Query rehearsal and rebuild

Indexes: acquisition/source-ID primary key; nonunique APN, jurisdiction and parcel-ID B-trees; geometry GiST. First-run representative EXPLAIN ANALYZE evidence:

| Query | Observed plan | Execution time |
|---|---|---:|
| APN `5470501600` | APN Index Scan | 0.036 ms |
| Acquisition + source object ID | Primary-key Index Scan | 0.053 ms |
| City SD count | Parallel Sequential Scan / Aggregate | 88.486 ms |
| Small WGS84 bounding box | Geometry Bitmap Index/Heap Scan, 198 candidates | 0.695 ms |

The broad city count covers ~36% of the table; the planner chose a parallel scan despite the jurisdiction index. No forced plan, premature application tuning or production performance claim is made. Bounding-box candidates are not city-boundary membership. Both runs' full plans/buffer observations are retained in the aggregate evidence.

The schema is dropped/recreated **only after the local boundary guard succeeds**, inside the importer transaction. Two independent full imports use the same immutable raw and Packet 6 artifacts. Counts, all distributions, quarantine, deterministic samples and a SHA-256 over every imported row serialized in acquisition/source-ID order must match. Timings are recorded separately and excluded from deterministic equality.

## Reproduce and dispose

The exact installed Python/Shapely environment from Packet 6 and local Homebrew PostgreSQL/PostGIS are prerequisites. From the isolated repository:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/cluster.py create
# Use the new boundary.json path printed by create; never substitute a shared database.
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/import.py BOUNDARY_JSON ACQUISITION_DIR PACKET6_PASS_DIR NEW_RUN1_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/reconcile.py BOUNDARY_JSON PACKET6_PASS_DIR RUN1_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/test.py BOUNDARY_JSON RUN1_DIR
# Import recreates only the guarded disposable schema; this is the independent rebuild.
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/import.py BOUNDARY_JSON ACQUISITION_DIR PACKET6_PASS_DIR NEW_RUN2_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/reconcile.py BOUNDARY_JSON PACKET6_PASS_DIR RUN2_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/test.py BOUNDARY_JSON RUN1_DIR RUN2_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/cluster.py stop BOUNDARY_JSON
```

Large database files and run outputs remain outside Git. Guarded `stop` terminates the dedicated cluster and retains files for inspection. After confirming it is stopped, the specifically identified `/private/tmp/trulot-packet7-l_dqtez0` directory may be removed to destroy this disposable environment. Raw acquisition under `/Users/ops/trulot-data/parcel-base-v2/` is separate and must remain intact.

## Next architecture and boundaries

Immutable SanGIS acquisition → **countywide accepted `parcel_base_sangis_v2` with separately retained quarantine** → separately sourced enrichment datasets → future serving view → Parcel Truth contract.

For a City of San Diego product, apply **`situs_juris='SD'` downstream**, retain the acquisition ID and source-row identity, and expose APN as an indexed business lookup with explicit cardinality handling. Countywide preservation retains source context and legitimate stacked ownership/tax interests. Situs scope is not a legal boundary claim. No serving relation is implemented here, no V1 connection is changed, and historical V1 lineage classifications remain unchanged.

This result supports designing serving V2. Production remains blocked on destination/recovery design, grants/security, quarantine policy review, independently sourced enrichment joins/cardinality and serving compatibility. It is **not production-ready**.

## Validation and preservation

Existing receipt/source/acquisition suites (23/32/37), strict stream tests (7), acquisition stub tests (3), Parcel Truth (19), overlay (43), SDA (6 groups), foundation tests (25), foundation/data validators, freeze tests (18), dry-run parser and adapter tests pass. All **21 local integration checks pass** and exercise DDL creation, lineage, all accepted IDs/APNs, quarantine, stack preservation, authoritative mappings, city scope, column boundaries, geometry/point validity and repeated import equality. Negative connection tests reject socket/database/path/port/user substitutions without attempting a connection. `next typegen`, TypeScript and Git whitespace checks pass. Changed-file ESLint is not applicable: this packet adds Python/SQL/docs/JSON/XML, no JS/TS changes. Global lint retains the unchanged nearby-parcels `no-explicit-any` error and six existing warnings.

Production untouched; no production migration, deployment, push, runtime Parcel V1 edits, zoning/permit/overlay implementation or Packet 8 work. Original checkout branch/HEAD/status/diffs/untracked inventory and all 57 tracked/nonignored file hashes are compared before and after work.

## Recorded rebuild result

First import: **178.168 seconds**. Second import: **179.772 seconds**. Both import receipts have identical importer/DDL hashes and all nontiming fields. Complete reconciliation reports are byte-identical, SHA-256 `502c62ed889475284ad1799b277f0c963cb8d43dfeb69e78041efd264a8ed652`. The SHA-256 of every database row serialized in acquisition/source-ID order is `8bdf89447fd77bd616a882db15875e8674b999051a1954caf1d4cec8a6c6df45` in both runs. The cluster was stopped after successful validation; its explicitly identified temporary directory remains available for inspection, outside Git.

PARCEL_BASE_V2_DB_REHEARSAL_PASS

HISTORICAL_SCOPE_PARTIALLY_EXPLAINED

READY_TO_DESIGN_PARCEL_SERVING_V2
