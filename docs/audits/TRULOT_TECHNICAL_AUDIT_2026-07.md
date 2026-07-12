# TruLot Technical and Architectural Audit — July 2026

Audit date: 2026-07-11  
Repository audited: `/Users/ops/trulot-web`  
Git branch and commit: `main` at `9b132ef` (`origin/main`), with substantial uncommitted work  
Audit mode: read-only except for this report  

## 1. Executive Summary

TruLot currently contains two different products in one repository:

1. A committed legacy parcel-development dashboard and JSON API built around `getParcelPageData()`, hardcoded zoning/capacity rules, permit-stage inference, jobs, and opportunity outputs.
2. An uncommitted Parcel Page V1 built around `getParcelPageV1Data()`, source labels, explicit null states, cautious program language, canonical URLs, and stricter direct-permit linkage.

The uncommitted Parcel Page V1 is the safer near-term product direction. It server-renders important facts, preserves recorded/mapped/conditional distinctions, refuses to invent missing zoning standards or program eligibility, and excludes address-only permit matches from direct parcel history. However, it is not reproducible from Git, depends on database views whose definitions are absent from the repository, and does not implement the stated deterministic development-capacity chain.

The largest production risk is architectural split-brain. The safer page omits unsupported capacity claims, but the public legacy API still exposes hardcoded baseline and ADU capacity calculations as source-backed or conditional outputs. The repository cannot show how base zoning becomes density, FAR, height, base capacity, overlays, and regulatory escalation because no canonical, versioned rule engine or receipt exists. FAR, height, SB 79, SB 9, Coastal, CCHS, and program escalation are absent, placeholders, or scattered heuristics.

Database reproducibility is also weak. The application depends on `parcel_page_api_v2`, `parcel_primary_project_v1`, `parcel_permit_terminal_v2`, overlay source tables, and other relations whose creation SQL is not present. Remote migration history confirms `20260522`, `20260705`, and `20260706` are applied and local `20260707` is pending, but the underlying production schema, RLS, dataset imports, and view definitions could not be reconstructed or fully audited from repository evidence.

The recommended next sprint is not feature expansion. It should establish one canonical Parcel Page path, one explicit truth-engine contract, truthful failure semantics, reproducible schema/source manifests, and a golden-parcel regression suite. Brian OS integration should remain design-only until those foundations exist.

## 2. Overall Health Assessment

| Area | Assessment | Rationale |
|---|---|---|
| Parcel Page V1 presentation | Yellow | Safer uncertainty language and source display, but entirely uncommitted and dependent on undocumented views. |
| Deterministic intelligence engine | Red | No canonical end-to-end `BASE_ZONING → ... → REGULATORY_ESCALATION` implementation or rule receipts. |
| Database reproducibility | Red | Core tables/views/imports/RLS are absent from migrations; remote state is authoritative but undocumented. |
| Permit linkage | Yellow | Exact/parsed-only direct-history doctrine is preserved, but page retrieval and QA do not exercise the complete SQL linkage path. |
| Testing | Red | No test framework; current QA script does not fail the process on failed cases and does not test page behavior. |
| Security | Yellow/Red | Secrets are ignored, but RLS is unverifiable; pending V2 grants excess cache access; public service-role edge function has weak abuse controls if deployed. |
| Deployment and operations | Red | No deployment manifest, environment matrix, CI workflow, backup runbook, observability contract, or live-version receipt. |
| Documentation | Red | README is boilerplate; `CLAUDE.md` describes the superseded path; canonical ownership is not declared. |

Overall health: **prototype with a credible Parcel Page direction, not yet a reproducible deterministic intelligence system**.

## 3. Confirmed Current Architecture

### Runtime

- Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4.
- Supabase/Postgres accessed with the public anon key from server routes, server components, scripts, and shared adapters.
- No generated database types; database rows are generally handled as `Record<string, unknown>`.
- No test framework or CI configuration is present.

### Active filesystem path

```text
SearchBox
  → GET /api/search
  → parcel_page_api_v2 + parcel_primary_project_v1
  → /parcel/san-diego/[slug]
  → getParcelPageV1Data()
      → parcel_page_api_v2
      → parcel_permit_terminal_v2
      → check_parcel_overlays(lat,lng)
      → client-side similar-lot filtering
      → TypeScript permit-linkage classification
  → server-rendered public Parcel Page V1
```

### Still-active legacy path

```text
GET /api/parcel/[apn]
  → getParcelPageData()
      → parcel_page_api_v2
      → parcel_primary_project_v1
      → parcel_permit_terminal_v2
      → hardcoded capacity + ADU parsing
      → stage and construction-phase inference
      → jobs/opportunity outputs
```

The old `/parcel/[apn]` page has been replaced locally by a redirect to the new canonical route, but that redirect and the destination route are uncommitted. The legacy JSON API remains live in the application build and continues to call the legacy engine.

### Database evidence available in the repository

