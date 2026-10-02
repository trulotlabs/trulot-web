import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderTemplate, templateFields } from "./feasibility-preview-presentation";

export const FEASIBILITY_PREVIEW_ENV = "TRULOT_FEASIBILITY_PREVIEW";
export const CONTRACT_VERSION = "bounded-feasibility-product-contract-v1-2026-10-02-p60c";
export const PRODUCT_STATES = ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_APPLICABLE", "NOT_EVALUATED", "SOURCE_UNAVAILABLE", "OUTSIDE_CURRENT_SCOPE"] as const;
export const OVERALL_STATES = ["BASE_PARCEL_RULES_EVALUATED", "PARTIAL_EVALUATION", "MORE_EVIDENCE_NEEDED", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"] as const;
export const ITEM_KINDS = ["FACT", "RULE", "CONTEXT", "COMPARISON"] as const;
export const SECTIONS = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"] as const;
export const SUMMARY_GROUPS = ["MEETS_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_EVALUATED", "MAPPED_CONTEXT", "NOT_APPLICABLE"] as const;
export const COMPARISON_SCOPES = ["PARCEL_RULE", "THIS_DIMENSION_ONLY", "PROJECT_SPECIFIC", "EXISTING_STRUCTURE"] as const;
export const CONTEXT_STATES = ["MAPPED_VERIFICATION_PENDING", "MAPPED_VERIFIED", "NO_MAPPED_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"] as const;
export const EVIDENCE_TYPES = ["PUBLIC_SOURCE", "RULE_CITATION", "VERSION", "PARCEL_FACT", "COMPARISON_INPUT", "MAPPING_OBSERVATION", "MAPPING_RECEIPT", "BLOCKER_EVIDENCE", "PRIVATE_PLAN_STATUS", "PRIVACY"] as const;
export const TEMPLATE_KEYS = ["CONDITIONAL_BASE_RULE", "CONDITIONAL_CURRENT_RULE", "FACT_IDENTIFIED", "MAPPED_CONTEXT", "MAPPED_CONTEXT_PENDING", "MINIMUM_COMPARISON_DOES_NOT_MEET", "MINIMUM_COMPARISON_MEETS", "NEEDS_EVIDENCE", "NOT_APPLICABLE", "NOT_EVALUATED", "NO_MAPPED_CONTEXT", "PROJECT_COMPARISON_MEETS", "SOURCE_UNAVAILABLE"] as const;

export type ProductState = (typeof PRODUCT_STATES)[number];
export type OverallState = (typeof OVERALL_STATES)[number];
export type ItemKind = (typeof ITEM_KINDS)[number];
export type Section = (typeof SECTIONS)[number];
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];
export type ComparisonScope = (typeof COMPARISON_SCOPES)[number];
export type ContextState = (typeof CONTEXT_STATES)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type PreviewMode = "rs" | "rm" | "private" | "blocked";
export type Privacy = "PUBLIC" | "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX";
export type ContractAction = { type: "LINK" | "INSTRUCTION"; label: string; destination: string | null };
export type EvidenceSource = { artifact: string; privacy: "PUBLIC_AUTHORITY" | "PRIVATE_AUTHORIZED_EVIDENCE" };
export type EvidenceEntry = { type: EvidenceType; label: string; value: string; privacy: EvidenceSource["privacy"]; url?: string };
export type SummaryEntry = { group: SummaryGroup; label: string };
export type Blocker = { code: string; missing: string; why: string };
export type BaseFact = { fact_id: string; label: string; value: string };
export type Subject = { eyebrow: string; title: string; detail: string };
export type ProjectContext = { target_id: string; project_id: string; status: string; application_date: string; code_profile: string; privacy_label: string; summary_entries: SummaryEntry[]; not_evaluated: string[] };
export type FeasibilityItem = {
  item_id: string; item_kind: ItemKind; name: string; rule_family: string; section: Section;
  result_state: ProductState | null; state_label: string; summary_entries: SummaryEntry[];
  comparison_scope: ComparisonScope | null; template_key: TemplateKey; template_values: Record<string, string>;
  answer: string; explanation: string; display_requirement: string | null; display_fact: string | null;
  base_requirement: string | null; derived_requirement: string | null; exact_calculation: string | null;
  context_type: string | null; context_state: ContextState | null; verification_state: string | null;
  eligibility_state: string | null; regulatory_use_state: string | null; evidence_entries: EvidenceEntry[];
  blocker: Blocker | null; privacy: Privacy; actions: ContractAction[];
};
export type PreviewPayload = {
  contract_version: string; scope: "PUBLIC_PARCEL" | "PRIVATE_PROJECT" | "EXISTING_STRUCTURE"; privacy: Privacy;
  subject: Subject; base_facts: BaseFact[]; project_context: ProjectContext | null; overall_state: OverallState;
  items: FeasibilityItem[]; actions: ContractAction[]; provenance: EvidenceSource[];
};
export type TemplateCatalog = Record<TemplateKey, string>;
export type PreviewBundle = { payload: PreviewPayload; templates: TemplateCatalog };

