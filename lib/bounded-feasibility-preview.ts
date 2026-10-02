import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderTemplate, templateFields } from "./feasibility-preview-presentation";

export const FEASIBILITY_PREVIEW_ENV = "TRULOT_FEASIBILITY_PREVIEW";
export const CONTRACT_VERSION = "bounded-feasibility-product-contract-v3-2026-10-02-p60e";
export const PRODUCT_STATES = ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_APPLICABLE", "NOT_EVALUATED", "SOURCE_UNAVAILABLE", "OUTSIDE_CURRENT_SCOPE"] as const;
export const OVERALL_STATES = ["BASE_PARCEL_RULES_EVALUATED", "PARTIAL_EVALUATION", "MORE_EVIDENCE_NEEDED", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"] as const;
export const ITEM_KINDS = ["FACT", "RULE", "CONTEXT", "COMPARISON"] as const;
export const SECTIONS = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"] as const;
export const SUMMARY_GROUPS = ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "MEETS_SELECTED_RULE", "DOES_NOT_MEET_SELECTED_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_EVALUATED", "MAPPED_CONTEXT", "NOT_APPLICABLE", "SOURCE_UNAVAILABLE", "OUTSIDE_CURRENT_SCOPE"] as const;
export const COMPARISON_SCOPES = ["PARCEL_RULE", "THIS_DIMENSION_ONLY", "PROJECT_SPECIFIC", "EXISTING_STRUCTURE"] as const;
export const CONTEXT_STATES = ["MAPPED_VERIFICATION_PENDING", "MAPPED_VERIFIED", "NO_MAPPED_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"] as const;
export const VERIFICATION_STATES = ["PENDING", "VERIFIED", "NO_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"] as const;
export const ELIGIBILITY_STATES = ["NOT_EVALUATED", "ELIGIBLE", "NOT_ELIGIBLE", "SOURCE_UNAVAILABLE"] as const;
export const REGULATORY_USE_STATES = ["NOT_USED_PENDING_VERIFICATION", "CONTEXT_ONLY", "APPLIES", "DOES_NOT_APPLY", "NOT_EVALUATED", "SOURCE_UNAVAILABLE"] as const;
export const PROJECT_STATUS_CODES = ["SUBMITTAL_ISSUANCE_NOT_PROVEN", "CITY_ISSUED", "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED", "EVIDENCE_REVIEW"] as const;
export const PROJECT_TOPICS = ["HEIGHT", "FAR", "DEVELOPMENT_CAPACITY", "WHOLE_PROJECT_COMPLIANCE"] as const;
export const EVIDENCE_TYPES = ["PUBLIC_AUTHORITY", "PUBLIC_MAPPING", "PUBLIC_CODE", "PUBLIC_PARCEL_FACT", "RULE_VERSION", "COMPARISON_INPUT", "MAPPING_OBSERVATION", "VERIFICATION_RECORD", "ELIGIBILITY_RULE", "ELIGIBILITY_PREDICATE", "REGULATORY_DETERMINATION", "BLOCKER_EVIDENCE", "PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW", "PRIVACY_NOTICE"] as const;
export const TEMPLATE_KEYS = ["COMPARISON_DOES_NOT_MEET", "COMPARISON_MEETS", "CONDITIONAL_BASE_RULE", "CONDITIONAL_CURRENT_RULE", "FACT_IDENTIFIED", "MAPPED_CONTEXT", "MAPPED_CONTEXT_PENDING", "NEEDS_EVIDENCE", "NOT_APPLICABLE", "NOT_EVALUATED", "NO_MAPPED_CONTEXT", "OUTSIDE_CURRENT_SCOPE", "PROJECT_COMPARISON_MEETS", "SOURCE_UNAVAILABLE"] as const;
export const COMPARATORS = ["MIN", "MAX", "EXACT"] as const;

