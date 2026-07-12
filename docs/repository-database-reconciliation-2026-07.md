# TruLot Repository and Database Reconciliation — July 2026

Date: 2026-07-11  
Branch: `codex/trulot-stabilization-2026-07`  
Stabilization baseline commit: `e870cf1`

## Scope

This sprint reconciles the repository with the database and application foundation currently relied upon by the canonical Parcel Page without applying migrations, changing production data, deploying, or beginning Truth Engine work.

## Stabilization baseline

Verified before edits:

- Branch is `codex/trulot-stabilization-2026-07`
- `HEAD` includes commit `e870cf1`
- `npm run build` passed
- `npm run lint` passed with 5 pre-existing warnings and 0 errors
- `npm run lint:copy` passed
- `npm run qa:permit-linkage` passed all 10 cases
- Remote migration status is:
  - `20260522` applied
  - `20260705` applied
  - `20260706` applied
  - `20260707` local only and unapplied

## Remaining-file disposition

| Path | Classification | Disposition | Why |
|---|---|---|---|
| `supabase/migrations/20260522_overlay_lookup.sql` | required canonical foundation; applied remotely but missing accurate committed history | commit | Canonical Parcel Page uses `check_parcel_overlays`; remote schema confirms the live function body matches this migration after the local `extensions.geometry` correction. |
| `supabase/migrations/20260705_permit_linkage_v1.sql` | required canonical foundation; applied remotely but missing from committed history | commit | Remote schema confirms these helper functions exist. This file is historical source for the first applied permit-linkage release. |
| `supabase/migrations/20260706_permit_linkage_perf_v1.sql` | required canonical foundation; applied remotely but missing from committed history | commit | Remote schema confirms the expression indexes exist and the live `trulot_permit_parcel_link_v1` view matches the later `20260706` shape. |
| `supabase/migrations/20260707_permit_linkage_report_v2.sql` | pending future work | commit as unapplied future migration only | Still local-only. Hardened in this sprint to avoid public cache access and to fix `SECURITY DEFINER` search-path behavior before any future apply. |
| `docs/permit-linkage-reporting-v2.md` | operational documentation | commit | Documents V2 as future-only, restricted-access, and manual-backfill work. |
| `docs/sql/permit-linkage-v2-backfill.sql` | pending future work; operational documentation | commit | Keeps heavy backfill out of migration apply path. Still not batched/checkpoint-safe; documented as such. |
| `docs/audits/TRULOT_TECHNICAL_AUDIT_2026-07.md` | operational documentation | commit | Governing audit for this stabilization/reconciliation sequence. |
| `lib/public/*` | deprecated duplicate logic | delete and commit deletion | Consumer map proved these files were unused and they could emit stronger conclusions than the canonical Parcel Page. |
| `AGENTS.md` | operational documentation | commit | Updated to reflect the canonical route/adapter and current sprint boundaries. |
| `supabase/.temp/` | generated or temporary | ignore, do not commit | Linked-project metadata and temp files are not source-of-truth code. |
| `supabase/functions/nearby-parcels/index.ts` | unrelated | leave uncommitted | Type cleanup for an edge function not required for Parcel Page/database reconciliation. |

## Applied-migration reconciliation

### `20260522_overlay_lookup.sql`

Verified against remote schema dump:

- Remote function `public.check_parcel_overlays(double precision, double precision)` exists.
- Function owner is `postgres`.
- Body matches the repository migration after the local `pt extensions.geometry;` correction.
- Remote function remains `SECURITY DEFINER`.
- Remote function still lacks a fixed `search_path`.
- Remote function references `tpa_official`, `sda_official`, and `ctcac_gis_v1` without schema qualification inside the body.

Conclusion:

- This migration belongs in committed history as applied foundation.
- It is not a complete security hardening record for the live function, but the object body itself is verified.

### `20260705_permit_linkage_v1.sql`

Verified against remote schema dump:

- `public.trulot_normalize_apn_digits(text)` exists and matches the migration logic.
- `public.trulot_extract_apn_candidates(text)` exists and matches the migration logic.
- `public.trulot_normalize_address_key(text)` exists and matches the migration logic.
- `public.trulot_permit_linkage_report_v1` exists remotely.

Important nuance:

- The live `public.trulot_permit_parcel_link_v1` view has already been superseded remotely by the `20260706` version, so `20260705` is historical applied source, not the current live view definition.

Conclusion:

- Commit as historical applied migration source.
- Do not claim it represents the current live view shape by itself.

### `20260706_permit_linkage_perf_v1.sql`

Verified against remote schema dump:

- Remote indexes exist:
  - `idx_parcel_page_api_v2_apn_digits`
  - `idx_parcel_permit_terminal_v2_apn_digits`
  - `idx_parcel_page_api_v2_address_key`
  - `idx_parcel_permit_terminal_v2_address_key`
- Live `public.trulot_permit_parcel_link_v1` uses the later `LEFT JOIN LATERAL` address-match form from this migration.

Conclusion:

- Commit as applied canonical permit-linkage foundation.
- This is the current live linkage-view shape the canonical Parcel Page now relies on.

## Pending V2 review

Objects reviewed:

- `supabase/migrations/20260707_permit_linkage_report_v2.sql`
- `docs/permit-linkage-reporting-v2.md`
- `docs/sql/permit-linkage-v2-backfill.sql`

