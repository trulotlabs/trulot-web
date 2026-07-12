create index if not exists idx_parcel_permit_terminal_v2_apn_digits
  on public.parcel_permit_terminal_v2
  (public.trulot_normalize_apn_digits(apn_norm::text));

create index if not exists idx_parcel_page_api_v2_apn_digits
  on public.parcel_page_api_v2
  (public.trulot_normalize_apn_digits(apn_norm::text));

create index if not exists idx_parcel_permit_terminal_v2_address_key
  on public.parcel_permit_terminal_v2
  (public.trulot_normalize_address_key(address_full));

create index if not exists idx_parcel_page_api_v2_address_key
  on public.parcel_page_api_v2
  (public.trulot_normalize_address_key(address));

create or replace view public.trulot_permit_parcel_link_v1 as
with permit_base as (
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
),
parcel_base as (
  select
    p.apn_norm,
    p.address,
    p.situs_zip,
    public.trulot_normalize_apn_digits(p.apn_norm::text) as parcel_apn_digits,
    public.trulot_normalize_address_key(p.address) as parcel_address_key
  from public.parcel_page_api_v2 p
)
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
  coalesce(exact_match.apn_norm, parsed_match.apn_norm, address_match.matched_parcel_apn_norm) as matched_parcel_apn_norm,
  coalesce(exact_match.address, parsed_match.address, address_match.matched_parcel_address) as matched_parcel_address,
  case
    when exact_match.apn_norm is not null then 'exact_apn'
    when parsed_match.apn_norm is not null then 'parsed_apn'
    when address_match.parcel_count = 1 then 'address_match'
    else 'unmatched'
  end as linkage_confidence,
  case
    when exact_match.apn_norm is not null then true
    when parsed_match.apn_norm is not null then true
    else false
  end as eligible_for_direct_timeline
from permit_base permit
left join parcel_base exact_match
  on permit.permit_apn_digits = exact_match.parcel_apn_digits
left join lateral (
  select parcel.apn_norm, parcel.address
  from parcel_base parcel
  where parcel.parcel_apn_digits = any(permit.apn_candidates)
    and (
      exact_match.apn_norm is null
      or parcel.apn_norm <> exact_match.apn_norm
    )
  order by parcel.apn_norm
  limit 1
) parsed_match on true
left join lateral (
  select
    min(parcel.apn_norm) as matched_parcel_apn_norm,
    min(parcel.address) as matched_parcel_address,
    count(*) as parcel_count
  from parcel_base parcel
  where permit.permit_address_key is not null
    and permit.permit_address_key = parcel.parcel_address_key
) address_match on true;
