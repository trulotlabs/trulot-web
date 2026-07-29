import { expect, test } from "@playwright/test";
import {
  neutralElevateErrorPayload,
  redactElevateDiagnosticText,
  sanitizedElevateDiagnostic,
} from "../../lib/elevate-review/diagnostics";

const fictionalToken = "fictional-private-token-123";
const fictionalPath = `/elevate/interview/${fictionalToken}`;

test("redacts literal, encoded, and header invite-token values", () => {
  const diagnostic = [
    `GET https://example.test${fictionalPath}?source=test`,
    `encoded=elevate%2Finterview%2F${fictionalToken}`,
    `x-elevate-interview-token: ${fictionalToken}`,
  ].join("\n");
  const redacted = redactElevateDiagnosticText(diagnostic);

  expect(redacted).not.toContain(fictionalToken);
  expect(redacted).toContain("/elevate/interview/[redacted]");
  expect(redacted).toContain("elevate%2Finterview%2F[redacted]");
  expect(redacted).toContain("x-elevate-interview-token: [redacted]");
});

test("returns sanitized diagnostic categories without error messages or URLs", () => {
  const diagnostic = sanitizedElevateDiagnostic(
    new Error(`Provider failed at ${fictionalPath}`),
  );
  const serialized = JSON.stringify(diagnostic);

  expect(diagnostic).toEqual({ category: "internal_error" });
  expect(serialized).not.toContain(fictionalToken);
  expect(serialized).not.toContain("/elevate/interview/");
  expect(serialized).not.toContain("Provider failed");
});

test("never returns a request URL or invite token in the client error payload", () => {
  const requestUrl = `https://example.test${fictionalPath}`;
  const serialized = JSON.stringify(neutralElevateErrorPayload());

  expect(serialized).not.toContain(requestUrl);
  expect(serialized).not.toContain(fictionalToken);
  expect(serialized).toBe(
    '{"error":"The private review service had a temporary problem. Your work is still saved."}',
  );
});
