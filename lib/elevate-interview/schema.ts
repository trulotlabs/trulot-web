import { z } from "zod";

export const interviewSectionIds = [
  "signals",
  "evidence",
  "noise",
  "delivery",
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

export const sectionStatusSchema = z.enum([
  "pending",
  "completed",
  "skipped",
  "unresolved",
]);
export type SectionStatus = z.infer<typeof sectionStatusSchema>;

export const structuredInterviewAnswersSchema = z.object({
  signals: z.object({
    classifications: z.record(z.string(), classificationSchema),
    notes: z.string().max(1000),
  }),
  evidence: z.object({
    priorities: z.array(z.string().max(120)).max(12),
    notes: z.string().max(1000),
  }),
  noise: z.object({
    suppressions: z.array(z.string().max(160)).max(12),
    noAdditionalRules: z.boolean(),
    notes: z.string().max(1000),
  }),
  delivery: z.object({
    batchSize: z.union([z.literal(5), z.literal(10)]).nullable(),
    deliverySpeed: z.string().max(120).nullable(),
    feedbackOwner: z.string().max(200),
    notes: z.string().max(1000),
  }),
});

export type StructuredInterviewAnswers = z.infer<
  typeof structuredInterviewAnswersSchema
>;

export const signalCalibrationSummarySchema = z.object({
  version: z.literal("0.1"),
  title: z.literal("Elevate Signal Calibration Summary"),
  participantName: z.literal("Cesar"),
  companyName: z.literal("Elevate"),
  assumptions: z.object({
    serviceArea: z.literal("San Diego County"),
    projectSize: z.literal("Any project size"),
    rowScope: z.literal("Broad public right-of-way scope"),
  }),
  signalPriority: z.object({
    sendNow: z.array(z.string()),
    supporting: z.array(z.string()),
    ignore: z.array(z.string()),
    unresolved: z.array(z.string()),
    notes: z.string().nullable(),
  }),
  actionableEvidence: z.array(z.string()),
  evidenceNotes: z.string().nullable(),
  suppressions: z.array(z.string()),
  suppressionNotes: z.string().nullable(),
  delivery: z.object({
    firstBatchSize: z.number().nullable(),
    deliverySpeed: z.string().nullable(),
    feedbackOwner: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  sectionStatus: z.record(interviewSectionIdSchema, sectionStatusSchema),
  unresolvedQuestions: z.array(z.string()),
  approvedByCesar: z.boolean(),
  approvedAt: z.string().nullable(),
});

export type SignalCalibrationSummary = z.infer<
  typeof signalCalibrationSummarySchema
>;

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
  transcript: z.array(transcriptMessageSchema).max(30),
  clarificationAlreadyAsked: z.boolean(),
  clarificationAnswer: z.string().max(4000).nullable(),
});

export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;
