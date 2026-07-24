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
  const supportedScope = lead.likelyScopes[0] ?? "right-of-way work";
  return {
    primaryContact: lead.primaryContact,
    backupContact: lead.backupContact,
    sources: lead.sources.slice(0, 3),
    caveats: [
      "Mock enrichment preserves the verified packet and does not perform public web search.",
      ...lead.risksAndCaveats.slice(0, 2),
    ],
    revisedCallOpener: `Hi, this is Cesar with Elevate. I’m reaching out regarding the active project at ${lead.address}. Has the ${supportedScope.toLowerCase()} package been assigned? Could you route me to the GC, project manager, or person handling that work?`,
    revisedDraftEmailSubject: lead.draftEmailSubject,
    revisedDraftEmailBody: `Hello,

I’m reaching out regarding the active project at ${lead.address}. The public permit record includes ${supportedScope.toLowerCase()}. Has that package been assigned? Could you route me to the GC, project manager, or person handling that work?

Thank you,
Cesar
Elevate`,
    verifiedAt: "2026-07-23",
  };
}