type PreviewEnvironment = { NODE_ENV?: string; TRULOT_FEASIBILITY_PREVIEW?: string };
const DATA_DIR = "data/bounded-feasibility-product-contract-v0";
const FIXTURES: Record<PreviewMode, { file: string; sha256: string }> = {
  rs: { file: "public-rs-replay.json", sha256: "fcf4f11f3b36ec0e5da378e10d7b4e4f107f5ef55c201edb9bc3d8d02e4194c9" },
  rm: { file: "public-rm-replay.json", sha256: "a926185e5a7316edd4018e1cc53e0bb17d820a1b0d2b3b9936f485085ba46955" },
  private: { file: "private-project-replay.json", sha256: "ea7d9aac87f34792cda3c781d6ac83b52b38e52cdd4cc32fdd260837c5b20c9a" },
  blocked: { file: "blocked-project-replay.json", sha256: "7eae4e9a4bf2da51862099b302e8eba3de38e212f78baafa96fc86fc90ea23cd" },
};
const RENDERER_FIXTURE = { file: "renderer-contract.json", sha256: "b8e37139da94f746a72efddc597d3dca2009080914b78485f79084903331e0de" };
const PROHIBITED_COPY = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
const PUBLIC_PRIVATE_MARKERS = /PRJ-|PRIVATE_AUTHORIZED|private plan|sheet provenance|source_sha256|operator file/i;

export class FeasibilityPreviewError extends Error { constructor(message: string) { super(message); this.name = "FeasibilityPreviewError"; } }
export function feasibilityPreviewEnabled(environment: PreviewEnvironment = process.env): boolean { return environment.TRULOT_FEASIBILITY_PREVIEW === "1" && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test"); }
function fail(message: string): never { throw new FeasibilityPreviewError(message); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) fail(`${label} is invalid`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null) return null; return nonEmpty(value, label); }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T { if (!allowed.includes(value as T)) fail(`Unknown ${label}`); return value as T; }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) { const extra = Object.keys(value).filter((key) => !allowed.includes(key)); if (extra.length) fail(`${label} contains unknown field ${extra[0]}`); }
function stringList(value: unknown, label: string): string[] { if (!Array.isArray(value)) fail(`${label} is invalid`); return value.map((item) => nonEmpty(item, label)); }