export type ProductState = (typeof PRODUCT_STATES)[number];
export type OverallState = (typeof OVERALL_STATES)[number];
export type ItemKind = (typeof ITEM_KINDS)[number];
export type Section = (typeof SECTIONS)[number];
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];
export type ComparisonScope = (typeof COMPARISON_SCOPES)[number];
export type ContextState = (typeof CONTEXT_STATES)[number];
export type VerificationState = (typeof VERIFICATION_STATES)[number];
export type EligibilityState = (typeof ELIGIBILITY_STATES)[number];
export type RegulatoryUseState = (typeof REGULATORY_USE_STATES)[number];
export type ProjectStatusCode = (typeof PROJECT_STATUS_CODES)[number];
export type ProjectTopic = (typeof PROJECT_TOPICS)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type Comparator = (typeof COMPARATORS)[number];
export type PreviewMode = "rs" | "rm" | "private" | "blocked";
export type Privacy = "PUBLIC" | "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX";
export type ContractAction = { type: "LINK" | "INSTRUCTION"; label: string; destination: string | null };
export type EvidenceSource = { artifact: string; privacy: "PUBLIC_AUTHORITY" | "PRIVATE_AUTHORIZED_EVIDENCE" };
export type Measurement = { kind: "EXACT" | "DISPLAY" | "REQUIREMENT" | "FACT"; value: number; unit: string };
export type EvidenceEntry = { type: EvidenceType; label: string; value: string; privacy: EvidenceSource["privacy"]; source_date: string | null; measurements: Measurement[]; project_status_code: ProjectStatusCode | null; url?: string };
export type Blocker = { code: string; missing: string; why: string };
export type BaseFact = { fact_id: string; label: string; value: string };
export type Subject = { eyebrow: string; title: string; detail: string };
export type Precision = { exact_value: number; display_value: number; decimal_places: number; rounding_rule: "HALF_UP"; unit: string };
export type ProjectContext = { target_id: string; project_id: string; status_code: ProjectStatusCode; status_context: string | null; application_date: string | null; code_profile: string; privacy_label: string; not_evaluated: ProjectTopic[] };
export type StructuredComparison = { comparator: Comparator; requirement_value: number; fact_value: number; unit: string };
export type FeasibilityItem = {
  item_id: string; item_kind: ItemKind; name: string; rule_family: string; section: Section; result_state: ProductState | null;
  comparison_scope: ComparisonScope | null; comparison: StructuredComparison | null; template_key: TemplateKey; template_values: Record<string, string>; answer: string; explanation: string;
  display_requirement: string | null; display_fact: string | null; base_requirement: string | null; derived_requirement: string | null; exact_calculation: string | null; precision: Precision | null;
  context_type: string | null; context_state: ContextState | null; mapped_observation: boolean | null; verification_state: VerificationState | null; eligibility_state: EligibilityState | null;
  regulatory_use_state: RegulatoryUseState | null; evidence_entries: EvidenceEntry[]; blocker: Blocker | null; privacy: Privacy; actions: ContractAction[];
};
export type PreviewPayload = { contract_version: string; scope: "PUBLIC_PARCEL" | "PRIVATE_PROJECT" | "EXISTING_STRUCTURE"; privacy: Privacy; subject: Subject; base_facts: BaseFact[]; project_context: ProjectContext | null; overall_state: OverallState; items: FeasibilityItem[]; actions: ContractAction[]; provenance: EvidenceSource[] };
export type TemplateCatalog = Record<TemplateKey, string>;
export type RendererContract = { templates: TemplateCatalog; projectStatusLabels: Record<ProjectStatusCode, string> };
export type PreviewBundle = { payload: PreviewPayload; renderer: RendererContract; templates: TemplateCatalog };
export type JsonSchema = Record<string, unknown>;

type PreviewEnvironment = { NODE_ENV?: string; TRULOT_FEASIBILITY_PREVIEW?: string };
const DATA_DIR = "data/bounded-feasibility-product-contract-v0";
const FIXTURES: Record<PreviewMode, { file: string; sha256: string }> = {
  rs: { file: "public-rs-replay.json", sha256: "05e34e2b0fa78550b98e98f6fcc8e3c61b8fbfd8434bf3a79485ff8222116fc1" }, rm: { file: "public-rm-replay.json", sha256: "3d9d3240917229acc133e42d82775338de638d5b0e1eee7618edffea50b8da49" },
  private: { file: "private-project-replay.json", sha256: "724f864763ca1faeaa3ee1e1fcc39d33a32cddbd0d796cd7cd09dd1cf9c8ddad" }, blocked: { file: "blocked-project-replay.json", sha256: "7ee3a3209bbfc31e7c94d6d366cd5800fa476f959d3d7b6fcf4ed98c3e67c200" },
};
const RENDERER_FIXTURE = { file: "renderer-contract.json", sha256: "8517d150fc2a75eb535f39b2b1322844a43e60208c46cfc3071a156bc21690c5" };
const SCHEMA_FIXTURE = { file: "schema.json", sha256: "b4cd05316e51bfca10ecc058754478ae5ef5b1ca23ad21bcc1d11f3e8ddde5c1" };
const PROHIBITED_COPY = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
const PRIVATE_TYPES = new Set<EvidenceType>(["PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW", "PRIVACY_NOTICE"]);
const PUBLIC_TYPES = new Set<EvidenceType>(["PUBLIC_AUTHORITY", "PUBLIC_MAPPING", "PUBLIC_CODE", "PUBLIC_PARCEL_FACT", "RULE_VERSION", "MAPPING_OBSERVATION", "VERIFICATION_RECORD", "ELIGIBILITY_RULE", "ELIGIBILITY_PREDICATE", "REGULATORY_DETERMINATION"]);
const AUTHORITATIVE_TYPES = new Set<EvidenceType>(["PUBLIC_AUTHORITY", "PUBLIC_CODE", "RULE_VERSION"]);
const PROJECT_EVIDENCE_TYPES = new Set<EvidenceType>(["PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW"]);
const PUBLIC_PRIVATE_MARKERS = /\bPRJ-|PRIVATE_AUTHORIZED|private plan|plan status|application date|project status/i;
export const VALIDATION_ORDER = ["STRUCTURAL_SCHEMA", "SEMANTIC_INVARIANTS", "SCOPE_PRIVACY", "COMPARATOR_ARITHMETIC", "DETERMINISTIC_TEMPLATE", "EVIDENCE_TYPE_REQUIREMENTS", "EVIDENCE_VALUE_CONSISTENCY", "PRECISION_ROUNDING", "PROJECT_STATUS_EVIDENCE"] as const;

