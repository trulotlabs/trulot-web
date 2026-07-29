import type { Contact, PilotLead } from "../../lib/elevate-review/schema";

const contacts: Array<{
  primary: Contact;
  backup: Contact | null;
  contactConfidence: PilotLead["contactConfidence"];
}> = [
  {
    primary: {
      name: "Morgan Lane",
      company: "Fictional Commercial Realty",
      role: "Commercial real estate broker and project routing contact",
      classification: "probable_routing_contact",
      methods: [
        {
          type: "phone",
          label: "Verified company main line",
          value: "+1-555-0101",
        },
        {
          type: "email",
          label: "Public broker email",
          value: "morgan.lane@example.test",
        },
      ],
      relationshipConfidence: "medium",
      routingConfidence: "medium",
      caveats: [
        "Fictional broker fixture; construction procurement authority is not verified.",
      ],
    },
    backup: {
      name: null,
      company: "Fictional Owner One",
      role: "General owner company route",
      classification: "general_company_contact",
      methods: [
        {
          type: "email",
          label: "Public general inbox",
          value: "projects-one@example.test",
        },
      ],
      relationshipConfidence: "medium",
      routingConfidence: "low",
      caveats: ["No individual owner-side buyer is identified."],
    },
    contactConfidence: "medium",
  },
  {
    primary: {
      name: null,
      company: "Fictional Civic Builder",
      role: "General company project-routing inbox",
      classification: "general_company_contact",
      methods: [
        {
          type: "email",
          label: "Verified public general inbox",
          value: "projects-two@example.test",
        },
      ],
      relationshipConfidence: "medium",
      routingConfidence: "medium",
      caveats: [
        "No named person or construction buyer is verified for this inbox.",
      ],
    },
    backup: null,
    contactConfidence: "medium",
  },
  {
    primary: {
      name: "Taylor Reed",
      company: "Fictional Owner Group",
      role: "Owner/developer representative and project routing contact",
      classification: "probable_routing_contact",
      methods: [
        {
          type: "phone",
          label: "Public owner company phone",
          value: "+1-555-0103",
        },
      ],
      relationshipConfidence: "high",
      routingConfidence: "medium",
      caveats: [
        "Owner-side relationship is verified only for routing; construction buying authority is not verified.",
      ],
    },
    backup: {
      name: null,
      company: "Fictional Builder Three",
      role: "General contractor company route",
      classification: "general_company_contact",
      methods: [
        {
          type: "email",
          label: "Public preconstruction inbox",
          value: "precon-three@example.test",
        },
      ],
      relationshipConfidence: "medium",
      routingConfidence: "medium",
      caveats: ["Project assignment remains unverified."],
    },
    contactConfidence: "high",
  },
  {
    primary: {
      name: "Jordan Kim",
      company: "Fictional Builder Four",
      role:
        "Project preconstruction manager and verified project-specific construction buyer",
      classification: "project_specific_decision_maker",
      methods: [
        {
          type: "email",
          label: "Verified project email",
          value: "jordan.kim@example.test",
        },
        {
          type: "phone",
          label: "Verified direct business line",
          value: "+1-555-0104",
        },
      ],
      relationshipConfidence: "high",
      routingConfidence: "high",
      caveats: [
        "Authority is verified only for the fictional project and stated preconstruction role.",
      ],
    },
    backup: null,
    contactConfidence: "high",
  },
  {
    primary: {
      name: "Riley Chen",
      company: "Fictional Builder Five",
      role: "GC router identified on a fictional project directory",
      classification: "project_specific_party",
      methods: [
        {
          type: "phone",
          label: "Public project office phone",
          value: "+1-555-0105",
        },
      ],
      relationshipConfidence: "medium",
      routingConfidence: "medium",
      caveats: [
        "Project relationship is supported, but buying authority is not verified.",
      ],
    },
    backup: null,
    contactConfidence: "medium",
  },
];

const experiments = [
  "small_non_obvious",
  "small_non_obvious",
  "medium_opportunity",
  "obvious_control",
  "routing_experiment",
] as const;

export const elevatePilotBatchFixture: PilotLead[] = experiments.map(
  (experimentType, index) => {
    const number = index + 1;
    const contact = contacts[index];
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
          claim: "The test permit explicitly references sidewalk restoration.",
          basis: "Fictional Playwright fixture; no real project or person.",
          kind: "verified_fact",
          confidence: "high",
        },
        {
          claim:
            "Traffic-control coordination may be needed for the frontage work.",
          basis:
            "Supported fictional inference from the described frontage activity.",
          kind: "supported_inference",
          confidence: "medium",
        },
        {
          claim:
            "Whether a wet tap or other utility connection is required remains unresolved.",
          basis:
            "The fictional fixture contains no plan sheet or explicit connection detail.",
          kind: "unresolved",
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
      contactConfidence: contact.contactConfidence,
      primaryContact: contact.primary,
      backupContact: contact.backup,
      contactClassification: contact.primary.classification,
      suggestedCallOpener:
        "Hi, this is Cesar with Elevate. I’m calling about the fictional project at Example Avenue. Who is managing the ROW/frontage package, and has it been assigned?",
      draftEmailSubject: `ROW package for fictional test project ${number}`,
      draftEmailBody:
        "Hello,\n\nHas the ROW package for this project been assigned? If so, would you route me to the correct project contact?",
      risksAndCaveats: [
        "This is fictional test data and the project assignment is unverified.",
        "The wet tap and final utility scope are unresolved.",
      ],
      experimentType,
    };
  },
);

export const elevatePilotBatchConfigFixture = {
  batchId: "batch-2-playwright",
  batchName: "Batch 2 test review",
  leads: elevatePilotBatchFixture,
};
