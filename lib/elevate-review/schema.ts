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

export const savedLeadReviewSchema = z.object({
  decision: decisionSchema.nullable(),
  reason: z.string().max(240),
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
  followUpDate: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type SavedLeadReview = z.infer<typeof savedLeadReviewSchema>;

export const savedReviewSchema = z.object({
  version: z.literal(1),
  activeLeadId: z.string().min(1).max(80),
  reviews: z.record(z.string(), savedLeadReviewSchema),
  updatedAt: z.string().max(40),
});
export type SavedReview = z.infer<typeof savedReviewSchema>;
