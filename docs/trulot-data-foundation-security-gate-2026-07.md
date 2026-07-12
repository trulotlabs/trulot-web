# TruLot Data Foundation & Security Gate Sprint — July 2026

Date: 2026-07-11  
Branch: `codex/trulot-data-foundation-security-2026-07`  
Starting commit: `fa33484`  
Remote evidence: `/private/tmp/trulot-public-schema-fresh.sql`, `/private/tmp/trulot-full-schema.sql`, `/private/tmp/trulot-remote-full-baseline-2026-07-11.sql`

## Gate decision

Recommendation: `CONDITIONAL GO`

Why:

- the two `20260711` migrations behaved correctly in isolated apply/rollback rehearsal;
- the intended public parcel reads and overlay RPC behavior were preserved;
- the intended privilege removals actually took effect for `anon` and `authenticated`;
- but the rehearsal baseline is a closest reproducible public subset, not a byte-for-byte clone of the linked project, because the remote project also contains `brain` schema objects plus `vector` and `supabase_vault` dependencies that were not reproducible in the disposable local PostGIS environment.

Promotion conditions:

1. Verify the live promotion target still matches the captured remote baseline hash `d7ab94fc6c7eb1b7198efa487019b80ba3d34aa0db9a94712636b4c6f17219cb`.
2. Keep the `alerts_subscribers` feature isolated until a real backing object and abuse controls are verified.
3. Run a fresh pre-apply schema dump immediately before promotion and compare grants, policies, and function bodies for the affected objects.

## Scope

This sprint closes the remaining data-lineage, database-exposure, and deployment-readiness gaps that block Truth Engine V0.

Guardrails observed:

- No deployment performed.
- No migration applied.
- No production data modified.
- `supabase/functions/nearby-parcels/index.ts` remained out of scope and uncommitted.

## Alerts investigation and disposition

Evidence gathered:

- Only runtime writer found in the repo:
  - [app/api/alerts/subscribe/route.ts](/Users/ops/trulot-web/app/api/alerts/subscribe/route.ts)
- Only in-repo UI caller found:
  - [app/jobs/page.tsx](/Users/ops/trulot-web/app/jobs/page.tsx)
- Only Git introduction found:
  - commit `0b6939f` `Add /api/alerts/subscribe stub — writes to alerts_subscribers, no delivery logic`
- No matching object found in:
  - committed migrations
  - linked remote full-schema dump
  - linked remote public-schema dump
  - Supabase functions
  - dataset manifests
  - permit/security reconciliation docs

Disposition:

- `alerts_subscribers` is most defensibly classified as a future stub with missing schema history, not as a live verified production dependency.
- The stale runtime assumption was isolated in this sprint by making the route return `503` with explicit status metadata instead of attempting a write against an unverifiable object or leaking database error details.
- No speculative table or migration was created.

Residual risk:

- The jobs-page CTA still points at the route and will now surface an error state until a verified backing system exists.
- That is preferable to a silent 500 path against unverified infrastructure.

Machine-readable evidence:

- [remote-security-baseline-2026-07-11.json](/Users/ops/trulot-web/data/security/remote-security-baseline-2026-07-11.json)

## Phase 0 record

Verified before edits:

- Stabilization commits are present at the branch tip history:
  - `e870cf1` Stabilize canonical parcel page path
  - `8854cd0` Add applied parcel foundation migrations
  - `0918af7` Harden pending permit linkage V2 migration
  - `ccf6e9c` Remove duplicate public parcel adapter
  - `fa33484` Document repository database reconciliation
- `git status --short` showed one pre-existing modification:
  - `M supabase/functions/nearby-parcels/index.ts`
- The sprint branch was created from `fa33484`.

## Current public consumer map

Verified in the repository:

- Canonical Parcel Page server rendering uses:
  - `public.parcel_page_api_v2`
  - `public.trulot_permit_parcel_link_v1`
  - `public.parcel_permit_terminal_v2`
  - `public.check_parcel_overlays(double precision, double precision)`
- Search endpoint uses:
  - `public.parcel_page_api_v2`
  - `public.parcel_primary_project_v1`
