-- Data Foundation & Security Gate Sprint
-- Purpose: harden public.check_parcel_overlays() without changing its output
-- contract or regulatory interpretation.
--
-- Preserved contract:
-- - returns jsonb
-- - returns keys: tpa, sda, ctcac
-- - values remain booleans
-- - point-boundary behavior remains unchanged because ST_Contains excludes
--   points that fall exactly on polygon boundaries.
--
-- Rollback procedure:
-- 1. Reapply the prior verified function body from 20260522_overlay_lookup.sql.
-- 2. Restore prior execute grants from the pre-apply schema dump.

create or replace function public.check_parcel_overlays(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pt extensions.geometry;
  in_tpa boolean := false;
  in_sda boolean := false;
  in_ctcac boolean := false;
begin
  pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  select exists (
    select 1
    from public.tpa_official
    where extensions.st_contains(
      extensions.st_setsrid(extensions.st_geomfromgeojson(public.tpa_official.geojson::text), 4326),
      pt
    )
  ) into in_tpa;

  select exists (
    select 1
    from public.sda_official
    where extensions.st_contains(
      extensions.st_setsrid(extensions.st_geomfromgeojson(public.sda_official.geojson::text), 4326),
      pt
    )
  ) into in_sda;

  select exists (
    select 1
    from public.ctcac_gis_v1
    where extensions.st_contains(
      extensions.st_setsrid(extensions.st_geomfromgeojson(public.ctcac_gis_v1.geojson::text), 4326),
      pt
    )
  ) into in_ctcac;

  return jsonb_build_object(
    'tpa', in_tpa,
    'sda', in_sda,
    'ctcac', in_ctcac
  );
end;
$$;

revoke all on function public.check_parcel_overlays(double precision, double precision) from public;
revoke all on function public.check_parcel_overlays(double precision, double precision) from anon;
revoke all on function public.check_parcel_overlays(double precision, double precision) from authenticated;
revoke all on function public.check_parcel_overlays(double precision, double precision) from service_role;
grant execute on function public.check_parcel_overlays(double precision, double precision) to anon;
grant execute on function public.check_parcel_overlays(double precision, double precision) to authenticated;
grant execute on function public.check_parcel_overlays(double precision, double precision) to service_role;

comment on function public.check_parcel_overlays(double precision, double precision) is
  'Overlay lookup over public.tpa_official, public.sda_official, and public.ctcac_gis_v1. Preserves the prior jsonb contract and ST_Contains boundary semantics while fixing search_path and schema qualification.';