- `20260522_overlay_lookup.sql`: `check_parcel_overlays(float8,float8)`.
- `20260705_permit_linkage_v1.sql`: APN/address normalization functions, live linkage view, aggregate V1 report.
- `20260706_permit_linkage_perf_v1.sql`: expression indexes and revised V1 linkage view.
- `20260707_permit_linkage_report_v2.sql`: pending DDL-only cache/report scaffolding.

Remote migration list observed during the audit:

| Migration | Local | Remote |
|---|---:|---:|
| `20260522` | yes | yes |
| `20260705` | yes | yes |
| `20260706` | yes | yes |
| `20260707` | yes | no |

No production data was modified and no deployment was performed.

## 4. Canonical Data and Calculation Flow

### What is canonical now

No single layer is fully canonical.

- **Git canonical application:** origin `main` still contains the legacy Parcel Page UI and legacy capacity engine.
- **Filesystem canonical candidate:** the uncommitted `/parcel/san-diego/[slug]` route and `lib/parcel-page-v1.ts` match the stated Parcel Page V1 doctrine more closely.
- **Database canonical:** remote Supabase views are operationally authoritative, but their definitions and import lineage are absent from this repository.
- **Permit linkage canonical candidate:** SQL functions/views establish the intended confidence vocabulary; the page currently reimplements linkage in TypeScript instead of consuming the SQL view.
- **Development-capacity canonical:** none. The legacy TypeScript heuristics are the only implementation, and the new page intentionally does not use them.

### Stated explainability chain versus repository evidence

| Intended stage | Current implementation | Traceability |
|---|---|---|
| `BASE_ZONING` | `zone_name`/`base_zone` from `parcel_page_api_v2` | Source view exists remotely; view definition, source vintage, and geometry method absent. |
| `DENSITY` | Legacy code parses RS/RM zone suffixes as thousands of square feet | No reviewed rule table, code citation, effective date, or regression test. |
| `FAR` | Not calculated; legacy constraints say verification required | No canonical implementation. |
| `HEIGHT` | Not calculated | No canonical implementation. |
| `DERIVED_BASE_CAPACITY` | Legacy API calculates floor(lot area / inferred minimum); new page omits it | Conflicting product behavior; no receipt. |
| `OVERLAY_MEMBERSHIP` | Point-in-polygon RPC for TPA/SDA/CTCAC | Function exists; source layer creation, version, indexes, and boundary semantics absent. |
| `REGULATORY_ESCALATION` | Program placeholders and cautious prose | SB 9, SB 79, Coastal, CCHS, Density Bonus, conflicts, and escalation rules are not canonical. |

### Required future receipt shape

The next engine should emit an immutable calculation receipt containing parcel/APN, source dataset versions, exact input fields, rule IDs and versions, intermediate outputs, unknown/conflict reasons, final classification, citations, execution timestamp, and engine version. Nothing equivalent exists today.

## 5. What Is Working Reliably

The following statements are supported by local execution or direct code evidence:

- `npm run build` succeeds and includes both parcel routes and all current APIs.
- `npm run lint` completes with zero errors and five warnings.
- `npm run lint:copy` passes for the current filesystem.
- The five permit QA examples returned their expected permit/no-permit records during this audit.
- Parcel Page V1 server-renders its important content; it does not depend on client-only fact fetching.
- Parcel Page V1 attaches a source label and confidence tier to displayed fact objects.
- Missing zoning standards, ADU eligibility, SB 9 eligibility, and other unavailable program outputs are shown as unavailable rather than fabricated.
- Direct permit display filters to `exact_apn` and `parsed_apn`; `address_match` is excluded.
- Canonical parcel paths are deterministic functions of normalized APN and address.
- `.env*` and `.vercel` are ignored; no committed secret was found.
- Copy guardrails cover the requested forbidden phrases in the current parcel source tree.

These strengths should be preserved, but they do not yet prove regulatory correctness.

## 6. Critical Risks

### F-001 — Data failures can become false “not found” or “no permits” conclusions

- **Severity:** Critical
- **Confidence:** Confirmed
- **Evidence:** `getParcelPageV1Data()` returns `null` for either a parcel query error or absent parcel. `fetchPermitsForParcel()` discards query errors and returns available/empty arrays. The adapter then emits a recorded no-permits sentence.
- **Affected:** `lib/parcel-page-v1.ts` lines 279-316, 595-603, 759-777, 971-975; `/parcel/san-diego/[slug]`.
- **Business consequence:** A database outage, permission failure, timeout, or schema mismatch can be presented as an authoritative absence of a parcel or permit history.
- **Recommended action:** Introduce typed result states (`found`, `not_found`, `source_unavailable`, `partial`) and prohibit absence conclusions when any required source query failed.
- **Blocks next sprint:** Yes

### F-002 — Unsupported legacy capacity logic remains publicly callable

