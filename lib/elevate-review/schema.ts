import { z } from "zod";

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const rowRelevanceSchema = z.enum([
  "explicit",
  "strongly_inferred",
  "possible",
]);

export const experimentTypeSchema = z.enum([
  "proprietary_discovery",
  "obvious_control",
  "routing_experiment",
]);
export type ExperimentType = z.infer<typeof experimentTypeSchema>;

export const contactClassificationSchema = z.enum([
  "project_specific_decision_maker",
  "project_specific_party",
  "probable_routing_contact",
  "general_company_contact",
  "site_occupant_only",
  "unverified",
]);
export type ContactClassification = z.infer<
  typeof contactClassificationSchema
>;

export const contactMethodSchema = z.object({
  type: z.enum(["email", "phone", "website"]),
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(320),
});

export const contactSchema = z.object({
  name: z.string().min(1).max(120).nullable(),
  company: z.string().min(1).max(160),
  role: z.string().min(1).max(240),
  classification: contactClassificationSchema,
  methods: z.array(contactMethodSchema).max(6),
  relationshipConfidence: confidenceSchema,
  routingConfidence: confidenceSchema,
  caveats: z.array(z.string().min(1).max(500)).max(8),
});
export type Contact = z.infer<typeof contactSchema>;

export const sourceSchema = z.object({
  label: z.string().min(1).max(180),
  url: z.string().url().max(1000),
  sourceType: z.enum([
    "official_permit",
    "government_record",
    "company_source",
    "public_filing",
    "discovery_only",
  ]),
  verifiedAt: z.string().min(1).max(40),
});
export type LeadSource = z.infer<typeof sourceSchema>;

export const evidenceSchema = z.object({
  claim: z.string().min(1).max(500),
  basis: z.string().min(1).max(800),
  kind: z.enum(["verified_fact", "supported_inference", "unresolved"]),
  confidence: confidenceSchema,
});

export const pilotLeadSchema = z.object({
  leadId: z.string().min(1).max(80),
  address: z.string().min(1).max(240),
  projectDescription: z.string().min(1).max(500),
  jurisdiction: z.string().min(1).max(160),
  projectIdentifiers: z.array(z.string().min(1).max(80)).min(1).max(12),
  trigger: z.string().min(1).max(400),
  triggerDate: z.string().min(1).max(40),
  currentStage: z.string().min(1).max(240),
  latestMeaningfulEvent: z.string().min(1).max(600),
  rowRelevance: rowRelevanceSchema,
  likelyScopes: z.array(z.string().min(1).max(240)).min(1).max(20),
  whyElevateMayCare: z.string().min(1).max(900),
  evidence: z.array(evidenceSchema).min(1).max(20),
  sources: z.array(sourceSchema).min(1).max(20),
  timingAssessment: z.string().min(1).max(300),
  timingConfidence: confidenceSchema,
  projectConfidence: confidenceSchema,
  rowScopeConfidence: confidenceSchema,
  contactConfidence: confidenceSchema,
  primaryContact: contactSchema,
  backupContact: contactSchema.nullable(),
  contactClassification: contactClassificationSchema,
  suggestedCallOpener: z.string().min(1).max(1600),
  draftEmailSubject: z.string().min(1).max(200),
  draftEmailBody: z.string().min(1).max(4000),
  risksAndCaveats: z.array(z.string().min(1).max(700)).max(16),
  experimentType: experimentTypeSchema,
});
export type PilotLead = z.infer<typeof pilotLeadSchema>;

export const pilotBatchSchema = z
  .array(pilotLeadSchema)
  .length(5)
  .superRefine((leads, context) => {
    const ids = new Set(leads.map((lead) => lead.leadId));
    if (ids.size !== leads.length) {
      context.addIssue({
        code: "custom",
        message: "Lead IDs must be unique.",
      });
    }
    if (
      leads.filter((lead) => lead.experimentType === "routing_experiment")
        .length !== 1
    ) {
      context.addIssue({
        code: "custom",
        message: "The pilot batch must contain one routing experiment.",
      });
    }
    if (
      leads.filter((lead) => lead.experimentType === "obvious_control")
        .length !== 1
    ) {
      context.addIssue({
        code: "custom",
        message: "The pilot batch must contain one obvious control.",
      });
    }
  });
export type PilotBatch = z.infer<typeof pilotBatchSchema>;

export const decisionSchema = z.enum([
  "call_now",
  "call_later",
  "pass",
  "already_known",
]);
export type LeadDecision = z.infer<typeof decisionSchema>;

export const outcomeSchema = z.enum([
  "contacted",
  "reached_someone",
  "wrong_contact",
  "existing_relationship",
  "row_scope_confirmed",
  "plans_received",
  "bid_opportunity",
  "bid_submitted",
  "won",
  "lost",
  "no_response",
]);
export type LeadOutcome = z.infer<typeof outcomeSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
  createdAt: z.string().min(1).max(40),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const enrichmentResultSchema = z.object({
  primaryContact: contactSchema,
  backupContact: contactSchema.nullable(),
  sources: z.array(sourceSchema).min(1).max(12),
  caveats: z.array(z.string().min(1).max(600)).max(12),
  revisedCallOpener: z.string().min(1).max(1600),
  revisedDraftEmailSubject: z.string().min(1).max(200),
  revisedDraftEmailBody: z.string().min(1).max(4000),
  verifiedAt: z.string().min(1).max(40),
});
export type EnrichmentResult = z.infer<typeof enrichmentResultSchema>;

