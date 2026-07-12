# TruLot Deployment Readiness Runbook — Data Foundation & Security Gate

Date: 2026-07-11  
Branch target: `codex/trulot-data-foundation-security-2026-07`  
Expected starting commit: `fa33484`

## Preconditions

- Linked Supabase project is the expected project ref:
  - `qockltdzvjxdlwrpgtsd`
- No production deploy or migration apply occurs directly from this sprint branch without separate approval.
- Verify the unrelated working-tree modification is still excluded:
  - `supabase/functions/nearby-parcels/index.ts`

## Expected repository state

- Branch contains the stabilization chain:
  - `e870cf1`
  - `8854cd0`
  - `0918af7`
  - `ccf6e9c`
  - `fa33484`
- This sprint adds but does not apply:
  - `20260711_foundation_access_least_privilege.sql`
  - `20260711_check_parcel_overlays_hardening.sql`

## Expected migration head

- Remote applied foundation confirmed before this sprint:
  - `20260522`
  - `20260705`
  - `20260706`
- Local unapplied migrations expected after this sprint:
  - `20260707`
  - `20260711_foundation_access_least_privilege`
  - `20260711_check_parcel_overlays_hardening`

## Dataset version checks

- Review [2026-07-11-foundation.json](/Users/ops/trulot-web/data/dataset-manifests/2026-07-11-foundation.json)
- Confirm no manifest field was silently upgraded from `unknown` / `unverified` without supporting evidence.
- Confirm the live deployment does not claim that `parcel_page_api_v2.generated_at` is the source freshness date for permits or overlays.

## Build and QA commands

Run:

```bash
npm run lint
npm run build
npm run lint:copy
node scripts/verify-data-foundation.mjs
npm run qa:permit-linkage
TRULOT_GATE_DB_URL=... TRULOT_GATE_ADMIN_URL=... npm run qa:foundation-migrations
```

## Grant and RLS verification

Before any future apply:

1. Dump fresh remote schema with `npx supabase db dump --linked`.
2. Confirm:
   - `public.parcel_page_api_v2`, `public.parcel_primary_project_v1`, and `public.parcel_permit_terminal_v2` still have RLS enabled.
   - `public.check_parcel_overlays(...)` still matches the reviewed hardening target before apply.
   - `alerts_subscribers` existence and intended write privileges are verified explicitly.
3. After any future apply, re-dump and compare grants for:
   - `parcel_page_api_v2`
   - `parcel_primary_project_v1`
   - `parcel_permit_terminal_v2`
   - `trulot_permit_parcel_link_v1`
   - `trulot_permit_linkage_report_v1`
   - `check_parcel_overlays(...)`
   - `tpa_official`
   - `sda_official`
   - `ctcac_gis_v1`

## Backup and PITR confirmation

Before any future production permission change:

- confirm Supabase PITR/backups are enabled for the target project;
- record the confirmation timestamp outside Git;
- retain a pre-change schema dump for rollback comparison.

## Rollback procedure

If a future apply breaks canonical Parcel Page reads:

1. Restore the pre-change grants from the pre-apply schema dump.
2. Reapply execute on `public.check_parcel_overlays(...)` to the previously working roles.
3. Reconfirm canonical Parcel Page, search, sitemap, jobs, and legacy compatibility reads.
4. If rollback is incomplete, stop public deployment and use the pre-change schema dump plus PITR procedure.

## Post-deployment smoke tests

- `/parcel/san-diego/[slug]` loads a known parcel.
- direct permit history still renders for a known exact-APN parcel.
- overlay badges still render for a parcel with known overlay membership.
- `/api/search?q=...` returns parcel results.
- `/api/parcel/[apn]` still returns the legacy compatibility response with quarantined capacity fields.
- `/api/jobs-feed` still loads.
- `alerts_subscribers` route is explicitly tested only after its backing object is verified.

## Live version verification

- verify the deployed Git commit through the hosting provider deployment metadata;
- verify the migration head through a fresh remote migration/status check;
- verify the schema by re-dumping and diffing reviewed object definitions.

## Source-failure verification

The live application must continue to show unavailable states instead of false absence conclusions:

- parcel source failure must not become `not_found`;
- permit source failure must not become “no permits on file”;
- overlay lookup failure must not become “no overlay applies”;
- nearby-lot query failure must not become “no nearby precedents”.
