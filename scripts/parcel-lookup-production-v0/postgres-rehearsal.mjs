#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import zlib from "node:zlib";
import Module from "node:module";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const databaseUrl = process.env.TRULOT_P45_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55460/postgres";
const source = process.env.TRULOT_PARCEL_V2_ROWS
  ?? "/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz";
const migration = path.join(root, "supabase/migrations/20261001203830_parcel_lookup_v0_bounded.sql");
const reportPath = path.join(root, "data/parcel-lookup-production-v0/postgres-rehearsal.json");
const expectedAcquisition = "SANGIS-20260924T183743Z";
const expectedRun = "724ff836-eedc-594e-93c5-c80a63de65f7";
const expectedSourceSha256 = "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868";
const expectedCityRows = 393_733;
const expectedCityApnSha256 = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25";

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const lookup = loadTs(path.join(root, "lib/parcel-lookup-contract.ts"));

function runPsql(sql, options = {}) {
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", databaseUrl];
  if (options.file) args.push("-f", options.file);
  else args.push("-c", sql);
  const result = spawnSync("psql", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `psql exited ${result.status}`);
  return result.stdout.trim();
}

function expectPsqlFailure(sql, pattern) {
  const result = spawnSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", databaseUrl, "-c", sql], { encoding: "utf8" });
  assert.notEqual(result.status, 0, "query must fail");
  assert.match(result.stderr, pattern);
}