- **Severity:** Critical
- **Confidence:** Confirmed implementation; Strong inference on regulatory incorrectness
- **Evidence:** `/api/parcel/[apn]` calls `getParcelPageData()`. That code interprets RS/RM suffix numbers as minimum square feet, calculates `floor(lotSqft/minSf)`, marks RS/RM results `source-backed`, and uses uncited 8,000/10,000-square-foot ADU thresholds to return 4/5/6 ADUs.
- **Affected:** `app/api/parcel/[apn]/route.ts`; `lib/get-parcel-page-data.ts` lines 591-667 and 912-932.
- **Business consequence:** Consumers can receive deterministic-looking development capacity without a reviewed rule source, effective date, exception handling, FAR/height checks, or overlay escalation.
- **Recommended action:** Declare the legacy API noncanonical and either remove capacity fields from public output or gate them behind an explicit experimental contract until a cited rule engine replaces them.
- **Blocks next sprint:** Yes

## 7. High-Priority Technical Debt

### F-003 — Core database schema and imports are not reproducible

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** Core view/table definitions for `parcel_page_api_v2`, `parcel_primary_project_v1`, `parcel_permit_terminal_v2`, overlay source tables, `alerts_subscribers`, and import jobs are absent from migrations.
- **Affected:** Supabase project, all app adapters, deployment and recovery.
- **Business consequence:** A new environment cannot be rebuilt, reviewed, or compared with production; local/staging/prod drift cannot be measured.
- **Recommended action:** Export canonical schema-only SQL, add ordered migrations for owned objects, and create a dataset/import manifest without copying production data.
- **Blocks next sprint:** Yes

### F-004 — The intended Parcel Page V1 is not committed

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** New route, adapter, permit linkage, copy guard, scripts, docs, and three migrations are untracked; ten tracked files are modified. `origin/main` remains at `9b132ef`.
- **Affected:** Deployment, rollback, collaboration, auditability.
- **Business consequence:** The reviewed filesystem cannot be reproduced from Git and may not match the deployed application.
- **Recommended action:** Inventory and intentionally commit the Parcel Page V1 change set in one reviewed branch/PR; exclude `supabase/.temp`.
- **Blocks next sprint:** Yes

### F-005 — No canonical deterministic truth engine exists

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** New Parcel Page V1 exposes no standards/capacity engine; legacy TypeScript embeds uncited rules; no rule table, version, effective date, intermediate result contract, or receipt exists.
- **Affected:** Zoning, density, FAR, height, capacity, ADU, SB 9, SB 79, overlays, escalation.
- **Business consequence:** TruLot cannot yet demonstrate that conclusions are deterministic, reproducible, or explainable across regulatory changes.
- **Recommended action:** Define a small, versioned rule/result contract before adding more programs. Start with base zoning, density, FAR, height, and explicit unknown/escalation states.
- **Blocks next sprint:** Yes

### F-006 — Three parcel contracts/adapters conflict

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** `getParcelPageData()` + `parcel-page-contract.ts`, `getParcelPageV1Data()` local contract, and unused `getPublicParcelPage()` + `lib/public/contract.ts` independently normalize fields and interpret programs.
- **Affected:** `lib/get-parcel-page-data.ts`, `lib/parcel-page-v1.ts`, `lib/public/*`, API and page routes.
- **Business consequence:** Fixes and regulatory language can diverge. The unused public adapter already contains a stronger “no layered residential programs appear” conclusion than the active page.
- **Recommended action:** Name one canonical public contract and deprecate, quarantine, or delete the others only after route consumers are mapped.
- **Blocks next sprint:** Yes

### F-007 — Parcel Page parsed-APN discovery is incomplete

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** The page first retrieves permits only by raw APN, APN plus a trailing zero, or exact address variants, then parses candidates within those retrieved rows. It does not query the SQL linkage view or discover arbitrary permits whose description contains the parcel APN.
- **Affected:** `lib/parcel-page-v1.ts` lines 279-315; `lib/permit-linkage.ts`; `trulot_permit_parcel_link_v1`.
- **Business consequence:** Defensible parsed-APN matches can be missing even though the SQL linkage layer could find them.
- **Recommended action:** Make a reviewed database linkage relation the single retrieval source for direct permit history; keep exact/parsed-only filtering.
- **Blocks next sprint:** Yes

### F-008 — Permit QA is not a real regression gate

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** `qa-permit-linkage.mjs` prints `pass` but never throws or exits nonzero for failed cases. It queries raw APN candidates directly and does not call the page adapter or SQL linkage relation.
- **Affected:** `scripts/qa-permit-linkage.mjs` lines 24-78; `npm run qa:permit-linkage`.
- **Business consequence:** CI or operators can receive exit code 0 while known linkage behavior is broken.
- **Recommended action:** Fail on any false case and test exact, parsed-from-description, multi-APN, address-only exclusion, source label, and no-permit page behavior.
- **Blocks next sprint:** Yes

### F-009 — Source freshness is conflated across datasets

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** The source registry uses `parcel_page_api_v2.generated_at` as the refresh date for parcel, assessor, permit, and overlay datasets.
- **Affected:** `lib/parcel-page-v1.ts` lines 440-467 and identity freshness fields.
- **Business consequence:** Users can interpret one view-generation timestamp as proof that each underlying dataset is current.
- **Recommended action:** Store and display per-dataset version, acquisition time, source effective date, and pipeline completion time.
- **Blocks next sprint:** Yes

## 8. Conflicting or Duplicate Logic