export class FeasibilityPreviewError extends Error { code: string; constructor(code: string, message = code) { super(`[${code}] ${message}`); this.name = "FeasibilityPreviewError"; this.code = code; } }
export function feasibilityPreviewEnabled(environment: PreviewEnvironment = process.env): boolean { return environment.TRULOT_FEASIBILITY_PREVIEW === "1" && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test"); }
function fail(code: string, message?: string): never { throw new FeasibilityPreviewError(code, message); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasType(value: unknown, type: string): boolean { if (type === "null") return value === null; if (type === "array") return Array.isArray(value); if (type === "object") return isRecord(value); if (type === "integer") return typeof value === "number" && Number.isInteger(value); return typeof value === type; }
function resolveRef(root: JsonSchema, ref: string): JsonSchema { if (!ref.startsWith("#/")) fail(`Unsupported schema reference ${ref}`); let node: unknown = root; for (const part of ref.slice(2).split("/")) { if (!isRecord(node) || !(part in node)) fail(`Unknown schema reference ${ref}`); node = node[part]; } if (!isRecord(node)) fail(`Invalid schema reference ${ref}`); return node; }
function structuralValidate(value: unknown, schema: JsonSchema, root: JsonSchema, at = "$"): void {
  if (typeof schema.$ref === "string") return structuralValidate(value, resolveRef(root, schema.$ref), root, at);
  if (Array.isArray(schema.anyOf)) { for (const option of schema.anyOf) { try { structuralValidate(value, option as JsonSchema, root, at); return; } catch {} } fail(`${at} does not match any allowed schema`); }
  if ("const" in schema && value !== schema.const) fail(`${at} does not match the required constant`);
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) fail(`${at} is not an allowed value`);
  if (schema.type) { const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!allowed.some((type) => typeof type === "string" && hasType(value, type))) fail(`${at} has the wrong type`); }
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) fail(`${at} is too short`);
  if (typeof value === "number") { if (typeof schema.minimum === "number" && value < schema.minimum) fail(`${at} is below minimum`); if (typeof schema.maximum === "number" && value > schema.maximum) fail(`${at} is above maximum`); }
  if (Array.isArray(value)) { if (typeof schema.minItems === "number" && value.length < schema.minItems) fail(`${at} has too few items`); if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) fail(`${at} contains duplicate items`); if (isRecord(schema.items)) value.forEach((entry, index) => structuralValidate(entry, schema.items as JsonSchema, root, `${at}[${index}]`)); }
  if (isRecord(value)) { const required = Array.isArray(schema.required) ? schema.required : []; for (const key of required) if (typeof key === "string" && !(key in value)) fail(`${at}.${key} is required`); const properties = isRecord(schema.properties) ? schema.properties : {}; for (const [key, entry] of Object.entries(value)) { if (key in properties) structuralValidate(entry, properties[key] as JsonSchema, root, `${at}.${key}`); else if (schema.additionalProperties === false) fail(`${at} contains unknown field ${key}`); else if (isRecord(schema.additionalProperties)) structuralValidate(entry, schema.additionalProperties, root, `${at}.${key}`); } }
}
function requiredString(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) fail(`${label} is invalid`); return value; }
function readSealed(root: string, fixture: { file: string; sha256: string }): unknown { const raw = readFileSync(path.join(root, DATA_DIR, fixture.file)); const digest = createHash("sha256").update(raw).digest("hex"); if (digest !== fixture.sha256) fail(`${fixture.file} seal does not match`); return JSON.parse(raw.toString("utf8")); }

