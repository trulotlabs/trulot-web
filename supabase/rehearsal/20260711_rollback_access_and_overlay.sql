create or replace function public.check_parcel_overlays(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
as $$
declare
  pt extensions.geometry;
  in_tpa boolean := false;
  in_sda boolean := false;
  in_ctcac boolean := false;
begin
  pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326);

  select exists (
    select 1 from tpa_official
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_tpa;

  select exists (
    select 1 from sda_official
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_sda;

  select exists (
    select 1 from ctcac_gis_v1
    where st_contains(st_setsrid(st_geomfromgeojson(geojson::text), 4326), pt)
  ) into in_ctcac;

  return jsonb_build_object('tpa', in_tpa, 'sda', in_sda, 'ctcac', in_ctcac);
end;
$$;

revoke all on table public.parcel_page_api_v2 from public;
revoke all on table public.parcel_primary_project_v1 from public;
revoke all on table public.parcel_permit_terminal_v2 from public;
revoke all on table public.trulot_permit_parcel_link_v1 from public;
revoke all on table public.trulot_permit_linkage_report_v1 from public;
revoke all on table public.tpa_official from public;
revoke all on table public.sda_official from public;
revoke all on table public.ctcac_gis_v1 from public;
revoke all on function public.check_parcel_overlays(double precision, double precision) from public;
revoke all on function public.get_opportunity_feed(integer, integer, integer) from public;
revoke all on function public.trulot_extract_apn_candidates(text) from public;
revoke all on function public.trulot_normalize_address_key(text) from public;
revoke all on function public.trulot_normalize_apn_digits(text) from public;
revoke all on function public.update_nearby_activity_v2() from public;

grant all on function public.check_parcel_overlays(double precision, double precision) to anon, authenticated, service_role;
grant all on function public.get_opportunity_feed(integer, integer, integer) to anon, authenticated, service_role;
grant all on function public.trulot_extract_apn_candidates(text) to anon, authenticated, service_role;
grant all on function public.trulot_normalize_address_key(text) to anon, authenticated, service_role;
grant all on function public.trulot_normalize_apn_digits(text) to anon, authenticated, service_role;
grant all on function public.update_nearby_activity_v2() to anon, authenticated, service_role;

grant all on table public.ctcac_gis_v1 to anon, authenticated, service_role;
grant all on sequence public.ctcac_gis_v1_id_seq to anon, authenticated, service_role;
grant all on table public.parcel_page_api_v2 to anon, authenticated, service_role;
grant all on table public.parcel_permit_terminal_v2 to anon, authenticated, service_role;
grant all on table public.parcel_primary_project_v1 to anon, authenticated, service_role;
grant all on table public.sda_official to anon, authenticated, service_role;
grant all on sequence public.sda_official_id_seq to anon, authenticated, service_role;
grant all on table public.tpa_official to anon, authenticated, service_role;
grant all on sequence public.tpa_official_id_seq to anon, authenticated, service_role;
grant all on table public.trulot_permit_parcel_link_v1 to anon, authenticated, service_role;
grant all on table public.trulot_permit_linkage_report_v1 to anon, authenticated, service_role;
