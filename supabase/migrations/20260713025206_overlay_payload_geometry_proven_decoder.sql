-- Supersedes the unrecorded 20260713022000 repair migration. Production
-- forensics proved two CTCAC layouts: direct empty MultiPolygon WKB, or four
-- little-endian float64 bounds followed by MultiPolygon WKB at byte offset 32.

do $$
begin
  if (select count(*) from public.tpa_official) <> 31 then
    raise exception 'Overlay repair preflight: unexpected TPA row count.';
  end if;
  if (select count(*) from public.sda_official) <> 10299 then
    raise exception 'Overlay repair preflight: unexpected SDA row count.';
  end if;
  if (select count(*) from public.ctcac_gis_v1) <> 11337 then
    raise exception 'Overlay repair preflight: unexpected CTCAC row count.';
  end if;
  if exists (select 1 from public.tpa_official where geom is not null)
     or exists (select 1 from public.sda_official where geom is not null)
     or exists (select 1 from public.ctcac_gis_v1 where geom is not null) then
    raise exception 'Overlay repair preflight: geometry backfill is not clean.';
  end if;
end $$;

create or replace function public.trulot_overlay_payload_to_geometry(
  payload jsonb,
  safe_row_id text default '(unknown)'
)
returns extensions.geometry
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  normalized_payload jsonb;
  payload_type text;
  decoded_geom extensions.geometry;
  wkb_hex text;
  candidate_wkb_hex text;
  layout text;
  prefix_xmin double precision;
  prefix_xmax double precision;
  prefix_ymin double precision;
  prefix_ymax double precision;
begin
  if payload is null then
    raise exception 'Overlay row %: payload is null.', safe_row_id;
  end if;

  if jsonb_typeof(payload) = 'string' then
    begin
      normalized_payload := (payload #>> '{}')::jsonb;
    exception when others then
      raise exception 'Overlay row %: string payload is not valid JSON.', safe_row_id;
    end;
  else
    normalized_payload := payload;
  end if;

  if jsonb_typeof(normalized_payload) <> 'object' then
    raise exception 'Overlay row %: payload must be a JSON object.', safe_row_id;
  end if;

  payload_type := coalesce(normalized_payload->>'type', '');

  if payload_type = 'FeatureCollection' then
    raise exception 'Overlay row %: FeatureCollection is unsupported.', safe_row_id;
  elsif payload_type = 'Feature' then
    normalized_payload := normalized_payload->'geometry';
    if normalized_payload is null or jsonb_typeof(normalized_payload) <> 'object' then
      raise exception 'Overlay row %: Feature is missing geometry.', safe_row_id;
    end if;
    payload_type := coalesce(normalized_payload->>'type', '');
  end if;

  if payload_type in ('Polygon', 'MultiPolygon') then
    begin
      decoded_geom := extensions.st_geomfromgeojson(normalized_payload::text);
    exception when others then
      raise exception 'Overlay row %: malformed GeoJSON geometry.', safe_row_id;
    end;

    if extensions.st_geometrytype(decoded_geom) not in ('ST_Polygon', 'ST_MultiPolygon') then
      raise exception 'Overlay row %: GeoJSON geometry is not Polygon or MultiPolygon.', safe_row_id;
    end if;
    if not extensions.st_isvalid(decoded_geom) then
      raise exception 'Overlay row %: GeoJSON geometry is invalid.', safe_row_id;
    end if;
    return extensions.st_setsrid(decoded_geom, 4326);
  end if;

  if payload_type <> 'RawWKB' then
    raise exception 'Overlay row %: unsupported payload type.', safe_row_id;
  end if;

  wkb_hex := btrim(coalesce(normalized_payload->>'wkb', ''));
  if left(wkb_hex, 2) = chr(92) || 'x' then
    wkb_hex := substring(wkb_hex from 3);
  end if;
  wkb_hex := lower(wkb_hex);

  if wkb_hex = '' then
    raise exception 'CTCAC row %: RawWKB is missing.', safe_row_id;
  end if;
  if wkb_hex !~ '^[0-9a-f]+$' then
    raise exception 'CTCAC row %: RawWKB contains non-hex characters.', safe_row_id;
  end if;
  if length(wkb_hex) % 2 <> 0 then
    raise exception 'CTCAC row %: RawWKB has odd hex length.', safe_row_id;
  end if;

  if wkb_hex = '010600000000000000' then
    layout := 'direct-empty';
    candidate_wkb_hex := wkb_hex;
  elsif length(wkb_hex) > 64
        and substring(wkb_hex from 65 for 10) = '0106000000' then
    layout := 'bbox-prefix';
    candidate_wkb_hex := substring(wkb_hex from 65);
  else
    raise exception 'CTCAC row %: unsupported RawWKB layout.', safe_row_id;
  end if;

  begin
    decoded_geom := extensions.st_geomfromwkb(decode(candidate_wkb_hex, 'hex'));
  exception when others then
    raise exception 'CTCAC row %: selected RawWKB layout did not parse.', safe_row_id;
  end;

  if extensions.st_geometrytype(decoded_geom) <> 'ST_MultiPolygon' then
    raise exception 'CTCAC row %: decoded geometry is not MultiPolygon.', safe_row_id;
  end if;
  if not extensions.st_isvalid(decoded_geom) then
    raise exception 'CTCAC row %: decoded geometry is invalid.', safe_row_id;
  end if;
  if encode(extensions.st_asbinary(decoded_geom, 'NDR'), 'hex') <> candidate_wkb_hex then
    raise exception 'CTCAC row %: RawWKB contains trailing or noncanonical bytes.', safe_row_id;
  end if;

  if layout = 'direct-empty' then
    if not extensions.st_isempty(decoded_geom) then
      raise exception 'CTCAC row %: direct RawWKB is not empty.', safe_row_id;
    end if;
  else
    if extensions.st_isempty(decoded_geom) then
      raise exception 'CTCAC row %: bbox-prefixed RawWKB is empty.', safe_row_id;
    end if;

    prefix_xmin := extensions.st_x(extensions.st_geomfromwkb(decode(
      '0101000000' || substring(wkb_hex from 1 for 16) || '0000000000000000', 'hex')));
    prefix_xmax := extensions.st_x(extensions.st_geomfromwkb(decode(
      '0101000000' || substring(wkb_hex from 17 for 16) || '0000000000000000', 'hex')));
    prefix_ymin := extensions.st_x(extensions.st_geomfromwkb(decode(
      '0101000000' || substring(wkb_hex from 33 for 16) || '0000000000000000', 'hex')));
    prefix_ymax := extensions.st_x(extensions.st_geomfromwkb(decode(
      '0101000000' || substring(wkb_hex from 49 for 16) || '0000000000000000', 'hex')));

    if prefix_xmin <> extensions.st_xmin(extensions.box3d(decoded_geom))
       or prefix_xmax <> extensions.st_xmax(extensions.box3d(decoded_geom))
       or prefix_ymin <> extensions.st_ymin(extensions.box3d(decoded_geom))
       or prefix_ymax <> extensions.st_ymax(extensions.box3d(decoded_geom)) then
      raise exception 'CTCAC row %: bbox prefix does not match geometry envelope.', safe_row_id;
    end if;
  end if;

  return extensions.st_setsrid(decoded_geom, 4326);
end;
$function$;

comment on function public.trulot_overlay_payload_to_geometry(jsonb, text) is
  'Deterministically decodes reviewed Polygon/MultiPolygon GeoJSON and the proven CTCAC RawWKB layouts into SRID 4326 geometry.';

revoke all on function public.trulot_overlay_payload_to_geometry(jsonb, text) from public;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb, text) from anon;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb, text) from authenticated;
revoke all on function public.trulot_overlay_payload_to_geometry(jsonb, text) from service_role;