const modelSourceSchema = sourceSchema.extend({
  // The Responses API structured-output subset does not accept JSON Schema's
  // URI format. The authoritative schema above validates the URL afterward.
  url: z.string().min(1).max(1000),
});

export const enrichmentModelResultSchema = enrichmentResultSchema.extend({
  sources: z.array(modelSourceSchema).min(1).max(12),
});

export const chatResponseSchema = z.object({
  answer: z.string().min(1).max(2200),
  sourceIndexes: z.array(z.number().int().min(0).max(19)).max(8),
  caveats: z.array(z.string().min(1).max(500)).max(8),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const chatRequestSchema = z.object({
  leadId: z.string().min(1).max(80),
  question: z.string().min(1).max(2000),
  decision: decisionSchema.nullable(),
  notes: z.string().max(3000),
  transcript: z.array(chatMessageSchema).max(16),
});

export const enrichmentRequestSchema = z.object({
  leadId: z.string().min(1).max(80),
});

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }, "Use a real calendar date in YYYY-MM-DD format.");

export const savedLeadReviewSchema = z.object({
  decision: decisionSchema.nullable(),
  reasons: z.array(z.string().min(1).max(240)).max(12),
  otherReason: z.string().max(300),
  notes: z.string().max(3000),
  saved: z.boolean(),
  chatTranscript: z.array(chatMessageSchema).max(40),
  enrichment: enrichmentResultSchema.nullable(),
  editedEmailSubject: z.string().max(200),
  editedEmailBody: z.string().max(4000),
  editedCallOpener: z.string().max(1600),
  contacted: z.boolean(),
  outcome: outcomeSchema.nullable(),
  outcomeNotes: z.string().max(3000),
  estimatedOpportunityValue: z.string().max(120),
  followUpDate: isoDateSchema.nullable(),
  enrichedOutreachAdopted: z.boolean(),
  updatedAt: z.string().max(40),
});
export type SavedLeadReview = z.infer<typeof savedLeadReviewSchema>;

const currentSavedReviewSchema = z.object({
  version: z.literal(2),
  activeLeadId: z.string().min(1).max(80),
  reviews: z.record(z.string(), savedLeadReviewSchema),
  updatedAt: z.string().max(40),
});

const legacySavedLeadReviewSchema = savedLeadReviewSchema
  .omit({
    reasons: true,
    otherReason: true,
    followUpDate: true,
    enrichedOutreachAdopted: true,
  })
  .extend({
    reason: z.string().max(240),
    followUpDate: z.string().max(40),
  });

const legacySavedReviewSchema = z.object({
  version: z.literal(1),
  activeLeadId: z.string().min(1).max(80),
  reviews: z.record(z.string(), legacySavedLeadReviewSchema),
  updatedAt: z.string().max(40),
});

export const savedReviewSchema = z.preprocess((value) => {
  const legacy = legacySavedReviewSchema.safeParse(value);
  if (!legacy.success) return value;
  return {
    version: 2,
    activeLeadId: legacy.data.activeLeadId,
    reviews: Object.fromEntries(
      Object.entries(legacy.data.reviews).map(([leadId, review]) => [
        leadId,
        {
          ...review,
          reasons: review.reason ? [review.reason] : [],
          otherReason: "",
          followUpDate: isoDateSchema.safeParse(review.followUpDate).success
            ? review.followUpDate
            : null,
          enrichedOutreachAdopted: false,
          reason: undefined,
        },
      ]),
    ),
    updatedAt: legacy.data.updatedAt,
  };
}, currentSavedReviewSchema);
export type SavedReview = z.infer<typeof savedReviewSchema>;

export const completedLeadReviewExportSchema = z
  .object({
    leadId: z.string().min(1).max(80),
    address: z.string().min(1).max(240),
    projectDescription: z.string().min(1).max(500),
    experimentType: experimentTypeSchema,
    review: z
      .object({
        decision: decisionSchema.nullable(),
        reasons: z.array(z.string().min(1).max(240)).max(12),
        otherReason: z.string().max(300).nullable(),
        notes: z.string().max(3000).nullable(),
        contacted: z.boolean(),
        outcome: outcomeSchema.nullable(),
        outcomeNotes: z.string().max(3000).nullable(),
        estimatedOpportunityValue: z.number().finite().nonnegative().nullable(),
        followUpDate: isoDateSchema.nullable(),
      })
      .strict(),
    verifiedPacket: z
      .object({
        primaryContact: contactSchema,
        backupContact: contactSchema.nullable(),
        sourceUrls: z.array(z.string().url().max(1000)).max(20),
      })
      .strict(),
    aiEnrichment: z
      .object({
        ran: z.boolean(),
        primaryContactClassification: contactClassificationSchema.nullable(),
        backupContactClassification: contactClassificationSchema.nullable(),
        verifiedAt: z.string().min(1).max(40).nullable(),
        sourceUrls: z.array(z.string().url().max(1000)).max(12),
        outreachAdopted: z.boolean(),
      })
      .strict(),
    finalOutreach: z
      .object({
        callOpener: z.string().max(1600).nullable(),
        emailSubject: z.string().max(200).nullable(),
        emailBody: z.string().max(4000).nullable(),
      })
      .strict(),
  })
  .strict();

export const completedReviewExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    leads: z.array(completedLeadReviewExportSchema).length(5),
  })
  .strict();
export type CompletedReviewExport = z.infer<typeof completedReviewExportSchema>;
