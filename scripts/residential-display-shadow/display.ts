import baselineApproved from "../../data/residential-standards-review/residential_standards_v2_integration_safe.json";
import proposed from "../../data/high-value-residential-review/proposed-safe-subset.json";
import authorityObservation from "../../data/high-value-residential-review/authority-observation.json";
import corpus from "../../data/zoning-standards-v2/rules.json";
import sources from "../../data/zoning-standards-v2/sources.json";
import type { ExpandedResidentialParameter, ExpandedResidentialRehearsalResult } from "../rs17-parameter-rehearsal/adapter";

type Json = Record<string, unknown>;
type Rule = ExpandedResidentialParameter & Record<string, unknown>;
const baseline = baselineApproved as unknown as Json[];
const promoted = (proposed as unknown as { new_display_safe_records: Json[] }).new_display_safe_records;
const rawById = new Map((corpus as unknown as Json[]).map(rule => [String(rule.rule_id), rule]));
const expectedById = new Map([...baseline, ...promoted].map(rule => [String(rule.rule_id), rule]));
const baselineIds = new Set(baseline.map(rule => String(rule.rule_id)));
const allFamilies = ["density", "lot_area", "lot_dimensions", "front_setback", "interior_side_setback", "height", "far", "lot_coverage"] as const;
type Family = typeof allFamilies[number];
const familyLabels: Record<Family, string> = {
  density: "Density basis", lot_area: "Minimum lot area", lot_dimensions: "Lot dimensions",
  front_setback: "Front setback", interior_side_setback: "Interior-side setback",
  height: "Height envelope", far: "Floor-area ratio", lot_coverage: "Conditional lot coverage",
};
const sections: Array<{ title: string; families: Family[] }> = [
  { title: "Lot / density", families: ["density", "lot_area", "lot_dimensions"] },
  { title: "Setbacks", families: ["front_setback", "interior_side_setback"] },
  { title: "Building envelope", families: ["height", "far", "lot_coverage"] },
];

export const coverageQualifier = "Only reviewed base-zone standards are shown. Additional rules may apply, and parcel-specific conditions remain unresolved. TruLot has not determined compliance or development capacity.";
export const residentialSource = "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf";

