"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  ElevateBuyBox,
  InterviewTurn,
  TranscriptMessage,
} from "@/lib/elevate-interview/schema";

const OPENING_MESSAGE =
  "Hi Cesar — Brian and TruLot are building a system to identify construction projects that may need Elevate’s right-of-way capabilities.\n\nThis discussion will help us define exactly which opportunities are worth putting in front of you, when they become actionable, and who you would want to contact.\n\nI’ll ask one focused question at a time, and I may ask follow-ups where the details affect lead quality. At the end, I’ll summarize Elevate’s proposed opportunity buy box for your approval.\n\nLet’s start with geography: where will Elevate actively pursue work today?";

const INITIAL_TURN: InterviewTurn = {
  assistantMessage: OPENING_MESSAGE,
  questionKey: "geography",
  suggestedReplies: [
    "San Diego County",
    "San Diego plus nearby counties",
    "I’ll describe our service area",
  ],
  progressPercent: 8,
  status: "interviewing",
  coveredTopics: [],
  unresolvedTopics: [
    "geography",
    "scopes",
    "economics",
    "customers",
    "timing",
    "capacity",
    "examples",
  ],
  potentialContradictions: [],
  buyBoxDraft: null,
};

type SavedInterview = {
  version: 1;
  transcript: TranscriptMessage[];
  currentTurn: InterviewTurn;
  updatedAt: string;
};

const TOPICS = [
  "Service area",
  "Desired ROW scopes",
  "Ideal project size",
  "Preferred customers",
  "Best outreach timing",
  "Disqualifiers",
  "Pursuit capacity",
];

