"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  interviewSectionIdSchema,
  sectionCoachResponseSchema,
  sectionStatusSchema,
  structuredInterviewAnswersSchema,
  type InterviewSectionId,
  type SectionStatus,
  type SignalCalibrationSummary,
  type StructuredInterviewAnswers,
  type TranscriptMessage,
} from "@/lib/elevate-interview/schema";
import {
  buildSignalCalibrationSummary,
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
  version: 3;
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
  "Welcome, Cesar. TruLot already assumes San Diego County, any project size, and broad ROW scope. Four short steps will calibrate which public permit and project signals are worth sending, then produce the first 5–10 real leads for feedback.";

const buttonClass =
  "rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]";

function newClarificationCounts() {
  return Object.fromEntries(
    INTERVIEW_SECTIONS.map(({ id }) => [id, 0]),
  ) as Record<InterviewSectionId, number>;
}

function list(items: string[]) {
  return items.length ? items.join(", ") : "None selected";
}

function answerText(
  section: InterviewSectionId,
  summary: SignalCalibrationSummary,
) {
  if (section === "signals") {
    return `Send now: ${list(summary.signalPriority.sendNow)}. Supporting: ${list(summary.signalPriority.supporting)}. Ignore: ${list(summary.signalPriority.ignore)}.`;
  }
  if (section === "evidence") {
    return `Actionable evidence: ${list(summary.actionableEvidence)}.`;
  }
  if (section === "noise") {
    return `Suppress: ${list(summary.suppressions)}.`;
  }
  return `First batch: ${summary.delivery.firstBatchSize ?? "not selected"} leads. Timing: ${summary.delivery.deliverySpeed ?? "not selected"}.`;
}

function plainSummary(summary: SignalCalibrationSummary) {
  return [
    summary.title,
    `Status: ${summary.approvedByCesar ? "Approved" : "Draft"}`,
    "Assumptions: San Diego County; any project size; broad public ROW scope",
    `Send now: ${list(summary.signalPriority.sendNow)}`,
    `Supporting evidence signals: ${list(summary.signalPriority.supporting)}`,
    `Ignore: ${list(summary.signalPriority.ignore)}`,
    `Actionable evidence: ${list(summary.actionableEvidence)}`,
    `Suppress: ${list(summary.suppressions)}`,
    `First batch: ${summary.delivery.firstBatchSize ?? "not selected"} real leads`,
    `Delivery: ${summary.delivery.deliverySpeed ?? "not selected"}`,
    `Unresolved: ${list(summary.unresolvedQuestions)}`,
    summary.approvedAt ? `Approved by Cesar at ${summary.approvedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function markdownPacket(
  summary: SignalCalibrationSummary,
  transcript: TranscriptMessage[],
) {
  const bullets = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
  return `# Elevate Signal Calibration Summary

- **Participant:** Cesar
- **Status:** ${summary.approvedByCesar ? "Approved" : "Draft"}
- **Approved at:** ${summary.approvedAt ?? "Not approved"}

## Assumptions

- San Diego County
- Any project size
- Broad public right-of-way scope

## Send now
${bullets(summary.signalPriority.sendNow)}

## Supporting signals
${bullets(summary.signalPriority.supporting)}

## Ignore
${bullets(summary.signalPriority.ignore)}

## Actionable evidence
${bullets(summary.actionableEvidence)}

## Suppress obvious noise
${bullets(summary.suppressions)}

## First calibration batch

- Size: ${summary.delivery.firstBatchSize ?? "Not selected"} real leads
- Timing: ${summary.delivery.deliverySpeed ?? "Not selected"}
- Feedback owner: ${summary.delivery.feedbackOwner ?? "Not specified"}

## Unresolved
${bullets(summary.unresolvedQuestions)}

## Clarification notes
${transcript.length ? transcript.map((message) => `- **${message.role === "assistant" ? "TruLot" : "Cesar"}:** ${message.content}`).join("\n") : "- None"}
`;
}

function download(filename: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
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

function restore(raw: string): SavedInterview | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SavedInterview>;
    if (parsed.version !== 3) return null;
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
          : "signals";
    return {
      version: 3,
      activeView,
      answers: answers.data,
      sectionStatus,
      clarificationCounts: Object.fromEntries(
        INTERVIEW_SECTIONS.map(({ id }) => [
          id,
          Math.min(1, Math.max(0, parsed.clarificationCounts?.[id] ?? 0)),
        ]),
      ) as Record<InterviewSectionId, number>,
      clarification:
        parsed.clarification &&
        interviewSectionIdSchema.safeParse(parsed.clarification.section).success
          ? parsed.clarification
          : null,
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

function ReviewCard({
  section,
  status,
  summary,
  onEdit,
}: {
  section: InterviewSectionId;
  status: SectionStatus;
  summary: SignalCalibrationSummary;
  onEdit: () => void;
}) {
  return (
    <article
      className="rounded-2xl border border-white/[0.08] bg-black/10 p-4"
      data-testid={`summary-${section}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{sectionTitle(section)}</h3>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] text-white/45 uppercase">
              {status}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/58">
            {status === "skipped" ? "Skipped for now." : answerText(section, summary)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs font-semibold text-[#e8c79e] underline underline-offset-4"
        >
          Edit
        </button>
      </div>
    </article>
  );
}

function ApprovedActions({
  summary,
  transcript,
  resultsEmail,
}: {
  summary: SignalCalibrationSummary;
  transcript: TranscriptMessage[];
  resultsEmail: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const plain = plainSummary(summary);
  const markdown = markdownPacket(summary, transcript);
  const emailHref = resultsEmail
    ? `mailto:${encodeURIComponent(resultsEmail)}?subject=${encodeURIComponent("Approved Elevate Signal Calibration Summary")}&body=${encodeURIComponent(plain)}`
    : null;
  const copy = async (kind: string, value: string) => {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
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
        Elevate’s signal calibration is ready.
      </h2>
      <p className="mt-2 text-sm text-white/55">
        TruLot can now assemble the first 5–10 real leads for feedback.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            download(
              "elevate-signal-calibration.md",
              markdown,
              "text/markdown",
            )
          }
        >
          Download Markdown
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            download(
              "elevate-signal-calibration.json",
              JSON.stringify({ summary, transcript }, null, 2),
              "application/json",
            )
          }
        >
          Download JSON
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void copy("summary", plain)}
        >
          {copied === "summary" ? "Summary copied" : "Copy summary"}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            void copy(
              "transcript",
              transcript
                .map(
                  ({ role, content }) =>
                    `${role === "assistant" ? "TruLot" : "Cesar"}: ${content}`,
                )
                .join("\n\n"),
            )
          }
        >
          {copied === "transcript"
            ? "Transcript copied"
            : "Copy clarification notes"}
        </button>
        {emailHref && (
          <a
            href={emailHref}
            data-testid="email-summary"
            className="rounded-xl bg-[#d89a52] px-4 py-3 text-center text-sm font-semibold text-[#17120c]"
          >
            Email summary to Brian
          </a>
        )}
      </div>
    </section>
  );
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
  const [statuses, setStatuses] = useState(createInitialSectionStatus);
  const [activeView, setActiveView] = useState<ActiveView>("signals");
  const [clarificationCounts, setClarificationCounts] = useState(
    newClarificationCounts,
  );
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [editReturnToReview, setEditReturnToReview] = useState(false);
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
        setStorageKey(`trulot:elevate-signal-calibration:v3:${suffix}`);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const saved = raw ? restore(raw) : null;
    if (saved) {
      setAnswers(saved.answers);
      setStatuses(saved.sectionStatus);
      setActiveView(saved.activeView);
      setClarificationCounts(saved.clarificationCounts);
      setClarification(saved.clarification);
      setTranscript(saved.transcript);
      setApprovedAt(saved.approvedAt);
      setEditReturnToReview(saved.editReturnToReview);
    } else if (raw) {
      localStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const saved: SavedInterview = {
      version: 3,
      activeView,
      answers,
      sectionStatus: statuses,
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
    statuses,
    storageKey,
    transcript,
  ]);

  const summary = useMemo(
    () => buildSignalCalibrationSummary(answers, statuses, { approvedAt }),
    [answers, approvedAt, statuses],
  );
  const completed = INTERVIEW_SECTIONS.filter(
    ({ id }) => statuses[id] !== "pending",
  ).length;
  const progress = activeView === "review" ? 100 : completed * 25;

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

  const coach = useCallback(
    async (
      section: InterviewSectionId,
      status: SectionStatus,
      clarificationAnswer: string | null,
    ) => {
      setPending(true);
      setError(null);
      const submittedSummary = buildSignalCalibrationSummary(answers, {
        ...statuses,
        [section]: status,
      });
      const userMessage: TranscriptMessage = {
        role: "user",
        section,
        content: clarificationAnswer?.trim() || answerText(section, submittedSummary),
      };
      const nextTranscript = [...transcript, userMessage].slice(-30);
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
        const parsed = sectionCoachResponseSchema.safeParse(
          await response.json(),
        );
        if (!response.ok || !parsed.success) throw new Error();
        setTranscript([
          ...nextTranscript,
          {
            role: "assistant",
            section,
            content: parsed.data.assistantMessage,
          },
        ]);
        if (
          parsed.data.requiresClarification &&
          parsed.data.clarificationQuestion &&
          clarificationCounts[section] === 0 &&
          !clarificationAnswer
        ) {
          setClarificationCounts((counts) => ({ ...counts, [section]: 1 }));
          setClarification({
            section,
            question: parsed.data.clarificationQuestion,
            answer: "",
          });
        } else {
          setStatuses((current) => ({ ...current, [section]: status }));
          advance(section);
        }
      } catch {
        setError("This step could not be saved. Your choices are still here.");
      } finally {
        setPending(false);
      }
    },
    [
      advance,
      answers,
      clarificationCounts,
      statuses,
      token,
      transcript,
    ],
  );

  const skip = () => {
    if (activeView === "review") return;
    setStatuses((current) => ({ ...current, [activeView]: "skipped" }));
    setTranscript((current) => [
      ...current,
      {
        role: "user",
        section: activeView,
        content: `${sectionTitle(activeView)} skipped for now.`,
      },
    ]);
    advance(activeView);
  };

  const edit = (section: InterviewSectionId) => {
    setApprovedAt(null);
    setClarification(null);
    setEditReturnToReview(true);
    setActiveView(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const restart = () => {
    if (!window.confirm("Restart signal calibration and clear this device?"))
      return;
    if (storageKey) localStorage.removeItem(storageKey);
    setAnswers(createInitialAnswers());
    setStatuses(createInitialSectionStatus());
    setActiveView("signals");
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
      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <p className="text-sm font-semibold">Elevate × TruLot</p>
            <p className="text-[11px] text-white/40">Private signal calibration</p>
          </div>
          <div className="flex items-center gap-3">
            {showMockLabel && (
              <span className="rounded-full border border-sky-300/20 px-3 py-1 text-[10px] text-sky-200 uppercase">
                Mock mode
              </span>
            )}
            <button
              type="button"
              onClick={restart}
              className="text-xs text-white/45 hover:text-white"
            >
              Restart
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="font-mono text-xs tracking-[0.16em] text-[#d89a52] uppercase">
          5–8 minute calibration
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Elevate Signal Calibration
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/55">
          Tell TruLot which public project signals are valuable. We will use the
          result to put 5–10 real San Diego ROW leads in Cesar’s hands quickly.
        </p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="rounded-3xl border border-white/[0.09] bg-[#111922]">
            <div className="border-b border-white/[0.08] p-5 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">
                    {activeSection?.title ?? "Review and approve"}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">
                    {hydrated ? "Saved on this device" : "Restoring…"}
                  </p>
                </div>
                <span className="font-mono text-xs text-[#d89a52]">
                  {progress}% complete
                </span>
              </div>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                role="progressbar"
                aria-label="Calibration progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full bg-[#d89a52] transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {activeSection && (
                <>
                  <div>
                    <p className="font-mono text-[10px] tracking-wider text-[#d89a52] uppercase">
                      Step{" "}
                      {INTERVIEW_SECTIONS.findIndex(
                        ({ id }) => id === activeSection.id,
                      ) + 1}{" "}
                      of 4
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
                      <p className="text-sm leading-6 text-white/75">
                        {clarification.question}
                      </p>
                      <textarea
                        aria-label="Clarification answer"
                        value={clarification.answer}
                        onChange={(event) =>
                          setClarification({
                            ...clarification,
                            answer: event.target.value,
                          })
                        }
                        rows={4}
                        className="mt-3 max-h-48 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-[#0c1117] p-3 text-sm"
                      />
                      <div className="mt-3 flex justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setStatuses((current) => ({
                              ...current,
                              [clarification.section]: "unresolved",
                            }));
                            advance(clarification.section);
                          }}
                          className="text-sm text-white/45"
                        >
                          Leave unresolved
                        </button>
                        <button
                          type="button"
                          disabled={!clarification.answer.trim() || pending}
                          onClick={() =>
                            void coach(
                              clarification.section,
                              "completed",
                              clarification.answer,
                            )
                          }
                          className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] disabled:opacity-40"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <InterviewSectionForm
                      section={activeSection.id}
                      answers={answers}
                      onChange={setAnswers}
                      onContinue={(status) =>
                        void coach(activeSection.id, status, null)
                      }
                      onSkip={skip}
                      pending={pending}
                    />
                  )}
                  {error && (
                    <p className="rounded-xl border border-red-300/20 p-3 text-sm text-red-100">
                      {error}
                    </p>
                  )}
                </>
              )}

              {activeView === "review" && (
                <div data-testid="review">
                  <p className="font-mono text-[10px] tracking-wider text-[#d89a52] uppercase">
                    Elevate Signal Calibration Summary
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    Ready for the first real leads.
                  </h2>
                  <div className="mt-5 rounded-2xl border border-[#d89a52]/20 p-4 text-sm text-white/65">
                    <strong className="text-white">Assumptions:</strong> San Diego
                    County · Any project size · Broad public ROW scope
                  </div>
                  <div className="mt-4 space-y-3">
                    {INTERVIEW_SECTIONS.map(({ id }) => (
                      <ReviewCard
                        key={id}
                        section={id}
                        status={statuses[id]}
                        summary={summary}
                        onEdit={() => edit(id)}
                      />
                    ))}
                  </div>
                  {!approvedAt ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <button type="button" className={buttonClass}>
                        Use Edit to correct something
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedAt(new Date().toISOString())}
                        className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c]"
                      >
                        That looks right
                      </button>
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
            <p className="font-mono text-[10px] text-white/35 uppercase">
              Short calibration
            </p>
            <ol className="mt-4 space-y-3">
              {INTERVIEW_SECTIONS.map((section, index) => {
                const status = statuses[section.id];
                const current = activeView === section.id;
                return (
                  <li
                    key={section.id}
                    aria-current={current ? "step" : undefined}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${
                        status !== "pending"
                          ? "border-[#d89a52] bg-[#d89a52] text-[#17120c]"
                          : current
                            ? "border-[#d89a52] text-[#e8c79e]"
                            : "border-white/15 text-white/30"
                      }`}
                    >
                      {status !== "pending" ? "✓" : index + 1}
                    </span>
                    <span className={current ? "text-white" : "text-white/50"}>
                      {section.shortTitle}
                      {status === "skipped" ? " · skipped" : ""}
                      {status === "unresolved" ? " · unresolved" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-6 border-t border-white/[0.08] pt-5 text-xs leading-5 text-white/35">
              Progress is stored only on this device under a private,
              token-derived key. Older questionnaire sessions are not imported.
            </p>
          </aside>
        </div>

        {activeView === "review" && approvedAt && (
          <ApprovedActions
            summary={summary}
            transcript={transcript}
            resultsEmail={resultsEmail}
          />
        )}
      </div>
    </main>
  );
}