- Sitemap uses:
  - `public.parcel_page_api_v2`
- Jobs feed uses:
  - `public.parcel_primary_project_v1`
  - `public.parcel_page_api_v2`
- Legacy compatibility API uses:
  - `public.parcel_page_api_v2`
  - `public.parcel_primary_project_v1`
  - `public.parcel_permit_terminal_v2`
- Alerts subscription route attempts to use:
  - `alerts_subscribers`

No in-repo consumer was found for:

- `public.trulot_permit_linkage_report_v1`
- direct reads from `public.tpa_official`
- direct reads from `public.sda_official`
- direct reads from `public.ctcac_gis_v1`

## Database exposure matrix

Legend:

- `implicit default` means PostgreSQL/Supabase may still permit access unless revoked, even when no explicit `GRANT TO PUBLIC` appears in the dump.
- `unverified` means the linked remote schema did not supply evidence.

| Object | Type | Owner | RLS | Policies | PUBLIC | anon | authenticated | service_role | SECURITY DEFINER | Fixed search_path | Schema-qualified dependencies | Current public consumer required? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `public.parcel_page_api_v2` | table | `postgres` | enabled | `public read` select policy | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | yes | Public routes only need `SELECT`; current grants exceed need. |
| `public.parcel_primary_project_v1` | table | `postgres` | enabled | `public read primary` select policy | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | yes | Search, jobs, and legacy API only need `SELECT`. |
| `public.parcel_permit_terminal_v2` | table | `postgres` | enabled | `public read permits` select policy | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | yes | Canonical page similar-lots lookup still queries this table directly. |
| `public.trulot_permit_parcel_link_v1` | view | `postgres` | n/a | n/a | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | no | n/a | yes | yes | Canonical direct permit history should keep read-only access. |
| `public.trulot_permit_linkage_report_v1` | view | `postgres` | n/a | n/a | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | no | n/a | yes | no | No current application consumer identified; move to service/admin-only. |
| `public.check_parcel_overlays(double precision, double precision)` | function returning `jsonb` | `postgres` | n/a | n/a | implicit default likely present unless revoked | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | yes | no | no | yes | Current live body uses unqualified overlay tables and PostGIS functions. |
| `public.tpa_official` | table | `postgres` | enabled | none observed | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | no | Only `check_parcel_overlays()` currently needs this relation. |
| `public.sda_official` | table | `postgres` | enabled | none observed | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | no | Only `check_parcel_overlays()` currently needs this relation. |
| `public.ctcac_gis_v1` | table | `postgres` | enabled | none observed | none observed | `GRANT ALL` | `GRANT ALL` | `GRANT ALL` | n/a | n/a | n/a | no | Only `check_parcel_overlays()` currently needs this relation. |
| `alerts_subscribers` | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | write path only if retained | Not present anywhere in the linked remote full-schema dump. The current route may target a missing or differently named object. |

## Remote security baseline

Captured read-only artifacts:

- linked full dump:
  - `/private/tmp/trulot-remote-full-baseline-2026-07-11.sql`
- SHA-256:
  - `d7ab94fc6c7eb1b7198efa487019b80ba3d34aa0db9a94712636b4c6f17219cb`
- machine-readable summary:
  - [remote-security-baseline-2026-07-11.json](/Users/ops/trulot-web/data/security/remote-security-baseline-2026-07-11.json)

Additional remote findings beyond the earlier sprint note:

- The linked project exposes a `brain` schema with separate read-only grants to `brain_readonly`.
- The dump references `extensions`, `vault`, `vector`, and realtime publication objects in addition to the public parcel objects.
- No current repo consumer uses Supabase Storage.
- No `alerts_subscribers` object appears anywhere in the linked full-schema dump.

## Least-privilege access model

### Public Parcel Page server rendering

- Keep `SELECT` for `anon` and `authenticated` on:
  - `public.parcel_page_api_v2`
  - `public.parcel_primary_project_v1`
  - `public.parcel_permit_terminal_v2`
  - `public.trulot_permit_parcel_link_v1`