### F-010 — Stage and jobs logic is duplicated

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** Development stage and job generation exist in both `lib/get-parcel-page-data.ts` and `app/api/jobs-feed/route.ts`, with different inputs and rule cascades.
- **Affected:** Legacy parcel API, jobs feed, `infer-phase.ts`.
- **Business consequence:** The same parcel can receive different stage or work recommendations depending on endpoint.
- **Recommended action:** Freeze jobs expansion; extract one deterministic stage contract only after current rules have golden tests.
- **Blocks next sprint:** No

### F-011 — Permit linkage implementations differ

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** TypeScript and SQL implement separate APN/address normalization. SQL chooses one parsed parcel using `ORDER BY apn_norm LIMIT 1`; TypeScript tests whether the subject APN appears in candidates and can associate a multi-APN record with more than one parcel.
- **Affected:** `lib/permit-linkage.ts`; migrations `20260705`/`20260706`; reporting V2.
- **Business consequence:** Page and aggregate reports can disagree, particularly for multi-APN permits.
- **Recommended action:** Define explicit multi-APN semantics and one canonical linkage output with ambiguity metadata.
- **Blocks next sprint:** Yes

### F-012 — Unused public adapter contains stronger conclusions

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** `lib/public/get-public-parcel.ts` is not imported, but says no layered residential programs appear and base zoning applies when no eligible/may-apply programs are found, even while Coastal/historic layers are not mapped.
- **Affected:** `lib/public/get-public-parcel.ts` lines 355-377.
- **Business consequence:** Accidental reuse could reintroduce overconfident conclusions.
- **Recommended action:** Mark the module deprecated immediately in documentation; remove it after canonicalization.
- **Blocks next sprint:** No

## 9. Database and Migration Findings

### F-013 — Local and remote migration state is split

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** Remote migration list has `20260522`, `20260705`, and `20260706`; local `20260707` is pending. The three July migration files are untracked.
- **Affected:** Supabase production, Git history, permit reporting.
- **Business consequence:** Migration state cannot be recovered from the committed repository and V2 reporting is not live.
- **Recommended action:** Commit reviewed migration files before applying V2; record apply and verification receipts.
- **Blocks next sprint:** Yes

### F-014 — V2 exposes more row-level data than its report needs

- **Severity:** High
- **Confidence:** Confirmed locally; remote V2 not applied
- **Evidence:** Pending V2 grants anon/authenticated SELECT on the entire precomputed cache copied from V1, including applicant name, address, descriptions, scopes, project IDs, and job IDs.
- **Affected:** `20260707_permit_linkage_report_v2.sql` lines 124-126.
- **Business consequence:** Applying V2 would broaden public row-level access when only aggregate reporting is required.
- **Recommended action:** Grant anon only on the aggregate view; keep cache and metadata service/admin-only unless a reviewed public use requires them.
- **Blocks next sprint:** Yes

### F-015 — V2 freshness function can be invoked by PUBLIC by default

- **Severity:** Medium
- **Confidence:** Confirmed locally; remote V2 not applied
- **Evidence:** The `SECURITY DEFINER` function is created without revoking default PUBLIC execute or setting a fixed search path. It can stamp report freshness without rebuilding the cache.
- **Affected:** `trulot_refresh_permit_linkage_reporting_v2()` in pending V2 migration.
- **Business consequence:** An unprivileged caller may make stale/partial cache metadata appear freshly stamped.
- **Recommended action:** `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`; grant only to service/admin role; set a fixed search path and record row counts/checksums.
- **Blocks next sprint:** Yes

### F-016 — Manual V2 backfill is operationally unsafe as a single script

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** The runbook calls address matching optional, but the SQL file contains an active address-match insert. Exact stage computes regex candidates unnecessarily; parsed stage recomputes them; stages are not checkpointed as an idempotent job.
- **Affected:** `docs/sql/permit-linkage-v2-backfill.sql`.
- **Business consequence:** Running the file executes the expensive optional stage and can time out or leave partial data on Nano compute.
- **Recommended action:** Split stages into separately invoked files/procedures, add batch keys/checkpoints, and measure each stage before production execution.
- **Blocks next sprint:** No, unless V2 backfill is included

### F-017 — Overlay function provenance and hardening are incomplete

- **Severity:** Medium
- **Confidence:** Confirmed locally; remote definition not compared
- **Evidence:** `check_parcel_overlays` is `SECURITY DEFINER`, has no fixed `search_path`, uses unqualified relations/functions, and has no migration for source layer creation, geometry indexes, versions, or grants.
- **Affected:** `20260522_overlay_lookup.sql`; TPA/SDA/CTCAC outputs.
- **Business consequence:** Security posture, performance, and exact mapped-layer provenance cannot be verified.
- **Recommended action:** Add fixed search path, schema qualification, explicit execute grants, source-layer manifests, geometry indexes, and layer version metadata.
- **Blocks next sprint:** Yes for regulatory claims

### F-018 — Referential integrity, import idempotency, and overwrite behavior are unverified

