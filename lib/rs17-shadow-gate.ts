/** Server-only opt-in. Unknown environments fail closed; never use NEXT_PUBLIC. */
export function rs17ShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRULOT_RS17_STANDARDS_SHADOW === "1" &&
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    !env.VERCEL && !env.CI;
}
