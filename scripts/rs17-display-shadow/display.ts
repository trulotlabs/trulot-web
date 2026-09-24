// Fixture-only presentation. No production route imports this module.
import approved from "../../data/residential-standards-review/residential_standards_v2_integration_safe.json";
import type { RehearsalResult } from "../rs17-parameter-rehearsal/adapter";

const labels = {
  lot_width_min: "Minimum lot width",
  corner_lot_width_min: "Minimum corner-lot width",
  lot_depth_min: "Minimum lot depth",
} as const;
export const qualifier = "These are source-verified base-zone parameters. TruLot has not determined whether this parcel satisfies them or whether additional regulations apply.";
export interface DisplayRow {
  label: string; value: number; unit: "ft"; condition: string;
  sourceStatus: "Source verified"; reviewState: "SOURCE_VERIFIED";
  applicabilityState: "Parcel applicability not yet determined";
  project_applicability_determined: false;
  citation: { publisher: string; url: string; section: string; table: string; page: number;
    evidenceReference: string; ruleReference: string; version: string; context: string;
    acquiredAt: string | null; artifactHash: string; dependencyReference: string };
}
export interface DisplayModel {
  title: "Base zoning standards"; qualifier: string;
  project_applicability_determined: false;
  groups: Array<{ zoneCode: string; message: string; rows: DisplayRow[] }>;
  message: string;
}

