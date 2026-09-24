# San Diego Parcel V1 data foundation

Repository audit baseline: `4dd7cfea22f70ed6abd682321dc62db749ae35f2`.
No live database inspection or SQL execution was performed for this audit. Historical reports describe their capture date only. A working production relation, a publisher homepage, and a passing fixture test do not establish source lineage.

## Canonical dependency map

`app/parcel/san-diego/[slug]/page.tsx` calls `getParcelPageV1Result()` in `lib/parcel-page-v1.ts`. The adapter makes five database call sites over four named objects:

```text
SanGIS parcel source [manifest assertion; extract/import UNKNOWN] ─┐
County assessor source [manifest assertion; joins/import UNKNOWN] ├─ parcel_page_api_v2
Zoning source [publisher/layer/derivation UNKNOWN] ────────────────┘     │
                                                                      ├─ core identity, situs, structure, mapped zone, activity
                                                                      └─ similar-lot candidates
City DSD permits [portal named; extract/terminalization UNKNOWN]
  └─ parcel_permit_terminal_v2 ──┬─ similar-lot permit summaries
                                └─ trulot_permit_parcel_link_v1 ← parcel_page_api_v2
                                     ↑ trulot_normalize_apn_digits(text)
                                     ↑ trulot_extract_apn_candidates(text)
                                     ↑ trulot_normalize_address_key(text)
                                     └─ direct permit source status, linked history and truth
TPA / SDA / CTCAC [three exact source layers/imports UNKNOWN]
  └─ tpa_official / sda_official / ctcac_gis_v1
       └─ check_parcel_overlays(float8,float8) + PostGIS
            └─ parseOverlayResponse() → applySdaReconciliationPolicy()
                 └─ TPA/CTCAC point membership; SDA remains conditional/unknown

all sources → source-freshness.ts (five manifest entries)
            → parcel-truth.ts contract → canonical page
```

The SQL linkage view uses the core and terminal relations plus all three helper functions; PostgreSQL regular-expression, text and array built-ins are external engine prerequisites. The adapter further selects exact or unambiguous parsed APNs using `lib/permit-linkage.ts`; address-only candidates do not establish direct permit truth. No matching logic changed.

The similar-lot path reads core candidates and terminal permits directly. Current selection uses same-zone/lot-area filters, a limited candidate set, then application distance filtering. Nearby/activity values already present in core have an unproven upstream population chain. No search or activity behavior changed.

Historical population evidence, **not a proven current runtime dependency**: the rehearsal `update_nearby_activity_v2()` writes core from `parcel_primary_project_v1`, using APN-prefix counts. It is not called by this adapter. Its schedule, execution history and equivalence to current activity fields are unknown. The latest prohibited overlay migration defines `trulot_overlay_payload_to_geometry(jsonb,text)` and populates `geom`; its RPC subsequently reads `geom` without calling that decoder. Earlier RPC SQL parses GeoJSON on lookup. Deployment parity is unknown.

## Reproducibility matrix

Definition means a repository-controlled executable object definition, not successful deployment or complete upstream closure. Population means the real dataset can be reconstructed, not that synthetic seeds exist. `PARTIAL` identifies useful but incomplete evidence. `UNKNOWN` for stateless population means no stored dataset applies; it does not imply an import exists. Source identification below is a manifest assertion unless otherwise stated. All dataset vintages and acquisition/import receipts are unknown/missing.

