# Packet 8 — clean Parcel Serving V2 rehearsal

Baseline: clean `/Users/ops/trulot-web-parcel`, branch `codex/trulot-parcel-v1-hardening`, HEAD `9db38a4da0d65cecfb219581d39bf9dfa3623b42`, tree `b5964f84b7ea2e812a527ae233e54995f28e3add`.

This packet defines **parcel identity and parcel-source facts only**. The new view and typed adapter are rehearsal artifacts. Canonical Parcel V1, `parcel_page_api_v2`, production, migrations, runtime clients and enrichment datasets are unchanged. Readiness below is for separately authorized shadow/dual-read work, not runtime integration or production deployment.

## Environment and source gates

Packet 7's repository-controlled `cluster.py create` created a fresh Unix-only PostgreSQL 17.9/PostGIS 3.6.3 environment at `/private/tmp/trulot-packet7-gxvndq2b`. Its Packet 7 prefix is retained because Packet 8 reuses the exact guarded tooling. Database `trulot_packet7`, schema `parcel_v2_rehearsal`, private socket and no TCP listener. No existing/shared database or production credentials are used.

All 37 acquisition inventory hashes, the raw artifact's **3,936,218,739 bytes** and SHA-256 `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544` were verified. Packet 7 import/reconciliation re-established **1,088,430 accepted countywide rows**, **1,328 quarantined rows**, and **393,733 SD rows**. The full base row fingerprint equals Packet 7's `8bdf89447fd77bd616a882db15875e8674b999051a1954caf1d4cec8a6c6df45`.

## Exact serving contract

Local objects: `parcel_serving_rehearsal.receipt`, `selected_acquisition`, and `parcel_serving_v2`. The singleton selection references exactly one receipt/acquisition. The view filters **`situs_juris='SD'`** from that selected snapshot. It does not union snapshots, choose one APN arbitrarily, deduplicate geometry, or discard non-SD source rows from the countywide base.

| Field | Type | Source/transformation | Null semantics |
|---|---|---|---|
| acquisition_id | text | selected base acquisition; resolves receipt | required |
| source_object_id | bigint | source objectid | required; unique within acquisition |
| apn_norm | text | Packet 5 strict APN normalization | required exact ten digits |
| parcel_id | bigint | source parcelid | required, explicitly nonunique |
| address | text | existing Packet 5 composition of number/fraction/directions/street/suffix | null when positive number or street unsupported |
| situs_components | jsonb | retained base situs components, including suite/building | component nulls retained; no invented values |
| situs_zip | text | recorded source ZIP | null remains unknown; blank source text is not inferred ZIP |
| situs_juris | text | authoritative source situs code | required SD in serving scope |
| geom | geometry,4326 | original acquired exported Polygon/MultiPolygon | required valid geometry; no repair |
| centroid | Point,4326 | preserved Packet 6 projected centroid derivation | required; may legitimately lie outside polygon |
| point_on_surface | Point,4326 | preserved Packet 6 representative point | required and containment verified |
| centroid_within | boolean | preserved containment test | required; false is not an error |
| approximate_geometry_area_sqft | double | Packet 6 geometry area measured in EPSG:2230, US-survey square feet | required positive; approximate derived quantity |
| taxable_acreage | double | source acreage | nullable; no zero substitution, no legal-lot-area claim |
| geometry_sha256 | text | Packet 6 canonical WKB identity hash | required; shared values retain separate APNs |
| native_crs | text | acquisition metadata | EPSG:2230, required |
| artifact_crs | text | acquired GeoJSON CRS | EPSG:4326, required |

No unlabeled `lot_area` is added. No source-dependent zoning, assessor structure, permits, overlays or activity fields are added. The source-row identity remains acquisition + object ID; current served APN uniqueness follows the selected accepted snapshot and is verified, not generalized to all source data.

## Scope and stacks

Expected and observed serving rows/APNs/source IDs: **393,733** each. Source-ID sets exactly equal the SD accepted base, with no additional inclusion/exclusion. **272,940 parcel IDs**; **126,239 rows in 5,446 repeated parcel-ID groups**, with the same counts for identical geometry groups. Two real stacked APNs sharing parcel ID and geometry have different canonical paths in adapter tests. No DISTINCT ON, geometry dedupe or merging occurs.

