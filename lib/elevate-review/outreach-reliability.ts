import {
  enrichmentModelResultSchema,
  enrichmentResultSchema,
  type BuyerRouterStatus,
  type ContactClassification,
  type EnrichmentResult,
  type PilotLead,
} from "./schema";
import {
  outreachModeForLead,
  outreachModeGuidance,
  type OutreachMode,
} from "./outreach-style";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const SIGNATURE_PATTERN =
  /\n\s*(?:thank you,?\s*\n)?\s*cesar(?:\s+hernandez)?\b/i;

export const outreachValidationCategories = [
  "response_incomplete",
  "schema_invalid",
  "subject_missing",
  "subject_too_short",
  "body_missing",
  "body_too_short",
  "body_too_long",
  "body_fragment_or_truncated",
  "project_reference_missing",
  "scope_signals_missing",
  "assignment_question_missing",
  "plans_offer_missing",
  "pricing_offer_missing",
  "routing_request_missing",
  "signature_present",
  "certainty_safeguard_missing",
  "unsupported_scope_certainty",
  "unsupported_package_availability",
  "unsupported_buyer_authority",
  "raw_json_present",
] as const;
export type OutreachValidationCategory =
  (typeof outreachValidationCategories)[number];

export type OutreachValidationResult =
  | { ok: true; body: string; wordCount: number }
  | {
      ok: false;
      body: string;
      wordCount: number;
      categories: OutreachValidationCategory[];
    };

export type OutreachResolution =
  | {
      ok: true;
      result: EnrichmentResult;
      strategy: "initial" | "repair" | "fallback";
      repairedCategories: OutreachValidationCategory[];
    }
  | {
      ok: false;
      categories: OutreachValidationCategory[];
    };

type GenerateAttempt = (input: {
  repairCategories: OutreachValidationCategory[] | null;
}) => Promise<unknown>;

type FallbackOptions = {
  trimOptionalCapability: boolean;
};

type FallbackFactory = (
  lead: PilotLead,
  options?: FallbackOptions,
) => unknown;

export const OUTREACH_FAILURE_MESSAGE =
  "Draft generation failed. Please retry.";

export function buildOutreachRepairInput(
  categories: OutreachValidationCategory[] | null,
) {
  if (!categories) {
    return "Find the best currently public project contact for this lead and return only schema-supported facts with sources.";
  }
  return `Repair the draft for these validation categories only:
${categories.map((category) => `- ${category}`).join("\n")}
Return the corrected schema result.`;
}

function uniqueCategories(categories: OutreachValidationCategory[]) {
  return [...new Set(categories)];
}

function wordCount(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function meaningfulWords(value: string) {
  return value
    .toLowerCase()
    .replace(/right[-\s]of[-\s]way/g, "row")
    .replace(/[^a-z0-9/]+/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        ![
          "and",
          "the",
          "for",
          "with",
          "work",
          "construction",
          "coordination",
        ].includes(word),
    );
}

function scopeSignalMatches(body: string, scope: string) {
  const bodyWords = new Set(meaningfulWords(body));
  const scopeWords = meaningfulWords(scope).slice(0, 4);
  const requiredMatches = Math.min(2, scopeWords.length);
  return (
    requiredMatches > 0 &&
    scopeWords.filter((word) => bodyWords.has(word)).length >= requiredMatches
  );
}

export function sanitizeElevateEmailBody(value: string) {
  const signatureIndex = value.search(SIGNATURE_PATTERN);
  return (signatureIndex >= 0 ? value.slice(0, signatureIndex) : value)
    .replace(EMAIL_PATTERN, "")
    .replace(PHONE_PATTERN, "")
    .replace(/\s*[•|]\s*\(?optional\)?/gi, "")
    .trim()
    .slice(0, 4000);
}

export function hasExplicitRoutingRequest(body: string) {
  const action =
    /\b(?:rout(?:e|ed|ing)\s+me|point(?:ing)?\s+me|connect\s+me|direct\s+me|who\s+(?:is|would be)\s+managing|who\s+manages)\b/i;
  const target =
    /\b(?:project manager|estimator|owner representative|construction manager|person (?:managing|who manages|responsible for)|team (?:handling|managing))\b/i;
  return body
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => action.test(sentence) && target.test(sentence));
}

function buyerRouterStatusForClassification(
  lead: PilotLead,
  classification: ContactClassification,
): BuyerRouterStatus {
  if (
    classification === "project_specific_decision_maker" &&
    lead.contactConfidence === "high"
  ) {
    return "verified_construction_buyer";
  }
  if (classification === "project_specific_decision_maker") {
    return "probable_buyer";
  }
  if (classification === "general_company_contact") {
    return "general_company_route";
  }
  if (
    classification === "probable_routing_contact" ||
    classification === "project_specific_party"
  ) {
    return "routing_contact";
  }
  return "unverified";
}

