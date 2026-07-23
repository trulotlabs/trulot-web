import type { ElevateBuyBox, InterviewTurn, TranscriptMessage } from "./schema";

const mockBuyBox: ElevateBuyBox = {
  version: "0.1",
  participantName: "Cesar",
  companyName: "Elevate",
  serviceGeography: {
    coreMarkets: ["San Diego County"],
    selectiveMarkets: ["Southwest Riverside County"],
    excludedMarkets: ["Markets requiring overnight travel"],
    mobilizationNotes: "Strategic relationships may justify selective travel.",
  },
  scopes: {
    core: ["Sidewalk, curb and gutter", "ADA ramps", "Street restoration"],
    selective: ["Trenching", "Traffic control"],
    excluded: ["Standalone landscaping"],
    notes: "Mock-mode draft for flow verification only.",
  },
  economics: {
    ordinaryMinimumContractValue: 25000,
    preferredContractValueMin: 50000,
    preferredContractValueMax: 500000,
    minimumGrossProfit: null,
    strategicExceptions: ["Smaller first job with a target general contractor"],
    notes: "Gross-profit threshold still needs confirmation.",
  },
  preferredProjectTypes: ["Commercial frontage improvements", "Utility upgrades"],
  excludedProjectTypes: ["Purely private interior renovations"],
  preferredCustomerTypes: ["General contractors", "Developers", "Utility contractors"],
  targetAccounts: ["Target GC to be named"],
  existingCustomers: [],
  doNotContactAccounts: [],
  preferredContactRoles: ["Estimator", "Project executive", "Project manager"],
  timing: {
    earliestUsefulStage: "Permit application or plan review",
    idealOutreachStage: "Before subcontractor buyout",
    tooLateStage: "ROW scope already awarded",
    timingNotes: null,
  },
  disqualifiers: ["No identifiable ROW scope", "Scope already awarded"],
  capacity: {
    leadsReviewablePerWeekday: 5,
    outreachActionsPerWeekday: 3,
    followUpOwner: "Cesar",
    expectedResponseTime: "Within one business day",
  },
  goodFitExamples: ["Commercial frontage package with curb, sidewalk, and ADA work"],
  badFitExamples: ["Small isolated repair with no relationship value"],
  unresolvedQuestions: ["Confirm minimum gross-profit expectation", "Name priority target GCs"],
  confidence: "medium",
  approvedByCesar: false,
  approvedAt: null,
};

export function getMockInterviewTurn(transcript: TranscriptMessage[]): InterviewTurn {
  const answers = transcript.filter((message) => message.role === "user");

  if (answers.length === 1) {
    return {
      assistantMessage:
        "Within those markets, which ROW scopes are core work for Elevate, which are selective, and which should TruLot exclude?",
      questionKey: "scopes",
      suggestedReplies: [
        "Core: curb, gutter, sidewalk, and ADA ramps",
        "Selective: trenching and traffic control",
        "Let me describe our scopes",
      ],
      progressPercent: 32,
      status: "interviewing",
      coveredTopics: ["geography"],
      unresolvedTopics: ["scopes", "economics", "customers", "timing", "capacity", "examples"],
      potentialContradictions: [],
      buyBoxDraft: null,
    };
  }

  if (answers.length === 2) {
    return {
      assistantMessage:
        "Think of a profitable job you would gladly do again. What was the scope, approximate contract value, customer type, and when did Elevate enter the conversation?",
      questionKey: "good_fit_example",
      suggestedReplies: [
        "$25k–$75k frontage improvement",
        "$75k–$250k utility or trenching package",
        "I’ll describe a specific project",
      ],
      progressPercent: 58,
      status: "interviewing",
      coveredTopics: ["geography", "scopes"],
      unresolvedTopics: ["economics", "customers", "timing", "capacity", "examples"],
      potentialContradictions: [],
      buyBoxDraft: null,
    };
  }

  if (answers.length === 3) {
    return {
      assistantMessage:
        "Last operating check: about how many leads can you review and how many outreach actions can Elevate realistically make per weekday?",
      questionKey: "capacity",
      suggestedReplies: ["Review 5; contact 3", "Review 10; contact 5", "It varies — let me explain"],
      progressPercent: 82,
      status: "interviewing",
      coveredTopics: ["geography", "scopes", "economics", "customers", "timing", "good-fit example"],
      unresolvedTopics: ["capacity", "bad-fit example", "minimum gross profit"],
      potentialContradictions: [],
      buyBoxDraft: null,
    };
  }

  return {
    assistantMessage:
      "I’ve shaped your answers into Elevate Buy Box v0.1. Review the draft below; unresolved items are called out rather than guessed.",
    questionKey: null,
    suggestedReplies: [],
    progressPercent: 100,
    status: "ready_for_review",
    coveredTopics: [
      "geography",
      "scopes",
      "economics",
      "project types",
      "customer types",
      "contact roles",
      "timing",
      "disqualifiers",
      "capacity",
      "examples",
    ],
    unresolvedTopics: mockBuyBox.unresolvedQuestions,
    potentialContradictions: [],
    buyBoxDraft: mockBuyBox,
  };
}
