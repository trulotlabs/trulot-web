import releaseControlJson from "../data/runtime/verified-standards-release.json";
import { VERIFIED_STANDARDS_RELEASE_VERSION } from "./verified-standards-runtime-seal";

/** Server-only opt-in. Unknown environments fail closed; never use NEXT_PUBLIC. */
export type VerifiedStandardsMode = "local" | "staging";

export interface VerifiedStandardsReleaseControl {
  schemaVersion: "verified-standards-release-control/v1";
  state: "off" | "cohort";
  releaseVersion: string;
  cohortVersion: string | null;
}

export interface VerifiedStandardsProductionProof {
  bundleValid: boolean;
  cohortValid: boolean;
  cohortMember: boolean;
  supportedParcel: boolean;
  zoningSupported: boolean;
  applicabilityValid: boolean;
}

export const verifiedStandardsReleaseControl = releaseControlJson as VerifiedStandardsReleaseControl;

/**
 * Pure release-control rehearsal. The active gate below still denies every
 * production request until a separately reviewed cohort is committed and
 * wired in a later packet.
 */
export function productionVerifiedStandardsAuthorized(
  env: NodeJS.ProcessEnv,
  control: VerifiedStandardsReleaseControl,
  proof: VerifiedStandardsProductionProof,
): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production" &&
    control.schemaVersion === "verified-standards-release-control/v1" &&
    control.state === "cohort" && Boolean(control.cohortVersion) &&
    control.releaseVersion === VERIFIED_STANDARDS_RELEASE_VERSION &&
    Object.values(proof).every(value => value === true);
}

export function verifiedStandardsMode(env: NodeJS.ProcessEnv = process.env): VerifiedStandardsMode | null {
  // Deployment-tier denial is evaluated first. Preview builds also use
  // NODE_ENV=production, so VERCEL_ENV is the authoritative Vercel tier.
  if (env.VERCEL_ENV === "production" || env.TRULOT_DEPLOYMENT_ENV === "production") return null;

  const local = env.TRULOT_RS17_STANDARDS_SHADOW === "1" &&
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    !env.VERCEL && !env.CI && !env.VERCEL_ENV;
  if (local) return "local";

  const staging = env.TRULOT_VERIFIED_STANDARDS_RELEASE === "1" &&
    env.TRULOT_VERIFIED_STANDARDS_RELEASE_ENV === "staging" &&
    env.TRULOT_VERIFIED_STANDARDS_STAGING_APPROVED === "1" &&
    env.VERCEL === "1" && env.VERCEL_ENV === "preview";
  return staging ? "staging" : null;
}

export function verifiedStandardsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return verifiedStandardsMode(env) !== null;
}

// Compatibility export for the Packet 15–18 call sites and regression tests.
export const rs17ShadowEnabled = verifiedStandardsEnabled;
