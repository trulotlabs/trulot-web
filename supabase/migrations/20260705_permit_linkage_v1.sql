create or replace function public.trulot_normalize_apn_digits(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(raw, ''), '\D', '', 'g');
$$;

create or replace function public.trulot_extract_apn_candidates(raw text)
returns text[]
language sql
immutable
as $$
  with matches as (
    select regexp_replace(match_text[1], '\D', '', 'g') as digits
    from regexp_matches(coalesce(raw, ''), '(\d{3}-\d{3}-\d{2}-\d{2}|\d{10,11})', 'g') as m(match_text)
  ),
  candidates as (
    select digits as candidate
    from matches
    where length(digits) = 10
    union
    select digits
    from matches
    where length(digits) = 11
    union
    select left(digits, 10)
    from matches
    where length(digits) = 11
  )
  select coalesce(array_agg(distinct candidate), array[]::text[])
  from candidates
  where candidate <> '';
$$;

create or replace function public.trulot_normalize_address_key(raw text)
returns text
language sql
immutable
as $$
  with base as (
    select trim(split_part(coalesce(raw, ''), ',', 1)) as street
  ),
  normalized as (
    select lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(street, '\b0+(\d)(st|nd|rd|th)\b', '\1\2', 'gi'),
                        '\bavenue\b|\bave\b|\bav\b',
                        ' ave ',
                        'gi'
                      ),
                      '\bterrace\b|\bter\b|\bterr\b|\btr\b',
                      ' ter ',
                      'gi'
                    ),
                    '\bstreet\b|\bst\b',
                    ' st ',
                    'gi'
                  ),
                  '\bdrive\b|\bdr\b',
                  ' dr ',
                  'gi'
                ),
                '\broad\b|\brd\b',
                ' rd ',
                'gi'
              ),
              '\bway\b|\bwy\b',
              ' way ',
              'gi'
            ),
            '\bplace\b|\bpl\b',
            ' pl ',
            'gi'
          ),
          '\bcourt\b|\bct\b',
          ' ct ',
          'gi'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) as key
    from base
  )
  select nullif(trim(key), '')
  from normalized;
$$;

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
),
address_candidates as (
  select
    permit.record_id,
    min(parcel.apn_norm) as matched_parcel_apn_norm,
    min(parcel.address) as matched_parcel_address,
    count(*) as parcel_count
  from permit_base permit
  join parcel_base parcel
    on permit.permit_address_key is not null
   and permit.permit_address_key = parcel.parcel_address_key
  group by permit.record_id
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
left join address_candidates address_match
  on address_match.record_id = permit.record_id;

create or replace view public.trulot_permit_linkage_report_v1 as
select
  count(*)::bigint as total_permits,
  count(*) filter (where linkage_confidence = 'exact_apn')::bigint as permits_with_exact_apn,
  count(*) filter (where linkage_confidence = 'parsed_apn')::bigint as permits_with_parsed_apn,
  count(*) filter (where linkage_confidence = 'address_match')::bigint as permits_matched_by_address,
  count(*) filter (where linkage_confidence = 'unmatched')::bigint as unmatched_permits,
  count(distinct matched_parcel_apn_norm) filter (where linkage_confidence in ('exact_apn', 'parsed_apn'))::bigint as parcels_with_direct_permit_history,
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
from public.trulot_permit_parcel_link_v1;
