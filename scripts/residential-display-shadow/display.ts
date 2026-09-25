import approved from "../../data/residential-standards-review/residential_standards_v2_integration_safe.json";
import corpus from "../../data/zoning-standards-v2/rules.json";
import sources from "../../data/zoning-standards-v2/sources.json";
import observation from "../../data/residential-standards-review/source-observation.json";
import authority from "../../data/residential-standards-review/authority-review.json";
import dependencies from "../../data/residential-standards-review/dimension-dependencies.json";
import { createHash } from "node:crypto";
import type { ResidentialRehearsalResult, ResidentialParameter } from "../rs17-parameter-rehearsal/adapter";

const labels = { lot_width_min: "Minimum lot width", corner_lot_width_min: "Minimum corner-lot width", lot_depth_min: "Minimum lot depth" } as const;
const order = Object.keys(labels);
export const coverageQualifier = "Only standards that passed source and applicability review are shown. This is not the complete set of zoning rules. Additional regulations may apply. Parcel-specific compliance has not been determined.";
export const residentialSource = "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf";
export interface ResidentialDisplayRow {
  label: string; value: number; unit: string; condition: string; rule: ResidentialParameter;
}
export interface ResidentialDisplayModel {
  title: string; qualifier: string; project_applicability_determined: false;
  groups: Array<{ zone: string; message: string; rows: ResidentialDisplayRow[] }>;
  message: string;
}
function verified(value: ResidentialParameter, zone: string): boolean {
  const expected = approved.find(r => r.rule_id === value.rule_id && r.zone_code === zone);
  // Corpus lookup enriches only an exact already-sealed ID; never selects eligibility.
  const raw = expected && corpus.find(r => r.rule_id === expected.rule_id);
  if (!expected || !raw) return false;
  const dependencySections = [...raw.unresolved_dependencies, "113.0237", "113.0243"];
  return value.zone_code === zone && value.review_state === "SOURCE_VERIFIED" &&
    value.project_applicability_determined === false && value.branch_is_parcel_fact === false &&
    value.scope === "BASE_TABLE_PARAMETERS_ONLY" && value.applicability_state === "CONDITIONAL_BASE_TABLE_PARAMETER" &&
    ["corner", "non_corner", "unknown"].includes(value.actual_lot_context) &&
    value.condition_branch_evaluated === (value.standard_type === "corner_lot_width_min" ? "corner" : "non_corner") &&
    equal(value.source, sources.sources.residential) && value.source_section === raw.source_section &&
    value.rule_set_version === raw.rule_set_version && equal(value.authority_metadata, observation) &&
    equal(value.approved_context, authority.applicability) && equal(value.unresolved_dependencies, dependencySections) &&
    equal(value.dependency_evidence, { reference: "data/residential-standards-review/dimension-dependencies.json",
      canonical_sha256: createHash("sha256").update(canonical(dependencies)).digest("hex"), sections: dependencySections, evaluated: false }) &&
    Object.keys(expected).every(
      key => equal(value[key], expected[key as keyof typeof expected])) &&
    expected.operator === "MIN";
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function residentialPresentation(result: ResidentialRehearsalResult): ResidentialDisplayModel {
  const model: ResidentialDisplayModel = { title: "Verified base-zone parameters", qualifier: coverageQualifier,
    project_applicability_determined: false, groups: [], message: "" };
  const { parcel, baseZoning } = result.parcelIntelligence.truth;
  if (result.project_applicability_determined !== false || parcel.state !== "supported" || !parcel.value ||
      baseZoning.state !== "supported" || ["UNMAPPED", "INDETERMINATE"].includes(baseZoning.value.mappingState)) {
    model.message = "Parcel identity or base zoning is unavailable or unresolved. Parameters have not been evaluated.";
    return model;
  }
  for (const zone of [...baseZoning.value.zones].sort()) {
    const group = { zone, message: "", rows: [] as ResidentialDisplayRow[] }; model.groups.push(group);
    const expected = approved.filter(r => r.zone_code === zone);
    if (!expected.length) { group.message = "Verified parameters are not yet available for this zone."; continue; }
    const standards = result.standards.filter(s => s.zoneCode === zone);
    if (standards.length !== 1) { group.message = "Verified parameter evidence is incomplete. Parameters are not shown."; continue; }
    const record = standards[0];
    if (record.state === "unavailable") { group.message = "Source evidence is unavailable or requires renewed verification. Parameters are not shown."; continue; }
    if (record.state !== "supported") { group.message = "The applicable rule version has not been resolved for this context. Parameters are not shown."; continue; }
    // Reject the entire group if anything crosses the sealed membership boundary.
    // No filtering of an untrusted or partial payload into an apparently safe card.
    if (!Array.isArray(record.parameters) || record.parameters.length !== expected.length || new Set(record.parameters.map(p => p?.value?.rule_id)).size !== expected.length ||
        record.parameters.some(p => !p || p.state !== "supported" || p.sourceState !== "available" || !p.value || !verified(p.value, zone) ||
          !equal(p.provenance, { sourceId: "residential", datasetId: p.value.rule_set_version,
            sourceLabel: "San Diego Municipal Code residential base-zone table", publisher: "City of San Diego",
            sourceUrl: residentialSource, effectiveAt: null, retrievedAt: p.value.source.acquired_at,
            importedAt: null, viewCalculatedAt: null,
            methodology: `${p.value.rule_id}; sha256=${p.value.source_sha256}; ${p.value.version_profile}`,
            basis: "Source-verified base-zone parameter; conditions retained. Parcel-specific applicability/compliance has not been determined." }))) {
      group.message = "Verified parameter evidence is incomplete. Parameters are not shown."; continue;
    }
    group.rows = record.parameters.map(p => {
      const rule = p.value!;
      return { label: labels[rule.standard_type], value: rule.value, unit: rule.unit,
        condition: rule.conditions.length ? "Corner-lot condition; no parcel determination" : "Base-zone table parameter", rule };
    }).sort((a,b) => order.indexOf(a.rule.standard_type) - order.indexOf(b.rule.standard_type));
    group.message = "Source verified · Conditional · Parcel applicability not yet determined";
  }
  return model;
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const summaryClass = "cursor-pointer rounded py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-800";
export function renderResidentialDisplay(result: ResidentialRehearsalResult): string {
  const model = residentialPresentation(result);
  return `<section aria-labelledby="verified-parameters-heading" class="min-w-0 break-words">
    <h3 id="verified-parameters-heading" class="text-lg font-semibold">${model.title}</h3>
    <p class="my-3">${model.qualifier}</p>${model.message ? `<p>${escape(model.message)}</p>` : ""}
    ${model.groups.map((g,index) => `<article aria-labelledby="verified-zone-${index}" class="min-w-0 border-t border-amber-300 pt-4 mt-4">
      <h4 id="verified-zone-${index}" class="font-semibold">${escape(g.zone)}</h4><p>${escape(g.message)}</p>
      ${g.rows.length ? `<h5 class="mt-3 font-medium">Lot dimensions — verified subset</h5>
        <dl>${g.rows.map(r => `<div class="grid min-w-0 gap-1 border-b border-amber-200 py-3 sm:grid-cols-2">
          <dt class="font-medium">${r.label}</dt><dd class="min-w-0"><span class="whitespace-nowrap font-semibold">${r.value} ${r.unit}</span><p class="text-sm">${r.condition}</p></dd>
        </div>`).join("")}</dl>
        <details class="mt-3"><summary class="${summaryClass}">Why TruLot says this — ${escape(g.zone)}</summary>
          <p>City of San Diego · Municipal Code Chapter 13, Article 1, Division 4.</p>
          <p>Reviewed for September 24, 2026; outside Coastal; new application; outside the Miramar transition exception. Lot context supplied: ${escape(g.rows[0].rule.actual_lot_context === "non_corner" ? "non-corner" : g.rows[0].rule.actual_lot_context)}. Conditional alternatives are retained; no parcel threshold is selected.</p>
          ${g.rows.map(r => `<p>${r.label}: Table ${escape(r.rule.source_evidence.table)}, page ${escape(String(r.rule.source_evidence.page_evidence).split(":")[1])}. <a class="underline" href="${residentialSource}#page=${escape(String(r.rule.source_evidence.page_evidence).split(":")[1])}">Read the City source</a></p>`).join("")}
          <details><summary class="${summaryClass}">Source evidence details — ${escape(g.zone)}</summary>
          ${g.rows.map(r => `<div class="min-w-0 break-all"><p>${r.label}<br>Evidence: ${escape(r.rule.rule_id)} · ${escape(r.rule.source_evidence.page_evidence)}<br>Recorded section: ${escape(r.rule.source_section)}<br>Version: ${escape(r.rule.version_profile)}<br>Acquired: ${escape(r.rule.source.acquired_at)}<br>SHA-256: ${escape(r.rule.source_sha256)}<br>Dependencies (not parcel-evaluated): ${escape(r.rule.unresolved_dependencies.join(", "))}<br>Evidence reference: ${escape(r.rule.dependency_evidence.reference)}</p></div>`).join("")}
          </details>
        </details>` : ""}
    </article>`).join("")}</section>`.replace(/[ \t]+$/gm, "");
}
