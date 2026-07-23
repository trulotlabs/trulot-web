"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  interviewSectionIdSchema,
  sectionCoachResponseSchema,
  sectionStatusSchema,
  structuredInterviewAnswersSchema,
  type ElevateBuyBox,
  type InterviewSectionId,
  type SectionStatus,
  type StructuredInterviewAnswers,
  type TranscriptMessage,
} from "@/lib/elevate-interview/schema";
import {
  buildElevateBuyBox,
  createInitialAnswers,
  createInitialSectionStatus,
  INTERVIEW_SECTIONS,
  nextSection,
  sectionTitle,
} from "@/lib/elevate-interview/structured";
import { InterviewSectionForm } from "./InterviewSectionForm";

type ActiveView = InterviewSectionId | "review";

type Clarification = {
  section: InterviewSectionId;
  question: string;
  answer: string;
};

type SavedInterview = {
  version: 2;
  activeView: ActiveView;
  answers: StructuredInterviewAnswers;
  sectionStatus: Record<InterviewSectionId, SectionStatus>;
  clarificationCounts: Record<InterviewSectionId, number>;
  clarification: Clarification | null;
  transcript: TranscriptMessage[];
  approvedAt: string | null;
  editReturnToReview: boolean;
  updatedAt: string;
};

const OPENING_MESSAGE =
  "Welcome, Cesar. This short onboarding will define Elevate’s first ROW opportunity buy box. The eight sections use structured controls, and you can skip, revise, or leave items unresolved. TruLot will preserve exactly what you select.";

const buttonClass =
  "rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52] disabled:opacity-40";

function newClarificationCounts() {
  return Object.fromEntries(
    INTERVIEW_SECTIONS.map((section) => [section.id, 0]),
  ) as Record<InterviewSectionId, number>;
}