| Object / dataset | Expected type | Definition | Population/import | Provenance | Creation migration controlled? | Evidence / missing link |
|---|---|---|---|---|---|---|
| `parcel_page_api_v2` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | PARTIAL | No | Partial snapshot; full DDL, source joins and imports absent |
| `parcel_permit_terminal_v2` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | PARTIAL | No | Snapshot; extract, normalization and terminalization absent |
| `trulot_permit_parcel_link_v1` | View | REPRODUCIBLE | PARTIAL | PARTIAL | Yes | July 5 helpers/initial view, July 6 replacement; missing actual inputs |
| `trulot_normalize_apn_digits` | SQL function(text) | REPRODUCIBLE | UNKNOWN | UNKNOWN | Yes | July 5 deterministic SQL; stateless |
| `trulot_extract_apn_candidates` | SQL function(text) | REPRODUCIBLE | UNKNOWN | UNKNOWN | Yes | July 5 deterministic SQL; stateless |
| `trulot_normalize_address_key` | SQL function(text) | REPRODUCIBLE | UNKNOWN | UNKNOWN | Yes | July 5 deterministic SQL; stateless |
| `check_parcel_overlays` | Function(float8,float8) → jsonb | REPRODUCIBLE | PARTIAL | UNKNOWN | Yes, multiple versions | SQL preserved; live version and source geometry authority unknown; latest migration prohibited |
| `tpa_official` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | UNKNOWN | No | Snapshot only; exact source layer/import missing |
| `sda_official` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | UNKNOWN | No | Snapshot only; reconciliation pending |
| `ctcac_gis_v1` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | UNKNOWN | No | Snapshot only; exact source layer/import missing |
| `postgis` | External extension | PARTIAL | UNKNOWN | UNKNOWN | Rehearsal only | Installation statement; server binaries/version not pinned |
| `trulot_overlay_payload_to_geometry` | Function(jsonb,text) → geometry | REPRODUCIBLE | UNKNOWN | UNKNOWN | Yes, prohibited | Historical deterministic decoder; not source authority or import evidence |
| `parcel_primary_project_v1` | Table in rehearsal; live type unverified | PARTIAL | NOT_REPRODUCIBLE | PARTIAL | No | Historical activity input; project derivation unknown |
| `update_nearby_activity_v2` | Function() with DML | PARTIAL | PARTIAL | UNKNOWN | No | Rehearsal definition only; APN-prefix transform; upstream/current parity unknown |
| `parcel_base_sangis_v1` | Source dataset | UNKNOWN | NOT_REPRODUCIBLE | PARTIAL | No importer | Publisher named; exact extract and source schema absent |
| `assessor_structures_sdcounty_v1` | Source dataset | UNKNOWN | NOT_REPRODUCIBLE | PARTIAL | No importer | Publisher named; source schema/joins absent |
| `base_zoning_mapping_v1` | Derived source dataset | UNKNOWN | NOT_REPRODUCIBLE | UNKNOWN | No importer | Authoritative layer and parcel-to-zone mapping absent |
| `permit_terminal_city_sd_v2` | Source dataset | UNKNOWN | NOT_REPRODUCIBLE | PARTIAL | No importer | Portal named; exact export/schema and terminal transform absent |
| `overlay_layers_tpa_sda_ctcac_v1` | Three grouped source datasets | UNKNOWN | NOT_REPRODUCIBLE | UNKNOWN | No importer | Grouped manifest does not resolve three independent source authorities |

The machine-readable companion is `data/foundation/parcel-v1-reproducibility.json`. Its dependency edges distinguish direct runtime objects, historical transforms and historical population evidence. Unknown upstream relation names are recorded as gaps, not invented as tables.

## Manifest inventory

All five entries are in `data/dataset-manifests/2026-07-11-foundation.json`. These descriptions and publishers are existing assertions, not verified receipts. Expected source types below describe the intended content; no specific delivered file format is established.

| Dataset ID / name | Publisher assertion | URL/document | Expected source type | Completeness |
|---|---|---|---|---|
| `parcel_base_sangis_v1` — Parcel base geometry and situs record | SanGIS | https://www.sangis.org/ | Geospatial parcel/situs extract; exact format unknown | UNKNOWN |
| `assessor_structures_sdcounty_v1` — Assessor structure and valuation attributes | San Diego County Assessor / Recorder / County Clerk | https://arcc.sdcounty.ca.gov/ | Assessor attribute records; exact format unknown | UNKNOWN |
| `base_zoning_mapping_v1` — Mapped parcel zoning and zoning family fields | TruLot parcel view over public zoning sources | unknown | Zoning source plus parcel mapping; exact layer/format unknown | UNKNOWN |
| `permit_terminal_city_sd_v2` — Permit terminal activity record set | City of San Diego Development Services | https://opendsd.sandiego.gov/ | Permit activity extract; exact export/format unknown | UNKNOWN |
| `overlay_layers_tpa_sda_ctcac_v1` — Overlay polygons for TPA, SDA, and CTCAC checks | TruLot overlay lookup over mapped public layers | unknown | Polygon layers; source formats unknown; destination has GeoJSON/geometry | UNKNOWN; SDA reconciliation pending |

For **every entry**, the following exact fields remain explicit:

- `source_publication_or_effective_date`, `acquisition_timestamp`, `import_timestamp`: `unknown`.
- `schema_version`, `importer_version`, `steward`, `refresh_cadence`: `unknown`.
- `license_or_use_restriction`, `row_count`, `checksum`: `unverified`.
- Zoning and overlay `source_url_or_acquisition_location`: `unknown`.

There are no committed authoritative source extracts, acquisition receipts or import receipts. Named websites are not exact acquisition locations. No metadata was upgraded in this packet. Permit event dates, overlay `created_at`, parcel `generated_at`, report generation time and code commits are not acquisition/import freshness. The existing truth adapter keeps `generated_at` in `viewCalculatedAt`, separate from manifest effective/retrieved/imported dates. Even that row stamp is not proof of a completed source import.