export interface ResidentialDisplayRow {
  family: Family; label: string; summary: string; condition: string;
  predicateNotes: string[]; rule: Rule;
}
export interface ResidentialDisplaySection { title: string; rows: ResidentialDisplayRow[] }
export interface ResidentialDisplayGroup {
  zone: string; message: string; sections: ResidentialDisplaySection[];
  presentFamilies: Family[]; unavailableFamilies: Family[];
}
export interface ResidentialDisplayModel {
  title: string; qualifier: string; project_applicability_determined: false;
  groups: ResidentialDisplayGroup[]; message: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const equal = (left: unknown, right: unknown) => canonical(left) === canonical(right);

function expectedForZone(zone: string): Json[] {
  return [...baseline, ...promoted].filter(rule => rule.zone_code === zone);
}

function expectedExpression(expected: Json): Json {
  if (!baselineIds.has(String(expected.rule_id))) return expected.expression as Json;
  return { kind: "scalar", value: expected.value, unit: expected.unit, operator: expected.operator,
    semantics: "Sealed base-zone table parameter; no parcel comparison performed." };
}

function expectedPredicates(expected: Json): Json[] {
  if (!baselineIds.has(String(expected.rule_id))) return expected.required_predicates as Json[];
  return [{ id: expected.standard_type === "corner_lot_width_min" ? "corner_lot_status" : "LEGAL_LOT_AND_PREMISES_GEOMETRY",
    state: "UNRESOLVED", value: null }];
}

function verified(value: Rule, zone: string): boolean {
  const expected = expectedById.get(value.rule_id);
  if (!expected || expected.zone_code !== zone) return false;
  const sourceRecord = baselineIds.has(value.rule_id) ? rawById.get(value.rule_id) : expected.source_record;
  const expectedFamily = baselineIds.has(value.rule_id) ? "lot_dimensions" : expected.family;
  const expectedSha = baselineIds.has(value.rule_id) ? expected.source_sha256
    : (authorityObservation as unknown as { sources: Record<string, { sha256: string }> }).sources[String((sourceRecord as Json).source_id)].sha256;
  return value.zone_code === zone && value.review_state === "SOURCE_VERIFIED" &&
    value.safety_level === "DISPLAY_SAFE_PARAMETER" && value.display_safe === true &&
    value.parcel_application_safe === false && value.project_applicability_determined === false &&
    value.compliance_determined === false && value.capacity_determined === false &&
    value.family === expectedFamily && value.sealed_origin === (baselineIds.has(value.rule_id) ? "BASELINE_97" : "PACKET_17_116") &&
    equal(value.sealed_record, expected) && /^[a-f0-9]{64}$/.test(value.sealed_record_sha256) &&
    equal(value.expression, expectedExpression(expected)) && equal(value.required_predicates, expectedPredicates(expected)) &&
    equal(value.source_record, sourceRecord) && value.source_sha256 === expectedSha &&
    equal(value.source, (sources as unknown as { sources: { residential: Json } }).sources.residential) &&
    equal(value.authority_metadata, authorityObservation);
}

function record(value: unknown): Json { return value && typeof value === "object" ? value as Json : {}; }
function number(value: unknown): number | null { return typeof value === "number" ? value : null; }
function scalar(value: unknown): string {
  const item = record(value), amount = number(item.value);
  return amount === null ? "an unresolved value" : `${amount.toLocaleString("en-US")} ${item.unit === "sq_ft" ? "sq ft" : item.unit === "ft" ? "ft" : String(item.unit ?? "")}`.trim();
}

function describe(rule: Rule): Pick<ResidentialDisplayRow, "label" | "summary" | "condition"> {
  const expression = record(rule.expression), domain = record(expression.domain_expression);
  switch (rule.family as Family) {
    case "lot_dimensions": {
      const labels: Record<string,string> = { lot_width_min: "Minimum lot width", corner_lot_width_min: "Minimum corner-lot width", lot_depth_min: "Minimum lot depth" };
      return { label: labels[rule.standard_type] ?? rule.standard_type, summary: scalar(expression),
        condition: rule.standard_type === "corner_lot_width_min" ? "Applies to the table's corner-lot branch; corner status is unresolved." : "Table value only; no parcel dimension or legal-lot finding." };
    }
    case "density": {
      if (expression.kind === "scalar") return { label: familyLabels.density,
        summary: "1 dwelling unit per legal lot (base-zone expression)",
        condition: "Legal-lot and use facts are unresolved. This expression is not a parcel unit calculation." };
      if (expression.kind === "conditional") return { label: familyLabels.density,
        summary: "Outside La Jolla, Pacific Beach, and Torrey Pines: lot area ÷ 1,000 sq ft per dwelling unit. Within those areas: 1 dwelling unit or 2 guest rooms per 1,500 sq ft of lot area.",
        condition: "Community plan area and every lot-area predicate are unresolved; neither alternative is selected or evaluated." };
      const denominator = record(expression.denominator);
      return { label: familyLabels.density,
        summary: `Lot area ÷ ${Number(denominator.value).toLocaleString("en-US")} sq ft per dwelling unit`,
        condition: "Documentary unbonused expression only. Source rounding permits a fraction of 0.5 or more to round up once; a multi-zone premises uses zone-specific areas before summing. No lot area, use, rounding, or zone-area calculation was performed." };
    }
    case "lot_area": return { label: familyLabels.lot_area, summary: scalar(expression),
      condition: `Base-zone minimum only. The existing-legal-lot exception remains unselected${rule.required_predicates.some(predicate => predicate.id === "ALLEY_SERVICE_AND_GEOMETRY") ? "; any qualifying alley credit also remains unselected" : ""}. No legal-lot, conformity, subdivision, or developability finding.` };
    case "front_setback": {
      const base = record(domain.base);
      return { label: familyLabels.front_setback, summary: `Table base: ${scalar(base)}`,
        condition: "Conditional: a cul-de-sac permission reduces the table requirement by 5 ft but never below 5 ft. A separate 6 ft steep-front permission requires at least half of the front 50 ft to have at least 25% gradient and the setback closest to street frontage. Neither permission is selected, combined, or applied." };
    }
    case "interior_side_setback": {
      const base = record(domain.base), width = record(domain.minimum_required_lot_width);
      return { label: familyLabels.interior_side_setback, summary: `Table base: ${scalar(base)}`,
        condition: `Conditional: below ${width.value} ft measured lot width, the narrow-lot requirement is 8% of measured width. An optional reallocation above 50 ft width must retain the table-role sum, with each interior side at least 4 ft and each street side at least 10 ft. No branch or election is selected.` };
    }
    case "height": return { label: familyLabels.height,
      summary: `${domain.angled_envelope_origin_at_applicable_setback_ft} ft angled-plane origin / ${domain.base_zone_maximum_structure_height_ft} ft base-zone maximum`,
      condition: "Compound 24/30 envelope retained: 45° inward plane below 75 ft measured width, 30° from 75–150 ft, and no width-based plane above 150 ft. Required-side yards are subject to the envelope; front/street-side yards are subject when maximum structure height exceeds 27 ft. Yard, grade, structure, and exception facts remain unresolved." };
    case "far": return { label: familyLabels.far, summary: `${domain.value} ratio (table parameter)`,
      condition: `Gross floor area of all buildings ÷ total premises area under ${domain.measurement_reference}. ${domain.garage_area_exclusion ? "The source's up-to-400-sq-ft garage-area exclusion is retained." : "No garage-area exclusion is added by this record."} If dedication under 142.0610 is required, the source uses pre-dedication property lines for this GFA area basis. No area, exclusion, dedication, or ratio was applied.` };
    case "lot_coverage": {
      const then = record(domain.then);
      return { label: familyLabels.lot_coverage,
        summary: `${then.value}% only when more than half the premises meets the complete steep-hillside definition`,
        condition: "Conditional and unresolved. Otherwise this provision specifies no limit; that is not equivalent to unrestricted coverage." };
    }
  }
}

function predicateNote(id: string): string {
  if (/LEGAL_LOT/.test(id)) return "Depends on legal-lot status and legally relevant premises geometry.";
  if (/COMMUNITY_PLAN/.test(id)) return "Depends on community plan area.";
  if (/CORNER/.test(id)) return "Depends on corner-lot status.";
  if (/SLOPE|GRADIENT|STEEP_HILLSIDE/.test(id)) return "Depends on lot slope and elevation facts.";
  if (/WIDTH/.test(id)) return "Depends on measured residential lot width.";
  if (/DEDICATION/.test(id)) return "Depends on required street or alley dedication.";
  if (/ALLEY|FRONT|SETBACK|YARD|PROPERTY_LINE/.test(id)) return "Depends on frontage, alley, and legal property-line conditions.";
  if (/LOT_AREA|PREMISES_AREA/.test(id)) return "Depends on legally relevant lot or premises area.";
  if (/FLOOR|GARAGE|COVERAGE|STRUCTURE|GRADE/.test(id)) return "Depends on project geometry and regulated-area measurements.";
  if (/USE_CLASS/.test(id)) return "Depends on the proposed development use class.";
  if (/MULTI_ZONE/.test(id)) return "Depends on legally relevant area within each zone.";
  return "Depends on unresolved parcel-specific or regulatory facts.";
}

function row(rule: Rule): ResidentialDisplayRow {
  const notes = [...new Set(rule.required_predicates.map(predicate => predicateNote(predicate.id)))];
  return { family: rule.family as Family, ...describe(rule), predicateNotes: notes, rule };
}

export function residentialPresentation(result: ExpandedResidentialRehearsalResult): ResidentialDisplayModel {
  const model: ResidentialDisplayModel = { title: "Verified base-zone standards",
    qualifier: coverageQualifier, project_applicability_determined: false, groups: [], message: "" };
  const { parcel, baseZoning } = result.parcelIntelligence.truth;
  if (result.membership !== "EXPANDED_213" || result.display_safe !== true || result.parcel_application_safe !== false ||
      result.project_applicability_determined !== false || parcel.state !== "supported" || !parcel.value ||
      baseZoning.state !== "supported" || ["UNMAPPED", "INDETERMINATE"].includes(baseZoning.value.mappingState)) {
    model.message = "Parcel identity or base zoning is unavailable or unresolved. Standards are not shown.";
    return model;
  }
  for (const zone of [...baseZoning.value.zones].sort()) {
    const group: ResidentialDisplayGroup = { zone, message: "", sections: [], presentFamilies: [], unavailableFamilies: [...allFamilies] };
    model.groups.push(group);
    const expected = expectedForZone(zone);
    if (!expected.length) { group.message = "Verified standards are not yet available for this zone."; continue; }
    const standards = result.standards.filter(item => item.zoneCode === zone);
    if (standards.length !== 1) { group.message = "Verified standard evidence is incomplete. Standards are not shown."; continue; }
    const catalogue = standards[0];
    if (catalogue.state === "unavailable") { group.message = "Source evidence is unavailable or requires renewed verification. Standards are not shown."; continue; }
    if (catalogue.state !== "supported") { group.message = "The approved outside-Coastal rule profile is unresolved. Standards are not shown."; continue; }
    if (!Array.isArray(catalogue.parameters) || catalogue.parameters.length !== expected.length ||
        new Set(catalogue.parameters.map(item => item?.value?.rule_id)).size !== expected.length ||
        catalogue.parameters.some(item => !item || item.state !== "supported" || item.sourceState !== "available" || !item.value || !verified(item.value as Rule, zone) ||
          !equal(item.provenance, { sourceId: "residential", datasetId: item.value.rule_set_version,
            sourceLabel: "San Diego Municipal Code residential base-zone table", publisher: "City of San Diego",
            sourceUrl: residentialSource, effectiveAt: null, retrievedAt: item.value.source.acquired_at,
            importedAt: null, viewCalculatedAt: null,
            methodology: `${item.value.rule_id}; sha256=${item.value.source_sha256}; sealed-expanded-213`,
            basis: "Display-safe source parameter; exact expression and unresolved conditions retained. Parcel application, compliance, and capacity have not been determined." }))) {
      group.message = "Verified standard evidence is incomplete. Standards are not shown."; continue;
    }
    const rows = catalogue.parameters.map(item => row(item.value as Rule));
    group.presentFamilies = allFamilies.filter(family => rows.some(item => item.family === family));
    group.unavailableFamilies = allFamilies.filter(family => !group.presentFamilies.includes(family));
    group.sections = sections.map(section => ({ title: section.title,
      rows: section.families.flatMap(family => rows.filter(item => item.family === family)) }))
      .filter(section => section.rows.length);
    group.message = `${group.presentFamilies.length} of ${allFamilies.length} verified families currently available for this zone. Other governing standards may still apply.`;
  }
  return model;
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
const summaryClass = "cursor-pointer rounded py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-800";
function page(rule: Rule): string { return String(rule.source_evidence.page_evidence ?? "residential").split(":")[1] ?? ""; }

export function renderResidentialDisplay(result: ExpandedResidentialRehearsalResult): string {
  const model = residentialPresentation(result);
  return `<section aria-labelledby="verified-parameters-heading" class="min-w-0 break-words">
    <h3 id="verified-parameters-heading" class="text-lg font-semibold">${model.title}</h3>
    <p class="my-3">${model.qualifier}</p>${model.message ? `<p>${escape(model.message)}</p>` : ""}
    ${model.groups.map((group,index) => `<article aria-labelledby="verified-zone-${index}" class="min-w-0 border-t border-amber-300 pt-4 mt-4">
      <h4 id="verified-zone-${index}" class="font-semibold">${escape(group.zone)}</h4><p class="text-sm">${escape(group.message)}</p>
      ${group.sections.map(section => `<section class="min-w-0 mt-4"><h5 class="font-medium">${section.title}</h5>
        <div>${section.rows.map(item => `<div class="min-w-0 border-b border-amber-200 py-3">
          <p class="font-medium">${item.label}</p><p class="font-semibold">${escape(item.summary)}</p>
          <p class="text-sm">${escape(item.condition)}</p>
          ${item.predicateNotes.length ? `<ul class="mt-1 list-disc pl-5 text-sm">${item.predicateNotes.map(note => `<li>${escape(note)}</li>`).join("")}</ul>` : ""}
          <details class="mt-1"><summary class="${summaryClass}">Conditions and source — ${item.label}</summary>
            <p class="text-sm">Display-safe parameter only. Parcel application, compliance, and capacity are undetermined.</p>
            <p class="text-sm">Evidence: Table ${escape(item.rule.source_evidence.table)}${page(item.rule) ? `, page ${escape(page(item.rule))}` : ""}. <a class="underline" href="${residentialSource}${page(item.rule) ? `#page=${escape(page(item.rule))}` : ""}">Read the City source</a></p>
            <p class="text-sm break-all">Rule: ${escape(item.rule.rule_id)}<br>Section: ${escape(item.rule.source_section)}<br>Required predicate IDs: ${escape(item.rule.required_predicates.map(predicate => predicate.id).join(", "))}<br>Sealed record SHA-256: ${escape(item.rule.sealed_record_sha256)}</p>
          </details>
        </div>`).join("")}</div></section>`).join("")}
    </article>`).join("")}</section>`.replace(/[ \t]+$/gm, "");
}
