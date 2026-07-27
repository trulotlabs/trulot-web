import "server-only";
import { createHash } from "node:crypto";
import {
  pilotBatchConfigSchema,
  pilotBatchSchema,
  type PilotBatch,
  type PilotLead,
} from "./schema";

export type PilotBatchResult =
  | {
      ok: true;
      batchId: string;
      batchName: string;
      leads: PilotBatch;
    }
  | { ok: false; reason: "missing" | "invalid" };

function legacyBatchIdentity(leads: PilotBatch) {
  const digest = createHash("sha256")
    .update(leads.map((lead) => lead.leadId).join("\n"))
    .digest("hex")
    .slice(0, 12);
  return {
    batchId: `legacy-${digest}`,
    batchName: "Current opportunity batch",
  };
}

export function loadPilotBatch(): PilotBatchResult {
  const raw = process.env.ELEVATE_PILOT_BATCH_JSON;
  if (!raw) return { ok: false, reason: "missing" };

  try {
    const value: unknown = JSON.parse(raw);
    const configured = pilotBatchConfigSchema.safeParse(value);
    if (configured.success) {
      return {
        ok: true,
        batchId: configured.data.batchId,
        batchName: configured.data.batchName,
        leads: configured.data.leads,
      };
    }
    const legacy = pilotBatchSchema.safeParse(value);
    if (!legacy.success) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      ...legacyBatchIdentity(legacy.data),
      leads: legacy.data,
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
export function findPilotLead(leadId: string): PilotLead | null {
  const batch = loadPilotBatch();
  if (!batch.ok) return null;
  return batch.leads.find((lead) => lead.leadId === leadId) ?? null;
}
