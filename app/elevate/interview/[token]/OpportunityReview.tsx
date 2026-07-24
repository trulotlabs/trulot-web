"use client";

import { useEffect, useMemo, useState } from "react";
import {
  chatResponseSchema,
  enrichmentResultSchema,
  savedReviewSchema,
  type ChatMessage,
  type Contact,
  type EnrichmentResult,
  type LeadDecision,
  type LeadOutcome,
  type PilotBatch,
  type PilotLead,
  type SavedLeadReview,
  type SavedReview,
} from "@/lib/elevate-review/schema";

const DECISIONS: ReadonlyArray<{ value: LeadDecision; label: string }> = [
  { value: "call_now", label: "Call now" },
  { value: "call_later", label: "Call later" },
  { value: "pass", label: "Pass" },
  { value: "already_known", label: "Already known" },
];

const REASONS: Record<LeadDecision, readonly string[]> = {
  call_now: [
    "Scope looks real",
    "Timing looks right",
    "Contact route looks usable",
    "Need plans or more information",
    "Other",
  ],
  call_later: [
    "Too early",
    "Waiting for GC or estimator",
    "Waiting for permit milestone",
    "Follow up on a specified date",
    "Other",
  ],
  pass: [
    "Wrong timing",
    "Wrong scope",
    "Too small",
    "No useful contact",
    "Not a real opportunity",
    "Outside service area",
    "Other",
  ],
  already_known: [
    "Existing customer",
    "Already bid",
    "Already tracking",
    "Existing relationship",
    "Other",
  ],
};

const OUTCOMES: ReadonlyArray<{ value: LeadOutcome; label: string }> = [
  { value: "contacted", label: "Contacted" },
  { value: "reached_someone", label: "Reached someone" },
  { value: "wrong_contact", label: "Wrong contact" },
  { value: "existing_relationship", label: "Existing relationship" },
  { value: "row_scope_confirmed", label: "ROW scope confirmed" },
  { value: "plans_received", label: "Plans received" },
  { value: "bid_opportunity", label: "Bid opportunity" },
  { value: "bid_submitted", label: "Bid submitted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "no_response", label: "No response" },
];

const buttonClass =
  "rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2a65f] disabled:cursor-not-allowed disabled:opacity-40";
const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0a1118] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d89a52]/70";

function confidenceLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function experimentLabel(lead: PilotLead) {
  if (lead.experimentType === "routing_experiment") return "Routing experiment";
  if (lead.experimentType === "obvious_control") return "Obvious control";
  return "Proprietary discovery";
}

function createLeadReview(lead: PilotLead): SavedLeadReview {
  return {
    decision: null,
    reason: "",
    notes: "",
    saved: false,
    chatTranscript: [],
    enrichment: null,
    editedEmailSubject: lead.draftEmailSubject,
    editedEmailBody: lead.draftEmailBody,
    editedCallOpener: lead.suggestedCallOpener,
    contacted: false,
    outcome: null,
    outcomeNotes: "",
    estimatedOpportunityValue: "",
    followUpDate: "",
    updatedAt: new Date().toISOString(),
  };
}

function createReviews(leads: PilotBatch) {
  return Object.fromEntries(
    leads.map((lead) => [lead.leadId, createLeadReview(lead)]),
  ) as Record<string, SavedLeadReview>;
}

