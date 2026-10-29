import { createHash, timingSafeEqual } from "node:crypto";

export function sanDiegoPilotEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.TRULOT_SD_FEASIBILITY_PILOT === "1" && Boolean(environment.TRULOT_SD_FEASIBILITY_PILOT_TOKEN);
}

export function authorizeSanDiegoPilot(candidate: string | null | undefined, environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.TRULOT_SD_FEASIBILITY_PILOT_TOKEN;
  if (!sanDiegoPilotEnabled(environment) || !configured || !candidate) return false;
  const expected = Buffer.from(configured);const provided = Buffer.from(candidate);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function sanDiegoPilotOrganizationId(token: string) {
  return `pilot-${createHash("sha256").update(`san-diego-private-pilot:${token}`).digest("hex").slice(0,24)}`;
}
