import type { PilotLead } from "./schema";
import {
  buildLeadContactGrounding,
  buildLeadScopeGrounding,
  classifyLeadChatIntent,
} from "./chat-grounding";
import {
  outreachModeForLead,
  outreachModeGuidance,
} from "./outreach-style";

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

function mockOutreachVariant(lead: PilotLead) {
  return [...lead.leadId].reduce((sum, character) => {
    return sum + character.charCodeAt(0);
  }, 0) % 3;
}

function mockOutreachBody(lead: PilotLead) {
  const mode = outreachModeForLead(lead);
  const scopes = lead.likelyScopes.slice(0, 2);
  const scopeText = scopes
    .map((scope) => scope.toLowerCase())
    .join(" and ");
  const projectSignal = `The available project record references ${scopeText}, while final scope and award status remain unconfirmed.`;
  const variant = mockOutreachVariant(lead);

  if (mode === "warm_opportunity") {
    const openers = [
      `Hello,\n\nI wanted to reach out regarding the project at ${lead.address}.`,
      `Hello,\n\nI’m reaching out about the work planned at ${lead.address}.`,
      `Hello,\n\nI’d welcome the opportunity to discuss the project at ${lead.address}.`,
    ];
    const closers = [
      "Please send over the plans when you have a chance. Thank you, and I look forward to hearing from you.",
      "If the package is still being coordinated, I’d appreciate the opportunity to take a look. Thank you for your time.",
      "I’d be glad to discuss schedule and scope after reviewing the plans. Thank you, and I look forward to connecting.",
    ];
    return `${openers[variant]} ${projectSignal} I work directly with Elevate’s field team on civil and right-of-way construction, including frontage restoration and traffic-control coordination. Our crews are accustomed to coordinating access, restoration, and traffic impacts around active sites. Has the civil/ROW package been assigned? I’d appreciate the opportunity to review the plans, confirm the work that is actually required, and provide practical pricing. ${closers[variant]}`;
  }

  const openers = [
    `Hello,\n\nI wanted to reach out regarding the project at ${lead.address}.`,
    `Hello,\n\nI’m reaching out about the planned work at ${lead.address}.`,
    `Hello,\n\nI’d like to ask about the project at ${lead.address}.`,
  ];
  const routingRequests = [
    "If you’re not handling it, would you mind pointing me to the GC, project manager, or estimator who is?",
    "If another team owns that work, I’d appreciate being routed to the project manager or estimator handling it.",
    "If this belongs with someone else, would you mind pointing me in the right direction?",
  ];
  return `${openers[variant]} ${projectSignal} I’m a hands-on contractor with Elevate, and our team handles civil and right-of-way construction. Has the civil/ROW package been assigned? I can review the plans and provide pricing for the supported work. ${routingRequests[variant]} Thank you for your help.`;
}

export function mockEnrichment(lead: PilotLead) {
  const supportedScope = lead.likelyScopes[0] ?? "right-of-way work";
  const mode = outreachModeForLead(lead);
  const guidance = outreachModeGuidance(mode);
  const revisedDraftEmailBody = mockOutreachBody(lead);
  const wordCount = revisedDraftEmailBody.trim().split(/\s+/).length;
  if (
    wordCount < guidance.minimumWords ||
    wordCount > guidance.maximumWords
  ) {
    throw new Error(`Mock ${guidance.label} does not meet its word range.`);
  }
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
    revisedDraftEmailBody,
    verifiedAt: "2026-07-23",
  };
}