Countywide base count stays **1,088,430**. Future city expansion can select another authoritative situs code downstream using the same versioned base. Situs jurisdiction is assessor TRA-derived source scope, not an independent legal municipal-boundary assertion. Historical 393,364 is not used as a filter target.

## Receipt/provenance model

Each served acquisition resolves to one normalized receipt row holding dataset ID, acquisition ID/time, publisher, exact source/metadata endpoints, source temporal extent, artifact and metadata SHA-256, repository receipt reference, import identity and serving DDL SHA-256. Large metadata is not repeated on each parcel.

The import identity hashes sorted compact JSON containing the base acquisition lineage plus the executed Packet 7 importer/DDL hashes; exact inputs are recorded in `report.json`. Serving definition identity hashes `schema.sql`. These are deterministic content identities, not fabricated wall-clock import times. Adapter `FactProvenance` preserves acquisition time and temporal extent separately; `importedAt` and `viewCalculatedAt` remain null because no authoritative values for them were recorded. Temporal extent `2026-08-29T00:00:00` retains its unasserted timezone. The acquisition timestamp is `2026-09-24T18:43:39.950969+00:00`.

## Typed Parcel Truth and route behavior

`adapter.ts` imports existing Parcel Truth types with **type-only imports**, and reuses the pure canonical slug helper only after validating exact ten-digit APNs. It accepts a dependency-injected query callback; it contains no database client, credentials, environment loading, network calls or runtime route wiring. DB fixtures are extracted through the guarded local connection. TypeScript checks the mapping to existing `ParcelTruth`/`TruthFact` types.

| Lookup/result | Adapter status / truth |
|---|---|
| One valid scoped row | found; supported parcel identity |
| Successful scoped empty rows, zero quarantine, valid receipt | not_found; supported false **within selected scope** |
| Database exception/error, malformed response or missing receipt | source_unavailable; unavailable/null; never false absence |
| Any quarantined APN or multiple matching rows | partial; unknown/null, no data and no selected winner |
| Null address/acreage | unknown fact with available source, value null |
| Missing geometry/point or invalid required field | source_unavailable, not fabricated coordinates |
| Invalid/short APN | invalid_request; no query or padding |
| Permits/overlays | unavailable with sourceState=not_evaluated, not empty lists/false membership |

`found` here denotes supported parcel identity, not a fully enriched canonical page. Geometry area is `deterministic_derived`; taxable acreage is `recorded`; composed address is `deterministic_derived`. Provenance basis text states those meanings. Private database diagnostics are not exposed.

Routes retain `/parcel/san-diego/[slug]`. Valid APN/formatted-APN/address-slug inputs resolve by strict APN. The exact generated slug needs no redirect; incorrect address suffixes yield the computed canonical path. Null address yields `apn-<ten digits>`, not an invented situs address. No independent address-only lookup is implemented because shared/stacked addresses are ambiguous; canonical slug lookup uses its APN prefix and the same indexed APN query. Unlike the legacy extraction helper, eight/nine-digit inputs are rejected rather than padded.

All **five** repeated-APN source groups remain quarantined. The callback checks the selected acquisition's countywide quarantine before asserting absence, including duplicate groups outside SD. It reports unresolved source identity rather than pretending those APNs have no records. Resolving them requires source-row/geometry/business-identity adjudication and a separately reviewed acceptance/cardinality change. No winner is inferred from object ID, parcel ID, geometry or source order.

## Address validation

**14,846** served parcels have null composed addresses; all lack a positive supported street number, and **4,441** also lack street name. These groups overlap. No nonnull composed address lacks its required number/street. **86,740** rows have recorded suite text; **0** have building text. Suites/buildings remain separate components: the existing Packet 5 base-address policy does not concatenate them. APN subunits remain separate route identities, so shared base addresses do not merge condo/stacked records.

Tests cover ordinary situs, null/nonpositive number, null/blank street, malformed component types, suite/building retention, address-null APN routing and separate stacked paths. No base normalizer change was made. A future unit-display design may use retained source components; this packet does not invent unit labels or redefine accepted addresses.

## Area discrepancy observations

