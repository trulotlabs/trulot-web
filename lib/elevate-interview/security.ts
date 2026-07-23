import { timingSafeEqual } from "node:crypto";

export function isValidElevateToken(candidate: string | null | undefined) {
  const configured = process.env.ELEVATE_INTERVIEW_TOKEN;
  if (!configured || !candidate) return false;

  const configuredBuffer = Buffer.from(configured);
  const candidateBuffer = Buffer.from(candidate);
  if (configuredBuffer.length !== candidateBuffer.length) return false;

  return timingSafeEqual(configuredBuffer, candidateBuffer);
}