function formatMoney(value: number | null) {
  if (value === null) return "Not provided";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function list(items: string[]) {
  return items.length ? items.join(", ") : "None selected";
}

function sectionAnswerText(
  section: InterviewSectionId,
  buyBox: ElevateBuyBox,
) {
  switch (section) {
    case "service_area":
      return `Core: ${list(buyBox.serviceGeography.coreMarkets)}. Selective: ${list(buyBox.serviceGeography.selectiveMarkets)}. Excluded: ${list(buyBox.serviceGeography.excludedMarkets)}.`;
    case "scopes":
      return `Core: ${list(buyBox.scopes.core)}. Selective: ${list(buyBox.scopes.selective)}. Excluded: ${list(buyBox.scopes.excluded)}. Unresolved: ${list(buyBox.scopes.unresolved)}.`;
    case "economics":
      return `Ordinary minimum: ${formatMoney(buyBox.economics.ordinaryMinimumContractValue)}. Preferred range: ${formatMoney(buyBox.economics.preferredContractValueMin)} to ${formatMoney(buyBox.economics.preferredContractValueMax)}. Exceptions: ${list(buyBox.economics.strategicExceptions)}.`;
    case "customers":
      return `Core: ${list(buyBox.customerTypes.core)}. Selective: ${list(buyBox.customerTypes.selective)}. Excluded: ${list(buyBox.customerTypes.excluded)}.`;
    case "contacts":
      return buyBox.contactPreference.useBestAvailable
        ? "Use the best available named contact."
        : `Primary: ${buyBox.contactPreference.primary ?? "Not provided"}. Secondary: ${buyBox.contactPreference.secondary ?? "Not provided"}.`;
    case "timing":
      return `Earliest useful: ${buyBox.timing.earliestUsefulStage ?? "Not provided"}. Ideal: ${list(buyBox.timing.idealOutreachStages)}. Too late: ${buyBox.timing.tooLateStage ?? "Not provided"}.`;
    case "disqualifiers":
      return `Suppress: ${list(buyBox.screeningRules.suppress)}. Conditional: ${list(buyBox.screeningRules.conditional)}. Allow: ${list(buyBox.screeningRules.allow)}.`;
    case "capacity_examples":
      return `Review capacity: ${buyBox.capacity.leadsReviewablePerWeekday ?? "Not provided"} per weekday. Outreach capacity: ${buyBox.capacity.outreachActionsPerWeekday ?? "Not provided"} per weekday.`;
  }
}

function conciseSummary(buyBox: ElevateBuyBox) {
  return [
    "Elevate Buy Box v0.1",
    `Status: ${buyBox.approvedByCesar ? "Approved" : "Draft"}`,
    `Core markets: ${list(buyBox.serviceGeography.coreMarkets)}`,
    `Core scopes: ${list(buyBox.scopes.core)}`,
    `Selective scopes: ${list(buyBox.scopes.selective)}`,
    `Ordinary minimum: ${formatMoney(buyBox.economics.ordinaryMinimumContractValue)}`,
    `Preferred range: ${formatMoney(buyBox.economics.preferredContractValueMin)}–${formatMoney(buyBox.economics.preferredContractValueMax)}`,
    `Preferred customers: ${list(buyBox.preferredCustomerTypes)}`,
    `Ideal outreach: ${list(buyBox.timing.idealOutreachStages)}`,
    `Suppress: ${list(buyBox.screeningRules.suppress)}`,
    `Daily capacity: review ${buyBox.capacity.leadsReviewablePerWeekday ?? "not provided"}; outreach ${buyBox.capacity.outreachActionsPerWeekday ?? "not provided"}`,
    `Unresolved: ${list(buyBox.unresolvedQuestions)}`,
    buyBox.approvedAt ? `Approved by Cesar at ${buyBox.approvedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function markdownPacket(
  buyBox: ElevateBuyBox,
  transcript: TranscriptMessage[],
) {
  const bullets = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
  return `# Elevate Buy Box v0.1

- **Participant:** Cesar
- **Company:** Elevate
- **Status:** ${buyBox.approvedByCesar ? "Approved" : "Draft"}
- **Approved at:** ${buyBox.approvedAt ?? "Not approved"}
- **Confidence:** ${buyBox.confidence}

## Service area

**Core**
${bullets(buyBox.serviceGeography.coreMarkets)}

**Selective**
${bullets(buyBox.serviceGeography.selectiveMarkets)}

**Excluded**
${bullets(buyBox.serviceGeography.excludedMarkets)}

**Mobilization note:** ${buyBox.serviceGeography.mobilizationNotes ?? "None"}

## Desired ROW scopes

**Core**
${bullets(buyBox.scopes.core)}

**Selective**
${bullets(buyBox.scopes.selective)}

**Excluded**
${bullets(buyBox.scopes.excluded)}

**Unresolved**
${bullets(buyBox.scopes.unresolved)}

## Project economics

- Ordinary minimum: ${formatMoney(buyBox.economics.ordinaryMinimumContractValue)}
- Preferred range: ${formatMoney(buyBox.economics.preferredContractValueMin)}–${formatMoney(buyBox.economics.preferredContractValueMax)}
- Obvious exceptions: ${list(buyBox.economics.strategicExceptions)}

## Preferred customer types

**Core**
${bullets(buyBox.customerTypes.core)}

**Selective**
${bullets(buyBox.customerTypes.selective)}

**Excluded**
${bullets(buyBox.customerTypes.excluded)}

## Contact preference

- Primary: ${buyBox.contactPreference.primary ?? "Not provided"}
- Secondary: ${buyBox.contactPreference.secondary ?? "Not provided"}
- Use best available: ${buyBox.contactPreference.useBestAvailable ? "Yes" : "No"}

## Lead timing

- Earliest useful: ${buyBox.timing.earliestUsefulStage ?? "Not provided"}
- Ideal: ${list(buyBox.timing.idealOutreachStages)}
- Too late: ${buyBox.timing.tooLateStage ?? "Not provided"}

## Screening rules

**Suppress**
${bullets(buyBox.screeningRules.suppress)}

**Conditional**
${bullets(buyBox.screeningRules.conditional)}

**Allow**
${bullets(buyBox.screeningRules.allow)}

## Pursuit capacity

- Leads reviewable per weekday: ${buyBox.capacity.leadsReviewablePerWeekday ?? "Not provided"}
- Outreach actions per weekday: ${buyBox.capacity.outreachActionsPerWeekday ?? "Not provided"}
- Follow-up owner: ${buyBox.capacity.followUpOwner ?? "Not provided"}
- Expected response time: ${buyBox.capacity.expectedResponseTime ?? "Not provided"}

## Good-fit examples
${bullets(buyBox.goodFitExamples)}

## Bad-fit examples
${bullets(buyBox.badFitExamples)}

## Unresolved
${bullets(buyBox.unresolvedQuestions)}

## Interview notes

${transcript.length ? transcript.map((message) => `- **${message.role === "assistant" ? "TruLot" : "Cesar"} (${message.section ? sectionTitle(message.section) : "Interview"}):** ${message.content}`).join("\n") : "- None"}
`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function SummaryCard({
  section,
  status,
  buyBox,
  onEdit,
}: {
  section: InterviewSectionId;
  status: SectionStatus;
  buyBox: ElevateBuyBox;
  onEdit?: () => void;
}) {
  return (
    <article
      className="rounded-2xl border border-white/[0.08] bg-black/10 p-4"
      data-testid={`summary-${section}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">
              {sectionTitle(section)}
            </h3>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-white/45 uppercase">
              {status}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/58">
            {status === "skipped"
              ? "Skipped for now."
              : sectionAnswerText(section, buyBox)}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-xs font-semibold text-[#e8c79e] underline decoration-[#d89a52]/40 underline-offset-4"
          >
            Edit
          </button>
        )}
      </div>
    </article>
  );
}

