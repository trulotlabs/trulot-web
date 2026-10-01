import type { ParcelLookupInputType, ParcelLookupState } from "./parcel-lookup-contract";

export const PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT = "parcel-lookup-production-v0-p44" as const;
export const PARCEL_LOOKUP_PRODUCTION_V0_MAX_RESULTS = 10;
export const PARCEL_LOOKUP_PRODUCTION_V0_MIN_QUERY_LENGTH = 2;

export type ParcelLookupOrientation = {
  kind: "POINT_ONLY";
  longitude: number;
  latitude: number;
  label: "Display orientation only";
};

export type ParcelLookupProductionCandidate = {
  address: string | null;
  displayAddress: string;
  apn: string;
  apnDisplay: string;
  jurisdiction: "SD";
  zip: string | null;
  orientation: ParcelLookupOrientation;
};

export type ParcelLookupProductionIdentity = ParcelLookupProductionCandidate & {
  approximateAreaSqFt: number;
  areaLabel: "Approximate geometry area";
};

export type ParcelLookupProductionRequest = {
  query: string;
  limit?: number;
};

export type ParcelLookupProductionV0 = {
  contractVersion: typeof PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT;
  inputType: ParcelLookupInputType;
  state: ParcelLookupState;
  normalizedQuery: string | null;
  candidates: ParcelLookupProductionCandidate[];
  selected: ParcelLookupProductionIdentity | null;
  returnedCount: number;
  hasMore: boolean;
  ambiguous: boolean;
};

export type ParcelLookupProductionError = {
  contractVersion: typeof PARCEL_LOOKUP_PRODUCTION_V0_CONTRACT;
  state: "INVALID_QUERY" | "SOURCE_UNAVAILABLE" | "TIMEOUT";
  message: string;
  candidates: [];
  selected: null;
};
