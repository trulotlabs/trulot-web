// Local rehearsal composer; also used behind the hard-disabled runtime shadow gate.
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
const residentialParameterSchema = parameterSchema.extend({ zone_code: z.string(), source_section: z.string() });
export type ResidentialParameter = z.infer<typeof residentialParameterSchema>;
const unresolvedPredicateSchema = z.object({
  id: z.string(), state: z.literal("UNRESOLVED"), value: z.null(),
}).strict();
const expandedResidentialParameterSchema = z.object({
  rule_id: z.string(), zone_code: z.string(), standard_type: z.string(), family: z.string(),
  review_state: z.literal("SOURCE_VERIFIED"), safety_level: z.literal("DISPLAY_SAFE_PARAMETER"),
  display_safe: z.literal(true), parcel_application_safe: z.literal(false),
  project_applicability_determined: z.literal(false), compliance_determined: z.literal(false),
  capacity_determined: z.literal(false), expression: z.record(z.string(), z.unknown()),
  required_predicates: z.array(unresolvedPredicateSchema).min(1),
  sealed_origin: z.enum(["BASELINE_97", "PACKET_17_116"]),
  sealed_record: z.record(z.string(), z.unknown()), sealed_record_sha256: z.string(),
  rule_set_version: z.string(), source_section: z.string(), source_sha256: z.string(),
  source_evidence: z.record(z.string(), z.unknown()), source_record: z.record(z.string(), z.unknown()),
  source: z.record(z.string(), z.unknown()), authority_metadata: z.record(z.string(), z.unknown()),
}).passthrough();
export type ExpandedResidentialParameter = z.infer<typeof expandedResidentialParameterSchema>;
export interface ResidentialStandardsByZone {
  zoneCode: string;
  reason: string;
  parameters: Array<TruthFact<ResidentialParameter>>;
  state: "supported" | "unknown" | "unavailable";
}
export interface StandardsByZone extends ResidentialStandardsByZone { parameters: Array<TruthFact<Parameter>> }
export interface ResidentialRehearsalResult {
  parcelIntelligence: IntegratedResult;
  standards: ResidentialStandardsByZone[];
  project_applicability_determined: false;
  display: { title: string; qualifier: string; zones: ResidentialStandardsByZone[] };
}
export interface ExpandedResidentialStandardsByZone {
  zoneCode: string;
  reason: string;
  parameters: Array<TruthFact<ExpandedResidentialParameter>>;
  state: "supported" | "unknown" | "unavailable";
}
export interface ExpandedResidentialRehearsalResult {
  parcelIntelligence: IntegratedResult;
  standards: ExpandedResidentialStandardsByZone[];
  membership: "EXPANDED_213";
  display_safe: true;
  parcel_application_safe: false;
  project_applicability_determined: false;
  display: { title: string; qualifier: string; zones: ExpandedResidentialStandardsByZone[] };
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
  return consume(zoneCode, context, authority, false, requestedParameters) as StandardsByZone;
}

export function consumeResidentialParameters(zoneCode: string, context: ResolutionContext, authority: AuthorityInput,
  requestedRuleIds?: string[]): ResidentialStandardsByZone {
  return consume(zoneCode, context, authority, true, requestedRuleIds) as ResidentialStandardsByZone;
}

export function consumeExpandedResidentialParameters(zoneCode: string, context: ResolutionContext,
  authority: AuthorityInput, requestedRuleIds?: string[]): ExpandedResidentialStandardsByZone {
  return consume(zoneCode, context, authority, "expanded_residential", requestedRuleIds) as ExpandedResidentialStandardsByZone;
}

