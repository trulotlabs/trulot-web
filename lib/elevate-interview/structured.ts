import type {
  Classification,
  InterviewSectionId,
  SectionStatus,
  SignalCalibrationSummary,
  StructuredInterviewAnswers,
} from "./schema";

export const INTERVIEW_SECTIONS: ReadonlyArray<{
  id: InterviewSectionId;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    id: "signals",
    title: "Valuable project signals",
    shortTitle: "Signals",
    description:
      "Which permit and project signals should TruLot send now, use as supporting evidence, or ignore?",
  },
  {
    id: "evidence",
    title: "What makes a lead actionable",
    shortTitle: "Evidence",
    description:
      "Choose the evidence that makes a signal worth putting in front of Cesar.",
  },
  {
    id: "noise",
    title: "Obvious noise to suppress",
    shortTitle: "Noise",
    description:
      "Remove a few obvious false positives without designing an exhaustive rulebook.",
  },
  {
    id: "delivery",
    title: "First calibration batch",
    shortTitle: "Delivery",
    description:
      "Set the first 5–10 lead handoff so TruLot can learn from real feedback quickly.",
  },
] as const;

export const SIGNAL_OPTIONS = [
  {
    id: "row_permit_applied",
    label: "ROW / encroachment permit applied",
  },
  {
    id: "row_permit_approved",
    label: "ROW / encroachment permit approved",
  },
  {
    id: "traffic_control_permit",
    label: "Traffic-control permit applied or approved",
  },
  {
    id: "utility_application",
    label: "Utility service or lateral application",
  },
  {
    id: "plan_check_corrections",
    label: "Plan-check corrections identify frontage or ROW work",
  },
  {
    id: "permit_conditions",
    label: "Building permit conditions require public improvements",
  },
  {
    id: "row_scope_in_plans",
    label: "Plans visibly show sidewalk, curb, ADA, trenching, or restoration scope",
  },
  {
    id: "gc_estimator_identified",
    label: "GC, estimator, or permit applicant identified",
  },
] as const;

export const EVIDENCE_OPTIONS = [
  "A current permit or application status",
  "ROW scope is visible in plans, corrections, or conditions",
  "A responsible applicant, GC, or estimator is named",
  "A usable phone number or email is available",
  "Project address and parcel are reconciled",
  "Recent activity suggests the project is moving",
  "Multiple records reinforce the same ROW need",
] as const;

export const NOISE_OPTIONS = [
  "Private on-site work only; no public ROW impact",
  "Completed, expired, withdrawn, or cancelled work",
  "Duplicate records for the same project and signal",
  "No visible construction scope in the public ROW",
  "Design or feasibility activity with no near-term construction",
] as const;

export const DELIVERY_SPEED_OPTIONS = [
  "As soon as the first five are ready",
  "One initial batch this week",
  "Ten leads, then pause for feedback",
] as const;

export const CALIBRATION_LABELS: Record<Classification, string> = {
  core: "Send now",
  selective: "Supporting",
  excluded: "Ignore",
  unassigned: "Unassigned",
};

export function createInitialSectionStatus(): Record<
  InterviewSectionId,
  SectionStatus
> {
  return Object.fromEntries(
    INTERVIEW_SECTIONS.map(({ id }) => [id, "pending"]),
  ) as Record<InterviewSectionId, SectionStatus>;
}

export function createInitialAnswers(): StructuredInterviewAnswers {
  return {
    signals: {
      classifications: Object.fromEntries(
        SIGNAL_OPTIONS.map(({ id }) => [id, "unassigned"]),
      ),
      notes: "",
    },
    evidence: { priorities: [], notes: "" },
    noise: { suppressions: [], noAdditionalRules: false, notes: "" },
    delivery: {
      batchSize: null,
      deliverySpeed: null,
      feedbackOwner: "",
      notes: "",
    },
  };
}

function classified(
  answers: StructuredInterviewAnswers,
  target: Classification,
) {
  return SIGNAL_OPTIONS.filter(
    ({ id }) => (answers.signals.classifications[id] ?? "unassigned") === target,
  ).map(({ label }) => label);
}

export function buildSignalCalibrationSummary(
  answers: StructuredInterviewAnswers,
  status: Record<InterviewSectionId, SectionStatus>,
  approval?: { approvedAt: string | null },
): SignalCalibrationSummary {
  const unresolvedQuestions = INTERVIEW_SECTIONS.filter(
    ({ id }) => status[id] === "skipped" || status[id] === "unresolved",
  ).map(({ title, id }) =>
    status[id] === "skipped"
      ? `${title} was skipped for now.`
      : `${title} contains unresolved selections.`,
  );
  const unassigned = classified(answers, "unassigned");
  if (unassigned.length) {
    unresolvedQuestions.push("Some project signals remain unassigned.");
  }
  return {
    version: "0.1",
    title: "Elevate Signal Calibration Summary",
    participantName: "Cesar",
    companyName: "Elevate",
    assumptions: {
      serviceArea: "San Diego County",
      projectSize: "Any project size",
      rowScope: "Broad public right-of-way scope",
    },
    signalPriority: {
      sendNow: classified(answers, "core"),
      supporting: classified(answers, "selective"),
      ignore: classified(answers, "excluded"),
      unresolved: unassigned,
      notes: answers.signals.notes.trim() || null,
    },
    actionableEvidence: answers.evidence.priorities,
    evidenceNotes: answers.evidence.notes.trim() || null,
    suppressions: answers.noise.noAdditionalRules
      ? []
      : answers.noise.suppressions,
    suppressionNotes: answers.noise.notes.trim() || null,
    delivery: {
      firstBatchSize: answers.delivery.batchSize,
      deliverySpeed: answers.delivery.deliverySpeed,
      feedbackOwner: answers.delivery.feedbackOwner.trim() || null,
      notes: answers.delivery.notes.trim() || null,
    },
    sectionStatus: status,
    unresolvedQuestions,
    approvedByCesar: Boolean(approval?.approvedAt),
    approvedAt: approval?.approvedAt ?? null,
  };
}

export function nextSection(current: InterviewSectionId) {
  const index = INTERVIEW_SECTIONS.findIndex(({ id }) => id === current);
  return INTERVIEW_SECTIONS[index + 1]?.id ?? "review";
}

export function sectionTitle(sectionId: InterviewSectionId) {
  return INTERVIEW_SECTIONS.find(({ id }) => id === sectionId)?.title ?? sectionId;
}