- Keep `EXECUTE` for `anon` and `authenticated` on:
  - `public.check_parcel_overlays(double precision, double precision)`
- Remove `ALL` grants from those roles on the same objects.

### Search endpoint

- Needs only `SELECT` on:
  - `public.parcel_page_api_v2`
  - `public.parcel_primary_project_v1`

### Direct permit history

- Needs only `SELECT` on:
  - `public.trulot_permit_parcel_link_v1`
- Current implementation still also needs `SELECT` on:
  - `public.parcel_permit_terminal_v2`
  - because similar-lot permit lookups read raw permits directly.

### Overlay lookup

- Public callers should execute `public.check_parcel_overlays(...)`.
- Public callers should not read:
  - `public.tpa_official`
  - `public.sda_official`
  - `public.ctcac_gis_v1`

### Internal reporting

- `public.trulot_permit_linkage_report_v1` should be service/admin-only.

### Administrative refresh or backfill operations

- `public.update_nearby_activity_v2()` should be service/admin-only.
- Base-table write privileges for `service_role` remain a compatibility-sensitive area because the repository does not yet contain the real import pipeline. This sprint narrows public access without fabricating missing admin workflows.

### Alert subscription

- No permission change is proposed for `alerts_subscribers` in this sprint because the linked remote schema does not expose that object.
- This is an explicit stop-and-report item: the current route cannot be validated against remote evidence.

## Before/after access diff for pending migrations

### `20260712032203_foundation_access_least_privilege.sql`

Access intentionally removed:

- `anon` and `authenticated` lose direct table access to:
  - `public.tpa_official`
  - `public.sda_official`
  - `public.ctcac_gis_v1`
- `anon` and `authenticated` lose direct read access to:
  - `public.trulot_permit_linkage_report_v1`
- `anon` and `authenticated` lose execute access to:
  - `public.update_nearby_activity_v2()`
  - `public.get_opportunity_feed(integer, integer, integer)`
- `ALL` privileges are narrowed to `SELECT` for public parcel-read relations.

Access intentionally retained:

- `anon` and `authenticated` keep `SELECT` on:
  - `public.parcel_page_api_v2`
  - `public.parcel_primary_project_v1`
  - `public.parcel_permit_terminal_v2`
  - `public.trulot_permit_parcel_link_v1`
- `service_role` keeps privileged access required for internal/report/admin paths.

Compatibility implications:

- Canonical Parcel Page reads remain intact in rehearsal.
- Search, jobs, sitemap, and legacy compatibility reads remain covered by retained `SELECT` grants.
- Any undocumented external consumer of `public.trulot_permit_linkage_report_v1` or `public.get_opportunity_feed(...)` under `anon`/`authenticated` would break.
- No in-repo consumer for those public paths was found.

### `20260712032216_check_parcel_overlays_hardening.sql`

Behavior intentionally changed:

- fixes function `search_path` to `public, pg_temp`
- schema-qualifies overlay relations and PostGIS calls
- revokes implicit/default public execute and re-grants only the intended roles

Behavior intentionally retained:

- return type stays `jsonb`
- output keys stay `tpa`, `sda`, `ctcac`
- output meaning stays boolean overlay membership
- boundary behavior stays based on `ST_Contains`, which excludes boundary-edge points

Compatibility implications:

- overlay checks returned the same booleans before and after rehearsal for the seeded parcel point
- null inputs returned a safe false/false/false object in rehearsal

## Migration rehearsal

Rehearsal environment:

- isolated Docker PostGIS container on local port `55432`
- target database: `trulot_gate`
- baseline fixture:
  - [20260711_remote_public_baseline_subset.sql](/Users/ops/trulot-web/supabase/rehearsal/20260711_remote_public_baseline_subset.sql)
- seed data:
  - [20260711_seed_minimal_data.sql](/Users/ops/trulot-web/supabase/rehearsal/20260711_seed_minimal_data.sql)
- rollback script:
  - [20260711_rollback_access_and_overlay.sql](/Users/ops/trulot-web/supabase/rehearsal/20260711_rollback_access_and_overlay.sql)