function validateAction(value: unknown): ContractAction {
  if (!isRecord(value)) fail("Action is malformed"); exactKeys(value, ["type", "label", "destination"], "Action");
  const type = enumValue(value.type, ["LINK", "INSTRUCTION"] as const, "action type"); const label = nonEmpty(value.label, "Action label");
  const destination = value.destination === null ? null : nonEmpty(value.destination, "Action destination");
  if (type === "LINK" && destination === null) fail("Link action is missing a destination");
  if (type === "LINK" && !/^(https?:\/\/|\/)/.test(destination!)) fail("Link action destination is unsafe");
  if (type === "INSTRUCTION" && destination !== null) fail("Instruction action cannot have a destination");
  return { type, label, destination };
}
function validateEvidence(value: unknown): EvidenceEntry {
  if (!isRecord(value)) fail("Evidence entry is malformed"); exactKeys(value, ["type", "label", "value", "privacy", "url"], "Evidence entry");
  const entry: EvidenceEntry = { type: enumValue(value.type, EVIDENCE_TYPES, "evidence type"), label: nonEmpty(value.label, "Evidence label"), value: nonEmpty(value.value, "Evidence value"), privacy: enumValue(value.privacy, ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"] as const, "evidence privacy") };
  if (value.url !== undefined) entry.url = nonEmpty(value.url, "Evidence URL");
  return entry;
}
function validateSummary(value: unknown): SummaryEntry {
  if (!isRecord(value)) fail("Summary entry is malformed"); exactKeys(value, ["group", "label"], "Summary entry");
  return { group: enumValue(value.group, SUMMARY_GROUPS, "summary group"), label: nonEmpty(value.label, "Summary label") };
}
export function validateTemplateCatalog(value: unknown): TemplateCatalog {
  if (!isRecord(value) || value.contract_version !== CONTRACT_VERSION || value.free_form_conclusion_generation !== false || !isRecord(value.templates)) fail("Renderer contract is malformed");
  exactKeys(value.templates, TEMPLATE_KEYS, "Template catalog"); const templates = {} as TemplateCatalog;
  for (const key of TEMPLATE_KEYS) templates[key] = nonEmpty(value.templates[key], `Renderer template ${key}`);
  return templates;
}

export function validateFeasibilityPreviewPayload(value: unknown, templates: TemplateCatalog): PreviewPayload {
  if (!isRecord(value)) fail("Preview payload is malformed");
  exactKeys(value, ["contract_version", "scope", "privacy", "subject", "base_facts", "project_context", "overall_state", "items", "actions", "provenance"], "Preview payload");
  if (value.contract_version !== CONTRACT_VERSION) fail("Preview contract version does not match");
  const scope = enumValue(value.scope, ["PUBLIC_PARCEL", "PRIVATE_PROJECT", "EXISTING_STRUCTURE"] as const, "preview scope");
  const privacy = enumValue(value.privacy, ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"] as const, "preview privacy");
  const overall_state = enumValue(value.overall_state, OVERALL_STATES, "overall state");
  if (!isRecord(value.subject)) fail("Preview subject is malformed"); exactKeys(value.subject, ["eyebrow", "title", "detail"], "Preview subject");
  const subject: Subject = { eyebrow: nonEmpty(value.subject.eyebrow, "Subject eyebrow"), title: nonEmpty(value.subject.title, "Subject title"), detail: nonEmpty(value.subject.detail, "Subject detail") };
  if (!Array.isArray(value.base_facts)) fail("Base facts are malformed");
  const base_facts = value.base_facts.map((candidate): BaseFact => { if (!isRecord(candidate)) fail("Base fact is malformed"); exactKeys(candidate, ["fact_id", "label", "value"], "Base fact"); return { fact_id: nonEmpty(candidate.fact_id, "Base fact ID"), label: nonEmpty(candidate.label, "Base fact label"), value: nonEmpty(candidate.value, "Base fact value") }; });
  let project_context: ProjectContext | null = null;
  if (value.project_context !== null) {
    if (!isRecord(value.project_context)) fail("Project context is malformed"); exactKeys(value.project_context, ["target_id", "project_id", "status", "application_date", "code_profile", "privacy_label", "summary_entries", "not_evaluated"], "Project context");
    if (!Array.isArray(value.project_context.summary_entries)) fail("Project summary is malformed");
    project_context = { target_id: nonEmpty(value.project_context.target_id, "Project target"), project_id: nonEmpty(value.project_context.project_id, "Project ID"), status: nonEmpty(value.project_context.status, "Project status"), application_date: nonEmpty(value.project_context.application_date, "Application date"), code_profile: nonEmpty(value.project_context.code_profile, "Code profile"), privacy_label: nonEmpty(value.project_context.privacy_label, "Privacy label"), summary_entries: value.project_context.summary_entries.map(validateSummary), not_evaluated: stringList(value.project_context.not_evaluated, "Project not-evaluated item") };
  }
  if (!Array.isArray(value.items) || value.items.length === 0) fail("Preview items are malformed"); const itemIds = new Set<string>();
  const items = value.items.map((candidate): FeasibilityItem => {
    if (!isRecord(candidate)) fail("Preview item is malformed");
    exactKeys(candidate, ["item_id", "item_kind", "name", "rule_family", "section", "result_state", "state_label", "summary_entries", "comparison_scope", "template_key", "template_values", "answer", "explanation", "display_requirement", "display_fact", "base_requirement", "derived_requirement", "exact_calculation", "context_type", "context_state", "verification_state", "eligibility_state", "regulatory_use_state", "evidence_entries", "blocker", "privacy", "actions"], "Preview item");
    const item_id = nonEmpty(candidate.item_id, "Item ID"); if (itemIds.has(item_id)) fail("Item IDs must be unique"); itemIds.add(item_id);
    const item_kind = enumValue(candidate.item_kind, ITEM_KINDS, "item kind"); const result_state = candidate.result_state === null ? null : enumValue(candidate.result_state, PRODUCT_STATES, "product state");
    const comparison_scope = candidate.comparison_scope === null ? null : enumValue(candidate.comparison_scope, COMPARISON_SCOPES, "comparison scope");
    const context_state = candidate.context_state === null ? null : enumValue(candidate.context_state, CONTEXT_STATES, "context state"); const template_key = enumValue(candidate.template_key, TEMPLATE_KEYS, "template");
    if (!isRecord(candidate.template_values)) fail("Template values are malformed"); const template_values: Record<string, string> = {}; for (const [key, raw] of Object.entries(candidate.template_values)) template_values[key] = nonEmpty(raw, `Template value ${key}`);
    const requiredFields = templateFields(templates[template_key]); if (requiredFields.length !== Object.keys(template_values).length || requiredFields.some((field) => !(field in template_values))) fail("Template values do not match the selected template");
    const computedAnswer = renderTemplate(templates[template_key], template_values); if (candidate.answer !== computedAnswer) fail("Stored answer does not match the selected template");
    if (!Array.isArray(candidate.summary_entries)) fail("Item summary is malformed"); if (!Array.isArray(candidate.evidence_entries) || candidate.evidence_entries.length === 0) fail("Every rendered item requires meaningful evidence"); if (!Array.isArray(candidate.actions)) fail("Item actions are malformed");
    let blocker: Blocker | null = null; if (candidate.blocker !== null) { if (!isRecord(candidate.blocker)) fail("Blocker is malformed"); exactKeys(candidate.blocker, ["code", "missing", "why"], "Blocker"); blocker = { code: nonEmpty(candidate.blocker.code, "Blocker code"), missing: nonEmpty(candidate.blocker.missing, "Blocker missing evidence"), why: nonEmpty(candidate.blocker.why, "Blocker reason") }; }
    if (result_state === "NEEDS_EVIDENCE" && blocker === null) fail("Needs-evidence item is missing a blocker");
    if (item_kind === "CONTEXT" && (!candidate.context_type || context_state === null || !candidate.verification_state || !candidate.eligibility_state || !candidate.regulatory_use_state)) fail("Context item is missing context semantics");
    if (item_kind !== "CONTEXT" && (candidate.context_type !== null || context_state !== null || candidate.verification_state !== null || candidate.eligibility_state !== null || candidate.regulatory_use_state !== null)) fail("Non-context item contains context semantics");
    const contextTemplates: Partial<Record<ContextState, TemplateKey>> = { MAPPED_VERIFICATION_PENDING: "MAPPED_CONTEXT_PENDING", MAPPED_VERIFIED: "MAPPED_CONTEXT", NO_MAPPED_INTERSECTION: "NO_MAPPED_CONTEXT", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", NOT_EVALUATED: "NOT_EVALUATED" };
    if (item_kind === "CONTEXT" && contextTemplates[context_state!] !== template_key) fail("Context state and template do not match");
    if (item_kind === "FACT" && result_state !== null) fail("Fact item cannot carry a product result state"); if ((item_kind === "RULE" || item_kind === "COMPARISON") && result_state === null) fail("Rule or comparison item is missing a result state");
    if ((item_kind === "FACT" || item_kind === "CONTEXT") && comparison_scope !== null) fail("Fact or context item cannot carry a comparison scope");
    if ((item_kind === "RULE" || item_kind === "COMPARISON") && comparison_scope === null) fail("Rule or comparison item is missing a comparison scope");
    const item: FeasibilityItem = { item_id, item_kind, name: nonEmpty(candidate.name, "Item name"), rule_family: nonEmpty(candidate.rule_family, "Rule family"), section: enumValue(candidate.section, SECTIONS, "section"), result_state, state_label: nonEmpty(candidate.state_label, "State label"), summary_entries: candidate.summary_entries.map(validateSummary), comparison_scope, template_key, template_values, answer: computedAnswer, explanation: nonEmpty(candidate.explanation, "Item explanation"), display_requirement: nullableString(candidate.display_requirement, "Display requirement"), display_fact: nullableString(candidate.display_fact, "Display fact"), base_requirement: nullableString(candidate.base_requirement, "Base requirement"), derived_requirement: nullableString(candidate.derived_requirement, "Derived requirement"), exact_calculation: nullableString(candidate.exact_calculation, "Exact calculation"), context_type: nullableString(candidate.context_type, "Context type"), context_state, verification_state: nullableString(candidate.verification_state, "Verification state"), eligibility_state: nullableString(candidate.eligibility_state, "Eligibility state"), regulatory_use_state: nullableString(candidate.regulatory_use_state, "Regulatory-use state"), evidence_entries: candidate.evidence_entries.map(validateEvidence), blocker, privacy: enumValue(candidate.privacy, ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"] as const, "item privacy"), actions: candidate.actions.map(validateAction) };
    if (PROHIBITED_COPY.test(`${item.answer} ${item.explanation}`)) fail("Item contains prohibited product copy"); return item;
  });
  if (!Array.isArray(value.actions) || !Array.isArray(value.provenance)) fail("Preview actions or provenance are malformed"); const actions = value.actions.map(validateAction);
  const provenance = value.provenance.map((candidate): EvidenceSource => { if (!isRecord(candidate)) fail("Provenance is malformed"); exactKeys(candidate, ["artifact", "privacy"], "Provenance"); return { artifact: nonEmpty(candidate.artifact, "Provenance artifact"), privacy: enumValue(candidate.privacy, ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"] as const, "provenance privacy") }; });
  if (project_context && itemIds.has(project_context.target_id)) fail("Project context target must not collide with an item target");
  const payload: PreviewPayload = { contract_version: CONTRACT_VERSION, scope, privacy, subject, base_facts, project_context, overall_state, items, actions, provenance }; const serialized = JSON.stringify(payload);
  if (scope === "PUBLIC_PARCEL") {
    if (privacy !== "PUBLIC" || project_context !== null || PUBLIC_PRIVATE_MARKERS.test(serialized)) fail("Private evidence cannot render in public scope");
    if (items.some((item) => item.privacy !== "PUBLIC" || item.evidence_entries.some((entry) => entry.privacy !== "PUBLIC_AUTHORITY")) || provenance.some((entry) => entry.privacy !== "PUBLIC_AUTHORITY")) fail("Public preview contains private evidence");
  } else if (scope === "PRIVATE_PROJECT" && (privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" || project_context === null || items.some((item) => item.privacy !== "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"))) fail("Private preview is not fully contained");
  return payload;
}

function readSealedJson(filePath: string, expectedSha256: string): unknown { let bytes: Buffer; try { bytes = readFileSync(filePath); } catch { fail("Preview fixture cannot be read"); } if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) fail("Preview fixture seal does not match"); try { return JSON.parse(bytes.toString("utf8")); } catch { fail("Preview fixture JSON is malformed"); } }
export function normalizePreviewMode(value: string | string[] | undefined): PreviewMode { return value === "rm" || value === "private" || value === "blocked" ? value : "rs"; }
export function loadFeasibilityTemplates(root = process.cwd()): TemplateCatalog { return validateTemplateCatalog(readSealedJson(path.join(root, DATA_DIR, RENDERER_FIXTURE.file), RENDERER_FIXTURE.sha256)); }
export function loadFeasibilityPreview(mode: PreviewMode, root = process.cwd()): PreviewBundle { const templates = loadFeasibilityTemplates(root); const fixture = FIXTURES[mode]; return { payload: validateFeasibilityPreviewPayload(readSealedJson(path.join(root, DATA_DIR, fixture.file), fixture.sha256), templates), templates }; }
export const FEASIBILITY_PREVIEW_FIXTURES = FIXTURES;