update public.tpa_official
set geom = public.trulot_overlay_payload_to_geometry(geojson, 'tpa:' || id::text);

update public.sda_official
set geom = public.trulot_overlay_payload_to_geometry(geojson, 'sda:' || id::text);

update public.ctcac_gis_v1
set geom = public.trulot_overlay_payload_to_geometry(geojson, 'ctcac:' || id::text);

do $$
begin
  if (select count(*) from public.tpa_official where geom is not null) <> 31 then
    raise exception 'Overlay repair verification: TPA backfill is incomplete.';
  end if;
  if (select count(*) from public.sda_official where geom is not null) <> 10299 then
    raise exception 'Overlay repair verification: SDA backfill is incomplete.';
  end if;
  if (select count(*) from public.ctcac_gis_v1 where geom is not null) <> 11337 then
    raise exception 'Overlay repair verification: CTCAC backfill is incomplete.';
  end if;
  if (select count(*) from public.ctcac_gis_v1 where extensions.st_geometrytype(geom) = 'ST_MultiPolygon') <> 11337 then
    raise exception 'Overlay repair verification: CTCAC geometry type mismatch.';
  end if;
  if exists (select 1 from public.ctcac_gis_v1 where not extensions.st_isvalid(geom)) then
    raise exception 'Overlay repair verification: invalid CTCAC geometry.';
  end if;
  if (select count(*) from public.ctcac_gis_v1 where extensions.st_isempty(geom)) <> 3 then
    raise exception 'Overlay repair verification: unexpected CTCAC empty geometry count.';
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
    select 1 from public.tpa_official
    where public.tpa_official.geom is not null
      and extensions.st_contains(public.tpa_official.geom, pt)
  ) into in_tpa;
  select exists (
    select 1 from public.sda_official
    where public.sda_official.geom is not null
      and extensions.st_contains(public.sda_official.geom, pt)
  ) into in_sda;
  select exists (
    select 1 from public.ctcac_gis_v1
    where public.ctcac_gis_v1.geom is not null
      and extensions.st_contains(public.ctcac_gis_v1.geom, pt)
  ) into in_ctcac;

  return jsonb_build_object('tpa', in_tpa, 'sda', in_sda, 'ctcac', in_ctcac);
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
  'Overlay lookup over normalized geometry. Preserves the jsonb contract and ST_Contains boundary semantics with a fixed search_path.';
