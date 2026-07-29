import type {
  ChatResponse,
  Contact,
  ContactClassification,
  PhoneVerification,
  PilotLead,
} from "./schema";

export const leadChatIntents = [
  "contact_broker",
  "contact_decision_maker",
  "contact_relevance",
  "contact_routing",
  "contact_method_verification",
  "contact_call_opener",
  "lead_origin",
  "scope_certainty",
  "scope_unresolved",
  "other",
] as const;

export type LeadChatIntent = (typeof leadChatIntents)[number];

export function classifyLeadChatIntent(question: string): LeadChatIntent {
  if (
    /what (?:should|do) i say|call opener|when i call|how should i (?:call|open)/i.test(
      question,
    )
  ) {
    return "contact_call_opener";
  }
  if (
    /(?:phone|number).*(?:verified|belong|ownership)|(?:verified|whose).*(?:phone|number)/i.test(
      question,
    )
  ) {
    return "contact_method_verification";
  }
  if (/\bbroker\b|\brealtor\b/i.test(question)) {
    return "contact_broker";
  }
  if (
    /decision[- ]?maker|construction buyer|procurement authority|controls? procurement|\bbuyer\b/i.test(
      question,
    )
  ) {
    return "contact_decision_maker";
  }
  if (
    /why (?:are|would|should) (?:we|i) contact|why (?:this|that) (?:person|contact)|why .*contacting/i.test(
      question,
    )
  ) {
    return "contact_relevance";
  }
  if (
    /who should i (?:ask|call|contact)|who (?:do|should) we ask|\broute\b|right person|who manages|who controls/i.test(
      question,
    )
  ) {
    return "contact_routing";
  }
  if (
    /why .* (?:lead|surfaced)|why did .* become|what triggered|why this project/i.test(
      question,
    )
  ) {
    return "lead_origin";
  }
  if (
    /(?:what|which).*(?:scope|work).*(?:unresolved|unknown|unclear)|(?:unresolved|unknown|unclear).*(?:scope|work)/i.test(
      question,
    )
  ) {
    return "scope_unresolved";
  }
  if (
    /(?:confirmed|verified|certain|explicit|inferred|assumed|required).*(?:scope|work|tap|connection|cut|trench|frontage|sidewalk|traffic)|(?:scope|work|tap|connection|cut|trench|frontage|sidewalk|traffic).*(?:confirmed|verified|certain|explicit|inferred|assumed|required)/i.test(
      question,
    )
  ) {
    return "scope_certainty";
  }
  if (
    /\b(contact|email|phone|number|person|company|owner|gc|general contractor)\b/i.test(
      question,
    )
  ) {
    return "contact_routing";
  }
  return "other";
}

function buyerStatus(
  classification: ContactClassification,
  type: string,
  role: string,
) {
  if (type === "broker") {
    return "Not a verified construction buyer; broker and routing contact only.";
  }
  if (/\bprobable buyer\b/i.test(role)) {
    return "Probable buyer only; construction procurement authority is not verified.";
  }
  switch (classification) {
    case "project_specific_decision_maker":
      return "Verified project-specific decision-maker in the packet; authority is limited to the stated role.";
    case "project_specific_party":
      return "Not a verified construction buyer; project-specific party only.";
    case "probable_routing_contact":
      return "Not a verified construction buyer; routing contact only.";
    case "general_company_contact":
      return "Not a verified construction buyer; general company route only.";
    case "site_occupant_only":
      return "Not a verified construction buyer; site-occupant route only.";
    case "unverified":
      return "Buyer status unresolved; do not imply procurement authority.";
  }
}

function classifyContactType(contact: Contact) {
  const role = contact.role.toLowerCase();
  if (/\bbroker\b|\brealtor\b/.test(role)) return "broker";
  if (
    /\bowner(?:[- ]side)?\b|\bdeveloper\b|\basset manager\b|\bproperty representative\b/.test(
      role,
    )
  ) {
    return "owner-side router";
  }
  if (/\bgc router\b|\bgeneral contractor router\b/.test(role)) {
    return "GC router";
  }
  switch (contact.classification) {
    case "project_specific_decision_maker":
      return "verified project-specific decision-maker";
    case "project_specific_party":
      return "project-specific party";
    case "probable_routing_contact":
      return "routing contact";
    case "general_company_contact":
      return "general company route";
    case "site_occupant_only":
      return "site-occupant route";
    case "unverified":
      return "unverified route";
  }
}

export const phoneVerificationDisplayLabels: Record<
  PhoneVerification,
  string
> = {
  verified_direct_business_line: "Verified direct business line.",
  verified_company_main_line:
    "Verified company main line, not a direct line.",
  broker_or_leasing_line: "Broker or leasing line.",
  general_switchboard: "General switchboard.",
  unverified: "Unverified.",
};

