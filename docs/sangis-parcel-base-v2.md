# SanGIS parcel base: recovery decision and V2 contract

Packet 5 baseline: `5bea2257c46ba6290b197c93f59061093c68caeb` on `codex/trulot-parcel-v1-hardening`. Public metadata observed September 24, 2026; precise observation time and document digests are in `data/parcel-base-v2/source-observation.json`. Packet 5 was metadata research and an offline fixture proof. Packet 6 subsequently acquired and twice validated a complete real snapshot; see [the acquisition rehearsal](sangis-parcel-acquisition-rehearsal.md).

## Decision

**PARCEL_BASE_V2_REQUIRED**

Historical lineage is not recoverable from the repository and bounded local evidence inspected. The required chain has no exact source artifact/immutable version, acquisition receipt, artifact checksum, executable importer, complete destination definition or imported-row-to-serving validation. A named publisher and a historical row-count assertion do not satisfy those requirements.

V2 is a clean future lineage boundary. Its contract and synthetic tests provide no proof of the historical V1 data and do not upgrade `parcel_base_sangis_v1` or `parcel_page_api_v2` classifications.

## Historical evidence search

Read-only inspection covered the current repository, filenames across all 173 locally reachable commits, relevant commit messages, and history searches for SanGIS, parcel exports/imports, GIS formats, staging/raw/core relations, COPY, GDAL/ogr2ogr, checksums, schema and import/runbook evidence. Old commits were not restored. No remote Git fetch was performed.

A bounded filename walk of `/Users/ops/trulot-web` and `/Users/ops/trulot-web-parcel` excluded Git internals, installed dependencies, generated Next output, linked-service temp metadata and symlink traversal. No candidate `.shp`, `.shx`, `.dbf`, `.geojson`, `.gpkg`, `.zip`, `.gdb`, `.csv` or `.parquet` files were found. There were no candidate source-file sizes/mtimes/checksums to report. No home-directory crawl or shell-history/credential inspection occurred. Filesystem modification times were not treated as acquisition dates.

| Artifact | Location | Classification | What it proves |
|---|---|---|---|
| April parcel rollout commit | `23cbcc4351c4734a980e3303635758537701b51e`, commit message | historical note only | Claims PostgreSQL 17 `core.parcels` + `core.parcel_nearby_development_summary_v1` supplied 393,364 serving rows; mentions pending `raw.sd_parcels` address re-export. No source file, importer or receipt accompanies it. Its diff changes three frontend files. |
| Initial engine and subsequent adapters | Reachable history from `a149bff`; current `lib/parcel-page-v1.ts`, `lib/parcel-slug.ts` | transformation code | Downstream normalization/rendering and source expectations; not acquisition/import logic. Existing APN padding is not an authorized source-normalization contract. |
| Parcel manifest | `data/dataset-manifests/2026-07-11-foundation.json` | historical note only | SanGIS publisher assertion; dates/checksum/importer explicitly unknown or unverified. |
| Rehearsal baseline | `supabase/rehearsal/20260711_remote_public_baseline_subset.sql` | serving schema | Partial serving shape and permissions, not complete source/import/serving lineage. |
| Rehearsal seed/report | `supabase/rehearsal/20260711_seed_minimal_data.sql`; `data/security/migration-rehearsal-report-2026-07-11.json` | validation evidence | Synthetic fixture results only. |
| Security metadata summary | `data/security/remote-security-baseline-2026-07-11.json` | validation evidence | Historical schema/security observations, not source receipts. |
| Reconciliation, security gate, audit, field mapping and runbooks | `docs/repository-database-reconciliation-2026-07.md`, `docs/trulot-data-foundation-security-gate-2026-07.md`, `docs/audits/TRULOT_TECHNICAL_AUDIT_2026-07.md`, `docs/parcel-page-v1-field-mapping.md`, `docs/deployment-readiness-runbook-2026-07.md` | historical note only | Missing-lineage acknowledgments, serving field expectations and references to temporary schema dumps. |
| Referenced schema dumps | `/private/tmp/trulot-public-schema.sql`, `/private/tmp/trulot-public-schema-fresh.sql`, `/private/tmp/trulot-full-schema.sql`, `/private/tmp/trulot-remote-full-baseline-2026-07-11.sql` | ambiguous/unusable | All four paths absent at inspection. Even schema dumps alone would not prove source acquisition/import. |
| Other SQL/history | Linkage/overlay migrations, reporting backfill, historical-driver pilot SQL | transformation code / ambiguous for parcel acquisition | Downstream or unrelated transformations; no parcel source importer. |

