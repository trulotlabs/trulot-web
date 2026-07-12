drop view if exists public.trulot_permit_linkage_report_v2;
drop function if exists public.trulot_refresh_permit_linkage_reporting_v2();
drop table if exists public.trulot_permit_linkage_report_meta_v2;
drop table if exists public.trulot_permit_parcel_link_cache_v2;

create table public.trulot_permit_parcel_link_cache_v2
as
select *
from public.trulot_permit_parcel_link_v1
with no data;

create unique index idx_trulot_permit_parcel_link_cache_v2_record_id
  on public.trulot_permit_parcel_link_cache_v2 (record_id);

create index idx_trulot_permit_parcel_link_cache_v2_confidence
  on public.trulot_permit_parcel_link_cache_v2 (linkage_confidence);

create index idx_trulot_permit_parcel_link_cache_v2_direct
  on public.trulot_permit_parcel_link_cache_v2 (eligible_for_direct_timeline);

create index idx_trulot_permit_parcel_link_cache_v2_matched_apn
  on public.trulot_permit_parcel_link_cache_v2 (matched_parcel_apn_norm);

create table public.trulot_permit_linkage_report_meta_v2 (
  singleton boolean primary key default true,
  cache_last_refreshed_at timestamptz,
  cache_row_count bigint not null default 0,
  address_match_included boolean not null default false,
  refresh_notes text
);

create or replace view public.trulot_permit_linkage_report_v2 as
with cache_summary as (
  select
    count(*)::bigint as total_permits,
    count(*) filter (where linkage_confidence = 'exact_apn')::bigint as permits_with_exact_apn,
    count(*) filter (where linkage_confidence = 'parsed_apn')::bigint as permits_with_parsed_apn,
    count(*) filter (where linkage_confidence = 'address_match')::bigint as permits_matched_by_address,
    count(*) filter (where linkage_confidence = 'unmatched')::bigint as unmatched_permits,
    count(distinct matched_parcel_apn_norm) filter (
      where linkage_confidence in ('exact_apn', 'parsed_apn')
        and eligible_for_direct_timeline
    )::bigint as parcels_with_direct_permit_history,
    round(
      100.0 * count(*) filter (where linkage_confidence = 'exact_apn')
      / nullif(count(*), 0),
      2
    ) as before_match_rate_pct,
    round(
      100.0 * count(*) filter (where linkage_confidence in ('exact_apn', 'parsed_apn', 'address_match'))
      / nullif(count(*), 0),
      2
    ) as after_match_rate_pct
  from public.trulot_permit_parcel_link_cache_v2
),
meta as (
  select
    cache_last_refreshed_at,
    cache_row_count,
    address_match_included,
    refresh_notes
  from public.trulot_permit_linkage_report_meta_v2
  where singleton = true
)
select
  cache_summary.total_permits,
  cache_summary.permits_with_exact_apn,
  cache_summary.permits_with_parsed_apn,
  cache_summary.permits_matched_by_address,
  cache_summary.unmatched_permits,
  cache_summary.parcels_with_direct_permit_history,
  cache_summary.before_match_rate_pct,
  cache_summary.after_match_rate_pct,
  meta.cache_last_refreshed_at,
  coalesce(meta.cache_row_count, 0)::bigint as cache_row_count,
  coalesce(meta.address_match_included, false) as address_match_included,
  meta.refresh_notes,
  'Direct parcel permit history includes exact_apn and parsed_apn only.'::text as direct_history_rule,
  'Address-only matches are reporting/context only and are excluded from direct parcel permit history.'::text as address_only_rule
from cache_summary
left join meta on true;

create or replace function public.trulot_refresh_permit_linkage_reporting_v2()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.trulot_permit_linkage_report_meta_v2 (
    singleton,
    cache_last_refreshed_at,
    cache_row_count,
    address_match_included,
    refresh_notes
  )
  select
    true,
    now(),
    count(*)::bigint,
    count(*) filter (where linkage_confidence = 'address_match') > 0,
    'Backfill is manual and must be run outside the migration apply path.'
  from public.trulot_permit_parcel_link_cache_v2
  on conflict (singleton) do update
  set
    cache_last_refreshed_at = excluded.cache_last_refreshed_at,
    cache_row_count = excluded.cache_row_count,
    address_match_included = excluded.address_match_included,
    refresh_notes = excluded.refresh_notes;
end;
$$;

comment on table public.trulot_permit_parcel_link_cache_v2 is
  'Permit linkage cache for reporting V2. Migration installs this table empty. Populate it manually outside the migration apply path.';

comment on table public.trulot_permit_linkage_report_meta_v2 is
  'Singleton metadata for Permit Linkage Reporting V2. Use trulot_refresh_permit_linkage_reporting_v2() after manual backfill to stamp freshness.';

comment on function public.trulot_refresh_permit_linkage_reporting_v2() is
  'Updates Permit Linkage Reporting V2 metadata only. It does not populate the cache table.';

comment on view public.trulot_permit_linkage_report_v2 is
  'Cheap aggregate report over the precomputed V2 cache. If the cache is empty or not yet stamped, treat the report as unrefreshed.';

revoke all on table public.trulot_permit_parcel_link_cache_v2 from public, anon, authenticated;
revoke all on table public.trulot_permit_linkage_report_meta_v2 from public, anon, authenticated;
revoke all on table public.trulot_permit_linkage_report_v2 from public, anon, authenticated;
revoke all on function public.trulot_refresh_permit_linkage_reporting_v2() from public, anon, authenticated;

grant select on public.trulot_permit_parcel_link_cache_v2 to service_role;
grant select on public.trulot_permit_linkage_report_meta_v2 to service_role;
grant select on public.trulot_permit_linkage_report_v2 to service_role;
grant execute on function public.trulot_refresh_permit_linkage_reporting_v2() to service_role;
