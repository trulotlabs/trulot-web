import { z } from "zod";

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
  preferredProjectTypes: z.array(z.string()),
  excludedProjectTypes: z.array(z.string()),
  preferredCustomerTypes: z.array(z.string()),
  targetAccounts: z.array(z.string()),
  existingCustomers: z.array(z.string()),
  doNotContactAccounts: z.array(z.string()),
  preferredContactRoles: z.array(z.string()),
  timing: z.object({
    earliestUsefulStage: z.string().nullable(),
    idealOutreachStage: z.string().nullable(),
    tooLateStage: z.string().nullable(),
    timingNotes: z.string().nullable(),
  }),
  disqualifiers: z.array(z.string()),
  capacity: z.object({
    leadsReviewablePerWeekday: z.number().nullable(),
    outreachActionsPerWeekday: z.number().nullable(),
    followUpOwner: z.string().nullable(),
    expectedResponseTime: z.string().nullable(),
  }),
  goodFitExamples: z.array(z.string()),
  badFitExamples: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  approvedByCesar: z.boolean(),
  approvedAt: z.string().nullable(),
});

export const interviewTurnSchema = z.object({
  assistantMessage: z.string().min(1).max(2400),
  questionKey: z.string().max(100).nullable(),
  suggestedReplies: z.array(z.string().min(1).max(160)).max(5),
  progressPercent: z.number().int().min(0).max(100),
  status: z.enum(["interviewing", "ready_for_review", "approved"]),
  coveredTopics: z.array(z.string().max(100)).max(30),
  unresolvedTopics: z.array(z.string().max(160)).max(30),
  potentialContradictions: z
    .array(
      z.object({
        topic: z.string().max(120),
        explanation: z.string().max(500),
      }),
    )
    .max(10),
  buyBoxDraft: elevateBuyBoxSchema.nullable(),
});

export const transcriptMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1).max(4000),
});

export const interviewRequestSchema = z.object({
  transcript: z.array(transcriptMessageSchema).min(1).max(50),
});

export type ElevateBuyBox = z.infer<typeof elevateBuyBoxSchema>;
export type InterviewTurn = z.infer<typeof interviewTurnSchema>;
export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;
