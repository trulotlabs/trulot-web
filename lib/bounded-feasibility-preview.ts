import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { deriveComparisonPresentation, formatMeasurement, renderTemplate, templateFields } from "./feasibility-preview-presentation";

export const FEASIBILITY_PREVIEW_ENV = "TRULOT_FEASIBILITY_PREVIEW";
export const CONTRACT_VERSION = "bounded-feasibility-product-contract-v4-2026-10-02-p60f";
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
export const TEMPLATE_KEYS = ["CONDITIONAL_BASE_RULE", "CONDITIONAL_CURRENT_RULE", "FACT_IDENTIFIED", "MAPPED_CONTEXT", "MAPPED_CONTEXT_PENDING", "NEEDS_EVIDENCE", "NOT_APPLICABLE", "NOT_EVALUATED", "NO_MAPPED_CONTEXT", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"] as const;
export const RULE_SEMANTICS = ["MINIMUM_REQUIREMENT", "MAXIMUM_LIMIT", "EXACT_REQUIREMENT"] as const;
export const MEASUREMENT_ROLES = ["REQUIREMENT", "FACT", "DERIVED_REQUIREMENT", "EXACT_CALCULATION"] as const;

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
export type RuleSemantic = (typeof RULE_SEMANTICS)[number];
export type MeasurementRole = (typeof MEASUREMENT_ROLES)[number];
export type PreviewMode = "rs" | "rm" | "private" | "blocked";
export type Privacy = "PUBLIC" | "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX";
export type ContractAction = { type: "LINK" | "INSTRUCTION"; label: string; destination: string | null };
export type EvidenceSource = { artifact: string; privacy: "PUBLIC_AUTHORITY" | "PRIVATE_AUTHORIZED_EVIDENCE" };
export type DisplayPolicy = { decimal_places: number; max_decimal_places: number; trailing_zeros: boolean; qualifier: string | null };
export type Measurement = { measurement_id: string; role: MeasurementRole; exact_value: number; unit: "sq ft" | "ft" | "ratio"; dimension: "AREA" | "LENGTH" | "RATIO"; display_policy: DisplayPolicy; evidence_refs: string[] };
export type RuleBinding = { rule_semantic: RuleSemantic; requirement_measurement_id: string };
export type ProjectStatusEvidence = { status_code: ProjectStatusCode; source_type: EvidenceType; plan_project_id: string; cycle_context: string | null; issuance_record_id: string | null; issuance_date: string | null };
export type SurveyCurrentness = { geometry_subject: "EXISTING_AS_BUILT"; currentness: "CURRENTNESS_SUPPORTED" | "CURRENTNESS_UNRESOLVED"; later_change_reconciliation: "NO_MATERIAL_LATER_CHANGE" | "RECONCILED" | "UNRESOLVED"; structure_edge: "CODE_RELEVANT_EDGE_IDENTIFIED" | "UNRESOLVED"; boundary_control: "BOUNDARY_CONTROL_SUFFICIENT" | "UNRESOLVED" };
export type EvidenceEntry = { evidence_id: string; type: EvidenceType; label: string; value: string | null; privacy: EvidenceSource["privacy"]; source_date: string | null; measurement_refs: string[]; rule_binding: RuleBinding | null; project_status: ProjectStatusEvidence | null; survey_currentness: SurveyCurrentness | null; url?: string };
export type Blocker = { code: string; missing: string; why: string };
export type BaseFact = { fact_id: string; label: string; value: string };
export type Subject = { eyebrow: string; title: string; detail: string };
export type ProjectContext = { target_id: string; project_id: string; status_code: ProjectStatusCode; status_context: string | null; application_date: string | null; code_profile: string; privacy_label: string; not_evaluated: ProjectTopic[] };
export type StructuredComparison = { rule_semantic: RuleSemantic; rule_label: string; requirement_measurement_id: string; fact_measurement_id: string };
export type StructuredCalculation = { operation: "MULTIPLY"; input_measurement_id: string; factor: number; result_measurement_id: string };
export type FeasibilityItem = {
  item_id: string; item_kind: ItemKind; name: string; rule_family: string; section: Section; result_state: ProductState | null;
  comparison_scope: ComparisonScope | null; comparison: StructuredComparison | null; template_key: TemplateKey | null; template_values: Record<string, string>; answer: string | null; explanation: string;
  display_requirement: string | null; display_fact: string | null; base_requirement: string | null; derived_requirement: string | null; exact_calculation: string | null; measurements: Measurement[]; calculation: StructuredCalculation | null;
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
  rs: { file: "public-rs-replay.json", sha256: "0a94fc6f9cdd5836b23b4a27128b2482e4e80f16e33f353ce4fe895b983deb0a" }, rm: { file: "public-rm-replay.json", sha256: "7b2a98d7f5ff9cc3fe61a81cf0f433e0b0f92b6c8437baadf4d7c4b4551187fc" },
  private: { file: "private-project-replay.json", sha256: "e027e861144b9e1b6961c5ef52ac4d77f076f8b1d65592bd6125276f3b318a8d" }, blocked: { file: "blocked-project-replay.json", sha256: "f62e1f095d8fe3e6fa5c0ded83f49c2f64e9d5665168885c551c19184469636d" },
};
const RENDERER_FIXTURE = { file: "renderer-contract.json", sha256: "0fd1b2e3263b52831970f05e277ef62876d724a1b800c9d299b7431af8f4718f" };
const SCHEMA_FIXTURE = { file: "schema.json", sha256: "e6f538a4ed4677c346edeaf8d4e7c86d25c6b93f48b1b71df0dec1d2047e8b1c" };
const PRIVATE_TYPES = new Set<EvidenceType>(["PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW", "PRIVACY_NOTICE"]);
const AUTHORITATIVE_TYPES = new Set<EvidenceType>(["PUBLIC_AUTHORITY", "PUBLIC_CODE", "RULE_VERSION"]);
const PROJECT_EVIDENCE_TYPES = new Set<EvidenceType>(["PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW"]);
const PROHIBITED_COPY = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
const DIMENSION_BY_UNIT: Record<Measurement["unit"], Measurement["dimension"]> = { "sq ft": "AREA", ft: "LENGTH", ratio: "RATIO" };
const RULE_SEMANTIC_BY_FAMILY: Record<string, RuleSemantic> = { MINIMUM_LOT_AREA: "MINIMUM_REQUIREMENT", MINIMUM_LOT_WIDTH: "MINIMUM_REQUIREMENT", MINIMUM_LOT_DEPTH: "MINIMUM_REQUIREMENT", MINIMUM_STREET_FRONTAGE: "MINIMUM_REQUIREMENT", INTERIOR_SIDE_SETBACK: "MINIMUM_REQUIREMENT", MAXIMUM_TEST_LIMIT: "MAXIMUM_LIMIT", EXACT_TEST_RULE: "EXACT_REQUIREMENT" };
export const VALIDATION_ORDER = ["STRUCTURAL_SCHEMA", "SEMANTIC_INVARIANTS", "SCOPE_PRIVACY", "RULE_SEMANTIC_BINDING", "COMPARISON_ARITHMETIC", "DETERMINISTIC_DERIVATION", "EVIDENCE_TYPE_REQUIREMENTS", "MEASUREMENT_REFERENCE_INTEGRITY", "UNIT_DIMENSION_BINDING", "CALCULATION_BINDING", "DISPLAY_ORDER_PRESERVATION", "PROJECT_STATUS_EVIDENCE", "EXISTING_STRUCTURE_CURRENTNESS"] as const;

export class FeasibilityPreviewError extends Error { code: string; constructor(code: string, message = code) { super(`[${code}] ${message}`); this.name = "FeasibilityPreviewError"; this.code = code; } }
export function feasibilityPreviewEnabled(environment: PreviewEnvironment = process.env): boolean { return environment.TRULOT_FEASIBILITY_PREVIEW === "1" && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test"); }
function fail(code: string, message?: string): never { throw new FeasibilityPreviewError(code, message); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasType(value: unknown, type: string): boolean { if (type === "null") return value === null; if (type === "array") return Array.isArray(value); if (type === "object") return isRecord(value); if (type === "integer") return typeof value === "number" && Number.isInteger(value); return typeof value === type; }
function resolveRef(root: JsonSchema, ref: string): JsonSchema { let node: unknown = root; for (const part of ref.slice(2).split("/")) { if (!isRecord(node) || !(part in node)) fail("STRUCTURAL_SCHEMA", `Unknown schema reference ${ref}`); node = node[part]; } return node as JsonSchema; }
function structuralValidate(value: unknown, schema: JsonSchema, root: JsonSchema, at = "$"): void {
  if (typeof schema.$ref === "string") return structuralValidate(value, resolveRef(root, schema.$ref), root, at);
  if (Array.isArray(schema.anyOf)) { for (const option of schema.anyOf) { try { structuralValidate(value, option as JsonSchema, root, at); return; } catch {} } fail("STRUCTURAL_SCHEMA", `${at} does not match any allowed schema`); }
  if ("const" in schema && value !== schema.const) fail("STRUCTURAL_SCHEMA", `${at} does not match the required constant`);
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) fail("STRUCTURAL_SCHEMA", `${at} is not an allowed value`);
  if (schema.type) { const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!allowed.some((type) => typeof type === "string" && hasType(value, type))) fail("STRUCTURAL_SCHEMA", `${at} has the wrong type`); }
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) fail("STRUCTURAL_SCHEMA", `${at} is too short`);
  if (typeof value === "number") { if (typeof schema.minimum === "number" && value < schema.minimum) fail("STRUCTURAL_SCHEMA", `${at} is below minimum`); if (typeof schema.maximum === "number" && value > schema.maximum) fail("STRUCTURAL_SCHEMA", `${at} is above maximum`); }
  if (Array.isArray(value)) { if (typeof schema.minItems === "number" && value.length < schema.minItems) fail("STRUCTURAL_SCHEMA", `${at} has too few items`); if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) fail("STRUCTURAL_SCHEMA", `${at} contains duplicates`); if (isRecord(schema.items)) value.forEach((entry, index) => structuralValidate(entry, schema.items as JsonSchema, root, `${at}[${index}]`)); }
  if (isRecord(value)) { const required = Array.isArray(schema.required) ? schema.required : []; for (const key of required) if (typeof key === "string" && !(key in value)) fail("STRUCTURAL_SCHEMA", `${at}.${key} is required`); const properties = isRecord(schema.properties) ? schema.properties : {}; for (const [key, entry] of Object.entries(value)) { if (key in properties) structuralValidate(entry, properties[key] as JsonSchema, root, `${at}.${key}`); else if (schema.additionalProperties === false) fail("STRUCTURAL_SCHEMA", `${at} contains unknown field ${key}`); else if (isRecord(schema.additionalProperties)) structuralValidate(entry, schema.additionalProperties, root, `${at}.${key}`); } }
}
function readSealed(root: string, fixture: { file: string; sha256: string }): unknown { const raw = readFileSync(path.join(root, DATA_DIR, fixture.file)); const digest = createHash("sha256").update(raw).digest("hex"); if (digest !== fixture.sha256) fail("SEAL_MISMATCH", `${fixture.file} seal does not match`); return JSON.parse(raw.toString("utf8")); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function validateRendererContract(value: unknown): RendererContract {
  if (!isRecord(value) || value.contract_version !== CONTRACT_VERSION || value.free_form_conclusion_generation !== false || !isRecord(value.templates) || !isRecord(value.project_status_labels)) fail("RENDERER_CONTRACT", "Renderer contract is malformed");
  const templates = {} as TemplateCatalog; for (const key of TEMPLATE_KEYS) { const candidate = value.templates[key]; if (typeof candidate !== "string" || !candidate) fail("RENDERER_CONTRACT", `Missing template ${key}`); templates[key] = candidate; } if (Object.keys(value.templates).length !== TEMPLATE_KEYS.length) fail("RENDERER_CONTRACT", "Template catalog contains unknown fields");
  const projectStatusLabels = {} as Record<ProjectStatusCode, string>; for (const key of PROJECT_STATUS_CODES) { const candidate = value.project_status_labels[key]; if (typeof candidate !== "string" || !candidate) fail("RENDERER_CONTRACT", `Missing status label ${key}`); projectStatusLabels[key] = candidate; }
  return { templates, projectStatusLabels };
}
export function validateTemplateCatalog(value: unknown): TemplateCatalog { return validateRendererContract(value).templates; }

const CONTEXT_MATRIX: Record<ContextState, Array<[boolean | null, VerificationState, EligibilityState, RegulatoryUseState]>> = {
  MAPPED_VERIFICATION_PENDING: [[true, "PENDING", "NOT_EVALUATED", "NOT_USED_PENDING_VERIFICATION"]], MAPPED_VERIFIED: [[true, "VERIFIED", "NOT_EVALUATED", "CONTEXT_ONLY"], [true, "VERIFIED", "ELIGIBLE", "APPLIES"], [true, "VERIFIED", "NOT_ELIGIBLE", "DOES_NOT_APPLY"]], NO_MAPPED_INTERSECTION: [[false, "NO_INTERSECTION", "NOT_EVALUATED", "CONTEXT_ONLY"]], SOURCE_UNAVAILABLE: [[null, "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE"]], NOT_EVALUATED: [[null, "NOT_EVALUATED", "NOT_EVALUATED", "NOT_EVALUATED"]],
};
const CONTEXT_TEMPLATE: Record<ContextState, TemplateKey> = { MAPPED_VERIFICATION_PENDING: "MAPPED_CONTEXT_PENDING", MAPPED_VERIFIED: "MAPPED_CONTEXT", NO_MAPPED_INTERSECTION: "NO_MAPPED_CONTEXT", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", NOT_EVALUATED: "NOT_EVALUATED" };
const TEMPLATE_BY_STATE: Partial<Record<ProductState, TemplateKey[]>> = { CONDITIONAL: ["CONDITIONAL_BASE_RULE", "CONDITIONAL_CURRENT_RULE"], NEEDS_EVIDENCE: ["NEEDS_EVIDENCE"], NOT_APPLICABLE: ["NOT_APPLICABLE"], NOT_EVALUATED: ["NOT_EVALUATED"], SOURCE_UNAVAILABLE: ["SOURCE_UNAVAILABLE"], OUTSIDE_CURRENT_SCOPE: ["OUTSIDE_CURRENT_SCOPE"] };

function derivedOverall(payload: PreviewPayload): OverallState {
  if (payload.items.some((item) => item.result_state === "SOURCE_UNAVAILABLE" || item.context_state === "SOURCE_UNAVAILABLE")) return "SOURCE_UNAVAILABLE";
  const results = payload.items.flatMap((item) => item.result_state ? [item.result_state] : []);
  if (results.length && results.every((state) => state === "OUTSIDE_CURRENT_SCOPE")) return "OUTSIDE_CURRENT_SCOPE";
  if (results.includes("NEEDS_EVIDENCE") && !results.some((state) => state === "MEETS_BASE_RULE" || state === "DOES_NOT_MEET_BASE_RULE" || state === "NOT_APPLICABLE")) return "MORE_EVIDENCE_NEEDED";
  const contextsFinal = payload.items.filter((item) => item.item_kind === "CONTEXT").every((item) => item.context_state === "MAPPED_VERIFIED" || item.context_state === "NO_MAPPED_INTERSECTION");
  if (results.length && results.every((state) => state === "MEETS_BASE_RULE" || state === "DOES_NOT_MEET_BASE_RULE" || state === "NOT_APPLICABLE") && contextsFinal && !payload.project_context?.not_evaluated.length) return "BASE_PARCEL_RULES_EVALUATED";
  return "PARTIAL_EVALUATION";
}
function validateAction(action: ContractAction): void { if (action.type === "LINK" && (!action.destination || !/^(https?:\/\/|\/)/.test(action.destination))) fail("ACTION_DESTINATION"); if (action.type === "INSTRUCTION" && action.destination !== null) fail("ACTION_DESTINATION"); }
function semanticValidate(payload: PreviewPayload): void {
  payload.actions.forEach(validateAction); const ids = new Set<string>();
  if (payload.project_context?.application_date && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.project_context.application_date) || Number.isNaN(Date.parse(`${payload.project_context.application_date}T00:00:00Z`)))) fail("PROJECT_APPLICATION_DATE_INVALID");
  for (const item of payload.items) {
    item.actions.forEach(validateAction); if (ids.has(item.item_id)) fail("ITEM_ID_DUPLICATE"); ids.add(item.item_id);
    if (item.answer !== null) fail("DUPLICATE_ANSWER_AUTHORITY");
    const context = [item.context_type, item.context_state, item.mapped_observation, item.verification_state, item.eligibility_state, item.regulatory_use_state];
    if (item.comparison) {
      if (item.item_kind !== "COMPARISON" || item.result_state !== null || item.template_key !== null || Object.keys(item.template_values).length || item.answer !== null || item.display_requirement !== null || item.display_fact !== null) fail("DUPLICATE_CONCLUSIVE_AUTHORITY", "Conclusive fields must be derived from structured comparison data");
      if (!item.comparison_scope || context.some((value) => value !== null)) fail("COMPARISON_SEMANTICS");
    } else if (item.item_kind === "FACT") {
      if (item.result_state !== null || item.comparison_scope !== null || context.some((value) => value !== null) || item.template_key !== "FACT_IDENTIFIED") fail("FACT_SEMANTICS");
    } else if (item.item_kind === "CONTEXT") {
      if (item.result_state !== null || item.comparison_scope !== null || !item.context_state || !item.verification_state || !item.eligibility_state || !item.regulatory_use_state || CONTEXT_TEMPLATE[item.context_state] !== item.template_key || !CONTEXT_MATRIX[item.context_state].some(([mapped, verification, eligibility, regulatory]) => mapped === item.mapped_observation && verification === item.verification_state && eligibility === item.eligibility_state && regulatory === item.regulatory_use_state)) fail("CONTEXT_SEMANTICS");
    } else {
      if (!item.result_state || !item.comparison_scope || context.some((value) => value !== null) || !item.template_key || !TEMPLATE_BY_STATE[item.result_state]?.includes(item.template_key)) fail("RESULT_SEMANTICS");
    }
  }
}
function privacyValidate(payload: PreviewPayload): void {
  const isPublic = payload.scope === "PUBLIC_PARCEL";
  if (isPublic && (payload.privacy !== "PUBLIC" || payload.project_context !== null || payload.provenance.some((source) => source.privacy !== "PUBLIC_AUTHORITY"))) fail("PUBLIC_SCOPE_PRIVACY");
  if (!isPublic && (payload.privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" || !payload.project_context)) fail("PRIVATE_SCOPE_PRIVACY");
  for (const item of payload.items) for (const entry of item.evidence_entries) if (isPublic && (PRIVATE_TYPES.has(entry.type) || entry.privacy !== "PUBLIC_AUTHORITY")) fail("PUBLIC_PRIVATE_EVIDENCE");
}
function measurementMap(item: FeasibilityItem): Map<string, Measurement> { const map = new Map<string, Measurement>(); for (const measurement of item.measurements) { if (map.has(measurement.measurement_id)) fail("MEASUREMENT_ID_DUPLICATE"); map.set(measurement.measurement_id, measurement); if (DIMENSION_BY_UNIT[measurement.unit] !== measurement.dimension) fail("UNIT_DIMENSION_MISMATCH"); if (measurement.display_policy.decimal_places > measurement.display_policy.max_decimal_places) fail("DISPLAY_PRECISION_INVALID"); } return map; }
function comparisonValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    const measurements = measurementMap(item); const comparison = item.comparison;
    if (!comparison) continue;
    const requirement = measurements.get(comparison.requirement_measurement_id); const fact = measurements.get(comparison.fact_measurement_id);
    if (!requirement || !fact || requirement.role !== "REQUIREMENT" || fact.role !== "FACT") fail("COMPARISON_MEASUREMENT_REFERENCE");
    if (requirement.unit !== fact.unit || requirement.dimension !== fact.dimension) fail("UNIT_MISMATCH");
    if (comparison.rule_label !== item.name.toLowerCase()) fail("RULE_LABEL_MISMATCH");
    const sealedSemantic = RULE_SEMANTIC_BY_FAMILY[item.rule_family]; if (!sealedSemantic || sealedSemantic !== comparison.rule_semantic) fail("RULE_SEMANTIC_MISMATCH");
    const bindings = item.evidence_entries.filter((entry) => AUTHORITATIVE_TYPES.has(entry.type) && entry.rule_binding);
    if (!bindings.some((entry) => entry.rule_binding!.rule_semantic === comparison.rule_semantic && entry.rule_binding!.requirement_measurement_id === requirement.measurement_id)) fail("AUTHORITATIVE_RULE_BINDING_MISMATCH");
    const derived = deriveComparisonPresentation(item);
    if (!derived.answer || !derived.displayRequirement || !derived.displayFact) fail("COMPARISON_DERIVATION");
    if (payload.scope === "PUBLIC_PARCEL" && item.comparison_scope !== "PARCEL_RULE") fail("PUBLIC_SCOPE_CONCLUSIVE");
    if (payload.scope === "PRIVATE_PROJECT" && !["THIS_DIMENSION_ONLY", "PROJECT_SPECIFIC"].includes(item.comparison_scope!)) fail("PRIVATE_SCOPE_CONCLUSIVE");
    if (payload.scope === "EXISTING_STRUCTURE" && item.comparison_scope !== "EXISTING_STRUCTURE") fail("EXISTING_SCOPE_CONCLUSIVE");
    if (payload.scope === "PRIVATE_PROJECT") { const planFact = item.evidence_entries.find((entry) => entry.type === "PRIVATE_PLAN_FACT" && entry.measurement_refs.includes(fact.measurement_id)); if (!planFact) fail("PRIVATE_PLAN_FACT_REQUIRED"); }
  }
}
function evidenceValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    const measurements = measurementMap(item); const evidence = new Map(item.evidence_entries.map((entry) => [entry.evidence_id, entry]));
    for (const measurement of item.measurements) for (const ref of measurement.evidence_refs) { const entry = evidence.get(ref); if (!entry || !entry.measurement_refs.includes(measurement.measurement_id)) fail("EVIDENCE_MEASUREMENT_MISMATCH"); }
    for (const entry of item.evidence_entries) {
      for (const ref of entry.measurement_refs) { const measurement = measurements.get(ref); if (!measurement || !measurement.evidence_refs.includes(entry.evidence_id)) fail("EVIDENCE_MEASUREMENT_MISMATCH"); }
      if (item.comparison && entry.type === "COMPARISON_INPUT" && entry.measurement_refs.length && entry.value !== null) fail("DUPLICATE_EVIDENCE_VALUE");
      if (entry.project_status && entry.value !== null) fail("STATUS_PROSE_CONTRADICTION");
      if (entry.project_status && entry.project_status.source_type !== entry.type) fail("PROJECT_STATUS_SOURCE_MISMATCH");
    }
    const types = new Set(item.evidence_entries.map((entry) => entry.type));
    if (item.comparison && (!types.has("COMPARISON_INPUT") || ![...types].some((type) => AUTHORITATIVE_TYPES.has(type)))) fail("COMPARISON_EVIDENCE_REQUIRED");
    if (item.comparison && payload.scope !== "PUBLIC_PARCEL" && ![...types].some((type) => PROJECT_EVIDENCE_TYPES.has(type))) fail("PRIVATE_COMPARISON_EVIDENCE");
    if (item.result_state === "NEEDS_EVIDENCE" && (!item.blocker || !types.has("BLOCKER_EVIDENCE"))) fail("BLOCKER_EVIDENCE_REQUIRED");
    if (item.eligibility_state === "ELIGIBLE" || item.eligibility_state === "NOT_ELIGIBLE") { for (const type of ["ELIGIBILITY_RULE", "ELIGIBILITY_PREDICATE", "REGULATORY_DETERMINATION"] as EvidenceType[]) if (!types.has(type)) fail("ELIGIBILITY_EVIDENCE_REQUIRED"); }
  }
}
function calculationValidate(payload: PreviewPayload): void {
  for (const item of payload.items) {
    if (!item.calculation) continue; const measurements = measurementMap(item); const input = measurements.get(item.calculation.input_measurement_id); const result = measurements.get(item.calculation.result_measurement_id);
    if (!input || !result || result.role !== "DERIVED_REQUIREMENT" || Math.abs(input.exact_value * item.calculation.factor - result.exact_value) > 1e-9) fail("EXACT_CALCULATION_MISMATCH");
    if (item.exact_calculation !== null || item.derived_requirement !== null) fail("DUPLICATE_CALCULATION_AUTHORITY");
  }
}
function projectStatusValidate(payload: PreviewPayload): void {
  if (!payload.project_context) return; const status = payload.project_context.status_code;
  const entries = payload.items.flatMap((item) => item.evidence_entries).filter((entry) => entry.project_status);
  if (!entries.length || entries.some((entry) => entry.project_status!.status_code !== status || entry.project_status!.plan_project_id !== payload.project_context!.project_id)) fail("PROJECT_STATUS_CONFLICT");
  for (const entry of entries) { const statusEvidence = entry.project_status!; if (!entry.source_date) fail("PROJECT_STATUS_SOURCE_DATE_REQUIRED"); if (status === "CITY_ISSUED" && (!statusEvidence.issuance_record_id || !statusEvidence.issuance_date)) fail("CITY_ISSUANCE_EVIDENCE_REQUIRED"); if (status === "SUBMITTAL_ISSUANCE_NOT_PROVEN" && (statusEvidence.issuance_record_id || statusEvidence.issuance_date)) fail("STATUS_EVIDENCE_CONTRADICTION"); }
}
function currentnessValidate(payload: PreviewPayload): void {
  for (const item of payload.items.filter((candidate) => candidate.comparison && candidate.comparison_scope === "EXISTING_STRUCTURE")) {
    const surveys = item.evidence_entries.filter((entry) => entry.type === "PRIVATE_SURVEY"); if (!surveys.length) fail("EXISTING_SURVEY_REQUIRED");
    for (const survey of surveys) { if (!survey.source_date) fail("SURVEY_DATE_REQUIRED"); const current = survey.survey_currentness; if (!current || current.geometry_subject !== "EXISTING_AS_BUILT") fail("SURVEY_CURRENTNESS_REQUIRED"); if (current.currentness !== "CURRENTNESS_SUPPORTED" || !["NO_MATERIAL_LATER_CHANGE", "RECONCILED"].includes(current.later_change_reconciliation) || current.structure_edge !== "CODE_RELEVANT_EDGE_IDENTIFIED" || current.boundary_control !== "BOUNDARY_CONTROL_SUFFICIENT") fail("SURVEY_CURRENTNESS_UNRESOLVED"); }
  }
}
function templateValidate(payload: PreviewPayload, templates: TemplateCatalog): void { for (const item of payload.items.filter((candidate) => !candidate.comparison)) { if (!item.template_key) fail("TEMPLATE_REQUIRED"); const template = templates[item.template_key]; if (templateFields(template).join("|") !== Object.keys(item.template_values).sort().join("|")) fail("TEMPLATE_VALUES_MISMATCH"); } }
function hydrate(payload: PreviewPayload, renderer: RendererContract): PreviewPayload {
  for (const item of payload.items) {
    if (item.comparison) { const derived = deriveComparisonPresentation(item); item.result_state = derived.resultState; item.answer = derived.answer; item.display_requirement = derived.displayRequirement; item.display_fact = derived.displayFact; }
    else { item.answer = renderTemplate(renderer.templates[item.template_key!], item.template_values); }
    if (item.calculation) { const map = measurementMap(item); const input = map.get(item.calculation.input_measurement_id)!; const result = map.get(item.calculation.result_measurement_id)!; item.derived_requirement = formatMeasurement(result); item.display_requirement = `${formatMeasurement(result)} current calculated rule; ${item.base_requirement} table base`; item.display_fact = formatMeasurement(input); item.exact_calculation = `${formatMeasurement(input, true)} × ${item.calculation.factor * 100}% = ${result.exact_value} ${result.unit}`; }
    for (const entry of item.evidence_entries) {
      if (entry.project_status) { const base = renderer.projectStatusLabels[entry.project_status.status_code]; entry.value = entry.project_status.cycle_context ? `${base} · ${entry.project_status.cycle_context}` : base; }
      else if (entry.measurement_refs.length && entry.value === null) {
        if (item.calculation && entry.measurement_refs.includes(item.calculation.input_measurement_id) && entry.measurement_refs.includes(item.calculation.result_measurement_id)) entry.value = item.exact_calculation;
        else entry.value = entry.measurement_refs.map((id) => formatMeasurement(measurementMap(item).get(id)!, true)).join("; ");
      }
    }
  }
  if (derivedOverall(payload) !== payload.overall_state) fail("OVERALL_STATE_MISMATCH");
  if (PROHIBITED_COPY.test(JSON.stringify(payload))) fail("PROHIBITED_CONCLUSION_COPY"); return payload;
}

