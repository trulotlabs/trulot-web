import type { EligibilityState, EvidenceEntry, FeasibilityItem, PreviewPayload, ProjectStatusCode, ProjectTopic, RegulatoryUseState, Section, SummaryGroup, TemplateCatalog, VerificationState } from "./bounded-feasibility-preview";

export const SECTION_ORDER: Section[] = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"];
export const SECTION_LABELS: Record<Section, string> = { BASE_FACTS: "Base facts", PARCEL_DIMENSIONS: "Parcel dimensions", SETBACKS: "Setbacks", HEIGHT_FAR: "Height and FAR", MAPPED_CONTEXT: "Mapped context", EVIDENCE_NEEDED: "Evidence needed" };
export const SUMMARY_ORDER: SummaryGroup[] = ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "MAPPED_CONTEXT", "NOT_APPLICABLE", "NOT_EVALUATED", "SOURCE_UNAVAILABLE", "OUTSIDE_CURRENT_SCOPE"];
export const SUMMARY_LABELS: Record<SummaryGroup, string> = { MEETS_BASE_RULE: "Meets base rule", DOES_NOT_MEET_BASE_RULE: "Does not meet base rule", CONDITIONAL: "Conditional", NEEDS_EVIDENCE: "Needs evidence", NOT_EVALUATED: "Not evaluated", MAPPED_CONTEXT: "Mapped context", NOT_APPLICABLE: "Not applicable", SOURCE_UNAVAILABLE: "Source unavailable", OUTSIDE_CURRENT_SCOPE: "Outside current scope" };
export const OVERALL_LABELS: Record<PreviewPayload["overall_state"], string> = { BASE_PARCEL_RULES_EVALUATED: "Base parcel rules evaluated", PARTIAL_EVALUATION: "Partial evaluation", MORE_EVIDENCE_NEEDED: "More evidence needed", OUTSIDE_CURRENT_SCOPE: "Outside current scope", SOURCE_UNAVAILABLE: "Source unavailable" };
export const VERIFICATION_LABELS: Record<VerificationState, string> = { PENDING: "Pending", VERIFIED: "Verified", NO_INTERSECTION: "No intersection", SOURCE_UNAVAILABLE: "Source unavailable", NOT_EVALUATED: "Not evaluated" };
export const ELIGIBILITY_LABELS: Record<EligibilityState, string> = { NOT_EVALUATED: "Not evaluated", ELIGIBLE: "Eligible", NOT_ELIGIBLE: "Not eligible", SOURCE_UNAVAILABLE: "Source unavailable" };
export const REGULATORY_USE_LABELS: Record<RegulatoryUseState, string> = { NOT_USED_PENDING_VERIFICATION: "Not used pending verification", CONTEXT_ONLY: "Context only", APPLIES: "Applies", DOES_NOT_APPLY: "Does not apply", NOT_EVALUATED: "Not evaluated", SOURCE_UNAVAILABLE: "Source unavailable" };
export const PROJECT_TOPIC_LABELS: Record<ProjectTopic, string> = { HEIGHT: "Height", FAR: "FAR", DEVELOPMENT_CAPACITY: "Development capacity", WHOLE_PROJECT_COMPLIANCE: "Whole-project compliance" };

export type SummarySection = { group: SummaryGroup; title: string; items: Array<{ text: string; target: string }> };

export function templateFields(template: string): string[] { return [...template.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]).filter((value, index, all) => all.indexOf(value) === index).sort(); }
export function renderTemplate(template: string, values: Record<string, string>): string { const fields = templateFields(template); const keys = Object.keys(values).sort(); if (fields.length !== keys.length || fields.some((field, index) => field !== keys[index])) throw new Error("Template values do not match the selected template"); return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key]); }
export function renderItemAnswer(item: FeasibilityItem, templates: TemplateCatalog): string { const template = templates[item.template_key]; if (!template) throw new Error(`Unknown template ${item.template_key}`); return renderTemplate(template, item.template_values); }