export function normalizePhoneVerification(
  label: string,
): PhoneVerification {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(?:broker|leasing)\b/.test(normalized)) {
    return "broker_or_leasing_line";
  }
  if (/\bswitchboard\b/.test(normalized)) {
    return "general_switchboard";
  }
  if (
    /\bverified\b/.test(normalized) &&
    /\bcompany\b.*\bmain\b|\bmain\b.*\b(?:company|line|phone)\b/.test(normalized)
  ) {
    return "verified_company_main_line";
  }
  if (/\bverified\b/.test(normalized) && /\bdirect\b/.test(normalized)) {
    return "verified_direct_business_line";
  }
  if (/\bgeneral\b.*\b(?:company|phone|line)\b/.test(normalized)) {
    return "general_switchboard";
  }
  return "unverified";
}

function contactMethodContext(contact: Contact) {
  return contact.methods.map((method) => {
    if (method.type === "phone") {
      const verificationClassification = normalizePhoneVerification(
        method.label,
      );
      return {
        type: method.type,
        label: method.label,
        value: method.value,
        verificationClassification,
        verificationStatus:
          phoneVerificationDisplayLabels[verificationClassification],
      };
    }
    return {
      type: method.type,
      label: method.label,
      value: method.value,
      verificationClassification: null,
      verificationStatus: /verified/i.test(method.label)
        ? "The packet explicitly labels this method as verified."
        : "The packet publishes this method under the stated label; do not infer ownership or verification beyond that label.",
    };
  });
}

function fallbackRoute(contact: Contact | null) {
  if (!contact) {
    return {
      available: false,
      guidance:
        "No fallback contact is named in the packet. Use the suggested routing request to ask for the owner representative, GC, project manager, estimator, or person controlling the ROW package.",
    };
  }
  const type = classifyContactType(contact);
  return {
    available: true,
    contactName: contact.name ?? "No named person in packet",
    company: contact.company,
    currentTitle: contact.role,
    contactType: type,
    buyerStatus: buyerStatus(contact.classification, type, contact.role),
    routingConfidence: contact.routingConfidence,
    verificationCautions: contact.caveats,
  };
}

export function buildLeadContactGrounding(lead: PilotLead) {
  const primaryType = classifyContactType(lead.primaryContact);
  return {
    contactName: lead.primaryContact.name ?? "No named person in packet",
    company: lead.primaryContact.company,
    currentTitle: lead.primaryContact.role,
    contactType: primaryType,
    contactConfidence: lead.contactConfidence,
    relationshipConfidence: lead.primaryContact.relationshipConfidence,
    routingConfidence: lead.primaryContact.routingConfidence,
    verifiedBuyerStatus: buyerStatus(
      lead.primaryContact.classification,
      primaryType,
      lead.primaryContact.role,
    ),
    routingRationale: `The packet connects this route to the opportunity through the stated role: ${lead.primaryContact.role}`,
    contactMethods: contactMethodContext(lead.primaryContact),
    fallbackRoute: fallbackRoute(lead.backupContact),
    verificationCautions: lead.primaryContact.caveats,
    suggestedCallOpener: lead.suggestedCallOpener,
  };
}

export function buildLeadScopeGrounding(lead: PilotLead) {
  return {
    rowRelevance: lead.rowRelevance,
    rowScopeConfidence: lead.rowScopeConfidence,
    listedLikelyScopes: lead.likelyScopes,
    verifiedFacts: lead.evidence
      .filter((item) => item.kind === "verified_fact")
      .map(({ claim, basis, confidence }) => ({ claim, basis, confidence })),
    supportedInferences: lead.evidence
      .filter((item) => item.kind === "supported_inference")
      .map(({ claim, basis, confidence }) => ({ claim, basis, confidence })),
    unresolvedItems: lead.evidence
      .filter((item) => item.kind === "unresolved")
      .map(({ claim, basis, confidence }) => ({ claim, basis, confidence })),
    cautions: lead.risksAndCaveats,
  };
}

export function buildPhoneVerificationAnswer(
  lead: PilotLead,
): ChatResponse {
  const method = lead.primaryContact.methods.find(
    (candidate) => candidate.type === "phone",
  );
  if (!method) {
    return {
      answer:
        "No verified phone number is stored for this contact. Use only the published contact route and do not infer a direct line.",
      sourceIndexes: [],
      caveats: lead.primaryContact.caveats.slice(0, 2),
    };
  }

  const classification = normalizePhoneVerification(method.label);
  const display = phoneVerificationDisplayLabels[classification];
  const contactName = lead.primaryContact.name;
  const nextAction = contactName
    ? `Ask for ${contactName} by name or for the person managing the civil/ROW package.`
    : "Ask for the person managing the civil/ROW package.";
  const answer =
    classification === "verified_direct_business_line" ||
    classification === "verified_company_main_line"
      ? `Yes. ${display} ${nextAction}`
      : classification === "unverified"
        ? `No. ${display} Do not treat it as a direct or verified business line. ${nextAction}`
        : `${display} It is not a verified direct line to a construction buyer. ${nextAction}`;

  return {
    answer,
    sourceIndexes: [],
    caveats: lead.primaryContact.caveats.slice(0, 2),
  };
}

export function isContactIntent(intent: LeadChatIntent) {
  return intent.startsWith("contact_");
}