Scope: all **393,733** served rows. Geometry-derived area is present; taxable acreage is null for **374,698** and positive for **19,035**; no recorded zero-acreage rows were observed. Among rows with acreage:

- 32 differ by at most one square foot after acreage × 43,560.
- 9,262 differ by at most 1%.
- 1,534 differ by more than 10%.
- Geometry/source-area ratio percentiles (5th/50th/95th): **0.920251 / 0.999923 / 1.090072**.

This is a numerical discrepancy distribution between different source meanings, not a correction or assertion that either is legal lot area. No reconciliation, substitution, acreage filling or future assessor lot-area field is introduced.

## Legacy comparison

No trustworthy historical population snapshot was recovered. The committed rehearsal seed's invented `123 Main St` rows are test fixtures and are not treated as historical parcel evidence. The April 19 commit's homepage APN **5470501600** remains served; its displayed **740 47th St** matches current **740 47TH ST** ignoring display case. No historical parcel ID, geometry, area or full APN set with clean lineage exists for a broader comparison.

Population delta **+369** remains unresolved, not attributed to an assumed vintage change. Unsupported legacy enrichment is classified legacy-only/deferred. Replacing ambiguous refresh/area/coordinate labels with explicit provenance/derivation is a clean-V2 semantic correction, not proof the old numeric values were wrong. No candidate V2 defect was identified in this bounded rehearsal; full legacy parity is not claimed. Details: `legacy-comparison.json`.

## Query and deterministic rebuild evidence

Existing Packet 7 APN, parcel-ID, jurisdiction and spatial indexes suffice. No new broad tuning or address index was added. First-run local EXPLAIN ANALYZE times: exact APN **0.076 ms**, city count **120.385 ms**, bounding-box query **1.058 ms**, stacked parcel retrieval **0.497 ms**. Full plans for both runs are committed; these are warm/local observations, not production/API latency guarantees. There is no HTTP API or runtime endpoint in this packet.

Serving objects were dropped/recreated twice from the same DDL. Reports and real adapter fixture responses are byte-identical. APN-set fingerprint: `93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25`. Full ordered serving-row fingerprint: `a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f`. Receipt/import/definition references match. Query timing variation is recorded separately and excluded from deterministic equality.

## Deferred enrichment roadmap

| Deferred fact | Independent dataset/lineage required before joining |
|---|---|
| Base zoning, standards and descriptions | authoritative jurisdiction zoning geometry/zone-code definitions, dated acquisition/import and reviewed spatial join |
| Assessor structures, use, year, ownership and sales | separately authorized assessor/recorder records, definitions, exact vintages/receipts and APN cardinality |
| Permits | authoritative City permit source, event semantics, acquisition/import and audited parcel linkage |
| TPA, CTCAC, SDA and other overlays | independently acquired official geometries, provenance, point/parcel intersection semantics; SDA reconciliation remains unresolved |
| Community plan/neighborhood | authoritative plan/boundary datasets, identifiers and reproducible spatial joins |
| Development programs/capacity | sourced rules and citations plus verified zoning/overlay prerequisites; no inferred eligibility |
| Project/activity/opportunity signals | independently proven permit/project datasets and deterministic aggregation; no source-free scoring |
| Utilities/sewer | independently identified utility dataset and meaning; current legacy upstream unknown |

These are dependencies for future packets, not authorization to implement them. Keep each outside parcel identity/base until lineage and join cardinality are proven.

## Reproduction and validation