- **Severity:** High
- **Confidence:** Unverified
- **Evidence:** No DDL/import code for core data relations exists in the repository.
- **Affected:** Parcel, zoning, assessor, permit, overlay pipelines.
- **Business consequence:** Silent overwrites, duplicate imports, orphan rows, and nondeterministic refreshes cannot be ruled out.
- **Recommended action:** Export constraints/indexes and document import keys, upsert policy, source checksum, effective date, row counts, and rollback process.
- **Blocks next sprint:** Yes

## 10. Security and RLS Findings

### F-019 — RLS and grants on core relations cannot be audited

- **Severity:** High
- **Confidence:** Unverified
- **Evidence:** App and scripts use anon access for parcel, project, permit, and alert relations, but policies/grants are absent from the repository.
- **Affected:** Supabase public API surface.
- **Business consequence:** Overexposure or accidental denial can exist without code review visibility.
- **Recommended action:** Add a schema-security snapshot and automated assertions for exposed relations/functions.
- **Blocks next sprint:** Yes

### F-020 — Nearby-parcels edge function is an abuse risk if deployed publicly

- **Severity:** High
- **Confidence:** Confirmed code; Unverified deployment
- **Evidence:** Wildcard CORS, service-role client, no authentication/authorization, no APN format validation, and no minimum/maximum radius. The RPC may receive arbitrary large or invalid radii.
- **Affected:** `supabase/functions/nearby-parcels/index.ts` lines 4-68.
- **Business consequence:** A public caller could trigger expensive service-role spatial queries or enumerate parcel/project data.
- **Recommended action:** Confirm whether deployed; if needed, validate/clamp input, require an appropriate caller context, use least-privilege RPC, rate-limit, and remove error details.
- **Blocks next sprint:** Yes if deployed

### F-021 — Alert subscription endpoint lacks abuse controls

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** Public POST performs weak email validation, has no body length limits, rate limiting, bot protection, or role/location validation, and returns raw database error text.
- **Affected:** `app/api/alerts/subscribe/route.ts`.
- **Business consequence:** Spam, storage abuse, malformed data, and information leakage.
- **Recommended action:** Freeze feature or add schema validation, size limits, rate limiting, generic errors, and verified RLS before promotion.
- **Blocks next sprint:** No for Parcel Page work

### F-022 — Dependency vulnerability status could not be verified

- **Severity:** Low
- **Confidence:** Unverified
- **Evidence:** `npm audit --omit=dev` could not reach the npm registry due DNS restrictions. Build and type checking succeeded.
- **Affected:** npm dependencies.
- **Business consequence:** Known package advisories may be present but were not observable in this environment.
- **Recommended action:** Run dependency audit in CI with network access and retain the report.
- **Blocks next sprint:** No unless a critical advisory is found

## 11. Testing and QA Findings

There is no Vitest/Jest/Playwright configuration, no unit-test directory, no SQL test suite, and no checked-in fixtures.

The current permit QA provides useful known-record diagnostics but does not validate:

- process failure on regression;
- parsed APN discovered only in permit text;
- multi-APN ambiguity;
- address-only exclusion from direct history;
- source labels and confidence tiers;
- database error versus no-record behavior;
- rendered Parcel Page output;
- overlay boundary behavior;
- zoning/density/FAR/height/capacity rules.

### Top five tests with the greatest confidence return

| Priority | Test | What it protects |
|---:|---|---|
| 1 | Golden parcel truth receipts across base zoning, density, FAR, height, overlays, and escalation | Core deterministic product promise |
| 2 | Source outage/permission/timeout tests that must render “unavailable,” never “none” or 404 | Trustworthy uncertainty |
| 3 | Permit linkage matrix: exact, trailing zero, description-parsed, multi-APN, address-only, unmatched | Direct permit history integrity |
| 4 | Rule-version regression tests for ADU, SB 9, SB 79, Coastal, CCHS, TPA, Density Bonus | Regulatory change safety |
| 5 | Server-rendered page contract tests for source label, confidence, null behavior, canonical metadata, and forbidden copy | Public page integrity |

Recommended golden parcels should include at minimum: ordinary RS parcel, undersized/nonconforming lot, RM parcel, mixed/unknown zone, TPA edge parcel, SDA parcel, Coastal parcel, CCHS parcel, historic/fire constraint parcel, multi-APN permit parcel, ADU record, SB 9 candidate/noncandidate, SB 79 transit case, active permit case, and a quiet parcel.

## 12. Deployment and Operational Findings

### F-023 — Deployment is not reproducible or attributable

- **Severity:** High
- **Confidence:** Confirmed repository gap; live deployment unverified
- **Evidence:** No `vercel.json`, checked-in project mapping, CI workflow, environment matrix, release process, or deployed commit receipt. Canonical host is hardcoded as `https://trulot-web.vercel.app`. DNS restrictions prevented live verification.
- **Affected:** Vercel deployment, SEO metadata, release management.
- **Business consequence:** It is not possible to prove which commit/schema/data versions produced a live page or reliably roll back.
- **Recommended action:** Add a release runbook and build metadata endpoint/receipt containing commit SHA, migration head, engine version, and dataset versions.
- **Blocks next sprint:** Yes