## Artifact classifications

“Authoritative executable definition” here means authoritative repository code for its specified version; it does not imply current production authority or execution permission.

| Artifact | Classification | Evidentiary limit |
|---|---|---|
| `supabase/migrations/20260522_overlay_lookup.sql` | authoritative executable definition | Initial RPC; external tables/PostGIS required |
| `supabase/migrations/20260705_permit_linkage_v1.sql` | authoritative executable definition | Helpers, initial linkage and report v1; external core/terminal required |
| `supabase/migrations/20260706_permit_linkage_perf_v1.sql` | authoritative executable definition | Replacement linkage view and expression indexes; no source ingestion |
| `supabase/migrations/20260707_permit_linkage_report_v2.sql` | authoritative executable definition | Reporting cache/meta/view/refresh; historical docs describe future-only; not canonical V1 input |
| `supabase/migrations/20260712032203_foundation_access_least_privilege.sql` | authoritative executable definition | Grants/revokes; not relation creation or ingestion |
| `supabase/migrations/20260712032216_check_parcel_overlays_hardening.sql` | authoritative executable definition | Qualified PostGIS lookup and access/search-path hardening; no source receipt |
| `supabase/migrations/20260713025206_overlay_payload_geometry_proven_decoder.sql` | authoritative executable definition | Decoder, geometry DML and RPC replacement; **PROHIBITED by freeze**, not an approved rebuild chain |
| `supabase/rehearsal/20260711_remote_public_baseline_subset.sql` | incomplete/unknown | Partial structural snapshot for fixture rehearsal |
| `supabase/rehearsal/20260711_seed_minimal_data.sql` | validation evidence | Synthetic data, not authoritative source artifact |
| `supabase/rehearsal/20260711_rollback_access_and_overlay.sql` | historical documentation | Executable rehearsal reversal to broad privileges/earlier RPC; not a safe production recovery proposal |
| `data/dataset-manifests/2026-07-11-foundation.json` | incomplete/unknown | Explicit provenance gaps, not source receipts |
| `data/security/remote-security-baseline-2026-07-11.json` | validation evidence | Historical metadata summary; cited `/private/tmp` source dump is not committed |
| `data/security/migration-rehearsal-report-2026-07-11.json` | validation evidence | Historical local synthetic permission/lookup results, not production population proof |
| `docs/repository-database-reconciliation-2026-07.md`, `docs/trulot-data-foundation-security-gate-2026-07.md`, `docs/deployment-readiness-runbook-2026-07.md`, `docs/audits/TRULOT_TECHNICAL_AUDIT_2026-07.md` | historical documentation | Historical claims/runbooks do not establish current execution or lineage |
| `docs/permit-linkage-reporting-v2.md`, `docs/sql/permit-linkage-v2-backfill.sql` | recovery proposal | Future reporting/backfill, not controlled source import; not executed |
| `docs/source-freshness-contract-2026-07.md`, `docs/parcel-page-v1-field-mapping.md`, `docs/parcel-page-stabilization-2026-07.md` | historical documentation | Field mappings and timestamp semantics; no acquisition evidence |
| `docs/parcel-v1-truth-contract.md`, `docs/sda-source-reconciliation.md` | historical documentation | Current repository policy/contract context, not source artifact or receipt |
| `.github/production-database-freeze.json` and freeze guard/tests | authoritative executable definition | Active execution restriction; versions `20260713022000` and `20260713025206` prohibited |
| `lib/parcel-page-v1.ts`, `lib/permit-linkage.ts`, `lib/overlay-response.ts`, `lib/sda-source-reconciliation.ts`, `lib/source-freshness.ts`, `lib/parcel-truth.ts` | authoritative executable definition | Adapter/contract behavior, not historical source/import proof |
| `scripts/verify-data-foundation.mjs`, truth/overlay/SDA tests, QA adapter/dry-run/freeze fixture tests | validation evidence | Offline static/fixture checks only |
| `scripts/rehearse-foundation-migrations.mjs`, `scripts/test-overlay-payload-compat.mjs` | validation evidence | Database-creating/mutating rehearsal tooling; deliberately not executed |
| `scripts/qa-foundation-production.mjs`, `scripts/triage-overlay-integrity.mjs`, `scripts/report-permit-linkage.mjs` | validation evidence | Inspection tooling, not proof unless safely executed; no execution in this packet |