function ApprovedActions({
  buyBox,
  transcript,
  resultsEmail,
}: {
  buyBox: ElevateBuyBox;
  transcript: TranscriptMessage[];
  resultsEmail: string;
}) {
  const [copied, setCopied] = useState<"summary" | "transcript" | null>(null);
  const summary = conciseSummary(buyBox);
  const markdown = markdownPacket(buyBox, transcript);
  const emailHref = resultsEmail
    ? `mailto:${encodeURIComponent(resultsEmail)}?subject=${encodeURIComponent("Approved Elevate Buy Box v0.1")}&body=${encodeURIComponent(summary)}`
    : null;
  const copy = async (kind: "summary" | "transcript", value: string) => {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <section
      className="mt-8 rounded-3xl border border-emerald-300/20 bg-emerald-200/[0.06] p-6 sm:p-8"
      data-testid="approved-actions"
    >
      <p className="font-mono text-xs tracking-[0.16em] text-emerald-200 uppercase">
        ✓ Approved
      </p>
      <h2 className="mt-2 text-2xl font-semibold">
        Elevate’s buy box is ready.
      </h2>
      <p className="mt-2 text-sm leading-6 text-white/55">
        Download the complete pilot record or send Brian the concise approved
        summary.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() =>
            downloadFile("elevate-buy-box-v0.1.md", markdown, "text/markdown")
          }
          className={buttonClass}
        >
          Download Markdown
        </button>
        <button
          type="button"
          onClick={() =>
            downloadFile(
              "elevate-buy-box-v0.1.json",
              JSON.stringify({ buyBox, transcript }, null, 2),
              "application/json",
            )
          }
          className={buttonClass}
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={() => void copy("summary", summary)}
          className={buttonClass}
        >
          {copied === "summary" ? "Summary copied" : "Copy summary"}
        </button>
        <button
          type="button"
          onClick={() =>
            void copy(
              "transcript",
              transcript
                .map(
                  (message) =>
                    `${message.role === "assistant" ? "TruLot" : "Cesar"}: ${message.content}`,
                )
                .join("\n\n"),
            )
          }
          className={buttonClass}
        >
          {copied === "transcript"
            ? "Transcript copied"
            : "Copy full transcript"}
        </button>
        {emailHref ? (
          <a
            href={emailHref}
            data-testid="email-summary"
            className="rounded-xl bg-[#d89a52] px-4 py-3 text-center text-sm font-semibold text-[#17120c] transition hover:bg-[#e4aa69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f1e8]"
          >
            Email summary to Brian
          </a>
        ) : (
          <span className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-white/35">
            Results email not configured
          </span>
        )}
      </div>
    </section>
  );
}

