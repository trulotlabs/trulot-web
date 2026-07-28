import { createHash } from "node:crypto";
import {
  pilotBatchConfigSchema,
  pilotBatchSchema,
  type PilotBatch,
} from "./schema";

export type ParsedPilotBatch =
  | {
      ok: true;
      batchId: string;
      batchName: string;
      leads: PilotBatch;
    }
  | { ok: false; reason: "invalid" };

export function normalizeBatchName(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "Current batch";
}

function legacyBatchIdentity(leads: PilotBatch) {
  const digest = createHash("sha256")
    .update(leads.map((lead) => lead.leadId).join("\n"))
    .digest("hex")
    .slice(0, 12);
  return {
    batchId: `legacy-${digest}`,
    batchName: "Current batch",
  };
}

export function parsePilotBatchJson(raw: string): ParsedPilotBatch {
  try {
    const value: unknown = JSON.parse(raw);
    const configured = pilotBatchConfigSchema.safeParse(value);
    if (configured.success) {
      return {
        ok: true,
        batchId: configured.data.batchId,
        batchName: normalizeBatchName(configured.data.batchName),
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
