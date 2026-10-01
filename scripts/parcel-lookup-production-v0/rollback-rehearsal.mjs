#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const databaseUrl = process.env.TRULOT_P45_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55460/postgres";
const rollback = path.join(root, "docs/sql/parcel-lookup-v0-rollback.sql");
const reportPath = path.join(root, "data/parcel-lookup-production-v0/rollback-rehearsal.json");

function psql(args) {
  const result = spawnSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", databaseUrl, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `psql exited ${result.status}`);
  return result.stdout.trim();
}

const before = JSON.parse(psql(["-c", `select json_build_object(
  'baseRows', count(*),
  'lookupRows', (select count(*) from trulot_v2.parcel_lookup_v0),
  'acquisitions', (select count(*) from trulot_v2.parcel_acquisition),
  'runs', (select count(*) from trulot_v2.import_run)
) from trulot_v2.parcel_base_sangis_v2`]));
assert.equal(Number(before.baseRows), 393733);
assert.equal(Number(before.lookupRows), 393733);
psql(["-f", rollback]);
const after = JSON.parse(psql(["-c", `select json_build_object(
  'baseRows', count(*),
  'acquisitions', (select count(*) from trulot_v2.parcel_acquisition),
  'runs', (select count(*) from trulot_v2.import_run),
  'lookupRelation', to_regclass('trulot_v2.parcel_lookup_v0'),
  'searchRpc', to_regprocedure('public.parcel_lookup_v0_search(text,text,integer)'),
  'builder', to_regprocedure('trulot_v2.build_parcel_lookup_v0()'),
  'normalizer', to_regprocedure('trulot_v2.parcel_lookup_normalize_address_v0(text)')
) from trulot_v2.parcel_base_sangis_v2`]));
assert.equal(Number(after.baseRows), Number(before.baseRows));
assert.equal(Number(after.acquisitions), Number(before.acquisitions));
assert.equal(Number(after.runs), Number(before.runs));
assert.equal(after.lookupRelation, null);
assert.equal(after.searchRpc, null);
assert.equal(after.builder, null);
assert.equal(after.normalizer, null);

const report = {
  contractVersion: "parcel-lookup-production-v0-rollback-2026-10-01-p45",
  evidence: "LOCAL_DISPOSABLE_POSTGRESQL_FULL_CITY_CORPUS",
  productionAccessed: false,
  before,
  after,
  preservation: {
    parcelBaseV2: true,
    acquisitionMetadata: true,
    importRunMetadata: true,
    lookupInfrastructureRemoved: true,
  },
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Packet 45 rollback rehearsal\n${JSON.stringify(report, null, 2)}`);