### F-024 — Page request path is query-heavy and uncached

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** Both `generateMetadata()` and page render call the full adapter. The adapter performs parcel, permit, address, overlay, similar-parcel, and similar-permit queries. Route is `force-dynamic` with no shared request cache.
- **Affected:** `/parcel/san-diego/[slug]`.
- **Business consequence:** Duplicate database work, latency, and increased timeout/rate-limit risk.
- **Recommended action:** Deduplicate per-request loading and introduce freshness-aware server caching after data-version semantics are defined.
- **Blocks next sprint:** No

### F-025 — Similar-lot results are not deterministic nearest-neighbor results

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** Active adapter fetches an unordered limit of 24 same-zone/lot-size rows, then computes distance client-side and keeps rows within 0.5 miles.
- **Affected:** `lib/parcel-page-v1.ts` lines 492-536.
- **Business consequence:** Nearby precedents may be omitted depending on database row order.
- **Recommended action:** Use a versioned spatial query with deterministic distance/order and explicit methodology.
- **Blocks next sprint:** No

### F-026 — Sitemap freshness and coverage are misleading

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** Sitemap hardcodes host, caps at 25,000 without pagination/index partitioning, and assigns `new Date()` as `lastModified` for every parcel.
- **Affected:** `app/sitemap.ts`.
- **Business consequence:** Incomplete discovery and false freshness signals to search engines.
- **Recommended action:** Use configured production origin, stable dataset/page update timestamps, and paginated sitemap indexes.
- **Blocks next sprint:** No

### F-027 — Backup, recovery, monitoring, and incident procedures are absent

- **Severity:** High
- **Confidence:** Unverified operational state; Confirmed documentation gap
- **Evidence:** No repository runbook for Supabase backups/PITR, restore testing, query alerts, edge-function monitoring, failed imports, data-quality alarms, or rollback.
- **Affected:** Production operations.
- **Business consequence:** Recovery time and data integrity after a failed migration/import are unknown.
- **Recommended action:** Document current Supabase/Vercel controls and run a nonproduction restore/rebuild exercise.
- **Blocks next sprint:** Yes for significant data changes

## 13. Documentation Gaps

### F-028 — README and architecture documentation are stale

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** README is unchanged create-next-app boilerplate. `CLAUDE.md` names the legacy route, adapter, contract, and capacity rules as canonical and omits the current Parcel Page V1 route.
- **Affected:** `README.md`, `CLAUDE.md`, onboarding.
- **Business consequence:** New contributors are directed to superseded code and can extend the wrong architecture.
- **Recommended action:** After canonicalization, replace README and update architecture/doctrine with explicit source-of-truth declarations.
- **Blocks next sprint:** Yes

Missing knowledge artifacts:

- architecture decision records for canonical route, rule placement, and confidence vocabulary;
- database/view ownership and lineage diagram;
- dataset catalog with source, license, geography, vintage, refresh cadence, checksum, and steward;
- regulatory rule registry and effective-date process;
- migration/apply/rollback receipts;
- environment matrix and deployment runbook;
- golden-parcel catalog and expected receipts;
- RLS/exposure matrix;
- incident, restore, and stale-data runbooks.

## 14. Brian OS Integration Opportunities

These are future integration boundaries only. They should not be implemented until TruLot has canonical receipts and versioned rules.

| Brian OS object | Future TruLot representation |
|---|---|
| TruLot Project | Bounded regulatory/data work item tied to geography, rule version, and release goal |
| Regulatory evidence | Immutable source citation, extracted provision, effective date, jurisdiction, and applicability |
| Source document | Municipal code PDF, GIS layer, assessor/permit dataset, import checksum, and acquisition metadata |
| Observation | Recorded or mapped fact with source pointer and confidence |
| Parcel analysis | Versioned input snapshot plus deterministic intermediate/final outputs |
| Decision | Human-reviewed rule interpretation, escalation disposition, or release approval |
| Review queue | Unknown, conflict, stale source, boundary ambiguity, rule gap, or failed import |
| Receipt | Engine execution, migration, import, QA, deployment, and human override receipt |
| Outcome review | Later permit/planner outcome compared with prior TruLot conclusion |
| Regulatory monitoring | Source change detected → evidence review → rule update → regression run |
| TruLot Skill | Narrow capability such as normalize APN, resolve base zone, evaluate one rule, or produce receipt |
| Brooks mission routing | Route evidence collection/review tasks, not autonomous regulatory conclusions |
| Worker requirements | Jurisdiction knowledge, source access, deterministic execution, receipt emission, and escalation behavior |

## 15. Recommended Next TruLot Sprint

The next sprint should be deliberately narrow.

### 1. Canonicalize and freeze the product path

- Commit the reviewed Parcel Page V1 work in a dedicated PR.
- Declare `/parcel/san-diego/[slug]` + one adapter/contract canonical.
- Mark the legacy capacity API and unused public adapter deprecated.
- Add a committed architecture and schema dependency map.

### 2. Make absence and failure semantically different