export function validateRendererContract(value: unknown): RendererContract {
  if (!isRecord(value) || value.contract_version !== CONTRACT_VERSION || value.free_form_conclusion_generation !== false || !isRecord(value.templates) || !isRecord(value.project_status_labels)) fail("Renderer contract is malformed");
  const templates = {} as TemplateCatalog; for (const key of TEMPLATE_KEYS) templates[key] = requiredString(value.templates[key], `Renderer template ${key}`); if (Object.keys(value.templates).length !== TEMPLATE_KEYS.length) fail("Template catalog contains unknown fields");
  const projectStatusLabels = {} as Record<ProjectStatusCode, string>; for (const key of PROJECT_STATUS_CODES) projectStatusLabels[key] = requiredString(value.project_status_labels[key], `Project status ${key}`); if (Object.keys(value.project_status_labels).length !== PROJECT_STATUS_CODES.length) fail("Project status catalog contains unknown fields");
  return { templates, projectStatusLabels };
}
export function validateTemplateCatalog(value: unknown): TemplateCatalog { return validateRendererContract(value).templates; }

const TEMPLATE_BY_STATE: Record<ProductState, readonly TemplateKey[]> = { MEETS_BASE_RULE: ["COMPARISON_MEETS", "PROJECT_COMPARISON_MEETS"], DOES_NOT_MEET_BASE_RULE: ["COMPARISON_DOES_NOT_MEET"], CONDITIONAL: ["CONDITIONAL_BASE_RULE", "CONDITIONAL_CURRENT_RULE"], NEEDS_EVIDENCE: ["NEEDS_EVIDENCE"], NOT_APPLICABLE: ["NOT_APPLICABLE"], NOT_EVALUATED: ["NOT_EVALUATED"], SOURCE_UNAVAILABLE: ["SOURCE_UNAVAILABLE"], OUTSIDE_CURRENT_SCOPE: ["OUTSIDE_CURRENT_SCOPE"] };
const CONTEXT_MATRIX: Record<ContextState, Array<[boolean | null, VerificationState, EligibilityState, RegulatoryUseState]>> = {
  MAPPED_VERIFICATION_PENDING: [[true, "PENDING", "NOT_EVALUATED", "NOT_USED_PENDING_VERIFICATION"]], MAPPED_VERIFIED: [[true, "VERIFIED", "NOT_EVALUATED", "CONTEXT_ONLY"], [true, "VERIFIED", "ELIGIBLE", "APPLIES"], [true, "VERIFIED", "NOT_ELIGIBLE", "DOES_NOT_APPLY"]],
  NO_MAPPED_INTERSECTION: [[false, "NO_INTERSECTION", "NOT_EVALUATED", "CONTEXT_ONLY"]], SOURCE_UNAVAILABLE: [[null, "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE"]], NOT_EVALUATED: [[null, "NOT_EVALUATED", "NOT_EVALUATED", "NOT_EVALUATED"]],
};
const CONTEXT_TEMPLATE: Record<ContextState, TemplateKey> = { MAPPED_VERIFICATION_PENDING: "MAPPED_CONTEXT_PENDING", MAPPED_VERIFIED: "MAPPED_CONTEXT", NO_MAPPED_INTERSECTION: "NO_MAPPED_CONTEXT", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", NOT_EVALUATED: "NOT_EVALUATED" };

function deriveOverall(payload: PreviewPayload): OverallState {
  if (payload.items.some((item) => item.result_state === "SOURCE_UNAVAILABLE" || item.context_state === "SOURCE_UNAVAILABLE")) return "SOURCE_UNAVAILABLE";
  const results = payload.items.filter((item) => item.result_state !== null).map((item) => item.result_state!);
  if (results.length > 0 && results.every((state) => state === "OUTSIDE_CURRENT_SCOPE")) return "OUTSIDE_CURRENT_SCOPE";
  if (results.includes("NEEDS_EVIDENCE") && !results.some((state) => state === "MEETS_BASE_RULE" || state === "DOES_NOT_MEET_BASE_RULE" || state === "NOT_APPLICABLE")) return "MORE_EVIDENCE_NEEDED";
  const contextsFinal = payload.items.filter((item) => item.item_kind === "CONTEXT").every((item) => item.context_state === "MAPPED_VERIFIED" || item.context_state === "NO_MAPPED_INTERSECTION");
  if (results.length > 0 && results.every((state) => state === "MEETS_BASE_RULE" || state === "DOES_NOT_MEET_BASE_RULE" || state === "NOT_APPLICABLE") && contextsFinal && !(payload.project_context?.not_evaluated.length)) return "BASE_PARCEL_RULES_EVALUATED";
  return "PARTIAL_EVALUATION";
}
function semanticValidate(payload: PreviewPayload): void {
  const validateAction = (action: ContractAction) => { if (action.type === "LINK" && (action.destination === null || !/^(https?:\/\/|\/)/.test(action.destination))) fail("Link action destination is unsafe"); if (action.type === "INSTRUCTION" && action.destination !== null) fail("Instruction action cannot have a destination"); };
  payload.actions.forEach(validateAction);
  if (payload.project_context?.application_date !== null && payload.project_context) { const date = payload.project_context.application_date; if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) fail("Project application date must use a valid ISO date"); }
  const ids = new Set<string>();
  for (const item of payload.items) {
    item.actions.forEach(validateAction);
    if (ids.has(item.item_id)) fail("Item IDs must be unique"); ids.add(item.item_id);
    const contextValues = [item.context_type, item.context_state, item.mapped_observation, item.verification_state, item.eligibility_state, item.regulatory_use_state];
    if (item.item_kind === "FACT") { if (item.result_state !== null || item.comparison_scope !== null || item.comparison !== null || contextValues.some((value) => value !== null) || item.template_key !== "FACT_IDENTIFIED") fail("FACT_SEMANTICS", "Fact item contains rule, comparison, or context semantics"); }
    else if (item.item_kind === "CONTEXT") { if (item.result_state !== null || item.comparison_scope !== null || item.comparison !== null || item.context_type === null || item.context_state === null || item.verification_state === null || item.eligibility_state === null || item.regulatory_use_state === null) fail("CONTEXT_SEMANTICS", "Context item contains contradictory semantics"); if (CONTEXT_TEMPLATE[item.context_state] !== item.template_key) fail("CONTEXT_TEMPLATE", "Context state and template do not match"); if (!CONTEXT_MATRIX[item.context_state].some(([mapped, verification, eligibility, regulatory]) => mapped === item.mapped_observation && verification === item.verification_state && eligibility === item.eligibility_state && regulatory === item.regulatory_use_state)) fail("CONTEXT_MATRIX", "Context semantic matrix rejected the item"); }
    else { if (item.result_state === null || item.comparison_scope === null || contextValues.some((value) => value !== null)) fail("RESULT_SEMANTICS", "Rule or comparison item contains contradictory semantics"); if (!TEMPLATE_BY_STATE[item.result_state].includes(item.template_key)) fail("STATE_TEMPLATE", "Result state and template do not match"); if (item.item_kind === "RULE" && (item.comparison_scope !== "PARCEL_RULE" || item.comparison !== null)) fail("RULE_SCOPE", "Rule item must use parcel-rule scope without a conclusive comparison"); if (item.item_kind === "COMPARISON" && item.comparison_scope === "PARCEL_RULE" && item.template_key === "PROJECT_COMPARISON_MEETS") fail("PROJECT_TEMPLATE_SCOPE", "Parcel comparison cannot use a project template"); }
    if (item.result_state === "NEEDS_EVIDENCE" ? item.blocker === null : item.blocker !== null) fail("Blocker and result state do not match");
    if (item.result_state === "NEEDS_EVIDENCE" && item.blocker && item.template_values.blocker !== item.blocker.missing) fail("BLOCKER_TEMPLATE_MISMATCH", "Needs-evidence copy must derive from the validated blocker");
  }
  if (deriveOverall(payload) !== payload.overall_state) fail("Overall state contradicts item evaluation state");
}
function privacyValidate(payload: PreviewPayload): void {
  const isPublic = payload.scope === "PUBLIC_PARCEL";
  if (isPublic) { if (payload.privacy !== "PUBLIC" || payload.project_context !== null) fail("Public scope cannot contain private project context"); } else if (payload.privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" || payload.project_context === null) fail("Private scope requires private privacy and project context");
  if (isPublic && PUBLIC_PRIVATE_MARKERS.test(JSON.stringify(payload))) fail("Public scope contains a private project marker");
  for (const source of payload.provenance) if (isPublic && source.privacy !== "PUBLIC_AUTHORITY") fail("Public scope contains private provenance");
  const conclusive = new Set<ProductState>(["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE"]);
  const publicNonconclusive = new Set<ProductState>(["NOT_EVALUATED", "NEEDS_EVIDENCE", "OUTSIDE_CURRENT_SCOPE"]);
  for (const item of payload.items) {
    if (item.privacy !== payload.privacy) fail("ITEM_PRIVACY", "Item privacy does not match payload scope");
    if (isPublic && item.item_kind === "COMPARISON" && conclusive.has(item.result_state!) && item.comparison_scope !== "PARCEL_RULE") fail("PUBLIC_SCOPE_CONCLUSIVE", "Public parcel scope cannot contain project or existing-structure conclusions");
    if (isPublic && item.item_kind === "COMPARISON" && item.comparison_scope !== "PARCEL_RULE" && !publicNonconclusive.has(item.result_state!)) fail("PUBLIC_SCOPE_COMPARISON", "Public project or existing-structure comparisons must remain non-conclusive");
    if (payload.scope === "PRIVATE_PROJECT" && item.item_kind === "COMPARISON" && conclusive.has(item.result_state!) && item.comparison_scope !== "PROJECT_SPECIFIC" && item.comparison_scope !== "THIS_DIMENSION_ONLY") fail("PRIVATE_SCOPE_CONCLUSIVE", "Private project conclusions must be project-specific or this-dimension-only");
    if (payload.scope === "EXISTING_STRUCTURE" && item.item_kind === "COMPARISON" && conclusive.has(item.result_state!) && item.comparison_scope !== "EXISTING_STRUCTURE") fail("EXISTING_SCOPE_CONCLUSIVE", "Existing-structure conclusions require existing-structure comparison scope");
    for (const entry of item.evidence_entries) { if (PRIVATE_TYPES.has(entry.type) && (isPublic || entry.privacy !== "PRIVATE_AUTHORIZED_EVIDENCE")) fail("PRIVATE_EVIDENCE_SCOPE", "Private evidence type is not permitted in public scope or with public privacy"); if (PUBLIC_TYPES.has(entry.type) && entry.privacy !== "PUBLIC_AUTHORITY") fail("PUBLIC_EVIDENCE_PRIVACY", "Public evidence type has contradictory privacy"); if (isPublic && entry.privacy !== "PUBLIC_AUTHORITY") fail("PUBLIC_SCOPE_PRIVATE_EVIDENCE", "Public scope contains private evidence"); }
  }
}

function comparatorValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    const conclusive = item.result_state === "MEETS_BASE_RULE" || item.result_state === "DOES_NOT_MEET_BASE_RULE";
    if (!conclusive) { if (item.comparison !== null) fail("NONCONCLUSIVE_COMPARISON_VALUES", "Only conclusive comparisons may carry comparator values"); continue; }
    if (item.item_kind !== "COMPARISON" || item.comparison === null) fail("COMPARATOR_REQUIRED", "Conclusive comparison requires structured comparator values");
    const { comparator, requirement_value: requirement, fact_value: fact } = item.comparison;
    const passes = comparator === "MIN" ? fact >= requirement : comparator === "MAX" ? fact <= requirement : fact === requirement;
    const expected: ProductState = passes ? "MEETS_BASE_RULE" : "DOES_NOT_MEET_BASE_RULE";
    if (item.result_state !== expected) fail("COMPARISON_DIRECTION", `${comparator} comparison arithmetic contradicts result state`);
  }
}
function templateValidate(payload: PreviewPayload, templates: TemplateCatalog): void {
  for (const item of payload.items) { const template = templates[item.template_key]; if (!template) fail(`Unknown template ${item.template_key}`); const fields = templateFields(template); const keys = Object.keys(item.template_values).sort(); if (fields.length !== keys.length || fields.some((field, index) => field !== keys[index])) fail("Template values do not match the selected template"); if (renderTemplate(template, item.template_values) !== item.answer) fail("Stored answer does not match the selected template"); if (PROHIBITED_COPY.test(`${item.answer} ${item.explanation}`)) fail("Preview contains a prohibited conclusion"); }
}
function containsNumber(text: string, value: number): boolean { return [...text.replaceAll(",", "").matchAll(/-?\d+(?:\.\d+)?/g)].some((match) => { const displayed = Number(match[0]); const decimals = match[0].split(".")[1]?.length ?? 0; return displayed === value || displayed === Math.round((value + Number.EPSILON) * 10 ** decimals) / 10 ** decimals; }); }
function containsFormattedNumber(text: string, value: number, decimalPlaces: number): boolean { return [...text.replaceAll(",", "").matchAll(/-?\d+(?:\.\d+)?/g)].some((match) => Number(match[0]) === value && (match[0].split(".")[1]?.length ?? 0) === decimalPlaces); }
function evidenceRequirementsValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    const types = new Set(item.evidence_entries.map((entry) => entry.type)); const hasAuthority = [...types].some((type) => AUTHORITATIVE_TYPES.has(type));
    if ((item.result_state === "MEETS_BASE_RULE" || item.result_state === "DOES_NOT_MEET_BASE_RULE") && (!hasAuthority || !types.has("COMPARISON_INPUT"))) fail("COMPARISON_EVIDENCE_REQUIRED", "Conclusive comparison lacks authoritative rule or comparison-input evidence");
    if (item.result_state === "CONDITIONAL" && !hasAuthority) fail("Conditional rule lacks authoritative evidence");
    if (item.result_state === "NEEDS_EVIDENCE" && !types.has("BLOCKER_EVIDENCE")) fail("Needs-evidence result lacks blocker evidence");
    if (item.result_state === "NOT_EVALUATED" && (!hasAuthority || !types.has("BLOCKER_EVIDENCE"))) fail("Not-evaluated comparison lacks rule or blocker evidence");
    if (item.result_state === "NOT_APPLICABLE" && (!hasAuthority || !types.has("COMPARISON_INPUT"))) fail("Not-applicable conclusion lacks rule or parcel-condition evidence");
    if (item.item_kind === "COMPARISON" && item.comparison_scope !== "PARCEL_RULE" && payload.scope !== "PUBLIC_PARCEL" && (!hasAuthority || !types.has("COMPARISON_INPUT") || ![...types].some((type) => PROJECT_EVIDENCE_TYPES.has(type)))) fail("PRIVATE_COMPARISON_EVIDENCE", "Private comparison lacks required project, rule, or comparison evidence");
    if (payload.scope === "EXISTING_STRUCTURE" && (item.result_state === "MEETS_BASE_RULE" || item.result_state === "DOES_NOT_MEET_BASE_RULE") && !types.has("PRIVATE_SURVEY")) fail("EXISTING_SURVEY_REQUIRED", "Conclusive existing-structure comparison requires current survey evidence");
    if (item.item_kind === "CONTEXT" && !types.has("PUBLIC_MAPPING") && !types.has("MAPPING_OBSERVATION") && !types.has("BLOCKER_EVIDENCE")) fail("Context item lacks mapped or source evidence");
    if ((item.context_state === "SOURCE_UNAVAILABLE" || item.result_state === "SOURCE_UNAVAILABLE") && !types.has("BLOCKER_EVIDENCE")) fail("Source-unavailable result lacks source-unavailable evidence");
    if (item.context_state === "MAPPED_VERIFIED" && !types.has("VERIFICATION_RECORD")) fail("CONTEXT_VERIFICATION_EVIDENCE", "Verified mapped context requires verification evidence");
    if (item.eligibility_state === "ELIGIBLE" || item.eligibility_state === "NOT_ELIGIBLE") { if (!types.has("ELIGIBILITY_RULE") || !types.has("ELIGIBILITY_PREDICATE")) fail("ELIGIBILITY_EVIDENCE_REQUIRED", "Eligibility requires rule and predicate evidence"); }
    if (item.regulatory_use_state === "APPLIES" || item.regulatory_use_state === "DOES_NOT_APPLY") { if (!types.has("REGULATORY_DETERMINATION")) fail("REGULATORY_EVIDENCE_REQUIRED", "Regulatory applicability requires determination evidence"); }
    for (const entry of item.evidence_entries) if (["PUBLIC_MAPPING", "MAPPING_OBSERVATION", "VERIFICATION_RECORD", "ELIGIBILITY_RULE", "ELIGIBILITY_PREDICATE", "REGULATORY_DETERMINATION", "PUBLIC_CODE", "PUBLIC_AUTHORITY", "RULE_VERSION"].includes(entry.type) && entry.source_date === null) fail("SOURCE_DATE_REQUIRED", "Material authoritative evidence requires a source date");
  }
}

function evidenceValueValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    if (item.comparison) {
      const inputEntries = item.evidence_entries.filter((entry) => entry.type === "COMPARISON_INPUT");
      for (const entry of inputEntries) for (const measurement of entry.measurements) if (!containsNumber(entry.value, measurement.value)) fail("EVIDENCE_TEXT_VALUE_MISMATCH", "Structured comparison measurement contradicts its evidence text");
      const inputs = inputEntries.flatMap((entry) => entry.measurements);
      const requirement = inputs.filter((value) => value.kind === "REQUIREMENT"); const fact = inputs.filter((value) => value.kind === "FACT");
      if (!requirement.length || !fact.length) fail("COMPARISON_MEASUREMENTS_REQUIRED", "Conclusive comparison requires structured requirement and fact measurements");
      if (!requirement.some((value) => value.value === item.comparison!.requirement_value && value.unit === item.comparison!.unit)) fail("REQUIREMENT_EVIDENCE_MISMATCH", "Requirement evidence does not match structured comparison");
      if (!fact.some((value) => value.value === item.comparison!.fact_value && value.unit === item.comparison!.unit)) fail("FACT_EVIDENCE_MISMATCH", "Fact evidence does not match structured comparison");
      if (!item.display_requirement || !containsNumber(item.display_requirement, item.comparison.requirement_value)) fail("DISPLAY_REQUIREMENT_MISMATCH", "Displayed requirement does not match structured comparison");
      if (!item.display_fact || !containsNumber(item.display_fact, item.comparison.fact_value)) fail("DISPLAY_FACT_MISMATCH", "Displayed fact does not match structured comparison");
    }
  }
}

function precisionValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    if (item.exact_calculation !== null && item.precision === null) fail("PRECISION_REQUIRED", "Exact calculation requires structured precision metadata");
    if (item.precision === null) continue;
    if (item.exact_calculation === null) fail("EXACT_CALCULATION_REQUIRED", "Precision metadata requires an exact calculation");
    const factor = 10 ** item.precision.decimal_places; const rounded = Math.sign(item.precision.exact_value) * Math.floor(Math.abs(item.precision.exact_value) * factor + 0.5) / factor;
    if (rounded !== item.precision.display_value) fail("PRECISION_ROUNDING", "Display value does not follow the declared HALF_UP rounding rule");
    const all = item.evidence_entries.flatMap((entry) => entry.measurements);
    for (const entry of item.evidence_entries) for (const measurement of entry.measurements.filter((value) => value.kind === "EXACT" || value.kind === "DISPLAY")) if (!containsNumber(entry.value, measurement.value)) fail("PRECISION_EVIDENCE_TEXT_MISMATCH", "Precision evidence text contradicts its structured value");
    if (!all.some((value) => value.kind === "EXACT" && value.value === item.precision!.exact_value && value.unit === item.precision!.unit)) fail("PRECISION_EXACT_EVIDENCE", "Precision exact value is missing from evidence");
    if (!all.some((value) => value.kind === "DISPLAY" && value.value === item.precision!.display_value && value.unit === item.precision!.unit)) fail("PRECISION_DISPLAY_EVIDENCE", "Precision display value is missing from evidence");
    if (!item.derived_requirement || !containsNumber(item.derived_requirement, item.precision.display_value) || !item.display_requirement || !containsNumber(item.display_requirement, item.precision.display_value) || !containsNumber(item.exact_calculation, item.precision.exact_value)) fail("PRECISION_VALUE_MISMATCH", "Displayed, derived, exact, and precision values disagree");
    if (!containsFormattedNumber(item.derived_requirement, item.precision.display_value, item.precision.decimal_places)) fail("PRECISION_FORMAT", "Derived display does not use the declared decimal precision");
  }
}

