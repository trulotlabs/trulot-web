import launchApns from "@/data/san-diego-phase-a-5000-launch-v0/launch-apns.json";
import { normalizeApnDigits } from "./parcel-slug";

export const SAN_DIEGO_PHASE_A_COHORT_SIZE = 5_000;

const apns = new Set<string>(launchApns);

if (launchApns.length !== SAN_DIEGO_PHASE_A_COHORT_SIZE || apns.size !== SAN_DIEGO_PHASE_A_COHORT_SIZE) {
  throw new Error("san_diego_phase_a_launch_membership_invalid");
}

export function isSanDiegoPhaseALaunchMember(rawApn: string): boolean {
  return apns.has(normalizeApnDigits(rawApn));
}
