#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import path from "node:path";
import os from "node:os";
import Module from "node:module";
import ts from "typescript";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const source = process.env.TRULOT_PARCEL_V2_ROWS
  ?? "/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z-pass2/rows.ndjson.gz";
const reportPath = path.join(root, "data/parcel-lookup-production-v0/rehearsal.json");
const expectedAcquisition = "SANGIS-20260924T183743Z";
const expectedRows = 393_733;
const expectedRun = "724ff836-eedc-594e-93c5-c80a63de65f7";
const expectedRowsSha256 = "95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868";

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

const contract = loadTs(path.join(root, "lib/parcel-lookup-contract.ts"));
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-p44-"));
const databasePath = path.join(temporaryDirectory, "lookup.sqlite");
const db = new DatabaseSync(databasePath);

function percentile(values, p) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * p) - 1)];
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function ftsQuery(normalized) {
  return normalized.split(" ").filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

function runTimed(statement, parameters, repetitions = 1) {
  const samples = [];
  let rows = [];
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    rows = statement.all(...parameters);
    samples.push(performance.now() - started);
  }
  return { rows, samples };
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

try {
  assert.equal(await sha256File(source), expectedRowsSha256, "sealed normalized-row artifact hash");
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE parcel_lookup (
      apn_norm TEXT PRIMARY KEY,
      apn_display TEXT NOT NULL,
      source_object_id INTEGER NOT NULL,
      parcel_id INTEGER NOT NULL,
      address TEXT,
      normalized_address TEXT,
      normalized_unit_address TEXT,
      situs_zip TEXT,
      situs_juris TEXT NOT NULL CHECK (situs_juris = 'SD'),
      approximate_geometry_area_sqft REAL NOT NULL,
      point_lng REAL NOT NULL,
      point_lat REAL NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX parcel_lookup_address_exact_idx ON parcel_lookup(normalized_address, apn_norm);
    CREATE INDEX parcel_lookup_unit_address_exact_idx ON parcel_lookup(normalized_unit_address, apn_norm);
    CREATE INDEX parcel_lookup_parcel_id_idx ON parcel_lookup(parcel_id);
    CREATE VIRTUAL TABLE parcel_lookup_address_fts USING fts5(
      apn_norm UNINDEXED,
      normalized_address,
      normalized_unit_address,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  const insert = db.prepare(`INSERT INTO parcel_lookup VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = db.prepare(`INSERT INTO parcel_lookup_address_fts VALUES (?, ?, ?)`);
  db.exec("BEGIN");
  let cityRows = 0;
  let acceptedRows = 0;
  const stream = readline.createInterface({ input: fs.createReadStream(source).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of stream) {
    const item = JSON.parse(line);
    if (!item.accepted) continue;
    acceptedRows += 1;
    const row = item.row;
    if (row.jurisdiction !== "SD") continue;
    const address = row.address && Number(row.address) !== 0 ? cleanText(row.address) : null;
    const unit = cleanText(row.situsComponents?.situs_suite);
    const normalizedAddress = address ? contract.normalizeAddress(address) : null;
    const normalizedUnitAddress = normalizedAddress && unit
      ? contract.normalizeAddress(`${address} UNIT ${unit}`)
      : normalizedAddress;
    const point = item.geometry.pointOnSurface;
    insert.run(
      row.apnNorm,
      contract.formatApn(row.apnNorm),
      row.sourceObjectId,
      row.parcelId,
      address,
      normalizedAddress,
      normalizedUnitAddress,
      cleanText(row.situsComponents?.situs_zip),
      row.jurisdiction,
      item.geometry.approxGeometryAreaSqFt,
      point[0],
      point[1],
    );
    insertFts.run(row.apnNorm, normalizedAddress ?? "", normalizedUnitAddress ?? "");
    cityRows += 1;
  }
  db.exec("COMMIT; ANALYZE");

  assert.equal(acceptedRows, 1_088_430);
  assert.equal(cityRows, expectedRows);
  assert.equal(db.prepare("SELECT count(*) n FROM parcel_lookup").get().n, expectedRows);
  assert.equal(db.prepare("SELECT count(DISTINCT apn_norm) n FROM parcel_lookup").get().n, expectedRows);

  const exactApn = db.prepare("SELECT * FROM parcel_lookup WHERE apn_norm = ? LIMIT 11");
  const apnPrefix = db.prepare("SELECT * FROM parcel_lookup WHERE apn_norm >= ? AND apn_norm < ? ORDER BY apn_norm LIMIT 11");
  const exactAddress = db.prepare("SELECT * FROM parcel_lookup WHERE normalized_address = ? OR normalized_unit_address = ? ORDER BY normalized_unit_address, apn_norm LIMIT 11");
  const autocomplete = db.prepare(`
    SELECT p.*
    FROM parcel_lookup_address_fts f
    JOIN parcel_lookup p USING (apn_norm)
    WHERE parcel_lookup_address_fts MATCH ?
    ORDER BY p.normalized_address, p.normalized_unit_address, p.apn_norm
    LIMIT 50
  `);

  const addressPopulation = db.prepare("SELECT apn_norm, normalized_address FROM parcel_lookup WHERE normalized_address IS NOT NULL ORDER BY apn_norm").all();
  const exactRows = Array.from({ length: 200 }, (_, index) =>
    addressPopulation[Math.floor(index * (addressPopulation.length - 1) / 199)]);
  const exactApnSamples = [];
  const exactAddressSamples = [];
  const autocompleteSamples = [];
  for (const row of exactRows) {
    exactApnSamples.push(...runTimed(exactApn, [row.apn_norm]).samples);
    exactAddressSamples.push(...runTimed(exactAddress, [row.normalized_address, row.normalized_address]).samples);
    const tokens = row.normalized_address.split(" ").slice(0, 2).map((token) => token.slice(0, Math.max(2, Math.min(token.length, 5)))).join(" ");
    autocompleteSamples.push(...runTimed(autocomplete, [ftsQuery(tokens)]).samples);
  }

  const exactKnown = exactApn.all("5442140600");
  assert.equal(exactKnown.length, 1);
  assert.equal(exactKnown[0].apn_display, "544-214-06-00");
  assert.equal(exactAddress.all("639 N 67TH ST", "639 N 67TH ST")[0].apn_norm, "5442140600");
  assert.equal(autocomplete.all(ftsQuery("639 67"))[0].apn_norm, "5442140600");
  assert.ok(apnPrefix.all("544214", "544215").some((row) => row.apn_norm === "5442140600"));

  const frontStreet = exactAddress.all("1501 FRONT ST", "1501 FRONT ST");
  assert.deepEqual(frontStreet.slice(0, 2).map((row) => row.apn_norm), ["5333641301", "5333641302"]);
  assert.equal(frontStreet[0].parcel_id, frontStreet[1].parcel_id);
  const condoUnit = exactAddress.all("2416 ADIRONDACK ROW UNIT 2", "2416 ADIRONDACK ROW UNIT 2");
  assert.equal(condoUnit[0].apn_norm, "5891700510");
  assert.ok(Number.isFinite(exactKnown[0].point_lng) && Number.isFinite(exactKnown[0].point_lat));

  const stacked = db.prepare(`SELECT parcel_id, count(*) n, count(DISTINCT apn_norm) apns FROM parcel_lookup WHERE parcel_id > 0 GROUP BY parcel_id HAVING count(*) > 1 ORDER BY n DESC, parcel_id LIMIT 1`).get();
  assert.ok(stacked.n > 1 && stacked.n === stacked.apns);
  const ambiguous = db.prepare(`SELECT normalized_address, count(*) n FROM parcel_lookup WHERE normalized_address IS NOT NULL GROUP BY normalized_address HAVING count(*) > 1 ORDER BY n DESC, normalized_address LIMIT 1`).get();
  assert.ok(ambiguous.n > 1);
  const missingAddress = db.prepare("SELECT count(*) n FROM parcel_lookup WHERE normalized_address IS NULL").get().n;
  assert.equal(missingAddress, 14_846);

  const plans = {
    exactApn: db.prepare("EXPLAIN QUERY PLAN SELECT * FROM parcel_lookup WHERE apn_norm = ? LIMIT 11").all("5442140600"),
    exactAddress: db.prepare("EXPLAIN QUERY PLAN SELECT * FROM parcel_lookup WHERE normalized_address = ? LIMIT 11").all("639 N 67TH ST"),
    autocomplete: db.prepare("EXPLAIN QUERY PLAN SELECT apn_norm FROM parcel_lookup_address_fts WHERE parcel_lookup_address_fts MATCH ? LIMIT 50").all(ftsQuery("639 67")),
  };
  assert.match(plans.exactApn.map((row) => row.detail).join(" "), /PRIMARY KEY/);
  assert.match(plans.exactAddress.map((row) => row.detail).join(" "), /parcel_lookup_address_exact_idx/);
  assert.match(plans.autocomplete.map((row) => row.detail).join(" "), /VIRTUAL TABLE INDEX/);

  const timings = {
    exactApn: { sampleCount: exactApnSamples.length, p50Ms: percentile(exactApnSamples, 0.5), p95Ms: percentile(exactApnSamples, 0.95), targetP95Ms: 100 },
    exactAddress: { sampleCount: exactAddressSamples.length, p50Ms: percentile(exactAddressSamples, 0.5), p95Ms: percentile(exactAddressSamples, 0.95), targetP95Ms: 150 },
    autocomplete: { sampleCount: autocompleteSamples.length, p50Ms: percentile(autocompleteSamples, 0.5), p95Ms: percentile(autocompleteSamples, 0.95), targetP95Ms: 200 },
  };
  for (const value of Object.values(timings)) {
    value.p50Ms = Number(value.p50Ms.toFixed(3));
    value.p95Ms = Number(value.p95Ms.toFixed(3));
    value.targetMet = value.p95Ms < value.targetP95Ms;
    assert.equal(value.targetMet, true);
  }

  const report = {
    contractVersion: "parcel-lookup-production-v0-rehearsal-2026-10-01-p44",
    observedOn: "2026-10-01",
    source: {
      classification: "LOCAL_SEALED_PARCEL_V2_ARTIFACT",
      acquisitionId: expectedAcquisition,
      validatedRunId: expectedRun,
      normalizedRowsSha256: expectedRowsSha256,
      productionAccessed: false,
      sourcePathRecorded: false,
      acceptedCountywideRows: acceptedRows,
      cityRows,
      distinctCityApns: expectedRows,
    },
    engine: { name: "SQLite FTS5 disposable rehearsal", sqliteVersion: db.prepare("SELECT sqlite_version() version").get().version, productionPostgresClaimed: false },
    coverage: {
      exactApn: true,
      apnPrefix: true,
      exactAddress: true,
      partialAutocomplete: true,
      multipleMatches: true,
      missingAddress: true,
      stackedParcels: true,
      mapPayload: "point_only",
      missingAddressCount: missingAddress,
      largestObservedStack: Number(stacked.n),
      largestObservedSharedAddress: Number(ambiguous.n),
    },
    timings,
    sampleStrategy: "200 deterministic APN-ordered, evenly spaced records from the complete address-bearing City population",
    plans: Object.fromEntries(Object.entries(plans).map(([key, rows]) => [key, rows.map((row) => row.detail)])),
    limitations: [
      "This measures a local SQLite FTS5 materialization, not production PostgreSQL network or API latency.",
      "PostgreSQL EXPLAIN (ANALYZE, BUFFERS) remains an acceptance gate for the bounded implementation packet.",
    ],
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PASS Parcel Lookup Production V0 rehearsal\n${JSON.stringify(report, null, 2)}`);
} finally {
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