### Findings

- The original local `20260707` granted cache, metadata, and report visibility to `anon` and `authenticated`.
- The refresh function was `SECURITY DEFINER` but did not set a fixed `search_path`.
- Because remote default privileges grant broad function access in `public`, explicit revokes are required.
- The backfill runbook truncates and rebuilds the cache and is not batched or checkpoint-safe.
- `address_match_included` is metadata about cache contents, not a guarantee of end-user feature exposure.

### Reconciliation changes made

- Restricted `trulot_permit_parcel_link_cache_v2`, `trulot_permit_linkage_report_meta_v2`, and `trulot_permit_linkage_report_v2` to `service_role` only.
- Explicitly revoked cache/report/meta access from `public`, `anon`, and `authenticated`.
- Explicitly revoked refresh-function execution from `public`, `anon`, and `authenticated`.
- Added `set search_path = public, pg_temp` to the `SECURITY DEFINER` refresh function.
- Documented that the backfill runbook is still non-batched and non-checkpoint-safe.

### Required invariant status

- `20260707` remains local-only and unapplied.
- After the changes in this sprint, the local future migration no longer grants anon/authenticated access to row-level cache data.

## `lib/public/*` consumer map and decision

Consumer map:

- No runtime imports were found for `lib/public/contract.ts` or `lib/public/get-public-parcel.ts`.
- References existed only in documentation and audit material.

Decision:

- Delete `lib/public/*`.

Why:

- The duplicate adapter was unused.
- The audit already identified stronger noncanonical conclusions in that adapter family.
- Retaining an unused, conflicting parcel contract increases the chance of future drift or accidental reuse.

## Database and security evidence captured

Source: read-only remote schema dump at `/private/tmp/trulot-public-schema.sql`.

Confirmed:

- `parcel_page_api_v2`, `parcel_permit_terminal_v2`, and `parcel_primary_project_v1` exist remotely as tables with primary keys.
- `trulot_permit_parcel_link_v1` exists remotely as a view owned by `postgres`.
- `trulot_permit_linkage_report_v1` exists remotely as a view owned by `postgres`.
- `check_parcel_overlays` exists remotely as a `SECURITY DEFINER` function owned by `postgres`.
- Overlay source relations `tpa_official`, `sda_official`, and `ctcac_gis_v1` exist remotely and have GiST indexes:
  - `idx_tpa_geom`
  - `idx_sda_geom`
  - `idx_ctcac_geom`
- Remote RLS is enabled on:
  - `parcel_page_api_v2`
  - `parcel_permit_terminal_v2`
  - `parcel_primary_project_v1`
  - overlay source tables
- Remote public-read policies exist on:
  - `parcel_page_api_v2`
  - `parcel_permit_terminal_v2`
  - `parcel_primary_project_v1`
- Remote grants are currently broad:
  - `GRANT ALL` on several public tables/views/functions to `anon`, `authenticated`, and `service_role`
  - `GRANT ALL` on `check_parcel_overlays(...)` to `anon`, `authenticated`, and `service_role`
  - `GRANT ALL` on `trulot_permit_parcel_link_v1` and `trulot_permit_linkage_report_v1` to `anon`, `authenticated`, and `service_role`

## Reproducibility gap register

| Object / area | Missing evidence | Impact | Safest verification method | Blocks deployment or Truth Engine work? |
|---|---|---|---|---:|
| `parcel_page_api_v2` lineage | No migration or import recipe showing how the table is built/populated | Cannot rebuild or audit source freshness pipeline | Export owned schema and import/runbook from remote ops | Yes |
| `parcel_primary_project_v1` lineage | No migration or import recipe showing how rows are derived | Primary project semantics remain opaque | Export source SQL or ETL definition from remote ops | Yes |
| `parcel_permit_terminal_v2` lineage | No import or transformation runbook | Permit history reproducibility remains partial | Export loader pipeline and source manifest | Yes |
| `check_parcel_overlays` hardening | Live function lacks fixed `search_path`; source-layer provenance not captured in migrations | Security and data-lineage risk | Review and ship a future hardening migration after access review | Yes |
| RLS exposure matrix | Remote dump shows policies and grants, but repo has no owned migration history for them | Repo still cannot fully recreate exposure posture | Commit reviewed security snapshots or owned migrations | Yes |
| Default privileges | Remote dump shows broad default privileges for `public` | New future objects may inherit over-broad access | Review role/default-privilege ownership and codify desired posture | Yes |
| Data refresh semantics | `generated_at` and source timestamps are not lineage receipts | Freshness claims stay coarse | Add per-dataset receipts and pipeline metadata | Yes |
| V2 reporting backfill ops | No batching/checkpoints; runbook truncates cache | Risky if ever applied without ops review | Design chunked/checkpoint-safe backfill before any production use | No for current canonical page; yes for V2 rollout |

## Uncommitted after this sprint

Expected to remain uncommitted:

- `supabase/functions/nearby-parcels/index.ts`
  - unrelated type cleanup

Generated/ignored:

- `supabase/.temp/`

## Explicit confirmations

- No production data changed.
- No migration was applied.
- `20260707` remains unapplied.
- No deployment occurred.
- Truth Engine development was not started.
