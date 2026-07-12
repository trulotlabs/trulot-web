-- Permit Linkage Reporting V2 manual backfill
-- Do not place this file under supabase/migrations/.
-- Run intentionally, in stages, after the DDL-only V2 migration has been applied.
-- Direct parcel history must remain exact_apn + parsed_apn only.
-- Address-only matches are optional for reporting and must not enter direct parcel history.
-- This runbook is not batched or checkpoint-safe yet. If interrupted, rerun intentionally.

begin;

truncate table public.trulot_permit_parcel_link_cache_v2;
delete from public.trulot_permit_linkage_report_meta_v2 where singleton = true;

commit;

-- Stage 1: exact APN matches
insert into public.trulot_permit_parcel_link_cache_v2
select
  permit.record_id,
  permit.record_number,
  permit.record_type,
  permit.status,
  permit.normalized_stage,
  permit.opened_date,
  permit.issued_date,
  permit.finaled_date,
  permit.completed_date,
  permit.expired_date,
  permit.last_activity_date,
  permit.stale_flag,
  permit.hierarchy_role,
  permit.address_full,
  permit.applicant_name,
  permit.description,
  permit.permit_source,
  permit.project_id,
  permit.job_id,
  permit.approval_scope,
  permit.project_scope,
  permit.project_title,
  permit.apn_norm,
  permit.permit_apn_digits,
  permit.apn_candidates,
  parcel.apn_norm as matched_parcel_apn_norm,
  parcel.address as matched_parcel_address,
  'exact_apn'::text as linkage_confidence,
  true as eligible_for_direct_timeline
from (
  select
    p.*,
    public.trulot_normalize_apn_digits(p.apn_norm::text) as permit_apn_digits,
    public.trulot_extract_apn_candidates(
      concat_ws(
        ' ',
        p.apn_norm::text,
        p.description,
        p.project_scope,
        p.approval_scope,
        p.project_title
      )
    ) as apn_candidates
  from public.parcel_permit_terminal_v2 p
) permit
join (
  select
    p.apn_norm,
    p.address,
    public.trulot_normalize_apn_digits(p.apn_norm::text) as parcel_apn_digits
  from public.parcel_page_api_v2 p
) parcel
  on permit.permit_apn_digits = parcel.parcel_apn_digits;

-- Stage 2: parsed APN matches for permits not already cached
insert into public.trulot_permit_parcel_link_cache_v2
select
  permit.record_id,
  permit.record_number,
  permit.record_type,
  permit.status,
  permit.normalized_stage,
  permit.opened_date,
  permit.issued_date,
  permit.finaled_date,
  permit.completed_date,
  permit.expired_date,
  permit.last_activity_date,
  permit.stale_flag,
  permit.hierarchy_role,
  permit.address_full,
  permit.applicant_name,
  permit.description,
  permit.permit_source,
  permit.project_id,
  permit.job_id,
  permit.approval_scope,
  permit.project_scope,
  permit.project_title,
  permit.apn_norm,
  permit.permit_apn_digits,
  permit.apn_candidates,
  parsed_match.apn_norm as matched_parcel_apn_norm,
  parsed_match.address as matched_parcel_address,
  'parsed_apn'::text as linkage_confidence,
  true as eligible_for_direct_timeline
from (
  select
    p.*,
    public.trulot_normalize_apn_digits(p.apn_norm::text) as permit_apn_digits,
    public.trulot_extract_apn_candidates(
      concat_ws(
        ' ',
        p.apn_norm::text,
        p.description,
        p.project_scope,
        p.approval_scope,
        p.project_title
      )
    ) as apn_candidates
  from public.parcel_permit_terminal_v2 p
) permit
join lateral (
  select parcel.apn_norm, parcel.address
  from (
    select
      p.apn_norm,
      p.address,
      public.trulot_normalize_apn_digits(p.apn_norm::text) as parcel_apn_digits
    from public.parcel_page_api_v2 p
  ) parcel
  where parcel.parcel_apn_digits = any(permit.apn_candidates)
  order by parcel.apn_norm
  limit 1
) parsed_match on true
where not exists (
  select 1
  from public.trulot_permit_parcel_link_cache_v2 cache
  where cache.record_id = permit.record_id
);

