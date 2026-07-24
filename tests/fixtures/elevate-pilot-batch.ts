const contact = (company: string, suffix: string) => ({
  name: null,
  company,
  role: "Public project routing desk",
  classification: "probable_routing_contact" as const,
  methods: [
    {
      type: "email" as const,
      label: "Public email",
      value: `${suffix}@example.test`,
    },
    {
      type: "phone" as const,
      label: "Public phone",
      value: "+1-555-0100",
    },
  ],
  relationshipConfidence: "medium" as const,
  routingConfidence: "medium" as const,
  caveats: ["Test fixture only; confirm the project assignment before outreach."],
});

const experiments = [
  "proprietary_discovery",
  "proprietary_discovery",
  "proprietary_discovery",
  "obvious_control",
  "routing_experiment",
] as const;

export const elevatePilotBatchFixture = experiments.map(
  (experimentType, index) => {
    const number = index + 1;
    const company = `Fictional Builder ${number}`;
    return {
      leadId: `TEST-LEAD-${number}`,
      address: `${number}0${number} Example Avenue`,
      projectDescription: `Fictional mixed-use permit test project ${number}.`,
      jurisdiction: "Example County",
      projectIdentifiers: [`TEST-PERMIT-${number}`],
      trigger: "A fictional public permit milestone referenced frontage work.",
      triggerDate: "2026-07-01",
      currentStage: "Permit review",
      latestMeaningfulEvent: "A fictional correction response was accepted.",
      rowRelevance: number === 5 ? "possible" : "explicit",
      likelyScopes: ["Sidewalk restoration", "Traffic control"],
      whyElevateMayCare:
        "The fictional permit sequence suggests a near-term public right-of-way package.",
      evidence: [
        {
          claim: "The test permit references frontage work.",
          basis: "Fictional Playwright fixture; no real project or person.",
          kind: "verified_fact",
          confidence: "high",
        },
      ],
      sources: [
        {
          label: "Fictional official permit record",
          url: `https://example.test/permits/${number}`,
          sourceType: "official_permit",
          verifiedAt: "2026-07-23",
        },
      ],
      timingAssessment: "The fictional project appears ready for routing.",
      timingConfidence: "medium",
      projectConfidence: "high",
      rowScopeConfidence: number === 5 ? "medium" : "high",
      contactConfidence: "medium",
      primaryContact: contact(company, `routing-${number}`),
      backupContact: contact(`Fictional Owner ${number}`, `owner-${number}`),
      contactClassification: "probable_routing_contact",
      suggestedCallOpener:
        "Hi, this is Cesar with Elevate. Has the ROW package for this project been assigned, and could you route me to the right person?",
      draftEmailSubject: `ROW package for fictional test project ${number}`,
      draftEmailBody:
        "Hello,\n\nI’m Cesar with Elevate. Has the ROW package for this project been assigned? If so, would you route me to the correct project contact?\n\nThank you,\nCesar",
      risksAndCaveats: [
        "This is fictional test data and the project assignment is unverified.",
      ],
      experimentType,
    };
  },
);