Use the already installed Packet 7 environment. All database commands go through its private Unix-socket guard:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/cluster.py create
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/import.py BOUNDARY_JSON ACQUISITION_DIR PACKET6_PASS_DIR CLUSTER_DIR/base-run
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/reconcile.py BOUNDARY_JSON PACKET6_PASS_DIR CLUSTER_DIR/base-run
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-serving-v2/rehearse.py BOUNDARY_JSON NEW_SERVING1_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-serving-v2/rehearse.py BOUNDARY_JSON NEW_SERVING2_DIR
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-serving-v2/test-rebuild.py BOUNDARY_JSON SERVING1_DIR SERVING2_DIR
node scripts/parcel-serving-v2/test-adapter.mjs
PYTHONDONTWRITEBYTECODE=1 python3 scripts/parcel-v2-postgis/cluster.py stop BOUNDARY_JSON
```

The 36 offline adapter checks, 16 local serving/rebuild checks and 20 re-established Packet 7 base checks pass. Existing safe regression suites, type generation, TypeScript and changed-file ESLint are run after serving validation; all pass except global lint's unchanged nearby-parcels no-explicit-any error and six pre-existing warnings; exact outcomes are retained in `validation.json`. Large source/database files stay outside Git. The disposable cluster was stopped after all checks; its clearly identified temporary directory may be removed after retaining any desired evidence. Do not remove the immutable acquisition directory.

Original checkout preservation: branch/HEAD/status/diffs/untracked inventory and all 57 tracked/nonignored file hashes match the initial snapshot. No runtime source, production migration, dependency/package state, deployment or push changed.

## Legacy field inventory

The following covers committed legacy DDL columns plus Parcel V1 dynamic field expectations. Field reads/source labels do not prove historical upstream lineage. INCLUDE means a clean V2 **replacement concept** is available, not reuse of legacy values. Exact 17-field V2 names/semantics are defined above. Full machine-readable evidence is `legacy-field-inventory.json`.

| Legacy field | Used by V1? | Known source | Clean lineage available? | V2 action |
|---|---|---|---|---|
| address | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — Packet 5 situs composition; null preserved |
| apn_norm | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — canonical APN from Packet 6 strict normalization |
| base_zone | Yes | Independent zoning dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| city | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — authoritative SD situs-jurisdiction code; no guessed city field |
| docdate | Yes | Recorder sales dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| generated_at | Yes | Legacy expression/fallback; exact upstream not recovered | No historical lineage proof | RETIRE — replace ambiguous refresh time with separate acquisition/source/import-definition provenance |
| geom | No | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — original exported WGS84 polygon; legacy Point meaning not inherited |
| has_nearby_active_project | No | Projects/permits/activity aggregates dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| last_sale_date | Yes | Recorder sales dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| lat | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — explicit centroid/point-on-surface longitude/latitude |
| lng | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — explicit centroid/point-on-surface longitude/latitude |
| lot_area_sqft | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — replace ambiguous field with approximate_geometry_area_sqft; derived, not legacy lineage |
| nearby_active_count | Yes | Projects/permits/activity aggregates dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| nearby_completed_count | Yes | Projects/permits/activity aggregates dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| nearby_project_count | Yes | Projects/permits/activity aggregates dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| neighborhood | Yes | Community-plan/neighborhood geography dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| nucleus_use_cd | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| owner_category | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| owner_type | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| owner_type_category | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| ownerocc | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| sale_date | Yes | Recorder sales dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| sewer | Yes | Exact upstream unknown; field name is not provenance | No | UNKNOWN — Exclude; recover utility source/meaning before design |
| sewer_type | Yes | Exact upstream unknown; field name is not provenance | No | UNKNOWN — Exclude; recover utility source/meaning before design |
| situs_community | Yes | Community-plan/neighborhood geography dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| situs_zip | Yes | Verified Parcel Base V2 acquisition/normalizer or authoritative jurisdiction metadata | Clean replacement available; historical population lineage remains unproven | INCLUDE — recorded situs ZIP |
| slug | No | Legacy expression/fallback; exact upstream not recovered | No historical lineage proof | RETIRE — compute canonical route from strict APN plus nullable composed address |
| state | Yes | Legacy expression/fallback; exact upstream not recovered | No historical lineage proof | RETIRE — omit legacy fallback constant from parcel fact model |
| status_label | No | Projects/permits/activity aggregates dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| total_lvg_area | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| year_effective | Yes | Assessor/ownership dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| zip | Yes | Legacy expression/fallback; exact upstream not recovered | No historical lineage proof | RETIRE — use only known situs_zip |
| zip_code | Yes | Legacy expression/fallback; exact upstream not recovered | No historical lineage proof | RETIRE — use only known situs_zip |
| zone_family | No | Independent zoning dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |
| zone_name | Yes | Independent zoning dependency indicated by current usage; exact lineage unproven | No | DEFER — Exclude until independent dataset acquisition/import/join lineage is proven |

PARCEL_SERVING_V2_REHEARSAL_PASS

READY_FOR_PARCEL_V1_DUAL_READ
