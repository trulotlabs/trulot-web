export type OverlayResponse =
  | { status: "found"; data: { tpa: boolean; ctcac: boolean; sda: boolean } }
  | { status: "source_unavailable"; data: null };

/**
 * The RPC is one source: reject the entire response if any membership is absent
 * or malformed. Never salvage a valid half or coerce untrusted values. SDA is
 * only an observation here; the caller must still apply reconciliation policy.
 * Extra metadata is allowed, but all three membership fields must be own values.
 */
export function parseOverlayResponse(payload: unknown): OverlayResponse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { status: "source_unavailable", data: null };
  }
  const row = payload as Record<string, unknown>;
  for (const key of ["tpa", "ctcac", "sda"]) {
    if (!Object.prototype.hasOwnProperty.call(row, key) || typeof row[key] !== "boolean") {
      return { status: "source_unavailable", data: null };
    }
  }
  return {
    status: "found",
    data: { tpa: row.tpa as boolean, ctcac: row.ctcac as boolean, sda: row.sda as boolean },
  };
}