export function presentation(result: RehearsalResult): DisplayModel {
  const model: DisplayModel = { title: "Base zoning standards", qualifier,
    project_applicability_determined: false, groups: [], message: "" };
  const truth = result.parcelIntelligence.truth;
  if (truth.parcel.state !== "supported" || !truth.parcel.value) {
    model.message = "Parcel identity is unavailable. Base-zone parameters have not been evaluated."; return model;
  }
  const zoning = truth.baseZoning;
  if (zoning.state !== "supported" || !zoning.value ||
      ["UNMAPPED", "INDETERMINATE"].includes(zoning.value.mappingState)) {
    model.message = zoning.value?.mappingState === "UNMAPPED"
      ? "No base-zone assignment is available from the selected zoning source. Parameters have not been evaluated."
      : "Base zoning is unavailable or unresolved. Parameters have not been evaluated.";
    return model;
  }
  for (const zoneCode of [...zoning.value.zones].sort()) {
    const group = { zoneCode, message: "", rows: [] as DisplayRow[] };
    model.groups.push(group);
    const record = result.standards.find(z => z.zoneCode === zoneCode);
    if (zoneCode !== "RS-1-7") { group.message = "Parameters for this zone are not included in this shadow preview."; continue; }
    if (record?.state === "unavailable") { group.message = "Source evidence is unavailable or requires renewed verification. Parameters are not shown."; continue; }
    if (record?.state !== "supported" || result.project_applicability_determined !== false) {
      group.message = "The applicable rule version has not been resolved for this context. Parameters are not shown."; continue;
    }
    for (const key of Object.keys(labels) as Array<keyof typeof labels>) {
      const candidates = record.parameters.filter(f => f.value?.standard_type === key);
      if (candidates.length !== 1) continue;
      const fact = candidates[0], value = fact.value;
      const expected = approved.find(r => r.zone_code === "RS-1-7" && r.standard_type === key);
      // Display allowlist/identity check, not another operative-rules resolver.
      if (!value || !expected || fact.state !== "supported" || fact.sourceState !== "available" ||
          value.rule_id !== expected.rule_id || value.zone_code !== zoneCode || value.value !== expected.value ||
          value.unit !== "ft" || expected.operator !== "MIN" || value.source_sha256 !== expected.source_sha256 ||
          value.version_profile !== expected.version_profile || value.source_section !== "131.0431" ||
          value.source.url !== "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf" ||
          value.review_state !== "SOURCE_VERIFIED" || value.project_applicability_determined !== false ||
          value.branch_is_parcel_fact !== false || value.scope !== "BASE_TABLE_PARAMETERS_ONLY" ||
          JSON.stringify(value.conditions) !== JSON.stringify(expected.conditions) ||
          JSON.stringify(value.source_evidence) !== JSON.stringify(expected.source_evidence)) continue;
      group.rows.push({ label: labels[key], value: value.value, unit: "ft",
        condition: key === "corner_lot_width_min" ? "Corner-lot condition; no parcel determination" : "Base-zone table parameter",
        sourceStatus: "Source verified", reviewState: "SOURCE_VERIFIED",
        applicabilityState: "Parcel applicability not yet determined", project_applicability_determined: false,
        citation: { publisher: "City of San Diego", url: String(value.source.url), section: value.source_section,
          table: String(value.source_evidence.table), page: 34, evidenceReference: String(value.source_evidence.page_evidence),
          ruleReference: value.rule_id, version: value.version_profile,
          context: `Reviewed for September 24, 2026; outside Coastal; new application; outside the Miramar transition exception. Lot context supplied: ${value.actual_lot_context === "unknown" ? "unknown" : value.actual_lot_context === "corner" ? "corner" : "non-corner"}. Both width parameters are retained; no parcel threshold selected.`,
          acquiredAt: fact.provenance.retrievedAt, artifactHash: value.source_sha256,
          dependencyReference: String(value.dependency_evidence.reference) } });
    }
    // A partial or altered approved set must not become an apparently complete card.
    if (group.rows.length !== 3) { group.rows = []; group.message = "Verified parameter evidence is incomplete. Parameters are not shown."; }
    else group.message = "Source verified · Conditional · Parcel applicability not yet determined";
  }
  return model;
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderDisplay(result: RehearsalResult): string {
  const model = presentation(result);
  return `<section id="base-zoning-standards" aria-labelledby="standards-heading" class="standards-card">
    <h2 id="standards-heading">${model.title}</h2><p class="qualifier">${model.groups.some(g => g.rows.length) ? qualifier : "Parcel applicability has not been determined."}</p>
    ${model.message ? `<p>${escape(model.message)}</p>` : ""}
    ${model.groups.map(g => `<article aria-label="${escape(g.zoneCode)} base-zone parameters">
      <h3>${escape(g.zoneCode)}</h3><p class="state">${escape(g.message)}</p>
      ${g.rows.length ? `<table><caption class="sr-only">${escape(g.zoneCode)} source-verified base-zone parameters</caption><thead><tr><th scope="col">Standard</th><th scope="col">Value</th><th scope="col">Condition</th></tr></thead><tbody>
      ${g.rows.map(r => `<tr><th scope="row">${r.label}</th><td>${r.value} ${r.unit}</td><td>${r.condition}</td></tr>`).join("")}</tbody></table>
      <details><summary>Why TruLot says this — ${escape(g.zoneCode)}</summary>
      <p>City of San Diego · Municipal Code §${escape(g.rows[0].citation.section)} · Table ${escape(g.rows[0].citation.table)}, page 34.</p>
      <p>${escape(g.rows[0].citation.context)}</p><p>Additional regulations may apply. Legal-lot status and parcel measurements have not been determined.</p>
      <a href="${escape(g.rows[0].citation.url)}#page=34">Read the City source</a>
      <details><summary>Source evidence details — ${escape(g.zoneCode)}</summary>
      ${g.rows.map(r => `<p><strong>${r.label}</strong><br>Evidence: ${escape(r.citation.evidenceReference)} · ${escape(r.citation.ruleReference)}<br>Version: ${escape(r.citation.version)}<br>Acquired: ${escape(r.citation.acquiredAt)}<br>SHA-256: <code>${escape(r.citation.artifactHash)}</code><br>Dependencies: ${escape(r.citation.dependencyReference)}</p>`).join("")}</details></details>` : ""}
    </article>`).join("")}</section>`.replace(/[ \t]+$/gm, "");
}