-- Stage 3: optional address-only reporting links
-- Run only if you need address-match reporting coverage.
-- Never use these rows for direct parcel permit history.
insert into public.trulot_permit_parcel_link_cache_v2
select
  permit.record_id,
  permit.record_number,
  permit.record_type,
  permit.status,
  permit.normalized_stage,
  permit.opened_date,
  permit.issued_date,
  permit.finaled_date,
  permit.completed_date,
  permit.expired_date,
  permit.last_activity_date,
  permit.stale_flag,
  permit.hierarchy_role,
  permit.address_full,
  permit.applicant_name,
  permit.description,
  permit.permit_source,
  permit.project_id,
  permit.job_id,
  permit.approval_scope,
  permit.project_scope,
  permit.project_title,
  permit.apn_norm,
  permit.permit_apn_digits,
  permit.apn_candidates,
  address_match.matched_parcel_apn_norm,
  address_match.matched_parcel_address,
  'address_match'::text as linkage_confidence,
  false as eligible_for_direct_timeline
from (
  select
    p.*,
    public.trulot_normalize_apn_digits(p.apn_norm::text) as permit_apn_digits,
    public.trulot_extract_apn_candidates(
      concat_ws(
        ' ',
        p.apn_norm::text,
        p.description,
        p.project_scope,
        p.approval_scope,
        p.project_title
      )
    ) as apn_candidates,
    public.trulot_normalize_address_key(p.address_full) as permit_address_key
  from public.parcel_permit_terminal_v2 p
) permit
join lateral (
  select
    min(parcel.apn_norm) as matched_parcel_apn_norm,
    min(parcel.address) as matched_parcel_address,
    count(*) as parcel_count
  from (
    select
      p.apn_norm,
      p.address,
      public.trulot_normalize_address_key(p.address) as parcel_address_key
    from public.parcel_page_api_v2 p
  ) parcel
  where permit.permit_address_key is not null
    and permit.permit_address_key = parcel.parcel_address_key
) address_match on true
where address_match.parcel_count = 1
  and not exists (
    select 1
    from public.trulot_permit_parcel_link_cache_v2 cache
    where cache.record_id = permit.record_id
  );

-- Stage 4: unmatched permits
insert into public.trulot_permit_parcel_link_cache_v2
select
  permit.record_id,
  permit.record_number,
  permit.record_type,
  permit.status,
  permit.normalized_stage,
  permit.opened_date,
  permit.issued_date,
  permit.finaled_date,
  permit.completed_date,
  permit.expired_date,
  permit.last_activity_date,
  permit.stale_flag,
  permit.hierarchy_role,
  permit.address_full,
  permit.applicant_name,
  permit.description,
  permit.permit_source,
  permit.project_id,
  permit.job_id,
  permit.approval_scope,
  permit.project_scope,
  permit.project_title,
  permit.apn_norm,
  public.trulot_normalize_apn_digits(permit.apn_norm::text) as permit_apn_digits,
  public.trulot_extract_apn_candidates(
    concat_ws(
      ' ',
      permit.apn_norm::text,
      permit.description,
      permit.project_scope,
      permit.approval_scope,
      permit.project_title
    )
  ) as apn_candidates,
  null::text as matched_parcel_apn_norm,
  null::text as matched_parcel_address,
  'unmatched'::text as linkage_confidence,
  false as eligible_for_direct_timeline
from public.parcel_permit_terminal_v2 permit
where not exists (
  select 1
  from public.trulot_permit_parcel_link_cache_v2 cache
  where cache.record_id = permit.record_id
);

-- Stage 5: metadata stamp
select public.trulot_refresh_permit_linkage_reporting_v2();