export function buyerRouterStatusForLead(
  lead: PilotLead,
): BuyerRouterStatus {
  return buyerRouterStatusForClassification(
    lead,
    lead.primaryContact.classification,
  );
}

export function scopeCertaintySafeguardsForLead(lead: PilotLead) {
  const safeguards = [
    "Package assignment and award status remain unresolved unless a cited source states otherwise.",
  ];
  if (lead.evidence.some((item) => item.kind === "supported_inference")) {
    safeguards.push(
      "Supported inferences must remain qualified as possible or likely, not confirmed scope.",
    );
  }
  if (lead.evidence.some((item) => item.kind === "unresolved")) {
    safeguards.push(
      "Unresolved scope must be confirmed from plans or a project contact before pricing.",
    );
  }
  if (buyerRouterStatusForLead(lead) !== "verified_construction_buyer") {
    safeguards.push(
      "The recipient is a routing path, not a verified construction buyer.",
    );
  }
  return safeguards;
}

export function validateOutreachDraft(
  lead: PilotLead,
  subject: string,
  rawBody: string,
): OutreachValidationResult {
  const body = sanitizeElevateEmailBody(rawBody);
  const count = wordCount(body);
  const mode = outreachModeForLead(lead);
  const guidance = outreachModeGuidance(mode);
  const categories: OutreachValidationCategory[] = [];

  if (!subject.trim()) categories.push("subject_missing");
  if (subject.trim() && subject.trim().length < 5) {
    categories.push("subject_too_short");
  }
  if (!body) categories.push("body_missing");
  if (count < guidance.minimumWords) categories.push("body_too_short");
  if (count > guidance.maximumWords) categories.push("body_too_long");
  if (
    body &&
    (!/[.!?]["”']?$/.test(body) ||
      body.split(/[.!?]+/).filter((sentence) => sentence.trim()).length < 4)
  ) {
    categories.push("body_fragment_or_truncated");
  }
  if (
    !body.toLowerCase().includes(lead.address.toLowerCase()) &&
    !lead.projectIdentifiers.some((identifier) =>
      body.toLowerCase().includes(identifier.toLowerCase()),
    )
  ) {
    categories.push("project_reference_missing");
  }
  const requiredScopeSignals = Math.min(2, lead.likelyScopes.length);
  const matchedScopeSignals = lead.likelyScopes.filter((scope) =>
    scopeSignalMatches(body, scope),
  ).length;
  const hasConservativeSecondaryScope =
    /\brelated frontage or off-site civil work\b/i.test(body);
  if (
    matchedScopeSignals < requiredScopeSignals ||
    (lead.likelyScopes.length === 1 && !hasConservativeSecondaryScope)
  ) {
    categories.push("scope_signals_missing");
  }
  if (
    !/\b(?:has|is|have|are)\b[^?]{0,120}\b(?:civil\/row|civil and (?:row|right-of-way)|row|right-of-way|frontage)\b[^?]{0,120}\b(?:assigned|awarded)\b[^?]*\?/i.test(
      body,
    )
  ) {
    categories.push("assignment_question_missing");
  }
  if (!/\b(?:review|look over|take a look at)\b.{0,45}\bplans?\b/i.test(body)) {
    categories.push("plans_offer_missing");
  }
  if (
    !/\b(?:provide|prepare|submit|put together)\b.{0,35}\bpric(?:e|ing)\b/i.test(
      body,
    )
  ) {
    categories.push("pricing_offer_missing");
  }
  if (
    guidance.routingRequired &&
    !hasExplicitRoutingRequest(body)
  ) {
    categories.push("routing_request_missing");
  }
  if (SIGNATURE_PATTERN.test(rawBody)) categories.push("signature_present");
  if (
    !/\b(?:unconfirmed|unresolved|not confirmed|may|possible|subject to|confirm what)\b/i.test(
      body,
    )
  ) {
    categories.push("certainty_safeguard_missing");
  }
  if (
    /\b(?:records?|permit|plans?)\s+(?:confirm|confirms|confirmed|prove|proves)\b/i.test(
      body,
    ) ||
    /\b(?:definitely|certainly)\s+(?:includes?|requires?)\b/i.test(body) ||
    /\b(?:project|work|scope|package)\s+(?:includes?|requires?|will include|will require)\b/i.test(
      body,
    )
  ) {
    categories.push("unsupported_scope_certainty");
  }
  if (
    /\b(?:package|work|scope)\s+(?:is|remains)\s+(?:open|available|unassigned)\b/i.test(
      body,
    )
  ) {
    categories.push("unsupported_package_availability");
  }
  if (
    mode === "concise_route_check" &&
    (/\b(?:you|your team|your company)\s+(?:control|controls|manage|manages|own|owns|handle|handles)\s+(?:procurement|the (?:civil\/row|row|right-of-way|frontage) package)\b/i.test(
      body,
    ) ||
      /\b(?:verified construction buyer|confirmed buyer|the decision-maker)\b/i.test(
        body,
      ))
  ) {
    categories.push("unsupported_buyer_authority");
  }
  if (
    /^\s*[{[]/.test(body) ||
    /^\s*[{[]/.test(subject) ||
    /^\s*(?:here is|below is|draft:|email draft:)/i.test(body) ||
    /"(?:revisedDraftEmailBody|primaryContact|outreachMode)"\s*:/i.test(
      `${subject}\n${body}`,
    )
  ) {
    categories.push("raw_json_present");
  }

  const unique = uniqueCategories(categories);
  return unique.length === 0
    ? { ok: true, body, wordCount: count }
    : { ok: false, body, wordCount: count, categories: unique };
}

export function finalizeOutreachCandidate(
  lead: PilotLead,
  candidate: unknown,
):
  | { ok: true; result: EnrichmentResult }
  | { ok: false; categories: OutreachValidationCategory[] } {
  const parsed = enrichmentModelResultSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, categories: ["schema_invalid"] };
  }
  if (
    lead.primaryContact.classification !==
      "project_specific_decision_maker" &&
    parsed.data.primaryContact.classification ===
      "project_specific_decision_maker"
  ) {
    return { ok: false, categories: ["unsupported_buyer_authority"] };
  }
  const draft = validateOutreachDraft(
    lead,
    parsed.data.revisedDraftEmailSubject,
    parsed.data.revisedDraftEmailBody,
  );
  if (!draft.ok) return draft;

  const result = enrichmentResultSchema.safeParse({
    ...parsed.data,
    revisedDraftEmailBody: draft.body,
    outreachMode: outreachModeForLead(lead),
    contactClassification: parsed.data.primaryContact.classification,
    buyerRouterStatus: buyerRouterStatusForClassification(
      lead,
      parsed.data.primaryContact.classification,
    ),
    scopeCertaintySafeguards: scopeCertaintySafeguardsForLead(lead),
  });
  return result.success
    ? { ok: true, result: result.data }
    : { ok: false, categories: ["schema_invalid"] };
}

function fallbackVariant(lead: PilotLead) {
  return [...lead.leadId].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  ) % 3;
}

function compactScopeLabel(scope: string) {
  const words = scope
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  while (
    words.length > 1 &&
    /^(?:and|around|at|for|from|of|the|to|with)$/i.test(words.at(-1) ?? "")
  ) {
    words.pop();
  }
  return words
    .join(" ")
    .replace(/[,:;.!?]+$/, "")
    .toLowerCase();
}

function fallbackScopeSignal(lead: PilotLead, scope: string) {
  const evidence = lead.evidence.find((item) =>
    scopeSignalMatches(item.claim, scope),
  );
  const label = compactScopeLabel(scope);
  if (evidence?.kind === "verified_fact") {
    return label;
  }
  if (evidence?.kind === "unresolved") {
    return `unresolved ${label}`;
  }
  return `possible ${label}`;
}

function fallbackProjectReference(lead: PilotLead) {
  if (wordCount(lead.address) <= 12 && lead.address.length <= 140) {
    return lead.address;
  }
  return [...lead.projectIdentifiers].sort(
    (left, right) => wordCount(left) - wordCount(right) || left.length - right.length,
  )[0];
}

function joinedScopeSignals(lead: PilotLead) {
  const scopes = lead.likelyScopes
    .slice(0, 2)
    .map((scope) => fallbackScopeSignal(lead, scope));
  if (scopes.length === 1) {
    scopes.push("possible related frontage or off-site civil work");
  }
  return scopes.length === 1
    ? scopes[0]
    : `${scopes.slice(0, -1).join(", ")} and ${scopes.at(-1)}`;
}

function fallbackBody(
  lead: PilotLead,
  mode: OutreachMode,
  options: FallbackOptions,
) {
  const projectReference = fallbackProjectReference(lead);
  const scopeText = joinedScopeSignals(lead);
  const grounding = `The packet references ${scopeText}; final scope and award status remain unconfirmed.`;
  const variant = fallbackVariant(lead);

  if (mode === "warm_opportunity") {
    const openers = [
      `Hello,\n\nI wanted to reach out regarding the project at ${projectReference}.`,
      `Hello,\n\nI’m reaching out about the work planned at ${projectReference}.`,
      `Hello,\n\nI’d welcome the opportunity to discuss the project at ${projectReference}.`,
    ];
    const closers = [
      "Please send over the plans when you have a chance. Thank you, and I look forward to hearing from you.",
      "If the package is still being coordinated, I’d appreciate the opportunity to take a look. Thank you for your time.",
      "I’d be glad to discuss schedule and scope after reviewing the plans. Thank you, and I look forward to connecting.",
    ];
    const capability = options.trimOptionalCapability
      ? "I work directly with Elevate’s civil and right-of-way field team."
      : "I work directly with Elevate’s field team on civil and right-of-way construction, including frontage restoration and traffic-control coordination. Our crews are accustomed to coordinating access, restoration, and traffic impacts around active sites.";
    return `${openers[variant]} ${grounding} ${capability} Has the civil/ROW package been assigned? I’d appreciate the opportunity to review the plans, confirm the work that is actually required, and provide practical pricing. ${closers[variant]}`;
  }

  const openers = [
    `Hello,\n\nI wanted to reach out regarding the project at ${projectReference}.`,
    `Hello,\n\nI’m reaching out about the planned work at ${projectReference}.`,
    `Hello,\n\nI’d like to ask about the project at ${projectReference}.`,
  ];
  const routingRequests = [
    "Would you mind routing me to the project manager, estimator, owner representative, or person managing the civil/ROW package?",
    "Could you connect me with the project manager, estimator, construction manager, or person managing the civil/ROW package?",
    "Who is managing the civil/ROW package—the project manager, estimator, owner representative, or construction manager?",
  ];
  const capability = options.trimOptionalCapability
    ? "I’m a hands-on contractor with Elevate."
    : "I’m a hands-on contractor with Elevate, and our team handles civil and right-of-way construction.";
  return `${openers[variant]} ${grounding} ${capability} Has the civil/ROW package been assigned? I can review the plans and provide pricing for the supported work. ${routingRequests[variant]} Thank you for your help.`;
}

export function deterministicEnrichmentFallback(
  lead: PilotLead,
  verifiedAt = new Date().toISOString().slice(0, 10),
  options: FallbackOptions = { trimOptionalCapability: false },
) {
  return {
    primaryContact: lead.primaryContact,
    backupContact: lead.backupContact,
    sources: lead.sources.slice(0, 12),
    caveats: [
      "Automated enrichment was unavailable; this fallback preserves the verified lead packet.",
      ...lead.risksAndCaveats.slice(0, 4),
    ],
    revisedCallOpener: lead.suggestedCallOpener,
    revisedDraftEmailSubject: lead.draftEmailSubject,
    revisedDraftEmailBody: fallbackBody(
      lead,
      outreachModeForLead(lead),
      options,
    ),
    verifiedAt,
  };
}

export async function resolveOutreachGeneration(
  lead: PilotLead,
  generate: GenerateAttempt,
  fallbackFactory: FallbackFactory = (fallbackLead, options) =>
    deterministicEnrichmentFallback(fallbackLead, undefined, options),
): Promise<OutreachResolution> {
  let categories: OutreachValidationCategory[] = [];

  try {
    const initial = finalizeOutreachCandidate(
      lead,
      await generate({ repairCategories: null }),
    );
    if (initial.ok) {
      return {
        ok: true,
        result: initial.result,
        strategy: "initial",
        repairedCategories: [],
      };
    }
    categories = initial.categories;
  } catch {
    categories = ["response_incomplete"];
  }

  try {
    const repair = finalizeOutreachCandidate(
      lead,
      await generate({ repairCategories: categories }),
    );
    if (repair.ok) {
      return {
        ok: true,
        result: repair.result,
        strategy: "repair",
        repairedCategories: categories,
      };
    }
    categories = uniqueCategories([...categories, ...repair.categories]);
  } catch {
    categories = uniqueCategories([...categories, "response_incomplete"]);
  }

  const fallback = finalizeOutreachCandidate(
    lead,
    fallbackFactory(lead, { trimOptionalCapability: false }),
  );
  if (fallback.ok) {
    return {
      ok: true,
      result: fallback.result,
      strategy: "fallback",
      repairedCategories: categories,
    };
  }
  if (
    fallback.categories.length === 1 &&
    fallback.categories[0] === "body_too_long"
  ) {
    const trimmedFallback = finalizeOutreachCandidate(
      lead,
      fallbackFactory(lead, { trimOptionalCapability: true }),
    );
    if (trimmedFallback.ok) {
      return {
        ok: true,
        result: trimmedFallback.result,
        strategy: "fallback",
        repairedCategories: categories,
      };
    }
    return {
      ok: false,
      categories: uniqueCategories([
        ...categories,
        ...trimmedFallback.categories,
      ]),
    };
  }
  return {
    ok: false,
    categories: uniqueCategories([...categories, ...fallback.categories]),
  };
}