No inspected artifact qualifies as an authoritative source artifact or acquisition/import receipt. There is no committed controlled source importer for these five datasets. The private SDA recovery material referenced by repository documents is not repository-controlled evidence; it was not accessed or copied from the original checkout. The nearby Edge Function deployment template is not the canonical adapter's population definition.

## Rehearsal schema findings

The baseline subset defines six tables (`parcel_page_api_v2`, `parcel_permit_terminal_v2`, `parcel_primary_project_v1`, `tpa_official`, `sda_official`, `ctcac_gis_v1`), six functions (three normalization helpers, `check_parcel_overlays`, `get_opportunity_feed`, `update_nearby_activity_v2`), and two views (`trulot_permit_parcel_link_v1`, `trulot_permit_linkage_report_v1`). It also defines the extensions schema/PostGIS, overlay GiST and APN/address expression indexes, RLS/policies, and broad legacy grants/default privileges. These are structural snapshots, not creation migrations for the real foundation.

The seed supplies two fictional parcels, one primary project, two permits and one synthetic polygon per overlay. It cannot establish real San Diego coverage, vintage, completeness or matching accuracy. The snapshot's simplified helper bodies also must not replace the richer migration-controlled normalization logic.

It **cannot bootstrap a complete working Parcel V1 database from zero**. It assumes PostgreSQL roles and available PostGIS binaries; omits authoritative source artifacts, imports, full source/derived schemas and population logic; and lacks rich core fields the adapter reads (structure/assessor values, community/neighborhood and several nearby/activity fields). The core, terminal and primary table names are not proof of their live relation types or derivations. An empty or seeded fixture can support limited tests, not real parcel conclusions. Later grants/RPC migrations and the active freeze also prevent treating all files as a safe linear rebuild recipe.

It remains useful for minimum column/type expectations, relation edges, spatial SRID assumptions, legacy privilege evidence and local synthetic tests. Its rollback script restores broad privileges and old RPC logic; it is not a production recovery authorization.

## Ranked risks by user-facing impact

| Rank | Severity | Missing link / impact |
|---|---|---|
| 1 | Critical | Parcel extract/identity normalization and core population are absent: APN/situs/geometry lineage cannot be reconstructed or independently audited. |
| 2 | Critical | SDA source authority and coverage unresolved: false membership must not become eligibility; existing truth policy retains unknown/conditional. |
| 3 | Critical | TPA/CTCAC layer authority, import and completeness unproved: plausible booleans may represent incorrect or incomplete polygons. |
| 4 | Critical | Permit extraction/terminalization missing: linked history may omit or misclassify permits despite reproducible matching SQL. |
| 5 | Critical | Parcel-to-zone source mapping absent: mapped zone facts cannot be traced to an authoritative layer/version. |
| 6 | High | Assessor joins/vintage unknown: structure, units or valuation facts can be stale or incorrectly joined. |
| 7 | High | All five acquisition/import receipts and checksums missing: no auditable source-to-row chain or completed import evidence. |
| 8 | High | No full core/terminal/overlay creation migrations: recovery can recreate a fixture but not the serving foundation. |
| 9 | High | RPC version/geometry state not currently verified; latest decoder migration prohibited: code presence cannot prove deployed overlay behavior. |
| 10 | High | All effective dates/refresh cadence unknown: no dataset-specific current/stale determination is supported. |
| 11 | High | Core activity population and primary-project derivation unproved: historical APN-prefix counts are not proof of spatial nearby activity. |
| 12 | Medium | Grouped overlay manifest hides three independent layer versions and source authorities. |
| 13 | Medium | PostGIS version/configuration and source schemas unpinned: reproducibility and geometry parity remain uncertain. |
| 14 | Low | Stewards and license/use restrictions unverified: ownership and acquisition review remain unresolved. |

## Live verification decision

No live queries were run. This worktree has no `.env.local`; `TRULOT_PRODUCTION_DB_URL` is unset. Credentials were neither borrowed nor printed. `qa-foundation-production.mjs` attempts `update_nearby_activity_v2()` under expected-denial roles; that helper writes if privileges unexpectedly allow it, so the script fails this packet's read-only rule even with transaction handling. Overlay triage also supports production HTTP smoke calls, and its workflow is restricted by the freeze. The reporting script reads a noncanonical V2 cache and requires the absent local credential file. No new production-query tooling was created.

## One bounded closure: offline evidence acceptance gate

`SAFE_BOUNDED_CLOSURE_IMPLEMENTED`: the missing deterministic foundation/manifest validator is now supplied with an explicit evidence inventory and adversarial fixture tests. No dataset provenance was upgraded and no real source/import gap is claimed closed.