function consume(zoneCode: string, context: ResolutionContext, authority: AuthorityInput,
  mode: boolean | "expanded_residential", requested?: string[]): ResidentialStandardsByZone | ExpandedResidentialStandardsByZone {
  try {
    const residential = mode === true || mode === "expanded_residential";
    const output = execFileSync("python3", [path.resolve(process.cwd(), "scripts/rs17-parameter-rehearsal/gate.py")], {
      input: JSON.stringify({ context: { ...context, zone_code: zoneCode }, observation: authority.observation,
        source_paths: authority.sourcePaths, mode: mode === "expanded_residential" ? mode : residential ? "residential" : "rs17",
        ...(requested ? { [residential ? "requested_rule_ids" : "requested_parameters"]: requested } : {}) }),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, encoding: "utf8", maxBuffer: 2_000_000,
    });
    const schema = mode === "expanded_residential" ? expandedResidentialParameterSchema
      : residential ? residentialParameterSchema : parameterSchema;
    const result = z.object({ state: z.enum(["supported", "unknown", "unavailable"]), reason: z.string(),
      parameters: z.array(schema) }).passthrough().parse(JSON.parse(output));
    const parameters = result.parameters.map(value => {
      const provenance: FactProvenance = {
        sourceId: "residential", datasetId: value.rule_set_version,
        sourceLabel: "San Diego Municipal Code residential base-zone table",
        publisher: "City of San Diego", sourceUrl: String(value.source.url), effectiveAt: null,
        retrievedAt: typeof value.source.acquired_at === "string" ? value.source.acquired_at : null,
        importedAt: null, viewCalculatedAt: null,
        methodology: `${value.rule_id}; sha256=${value.source_sha256}; ${mode === "expanded_residential" ? "sealed-expanded-213" : "version_profile" in value ? value.version_profile : "sealed"}`,
        basis: mode === "expanded_residential"
          ? "Display-safe source parameter; exact expression and unresolved conditions retained. Parcel application, compliance, and capacity have not been determined."
          : "Source-verified base-zone parameter; conditions retained. Parcel-specific applicability/compliance has not been determined.",
      };
      return { state: "supported", sourceState: "available", derivation: "conditional", value, provenance };
    });
    return { zoneCode, state: result.state, reason: result.reason, parameters } as ResidentialStandardsByZone | ExpandedResidentialStandardsByZone;
  } catch {
    return { zoneCode, state: "unavailable", reason: "evidence_bridge_unavailable", parameters: [] };
  }
}

export async function rehearseExpandedResidentialParameters(input: string,
  parcelQuery: (apn: string) => Promise<unknown>, zoningQuery: (apn: string) => Promise<unknown>,
  context: ResolutionContext, authority: AuthorityInput, requestedRuleIds?: string[]): Promise<ExpandedResidentialRehearsalResult> {
  const parcelIntelligence = await lookupParcelIntelligenceV2(input, parcelQuery, zoningQuery);
  const { parcel, baseZoning } = parcelIntelligence.truth;
  const zones = parcel.state === "supported" && parcel.value && baseZoning.state === "supported"
    ? baseZoning.value.zones : [];
  const standards = zones.map(zone => consumeExpandedResidentialParameters(zone, context, authority, requestedRuleIds));
  return { parcelIntelligence, standards, membership: "EXPANDED_213", display_safe: true,
    parcel_application_safe: false, project_applicability_determined: false,
    display: { title: "Verified residential standards", zones: standards,
      qualifier: "Only verified display-safe standards are shown. Some governing standards remain unavailable, conditions require parcel-specific facts, and TruLot has not determined compliance or total development capacity." } };
}

export async function rehearseResidentialParameters(input: string,
  parcelQuery: (apn: string) => Promise<unknown>, zoningQuery: (apn: string) => Promise<unknown>,
  context: ResolutionContext, authority: AuthorityInput, requestedRuleIds?: string[]): Promise<ResidentialRehearsalResult> {
  const parcelIntelligence = await lookupParcelIntelligenceV2(input, parcelQuery, zoningQuery);
  const { parcel, baseZoning } = parcelIntelligence.truth;
  const zones = parcel.state === "supported" && parcel.value && baseZoning.state === "supported"
    ? baseZoning.value.zones : [];
  const standards = zones.map(zone => consumeResidentialParameters(zone, context, authority, requestedRuleIds));
  return { parcelIntelligence, standards, project_applicability_determined: false,
    display: { title: "Verified base-zone parameters", zones: standards,
      qualifier: "Only reviewed parameters are shown. Additional regulations may apply. Parcel-specific compliance has not been determined." } };
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