function restoreSavedReview(raw: string, leads: PilotBatch): SavedReview | null {
  try {
    const parsed = savedReviewSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const validIds = new Set(leads.map((lead) => lead.leadId));
    if (!validIds.has(parsed.data.activeLeadId)) return null;
    const reviews = createReviews(leads);
    for (const lead of leads) {
      const saved = parsed.data.reviews[lead.leadId];
      if (saved) reviews[lead.leadId] = saved;
    }
    return { ...parsed.data, reviews };
  } catch {
    return null;
  }
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

function conciseSummary(
  leads: PilotBatch,
  reviews: Record<string, SavedLeadReview>,
) {
  return [
    "Elevate ROW Opportunity Review",
    ...leads.map((lead) => {
      const review = reviews[lead.leadId];
      return `${lead.address}: ${review?.decision ? humanize(review.decision) : "Not reviewed"}${review?.reason ? ` — ${review.reason}` : ""}`;
    }),
  ].join("\n");
}

function markdownReview(
  leads: PilotBatch,
  reviews: Record<string, SavedLeadReview>,
) {
  return `# Elevate ROW Opportunity Review

Generated: ${new Date().toISOString()}

${leads
  .map((lead) => {
    const review = reviews[lead.leadId];
    return `## ${lead.address}

- **Project:** ${lead.projectDescription}
- **Experiment:** ${experimentLabel(lead)}
- **Decision:** ${review?.decision ? humanize(review.decision) : "Not reviewed"}
- **Reason:** ${review?.reason || "Not provided"}
- **Notes:** ${review?.notes || "None"}
- **Contacted:** ${review?.contacted ? "Yes" : "No"}
- **Outcome:** ${review?.outcome ? humanize(review.outcome) : "Not recorded"}
- **Outcome notes:** ${review?.outcomeNotes || "None"}
- **Estimated value:** ${review?.estimatedOpportunityValue || "Not provided"}
- **Follow-up:** ${review?.followUpDate || "Not scheduled"}
`;
  })
  .join("\n")}`;
}

function ContactCard({
  title,
  contact,
}: {
  title: string;
  contact: Contact | null;
}) {
  if (!contact) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
        <p className="text-xs font-semibold text-white/40">{title}</p>
        <p className="mt-2 text-sm text-white/50">No verified backup contact.</p>
      </div>
    );
  }
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#e8c79e]">{title}</p>
          <h4 className="mt-1 font-semibold">
            {contact.name ?? contact.company}
          </h4>
          <p className="text-sm text-white/55">
            {contact.company} · {contact.role}
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/55">
          {humanize(contact.classification)}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-white/70">
        {contact.methods.map((method) => (
          <li key={`${method.type}-${method.value}`} className="break-words">
            <span className="text-white/40">{method.label}:</span>{" "}
            {method.type === "email" ? (
              <a className="underline" href={`mailto:${method.value}`}>
                {method.value}
              </a>
            ) : method.type === "phone" ? (
              <a className="underline" href={`tel:${method.value}`}>
                {method.value}
              </a>
            ) : (
              <a
                className="underline"
                href={method.value}
                target="_blank"
                rel="noreferrer"
              >
                Open public page
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
        <span>Relationship: {confidenceLabel(contact.relationshipConfidence)}</span>
        <span>·</span>
        <span>Routing: {confidenceLabel(contact.routingConfidence)}</span>
      </div>
      {contact.caveats.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-white/40">
          {contact.caveats[0]}
        </p>
      )}
    </article>
  );
}

function ConfidenceGrid({ lead }: { lead: PilotLead }) {
  const items = [
    ["Project", lead.projectConfidence],
    ["ROW scope", lead.rowScopeConfidence],
    ["Timing", lead.timingConfidence],
    ["Contact", lead.contactConfidence],
    ["Relationship", lead.primaryContact.relationshipConfidence],
    ["Routing", lead.primaryContact.routingConfidence],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-white/[0.08] bg-black/10 p-3"
        >
          <p className="text-[10px] tracking-wide text-white/35 uppercase">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold">{confidenceLabel(value)}</p>
        </div>
      ))}
    </div>
  );
}