export function deriveStateLabel(item: FeasibilityItem): string {
  if (item.item_kind === "FACT") return "Identified fact";
  if (item.item_kind === "CONTEXT") return item.context_state === "MAPPED_VERIFICATION_PENDING" ? "Mapped · verification pending" : item.context_state === "MAPPED_VERIFIED" ? "Mapped context" : item.context_state === "NO_MAPPED_INTERSECTION" ? "No mapped intersection" : item.context_state === "SOURCE_UNAVAILABLE" ? "Source unavailable" : "Not evaluated";
  const labels = { MEETS_BASE_RULE: item.comparison_scope === "THIS_DIMENSION_ONLY" ? "Meets selected rule · this dimension" : "Meets base rule", DOES_NOT_MEET_BASE_RULE: "Does not meet base rule", CONDITIONAL: "Conditional", NEEDS_EVIDENCE: item.comparison_scope === "PROJECT_SPECIFIC" ? "Project comparison · needs evidence" : "Needs evidence", NOT_APPLICABLE: "Not applicable", NOT_EVALUATED: "Not evaluated", SOURCE_UNAVAILABLE: "Source unavailable", OUTSIDE_CURRENT_SCOPE: "Outside current scope" } as const;
  return labels[item.result_state!];
}

function summaryForItem(item: FeasibilityItem): { group: SummaryGroup; text: string; target: string } | null {
  if (item.item_kind === "FACT") return null;
  if (item.item_kind === "CONTEXT") { const group: SummaryGroup = item.context_state === "SOURCE_UNAVAILABLE" ? "SOURCE_UNAVAILABLE" : item.context_state === "NOT_EVALUATED" ? "NOT_EVALUATED" : "MAPPED_CONTEXT"; return { group, text: item.name, target: item.item_id }; }
  if (!item.result_state) return null;
  return { group: item.result_state, text: item.name, target: item.item_id };
}
export function buildSummary(payload: PreviewPayload): SummarySection[] {
  const entries = payload.items.map(summaryForItem).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (payload.project_context) for (const topic of payload.project_context.not_evaluated) entries.push({ group: "NOT_EVALUATED", text: PROJECT_TOPIC_LABELS[topic], target: payload.project_context.target_id });
  return SUMMARY_ORDER.map((group) => ({ group, title: SUMMARY_LABELS[group], items: entries.filter((entry) => entry.group === group).map(({ text, target }) => ({ text, target })) })).filter((section) => section.items.length > 0);
}
export function groupItems(items: FeasibilityItem[]): Map<Section, FeasibilityItem[]> { const groups = new Map<Section, FeasibilityItem[]>(); for (const item of items) groups.set(item.section, [...(groups.get(item.section) ?? []), item]); return groups; }
export function cardFactLabel(item: FeasibilityItem): string { if (item.item_kind === "CONTEXT") return "Mapped observation"; if (item.item_kind === "COMPARISON" && item.comparison_scope !== "PARCEL_RULE") return "Project comparison"; if (item.item_kind === "FACT") return "Identified fact"; return "Parcel fact"; }
export function cardRequirementLabel(item: FeasibilityItem): string { if (item.item_kind === "CONTEXT") return "Context status"; if (item.item_kind === "FACT") return "Fact source"; return "Rule requirement"; }
export function projectStatusLabel(code: ProjectStatusCode, labels: Record<ProjectStatusCode, string>): string { return labels[code]; }
export function formatApplicationDate(value: string | null): string { if (!value) return "Application date unavailable"; const parsed = new Date(`${value}T00:00:00Z`); return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed); }
export function evidenceSourceDate(entry: EvidenceEntry): string | null { if (entry.source_date) return entry.source_date; return ["PUBLIC_AUTHORITY", "PUBLIC_MAPPING", "PUBLIC_CODE", "RULE_VERSION", "MAPPING_OBSERVATION"].includes(entry.type) ? "Source date unavailable" : null; }