function psqlFingerprint(selectSql) {
  const result = spawnSync(
    "psql",
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", databaseUrl, "-c", `copy (${selectSql}) to stdout`],
    { encoding: null, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8").trim() || `psql fingerprint exited ${result.status}`);
  return crypto.createHash("sha256").update(result.stdout).digest("hex");
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function csv(value) {
  if (value === null || value === undefined || value === "") return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function loadCitySource() {
  const child = spawn("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", databaseUrl], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let errorOutput = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });
  child.stdin.write(`begin;\ncopy trulot_v2.parcel_base_sangis_v2 (
    acquisition_id, source_object_id, apn_norm, parcel_id, address,
    situs_components, situs_zip, situs_juris, approximate_geometry_area_sqft,
    point_on_surface, geometry_sha256
  ) from stdin with (format csv);\n`);
  let acceptedRows = 0;
  let cityRows = 0;
  const stream = readline.createInterface({
    input: fs.createReadStream(source).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of stream) {
    const item = JSON.parse(line);
    if (!item.accepted) continue;
    acceptedRows += 1;
    if (item.row.jurisdiction !== "SD") continue;
    const row = item.row;
    const point = item.geometry.pointOnSurface;
    const values = [
      expectedAcquisition,
      row.sourceObjectId,
      row.apnNorm,
      row.parcelId,
      row.address && Number(row.address) !== 0 ? String(row.address).trim() : null,
      JSON.stringify(row.situsComponents ?? {}),
      row.situsComponents?.situs_zip ?? row.situsZip ?? null,
      row.jurisdiction,
      item.geometry.approxGeometryAreaSqFt,
      `SRID=4326;POINT(${point[0]} ${point[1]})`,
      item.geometryStats.geometryHash,
    ];
    if (!child.stdin.write(`${values.map(csv).join(",")}\n`)) await once(child.stdin, "drain");
    cityRows += 1;
  }
  child.stdin.end("\\.\ncommit;\n");
  const [exitCode] = await once(child, "close");
  if (exitCode !== 0) throw new Error(errorOutput.trim() || `psql COPY exited ${exitCode}`);
  return { acceptedRows, cityRows };
}

function planEvidence(name, sql) {
  const plan = JSON.parse(runPsql(`explain (analyze, buffers, format json) ${sql}`))[0];
  const nodes = [];
  function visit(node) {
    nodes.push({
      nodeType: node["Node Type"],
      indexName: node["Index Name"] ?? null,
      actualRows: node["Actual Rows"],
      planRows: node["Plan Rows"],
      sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
      sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
    });
    for (const child of node.Plans ?? []) visit(child);
  }
  visit(plan.Plan);
  return {
    name,
    planningTimeMs: plan["Planning Time"],
    executionTimeMs: plan["Execution Time"],
    nodes,
    sequentialScan: nodes.some((node) => node.nodeType === "Seq Scan"),
    indexes: [...new Set(nodes.map((node) => node.indexName).filter(Boolean))],
  };
}

assert.equal(await sha256File(source), expectedSourceSha256, "sealed Parcel V2 normalized-row artifact");

runPsql(`
  drop schema if exists trulot_v2 cascade;
  drop function if exists public.parcel_lookup_v0_search(text, text, integer);
  drop role if exists anon;
  drop role if exists authenticated;
  drop role if exists service_role;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create extension if not exists postgis;
  create extension if not exists pgcrypto;
  create schema trulot_v2;
  revoke all on schema trulot_v2 from public;
  create table trulot_v2.parcel_acquisition (
    acquisition_id text primary key,
    dataset_id text not null,
    accepted_count integer not null,
    normalized_rows_sha256 text not null
  );
  create table trulot_v2.import_run (
    import_run_id uuid primary key,
    parcel_acquisition_id text not null,
    zoning_acquisition_id text,
    run_kind text not null,
    status text not null,
    completed_at timestamptz
  );
  create table trulot_v2.parcel_base_sangis_v2 (
    acquisition_id text not null references trulot_v2.parcel_acquisition(acquisition_id),
    source_object_id bigint not null,
    apn_norm text not null,
    parcel_id bigint not null,
    address text,
    situs_components jsonb not null,
    situs_zip text,
    situs_juris text not null,
    approximate_geometry_area_sqft double precision not null,
    point_on_surface geometry(Point,4326) not null,
    geometry_sha256 text not null,
    primary key (acquisition_id, source_object_id),
    unique (acquisition_id, apn_norm)
  );
  insert into trulot_v2.parcel_acquisition values (
    '${expectedAcquisition}', 'parcel_base_sangis_v2', 1088430, '${expectedSourceSha256}'
  );
  insert into trulot_v2.import_run values (
    '${expectedRun}', '${expectedAcquisition}', null, 'PARCEL_ONLY', 'VALIDATED', now()
  );
`);

const loaded = await loadCitySource();
assert.equal(loaded.acceptedRows, 1_088_430);
assert.equal(loaded.cityRows, expectedCityRows);
runPsql("", { file: migration });
expectPsqlFailure(`
  begin;
  update trulot_v2.parcel_acquisition
    set accepted_count = 0
    where acquisition_id = '${expectedAcquisition}';
  select trulot_v2.build_parcel_lookup_v0();
`, /source acquisition seal does not match/i);
assert.equal(Number(runPsql(`select accepted_count from trulot_v2.parcel_acquisition where acquisition_id = '${expectedAcquisition}'`)), 1_088_430);
assert.equal(Number(runPsql("select count(*) from trulot_v2.parcel_lookup_v0")), 0);
assert.equal(Number(runPsql("select trulot_v2.build_parcel_lookup_v0()")), expectedCityRows);

const correctness = JSON.parse(runPsql(`
  select json_build_object(
    'rows', count(*),
    'distinctApns', count(distinct apn_norm),
    'missingAddress', count(*) filter (where normalized_address is null),
    'exactApn', (select apn_display from trulot_v2.parcel_lookup_v0 where apn_norm = '5442140600'),
    'exactAddressApn', (select apn_norm from trulot_v2.parcel_lookup_v0 where normalized_address = '639 N 67TH ST' limit 1),
    'condoUnitApn', (select apn_norm from trulot_v2.parcel_lookup_v0 where normalized_unit_address = '2416 ADIRONDACK ROW UNIT 2' limit 1),
    'sharedAddressCount', (select count(*) from trulot_v2.parcel_lookup_v0 where normalized_address = '1501 FRONT ST'),
    'apnPrefixContainsKnown', exists(select 1 from trulot_v2.parcel_lookup_v0 where apn_norm like '544214%' and apn_norm = '5442140600'),
    'autocompleteContainsKnown', exists(
      select 1 from trulot_v2.parcel_lookup_v0
      where address_search_vector @@ to_tsquery('simple', '''639'':* & ''67'':*')
        and apn_norm = '5442140600'
    )
  ) from trulot_v2.parcel_lookup_v0
`));
assert.equal(Number(correctness.rows), expectedCityRows);
assert.equal(Number(correctness.distinctApns), expectedCityRows);
assert.equal(Number(correctness.missingAddress), 14_846);
correctness.apnSetSha256 = psqlFingerprint(`
  select apn_norm
  from trulot_v2.parcel_lookup_v0
  order by acquisition_id, source_object_id
`);
assert.equal(correctness.apnSetSha256, expectedCityApnSha256);
assert.equal(correctness.exactApn, "544-214-06-00");
assert.equal(correctness.exactAddressApn, "5442140600");
assert.equal(correctness.condoUnitApn, "5891700510");
assert.ok(Number(correctness.sharedAddressCount) >= 2);
assert.equal(correctness.apnPrefixContainsKnown, true);
assert.equal(correctness.autocompleteContainsKnown, true);

const normalizationFixtures = [
  "639 North 67th Street",
  "  639   n. 67th st. ",
  "2416 Adirondack Row #02",
  "202 C Street, San Diego CA 92101",
  "100 West Broadway Avenue CA 92101",
];
const normalization = normalizationFixtures.map((input) => {
  const escaped = input.replaceAll("'", "''");
  const sqlValue = runPsql(`select trulot_v2.parcel_lookup_normalize_address_v0('${escaped}')`);
  const jsValue = lookup.normalizeAddress(input);
  assert.equal(sqlValue, jsValue);
  return { input, normalized: jsValue };
});

const plans = [
  planEvidence("exactApn", "select * from trulot_v2.parcel_lookup_v0 where acquisition_id = 'SANGIS-20260924T183743Z' and apn_norm = '5442140600' limit 11"),
  planEvidence("apnPrefix", "select * from trulot_v2.parcel_lookup_v0 where acquisition_id = 'SANGIS-20260924T183743Z' and apn_norm like '544214%' order by apn_norm limit 11"),
  planEvidence("exactAddress", "select * from trulot_v2.parcel_lookup_v0 where acquisition_id = 'SANGIS-20260924T183743Z' and normalized_address = '639 N 67TH ST' limit 11"),
  planEvidence("unitAddress", "select * from trulot_v2.parcel_lookup_v0 where acquisition_id = 'SANGIS-20260924T183743Z' and normalized_unit_address = '2416 ADIRONDACK ROW UNIT 2' limit 11"),
  planEvidence("autocomplete", "select * from trulot_v2.parcel_lookup_v0 where acquisition_id = 'SANGIS-20260924T183743Z' and address_search_vector @@ to_tsquery('simple', '''639'':* & ''67'':*') order by normalized_address, normalized_unit_address nulls last, apn_norm limit 50"),
];
for (const plan of plans) {
  assert.equal(plan.sequentialScan, false, `${plan.name} must not use a sequential scan`);
  assert.ok(plan.indexes.length > 0, `${plan.name} must use an index`);
}

const timings = JSON.parse(runPsql(`
  create temp table benchmark_samples as
  with population as (
    select apn_norm, normalized_address, normalized_unit_address,
      row_number() over (order by apn_norm) as rn,
      count(*) over () as population
    from trulot_v2.parcel_lookup_v0
    where normalized_address is not null
  )
  select apn_norm, normalized_address, normalized_unit_address
  from population
  where (rn - 1) % greatest(floor(population / 200)::bigint, 1) = 0
  order by rn limit 200;
  create temp table benchmark_ms(kind text, elapsed_ms double precision);
  do $benchmark$
  declare sample record; started timestamptz; query_text text;
  begin
    for sample in select * from benchmark_samples loop
      started := clock_timestamp();
      perform 1 from trulot_v2.parcel_lookup_v0 where acquisition_id = '${expectedAcquisition}' and apn_norm = sample.apn_norm limit 1;
      insert into benchmark_ms values ('exactApn', extract(epoch from clock_timestamp() - started) * 1000);
      started := clock_timestamp();
      perform 1 from trulot_v2.parcel_lookup_v0 where acquisition_id = '${expectedAcquisition}' and normalized_address = sample.normalized_address limit 11;
      insert into benchmark_ms values ('exactAddress', extract(epoch from clock_timestamp() - started) * 1000);
      query_text := quote_literal(split_part(sample.normalized_address, ' ', 1)) || ':*';
      if split_part(sample.normalized_address, ' ', 2) <> '' then
        query_text := query_text || ' & ' || quote_literal(split_part(sample.normalized_address, ' ', 2)) || ':*';
      end if;
      started := clock_timestamp();
      perform 1 from trulot_v2.parcel_lookup_v0 where acquisition_id = '${expectedAcquisition}' and address_search_vector @@ to_tsquery('simple', query_text) limit 50;
      insert into benchmark_ms values ('autocomplete', extract(epoch from clock_timestamp() - started) * 1000);
    end loop;
  end
  $benchmark$;
  select json_object_agg(kind, evidence)
  from (
    select kind, json_build_object(
      'sampleCount', count(*),
      'medianMs', round(percentile_cont(0.5) within group (order by elapsed_ms)::numeric, 3),
      'p95Ms', round(percentile_cont(0.95) within group (order by elapsed_ms)::numeric, 3)
    ) evidence
    from benchmark_ms group by kind order by kind
  ) results;
`));
assert.equal(Number(timings.exactApn.sampleCount), 200);
assert.ok(Number(timings.exactApn.p95Ms) < 100);
assert.ok(Number(timings.exactAddress.p95Ms) < 150);
assert.ok(Number(timings.autocomplete.p95Ms) < 200);

const security = {
  directPublic: "DENIED",
  directAnon: "DENIED",
  directAuthenticated: "DENIED",
  directServiceRole: "DENIED",
  serviceRpc: "PASS",
  anonymousRpc: "DENIED",
  fixedSearchPath: "PASS",
  noDynamicSql: "PASS",
  limitBound: "PASS",
  malformedRejected: "PASS",
  injectionInert: "PASS",
};
for (const role of ["anon", "authenticated", "service_role"]) {
  expectPsqlFailure(`set role ${role}; select count(*) from trulot_v2.parcel_lookup_v0`, /permission denied|does not exist/i);
}
expectPsqlFailure("set role anon; select * from public.parcel_lookup_v0_search('5442140600','EXACT_APN',1)", /permission denied/i);
assert.equal(Number(runPsql("set role service_role; select count(*) from public.parcel_lookup_v0_search('5442140600','EXACT_APN',1)")), 1);
expectPsqlFailure("set role service_role; select * from public.parcel_lookup_v0_search('5442140600','EXACT_APN',51)", /invalid lookup limit/i);
expectPsqlFailure("set role service_role; select * from public.parcel_lookup_v0_search('x','AUTOCOMPLETE',10)", /invalid lookup query/i);
expectPsqlFailure(
  "set role service_role; select * from public.parcel_lookup_v0_search('639 N 67TH ST''; DROP TABLE trulot_v2.parcel_lookup_v0; --','AUTOCOMPLETE',10)",
  /invalid autocomplete query/i,
);
assert.equal(Number(runPsql("select count(*) from trulot_v2.parcel_lookup_v0")), expectedCityRows);
const functionDefinition = runPsql("select pg_get_functiondef('public.parcel_lookup_v0_search(text,text,integer)'::regprocedure)");
assert.doesNotMatch(functionDefinition, /\bexecute\b/i);
assert.match(functionDefinition, /SET search_path TO ''/);
assert.match(functionDefinition, /SET statement_timeout TO '1500ms'/);

const environment = JSON.parse(runPsql(`select json_build_object(
  'postgresVersion', current_setting('server_version'),
  'postgisVersion', postgis_lib_version(),
  'jit', current_setting('jit'),
  'sharedBuffers', current_setting('shared_buffers')
)`));

const report = {
  contractVersion: "parcel-lookup-production-v0-postgres-rehearsal-2026-10-01-p45",
  evidence: "LOCAL_DISPOSABLE_POSTGRESQL_FULL_CITY_CORPUS",
  productionAccessed: false,
  source: {
    acquisitionId: expectedAcquisition,
    validatedRunId: expectedRun,
    normalizedRowsSha256: expectedSourceSha256,
    acceptedCountywideRows: loaded.acceptedRows,
    cityRows: loaded.cityRows,
    pinMismatchRejected: true,
  },
  environment,
  correctness,
  normalization,
  plans,
  timings,
  performanceConditions: {
    sampleStrategy: "200 deterministic, APN-ordered samples from the full address-bearing City population",
    cache: "warm local container after materialization build and ANALYZE",
    hardware: "Local Apple host running an amd64 PostGIS container under Docker emulation; not a production-network claim",
  },
  security,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Packet 45 PostgreSQL/PostGIS full-corpus rehearsal\n${JSON.stringify(report, null, 2)}`);
