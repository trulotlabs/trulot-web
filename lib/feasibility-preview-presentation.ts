import type { FeasibilityItem, PreviewPayload, Section, SummaryGroup, TemplateCatalog } from "./bounded-feasibility-preview";

export const SECTION_ORDER: Section[] = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"];
export const SECTION_LABELS: Record<Section, string> = { BASE_FACTS: "Base facts", PARCEL_DIMENSIONS: "Parcel dimensions", SETBACKS: "Setbacks", HEIGHT_FAR: "Height and FAR", MAPPED_CONTEXT: "Mapped context", EVIDENCE_NEEDED: "Evidence needed" };
export const SUMMARY_ORDER: SummaryGroup[] = ["MEETS_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "MAPPED_CONTEXT", "NOT_APPLICABLE", "NOT_EVALUATED"];
export const SUMMARY_LABELS: Record<SummaryGroup, string> = { MEETS_BASE_RULE: "Meets base rule", CONDITIONAL: "Conditional", NEEDS_EVIDENCE: "Needs evidence", NOT_EVALUATED: "Not evaluated", MAPPED_CONTEXT: "Mapped context", NOT_APPLICABLE: "Not applicable" };
export const OVERALL_LABELS: Record<PreviewPayload["overall_state"], string> = { BASE_PARCEL_RULES_EVALUATED: "Base parcel rules evaluated", PARTIAL_EVALUATION: "Partial evaluation", MORE_EVIDENCE_NEEDED: "More evidence needed", OUTSIDE_CURRENT_SCOPE: "Outside current scope", SOURCE_UNAVAILABLE: "Source unavailable" };

export type SummarySection = { group: SummaryGroup; title: string; items: Array<{ text: string; target: string }> };

export function templateFields(template: string): string[] {
  return [...template.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]).filter((value, index, all) => all.indexOf(value) === index).sort();
}

export function renderTemplate(template: string, values: Record<string, string>): string {
  const fields = templateFields(template);
  const keys = Object.keys(values).sort();
  if (fields.length !== keys.length || fields.some((field, index) => field !== keys[index])) throw new Error("Template values do not match the selected template");
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key]);
}

export function renderItemAnswer(item: FeasibilityItem, templates: TemplateCatalog): string {
  const template = templates[item.template_key];
  if (!template) throw new Error(`Unknown template ${item.template_key}`);
  return renderTemplate(template, item.template_values);
}

export function buildSummary(payload: PreviewPayload): SummarySection[] {
  const entries = payload.items.flatMap((item) => item.summary_entries.map((entry) => ({ group: entry.group, text: entry.label, target: item.item_id })));
  if (payload.project_context) entries.push(...payload.project_context.summary_entries.map((entry) => ({ group: entry.group, text: entry.label, target: payload.project_context!.target_id })));
  return SUMMARY_ORDER.map((group) => ({
    group,
    title: SUMMARY_LABELS[group],
    items: entries.filter((entry) => entry.group === group).map(({ text, target }) => ({ text, target })),
  })).filter((section) => section.items.length > 0);
}

export function groupItems(items: FeasibilityItem[]): Map<Section, FeasibilityItem[]> {
  const groups = new Map<Section, FeasibilityItem[]>();
  for (const item of items) groups.set(item.section, [...(groups.get(item.section) ?? []), item]);
  return groups;
}

export function cardFactLabel(item: FeasibilityItem): string {
  if (item.item_kind === "CONTEXT") return "Mapped observation";
  if (item.item_kind === "COMPARISON" && item.comparison_scope !== "PARCEL_RULE") return "Project comparison";
  if (item.item_kind === "FACT") return "Identified fact";
  return "Parcel fact";
}

export function cardRequirementLabel(item: FeasibilityItem): string {
  if (item.item_kind === "CONTEXT") return "Context status";
  if (item.item_kind === "FACT") return "Fact source";
  return "Rule requirement";
}
