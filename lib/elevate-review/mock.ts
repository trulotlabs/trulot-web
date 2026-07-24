import type { PilotLead } from "./schema";

export function mockChatAnswer(lead: PilotLead, question: string) {
  const isContactQuestion = /who|contact|call|email/i.test(question);
  return {
    answer: isContactQuestion
      ? `${lead.primaryContact.company} is the currently verified route for ${lead.address}. The packet classifies it as ${lead.primaryContact.classification.replaceAll("_", " ")} with ${lead.primaryContact.routingConfidence} routing confidence. Ask whether the ROW package has been assigned and request the project manager or estimator if this contact is not the buyer.`
      : `${lead.address} surfaced because ${lead.trigger.toLowerCase()} The packet rates ROW involvement ${lead.rowScopeConfidence} confidence and describes ${lead.likelyScopes.slice(0, 3).join(", ")}. ${lead.risksAndCaveats[0] ?? "Procurement status remains unverified."}`,
    sourceIndexes: [0],
    caveats: lead.risksAndCaveats.slice(0, 2),
  };
}
export function mockEnrichment(lead: PilotLead) {
  return {
    primaryContact: lead.primaryContact,
    backupContact: lead.backupContact,
    sources: lead.sources.slice(0, 3),
    caveats: [
      "Mock enrichment preserves the verified packet and does not perform public web search.",
      ...lead.risksAndCaveats.slice(0, 2),
    ],
    revisedCallOpener: lead.suggestedCallOpener,
    revisedDraftEmailSubject: lead.draftEmailSubject,
    revisedDraftEmailBody: lead.draftEmailBody,
    verifiedAt: "2026-07-23",
  };
}
