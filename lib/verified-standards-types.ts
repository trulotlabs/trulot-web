import type { TruthFact } from "./parcel-truth";

export type VerifiedStandardsJson = Record<string, unknown>;

export interface VerifiedStandardsContext {
  evaluation_date: string;
  coastal_context: "outside" | "inside" | "unknown";
  application_context?: "new_application" | "unknown" | "deemed_complete_before_effective";
  airport_context?: "outside_miramar_transition" | "unknown" | "inside_miramar_transition";
  lot_context?: "corner" | "non_corner" | "unknown";
}

export interface VerifiedStandardsParameter extends VerifiedStandardsJson {
  rule_id: string;
  zone_code: string;
  standard_type: string;
  family: string;
  review_state: "SOURCE_VERIFIED";
  safety_level: "DISPLAY_SAFE_PARAMETER";
  display_safe: true;
  parcel_application_safe: false;
  project_applicability_determined: false;
  compliance_determined: false;
  capacity_determined: false;
  expression: VerifiedStandardsJson;
  required_predicates: Array<{ id: string; state: "UNRESOLVED"; value: null }>;
  sealed_origin: "BASELINE_97" | "PACKET_17_116";
  sealed_record: VerifiedStandardsJson;
  sealed_record_sha256: string;
  rule_set_version: string;
  source_section: string;
  source_sha256: string;
  source_evidence: VerifiedStandardsJson;
  source_record: VerifiedStandardsJson;
  source: VerifiedStandardsJson;
  authority_metadata: VerifiedStandardsJson;
}

export interface VerifiedStandardsByZone {
  zoneCode: string;
  reason: string;
  parameters: Array<TruthFact<VerifiedStandardsParameter>>;
  state: "supported" | "unknown" | "unavailable";
}

export type VerifiedStandardsMappingState =
  | "SINGLE_ZONE"
  | "MULTI_ZONE"
  | "BOUNDARY_SLIVER"
  | "UNMAPPED"
  | "INDETERMINATE";

export interface VerifiedStandardsResult {
  parcelIntelligence: {
    truth: {
      parcel: { state: "supported" | "unavailable"; value: { apn: string } | null };
      baseZoning: {
        state: "supported" | "unknown" | "unavailable";
        value: { mappingState: VerifiedStandardsMappingState; zones: string[] } | null;
      };
    };
  };
  standards: VerifiedStandardsByZone[];
  membership: "EXPANDED_213";
  display_safe: true;
  parcel_application_safe: false;
  project_applicability_determined: false;
  display: {
    title: string;
    qualifier: string;
    zones: VerifiedStandardsByZone[];
  };
}
