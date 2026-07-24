import "server-only";
import { createHash } from "node:crypto";
import { isValidElevateToken } from "@/lib/elevate-interview/security";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

export function authorizeElevateRequest(request: Request) {
  return isValidElevateToken(
    request.headers.get("x-elevate-interview-token"),
  );
}
export function isElevateRateLimited(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || "private-pilot";
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

export function elevateSafetyIdentifier(token: string) {
  return createHash("sha256")
    .update(`elevate-opportunity-review:${token}`)
    .digest("hex")
    .slice(0, 64);
}

export function neutralApiError(status = 502) {
  return Response.json(
    { error: "The private review service had a temporary problem. Your work is still saved." },
    { status },
  );
}
