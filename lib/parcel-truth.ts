// Shared vocabulary for the scoped Parcel V1 adapters. Compatibility lookup
// outcomes are retained separately from source availability and fact truth.
export type SourceState = "available" | "partial" | "source_unavailable" | "not_evaluated";
export type DerivationClass = "recorded" | "deterministic_derived" | "inferred" | "conditional";

export interface FactProvenance {
  sourceId: string;
  datasetId: string | null;
  sourceLabel: string | null;
  publisher: string | null;
  sourceUrl: string | null;
  effectiveAt: string | null;
  retrievedAt: string | null;
  importedAt: string | null;
  viewCalculatedAt: string | null;
  methodology: string | null;
  basis: string;
}

export type TruthFact<T> = {
  provenance: FactProvenance;
  derivation: DerivationClass;
} & (
  | { state: "supported"; value: T; sourceState: "available" }
  | { state: "partial"; value: T | null; sourceState: "partial" }
  | { state: "unknown"; value: null; sourceState: SourceState }
  | { state: "not_applicable"; value: null; sourceState: "available" }
  | { state: "unavailable"; value: null; sourceState: "source_unavailable" | "not_evaluated" }
);

export type CanonicalResultState =
  | "found"
  | "not_found"
  | "source_unavailable"
  | "partial"
  | "invalid_request";

export type SafeSourceErrorCode =
  | "query_failed"
  | "missing_relation"
  | "permission_denied"
  | "timeout"
  | "schema_mismatch"
  | "missing_input";

export interface SourceStatus {
  status: CanonicalResultState;
  sourceState: SourceState;
  freshness: string | null;
  safeErrorCode: SafeSourceErrorCode | null;
  publicMessage: string | null;
}

