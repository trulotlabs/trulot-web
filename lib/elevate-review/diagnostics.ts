export const ELEVATE_NEUTRAL_ERROR_MESSAGE =
  "The private review service had a temporary problem. Your work is still saved.";

export const elevateDiagnosticCategories = [
  "provider_incomplete",
  "provider_error",
  "schema_validation_error",
  "internal_error",
] as const;

export type ElevateDiagnosticCategory =
  (typeof elevateDiagnosticCategories)[number];

export function redactElevateDiagnosticText(value: string) {
  return value
    .replace(
      /\/elevate\/interview\/[^/?#\s"'<>]+/gi,
      "/elevate/interview/[redacted]",
    )
    .replace(
      /elevate%2finterview%2f[^?&#\s"'<>]+/gi,
      "elevate%2Finterview%2F[redacted]",
    )
    .replace(
      /(\bx-elevate-interview-token\b\s*[:=]\s*)[^,;\s"'<>]+/gi,
      "$1[redacted]",
    );
}

export function categorizeElevateError(
  error: unknown,
): ElevateDiagnosticCategory {
  if (error instanceof Error && error.message === "IncompleteResponse") {
    return "provider_incomplete";
  }
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return "schema_validation_error";
  }
  if (
    error &&
    typeof error === "object" &&
    ("status" in error || error.constructor?.name === "APIError")
  ) {
    return "provider_error";
  }
  return "internal_error";
}

export function sanitizedElevateDiagnostic(error: unknown) {
  return { category: categorizeElevateError(error) };
}

export function neutralElevateErrorPayload() {
  return { error: ELEVATE_NEUTRAL_ERROR_MESSAGE };
}