function projectStatusValidate(payload: PreviewPayload): void {
  if (!payload.project_context) return;
  const status = payload.project_context.status_code;
  const statusEntries = payload.items.flatMap((item) => item.evidence_entries).filter((entry) => entry.project_status_code !== null);
  if (statusEntries.some((entry) => entry.project_status_code !== status)) fail("PROJECT_STATUS_CONFLICT", "Project status evidence contradicts project status");
  const supporting = statusEntries.filter((entry) => entry.project_status_code === status);
  if (status === "CITY_ISSUED" && !supporting.some((entry) => entry.type === "PRIVATE_PLAN_STATUS")) fail("CITY_ISSUANCE_EVIDENCE_REQUIRED", "City-issued status requires explicit private issuance evidence");
  if (status === "SUBMITTAL_ISSUANCE_NOT_PROVEN" && !supporting.some((entry) => entry.type === "PRIVATE_PLAN_STATUS")) fail("SUBMITTAL_STATUS_EVIDENCE_REQUIRED", "Unproven issuance status requires matching plan-status evidence");
  if (status === "EVIDENCE_REVIEW" && !supporting.some((entry) => entry.type === "PRIVATE_PROJECT_REVIEW")) fail("REVIEW_STATUS_EVIDENCE_REQUIRED", "Evidence-review status requires matching private review evidence");
  if (status === "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED" && !supporting.some((entry) => entry.type === "PRIVATE_PLAN_STATUS" || entry.type === "PRIVATE_PROJECT_REVIEW")) fail("REFERENCE_STATUS_EVIDENCE_REQUIRED", "Reference-sheet status requires matching private status evidence");
}

