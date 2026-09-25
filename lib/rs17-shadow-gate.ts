/** Server-only opt-in. Unknown environments fail closed; never use NEXT_PUBLIC. */
export type VerifiedStandardsMode = "local" | "staging";

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
