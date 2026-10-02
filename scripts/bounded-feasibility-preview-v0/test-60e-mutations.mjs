#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
Module._extensions[".ts"] = (loaded, file) => loaded._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file }).outputText, file);
const require = Module.createRequire(import.meta.url); const preview = require(path.join(root, "lib/bounded-feasibility-preview.ts"));
const renderer = preview.loadFeasibilityRenderer(root); const schema = preview.loadFeasibilitySchema(root); const clone = (value) => JSON.parse(JSON.stringify(value)); const load = (mode) => clone(preview.loadFeasibilityPreview(mode, root).payload); const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, renderer.templates, schema);
const first = (payload) => payload.items.find((item) => item.item_kind === "COMPARISON" && item.result_state === "MEETS_BASE_RULE");
const mutations = [
  ["fact crosses threshold", "COMPARISON_DIRECTION", () => { const p = load("rs"); first(p).comparison.fact_value = 4000; return p; }],
  ["requirement crosses threshold", "COMPARISON_DIRECTION", () => { const p = load("rs"); first(p).comparison.requirement_value = 30000; return p; }],
  ["display value changes", "DISPLAY_FACT_MISMATCH", () => { const p = load("rs"); first(p).display_fact = "4,000 sq ft"; return p; }],
  ["exact value changes", "PRECISION_ROUNDING", () => { const p = load("rs"); p.items.find((item) => item.precision).precision.exact_value = 23.6; return p; }],
  ["precision changes", "PRECISION_FORMAT", () => { const p = load("rs"); p.items.find((item) => item.precision).precision.decimal_places = 2; return p; }],
  ["context eligibility changes", "ELIGIBILITY_EVIDENCE_REQUIRED", () => { const p = load("rm"); const i = p.items.find((item) => item.context_type === "FIRE"); i.eligibility_state = "ELIGIBLE"; i.regulatory_use_state = "APPLIES"; return p; }],
  ["status changes", "PROJECT_STATUS_CONFLICT", () => { const p = load("private"); p.project_context.status_code = "CITY_ISSUED"; return p; }],
  ["comparison scope changes", "PUBLIC_SCOPE_CONCLUSIVE", () => { const p = load("rs"); first(p).comparison_scope = "PROJECT_SPECIFIC"; return p; }],
];
for (const [name, code, mutate] of mutations) assert.throws(() => validate(mutate()), (error) => error?.code === code, `${name} must fail with ${code}`);
console.log(`PASS Packet 60E mutation suite: ${mutations.length} cross-field contradictions rejected with intended codes`);