function restoreSavedInterview(raw: string): SavedInterview | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SavedInterview>;
    if (parsed.version !== 2) return null;
    const answers = structuredInterviewAnswersSchema.safeParse(parsed.answers);
    if (!answers.success || !parsed.sectionStatus) return null;
    const sectionStatus = Object.fromEntries(
      INTERVIEW_SECTIONS.map(({ id }) => {
        const status = sectionStatusSchema.safeParse(parsed.sectionStatus?.[id]);
        return [id, status.success ? status.data : "pending"];
      }),
    ) as Record<InterviewSectionId, SectionStatus>;
    const activeView =
      parsed.activeView === "review"
        ? "review"
        : interviewSectionIdSchema.safeParse(parsed.activeView).success
          ? (parsed.activeView as InterviewSectionId)
          : "service_area";
    const clarification =
      parsed.clarification &&
      interviewSectionIdSchema.safeParse(parsed.clarification.section).success &&
      typeof parsed.clarification.question === "string" &&
      typeof parsed.clarification.answer === "string"
        ? parsed.clarification
        : null;
    return {
      version: 2,
      activeView,
      answers: answers.data,
      sectionStatus,
      clarificationCounts: Object.fromEntries(
        INTERVIEW_SECTIONS.map(({ id }) => [
          id,
          Math.min(1, Math.max(0, parsed.clarificationCounts?.[id] ?? 0)),
        ]),
      ) as Record<InterviewSectionId, number>,
      clarification,
      transcript: Array.isArray(parsed.transcript)
        ? parsed.transcript.filter(
            (message): message is TranscriptMessage =>
              Boolean(
                message &&
                  (message.role === "assistant" || message.role === "user") &&
                  typeof message.content === "string",
              ),
          )
        : [],
      approvedAt:
        typeof parsed.approvedAt === "string" ? parsed.approvedAt : null,
      editReturnToReview: Boolean(parsed.editReturnToReview),
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function ElevateInterview({
  token,
  resultsEmail,
  showMockLabel,
}: {
  token: string;
  resultsEmail: string;
  showMockLabel: boolean;
}) {
  const [answers, setAnswers] = useState(createInitialAnswers);
  const [sectionStatus, setSectionStatus] = useState(
    createInitialSectionStatus,
  );
  const [activeView, setActiveView] = useState<ActiveView>("service_area");
  const [clarificationCounts, setClarificationCounts] = useState(
    newClarificationCounts,
  );
  const [clarification, setClarification] = useState<Clarification | null>(
    null,
  );
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [editReturnToReview, setEditReturnToReview] = useState(false);
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((hash) => {
        if (!active) return;
        const suffix = Array.from(new Uint8Array(hash).slice(0, 12))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        setStorageKey(`trulot:elevate-interview:v2:${suffix}`);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const restored = raw ? restoreSavedInterview(raw) : null;
    if (restored) {
      setAnswers(restored.answers);
      setSectionStatus(restored.sectionStatus);
      setActiveView(restored.activeView);
      setClarificationCounts(restored.clarificationCounts);
      setClarification(restored.clarification);
      setTranscript(restored.transcript);
      setApprovedAt(restored.approvedAt);
      setEditReturnToReview(restored.editReturnToReview);
    } else if (raw) {
      localStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const saved: SavedInterview = {
      version: 2,
      activeView,
      answers,
      sectionStatus,
      clarificationCounts,
      clarification,
      transcript,
      approvedAt,
      editReturnToReview,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [
    activeView,
    answers,
    approvedAt,
    clarification,
    clarificationCounts,
    editReturnToReview,
    hydrated,
    sectionStatus,
    storageKey,
    transcript,
  ]);

  const buyBox = useMemo(
    () => buildElevateBuyBox(answers, sectionStatus, { approvedAt }),
    [answers, approvedAt, sectionStatus],
  );
  const completeCount = INTERVIEW_SECTIONS.filter(
    ({ id }) => sectionStatus[id] !== "pending",
  ).length;
  const progressPercent =
    activeView === "review" ? 100 : Math.round((completeCount / 8) * 100);

  const advance = useCallback(
    (section: InterviewSectionId) => {
      setClarification(null);
      if (editReturnToReview) {
        setEditReturnToReview(false);
        setActiveView("review");
      } else {
        setActiveView(nextSection(section));
      }
    },
    [editReturnToReview],
  );

  const requestCoach = useCallback(
    async (
      section: InterviewSectionId,
      status: SectionStatus,
      clarificationAnswer: string | null,
    ) => {
      setPending(true);
      setError(null);
      const sectionBuyBox = buildElevateBuyBox(answers, {
        ...sectionStatus,
        [section]: status,
      });
      const submitted: TranscriptMessage = {
        role: "user",
        section,
        content:
          clarificationAnswer?.trim() || sectionAnswerText(section, sectionBuyBox),
      };
      const nextTranscript = [...transcript, submitted].slice(-50);
      try {
        const response = await fetch("/api/elevate/interview", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elevate-interview-token": token,
          },
          body: JSON.stringify({
            activeSection: section,
            answers,
            transcript: nextTranscript,
            clarificationAlreadyAsked: clarificationCounts[section] > 0,
            clarificationAnswer,
          }),
        });
        const payload = sectionCoachResponseSchema.safeParse(
          await response.json(),
        );
        if (!response.ok || !payload.success) {
          throw new Error("This section could not be saved. Please try again.");
        }
        const assistantMessage: TranscriptMessage = {
          role: "assistant",
          section,
          content: payload.data.assistantMessage,
        };
        setTranscript([...nextTranscript, assistantMessage]);
        if (
          payload.data.requiresClarification &&
          payload.data.clarificationQuestion &&
          clarificationCounts[section] === 0 &&
          !clarificationAnswer
        ) {
          setClarificationCounts((counts) => ({ ...counts, [section]: 1 }));
          setClarification({
            section,
            question: payload.data.clarificationQuestion,
            answer: "",
          });
        } else {
          setSectionStatus((statuses) => ({ ...statuses, [section]: status }));
          advance(section);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "This section could not be saved. Please try again.",
        );
      } finally {
        setPending(false);
      }
    },
    [
      advance,
      answers,
      clarificationCounts,
      sectionStatus,
      token,
      transcript,
    ],
  );

  const continueSection = (status: SectionStatus) => {
    if (activeView === "review") return;
    void requestCoach(activeView, status, null);
  };

  const skipSection = () => {
    if (activeView === "review") return;
    setSectionStatus((statuses) => ({
      ...statuses,
      [activeView]: "skipped",
    }));
    setTranscript((messages) => [
      ...messages,
      {
        role: "user",
        section: activeView,
        content: `${sectionTitle(activeView)} skipped for now.`,
      },
    ]);
    advance(activeView);
  };

  const sendClarification = () => {
    if (!clarification?.answer.trim()) return;
    void requestCoach(
      clarification.section,
      sectionStatus[clarification.section] === "unresolved"
        ? "unresolved"
        : "completed",
      clarification.answer,
    );
  };

  const leaveClarificationUnresolved = () => {
    if (!clarification) return;
    setSectionStatus((statuses) => ({
      ...statuses,
      [clarification.section]: "unresolved",
    }));
    setTranscript((messages) => [
      ...messages,
      {
        role: "user",
        section: clarification.section,
        content: "Clarification left unresolved for review.",
      },
    ]);
    advance(clarification.section);
  };

  const editSection = (section: InterviewSectionId) => {
    setApprovedAt(null);
    setClarification(null);
    setEditReturnToReview(true);
    setActiveView(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const restart = () => {
    if (
      !window.confirm(
        "Restart the interview? This clears the saved v0.1 answers and approval on this device.",
      )
    ) {
      return;
    }
    if (storageKey) localStorage.removeItem(storageKey);
    setAnswers(createInitialAnswers());
    setSectionStatus(createInitialSectionStatus());
    setActiveView("service_area");
    setClarificationCounts(newClarificationCounts());
    setClarification(null);
    setTranscript([{ role: "assistant", content: OPENING_MESSAGE }]);
    setApprovedAt(null);
    setEditReturnToReview(false);
    setError(null);
  };

  const activeSection =
    activeView === "review"
      ? null
      : INTERVIEW_SECTIONS.find(({ id }) => id === activeView) ?? null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0c1117] text-[#f4f1e8]">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        aria-hidden="true"
      >
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-[#1f3b45]/20 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-[#d89a52]/[0.07] blur-3xl" />
      </div>

      <header className="relative border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d89a52]/50 bg-[#d89a52]/10 font-mono text-sm font-bold text-[#d89a52]">
              E
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[0.04em]">
                Elevate × TruLot
              </p>
              <p className="text-[11px] text-white/40">
                Private revenue-lead pilot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showMockLabel && (
              <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 font-mono text-[10px] tracking-wider text-sky-200 uppercase">
                Mock mode
              </span>
            )}
            <button
              type="button"
              onClick={restart}
              className="text-xs font-medium text-white/45 transition hover:text-white/80 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d89a52]"
            >
              Restart
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="mb-4 flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-[#d89a52] uppercase">
            <span className="h-px w-8 bg-[#d89a52]" aria-hidden="true" />
            Prepared specifically for Cesar and Elevate
          </p>
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            ROW Revenue
            <br />
            Opportunity Interview
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
            Eight focused sections define the first 20–30 opportunities. Most
            answers are one-click classifications, and you can edit every section
            before approval.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="min-w-0 rounded-3xl border border-white/[0.09] bg-[#111922]/95 shadow-2xl shadow-black/25">
            <div className="border-b border-white/[0.08] px-5 py-4 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">
                    {activeSection?.title ?? "Review and approve"}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">
                    {hydrated
                      ? "Saved on this device"
                      : "Restoring saved interview…"}
                  </p>
                </div>
                <span className="font-mono text-xs text-[#d89a52]">
                  {progressPercent}% defined
                </span>
              </div>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                role="progressbar"
                aria-label="Interview progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#b87333,#e7b674)] transition-[width] duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {activeSection && (
                <>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#d89a52] uppercase">
                      Section{" "}
                      {INTERVIEW_SECTIONS.findIndex(
                        ({ id }) => id === activeView,
                      ) + 1}{" "}
                      of 8
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/50">
                      {activeSection.description}
                    </p>
                  </div>
                  {clarification ? (
                    <div
                      className="rounded-2xl border border-[#d89a52]/25 bg-[#d89a52]/[0.06] p-5"
                      data-testid="clarification"
                    >
                      <p className="font-mono text-[10px] tracking-wider text-[#e8c79e] uppercase">
                        One clarification
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/75">
                        {clarification.question}
                      </p>
                      <label
                        htmlFor="clarification-answer"
                        className="mt-4 block text-sm text-white/60"
                      >
                        Your answer
                      </label>
                      <textarea
                        id="clarification-answer"
                        value={clarification.answer}
                        onChange={(event) =>
                          setClarification({
                            ...clarification,
                            answer: event.target.value,
                          })
                        }
                        rows={4}
                        maxLength={4000}
                        className="mt-2 max-h-56 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-[#0c1117] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d89a52]/65"
                        placeholder="Add only the detail that resolves this point."
                      />
                      <div className="mt-4 flex flex-wrap justify-between gap-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={leaveClarificationUnresolved}
                          className="px-2 py-2 text-sm text-white/45"
                        >
                          Continue with unresolved
                        </button>
                        <button
                          type="button"
                          disabled={!clarification.answer.trim() || pending}
                          onClick={sendClarification}
                          className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] disabled:opacity-40"
                        >
                          {pending ? "Saving…" : "Send"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <InterviewSectionForm
                      section={activeSection.id}
                      answers={answers}
                      onChange={setAnswers}
                      onContinue={continueSection}
                      onSkip={skipSection}
                      pending={pending}
                    />
                  )}
                  {error && (
                    <div
                      className="rounded-xl border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}
                </>
              )}

              {activeView === "review" && (
                <div data-testid="review">
                  <div className="mb-5">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#d89a52] uppercase">
                      Elevate Buy Box v0.1
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      Review the exact selections.
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-white/50">
                      Edit any section without losing later answers. Approval
                      records this version for the first manual opportunity
                      batch.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {INTERVIEW_SECTIONS.map(({ id }) => (
                      <SummaryCard
                        key={id}
                        section={id}
                        status={sectionStatus[id]}
                        buyBox={buyBox}
                        onEdit={() => editSection(id)}
                      />
                    ))}
                  </div>
                  {buyBox.unresolvedQuestions.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-200/[0.05] p-4">
                      <h3 className="text-sm font-semibold text-amber-100">
                        Visible unresolved items
                      </h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/70">
                        {buyBox.unresolvedQuestions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!approvedAt ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setShowEditPrompt(true)}
                        className={buttonClass}
                      >
                        I need to correct something
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedAt(new Date().toISOString())}
                        className="rounded-xl bg-[#d89a52] px-5 py-3.5 text-sm font-semibold text-[#17120c] transition hover:bg-[#e4aa69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f1e8]"
                      >
                        That looks right
                      </button>
                      {showEditPrompt && (
                        <p
                          className="text-sm leading-6 text-[#e8c79e] sm:col-span-2"
                          role="status"
                        >
                          Choose Edit on the section you want to correct. All
                          other answers will stay in place.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-5 text-sm text-emerald-200">
                      ✓ Approved by Cesar
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-6 lg:sticky lg:top-6">
            <p className="font-mono text-[10px] tracking-[0.18em] text-white/35 uppercase">
              First 20–30 opportunities
            </p>
            <h2 className="mt-2 text-lg font-semibold">Interview sequence</h2>
            <ol className="mt-5 space-y-3">
              {INTERVIEW_SECTIONS.map((section, index) => {
                const status = sectionStatus[section.id];
                const current = activeView === section.id;
                return (
                  <li
                    key={section.id}
                    className="flex items-center gap-3 text-sm"
                    aria-current={current ? "step" : undefined}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        status !== "pending"
                          ? "border-[#d89a52] bg-[#d89a52] text-[#17120c]"
                          : current
                            ? "border-[#d89a52] text-[#e8c79e]"
                            : "border-white/15 text-white/30"
                      }`}
                    >
                      {status !== "pending" ? "✓" : index + 1}
                    </span>
                    <span
                      className={
                        current ? "font-medium text-white" : "text-white/50"
                      }
                    >
                      {section.shortTitle}
                      {status === "skipped" ? " · skipped" : ""}
                      {status === "unresolved" ? " · unresolved" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 border-t border-white/[0.08] pt-5 text-xs leading-5 text-white/35">
              Progress stays on this device and is isolated to this private
              invite. Older freeform-session data is intentionally not loaded
              into the revised interview.
            </div>
          </aside>
        </div>

        {activeView === "review" && approvedAt && (
          <ApprovedActions
            buyBox={buyBox}
            transcript={transcript}
            resultsEmail={resultsEmail}
          />
        )}
      </div>

      <footer className="relative border-t border-white/[0.07] px-5 py-6 text-center text-[11px] text-white/25">
        Elevate × TruLot · Private ROW revenue-opportunity pilot
      </footer>
    </main>
  );
}