- Add typed source-result states.
- Ensure query errors render unavailable/partial states.
- Add source-level freshness and error receipts.
- Prevent 404/no-permit conclusions on source failure.

### 3. Establish Truth Engine V0, not broad program coverage

- Create versioned types/tables for inputs, rules, intermediate results, citations, unknowns, and receipts.
- Implement only reviewed base zoning → density → FAR → height → base-capacity flow.
- Emit regulatory escalation rather than guessing when required inputs/rules are missing.

### 4. Build the golden-parcel and rule-regression harness

- Make QA exit nonzero.
- Add pure unit tests for normalization/rules.
- Add SQL tests for views/functions and ambiguity.
- Add rendered page contract tests.
- Store expected receipts for representative parcels.

### 5. Reproduce and secure the data platform

- Capture schema/RLS/grant snapshots and owned migrations.
- Add dataset/import manifests and checksums.
- Harden security-definer functions and V2 grants before apply.
- Add release, rollback, backup, and monitoring runbooks.

### Top five issues before meaningful new development

| Priority | Issue | Finding IDs |
|---:|---|---|
| 1 | False absence/not-found states on source failure | F-001 |
| 2 | Unsupported legacy capacity output remains public | F-002 |
| 3 | No reproducible core schema/import/RLS source | F-003, F-018, F-019 |
| 4 | Uncommitted split-brain product architecture | F-004, F-006, F-028 |
| 5 | No versioned truth engine or real regression suite | F-005, F-008 |

### Top five improvements that can safely wait

| Priority | Improvement | Why it can wait |
|---:|---|---|
| 1 | Sitemap partitioning and accurate modification timestamps | Does not affect core regulatory truth |
| 2 | Similar-lot spatial ranking optimization | Current output is contextual, not capacity logic |
| 3 | Jobs-feed consolidation | Freeze rather than expand during Parcel Page sprint |
| 4 | Alert subscription productization | Peripheral to the truth engine |
| 5 | Brian OS/Brooks runtime integration | Requires stable TruLot contracts and receipts first |

### Top five architecture/logic pieces to preserve

| Priority | Preserve | Reason |
|---:|---|---|
| 1 | Recorded / mapped / conditional uncertainty vocabulary | Central to public trust |
| 2 | Exact + parsed APN only for direct parcel permit history | Prevents weak address linkage from becoming parcel fact |
| 3 | Explicit unavailable/TODO program states | Avoids fabricated eligibility |
| 4 | Server-rendered facts with source metadata | Supports SEO, accessibility, and evidence visibility |
| 5 | Copy guardrails and canonical parcel URLs | Protects doctrine and stable public identity |

## 16. Do Not Touch Yet

- Do not add AI-generated zoning, capacity, rehab, underwriting, or eligibility conclusions.
- Do not implement Brian OS, Brooks routing, workers, or autonomous regulatory monitoring yet.
- Do not expand jobs, alerts, investor reporting, or generic CRM features.
- Do not backfill V2 permit reporting until grants, batching, checkpoints, and verification are reviewed.
- Do not add SB 79, Density Bonus, Coastal, CCHS, or full ADU/SB 9 logic as scattered page heuristics.
- Do not delete legacy code until route consumers and deployment state are known.
- Do not migrate rule logic into SQL merely for centralization; first define rule IDs, versions, sources, intermediate results, and test receipts.

## 17. Open Questions and Unverified Assumptions

1. Which Git commit is currently deployed to production, and is the uncommitted Parcel Page V1 deployed from a local working tree?
2. What is the production canonical domain? Code currently uses `trulot-web.vercel.app`.
3. What are the exact SQL definitions, owners, grants, RLS policies, indexes, and source relations for the three core views?
4. How are parcel, assessor, zoning, permit, and overlay datasets imported, versioned, deduplicated, and refreshed?
5. Does `generated_at` represent source acquisition, import completion, or view evaluation time?
6. Which overlay dataset vintages are loaded, and is point-on-boundary behavior intentionally `ST_Contains` rather than boundary-inclusive logic?
7. Is the `nearby-parcels` edge function deployed, and who is allowed to invoke it?
8. Is `/api/parcel/[apn]` consumed externally or by Brooks/Mission Control?
9. Are applicant names and full permit descriptions intentionally public through Supabase views?
10. What backup/PITR tier is enabled, and when was restore last tested?
11. Which regulatory professional approves rule interpretations and effective dates?
12. What is the authoritative definition of a multi-APN permit for direct parcel history?

## 18. Complete Findings Register