function formatMoney(value: number | null) {
  if (value === null) return "Not yet provided";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function listOrPending(items: string[]) {
  return items.length ? items.join(", ") : "Not yet provided";
}

function conciseSummary(buyBox: ElevateBuyBox) {
  return [
    "Elevate Buy Box v0.1",
    `Prepared for ${buyBox.participantName} at ${buyBox.companyName}`,
    "",
    `Core markets: ${listOrPending(buyBox.serviceGeography.coreMarkets)}`,
    `Core scopes: ${listOrPending(buyBox.scopes.core)}`,
    `Selective scopes: ${listOrPending(buyBox.scopes.selective)}`,
    `Ordinary minimum: ${formatMoney(buyBox.economics.ordinaryMinimumContractValue)}`,
    `Preferred range: ${formatMoney(buyBox.economics.preferredContractValueMin)}–${formatMoney(buyBox.economics.preferredContractValueMax)}`,
    `Preferred customers: ${listOrPending(buyBox.preferredCustomerTypes)}`,
    `Ideal outreach: ${buyBox.timing.idealOutreachStage ?? "Not yet provided"}`,
    `Hard disqualifiers: ${listOrPending(buyBox.disqualifiers)}`,
    `Daily capacity: review ${buyBox.capacity.leadsReviewablePerWeekday ?? "?"}; outreach ${buyBox.capacity.outreachActionsPerWeekday ?? "?"}`,
    `Unresolved: ${listOrPending(buyBox.unresolvedQuestions)}`,
    "",
    buyBox.approvedByCesar
      ? `Approved by Cesar at ${buyBox.approvedAt}`
      : "Draft — awaiting Cesar’s approval",
  ].join("\n");
}

function markdownPacket(buyBox: ElevateBuyBox, transcript: TranscriptMessage[]) {
  const bullets = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- Not yet provided";

  return `# Elevate Buy Box v0.1

- **Participant:** ${buyBox.participantName}
- **Company:** ${buyBox.companyName}
- **Status:** ${buyBox.approvedByCesar ? "Approved by Cesar" : "Draft"}
- **Approved at:** ${buyBox.approvedAt ?? "Not approved"}
- **Confidence:** ${buyBox.confidence}

## Service geography

### Core markets
${bullets(buyBox.serviceGeography.coreMarkets)}

### Selective markets
${bullets(buyBox.serviceGeography.selectiveMarkets)}

### Excluded markets
${bullets(buyBox.serviceGeography.excludedMarkets)}

**Mobilization notes:** ${buyBox.serviceGeography.mobilizationNotes ?? "None provided"}

## ROW scopes

### Core
${bullets(buyBox.scopes.core)}

### Selective
${bullets(buyBox.scopes.selective)}

### Excluded
${bullets(buyBox.scopes.excluded)}

**Notes:** ${buyBox.scopes.notes ?? "None provided"}

## Economics

- Ordinary minimum contract value: ${formatMoney(buyBox.economics.ordinaryMinimumContractValue)}
- Preferred contract value: ${formatMoney(buyBox.economics.preferredContractValueMin)}–${formatMoney(buyBox.economics.preferredContractValueMax)}
- Minimum gross profit: ${formatMoney(buyBox.economics.minimumGrossProfit)}

### Strategic exceptions
${bullets(buyBox.economics.strategicExceptions)}

## Project and customer fit

**Preferred project types**
${bullets(buyBox.preferredProjectTypes)}

**Excluded project types**
${bullets(buyBox.excludedProjectTypes)}

**Preferred customer types**
${bullets(buyBox.preferredCustomerTypes)}

**Target accounts**
${bullets(buyBox.targetAccounts)}

**Existing customers / suppress**
${bullets(buyBox.existingCustomers)}

**Do not contact**
${bullets(buyBox.doNotContactAccounts)}

**Preferred contact roles**
${bullets(buyBox.preferredContactRoles)}

## Timing

- Earliest useful stage: ${buyBox.timing.earliestUsefulStage ?? "Not yet provided"}
- Ideal outreach stage: ${buyBox.timing.idealOutreachStage ?? "Not yet provided"}
- Too-late stage: ${buyBox.timing.tooLateStage ?? "Not yet provided"}
- Notes: ${buyBox.timing.timingNotes ?? "None provided"}

## Disqualifiers
${bullets(buyBox.disqualifiers)}

## Pursuit capacity

- Leads reviewable per weekday: ${buyBox.capacity.leadsReviewablePerWeekday ?? "Not yet provided"}
- Outreach actions per weekday: ${buyBox.capacity.outreachActionsPerWeekday ?? "Not yet provided"}
- Follow-up owner: ${buyBox.capacity.followUpOwner ?? "Not yet provided"}
- Expected response time: ${buyBox.capacity.expectedResponseTime ?? "Not yet provided"}

## Examples

**Good fit**
${bullets(buyBox.goodFitExamples)}

**Bad fit**
${bullets(buyBox.badFitExamples)}

## Unresolved questions
${bullets(buyBox.unresolvedQuestions)}

## Full interview transcript

${transcript
  .map(
    (message) =>
      `### ${message.role === "assistant" ? "TruLot interviewer" : "Cesar"}\n\n${message.content}`,
  )
  .join("\n\n")}
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
    return;
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="grid gap-1 border-b border-white/[0.07] py-3 last:border-0 sm:grid-cols-[11rem_1fr]">
      <dt className="text-xs font-medium tracking-[0.08em] text-white/45 uppercase">{label}</dt>
      <dd className="text-sm leading-6 text-[#f4f1e8]">
        {value === null || value === "" ? "Not yet provided" : value}
      </dd>
    </div>
  );
}