No authoritative historical parcel source artifact, acquisition receipt, source checksum/version evidence or parcel-base import code was found. The local database names mentioned in the commit are recovery leads, not inspected databases; this packet makes no live database calls.

## Current authoritative public source identity

- Publisher: **SanGIS**, using County Assessor/Recorder/County Clerk records; public hosting by SANDAG. The portal item owner is `SanGIS`.
- Public layer: **Parcels**, layer 0; metadata title **PARCELS_ALL**. Countywide tax parcels, not a legal-subdivision/lot determination.
- [Service/schema](https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0), [metadata XML](https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/metadata), [portal item metadata](https://geo.sandag.org/portal/sharing/rest/content/items/032a5dcf654c4ccbb18711ad8a0ee754?f=pjson), [SanGIS warehouse](https://gis-sangis1.hub.arcgis.com/pages/download-data).
- Item ID: `032a5dcf654c4ccbb18711ad8a0ee754`. The identified service is a current public publication endpoint, not an immutable historical artifact.
- Native CRS: EPSG:2230 / Esri WKID 102646, NAD83 California zone 6, US survey feet. The service advertises Polygon geometry, Z support and JSON/GeoJSON/PBF query output. Full field names/types are preserved as metadata facts in the source observation.
- APN is a full ten-character string. Metadata defines the final two digits as the subunit. `PARCELID` is explicitly nonunique; multiple APNs can refer to one polygon identifier. Stacked condos, possessory interests and mobile homes must not be dissolved into a single taxable parcel.
- The [warehouse update report](https://gis.sangis.org/Documents/download/Layer_Update_Report.pdf), as of September 1, 2026, lists Parcels upload August 31, 2026. It expressly distinguishes upload from underlying data currency.
- The inspected XML temporal extent is `2026-08-29T00:00:00` (no timezone supplied), at `metadata/dataIdInfo/dataExt/tempEle/TempExtent/exTemp/TM_Instant/tmPosition`. This is a source-reported temporal extent, not a guarantee every parcel/attribute was refreshed that day. XML metadata date is `20260831`; portal item modification is September 2, 2026. Keep these separate.
- **TruLot parcel acquisition date: absent.** Reading metadata does not create a parcel dataset acquisition receipt.
- The [published SanGIS legal notice](https://gis.sangis.org/sanportal/apps/storymaps/stories/d26146d84e834ff6bcd58e4e620a983a) is linked from the item's `licenseInfo`. It includes use/disclaimer and derivative-attribution conditions. Retain and review the applicable full terms before acquisition/distribution; no unrestricted-license claim is made here.

Property-characteristics caveat: the warehouse report calls Parcels a product without property characteristics, while the inspected service schema exposes assessor fields such as bedrooms, living area, year and generalized zoning. This packet verified **schema presence**, not attribute population or completeness. V2 excludes those enrichments regardless. The service cautions that generalized assessor land-use/zoning values are not current official zoning.

No feature query or full dataset download was performed. The public metadata observation/digests are not source-data receipts. A guessed county `PARCELS_ALL` endpoint redirected to login, so it was not selected or accessed with credentials.

## Field crosswalk and boundaries

Source names below use the observed service's lowercase schema. XML documentation uses uppercase names; do not silently case-fold arbitrary exports. An uppercase FileGDB/shapefile export needs a separately versioned adapter.

| TruLot expected field | Current source field | Method | Status |
|---|---|---|---|
| `apn_norm` | `apn` | Preserve ten digits, including leading zero/subunit; optionally remove only exact 3-3-2-2 hyphens | Direct normalization; fixture-tested |
| Parcel identifier | `parcelid` | Preserve as source polygon identifier; not unique | Direct; fixture-tested |
| Source row identity | `objectid` | Scope by acquisition checksum + object ID; never assume stable between exports | Direct; fixture-tested |
| `address` | `situs_address`, fraction, pre-direction, street, suffix, post-direction | Compose only when positive address number and street exist; retain all components including building/suite separately | Derived; fixture-tested; not a geocoding or mailing-address claim |
| `situs_zip` | `situs_zip` | Retain source string/null | Direct; no inferred ZIP |
| `city` / jurisdiction | `situs_juris` | Preserve published code/null; future explicit city-name mapping | Direct code; no default to San Diego |
| `state` | No dedicated field in chosen projection | County-source context could support separately labeled metadata | Not populated by fixture normalizer |
| Polygon geometry | Feature geometry | Explicit WGS84 GeoJSON profile; native source is EPSG:2230 | Profile contract; real export/conversion not implemented |
| `lot_area_sqft` | Geometry; `acreage` is a different fact | Derive `approxGeometryAreaSqFt` in EPSG:2230; preserve `taxableAcreage` separately | Derived approximation; no direct legal-lot-area assignment |
| `lat` / `lng` | Geometry; `x_coord`/`y_coord` documented as approximate projected centroid | Compute centroid in EPSG:2230 then transform to EPSG:4326; record outside-centroid flag and separate point-on-surface | Derived; source X/Y not treated as longitude/latitude |
| `situs_community` / community plan | Service `situs_community` exists | No equivalence to adopted community-plan boundary established | Excluded pending separately sourced mapping |
| Structure, bedrooms, baths, units, values, use | Assessor attributes exposed in service | Do not absorb into parcel-only base | Excluded; separate enrichment lineage required |
| `zone_name`, `zone_family`, `base_zone` | No established official mapping; `asr_zone`/`nucleus_zone_cd` are generalized assessor fields | Separate authoritative zoning dataset/join | Unavailable from this base contract |
| Permit/nearby activity | None in parcel-base contract | Separate permit/activity lineage | Excluded |
| Overlay membership | None in parcel-base contract | Separate overlay datasets | Excluded |
| `generated_at` / source vintage | No interchangeable field | Keep acquisition, source temporal extent, import completion and serving rebuild times separate | No invented historical value |

`ACREAGE` is taxable acreage, can be blank for smaller parcels, and can describe the underlying parcel for condo subunits. It is not reliable legal lot area. Stacked polygon areas must not be summed as independent land area. Derived centroids can lie outside concave/multipart polygons; the fixture proof demonstrates this. A future serving consumer must deliberately select and label its geometry/point semantics.

## Executable contracts

`data/parcel-base-v2/import-contract.json` is the future import specification. `receiptSchema` and `importContractSchema` exported by `scripts/parcel-base-v2.mjs` are the executable strict Zod schemas. No new package or dependency installation was performed.

### Acquisition receipt

Required: dataset ID, evidence kind, publisher, exact source and metadata URLs, acquisition timestamp with timezone, separate source-reported upload/modification/currency values (or explicit null), content SHA-256, byte size, original basename/media type, acquisition method, license/use note, operator/tool version, native and received CRS, output-SR/Z request and scope. Known source dates require checksum-linked metadata bytes; source currency uses the metadata temporal-extent field, never a permit/row/upload/commit date.

The validator recomputes artifact size/SHA-256 and checks the metadata byte hash when supplied. It checks receipt structure and internal evidence consistency; it does **not** authenticate a publisher, certify source completeness or establish a historical serving relationship. A future acquisition must retain actual source and metadata bytes plus the exact export request and terms. Service paging alone is not an immutable snapshot.

Synthetic receipts use the publisher `TruLot synthetic fixture`, a `urn:trulot:fixture:` source, explicit fixture kind and a fixed fictional timestamp. They are rejected by default, require an explicit test option, cannot assert source currency and cannot be relabeled as real acquisitions while retaining the fixture marker. No real acquisition receipt is committed or claimed.

### Import and validation

The only implemented executable path is a <=100-feature **synthetic** GeoJSON envelope, with exact selected source fields/types and declared count. Missing required schema columns abort the batch. Missing required row fields quarantine that row. Unknown per-row fields are reported by name and excluded from normalized output; original bytes remain checksum-linked.

- APN: string of exactly ten digits or exact `BBB-PPx-yy-zz` punctuation; preserve original components. No arbitrary stripping, padding, truncation or number-to-string coercion. Null/malformed APNs reject.
- Identity: require positive integer source object ID and parcel ID. Quarantine every row sharing an APN or object ID; there is no first-row winner or automatic merge. Distinct APNs sharing parcel ID/geometry remain separate stacked parcels. Null source identifiers and real duplicate distributions require explicit future review.
- Address: preserve nullable source components; missing number/street produces null. Suite/building retained separately. No invented city, ZIP or street number.
- Jurisdiction: published 19-code domain or null. A broad regional-coordinate QA box is not a jurisdiction boundary check; municipal membership cannot be established by this parser.
- CRS: accepted fixture coordinates are explicitly two-dimensional EPSG:4326, longitude first. Native source EPSG:2230 is separately recorded. A future service export must request/document `outSR=4326` and `returnZ=false`; FileGDB or archive conversion needs its own versioned conversion receipt. No conversion of real source data is implemented here.
- Geometry: Shapely/GEOS verifies nonempty valid Polygon/MultiPolygon, rings, finite 2D coordinates, holes and multipart topology. Null, invalid, unclosed and out-of-region geometries reject; no `make_valid`, silent ring closure or Z dropping. Measurements use EPSG:2230 US survey feet. Centroid, containment flag and point-on-surface are derived, with centroid reprojection consistency checked.
- Toolchain: fixture contract pins installed Shapely 2.1.2, GEOS 3.13.1, pyproj 3.7.2 and PROJ 9.5.1. Python 3 is required; absent/mismatched libraries block execution, never auto-install. PROJ networking is disabled; the transformation pipeline is included in the report. These tests do not establish survey-grade accuracy or a production deployment environment.
- Reporting: caller supplies import run ID; report links acquisition content hash, receipt hash, contract hash, tool versions, normalized rows, rejected row indexes/IDs/reasons, rejected-row artifact hash, unexpected field names, duplicate APN distribution and accepted parcel-ID multiplicities.
- Counts: input equals accepted plus rejected. Duplicate rows are a subset of rejected; merged is always zero. Source-declared count must match the artifact. Future countywide snapshot completeness requires independent source export/count evidence.
- Sampling: select first three accepted IDs ordered by SHA-256 of `contentSha256:sourceObjectId`, with numeric ID tiebreak. It is repeatable for fixed bytes; it is not an accuracy certification.

Logical future destination row: acquisition/run reference, source object ID, original APN and normalized APN, nonunique parcel ID, raw situs components/null address, jurisdiction code, original polygon, approximate geometry area, separately labeled taxable acreage, centroid/containment flag and point-on-surface. Raw APN remains available in the immutable source artifact. No table, migration, RLS/grants or bulk loader is created.

### Offline commands and artifacts

```sh
node scripts/test-parcel-base-v2-receipt.mjs
node scripts/test-parcel-base-v2-source.mjs
node scripts/parcel-base-v2.mjs
```

The last command prints a deterministic fixture report to stdout, including rejected-row records; it writes nothing by itself. Redirect it to a temporary file to retain a run/rejection artifact. Neither script contains a downloader or database client. The Python geometry helper reads JSON from stdin and writes JSON to stdout with network transformations disabled.

Golden input contains 12 invented rows: normal parcel, missing situs, multipart polygon, malformed APN, both members of a duplicate APN group, two stacked condo APNs sharing polygon ID, null geometry, self-intersection, unexpected attribute, and missing APN field. Additional tests mutate the declared schema, CRS, source count, jurisdiction, object IDs, Z coordinates, rings, holes, dates and receipt integrity. Baseline result: **12 input / 6 accepted / 6 rejected / 2 duplicate rows / 0 merged**. All rejected rows and reasons remain visible.

## Future serving boundary and production blockers

```text
actual versioned SanGIS artifact + acquisition receipt
→ reviewed deterministic export/conversion and import run
→ parcel_base_sangis_v2 (parcel identity/geometry/situs only)
→ separately sourced assessor + zoning + permits + overlays/activity joins
→ rebuilt serving view or parcel_page_api_v2 successor
→ Parcel Truth contract
```

Before any production import: obtain separate authorization; retain exact source/export/metadata/terms bytes and checksums; settle consistent-snapshot/pagination/versioning; validate actual selected field schema/types/nulls, Z and CRS conversion; inspect duplicate/APN/stacked distribution; approve row quarantine/reconciliation and jurisdiction scope; recover or define full isolated destination DDL and deterministic importer; independently verify source counts, samples and geometry accuracy; review enrichment join cardinality and serving compatibility; establish an isolated staging/recovery procedure under the existing production freeze. The fixture-only harness is not a bulk loader or permission to import.

No new V2 entry is placed in the live V1 manifest registry. Packet 6 retains a real V2 source artifact and offline validation outputs, and Packet 7 subsequently proves an isolated local PostGIS import; no production V2 base or serving dataset exists. V1 classifications remain unchanged. Public source identity and a future contract are not evidence of V1 population reproducibility.

## Packet 5 acceptance results

The 23 receipt tests and 32 parcel-source tests pass. Existing Parcel Truth (19), overlay (43), SDA (6 groups), foundation (25), production-freeze (18), static foundation verification, dry-run parser fixtures and production-QA adapter fixtures pass. `next typegen`, `tsc --noEmit --incremental false`, ESLint over the three new JavaScript files and Git whitespace checks pass. The Python helper is exercised by the geometry fixture tests.

Global `npm run lint` retains the pre-existing `supabase/functions/nearby-parcels/index.ts:125:67` `no-explicit-any` error and six existing warnings. No existing runtime, migration, SQL, manifest or package/dependency file changed. Original checkout preservation was checked against Git branch/HEAD/status/diffs/untracked files and all 57 tracked/nonignored file hashes.

## Packet 6: real acquisition rehearsal

The [complete report](sangis-parcel-acquisition-rehearsal.md) records acquisition `sangis-20260924T183743Z`: 1,089,758 source/acquired/parsed features, 1,088,430 accepted, 1,328 quarantined, zero merged. Two independent complete runs produced byte-identical reports and compressed row artifacts. The receipt, source metadata inventory, aggregate report, source-wide stack audit, first-three and representative samples, and repeatability evidence are under `data/parcel-base-v2/acquisitions/sangis-20260924T183743Z/`. Large raw and derived files remain outside Git.

The export API requests `replicaSR=4326` and has no `returnZ` argument. Receipt `request.returnZ=null` now explicitly represents that absence; `true` remains forbidden and synthetic receipts still require `false`. Metadata-only receipt validation is factored out so a 3.9 GB artifact can be hashed and parsed in a bounded stream. Property normalization, APN rules, duplicate quarantine, geometry validation, stacking policy and production boundaries are unchanged. The contract's `FUTURE_CONTRACT_ONLY`/`productionReady=false` status remains a serving/import boundary, not a denial of the separately documented source acquisition.

REAL_SANGIS_ACQUISITION_REHEARSAL_PASS

## Packet 7: isolated database import and scope

The [PostGIS rehearsal report](parcel-base-v2-postgis-rehearsal.md) records a countywide accepted base of 1,088,430 rows, with 1,328 exclusions retained in separate audit. The authoritative SanGIS XML defines `SD` as City of San Diego; the current accepted `situs_juris='SD'` subset contains 393,733 APNs, including 126,239 stacked rows. Preserve the countywide base and apply city product scope downstream. The historical 393,364-row claim is only partially explained; its exact filter and the remaining 369-row delta are unproven.

Acquisition-scoped source object ID is the rehearsal primary key. Canonical APN remains a nonunique indexed business identifier, because accepted-only uniqueness follows deliberate quarantine of five repeated-APN source groups. No stacked APNs are deduplicated. Serving/enrichment design and production readiness remain separate; no V1 relation or historical classification changes.