Run from the repository:

```sh
node scripts/verify-parcel-foundation.mjs
node scripts/test-parcel-foundation.mjs
```

The validator parses **every JSON manifest file** in the manifest directory, requires explicit fields and unique identifiers, checks classifications for the 14 audited objects and all datasets, verifies referenced evidence files exist, checks dependency targets, and scans canonical adapter/source-registry TypeScript calls and truth source/dataset pairs. It rejects new unclassified literal database references and dynamic database identifiers. It verifies truth provenance timestamp mappings against the corresponding manifest fields and prints missing source artifacts/acquisition receipts/import receipts for each dataset. Tests include invented vintage/checksums, missing/blank unknowns, false VERIFIED claims, receipt omissions, dependency additions, mismapped truth sources and an event-date substitution.

The deliberate `unreceipted-baseline-v1` policy accepts only explicit `unknown`/`unverified` audited metadata and null receipts/artifacts. It rejects **all VERIFIED upgrades**, even when a path is supplied: mere path existence cannot authenticate an acquisition or completed import. Adding a real receipt requires a separately reviewed evidence-contract extension, not deleting unknown markers. This conservative gate is not a generic receipt verifier, SQL execution proof, complete static call-graph analyzer, or automatic source authority audit. It scans the two current source entrypoints; moving queries into new modules or altering SQL dependencies requires an inventory/scanner review. It is a standalone CI-ready command, not a newly installed CI workflow.

Passing means the gaps remain explicit and source mappings are internally consistent. It does not mean data is reproducible, complete, current, or production-verified. Existing Parcel V1 runtime source, manifests, SQL, migrations, tests and package state remain unchanged; only this inventory, validator, its new tests, and this map are added.

## Remaining recovery work

A separate recovery packet must obtain authoritative source artifacts and exact layer identifiers, establish lawful acquisition details and source dates, recover full serving DDL and deterministic joins/terminalization/import logic, produce checksummed acquisition/import receipts, reconcile SDA under the active freeze, and independently verify current deployment parity through an authorized read-only route. Prioritize parcel identity and the unresolved overlay source chain. Do not infer these missing links from current UI values or rehearsal fixtures.

## Packet acceptance results

Offline truth tests (19), overlay tests (43), SDA tests (6 groups), new foundation tests (25), static foundation verification, production-freeze tests (18), dry-run parser fixtures and production-QA adapter fixtures passed. The new evidence gate passed while reporting five missing receipt chains. `next typegen`, `tsc --noEmit --incremental false`, ESLint on the two new scripts and Git whitespace checks passed. No database-dependent tests were run.

Repository `npm run lint` remains failing solely on the pre-existing `supabase/functions/nearby-parcels/index.ts:125:67` `no-explicit-any` error, with six existing warnings. It was not repaired in this packet. No runtime, existing manifest, SQL, migration or package/dependency file changed.

## Parcel Base recovery — Packet 5

Decision: **PARCEL_BASE_V2_REQUIRED**. The bounded repository/local recovery audit found a historical lead in commit `23cbcc4351c4734a980e3303635758537701b51e`: its message names local PostgreSQL `core.parcels`, `core.parcel_nearby_development_summary_v1` and a pending `raw.sd_parcels` re-export, and claims 393,364 serving rows. Its diff contains frontend changes, not the source artifact, importer or serving-lineage validation. Four referenced temporary schema dumps are absent. This does not satisfy the historical-lineage threshold.

The current public SanGIS-owned SANDAG **Parcels** service (metadata title **PARCELS_ALL**, item `032a5dcf654c4ccbb18711ad8a0ee754`) was inspected through public metadata only. Native CRS is EPSG:2230. Ten-digit APNs and nonunique parcel IDs require preserving stacked parcels; taxable acreage is not legal lot area. Warehouse upload, metadata temporal extent and future TruLot acquisition timestamps remain distinct. No parcel source records were acquired.

See [SanGIS Parcel Base V2 recovery and contract](sangis-parcel-base-v2.md) for the evidence table, authoritative links, field crosswalk, strict receipt/import schemas and offline fixture proof. `data/parcel-base-v2/` is explicitly future-contract/synthetic material, separate from active dataset manifests. Its existence does **not** prove historical V1 lineage or upgrade any existing foundation classification. No current adapter, UI or database behavior changed.

Before production import, a separate packet must acquire and preserve a real immutable source snapshot/receipts, validate actual schema/counts/duplicates/geometry, implement and review an isolated importer/destination and separately sourced enrichment joins, and establish serving compatibility under the existing freeze. Packet 5 performs none of those production actions.