function BuyBoxReview({
  buyBox,
  contradictions,
  onApprove,
  onCorrect,
}: {
  buyBox: ElevateBuyBox;
  contradictions: InterviewTurn["potentialContradictions"];
  onApprove: () => void;
  onCorrect: () => void;
}) {
  return (
    <section
      aria-labelledby="buy-box-title"
      className="mt-8 overflow-hidden rounded-3xl border border-[#d89a52]/30 bg-[#111922] shadow-2xl shadow-black/20"
      data-testid="buy-box-review"
    >
      <div className="border-b border-white/10 bg-[linear-gradient(120deg,rgba(216,154,82,0.18),transparent_55%)] p-6 sm:p-8">
        <p className="font-mono text-xs tracking-[0.2em] text-[#d89a52] uppercase">Draft for review</p>
        <h2 id="buy-box-title" className="mt-2 text-2xl font-semibold tracking-[-0.025em]">
          Elevate Buy Box v0.1
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          This is the proposed filter TruLot will use for the first manual batch of Elevate
          opportunities. Missing answers remain visible instead of being guessed.
        </p>
      </div>

      <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-5">
          <h3 className="mb-2 text-sm font-semibold text-[#d89a52]">Market & scope</h3>
          <dl>
            <DetailRow label="Core markets" value={listOrPending(buyBox.serviceGeography.coreMarkets)} />
            <DetailRow label="Selective markets" value={listOrPending(buyBox.serviceGeography.selectiveMarkets)} />
            <DetailRow label="Core scopes" value={listOrPending(buyBox.scopes.core)} />
            <DetailRow label="Selective scopes" value={listOrPending(buyBox.scopes.selective)} />
            <DetailRow label="Excluded scopes" value={listOrPending(buyBox.scopes.excluded)} />
          </dl>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-5">
          <h3 className="mb-2 text-sm font-semibold text-[#d89a52]">Economics & capacity</h3>
          <dl>
            <DetailRow label="Ordinary minimum" value={formatMoney(buyBox.economics.ordinaryMinimumContractValue)} />
            <DetailRow
              label="Preferred range"
              value={`${formatMoney(buyBox.economics.preferredContractValueMin)}–${formatMoney(buyBox.economics.preferredContractValueMax)}`}
            />
            <DetailRow label="Minimum gross profit" value={formatMoney(buyBox.economics.minimumGrossProfit)} />
            <DetailRow label="Leads / weekday" value={buyBox.capacity.leadsReviewablePerWeekday} />
            <DetailRow label="Outreach / weekday" value={buyBox.capacity.outreachActionsPerWeekday} />
          </dl>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-5">
          <h3 className="mb-2 text-sm font-semibold text-[#d89a52]">Customers & timing</h3>
          <dl>
            <DetailRow label="Customer types" value={listOrPending(buyBox.preferredCustomerTypes)} />
            <DetailRow label="Target accounts" value={listOrPending(buyBox.targetAccounts)} />
            <DetailRow label="Contact roles" value={listOrPending(buyBox.preferredContactRoles)} />
            <DetailRow label="Earliest signal" value={buyBox.timing.earliestUsefulStage} />
            <DetailRow label="Ideal outreach" value={buyBox.timing.idealOutreachStage} />
            <DetailRow label="Too late" value={buyBox.timing.tooLateStage} />
          </dl>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-5">
          <h3 className="mb-2 text-sm font-semibold text-[#d89a52]">Screening rules</h3>
          <dl>
            <DetailRow label="Project types" value={listOrPending(buyBox.preferredProjectTypes)} />
            <DetailRow label="Disqualifiers" value={listOrPending(buyBox.disqualifiers)} />
            <DetailRow label="Strategic exceptions" value={listOrPending(buyBox.economics.strategicExceptions)} />
            <DetailRow label="Good-fit example" value={listOrPending(buyBox.goodFitExamples)} />
            <DetailRow label="Bad-fit example" value={listOrPending(buyBox.badFitExamples)} />
          </dl>
        </div>
      </div>

      {(buyBox.unresolvedQuestions.length > 0 || contradictions.length > 0) && (
        <div className="mx-5 mb-5 rounded-2xl border border-amber-300/20 bg-amber-200/[0.05] p-5 sm:mx-8 sm:mb-8">
          <h3 className="text-sm font-semibold text-amber-200">Open items</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
            {buyBox.unresolvedQuestions.map((question) => (
              <li key={question} className="flex gap-2">
                <span className="text-[#d89a52]" aria-hidden="true">—</span>
                {question}
              </li>
            ))}
            {contradictions.map((contradiction) => (
              <li key={`${contradiction.topic}-${contradiction.explanation}`} className="flex gap-2">
                <span className="text-[#d89a52]" aria-hidden="true">—</span>
                <span>
                  <strong className="font-medium text-white/80">{contradiction.topic}:</strong>{" "}
                  {contradiction.explanation}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 bg-black/10 p-5 sm:flex-row sm:items-center sm:justify-end sm:p-8">
        <button
          type="button"
          onClick={onCorrect}
          className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white/75 transition hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
        >
          I need to correct something
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] transition hover:bg-[#e4aa69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f1e8]"
        >
          That looks right
        </button>
      </div>
    </section>
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
  const [copied, setCopied] = useState<string | null>(null);
  const summary = useMemo(() => conciseSummary(buyBox), [buyBox]);
  const markdown = useMemo(() => markdownPacket(buyBox, transcript), [buyBox, transcript]);

  const copy = async (label: string, value: string) => {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const emailHref = resultsEmail
    ? `mailto:${encodeURIComponent(resultsEmail)}?subject=${encodeURIComponent("Elevate Buy Box v0.1 — Cesar Interview Complete")}&body=${encodeURIComponent(`${summary}\n\nPlease attach the downloaded full Markdown or JSON packet if Brian needs the complete transcript.`)}`
    : "";

  return (
    <section className="mt-8 rounded-3xl border border-emerald-300/20 bg-emerald-200/[0.06] p-6 sm:p-8" data-testid="approved-actions">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-lg text-[#082017]" aria-hidden="true">
          ✓
        </div>
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-emerald-300 uppercase">Approved</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Elevate’s buy box is ready.</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Download the complete pilot record or send Brian the concise approved summary.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => downloadFile("elevate-buy-box-v0.1.md", markdown, "text/markdown")}
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
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
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={() => copy("summary", summary)}
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
        >
          {copied === "summary" ? "Summary copied" : "Copy summary"}
        </button>
        <button
          type="button"
          onClick={() =>
            copy(
              "transcript",
              transcript
                .map((message) => `${message.role === "assistant" ? "TruLot" : "Cesar"}:\n${message.content}`)
                .join("\n\n"),
            )
          }
          className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
        >
          {copied === "transcript" ? "Transcript copied" : "Copy full transcript"}
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

export function ElevateInterview({
  token,
  resultsEmail,
  showMockLabel,
}: {
  token: string;
  resultsEmail: string;
  showMockLabel: boolean;
}) {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [currentTurn, setCurrentTurn] = useState<InterviewTurn>(INITIAL_TURN);
  const [composer, setComposer] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    let active = true;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((hash) => {
        if (!active) return;
        const suffix = Array.from(new Uint8Array(hash).slice(0, 12))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        setStorageKey(`trulot:elevate-interview:v1:${suffix}`);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as SavedInterview;
        if (
          saved.version === 1 &&
          Array.isArray(saved.transcript) &&
          saved.transcript.length > 0 &&
          saved.currentTurn &&
          typeof saved.currentTurn.assistantMessage === "string"
        ) {
          setTranscript(saved.transcript);
          setCurrentTurn(saved.currentTurn);
        }
      }
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const saved: SavedInterview = {
      version: 1,
      transcript,
      currentTurn,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [currentTurn, hydrated, storageKey, transcript]);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [pendingMessage, transcript]);

  const handleTranscriptScroll = () => {
    const element = transcriptRef.current;
    if (!element) return;
    shouldAutoScroll.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const send = useCallback(
    async (message: string) => {
      const cleanMessage = message.trim();
      if (!cleanMessage || pendingMessage || currentTurn.status === "approved") return;

      setError(null);
      setPendingMessage(cleanMessage);
      shouldAutoScroll.current = true;
      const nextTranscript: TranscriptMessage[] = [
        ...transcript,
        { role: "user", content: cleanMessage },
      ];

      try {
        const response = await fetch("/api/elevate/interview", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elevate-interview-token": token,
          },
          body: JSON.stringify({ transcript: nextTranscript }),
        });
        const data = (await response.json()) as InterviewTurn | { error?: string };
        if (!response.ok || !("assistantMessage" in data)) {
          throw new Error("error" in data && data.error ? data.error : "Please try again.");
        }

        setTranscript([
          ...nextTranscript,
          { role: "assistant", content: data.assistantMessage },
        ]);
        setCurrentTurn(data);
        setComposer("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Please try again.");
      } finally {
        setPendingMessage(null);
      }
    },
    [currentTurn.status, pendingMessage, token, transcript],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(composer);
    }
  };

  const approve = () => {
    if (!currentTurn.buyBoxDraft) return;
    const approvedAt = new Date().toISOString();
    setCurrentTurn({
      ...currentTurn,
      status: "approved",
      buyBoxDraft: {
        ...currentTurn.buyBoxDraft,
        approvedByCesar: true,
        approvedAt,
      },
    });
  };

  const correct = () => {
    const correctionPrompt =
      "Absolutely. Tell me what needs to change, and I’ll revise the buy box without losing the rest of your answers.";
    setTranscript((messages) => [
      ...messages,
      { role: "assistant", content: correctionPrompt },
    ]);
    setCurrentTurn((turn) => ({
      ...turn,
      assistantMessage: correctionPrompt,
      questionKey: "draft_correction",
      status: "interviewing",
      suggestedReplies: [],
      progressPercent: 96,
    }));
    window.setTimeout(() => document.getElementById("elevate-response")?.focus(), 0);
  };

  const restart = () => {
    if (!window.confirm("Restart the interview? This clears the saved transcript and draft on this device.")) {
      return;
    }
    if (storageKey) localStorage.removeItem(storageKey);
    setTranscript([{ role: "assistant", content: OPENING_MESSAGE }]);
    setCurrentTurn(INITIAL_TURN);
    setComposer("");
    setError(null);
  };

  const lastUpdated = hydrated ? "Saved on this device" : "Restoring saved interview…";
  const draft = currentTurn.buyBoxDraft;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0c1117] text-[#f4f1e8]">
      <div className="pointer-events-none fixed inset-0 opacity-70" aria-hidden="true">
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
              <p className="text-sm font-semibold tracking-[0.04em]">Elevate × TruLot</p>
              <p className="text-[11px] text-white/40">Private revenue-lead pilot</p>
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
        <div className="mb-10 max-w-3xl">
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
            Define the projects worth pursuing, the moment they become actionable, and the
            relationships that can turn public signals into won work.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-white/[0.09] bg-[#111922]/95 shadow-2xl shadow-black/25">
            <div className="border-b border-white/[0.08] px-5 py-4 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Opportunity interview</h2>
                  <p className="mt-1 text-xs text-white/40">{lastUpdated}</p>
                </div>
                <span className="font-mono text-xs text-[#d89a52]">
                  {currentTurn.progressPercent}% defined
                </span>
              </div>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                role="progressbar"
                aria-label="Interview progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={currentTurn.progressPercent}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#b87333,#e7b674)] transition-[width] duration-500"
                  style={{ width: `${currentTurn.progressPercent}%` }}
                />
              </div>
            </div>

            <div
              ref={transcriptRef}
              onScroll={handleTranscriptScroll}
              className="max-h-[36rem] min-h-[26rem] space-y-6 overflow-y-auto px-5 py-6 sm:px-7"
              aria-live="polite"
              data-testid="transcript"
            >
              {transcript.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[88%] rounded-2xl rounded-br-md bg-[#d89a52] px-4 py-3 text-sm leading-6 text-[#17120c] sm:max-w-[75%]"
                        : "max-w-[92%] border-l-2 border-[#d89a52]/60 pl-4 text-[15px] leading-7 text-white/72 sm:max-w-[82%]"
                    }
                  >
                    {message.content.split("\n").map((line, lineIndex) => (
                      <span key={lineIndex}>
                        {line}
                        {lineIndex < message.content.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {pendingMessage && (
                <>
                  <div className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[#d89a52]/70 px-4 py-3 text-sm leading-6 text-[#17120c]">
                      {pendingMessage}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-4 text-xs text-white/35" role="status">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d89a52]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d89a52] [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d89a52] [animation-delay:300ms]" />
                    <span className="ml-1">Shaping the next question…</span>
                  </div>
                </>
              )}
            </div>

            {currentTurn.status === "interviewing" && (
              <div className="border-t border-white/[0.08] bg-black/10 p-4 sm:p-6">
                {currentTurn.suggestedReplies.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2" aria-label="Suggested responses">
                    {currentTurn.suggestedReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => void send(reply)}
                        disabled={Boolean(pendingMessage)}
                        className="rounded-full border border-[#d89a52]/25 bg-[#d89a52]/[0.07] px-3.5 py-2 text-left text-xs leading-5 text-[#e8c79e] transition hover:border-[#d89a52]/55 hover:bg-[#d89a52]/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                <label htmlFor="elevate-response" className="sr-only">
                  Your response
                </label>
                <div className="rounded-2xl border border-white/[0.11] bg-[#0c1117] p-2 focus-within:border-[#d89a52]/60 focus-within:ring-2 focus-within:ring-[#d89a52]/10">
                  <textarea
                    id="elevate-response"
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={Boolean(pendingMessage)}
                    rows={3}
                    maxLength={4000}
                    placeholder="Share what’s true for Elevate…"
                    className="block w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/25 disabled:opacity-60"
                  />
                  <div className="flex items-end justify-between gap-4 px-2 pb-1">
                    <span className="text-[10px] text-white/28">Enter to send · Shift+Enter for a new line</span>
                    <button
                      type="button"
                      onClick={() => void send(composer)}
                      disabled={!composer.trim() || Boolean(pendingMessage)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#d89a52] px-4 text-sm font-semibold text-[#17120c] transition hover:bg-[#e4aa69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f1e8] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Send
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-xs text-red-100" role="alert">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => void send(composer)}
                      className="shrink-0 font-semibold underline decoration-red-200/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <p className="mt-3 text-[11px] leading-5 text-white/30">
                  Please don’t include passwords, private financial-account information, or
                  anything you wouldn’t want included in the pilot record.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-6 lg:sticky lg:top-6">
            <p className="font-mono text-[10px] tracking-[0.18em] text-white/35 uppercase">
              First 20–30 opportunities
            </p>
            <h2 className="mt-2 text-lg font-semibold">What we’re defining</h2>
            <ul className="mt-5 space-y-3">
              {TOPICS.map((topic) => {
                const normalized = topic.toLowerCase();
                const covered = currentTurn.coveredTopics.some(
                  (coveredTopic) =>
                    normalized.includes(coveredTopic.toLowerCase()) ||
                    coveredTopic.toLowerCase().includes(normalized.split(" ")[0]),
                );
                return (
                  <li key={topic} className="flex items-center gap-3 text-sm text-white/55">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        covered
                          ? "border-[#d89a52] bg-[#d89a52] text-[#17120c]"
                          : "border-white/15 text-transparent"
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className={covered ? "text-white/80" : ""}>{topic}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 border-t border-white/[0.08] pt-5 text-xs leading-5 text-white/35">
              Your progress is stored only in this browser. Return with this private link to
              continue.
            </div>
          </aside>
        </div>

        {currentTurn.status === "ready_for_review" && draft && (
          <BuyBoxReview
            buyBox={draft}
            contradictions={currentTurn.potentialContradictions}
            onApprove={approve}
            onCorrect={correct}
          />
        )}

        {currentTurn.status === "approved" && draft && (
          <ApprovedActions buyBox={draft} transcript={transcript} resultsEmail={resultsEmail} />
        )}
      </div>

      <footer className="relative border-t border-white/[0.07] px-5 py-6 text-center text-[11px] text-white/25">
        Elevate × TruLot · Private ROW revenue-opportunity pilot
      </footer>
    </main>
  );
}
