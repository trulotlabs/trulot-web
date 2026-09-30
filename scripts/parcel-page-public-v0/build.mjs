#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "data/parcel-page-public-v0");

function loadTs(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
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
  return crypto.createHash("sha256").update(Buffer.from(typeof value === "string" ? value : canonical(value))).digest("hex");
}

const expert = loadTs(path.join(root, "scripts/parcel-page-v2-ui/adapter.ts"));
const publicAdapter = loadTs(path.join(here, "adapter.ts"));
const renderer = loadTs(path.join(here, "renderer.ts"));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-intelligence-v2/fixture-results.json"), "utf8"));
const representative = [
  { apn: "6341302200", case: "verified-outside-coastal" },
  { apn: "3506320400", case: "verified-inside-coastal" },
  { apn: "4304211000", case: "split-zone" },
  { apn: "4303410600", case: "ambiguous-zoning" },
  { apn: "3082980200", case: "coastal-boundary" },
  { apn: "7600360300", case: "unmapped-zoning" },
  { apn: "5470501600", case: "non-rs" },
  { apn: "3031701800", case: "missing-address" },
];
const byApn = new Map(corpus.results.map((entry) => [entry.result.identity.apn, entry]));
const fixtures = [];
fs.mkdirSync(path.join(out, "renderings"), { recursive: true });
for (const item of representative) {
  const source = byApn.get(item.apn);
  if (!source) throw new Error(`Missing sealed fixture ${item.apn}`);
  const model = publicAdapter.adaptPublicParcelPageV0(expert.adaptParcelIntelligenceV2(source.result));
  const html = renderer.renderPublicParcelPageV0(model);
  const rendering = `data/parcel-page-public-v0/renderings/${item.apn}-${item.case}.html`;
  fs.writeFileSync(path.join(root, rendering), html);
  fixtures.push({
    ...item,
    packet18_fixture_id: source.fixture_id,
    source_result_fingerprint: source.result.fingerprint_sha256,
    summary_kind: model.summary.kind,
    model_sha256: sha(model),
    rendering,
    rendering_sha256: sha(html),
  });
}
fs.writeFileSync(path.join(out, "fixtures.json"), `${JSON.stringify({
  presentation_version: "public-parcel-page-v0-2026-09-30",
  source_contract_version: corpus.contract_version,
  source_canonical_output_sha256: corpus.canonical_output_sha256,
  representative_count: fixtures.length,
  fixtures,
}, null, 2)}\n`);
console.log(`PASS built ${fixtures.length} Public Parcel Page V0 renderings`);
