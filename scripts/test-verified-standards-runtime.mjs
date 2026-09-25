import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8"));
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, process, Buffer, performance,
    require: id => id.startsWith(".") ? load(path.resolve(path.dirname(filename), id + (path.extname(id) ? "" : ".ts"))) : require(id) });
  return loaded.exports;
}

const sourcePaths = process.argv[2];
assert.ok(sourcePaths, "source-path manifest required for old/new equivalence");
const runtime = load(path.join(root, "lib/verified-standards-runtime.ts"));
const gate = load(path.join(root, "lib/rs17-shadow-gate.ts"));
const bundle = JSON.parse(fs.readFileSync(path.join(root, "data/runtime/verified-residential-standards-v2.json"), "utf8"));
const receipt = JSON.parse(fs.readFileSync(path.join(root, "data/runtime/verified-residential-standards-v2.receipt.json"), "utf8"));
const validationStart = performance.now();
const validation = runtime.validateVerifiedStandardsBundle(bundle, receipt);
const coldValidationMilliseconds = performance.now() - validationStart;
assert.equal(validation.valid, true, JSON.stringify(validation));
assert.equal(runtime.verifiedStandardsBundleStatus().valid, true);

const reference = JSON.parse(execFileSync("python3", [
  path.join(root, "scripts/verified-standards-runtime/reference.py"), sourcePaths,
], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, maxBuffer: 20_000_000 }));
const context = { evaluation_date: "2026-09-24", coastal_context: "outside",
  application_context: "new_application", airport_context: "outside_miramar_transition", lot_context: "unknown" };
let seen = 0;
for (const [zone, prior] of Object.entries(reference)) {
  const next = runtime.selectCompiledVerifiedStandards(zone, context);
  const comparable = { state: next.state, reason: next.reason, parameters: next.parameters.map(item => item.value) };
  assert.equal(runtime.canonicalVerifiedStandardsJson(comparable),
    runtime.canonicalVerifiedStandardsJson({ state: prior.state, reason: prior.reason, parameters: prior.parameters }), zone);
  seen += next.parameters.length;
}
assert.equal(seen, 213);

for (const coastal_context of ["inside", "unknown"]) {
  const blocked = runtime.selectCompiledVerifiedStandards("RS-1-7", { ...context, coastal_context });
  assert.equal(blocked.state, "unknown"); assert.equal(blocked.parameters.length, 0);
}
assert.equal(runtime.selectCompiledVerifiedStandards("CC-1-1", context).parameters.length, 0);
assert.equal(runtime.selectCompiledVerifiedStandards("RS-1-7", context, ["excluded-rule"]).parameters.length, 0);
const split = runtime.resolveCompiledVerifiedStandards({ apn: "5810934600", zoneCodes: ["RS-1-1", "RS-1-7"],
  mappingState: "MULTI_ZONE", context });
assert.equal(JSON.stringify(split.parcelIntelligence.truth.baseZoning.value.zones), JSON.stringify(["RS-1-1", "RS-1-7"]));
assert.equal(split.standards.length, 2);
assert.equal(runtime.resolveCompiledVerifiedStandards({ apn: "5810934600", zoneCodes: ["RS-1-7"], mappingState: "INDETERMINATE", context }), null);

for (const mutate of [
  value => { value.recordCount = 212; },
  value => { value.schemaVersion = "wrong"; },
  value => { value.records[0].sealedRecordCanonical += " "; },
  value => { value.recordIds[0] = "unsealed"; },
  value => { value.sourceEvidenceManifest.residential.sha256 = "drift"; },
]) {
  const changed = structuredClone(bundle); mutate(changed);
  assert.equal(runtime.validateVerifiedStandardsBundle(changed, receipt).valid, false);
}
const receiptAttack = structuredClone(receipt); receiptAttack.bundleCanonicalSha256 = "0".repeat(64);
assert.equal(runtime.validateVerifiedStandardsBundle(bundle, receiptAttack).valid, false);

const production = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" };
const proof = { bundleValid: true, cohortValid: true, cohortMember: true, supportedParcel: true,
  zoningSupported: true, applicabilityValid: true };
const off = { schemaVersion: "verified-standards-release-control/v1", state: "off",
  releaseVersion: receipt.releaseVersion, cohortVersion: null };
const on = { ...off, state: "cohort", cohortVersion: "cohort-v1" };
assert.equal(gate.productionVerifiedStandardsAuthorized(production, off, proof), false);
assert.equal(gate.productionVerifiedStandardsAuthorized(production, on, proof), true);
assert.equal(gate.productionVerifiedStandardsAuthorized(production, off, proof), false);
assert.equal(gate.verifiedStandardsMode(production), null, "active production gate remains denied");
for (const key of Object.keys(proof)) assert.equal(gate.productionVerifiedStandardsAuthorized(production, on, { ...proof, [key]: false }), false, key);
assert.equal(gate.productionVerifiedStandardsAuthorized({ ...production, VERCEL_ENV: "preview" }, on, proof), false);
assert.equal(gate.productionVerifiedStandardsAuthorized(production, { ...on, releaseVersion: "wrong" }, proof), false);

const start = performance.now();
for (let index = 0; index < 100; index += 1) runtime.selectCompiledVerifiedStandards("RS-1-7", context);
const averageMilliseconds = (performance.now() - start) / 100;
const result = runtime.resolveCompiledVerifiedStandards({ apn: "3113333800", zoneCodes: ["RS-1-7"], mappingState: "SINGLE_ZONE", context });
const display = load(path.join(root, "lib/verified-standards-display.ts"));
const html = display.renderResidentialDisplay(result);
assert.ok(html.includes("Verified base-zone standards") && html.includes("TruLot has not determined compliance or development capacity"));
assert.doesNotMatch(html, /\/private\/tmp|\/Users\/ops\/|TRULOT_|VERCEL_ENV/);
assert.ok(Buffer.byteLength(html) < 250_000);

console.log(JSON.stringify({ result: "PASS", records: seen, zones: Object.keys(reference).length,
  bundleBytes: fs.statSync(path.join(root, "data/runtime/verified-residential-standards-v2.json")).size,
  coldValidationMilliseconds: Number(coldValidationMilliseconds.toFixed(3)),
  averageResolutionMilliseconds: Number(averageMilliseconds.toFixed(3)), renderedFragmentBytes: Buffer.byteLength(html),
  pythonAtRequestTime: false, externalEvidenceAtRequestTime: false, productionGateActive: false }, null, 2));