export function OpportunityReview({
  token,
  leads,
  resultsEmail,
  showMockLabel,
}: {
  token: string;
  leads: PilotBatch;
  resultsEmail: string;
  showMockLabel: boolean;
}) {
  const [activeLeadId, setActiveLeadId] = useState(leads[0].leadId);
  const [reviews, setReviews] = useState(() => createReviews(leads));
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [enrichmentPending, setEnrichmentPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIndex = leads.findIndex((lead) => lead.leadId === activeLeadId);
  const lead = leads[activeIndex] ?? leads[0];
  const review = reviews[lead.leadId] ?? createLeadReview(lead);
  const savedCount = leads.filter((item) => reviews[item.leadId]?.saved).length;
  const progress = Math.round((savedCount / leads.length) * 100);

  useEffect(() => {
    let active = true;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((hash) => {
        if (!active) return;
        const suffix = Array.from(new Uint8Array(hash).slice(0, 12))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        setStorageKey(`trulot:elevate-opportunity-review:v1:${suffix}`);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const saved = raw ? restoreSavedReview(raw, leads) : null;
    if (saved) {
      setActiveLeadId(saved.activeLeadId);
      setReviews(saved.reviews);
    } else if (raw) {
      localStorage.removeItem(storageKey);
    }
    setHydrated(true);
  }, [leads, storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const saved: SavedReview = {
      version: 1,
      activeLeadId,
      reviews,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [activeLeadId, hydrated, reviews, storageKey]);

  useEffect(() => {
    setChatOpen(false);
    setChatQuestion("");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeLeadId]);

  const updateReview = (patch: Partial<SavedLeadReview>) => {
    setReviews((current) => ({
      ...current,
      [lead.leadId]: {
        ...(current[lead.leadId] ?? createLeadReview(lead)),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const copy = async (kind: string, value: string) => {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const saveAndNext = () => {
    if (!review.decision || !review.reason) {
      setError("Choose a decision and reason before saving.");
      return;
    }
    updateReview({ saved: true });
    setError(null);
    if (activeIndex < leads.length - 1) {
      setActiveLeadId(leads[activeIndex + 1].leadId);
    }
  };

  const askChat = async () => {
    const question = chatQuestion.trim();
    if (!question) return;
    setChatPending(true);
    setError(null);
    const userMessage: ChatMessage = {
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const nextTranscript = [...review.chatTranscript, userMessage].slice(-16);
    try {
      const response = await fetch("/api/elevate/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-elevate-interview-token": token,
        },
        body: JSON.stringify({
          leadId: lead.leadId,
          question,
          decision: review.decision,
          notes: review.notes,
          transcript: review.chatTranscript.slice(-12),
        }),
      });
      const body: unknown = await response.json();
      const parsed = chatResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new Error();
      const citedSources = parsed.data.sourceIndexes
        .map((index) => lead.sources[index])
        .filter(Boolean);
      const citationText = citedSources.length
        ? `\n\nSources:\n${citedSources.map((source) => `• ${source.label}: ${source.url}`).join("\n")}`
        : "";
      updateReview({
        chatTranscript: [
          ...nextTranscript,
          {
            role: "assistant",
            content: `${parsed.data.answer}${citationText}`,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      setChatQuestion("");
    } catch {
      setError("TruLot could not answer just now. Your review is still saved.");
    } finally {
      setChatPending(false);
    }
  };

  const enrich = async () => {
    setEnrichmentPending(true);
    setError(null);
    try {
      const response = await fetch("/api/elevate/enrich", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-elevate-interview-token": token,
        },
        body: JSON.stringify({ leadId: lead.leadId }),
      });
      const body: unknown = await response.json();
      const parsed = enrichmentResultSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new Error();
      updateReview({ enrichment: parsed.data });
    } catch {
      setError("Contact enrichment is temporarily unavailable. The verified packet remains unchanged.");
    } finally {
      setEnrichmentPending(false);
    }
  };

  const applyEnrichedDraft = (enrichment: EnrichmentResult) => {
    updateReview({
      editedCallOpener: enrichment.revisedCallOpener,
      editedEmailSubject: enrichment.revisedDraftEmailSubject,
      editedEmailBody: enrichment.revisedDraftEmailBody,
    });
  };

  const emailTarget =
    review.enrichment?.primaryContact.methods.find(
      (method) => method.type === "email",
    )?.value ??
    lead.primaryContact.methods.find((method) => method.type === "email")?.value ??
    "";
  const outreachHref = `mailto:${encodeURIComponent(emailTarget)}?subject=${encodeURIComponent(review.editedEmailSubject)}&body=${encodeURIComponent(review.editedEmailBody)}`;
  const summary = useMemo(
    () => conciseSummary(leads, reviews),
    [leads, reviews],
  );
  const resultsHref = resultsEmail
    ? `mailto:${encodeURIComponent(resultsEmail)}?subject=${encodeURIComponent("Elevate ROW Opportunity Review")}&body=${encodeURIComponent(summary)}`
    : null;

  const restart = () => {
    if (!window.confirm("Restart the opportunity review and clear this device?"))
      return;
    if (storageKey) localStorage.removeItem(storageKey);
    setReviews(createReviews(leads));
    setActiveLeadId(leads[0].leadId);
    setError(null);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0b1117] text-[#f5f1e8]">
      <header className="border-b border-white/[0.08] bg-[#0b1117]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <p className="text-sm font-semibold">Elevate × TruLot</p>
            <p className="text-[11px] text-white/40">Private opportunity review</p>
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
              className="text-xs text-white/45 hover:text-white focus-visible:outline-2 focus-visible:outline-[#d89a52]"
            >
              Restart
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
        <p className="font-mono text-xs tracking-[0.16em] text-[#d89a52] uppercase">
          Prepared specifically for Cesar and Elevate
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          ROW Opportunity Review
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/58">
          TruLot found these projects from public permit and project signals.
          Four are considered actionable; one is intentionally included as a
          routing experiment. Your decisions and actual call outcomes will
          improve the next batch.
        </p>

        <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span>{savedCount} of {leads.length} decisions saved</span>
            <span className="font-mono text-[#d89a52]">{progress}%</span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-label="Opportunity review progress"
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

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            aria-label="Pilot opportunities"
            className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3 lg:sticky lg:top-5"
          >
            <ol className="space-y-2">
              {leads.map((item, index) => {
                const current = item.leadId === lead.leadId;
                const saved = reviews[item.leadId]?.saved;
                return (
                  <li key={item.leadId}>
                    <button
                      type="button"
                      aria-current={current ? "step" : undefined}
                      onClick={() => setActiveLeadId(item.leadId)}
                      className={`w-full rounded-2xl px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-[#d89a52] ${
                        current
                          ? "bg-[#d89a52] text-[#17120c]"
                          : "text-white/60 hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase opacity-60">
                        {saved ? "✓ Saved" : `Lead ${index + 1}`}
                      </span>
                      <span className="mt-1 block text-sm font-semibold">
                        {item.address}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 border-t border-white/[0.08] px-2 pt-4 text-xs leading-5 text-white/35">
              {hydrated ? "Saved on this browser and device." : "Restoring saved work…"}
            </p>
          </nav>

          <article
            className="min-w-0 rounded-3xl border border-white/[0.09] bg-[#111922]"
            data-testid="lead-card"
          >
            <div className="border-b border-white/[0.08] p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#d89a52]/15 px-3 py-1 text-[10px] font-semibold text-[#e8c79e] uppercase">
                  {experimentLabel(lead)}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/45">
                  {humanize(lead.rowRelevance)} ROW
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
                {lead.address}
              </h2>
              <p className="mt-2 max-w-3xl text-base leading-7 text-white/60">
                {lead.projectDescription}
              </p>
              <p className="mt-3 font-mono text-[11px] text-white/35">
                {lead.projectIdentifiers.join(" · ")}
              </p>
            </div>

            <div className="space-y-8 p-5 sm:p-7">
              {lead.experimentType === "routing_experiment" && (
                <section
                  className="rounded-2xl border border-amber-300/25 bg-amber-200/[0.06] p-5"
                  data-testid="routing-experiment"
                >
                  <h3 className="font-semibold text-amber-100">Routing experiment</h3>
                  <p className="mt-2 text-sm leading-6 text-amber-50/65">
                    The permit signal is strong, but the current contact route is
                    indirect. This tests whether an owner or occupant route can
                    reach the construction decision-maker. Do not treat this lead
                    as equally call-ready.
                  </p>
                </section>
              )}
              {lead.experimentType === "obvious_control" && (
                <section
                  className="rounded-2xl border border-sky-300/20 bg-sky-200/[0.05] p-5"
                  data-testid="obvious-control"
                >
                  <h3 className="font-semibold text-sky-100">Obvious control</h3>
                  <p className="mt-2 text-sm leading-6 text-sky-50/60">
                    This project is more visible and procurement may already be
                    assigned. It tests whether TruLot is merely surfacing work
                    Cesar already knows.
                  </p>
                </section>
              )}

              <section>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#d89a52] uppercase">
                  Why TruLot surfaced it
                </p>
                <p className="mt-2 text-base leading-7">{lead.whyElevateMayCare}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                    <dt className="text-[10px] uppercase text-white/35">Trigger</dt>
                    <dd className="mt-1 text-sm leading-6">{lead.trigger}</dd>
                    <dd className="mt-2 font-mono text-[11px] text-white/40">
                      {lead.triggerDate}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-4">
                    <dt className="text-[10px] uppercase text-white/35">Current timing</dt>
                    <dd className="mt-1 text-sm leading-6">{lead.timingAssessment}</dd>
                    <dd className="mt-2 text-xs text-white/40">
                      {lead.currentStage} · {lead.latestMeaningfulEvent}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-lg font-semibold">Likely ROW scope</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {lead.likelyScopes.map((scope) => (
                    <li
                      key={scope}
                      className="rounded-xl border border-white/[0.08] bg-black/10 px-3 py-2 text-sm text-white/70"
                    >
                      {scope}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold">Confidence by category</h3>
                <div className="mt-3">
                  <ConfidenceGrid lead={lead} />
                </div>
              </section>

              <section>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Verified contact packet</h3>
                    <p className="mt-1 text-xs text-white/40">
                      Preserved separately from any new enrichment.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <ContactCard title="Primary route" contact={lead.primaryContact} />
                  <ContactCard title="Backup route" contact={lead.backupContact} />
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">Risks and caveats</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-white/58">
                  {lead.risksAndCaveats.map((risk) => (
                    <li key={risk} className="flex gap-3">
                      <span className="text-[#d89a52]" aria-hidden="true">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold">Evidence and sources</h3>
                <div className="mt-3 space-y-3">
                  {lead.evidence.map((item) => (
                    <div
                      key={`${item.kind}-${item.claim}`}
                      className="rounded-2xl border border-white/[0.08] bg-black/10 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#e8c79e] uppercase">
                          {humanize(item.kind)}
                        </span>
                        <span className="text-[10px] text-white/35">
                          {confidenceLabel(item.confidence)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{item.claim}</p>
                      <p className="mt-1 text-xs leading-5 text-white/45">{item.basis}</p>
                    </div>
                  ))}
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {lead.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words text-[#e8c79e] underline underline-offset-4"
                      >
                        {source.label}
                      </a>
                      <span className="ml-2 text-xs text-white/35">
                        {humanize(source.sourceType)} · {source.verifiedAt}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-white/[0.1] bg-[#0c141c] p-5 sm:p-6">
                <h3 className="text-xl font-semibold">Cesar’s decision</h3>
                <fieldset className="mt-4">
                  <legend className="sr-only">Primary decision</legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {DECISIONS.map((decision) => (
                      <label
                        key={decision.value}
                        className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm font-semibold ${
                          review.decision === decision.value
                            ? "border-[#d89a52] bg-[#d89a52] text-[#17120c]"
                            : "border-white/10 bg-white/[0.03] text-white/70"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`decision-${lead.leadId}`}
                          value={decision.value}
                          checked={review.decision === decision.value}
                          onChange={() =>
                            updateReview({
                              decision: decision.value,
                              reason: "",
                              saved: false,
                            })
                          }
                          className="sr-only"
                        />
                        {decision.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {review.decision && (
                  <fieldset className="mt-5">
                    <legend className="text-sm font-semibold">Why?</legend>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {REASONS[review.decision].map((reason) => (
                        <label
                          key={reason}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] p-3 text-sm text-white/65"
                        >
                          <input
                            type="radio"
                            name={`reason-${lead.leadId}`}
                            value={reason}
                            checked={review.reason === reason}
                            onChange={() =>
                              updateReview({ reason, saved: false })
                            }
                            className="accent-[#d89a52]"
                          />
                          {reason}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {review.decision === "call_later" &&
                  review.reason === "Follow up on a specified date" && (
                    <label className="mt-4 block text-sm">
                      Follow-up date
                      <input
                        type="date"
                        value={review.followUpDate}
                        onChange={(event) =>
                          updateReview({
                            followUpDate: event.target.value,
                            saved: false,
                          })
                        }
                        className={`${inputClass} mt-2`}
                      />
                    </label>
                  )}

                <label className="mt-5 block text-sm font-semibold">
                  What did TruLot get right or wrong?
                  <textarea
                    value={review.notes}
                    onChange={(event) =>
                      updateReview({ notes: event.target.value, saved: false })
                    }
                    rows={4}
                    className={`${inputClass} mt-2 resize-y`}
                    placeholder="Optional notes"
                  />
                </label>

                {error && (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-300/20 bg-red-200/[0.04] p-3 text-sm text-red-100"
                  >
                    {error}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-white/35">
                    Decision selection does not auto-advance.
                  </span>
                  <button
                    type="button"
                    onClick={saveAndNext}
                    className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {activeIndex === leads.length - 1 ? "Save decision" : "Save and Next"}
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-white/[0.09] p-5 sm:p-6">
                <button
                  type="button"
                  aria-expanded={chatOpen}
                  onClick={() => setChatOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-4 text-left focus-visible:outline-2 focus-visible:outline-[#d89a52]"
                >
                  <span>
                    <span className="block text-lg font-semibold">
                      Discuss this lead with TruLot
                    </span>
                    <span className="mt-1 block text-xs text-white/40">
                      Answers use only this lead, its evidence, and your current review.
                    </span>
                  </span>
                  <span aria-hidden="true">{chatOpen ? "−" : "+"}</span>
                </button>
                {chatOpen && (
                  <div className="mt-5" data-testid="lead-chat">
                    <div
                      className="max-h-80 space-y-3 overflow-y-auto rounded-2xl bg-black/15 p-4"
                      aria-live="polite"
                    >
                      {review.chatTranscript.length === 0 ? (
                        <p className="text-sm text-white/40">
                          Ask why ROW work is involved, whether timing is early,
                          who to call, or what remains uncertain.
                        </p>
                      ) : (
                        review.chatTranscript.map((message, index) => (
                          <div
                            key={`${message.createdAt}-${index}`}
                            className={`rounded-xl p-3 text-sm leading-6 whitespace-pre-wrap ${
                              message.role === "user"
                                ? "ml-6 bg-[#d89a52]/12"
                                : "mr-6 bg-white/[0.05]"
                            }`}
                          >
                            <p className="mb-1 text-[10px] font-semibold text-white/35 uppercase">
                              {message.role === "user" ? "Cesar" : "TruLot"}
                            </p>
                            {message.content}
                          </div>
                        ))
                      )}
                    </div>
                    <label className="mt-3 block text-sm">
                      Question
                      <textarea
                        value={chatQuestion}
                        onChange={(event) => setChatQuestion(event.target.value)}
                        rows={3}
                        className={`${inputClass} mt-2 resize-y`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={chatPending || !chatQuestion.trim()}
                      onClick={() => void askChat()}
                      className={`${buttonClass} mt-3`}
                    >
                      {chatPending ? "Asking TruLot…" : "Ask about this lead"}
                    </button>
                  </div>
                )}
              </section>

              {review.decision === "call_now" && (
                <section
                  className="rounded-3xl border border-[#d89a52]/20 bg-[#d89a52]/[0.04] p-5 sm:p-6"
                  data-testid="call-now-tools"
                >
                  <h3 className="text-xl font-semibold">Call-now contact enrichment</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Search current public sources for a stronger project route.
                    No forms, messages, calls, or automatic outreach.
                  </p>
                  <button
                    type="button"
                    disabled={enrichmentPending}
                    onClick={() => void enrich()}
                    className={`${buttonClass} mt-4`}
                  >
                    {enrichmentPending ? "Searching public sources…" : "Find a better contact"}
                  </button>

                  {review.enrichment && (
                    <div className="mt-5" data-testid="enrichment-result">
                      <p className="text-xs font-semibold text-[#e8c79e]">
                        Enrichment result · verified {review.enrichment.verifiedAt}
                      </p>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <ContactCard
                          title="Enriched primary"
                          contact={review.enrichment.primaryContact}
                        />
                        <ContactCard
                          title="Enriched backup"
                          contact={review.enrichment.backupContact}
                        />
                      </div>
                      <ul className="mt-4 space-y-1 text-xs text-white/45">
                        {review.enrichment.sources.map((source) => (
                          <li key={source.url}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {source.label}
                            </a>{" "}
                            · {source.verifiedAt}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 rounded-xl border border-amber-200/20 p-3 text-xs leading-5 text-amber-50/65">
                        Review every contact, source, and claim before copying
                        outreach. The verified packet above remains unchanged.
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          applyEnrichedDraft(review.enrichment as EnrichmentResult)
                        }
                        className={`${buttonClass} mt-3`}
                      >
                        Use enriched outreach draft
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-3xl border border-white/[0.09] bg-black/10 p-5 sm:p-6">
                <h3 className="text-xl font-semibold">Outreach workspace</h3>
                <p className="mt-2 text-sm text-white/48">
                  Human review is required. Nothing here sends automatically.
                </p>
                <label className="mt-5 block text-sm font-semibold">
                  Suggested call opener
                  <textarea
                    value={review.editedCallOpener}
                    onChange={(event) =>
                      updateReview({ editedCallOpener: event.target.value })
                    }
                    rows={5}
                    className={`${inputClass} mt-2 resize-y`}
                  />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Email subject
                  <input
                    value={review.editedEmailSubject}
                    onChange={(event) =>
                      updateReview({ editedEmailSubject: event.target.value })
                    }
                    className={`${inputClass} mt-2`}
                  />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Email body
                  <textarea
                    value={review.editedEmailBody}
                    onChange={(event) =>
                      updateReview({ editedEmailBody: event.target.value })
                    }
                    rows={9}
                    className={`${inputClass} mt-2 resize-y`}
                  />
                </label>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <button
                    type="button"
                    onClick={() =>
                      void copy("subject", review.editedEmailSubject)
                    }
                    className={buttonClass}
                  >
                    {copied === "subject" ? "Subject copied" : "Copy subject"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy("email", review.editedEmailBody)}
                    className={buttonClass}
                  >
                    {copied === "email" ? "Email copied" : "Copy email"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copy("opener", review.editedCallOpener)
                    }
                    className={buttonClass}
                  >
                    {copied === "opener" ? "Opener copied" : "Copy call opener"}
                  </button>
                  <a
                    href={outreachHref}
                    data-testid="outreach-mailto"
                    className={`${buttonClass} text-center`}
                  >
                    Open email client
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      updateReview({ contacted: true, outcome: "contacted" })
                    }
                    className="rounded-xl bg-[#d89a52] px-4 py-3 text-sm font-semibold text-[#17120c]"
                  >
                    Mark contacted
                  </button>
                </div>
              </section>

              {review.contacted && (
                <section
                  className="rounded-3xl border border-emerald-300/20 bg-emerald-200/[0.04] p-5 sm:p-6"
                  data-testid="outcome-tracking"
                >
                  <h3 className="text-xl font-semibold">Outcome tracking</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Current outcome
                      <select
                        value={review.outcome ?? ""}
                        onChange={(event) =>
                          updateReview({
                            outcome: event.target.value as LeadOutcome,
                          })
                        }
                        className={`${inputClass} mt-2`}
                      >
                        <option value="">Select outcome</option>
                        {OUTCOMES.map((outcome) => (
                          <option key={outcome.value} value={outcome.value}>
                            {outcome.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      Estimated opportunity value
                      <input
                        value={review.estimatedOpportunityValue}
                        onChange={(event) =>
                          updateReview({
                            estimatedOpportunityValue: event.target.value,
                          })
                        }
                        placeholder="Optional"
                        className={`${inputClass} mt-2`}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Follow-up date
                      <input
                        type="date"
                        value={review.followUpDate}
                        onChange={(event) =>
                          updateReview({ followUpDate: event.target.value })
                        }
                        className={`${inputClass} mt-2`}
                      />
                    </label>
                    <label className="text-sm font-semibold sm:col-span-2">
                      Outcome notes
                      <textarea
                        value={review.outcomeNotes}
                        onChange={(event) =>
                          updateReview({ outcomeNotes: event.target.value })
                        }
                        rows={4}
                        className={`${inputClass} mt-2 resize-y`}
                      />
                    </label>
                  </div>
                </section>
              )}
            </div>
          </article>
        </div>

        <section className="mt-8 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-7">
          <h2 className="text-xl font-semibold">Review record</h2>
          <p className="mt-2 text-sm text-white/45">
            Downloads include the private lead batch and your browser-local
            review. Handle them as confidential pilot material.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() =>
                download(
                  "elevate-opportunity-review.md",
                  markdownReview(leads, reviews),
                  "text/markdown",
                )
              }
              className={buttonClass}
            >
              Download Markdown
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  "elevate-opportunity-review.json",
                  JSON.stringify(
                    {
                      version: 1,
                      generatedAt: new Date().toISOString(),
                      leads,
                      reviews,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                )
              }
              className={buttonClass}
            >
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => void copy("review", summary)}
              className={buttonClass}
            >
              {copied === "review" ? "Review copied" : "Copy concise summary"}
            </button>
            {resultsHref ? (
              <a
                href={resultsHref}
                data-testid="email-review-summary"
                className="rounded-xl bg-[#d89a52] px-4 py-3 text-center text-sm font-semibold text-[#17120c]"
              >
                Email concise summary to Brian
              </a>
            ) : (
              <span className={`${buttonClass} text-center opacity-40`}>
                Results email not configured
              </span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
