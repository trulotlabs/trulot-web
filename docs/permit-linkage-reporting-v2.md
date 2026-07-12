# Permit Linkage Reporting V2

## Why the first V2 migration timed out

The first V2 attempt built the cache during migration apply.

The expensive operations were:

- `create materialized view ... with data` on the permit linkage cache
- repeated `regexp_matches(...)` extraction inside `public.trulot_extract_apn_candidates(...)`
- repeated APN and address normalization across large permit and parcel views
- parsed-APN lateral matching per permit row
- address-match aggregation during cache build
- index creation after large cache population

On Nano compute, that pushed the SQL Editor session past its timeout even though the database itself remained healthy.

## DDL-only migration rule

`supabase/migrations/20260707_permit_linkage_report_v2.sql` is now DDL-only.

It does:

- create `public.trulot_permit_parcel_link_cache_v2` as an empty table
- create indexes on the empty cache table
- create `public.trulot_permit_linkage_report_meta_v2` for freshness metadata
- create `public.trulot_permit_linkage_report_v2` as a cheap aggregate view over the precomputed cache
- create `public.trulot_refresh_permit_linkage_reporting_v2()` to stamp metadata only
- keep cache, metadata, report access, and refresh execution restricted to `service_role` unless a separate review approves broader access

It does not:

- populate the cache
- refresh materialized views
- run address matching during migration apply
- execute a backfill automatically

## Safe apply command

Apply the migration from the linked repo:

```bash
npx supabase db push
```

## Safe verification SQL

After apply, verify that the empty reporting machinery exists:

```sql
select
  to_regclass('public.trulot_permit_parcel_link_cache_v2') as link_cache,
  to_regclass('public.trulot_permit_linkage_report_meta_v2') as report_meta,
  to_regclass('public.trulot_permit_linkage_report_v2') as report_v2,
  to_regprocedure('public.trulot_refresh_permit_linkage_reporting_v2()') as refresh_fn;
```

## Refresh and backfill process

Backfill is manual and should be staged. Use [permit-linkage-v2-backfill.sql](/Users/ops/trulot-web/docs/sql/permit-linkage-v2-backfill.sql) as the operating runbook.

Recommended order:

1. Exact APN links first.
2. Parsed APN links second.
3. Address-only reporting links only if needed later.
4. Unmatched permits last.
5. Metadata stamp last with:

```sql
select public.trulot_refresh_permit_linkage_reporting_v2();
```

Do not run the full backfill repeatedly without a reason. On small compute, repeated rebuilds can create unnecessary load and long-running sessions.

## Security and exposure guardrails

- `20260707` must remain unapplied until grants and operational expectations are reviewed.
- `public.trulot_refresh_permit_linkage_reporting_v2()` is `SECURITY DEFINER` and should set a fixed `search_path`.
- Default PUBLIC execute permissions must be explicitly revoked for the refresh function.
- `anon` and `authenticated` must not receive direct access to `trulot_permit_parcel_link_cache_v2` or `trulot_permit_linkage_report_meta_v2`.
- `trulot_permit_linkage_report_v2` should stay non-public unless a separate reviewed requirement exists.

## Reading the report

Once the cache is backfilled and metadata is stamped, use:

```sql
select * from public.trulot_permit_linkage_report_v2;
```

If `cache_last_refreshed_at` is `null`, treat the report as installed but unrefreshed.

Metadata semantics:

- `cache_last_refreshed_at` is the timestamp of the last metadata stamp, not a proof that every source row is current.
- `address_match_included` only reports whether address-only rows were included in the cache build.
- `cache_row_count` reflects cache population size at stamp time.

## Parcel Page guardrails

Direct-history rule:

- Direct "This parcel" permit history may include `exact_apn` and `parsed_apn` only.

Address-only handling rule:

- `address_match` may appear in reporting or context workflows only.
- `address_match` must not enter direct parcel permit history.

## Operational warning

The migration apply path is intentionally lightweight now.

The heavy work lives outside `supabase/migrations/` so it can be:

- run intentionally
- staged in steps
- paused between phases
- moved to larger compute if needed

Current limitations that still need future hardening:

- The backfill runbook is not batched.
- The backfill runbook is not checkpoint-safe.
- The runbook truncates and rebuilds the cache, so interrupted runs can leave the report empty or partially rebuilt until restamped.
