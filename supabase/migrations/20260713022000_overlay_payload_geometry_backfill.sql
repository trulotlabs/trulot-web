-- Purpose: decode stringified overlay payloads into native geometry columns and
-- route public.check_parcel_overlays() through normalized geometry storage.

create or replace function public.trulot_overlay_payload_to_geometry(payload jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  normalized_payload jsonb;
  payload_type text;
  feature_geometry jsonb;
  wkb_hex text;
  cleaned_wkb_hex text;
  bbox_prefixed_wkb_hex text;
begin
  if payload is null then
    raise exception 'Overlay payload is null.';
  end if;

  if jsonb_typeof(payload) = 'string' then
    normalized_payload := (payload #>> '{}')::jsonb;
  else
    normalized_payload := payload;
  end if;

  payload_type := coalesce(normalized_payload->>'type', '');

  if payload_type = 'Feature' then
    feature_geometry := normalized_payload->'geometry';
    if feature_geometry is null then
      raise exception 'Overlay Feature payload is missing geometry.';
    end if;
    normalized_payload := feature_geometry;
    payload_type := coalesce(normalized_payload->>'type', '');
  end if;

  if payload_type in ('Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection') then
    return extensions.st_setsrid(extensions.st_geomfromgeojson(normalized_payload::text), 4326);
  end if;

  if payload_type = 'RawWKB' then
    wkb_hex := nullif(normalized_payload->>'wkb', '');
    if wkb_hex is null then
      raise exception 'Overlay payload type RawWKB is missing the wkb field.';
    end if;
    cleaned_wkb_hex := regexp_replace(wkb_hex, '^\\x', '');

    begin
      return extensions.st_setsrid(extensions.st_geomfromwkb(decode(cleaned_wkb_hex, 'hex')), 4326);
    exception
      when sqlstate 'XX000' then
        bbox_prefixed_wkb_hex := substring(cleaned_wkb_hex from 65);
        if bbox_prefixed_wkb_hex ~ '^(00|01)[0-9A-Fa-f]{8,}$' then
          return extensions.st_setsrid(extensions.st_geomfromwkb(decode(bbox_prefixed_wkb_hex, 'hex')), 4326);
        end if;
        raise exception 'Unsupported RawWKB payload encoding.';
    end;
  end if;

  raise exception 'Unsupported overlay payload type: %', coalesce(payload_type, '(null)');
end;
$function$;

comment on function public.trulot_overlay_payload_to_geometry(jsonb) is
  'Decodes reviewed overlay payloads from jsonb objects or stringified payloads into SRID 4326 geometry. Supports canonical GeoJSON geometry fragments plus the existing RawWKB envelope found in CTCAC rows.';

revoke all on function public.trulot_overlay_payload_to_geometry(jsonb) from public;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb) from anon;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb) from authenticated;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb) from service_role;

update public.tpa_official
set geom = public.trulot_overlay_payload_to_geometry(geojson);

update public.sda_official
set geom = public.trulot_overlay_payload_to_geometry(geojson);

update public.ctcac_gis_v1
set geom = public.trulot_overlay_payload_to_geometry(geojson);

do $$
begin
  if exists (select 1 from public.tpa_official where geom is null) then
    raise exception 'TPA overlay geometry backfill left null geom values.';
  end if;
  if exists (select 1 from public.sda_official where geom is null) then
    raise exception 'SDA overlay geometry backfill left null geom values.';
  end if;
  if exists (select 1 from public.ctcac_gis_v1 where geom is null) then
    raise exception 'CTCAC overlay geometry backfill left null geom values.';
  end if;
end $$;

create or replace function public.check_parcel_overlays(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
    where public.tpa_official.geom is not null
      and extensions.st_contains(public.tpa_official.geom, pt)
  ) into in_tpa;

  select exists (
    select 1
    from public.sda_official
    where public.sda_official.geom is not null
      and extensions.st_contains(public.sda_official.geom, pt)
  ) into in_sda;

  select exists (
    select 1
    from public.ctcac_gis_v1
    where public.ctcac_gis_v1.geom is not null
      and extensions.st_contains(public.ctcac_gis_v1.geom, pt)
  ) into in_ctcac;

  return jsonb_build_object(
    'tpa', in_tpa,
    'sda', in_sda,
    'ctcac', in_ctcac
  );
end;
$function$;

revoke all on function public.check_parcel_overlays(double precision, double precision) from public;
revoke all on function public.check_parcel_overlays(double precision, double precision) from anon;
revoke all on function public.check_parcel_overlays(double precision, double precision) from authenticated;
revoke all on function public.check_parcel_overlays(double precision, double precision) from service_role;
grant execute on function public.check_parcel_overlays(double precision, double precision) to anon;
grant execute on function public.check_parcel_overlays(double precision, double precision) to authenticated;
grant execute on function public.check_parcel_overlays(double precision, double precision) to service_role;

comment on function public.check_parcel_overlays(double precision, double precision) is
  'Overlay lookup over normalized geometry in public.tpa_official, public.sda_official, and public.ctcac_gis_v1. Preserves the prior jsonb contract and ST_Contains boundary semantics while using the fixed search_path and schema-qualified PostGIS functions.';
