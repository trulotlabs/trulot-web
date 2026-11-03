import { cache } from "react";
import {
  getParcelPageV1CoreResult,
  type ParcelPageV1Result,
} from "./parcel-page-v1";

export type SanDiegoParcelCoreAvailabilityState =
  | "FOUND"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "NOT_FOUND";

export type SanDiegoParcelCoreAvailability = {
  state: SanDiegoParcelCoreAvailabilityState;
  result: ParcelPageV1Result;
};

export function classifySanDiegoParcelCoreResult(
  result: ParcelPageV1Result,
): SanDiegoParcelCoreAvailabilityState {
  if (result.status === "found" && result.data) return "FOUND";
  if (result.status === "partial" && result.data) return "PARTIAL";
  if (result.status === "not_found" || result.status === "invalid_request") return "NOT_FOUND";
  return "UNAVAILABLE";
}

export function coreAvailabilitySupportsIndexing(
  state: SanDiegoParcelCoreAvailabilityState,
): boolean {
  return state === "FOUND" || state === "PARTIAL";
}

async function loadSanDiegoParcelCoreAvailability(
  apn: string,
): Promise<SanDiegoParcelCoreAvailability> {
  const result = await getParcelPageV1CoreResult(apn);
  return {
    state: classifySanDiegoParcelCoreResult(result),
    result,
  };
}

// React cache provides request-scoped memoization for the App Router. Metadata
// and the page consume this same reader so one request has one core truth.
export const getSanDiegoParcelCoreAvailability = cache(
  loadSanDiegoParcelCoreAvailability,
);
