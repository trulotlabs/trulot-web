import "server-only";
import {
  parsePilotBatchJson,
  type ParsedPilotBatch,
} from "./batch-config";
import type { PilotLead } from "./schema";

export type PilotBatchResult =
  | ParsedPilotBatch
  | { ok: false; reason: "missing" | "invalid" };

export function loadPilotBatch(): PilotBatchResult {
  const raw = process.env.ELEVATE_PILOT_BATCH_JSON;
  if (!raw) return { ok: false, reason: "missing" };
  return parsePilotBatchJson(raw);
}

export function findPilotLead(leadId: string): PilotLead | null {
  const batch = loadPilotBatch();
  if (!batch.ok) return null;
  return batch.leads.find((lead) => lead.leadId === leadId) ?? null;
}
