import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function psql(sql) {
  return execFileSync("psql", [DB_URL, "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

function withHelper(sql) {
  return psql(`${helperDefinition}\n${sql}`);
}

const helperDefinition = `
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create or replace function pg_temp.trulot_overlay_payload_to_geometry(payload jsonb)
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
    return extensions.st_setsrid(extensions.st_geomfromwkb(decode(wkb_hex, 'hex')), 4326);
  end if;

  raise exception 'Unsupported overlay payload type: %', coalesce(payload_type, '(null)');
end;
$function$;
`;

{
  const polygonType = withHelper(`
    select geometrytype(
      pg_temp.trulot_overlay_payload_to_geometry(
        to_jsonb('{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}'::text)
      )
    );
  `);
  assert.equal(polygonType, "POLYGON");
}

{
  const multiPolygonType = withHelper(`
    select geometrytype(
      pg_temp.trulot_overlay_payload_to_geometry(
        to_jsonb('{"type":"MultiPolygon","coordinates":[[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]]}'::text)
      )
    );
  `);
  assert.equal(multiPolygonType, "MULTIPOLYGON");
}

{
  const objectPolygonType = withHelper(`
    select geometrytype(
      pg_temp.trulot_overlay_payload_to_geometry(
        '{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}'::jsonb
      )
    );
  `);
  assert.equal(objectPolygonType, "POLYGON");
}

{
  const rawWkbContains = withHelper(`
    with raw as (
      select jsonb_build_object(
        'type', 'RawWKB',
        'wkb', encode(
          extensions.st_asbinary(
            extensions.st_geomfromgeojson('{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}')
          ),
          'hex'
        )
      ) as payload
    )
    select extensions.st_contains(
      pg_temp.trulot_overlay_payload_to_geometry(to_jsonb((select payload::text from raw))),
      extensions.st_setsrid(extensions.st_makepoint(-117.19, 32.75), 4326)
    )::text;
  `);
  assert.equal(rawWkbContains, "true");
}

{
  const featureContains = withHelper(`
    select extensions.st_contains(
      pg_temp.trulot_overlay_payload_to_geometry(
        to_jsonb('{"type":"Feature","properties":{"layer":"tpa"},"geometry":{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}}'::text)
      ),
      extensions.st_setsrid(extensions.st_makepoint(-117.19, 32.75), 4326)
    )::text;
  `);
  assert.equal(featureContains, "true");
}

{
  const boundaryContains = withHelper(`
    select extensions.st_contains(
      pg_temp.trulot_overlay_payload_to_geometry(
        '{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}'::jsonb
      ),
      extensions.st_setsrid(extensions.st_makepoint(-117.2, 32.75), 4326)
    )::text;
  `);
  assert.equal(boundaryContains, "false");
}

{
  let failed = false;
  try {
    withHelper(`
      select pg_temp.trulot_overlay_payload_to_geometry(
        to_jsonb('{"type":"Feature","properties":{"layer":"tpa"}}'::text)
      );
    `);
  } catch (error) {
    failed = /Overlay Feature payload is missing geometry/i.test(String(error.stderr || error.message));
  }
  assert.equal(failed, true);
}

{
  let failed = false;
  try {
    withHelper(`
      select pg_temp.trulot_overlay_payload_to_geometry(
        to_jsonb('{"type":"FeatureCollection","features":[]}'::text)
      );
    `);
  } catch (error) {
    failed = /Unsupported overlay payload type: FeatureCollection/i.test(String(error.stderr || error.message));
  }
  assert.equal(failed, true);
}

{
  let failed = false;
  try {
    withHelper(`
      select pg_temp.trulot_overlay_payload_to_geometry(null);
    `);
  } catch (error) {
    failed = /Overlay payload is null/i.test(String(error.stderr || error.message));
  }
  assert.equal(failed, true);
}

console.log("overlay payload compatibility tests passed");
