import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { ParcelPageV1Result } from "./parcel-page-v1";
import { rs17ShadowEnabled } from "./rs17-shadow-gate";
import { rehearseParcelParameters } from "../scripts/rs17-parameter-rehearsal/adapter";
import { renderDisplay } from "../scripts/rs17-display-shadow/display";

// Explicit local inputs only. No lookup, inferred context, persisted user flag,
// precomputed parameter values, or fallback standards are accepted here.
const inputSchema = z.object({
  apn: z.string().regex(/^\d{10}$/),
  parcelResponse: z.unknown(), zoningResponse: z.unknown(),
  context: z.object({
    evaluation_date: z.string(),
    coastal_context: z.enum(["outside", "inside", "unknown"]),
    application_context: z.enum(["new_application", "unknown", "deemed_complete_before_effective"]).optional(),
    airport_context: z.enum(["outside_miramar_transition", "unknown", "inside_miramar_transition"]).optional(),
    lot_context: z.enum(["corner", "non_corner", "unknown"]).optional(),
  }).strict(),
  authority: z.object({ observation: z.unknown(), sourcePaths: z.record(z.string(), z.string().refine(isAbsolute)) }).strict(),
}).strict();

export async function renderRs17RuntimeShadow(result: ParcelPageV1Result): Promise<string | null> {
  // Defense in depth: callers cannot bypass the gate by importing this module.
  if (!rs17ShadowEnabled()) return null;
  const parcel = result.truth.parcel;
  if (!result.data || parcel.state !== "supported" || !parcel.value ||
      result.data.zoning.baseCode.value !== "RS-1-7") return null;
  const filename = process.env.TRULOT_RS17_SHADOW_INPUT;
  if (!filename || !isAbsolute(filename)) return null;
  try {
    const input = inputSchema.parse(JSON.parse(readFileSync(filename, "utf8")));
    if (input.apn !== parcel.value.apn.replace(/\D/g, "")) return null;
    const safe = await rehearseParcelParameters(input.apn,
      async () => input.parcelResponse, async () => input.zoningResponse,
      input.context, input.authority);
    const zoning = safe.parcelIntelligence.truth.baseZoning;
    // Canonical V1 has only a base-code fact, not V2 split-zone truth. Do not
    // silently replace its identity or project a local split onto this page.
    if (zoning.state !== "supported" || zoning.value.zones.length !== 1 ||
        zoning.value.zones[0] !== result.data.zoning.baseCode.value) return null;
    return renderDisplay(safe);
  } catch {
    // Optional preview must never break or alter the existing page on failure.
    return null;
  }
}