| ID | Severity | Confidence | Short finding | Primary evidence | Business consequence | Recommended action | Blocks next sprint |
|---|---|---|---|---|---|---|---:|
| F-001 | Critical | Confirmed | Source errors become false absence/404 | `lib/parcel-page-v1.ts` | Incorrect public record conclusion | Typed found/not-found/unavailable/partial states | Yes |
| F-002 | Critical | Confirmed / Strong inference | Unsupported capacity remains public | Legacy API + `get-parcel-page-data.ts` | Misleading development capacity | Deprecate/gate until cited engine exists | Yes |
| F-003 | High | Confirmed | Core schema/imports absent | Only four migrations | Cannot rebuild or compare environments | Capture canonical schema and lineage | Yes |
| F-004 | High | Confirmed | Parcel Page V1 uncommitted | Git status and origin main | Unreproducible deployment | Reviewed commit/PR | Yes |
| F-005 | High | Confirmed | No canonical truth engine | No rules/versions/receipts | Core promise not demonstrable | Implement narrow versioned engine contract | Yes |
| F-006 | High | Confirmed | Three conflicting parcel adapters | `lib/get-*`, `lib/parcel-*`, `lib/public/*` | Behavioral drift | Select one canonical contract | Yes |
| F-007 | High | Confirmed | Parsed-APN retrieval incomplete | Page prefetch strategy | Missing direct permits | Consume canonical linkage relation | Yes |
| F-008 | High | Confirmed | QA never fails on false case | QA script | Regressions pass CI | Assert and exit nonzero | Yes |
| F-009 | High | Confirmed | Dataset freshness conflated | Source registry | False currency impression | Per-dataset versions/timestamps | Yes |
| F-010 | Medium | Confirmed | Stage/jobs logic duplicated | Legacy adapter + jobs route | Endpoint disagreement | Consolidate after tests | No |
| F-011 | Medium | Confirmed | Linkage semantics diverge | TS versus SQL | Page/report disagreement | Define multi-APN canonical semantics | Yes |
| F-012 | Medium | Confirmed | Unused adapter has overstrong copy | `lib/public/get-public-parcel.ts` | Unsafe logic can return | Deprecate then remove | No |
| F-013 | High | Confirmed | Remote/local migrations split | Migration list + Git status | Irrecoverable migration history | Commit before apply | Yes |
| F-014 | High | Confirmed local | Pending V2 overgrants cache | V2 grants | Unnecessary public exposure | Aggregate-only anon grant | Yes |
| F-015 | Medium | Confirmed local | V2 stamp function publicly executable | Function defaults | False freshness metadata | Revoke and restrict execute | Yes |
| F-016 | Medium | Confirmed | Backfill optional stage is active | Backfill SQL/doc mismatch | Expensive/partial operation | Split staged jobs with checkpoints | No |
| F-017 | Medium | Confirmed / Unverified remote | Overlay RPC not hardened/versioned | Overlay migration | Unclear provenance/security | Qualify, version, index, restrict | Yes |
| F-018 | High | Unverified | Integrity/import idempotency unknown | Missing DDL/imports | Silent overwrite/duplicates possible | Document constraints and import receipts | Yes |
| F-019 | High | Unverified | Core RLS/grants unknown | Missing policy migrations | Exposure cannot be reviewed | Security snapshot and tests | Yes |
| F-020 | High | Confirmed code / Unverified deployment | Service-role spatial endpoint weakly controlled | Edge function | DB abuse/enumeration | Validate, authorize, rate-limit | If deployed |
| F-021 | Medium | Confirmed | Alerts endpoint lacks abuse controls | Alerts route | Spam/data leakage | Validate, limit, generic errors | No |
| F-022 | Low | Unverified | Dependency advisories unavailable | npm audit DNS failure | Unknown package risk | Run audit in CI | No |
| F-023 | High | Confirmed gap / Unverified live | Deployment not attributable | No release/CI metadata | Cannot prove or roll back release | Release receipt and runbook | Yes |
| F-024 | Medium | Confirmed | Parcel page duplicates uncached queries | Metadata + render | Latency/timeouts | Request dedupe and versioned caching | No |
| F-025 | Medium | Confirmed | Similar lots selected before distance | Limit then client filter | Unstable precedents | Deterministic spatial query | No |
| F-026 | Medium | Confirmed | Sitemap incomplete and falsely fresh | Sitemap code | SEO inconsistency | Indexes and source timestamps | No |
| F-027 | High | Unverified ops / Confirmed docs gap | No recovery/monitoring runbook | Repository absence | Unknown recovery posture | Document and test restore/alerts | Yes |
| F-028 | Medium | Confirmed | README/architecture stale | README + `CLAUDE.md` | Contributors follow wrong path | Rewrite after canonicalization | Yes |

## Audit Verification Record

Commands/results observed without modifying production:

- `git status --short`: substantial modified/untracked Parcel Page V1 work.
- `git log`: `main` and `origin/main` at `9b132ef`.
- `npx supabase migration list`: `20260522`, `20260705`, `20260706` remote; `20260707` pending.
- `npm run build`: passed; both parcel routes and all API routes compiled.
- `npm run lint`: zero errors, five existing unused-variable warnings.
- `npm run lint:copy`: passed.
- `npm run qa:permit-linkage`: five expected examples printed as passing; harness weakness documented in F-008.
- `npm audit --omit=dev`: not completed because npm registry DNS was unavailable.
- Live Vercel verification: not completed because external DNS was unavailable in the audit environment.
- Local dev server started successfully, but cross-command localhost access was unavailable in the sandbox; runtime HTTP behavior was therefore not used as evidence.

