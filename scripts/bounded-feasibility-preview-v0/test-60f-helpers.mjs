import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
Module._extensions[".ts"] = (loaded, file) => loaded._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file }).outputText, file);
const require = Module.createRequire(import.meta.url);
export const preview = require(path.join(root, "lib/bounded-feasibility-preview.ts"));
export const presentation = require(path.join(root, "lib/feasibility-preview-presentation.ts"));
export const renderer = preview.loadFeasibilityRenderer(root);
export const schema = preview.loadFeasibilitySchema(root);
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const load = (mode) => clone(preview.loadFeasibilityPreviewSource(mode, root));
export const validate = (payload) => preview.validateFeasibilityPreviewPayload(payload, renderer.templates, schema, renderer.projectStatusLabels);
export const comparisonItem = (payload) => payload.items.find((item) => item.comparison);
export const measurement = (item, id) => item.measurements.find((candidate) => candidate.measurement_id === id);
export function setSemantic(item, semantic, family) {
  item.rule_family = family;
  item.comparison.rule_semantic = semantic;
  const binding = item.evidence_entries.find((entry) => entry.rule_binding)?.rule_binding;
  binding.rule_semantic = semantic;
}
export function setValues(item, requirement, fact) {
  measurement(item, item.comparison.requirement_measurement_id).exact_value = requirement;
  measurement(item, item.comparison.fact_measurement_id).exact_value = fact;
}
export function addEvidence(item, partial) {
  const entry = { evidence_id: `${item.item_id}-E${item.evidence_entries.length + 1}`, type: "BLOCKER_EVIDENCE", label: "Evidence", value: "Evidence record", privacy: item.privacy === "PUBLIC" ? "PUBLIC_AUTHORITY" : "PRIVATE_AUTHORIZED_EVIDENCE", source_date: null, measurement_refs: [], rule_binding: null, project_status: null, survey_currentness: null, ...partial };
  item.evidence_entries.push(entry); return entry;
}
export const currentSurvey = { geometry_subject: "EXISTING_AS_BUILT", currentness: "CURRENTNESS_SUPPORTED", later_change_reconciliation: "NO_MATERIAL_LATER_CHANGE", structure_edge: "CODE_RELEVANT_EDGE_IDENTIFIED", boundary_control: "BOUNDARY_CONTROL_SUFFICIENT" };
export function expectCode(assert, code, make) { assert.throws(() => validate(make()), (error) => error?.code === code, code); }
