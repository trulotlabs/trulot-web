import launchReceipt from "@/data/san-diego-phase-a-5000-launch-v0/launch-receipt.json";
import { SAN_DIEGO_PHASE_A_COHORT_SIZE } from "./san-diego-phase-a-membership";

export const SAN_DIEGO_PHASE_A_COHORT_VERSION = "sd-phase-a-5000-2026-10-27-v0" as const;
export { SAN_DIEGO_PHASE_A_COHORT_SIZE } from "./san-diego-phase-a-membership";
export const SAN_DIEGO_PHASE_A_LASTMOD = "2026-09-24" as const;

export type SanDiegoPhaseALaunchEntry = {
  apn: string;
  canonicalUrl: string;
  identityVersion: "parcel-identity-v2";
  zoningSnapshotVersion: "sd-public-zoning-2026-10-27-v0";
  cohortVersion: typeof SAN_DIEGO_PHASE_A_COHORT_VERSION;
  lastmod: typeof SAN_DIEGO_PHASE_A_LASTMOD;
  inclusionReason: string;
};

const entries = launchReceipt.entries as SanDiegoPhaseALaunchEntry[];
const apns = new Set(entries.map((entry) => entry.apn));

if (
  launchReceipt.rowCount !== SAN_DIEGO_PHASE_A_COHORT_SIZE
  || launchReceipt.cohortVersion !== SAN_DIEGO_PHASE_A_COHORT_VERSION
  || entries.length !== SAN_DIEGO_PHASE_A_COHORT_SIZE
  || apns.size !== SAN_DIEGO_PHASE_A_COHORT_SIZE
) {
  throw new Error("san_diego_phase_a_launch_receipt_invalid");
}

export function sanDiegoPhaseALaunchEntries(): readonly SanDiegoPhaseALaunchEntry[] {
  return entries;
}

