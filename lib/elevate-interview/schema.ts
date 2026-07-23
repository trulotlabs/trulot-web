import { z } from "zod";

export const interviewSectionIds = [
  "service_area",
  "scopes",
  "economics",
  "customers",
  "contacts",
  "timing",
  "disqualifiers",
  "capacity_examples",
] as const;

export const interviewSectionIdSchema = z.enum(interviewSectionIds);
export type InterviewSectionId = z.infer<typeof interviewSectionIdSchema>;

export const classificationSchema = z.enum([
  "core",
  "selective",
  "excluded",
  "unassigned",
]);
export type Classification = z.infer<typeof classificationSchema>;

export const disqualifierDecisionSchema = z.enum([
  "suppress",
  "conditional",
  "allow",
  "unassigned",
]);
export type DisqualifierDecision = z.infer<typeof disqualifierDecisionSchema>;

export const sectionStatusSchema = z.enum([
  "pending",
  "completed",
  "skipped",
  "unresolved",
]);
export type SectionStatus = z.infer<typeof sectionStatusSchema>;

const classifiedGeographySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  classification: classificationSchema,
});

const optionalExampleSchema = z.object({
  projectOrLocation: z.string().max(240),
  scopes: z.string().max(500),
  contractRange: z.string().max(160),
  customerType: z.string().max(200),
  fitReason: z.string().max(600),
});

export type OptionalExample = z.infer<typeof optionalExampleSchema>;

export const structuredInterviewAnswersSchema = z.object({
  serviceArea: z.object({
    geographies: z.array(classifiedGeographySchema).max(20),
    mobilizationNote: z.string().max(800),
  }),
  scopes: z.object({
    classifications: z.record(z.string(), classificationSchema),
    additionalScopes: z.string().max(1200),
    notes: z.string().max(1200),
  }),
  economics: z.object({
    ordinaryMinimumContractValue: z.number().nonnegative().nullable(),
    preferredContractValueMin: z.number().nonnegative().nullable(),
    preferredContractValueMax: z.number().nonnegative().nullable(),
    exceptionChoices: z.array(z.string().max(120)).max(8),
    exceptionNote: z.string().max(800),
    notes: z.string().max(800),
  }),
  customers: z.object({
    classifications: z.record(z.string(), classificationSchema),
    notes: z.string().max(1000),
  }),
  contacts: z.object({
    primary: z.string().max(180).nullable(),
    secondary: z.string().max(180).nullable(),
    useBestAvailable: z.boolean(),
    notes: z.string().max(800),
  }),
  timing: z.object({
    earliest: z.string().max(240).nullable(),
    ideal: z.array(z.string().max(240)).max(10),
    tooLate: z.string().max(240).nullable(),
    notes: z.string().max(1000),
  }),
  disqualifiers: z.object({
    decisions: z.record(
      z.string(),
      z.object({
        decision: disqualifierDecisionSchema,
        note: z.string().max(500),
      }),
    ),
    customItems: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          label: z.string().min(1).max(240),
          decision: disqualifierDecisionSchema,
          note: z.string().max(500),
        }),
      )
      .max(10),
    noHardDisqualifiers: z.boolean(),
    notes: z.string().max(800),
  }),
  capacityExamples: z.object({
    leadsPerWeekday: z.number().int().nonnegative().nullable(),
    outreachPerWeekday: z.number().int().nonnegative().nullable(),
    followUpOwner: z.string().max(200),
    responseTime: z.string().max(240),
    goodFit: optionalExampleSchema,
    badFit: optionalExampleSchema,
    notes: z.string().max(800),
  }),
});

export type StructuredInterviewAnswers = z.infer<
  typeof structuredInterviewAnswersSchema
>;

export const elevateBuyBoxSchema = z.object({
  version: z.literal("0.1"),
  participantName: z.literal("Cesar"),
  companyName: z.literal("Elevate"),
  serviceGeography: z.object({
    coreMarkets: z.array(z.string()),
    selectiveMarkets: z.array(z.string()),
    excludedMarkets: z.array(z.string()),
    mobilizationNotes: z.string().nullable(),
  }),
  scopes: z.object({
    core: z.array(z.string()),
    selective: z.array(z.string()),
    excluded: z.array(z.string()),
    unresolved: z.array(z.string()),
    notes: z.string().nullable(),
  }),
  economics: z.object({
    ordinaryMinimumContractValue: z.number().nullable(),
    preferredContractValueMin: z.number().nullable(),
    preferredContractValueMax: z.number().nullable(),
    minimumGrossProfit: z.number().nullable(),
    strategicExceptions: z.array(z.string()),
    notes: z.string().nullable(),
  }),
  customerTypes: z.object({
    core: z.array(z.string()),
    selective: z.array(z.string()),
    excluded: z.array(z.string()),
    unresolved: z.array(z.string()),
    notes: z.string().nullable(),
  }),
  preferredProjectTypes: z.array(z.string()),
  excludedProjectTypes: z.array(z.string()),
  preferredCustomerTypes: z.array(z.string()),
  targetAccounts: z.array(z.string()),
  existingCustomers: z.array(z.string()),
  doNotContactAccounts: z.array(z.string()),
  preferredContactRoles: z.array(z.string()),
  contactPreference: z.object({
    primary: z.string().nullable(),
    secondary: z.string().nullable(),
    useBestAvailable: z.boolean(),
    notes: z.string().nullable(),
  }),
  timing: z.object({
    earliestUsefulStage: z.string().nullable(),
    idealOutreachStage: z.string().nullable(),
    idealOutreachStages: z.array(z.string()),
    tooLateStage: z.string().nullable(),
    timingNotes: z.string().nullable(),
  }),
  disqualifiers: z.array(z.string()),
  screeningRules: z.object({
    suppress: z.array(z.string()),
    conditional: z.array(z.string()),
    allow: z.array(z.string()),
    unresolved: z.array(z.string()),
    notes: z.string().nullable(),
  }),
  capacity: z.object({
    leadsReviewablePerWeekday: z.number().nullable(),
    outreachActionsPerWeekday: z.number().nullable(),
    followUpOwner: z.string().nullable(),
    expectedResponseTime: z.string().nullable(),
  }),
  goodFitExamples: z.array(z.string()),
  badFitExamples: z.array(z.string()),
  examples: z.object({
    goodFit: optionalExampleSchema.nullable(),
    badFit: optionalExampleSchema.nullable(),
  }),
  sectionStatus: z.record(interviewSectionIdSchema, sectionStatusSchema),
  unresolvedQuestions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  approvedByCesar: z.boolean(),
  approvedAt: z.string().nullable(),
});

export type ElevateBuyBox = z.infer<typeof elevateBuyBoxSchema>;

export const sectionCoachResponseSchema = z.object({
  acknowledgement: z.string().min(1).max(500),
  assistantMessage: z.string().min(1).max(800),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().min(1).max(500).nullable(),
  unresolvedIssue: z.string().max(500).nullable(),
});

export type SectionCoachResponse = z.infer<typeof sectionCoachResponseSchema>;

export const transcriptMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1).max(4000),
  section: interviewSectionIdSchema.optional(),
});

export const interviewRequestSchema = z.object({
  activeSection: interviewSectionIdSchema,
  answers: structuredInterviewAnswersSchema,
  transcript: z.array(transcriptMessageSchema).max(50),
  clarificationAlreadyAsked: z.boolean(),
  clarificationAnswer: z.string().max(4000).nullable(),
});

export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;