- executable test runner:
  - [rehearse-foundation-migrations.mjs](/Users/ops/trulot-web/scripts/rehearse-foundation-migrations.mjs)
- actual run report:
  - [migration-rehearsal-report-2026-07-11.json](/Users/ops/trulot-web/data/security/migration-rehearsal-report-2026-07-11.json)

Rehearsal limitation:

- a byte-for-byte restore of the linked remote dump was not possible in the disposable environment because the linked project references non-public objects and extensions not available in the local PostGIS image:
  - `brain` schema vector-backed tables
  - `supabase_vault`
  - realtime publication objects
- Because the two pending migrations touch only the public parcel/overlay surface, the rehearsal used the closest reproducible public subset instead of fabricating the missing components.

### Role-based test matrix

| Test | Baseline | After apply | After rollback | Result |
|---|---|---|---|---|
| `anon` can read `public.parcel_page_api_v2` | allowed | allowed | allowed | pass |
| `anon` can read raw overlay tables | allowed | denied | allowed | pass |
| `anon` can write parcel base table | effectively allowed by grant set but not exercised | denied | restored to baseline grant posture | pass |
| `anon` can read `public.trulot_permit_linkage_report_v1` | allowed | denied | allowed | pass |
| `anon` can execute `public.check_parcel_overlays(...)` | allowed | allowed | allowed | pass |
| `anon` can execute `public.update_nearby_activity_v2()` | allowed | denied | allowed | pass |
| `authenticated` parcel read | allowed | allowed | allowed | pass |
| `authenticated` raw overlay table read | allowed | denied | allowed | pass |
| `service_role` report view read | allowed | allowed | allowed | pass |
| `service_role` admin helper execute | allowed | allowed | allowed | pass |
| overlay contract keys/meaning | baseline object | unchanged | restored | pass |
| overlay fixed `search_path` | no | yes | no | pass |

## Rollback status

Rollback procedure executed in rehearsal:

1. reapply the prior unqualified `check_parcel_overlays` body;
2. restore prior broad grants for the affected public objects;
3. rerun representative `anon` access checks.

Rollback result:

- pass in isolated rehearsal
- still unverified against production-specific objects outside the reproducible public subset

## Unresolved-risk register

| Risk | Severity | Why it remains | Promotion impact |
|---|---|---|---|
| External consumer of `public.trulot_permit_linkage_report_v1` or `public.get_opportunity_feed(...)` under `anon`/`authenticated` is undocumented | Medium | no in-repo consumer found, but external usage cannot be disproved from repo alone | requires pre-promotion consumer confirmation |
| `alerts_subscribers` backing store remains unverifiable | Medium | route stub existed without schema history | route must remain isolated until verified |
| Remote dump cannot be fully restored byte-for-byte locally | Medium | linked project includes unsupported local-only extensions/schema objects outside current migration scope | keeps recommendation at `CONDITIONAL GO` rather than `GO` |
| Over-broad default privileges remain in remote baseline | Medium | pending migrations do not change default-privilege posture | future objects can still inherit broad grants unless separately hardened |

## Unapplied migration plan

Added but not applied:

- [20260712032203_foundation_access_least_privilege.sql](/Users/ops/trulot-web/supabase/migrations/20260712032203_foundation_access_least_privilege.sql)
- [20260712032216_check_parcel_overlays_hardening.sql](/Users/ops/trulot-web/supabase/migrations/20260712032216_check_parcel_overlays_hardening.sql)

Compatibility notes captured inside the SQL:

- public parcel read paths are preserved with `SELECT`;
- overlay lookup remains callable by `anon` and `authenticated`;
- report/admin functions are narrowed to `service_role`;
- direct reads of raw overlay polygon tables are removed for `anon` and `authenticated`;
- `alerts_subscribers` is intentionally untouched pending remote verification.

## Core view ownership and lineage status

### `public.parcel_page_api_v2`