export function validateFeasibilityPreviewPayload(value: unknown, templates: TemplateCatalog, schema?: JsonSchema, projectStatusLabels?: Record<ProjectStatusCode, string>): PreviewPayload {
  if (!schema) fail("STRUCTURAL_SCHEMA_REQUIRED"); structuralValidate(value, schema, schema); const payload = clone(value as PreviewPayload);
  semanticValidate(payload); privacyValidate(payload); comparisonValidate(payload); templateValidate(payload, templates); evidenceValidate(payload); calculationValidate(payload); projectStatusValidate(payload); currentnessValidate(payload);
  const labels = projectStatusLabels ?? { SUBMITTAL_ISSUANCE_NOT_PROVEN: "Construction-document submittal — issuance not proven", CITY_ISSUED: "City-issued record", REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED: "Reference-sheet approval not verified", EVIDENCE_REVIEW: "Private project evidence review" };
  return hydrate(payload, { templates, projectStatusLabels: labels });
}
export function loadFeasibilityRenderer(root = process.cwd()): RendererContract { return validateRendererContract(readSealed(root, RENDERER_FIXTURE)); }
export function loadFeasibilitySchema(root = process.cwd()): JsonSchema { return readSealed(root, SCHEMA_FIXTURE) as JsonSchema; }
export function loadFeasibilityPreviewSource(mode: PreviewMode, root = process.cwd()): PreviewPayload { return readSealed(root, FIXTURES[mode]) as PreviewPayload; }
export function loadFeasibilityPreview(mode: PreviewMode, root = process.cwd()): PreviewBundle { const renderer = loadFeasibilityRenderer(root); const payload = validateFeasibilityPreviewPayload(loadFeasibilityPreviewSource(mode, root), renderer.templates, loadFeasibilitySchema(root), renderer.projectStatusLabels); return { payload, renderer, templates: renderer.templates }; }
export function previewModeFromEnvironment(environment: PreviewEnvironment = process.env): PreviewMode { const candidate = environment.TRULOT_FEASIBILITY_PREVIEW; return candidate === "rm" || candidate === "private" || candidate === "blocked" ? candidate : "rs"; }
export function normalizePreviewMode(candidate: string | string[] | undefined): PreviewMode { const value = Array.isArray(candidate) ? candidate[0] : candidate; return value === "rm" || value === "private" || value === "blocked" ? value : "rs"; }
export const FEASIBILITY_PREVIEW_FIXTURES = FIXTURES;
