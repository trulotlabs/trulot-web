import "server-only";
import { pilotBatchSchema, type PilotBatch, type PilotLead } from "./schema";

export type PilotBatchResult =
  | { ok: true; leads: PilotBatch }
  | { ok: false; reason: "missing" | "invalid" };

export function loadPilotBatch(): PilotBatchResult {
  const raw = process.env.ELEVATE_PILOT_BATCH_JSON;
  if (!raw) return { ok: false, reason: "missing" };

  try {
    const parsed = pilotBatchSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? { ok: true, leads: parsed.data }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
export function findPilotLead(leadId: string): PilotLead | null {
  const batch = loadPilotBatch();
  if (!batch.ok) return null;
  return batch.leads.find((lead) => lead.leadId === leadId) ?? null;
}