- Type: table
- Owner: `postgres`
- Primary key: `apn_norm`
- Confirmed indexes:
  - `idx_parcel_apn_prefix`
  - `idx_parcel_apn_prefix_7`
  - `idx_parcel_page_api_v2_address_key`
  - `idx_parcel_page_api_v2_apn_digits`
  - `idx_ppapi_v2_active`
  - `idx_ppapi_v2_slug`
  - `idx_ppapi_v2_zone_name`
- Confirmed calculated or derived columns:
  - `nearby_*`
  - `has_nearby_*`
  - `slug`
  - `page_title`
  - `meta_description`
  - `status_label`
- Refresh/rebuild mechanism:
  - `public.update_nearby_activity_v2()` updates nearby activity fields.
  - Full base-table import pipeline is missing from the repository.
- Dataset source / geography / acquisition / vintage / import completion:
  - partially observable through manifests only
  - import receipt remains missing
- Classification:
  - remotely observable but build process missing

### `public.parcel_primary_project_v1`

- Type: table
- Owner: `postgres`
- Primary key: `apn_norm`
- Confirmed indexes:
  - `idx_ppp_has_building`
  - `idx_ppp_tier`
- Confirmed calculated or derived columns:
  - `project_momentum_label`
  - `primary_project_days_since_activity`
  - `proposed_*`
- Refresh/rebuild mechanism:
  - not present in committed migrations
- Dataset source / geography / acquisition / vintage / import completion:
  - unverified beyond live columns
- Classification:
  - remotely observable but build process missing

### `public.parcel_permit_terminal_v2`

- Type: table
- Owner: `postgres`
- Unique key: `record_id`
- Confirmed indexes:
  - `idx_ppermits_apn`
  - `idx_ppermits_opened`
  - `idx_parcel_permit_terminal_v2_address_key`
  - `idx_parcel_permit_terminal_v2_apn_digits`
- Confirmed calculated or derived columns:
  - `normalized_stage`
  - `stale_flag`
  - `approval_scope`
  - `project_scope`
- Refresh/rebuild mechanism:
  - not present in committed migrations
- Dataset source / geography / acquisition / vintage / import completion:
  - partially documented in manifests only
- Classification:
  - remotely observable but build process missing

## Gap register

| Gap | Evidence | Operational risk | Sprint disposition |
|---|---|---|---|
| `alerts_subscribers` remote object missing | absent from fresh full-schema dump | alerts route may fail or target drifted schema | stop-and-report in this sprint; no permission migration applied |
| Core import pipelines absent | no committed import SQL or ETL definitions for parcel/project/permit base tables | cannot rebuild environment or prove dataset freshness | documented in manifests and runbook; not fabricated |
| Overlay source lineage absent | tables visible, import provenance absent | cannot prove source vintage or acquisition path | documented as `unknown` / `unverified` |
| Over-broad default privileges remain remote posture | fresh dump shows `ALTER DEFAULT PRIVILEGES ... GRANT ALL` to `anon`, `authenticated`, `service_role` | future objects may inherit unsafe grants | documented for future admin hardening; not changed remotely in this sprint |

## Exact promotion sequence

1. Keep the current `alerts` route isolation in place.
2. Capture a fresh linked remote full-schema dump and verify its SHA-256 and affected-object sections against the checked-in baseline summary.
3. Confirm no undocumented consumer still relies on public access to:
   - `public.trulot_permit_linkage_report_v1`
   - `public.get_opportunity_feed(integer, integer, integer)`
4. Confirm PITR/backups for the linked project.
5. Apply `20260712032203_foundation_access_least_privilege.sql`.
6. Apply `20260712032216_check_parcel_overlays_hardening.sql`.
7. Immediately dump the remote schema again.
8. Re-run:
   - `npm run lint`
   - `npm run build`
   - `npm run qa:permit-linkage`
   - `npm run qa:data-foundation`
   - `TRULOT_GATE_DB_URL=... TRULOT_GATE_ADMIN_URL=... npm run qa:foundation-migrations` against the isolated rehearsal DB, not production
9. Smoke-test:
   - canonical Parcel Page
   - search
   - jobs feed
   - legacy compatibility API
   - overlay lookup behavior
10. If any compatibility failure appears, use the rollback procedure and pre-apply schema dump immediately.
