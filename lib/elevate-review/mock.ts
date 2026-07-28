import type { PilotLead } from "./schema";
import {
  buildLeadContactGrounding,
  buildLeadScopeGrounding,
  classifyLeadChatIntent,
} from "./chat-grounding";
import {
  deterministicEnrichmentFallback,
  finalizeOutreachCandidate,
} from "./outreach-reliability";

export function mockChatAnswer(lead: PilotLead, question: string) {
  const intent = classifyLeadChatIntent(question);
  const contact = buildLeadContactGrounding(lead);
  const scope = buildLeadScopeGrounding(lead);
  const name = lead.primaryContact.name ?? lead.primaryContact.company;
  const contactMethod = contact.contactMethods.find((method) =>
    question.toLowerCase().includes(method.type),
  );
  let answer: string;
  let sourceIndexes: number[] = [];

  switch (intent) {
    case "contact_broker":
      answer =
        contact.contactType === "broker"
          ? `Yes. ${name} at ${contact.company} is identified as a broker/contact associated with this opportunity. ${contact.verifiedBuyerStatus} Treat this person as a routing contact and ask who manages the ROW/frontage package and whether it has been assigned or awarded.`
          : `No broker status is verified in this packet. ${name} at ${contact.company} is classified as ${contact.contactType}; ${contact.verifiedBuyerStatus.toLowerCase()} Ask who manages the ROW/frontage package before assuming procurement authority.`;
      break;
    case "contact_decision_maker":
      answer = `${name} is ${contact.verifiedBuyerStatus.toLowerCase()} The packet classifies this route as ${contact.contactType} with ${contact.contactConfidence} contact confidence. Ask who controls the ROW/frontage package and whether it has been assigned or awarded.`;
      break;
    case "contact_relevance":
      answer = `We are contacting ${name} because ${contact.routingRationale.toLowerCase()}. ${contact.verifiedBuyerStatus} Use this as a routing step, not evidence that the contact controls procurement.`;
      break;
    case "contact_routing":
      answer = `Ask ${name} at ${contact.company} for the person managing the ROW/frontage package, then confirm whether it has been assigned or awarded. ${contact.verifiedBuyerStatus}`;
      break;
    case "contact_method_verification":
      answer = contactMethod
        ? `${contactMethod.verificationStatus} The packet lists it as ${contactMethod.label.toLowerCase()} for ${contact.company}, but no stronger ownership claim should be made.`
        : `The packet does not verify the requested contact method. Use only the published route in the contact packet and do not infer ownership.`;
      break;
    case "contact_call_opener":
      answer = `Use a concise routing opener: “${contact.suggestedCallOpener}” Do not imply that ${name} controls procurement unless the contact confirms it.`;
      break;
    case "lead_origin":
      answer = `${lead.address} became a lead because ${lead.trigger.toLowerCase()} The packet rates ROW scope confidence ${lead.rowScopeConfidence} and keeps award status unresolved.`;
      sourceIndexes = [0];
      break;
    case "scope_certainty": {
      const normalizedQuestion = question.toLowerCase();
      const questionTerms = normalizedQuestion
        .split(/\W+/)
        .filter(
          (word) =>
            word.length >= 3 &&
            !["the", "this", "that", "confirmed", "verified"].includes(word),
        );
      const matchingVerified = scope.verifiedFacts.find((item) =>
        questionTerms.some((word) => item.claim.toLowerCase().includes(word)),
      );
      const matchingUnresolved = scope.unresolvedItems.find((item) =>
        questionTerms.some((word) => item.claim.toLowerCase().includes(word)),
      );
      answer = matchingVerified
        ? `Yes, the packet explicitly verifies this point: ${matchingVerified.claim} It does not confirm any broader scope beyond that evidence.`
        : matchingUnresolved
          ? `No, this scope is not confirmed. ${matchingUnresolved.claim} Treat it as unresolved unless plans or a project contact verify it.`
          : `This scope is not confirmed by the packet. The verified facts do not establish it, so treat it as unresolved until plans or a project contact verify it.`;
      sourceIndexes = matchingVerified ? [0] : [];
      break;
    }
    case "scope_unresolved":
      answer =
        scope.unresolvedItems.length > 0
          ? `The unresolved scope is: ${scope.unresolvedItems.map((item) => item.claim).join(" ")} Do not present these items as confirmed until plans or a project contact verify them.`
          : `The packet does not enumerate a specific unresolved scope item. Treat final scope and award status as unresolved until plans or a project contact verify them.`;
      break;
    case "other":
      answer = `The packet does not directly answer that question. The verified facts, supported inferences, and unresolved items should be reviewed separately before taking action.`;
      break;
  }

  return {
    answer,
    sourceIndexes,
    caveats: lead.risksAndCaveats.slice(0, 2),
  };
}

export function mockEnrichment(lead: PilotLead) {
  const finalized = finalizeOutreachCandidate(
    lead,
    deterministicEnrichmentFallback(lead, "2026-07-23"),
  );
  if (!finalized.ok) {
    throw new Error(
      `Mock enrichment failed validation: ${finalized.categories.join(",")}`,
    );
  }
  return finalized.result;
}
