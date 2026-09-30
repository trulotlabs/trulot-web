#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "data/parcel-page-v2-ui");

function loadTs(file) {
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonical(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const { adaptParcelIntelligenceV2, ADAPTER_VERSION } = loadTs(path.join(here, "adapter.ts"));
const { renderParcelPageV2 } = loadTs(path.join(here, "renderer.ts"));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8"));
const representative = [
  { apn: "6341302200", case: "outside-coastal-rs-1-7" },
  { apn: "3506320400", case: "inside-coastal-rs-1-7" },
  { apn: "4304211000", case: "split-rs-and-non-rs" },
  { apn: "4303410600", case: "ambiguous-zoning" },
  { apn: "7600360300", case: "unmapped-and-source-zero" },
  { apn: "3082980200", case: "coastal-boundary" },
  { apn: "6782511200", case: "non-rs-and-missing-address" },
  { apn: "7600300100", case: "source-unavailable" },
  { apn: "3031701800", case: "missing-address" },
  { apn: "2421001000", case: "structure-zero-unknown" },
];
const byApn = new Map(corpus.results.map((item) => [item.result.identity.apn, item]));

fs.mkdirSync(path.join(out, "renderings"), { recursive: true });
fs.mkdirSync(path.join(out, "screenshots"), { recursive: true });
const models = [];
const fixtures = [];
for (const item of representative) {
  const source = byApn.get(item.apn);
  if (!source) throw new Error(`missing Packet 18 fixture for ${item.apn}`);
  const model = adaptParcelIntelligenceV2(source.result);
  const html = renderParcelPageV2(model);
  const file = `${item.apn}-${item.case}.html`;
  fs.writeFileSync(path.join(out, "renderings", file), html);
  models.push({ apn: item.apn, case: item.case, model });
  fixtures.push({
    apn: item.apn,
    case: item.case,
    packet18_fixture_id: source.fixture_id,
    coverage_tags: source.coverage_tags,
    source_result_fingerprint: source.result.fingerprint_sha256,
    ui_model_sha256: sha(model),
    rendering: `data/parcel-page-v2-ui/renderings/${file}`,
    rendering_sha256: sha(html),
  });
}

const modelOutput = { adapter_version: ADAPTER_VERSION, model_count: models.length, models };
const fixtureOutput = {
  adapter_version: ADAPTER_VERSION,
  source_contract_version: corpus.contract_version,
  source_canonical_output_sha256: corpus.canonical_output_sha256,
  representative_count: fixtures.length,
  fixtures,
};
writeJson(path.join(out, "fixture-models.json"), modelOutput);
writeJson(path.join(out, "fixtures.json"), fixtureOutput);
writeJson(path.join(out, "contract.json"), {
  adapter_version: ADAPTER_VERSION,
  purpose: "Presentation-only adapter over a sealed ParcelIntelligenceV2 result.",
  inputs: ["ParcelIntelligenceV2"],
  output_sections: ["header", "orientation", "standardsGroups", "propertyFacts", "unknowns", "investigations", "evidence", "capacity", "safeguards"],
  allowed_operations: ["group", "format units", "shorten source labels", "generate deterministic wording from structured states"],
  prohibited_operations: ["recompute regulatory rules", "convert UNKNOWN to false or zero", "select a split zone", "infer Coastal state", "create compliance conclusions", "flatten conditional standards", "calculate development capacity", "wire production runtime"],
  production_runtime_wired: false,
});
writeJson(path.join(out, "decision.json"), {
  decision: "PARCEL_PAGE_V2_UI_ADAPTER_READY",
  adapter_version: ADAPTER_VERSION,
  source_fixture_count: corpus.fixture_count,
  representative_rendering_count: fixtures.length,
  canonical_screenshot_parcels: ["6341302200", "3506320400", "4304211000"],
  compliance_calculated: false,
  capacity_calculated: false,
  production_runtime_wired: false,
  parcel_v1_modified: false,
});
console.log(`PASS built ${fixtures.length} representative Parcel Page V2 UI fixtures`);