export function validateFeasibilityPreviewPayload(value: unknown, templates: TemplateCatalog, schema?: JsonSchema): PreviewPayload { if (!schema) fail("STRUCTURAL_SCHEMA_REQUIRED", "Structural schema is required"); structuralValidate(value, schema, schema); const payload = value as PreviewPayload; semanticValidate(payload); privacyValidate(payload); comparatorValidate(payload); templateValidate(payload, templates); evidenceRequirementsValidate(payload); evidenceValueValidate(payload); precisionValidate(payload); projectStatusValidate(payload); return payload; }
export function loadFeasibilitySchema(root = process.cwd()): JsonSchema { return readSealed(root, SCHEMA_FIXTURE) as JsonSchema; }
export function loadFeasibilityRenderer(root = process.cwd()): RendererContract { return validateRendererContract(readSealed(root, RENDERER_FIXTURE)); }
export function loadFeasibilityTemplates(root = process.cwd()): TemplateCatalog { return loadFeasibilityRenderer(root).templates; }
export function loadFeasibilityPreview(mode: PreviewMode, root = process.cwd()): PreviewBundle { const renderer = loadFeasibilityRenderer(root); const payload = validateFeasibilityPreviewPayload(readSealed(root, FIXTURES[mode]), renderer.templates, loadFeasibilitySchema(root)); return { payload, renderer, templates: renderer.templates }; }
export function normalizePreviewMode(value: string | string[] | undefined): PreviewMode { const candidate = Array.isArray(value) ? value[0] : value; return candidate === "rm" || candidate === "private" || candidate === "blocked" ? candidate : "rs"; }
export const FEASIBILITY_PREVIEW_FIXTURES = FIXTURES;
