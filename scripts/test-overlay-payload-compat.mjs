import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

const ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DB_NAME = "trulot_overlay_rehearsal";
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:54322/${DB_NAME}`;
const MIGRATION = "supabase/migrations/20260713025206_overlay_payload_geometry_proven_decoder.sql";

// Non-sensitive production-derived metadata: every observed prefixed payload
// hex length. Geometry and coordinates below are regenerated locally.
const OBSERVED_LENGTHS = `236,268,300,332,364,396,428,460,492,524,556,588,620,652,684,710,716,748,780,812,844,870,876,902,908,940,972,998,1004,1036,1068,1100,1120,1132,1164,1196,1222,1228,1260,1292,1324,1356,1388,1420,1452,1460,1484,1516,1548,1580,1588,1612,1644,1676,1708,1740,1772,1780,1804,1836,1862,1868,1888,1900,1932,1964,1972,1996,2028,2060,2092,2124,2156,2164,2182,2188,2220,2252,2284,2316,2348,2380,2412,2444,2452,2476,2508,2540,2572,2604,2636,2668,2700,2732,2740,2764,2796,2828,2860,2892,2924,2956,2988,3020,3052,3084,3116,3148,3180,3212,3244,3276,3302,3308,3340,3366,3372,3404,3436,3468,3500,3532,3564,3596,3628,3654,3660,3692,3724,3756,3788,3820,3852,3884,3916,3948,3980,4012,4044,4076,4108,4140,4148,4172,4204,4236,4268,4300,4332,4364,4396,4428,4460,4492,4524,4556,4588,4620,4628,4652,4660,4684,4716,4748,4756,4780,4812,4844,4876,4908,4940,4972,4980,5004,5012,5036,5068,5100,5108,5132,5140,5164,5196,5228,5244,5260,5292,5300,5324,5356,5388,5420,5452,5484,5516,5548,5580,5612,5644,5676,5708,5740,5804,5836,5868,5900,5932,5964,5996,6004,6028,6060,6092,6100,6124,6156,6188,6196,6220,6252,6284,6316,6348,6380,6412,6444,6476,6508,6540,6572,6604,6636,6668,6694,6700,6708,6732,6764,6796,6828,6860,6892,6924,6956,6988,7020,7084,7116,7148,7180,7212,7244,7276,7308,7340,7372,7404,7500,7532,7596,7628,7660,7692,7788,7820,7852,7884,7916,7948,7980,8012,8044,8076,8140,8166,8236,8268,8276,8300,8396,8428,8460,8492,8500,8524,8556,8588,8620,8652,8812,8844,8908,8940,8972,9012,9036,9068,9100,9164,9196,9228,9260,9292,9324,9420,9434,9452,9484,9548,9580,9612,9644,9676,9708,9740,9772,9836,9868,9900,9932,10092,10156,10188,10220,10252,10284,10316,10380,10412,10444,10476,10484,10508,10572,10604,10668,10700,10732,10828,10860,10892,10988,11052,11084,11244,11372,11436,11628,11724,11820,11852,11948,12012,12044,12076,12236,12332,12364,12492,12556,12620,12684,12716,12844,12876,12908,13004,13068,13196,13260,13292,13356,13396,13484,13644,13772,13836,13996,14028,14060,14380,14412,14508,14700,14764,14796,14860,14924,14956,14988,15052,15116,15148,15180,15212,15532,15596,15756,15884,15916,15948,15980,16140,16172,16268,16460,16524,16556,16588,16660,17068,17100,17196,17260,17356,17804,17836,17844,18124,18348,18380,18412,18732,18892,18956,19148,19372,19500,19596,19692,19732,19756,20076,20524,20620,20652,20780,21004,21068,21292,21388,21580,21996,22412,22508,22828,22892,23052,23340,23820,24108,24332,24844,25324,26732,26764,26796,29836,30028,30060,30700,31276,37452,39020`.split(",").map(Number);

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", ...options }).trim();
}

function psql(sql, { url = DB_URL, fail = true } = {}) {
  const result = spawnSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql], { encoding: "utf8" });
  if (fail && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function writeUInt32LE(value) {
  const b = Buffer.alloc(4); b.writeUInt32LE(value); return b;
}

function writeDoubleLE(value) {
  const b = Buffer.alloc(8); b.writeDoubleLE(value); return b;
}

function shapeForLength(hexLength) {
  for (let polygons = 1; polygons <= 64; polygons += 1) {
    const remainder = hexLength - 82 - 26 * polygons;
    if (remainder >= 128 * polygons && remainder % 32 === 0) {
      return { polygons, points: remainder / 32 };
    }
  }
  throw new Error(`Cannot synthesize observed payload length ${hexLength}`);
}

function fixtureForLength(hexLength) {
  const { polygons, points } = shapeForLength(hexLength);
  const pointCounts = Array(polygons).fill(4);
  for (let i = 4 * polygons; i < points; i += 1) pointCounts[i % polygons] += 1;
  const polygonBuffers = [];
  const allPoints = [];

  for (let p = 0; p < polygons; p += 1) {
    const count = pointCounts[p];
    const centerX = -117.19 + p * 3;
    const centerY = 32.75;
    const pointsForPolygon = [];
    for (let i = 0; i < count - 1; i += 1) {
      const angle = (2 * Math.PI * i) / (count - 1);
      pointsForPolygon.push([centerX + Math.cos(angle), centerY + Math.sin(angle)]);
    }
    pointsForPolygon.push(pointsForPolygon[0]);
    allPoints.push(...pointsForPolygon);
    polygonBuffers.push(Buffer.concat([
      Buffer.from([1]), writeUInt32LE(3), writeUInt32LE(1), writeUInt32LE(count),
      ...pointsForPolygon.flatMap(([x, y]) => [writeDoubleLE(x), writeDoubleLE(y)]),
    ]));
  }

  const wkb = Buffer.concat([Buffer.from([1]), writeUInt32LE(6), writeUInt32LE(polygons), ...polygonBuffers]);
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const prefix = Buffer.concat([
    writeDoubleLE(Math.min(...xs)), writeDoubleLE(Math.max(...xs)),
    writeDoubleLE(Math.min(...ys)), writeDoubleLE(Math.max(...ys)),
  ]);
  const hex = Buffer.concat([prefix, wkb]).toString("hex");
  assert.equal(hex.length, hexLength);
  return hex;
}

function jsonbString(value) {
  return JSON.stringify(JSON.stringify(value));
}

function expectFailure(sql, pattern) {
  const result = psql(sql, { fail: false });
  assert.notEqual(result.status, 0, "query unexpectedly succeeded");
  assert.match(result.stderr, pattern);
}

run("dropdb", ["--if-exists", "--force", "--maintenance-db", ADMIN_URL, DB_NAME]);
run("createdb", ["--maintenance-db", ADMIN_URL, DB_NAME]);

try {
  psql(`
    create schema extensions;
    create extension postgis with schema extensions;
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $roles$;
    create table public.tpa_official(id bigint primary key, geojson jsonb not null, geom extensions.geometry);
    create table public.sda_official(id bigint primary key, geojson jsonb not null, geom extensions.geometry);
    create table public.ctcac_gis_v1(id bigint primary key, geojson jsonb not null, geom extensions.geometry);
    create index idx_tpa_geom on public.tpa_official using gist(geom);
    create index idx_sda_geom on public.sda_official using gist(geom);
    create index idx_ctcac_geom on public.ctcac_gis_v1 using gist(geom);
    insert into public.tpa_official
      select n, to_jsonb('{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}'::text)
      from generate_series(1,31) n;
    insert into public.sda_official
      select n, case when n % 3 = 0
        then to_jsonb('{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}}'::text)
        else to_jsonb('{"type":"MultiPolygon","coordinates":[[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]]}'::text) end
      from generate_series(1,10299) n;
  `);

  const fixtures = OBSERVED_LENGTHS.map(fixtureForLength);
  while (fixtures.length < 11334) fixtures.push(fixtureForLength(748));
  fixtures.push("010600000000000000", "010600000000000000", "010600000000000000");
  const copyRows = fixtures.map((hex, i) => {
    const value = jsonbString({ type: "RawWKB", wkb: i === 0 ? `\\x${hex.toUpperCase()}` : hex });
    return `${i + 1},"${value.replaceAll('"', '""')}"`;
  });
  const copy = `${["copy public.ctcac_gis_v1(id,geojson) from stdin with (format csv);", ...copyRows, "\\."].join("\n")}\n`;
  const copied = spawnSync("psql", [DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: copy, encoding: "utf8" });
  assert.equal(copied.status, 0, copied.stderr);

  run("psql", [DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", MIGRATION]);
  const receipt = psql(`select
    (select count(*) from tpa_official where geom is not null),
    (select count(*) from sda_official where geom is not null),
    (select count(*) from ctcac_gis_v1 where geom is not null),
    (select count(*) from ctcac_gis_v1 where extensions.st_geometrytype(geom)='ST_MultiPolygon'),
    (select count(*) from ctcac_gis_v1 where extensions.st_isvalid(geom)),
    (select count(*) from ctcac_gis_v1 where extensions.st_isempty(geom)),
    public.check_parcel_overlays(32.75,-117.19)->>'ctcac';`).stdout.trim();
  assert.equal(receipt, "31|10299|11337|11337|11337|3|true");
  assert.equal(psql(`select
    (select prosecdef from pg_proc where oid='public.check_parcel_overlays(double precision,double precision)'::regprocedure),
    (select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid='public.check_parcel_overlays(double precision,double precision)'::regprocedure),
    has_function_privilege('anon','public.check_parcel_overlays(double precision,double precision)','execute'),
    has_function_privilege('authenticated','public.check_parcel_overlays(double precision,double precision)','execute'),
    has_function_privilege('service_role','public.check_parcel_overlays(double precision,double precision)','execute'),
    has_function_privilege('anon','public.trulot_overlay_payload_to_geometry(jsonb,text)','execute'),
    has_function_privilege('authenticated','public.trulot_overlay_payload_to_geometry(jsonb,text)','execute'),
    has_table_privilege('anon','public.ctcac_gis_v1','select'),
    has_table_privilege('authenticated','public.ctcac_gis_v1','select');`).stdout.trim(), "t|t|t|t|t|f|f|f|f");
  const deployedDefinition = psql(`select lower(pg_get_functiondef('public.check_parcel_overlays(double precision,double precision)'::regprocedure));`).stdout.trim();
  for (const qualifiedPredicate of [
    "public.tpa_official.geom is not null",
    "public.sda_official.geom is not null",
    "public.ctcac_gis_v1.geom is not null",
  ]) {
    assert(deployedDefinition.includes(qualifiedPredicate), `deployed function definition is missing: ${qualifiedPredicate}`);
  }

  assert.equal(psql(`select extensions.st_contains(public.trulot_overlay_payload_to_geometry(to_jsonb('{"type":"Polygon","coordinates":[[[-117.2,32.74],[-117.18,32.74],[-117.18,32.76],[-117.2,32.76],[-117.2,32.74]]]}'::text),'polygon'),extensions.st_setsrid(extensions.st_makepoint(-117.2,32.75),4326));`).stdout.trim(), "f");
  expectFailure(`select public.trulot_overlay_payload_to_geometry(null,'null-row');`, /payload is null/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry('{"type":"FeatureCollection","features":[]}'::jsonb,'collection');`, /FeatureCollection is unsupported/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry('{"type":"Feature","properties":{}}'::jsonb,'feature');`, /Feature is missing geometry/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb','020600000000000000'),'endian');`, /unsupported RawWKB layout/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb','abc'),'odd');`, /odd hex length/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb','zz'),'nonhex');`, /non-hex/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb','010300000000000000'),'polygon-wkb');`, /unsupported RawWKB layout/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb',repeat('00',16)||'010600000000000000'),'wrong-offset');`, /unsupported RawWKB layout/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb',repeat('00',31)||'010600000000000000'),'truncated-prefix');`, /unsupported RawWKB layout/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb',repeat('00',32)||'010600000000000000'),'prefixed-empty');`, /bbox-prefixed RawWKB is empty/i);
  expectFailure(`select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb',repeat('00',32)||'01060000000000000000'),'trailing-byte');`, /trailing or noncanonical bytes/i);
  expectFailure(`with invalid as (
    select encode(extensions.st_asbinary(extensions.st_geomfromtext('MULTIPOLYGON(((0 0,1 1,1 0,0 1,0 0)))'),'NDR'),'hex') wkb
  ) select public.trulot_overlay_payload_to_geometry(jsonb_build_object('type','RawWKB','wkb',repeat('00',32)||wkb),'invalid') from invalid;`, /decoded geometry is invalid/i);

  psql(`update tpa_official set geom=null; update sda_official set geom=null; update ctcac_gis_v1 set geom=null; update ctcac_gis_v1 set geojson=jsonb_build_object('type','RawWKB','wkb','xyz') where id=1;`);
  const failedMigration = spawnSync("psql", [DB_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", MIGRATION], { encoding: "utf8" });
  assert.notEqual(failedMigration.status, 0);
  assert.match(failedMigration.stderr, /ctcac:1.*non-hex/i);
  assert.equal(psql(`select (select count(*) from tpa_official where geom is not null),(select count(*) from sda_official where geom is not null),(select count(*) from ctcac_gis_v1 where geom is not null);`).stdout.trim(), "0|0|0");

  console.log(JSON.stringify({
    result: "overlay repair rehearsal passed",
    observedLengthClasses: OBSERVED_LENGTHS.length,
    tpa: 31, sda: 10299, ctcac: 11337,
    ctcacValid: 11337, ctcacEmpty: 3,
    rollbackOnInjectedError: true,
  }));
} finally {
  run("dropdb", ["--if-exists", "--force", "--maintenance-db", ADMIN_URL, DB_NAME]);
}
