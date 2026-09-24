// Offline only. No product runtime imports this composer; no measurement inputs.
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { z } from "zod";
import type { FactProvenance, TruthFact } from "../../lib/parcel-truth";
import { lookupParcelIntelligenceV2, type IntegratedResult } from "../zoning-serving-v2/adapter";

export interface ResolutionContext {
  evaluation_date: string;
  coastal_context: "outside" | "inside" | "unknown";
  application_context?: "new_application" | "unknown" | "deemed_complete_before_effective";
  airport_context?: "outside_miramar_transition" | "unknown" | "inside_miramar_transition";
  lot_context?: "corner" | "non_corner" | "unknown";
}
const parameterSchema = z.object({
  rule_id: z.string(), zone_code: z.literal("RS-1-7"),
  standard_type: z.enum(["lot_width_min", "corner_lot_width_min", "lot_depth_min"]),
  value: z.number(), unit: z.literal("ft"), conditions: z.array(z.string()),
  review_state: z.literal("SOURCE_VERIFIED"), scope: z.literal("BASE_TABLE_PARAMETERS_ONLY"),
  rule_set_version: z.string(), version_profile: z.string(), source_section: z.literal("131.0431"),
  source_sha256: z.string(), source_evidence: z.record(z.string(), z.unknown()),
  source: z.record(z.string(), z.unknown()), authority_metadata: z.record(z.string(), z.unknown()),
  approved_context: z.record(z.string(), z.unknown()), dependency_evidence: z.record(z.string(), z.unknown()),
  applicability_state: z.literal("CONDITIONAL_BASE_TABLE_PARAMETER"), actual_lot_context: z.string(),
  condition_branch_evaluated: z.string(), branch_is_parcel_fact: z.literal(false),
  project_applicability_determined: z.literal(false), unresolved_dependencies: z.array(z.string()),
}).passthrough();
export type Parameter = z.infer<typeof parameterSchema>;
export interface StandardsByZone {
  zoneCode: string;
  reason: string;
  parameters: Array<TruthFact<Parameter>>;
  state: "supported" | "unknown" | "unavailable";
}
export interface RehearsalResult {
  parcelIntelligence: IntegratedResult;
  standards: StandardsByZone[];
  project_applicability_determined: false;
  display: { title: string; qualifier: string; zones: StandardsByZone[] };
}
export interface AuthorityInput { observation: unknown; sourcePaths: Record<string, string> }

export function consumeParameters(zoneCode: string, context: ResolutionContext, authority: AuthorityInput,
  requestedParameters?: string[]): StandardsByZone {
  try {
    const output = execFileSync("python3", [path.join(__dirname, "gate.py")], {
      input: JSON.stringify({ context: { ...context, zone_code: zoneCode }, observation: authority.observation,
        source_paths: authority.sourcePaths, ...(requestedParameters ? { requested_parameters: requestedParameters } : {}) }),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, encoding: "utf8", maxBuffer: 2_000_000,
    });
    const result = z.object({ state: z.enum(["supported", "unknown", "unavailable"]), reason: z.string(),
      parameters: z.array(parameterSchema) }).parse(JSON.parse(output));
    const parameters: Array<TruthFact<Parameter>> = result.parameters.map(value => {
      const provenance: FactProvenance = {
        sourceId: "residential", datasetId: value.rule_set_version,
        sourceLabel: "San Diego Municipal Code residential base-zone table",
        publisher: "City of San Diego", sourceUrl: String(value.source.url), effectiveAt: null,
        retrievedAt: typeof value.source.acquired_at === "string" ? value.source.acquired_at : null,
        importedAt: null, viewCalculatedAt: null,
        methodology: `${value.rule_id}; sha256=${value.source_sha256}; ${value.version_profile}`,
        basis: "Source-verified base-zone parameter; conditions retained. Parcel-specific applicability/compliance has not been determined.",
      };
      return { state: "supported", sourceState: "available", derivation: "conditional", value, provenance };
    });
    return { zoneCode, state: result.state, reason: result.reason, parameters };
  } catch {
    return { zoneCode, state: "unavailable", reason: "evidence_bridge_unavailable", parameters: [] };
  }
}

export async function rehearseParcelParameters(input: string,
  parcelQuery: (apn: string) => Promise<unknown>, zoningQuery: (apn: string) => Promise<unknown>,
  context: ResolutionContext, authority: AuthorityInput, requestedParameters?: string[]): Promise<RehearsalResult> {
  const parcelIntelligence = await lookupParcelIntelligenceV2(input, parcelQuery, zoningQuery);
  const { parcel, baseZoning } = parcelIntelligence.truth;
  // Partial zoning must not silently become a supported single-zone assertion.
  const zones = parcel.state === "supported" && parcel.value && baseZoning.state === "supported"
    ? baseZoning.value.zones : [];
  const standards = zones.map(zone => consumeParameters(zone, context, authority, requestedParameters));
  return { parcelIntelligence, standards, project_applicability_determined: false,
    display: { title: "Base-zone parameters", zones: standards,
      qualifier: "These are source-verified base-zone parameters. Parcel-specific applicability/compliance has not been determined." } };
}
