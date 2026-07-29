"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMailtoHref,
  buildValidatedMailtoHref,
  createCanonicalEmailDraft,
  findVerifiedEmailRoute,
  isLegacyCallDecision,
} from "@/lib/elevate-review/email-action";
import {
  batchLabelSlug,
  buildCompletedReviewExport,
  markdownCompletedReview,
  normalizeBatchLabel,
} from "@/lib/elevate-review/export";
import {
  buyerRouterStatusForLead,
} from "@/lib/elevate-review/outreach-reliability";
import {
  chatResponseSchema,
  enrichmentResultSchema,
  savedReviewSchema,
  type ChatMessage,
  type Contact,
  type LeadDecision,
  type PilotBatch,
  type PilotLead,
  type SavedLeadReview,
  type SavedReview,
} from "@/lib/elevate-review/schema";

const COMPLETE_DECISIONS = [
  { value: "email_sent", label: "Emailed" },
  { value: "pass", label: "Passed" },
  { value: "already_known", label: "Already known" },
] as const satisfies ReadonlyArray<{
  value: LeadDecision;
  label: string;
}>;

const buttonClass =
  "min-h-12 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2a65f] disabled:cursor-not-allowed disabled:opacity-40";
const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0a1118] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d89a52]/70";
const detailsClass =
  "rounded-2xl border border-white/[0.08] bg-black/10 [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-[#d89a52]";

function confidenceLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionLabel(decision: LeadDecision | null) {
  if (decision === "email_sent") return "Emailed";
  if (decision === "pass") return "Passed";
  if (decision === "already_known") return "Already known";
  if (decision === "call_now") return "Previous call-now decision";
  if (decision === "call_later") return "Previous call-later decision";
  return "Not reviewed";
}

function createLeadReview(lead: PilotLead): SavedLeadReview {
  return {
    decision: null,
    reasons: [],
    otherReason: "",
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
    followUpDate: null,
    enrichedOutreachAdopted: false,
    emailDraftOpenedAt: null,
    emailSentConfirmedAt: null,
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
      if (!saved) continue;
      reviews[lead.leadId] = isLegacyCallDecision(saved.decision)
        ? { ...saved, saved: false }
        : saved;
    }
    return { ...parsed.data, version: 3, reviews };
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

function openMailto(href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.dataset.elevateMailto = "true";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function conciseSummary(
  batchName: string,
  batchId: string,
  leads: PilotBatch,
  reviews: Record<string, SavedLeadReview>,
) {
  return [
    `Elevate ROW Opportunity Review — ${batchName} (${batchId})`,
    ...leads.map(
      (lead) =>
        `${lead.address}: ${actionLabel(reviews[lead.leadId]?.decision ?? null)}`,
    ),
  ].join("\n");
}

function buyerStatusLabel(lead: PilotLead) {
  const status = buyerRouterStatusForLead(lead);
  if (status === "verified_construction_buyer") {
    return "Verified construction buyer";
  }
  if (status === "probable_buyer") return "Probable buyer";
  if (status === "general_company_route") return "General company route";
  if (status === "routing_contact") return "Routing contact — not a verified buyer";
  return "Unverified route";
}

function ContactSummary({
  lead,
  review,
}: {
  lead: PilotLead;
  review: SavedLeadReview;
}) {
  const contact = review.enrichment?.primaryContact ?? lead.primaryContact;
  const route = findVerifiedEmailRoute(
    lead,
    review.enrichment?.primaryContact,
    review.enrichment?.backupContact,
  );
  return (
    <section
      className="rounded-2xl border border-white/[0.1] bg-white/[0.035] p-5"
      data-testid="contact-route"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#d89a52] uppercase">
            Best contact route
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            {contact.name ?? contact.company}
          </h3>
          <p className="mt-1 text-sm text-white/58">
            {contact.company} · {contact.role}
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
          {buyerStatusLabel(lead)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-black/15 p-3">
          <p className="text-[10px] text-white/35 uppercase">Email route</p>
          {route ? (
            <>
              <p className="mt-1 break-all text-sm font-semibold">{route.address}</p>
              <p className="mt-1 text-xs text-white/45">
                {route.routeType === "general" ? "Verified general route" : "Verified direct route"} · {route.label}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold text-amber-100">
              No usable verified email
            </p>
          )}
        </div>
        <div className="rounded-xl bg-black/15 p-3">
          <p className="text-[10px] text-white/35 uppercase">Route confidence</p>
          <p className="mt-1 text-sm font-semibold">
            {confidenceLabel(contact.routingConfidence)}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {humanize(contact.classification)}
          </p>
        </div>
      </div>
      {contact.caveats[0] ? (
        <p className="mt-3 text-xs leading-5 text-white/45">{contact.caveats[0]}</p>
      ) : null}
    </section>
  );
}

function ContactDetails({
  title,
  contact,
}: {
  title: string;
  contact: Contact | null;
}) {
  if (!contact) {
    return (
      <div className="rounded-xl border border-white/[0.08] p-4 text-sm text-white/45">
        {title}: no verified backup contact.
      </div>
    );
  }
  return (
    <article className="rounded-xl border border-white/[0.08] p-4">
      <p className="text-xs font-semibold text-[#e8c79e]">{title}</p>
      <h4 className="mt-1 font-semibold">{contact.name ?? contact.company}</h4>
      <p className="text-sm text-white/50">
        {contact.company} · {contact.role}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-white/55">
        {contact.methods.map((method) => (
          <li key={`${method.type}-${method.value}`} className="break-words">
            {method.label}:{" "}
            {method.type === "website" ? (
              <a
                href={method.value}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open public page
              </a>
            ) : (
              <span>{method.value}</span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function OpportunityReview({
  token,
  batchId,
  batchName,
  leads,
  resultsEmail,
  showMockLabel,
}: {
  token: string;
  batchId: string;
  batchName: string;
  leads: PilotBatch;
  resultsEmail: string;
  showMockLabel: boolean;
}) {
  const normalizedBatchName = normalizeBatchLabel(batchName);
  const [activeLeadId, setActiveLeadId] = useState(leads[0].leadId);
  const [reviews, setReviews] = useState(() => createReviews(leads));
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [preparingEmail, setPreparingEmail] = useState(false);
  const [actionPending, setActionPending] = useState<LeadDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionLockRef = useRef(false);

  const activeIndex = leads.findIndex((item) => item.leadId === activeLeadId);
  const lead = leads[activeIndex] ?? leads[0];
  const review = reviews[lead.leadId] ?? createLeadReview(lead);
  const savedCount = leads.filter((item) => reviews[item.leadId]?.saved).length;
  const progress = Math.round((savedCount / leads.length) * 100);
  const reviewComplete = savedCount === leads.length;
  const emailRoute = findVerifiedEmailRoute(
    lead,
    review.enrichment?.primaryContact,
    review.enrichment?.backupContact,
  );
  const completionCounts = COMPLETE_DECISIONS.map((decision) => ({
    ...decision,
    count: leads.filter((item) => {
      const itemReview = reviews[item.leadId];
      return itemReview?.saved && itemReview.decision === decision.value;
    }).length,
  }));
  const storageScope = useMemo(
    () =>
      JSON.stringify({
        token,
        batchId,
        leadIds: leads.map((item) => item.leadId),
      }),
    [batchId, leads, token],
  );

  useEffect(() => {
    let active = true;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(storageScope))
      .then((hash) => {
        if (!active) return;
        const suffix = Array.from(new Uint8Array(hash).slice(0, 12))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        setStorageKey(
          `trulot:elevate-opportunity-review:v2:${batchId}:${suffix}`,
        );
      })
      .catch(() => {
        if (active) setError("Saved review state is unavailable on this device.");
      });
    return () => {
      active = false;
    };
  }, [batchId, storageScope]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? restoreSavedReview(raw, leads) : null;
      if (saved) {
        setActiveLeadId(saved.activeLeadId);
        setReviews(saved.reviews);
      } else if (raw) {
        localStorage.removeItem(storageKey);
      }
    } catch {
      setError("Saved review state is unavailable on this device.");
    }
    setHydrated(true);
  }, [leads, storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const saved: SavedReview = {
      version: 3,
      activeLeadId,
      reviews,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      setError("Saved review state is unavailable on this device.");
    }
  }, [activeLeadId, hydrated, reviews, storageKey]);

  useEffect(() => {
    setChatOpen(false);
    setChatQuestion("");
    setError(null);
    setPreparingEmail(false);
    setActionPending(null);
    actionLockRef.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeLeadId]);

  const updateReview = (
    leadId: string,
    sourceLead: PilotLead,
    patch: Partial<SavedLeadReview>,
  ) => {
    setReviews((current) => ({
      ...current,
      [leadId]: {
        ...(current[leadId] ?? createLeadReview(sourceLead)),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const advance = () => {
    if (activeIndex < leads.length - 1) {
      setActiveLeadId(leads[activeIndex + 1].leadId);
      return;
    }
    window.requestAnimationFrame(() => {
      document
        .querySelector('[data-testid="review-complete"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const completeLead = (
    decision: "pass" | "already_known" | "email_sent",
  ) => {
    if (actionLockRef.current) return;
    if (decision === "email_sent" && !review.emailDraftOpenedAt) return;
    actionLockRef.current = true;
    setActionPending(decision);
    const timestamp = new Date().toISOString();
    updateReview(lead.leadId, lead, {
      decision,
      reasons: [],
      otherReason: "",
      saved: true,
      contacted: decision === "email_sent" ? true : review.contacted,
      outcome: decision === "email_sent" ? "contacted" : review.outcome,
      emailSentConfirmedAt:
        decision === "email_sent" ? timestamp : review.emailSentConfirmedAt,
      followUpDate: null,
    });
    setError(null);
    advance();
    window.setTimeout(() => {
      actionLockRef.current = false;
      setActionPending(null);
    }, 250);
  };

  const prepareEmail = async () => {
    if (
      actionLockRef.current ||
      preparingEmail ||
      !hydrated ||
      !emailRoute
    ) {
      return;
    }
    actionLockRef.current = true;
    setPreparingEmail(true);
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
      const responseBody: unknown = await response.json();
      const parsed = enrichmentResultSchema.safeParse(responseBody);
      if (!response.ok || !parsed.success) throw new Error();
      const route = findVerifiedEmailRoute(
        lead,
        parsed.data.primaryContact,
        parsed.data.backupContact,
      );
      if (!route) throw new Error();
      const canonical = createCanonicalEmailDraft(lead, route, {
        subject: parsed.data.revisedDraftEmailSubject,
        body: parsed.data.revisedDraftEmailBody,
        styleMode: parsed.data.outreachMode,
        contactClassification: parsed.data.contactClassification,
        buyerRouterStatus: parsed.data.buyerRouterStatus,
      });
      if (!canonical) throw new Error();
      const mailto = buildValidatedMailtoHref(lead, canonical, route.address);
      if (!mailto) throw new Error();
      const openedAt = new Date().toISOString();
      updateReview(lead.leadId, lead, {
        enrichment: parsed.data,
        editedCallOpener: parsed.data.revisedCallOpener,
        editedEmailSubject: canonical.subject,
        editedEmailBody: canonical.body,
        enrichedOutreachAdopted: true,
        emailDraftOpenedAt: openedAt,
        emailSentConfirmedAt: null,
        saved: false,
      });
      openMailto(mailto);
    } catch {
      setError("We couldn’t prepare the email. Please try again.");
    } finally {
      setPreparingEmail(false);
      actionLockRef.current = false;
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
      const responseBody: unknown = await response.json();
      const parsed = chatResponseSchema.safeParse(responseBody);
      if (!response.ok || !parsed.success) throw new Error();
      const citedSources = parsed.data.sourceIndexes
        .map((index) => lead.sources[index])
        .filter(Boolean);
      const citationText = citedSources.length
        ? `\n\nSources:\n${citedSources.map((source) => `• ${source.label}: ${source.url}`).join("\n")}`
        : "";
      updateReview(lead.leadId, lead, {
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

  const summary = useMemo(
    () => conciseSummary(normalizedBatchName, batchId, leads, reviews),
    [batchId, leads, normalizedBatchName, reviews],
  );
  const resultsHref = resultsEmail
    ? buildMailtoHref(
        resultsEmail,
        `Elevate ROW Opportunity Review — ${normalizedBatchName}`,
        summary,
      )
    : null;

  const exportReview = (format: "markdown" | "json") => {
    try {
      const payload = buildCompletedReviewExport(
        batchId,
        normalizedBatchName,
        leads,
        reviews,
      );
      download(
        `elevate-opportunity-review-${batchLabelSlug(normalizedBatchName)}-${batchId}.${format === "markdown" ? "md" : "json"}`,
        format === "markdown"
          ? markdownCompletedReview(payload)
          : JSON.stringify(payload, null, 2),
        format === "markdown" ? "text/markdown" : "application/json",
      );
      setError(null);
    } catch {
      setError("The review record could not be validated for export.");
    }
  };

  const restart = () => {
    if (!window.confirm("Restart the opportunity review and clear this device?"))
      return;
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        setError("Saved review state is unavailable on this device.");
        return;
      }
    }
    setReviews(createReviews(leads));
    setActiveLeadId(leads[0].leadId);
    setError(null);
  };

  const scopeLabels = {
    verified_fact: "Explicit",
    supported_inference: "Inferred",
    unresolved: "Unresolved",
  } as const;
  const legacyDecision = isLegacyCallDecision(review.decision);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0b1117] text-[#f5f1e8]">
      <header className="border-b border-white/[0.08] bg-[#0b1117]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <p className="text-sm font-semibold">Elevate × TruLot</p>
            <p className="text-[11px] text-white/40">Private opportunity review</p>
          </div>
          <div className="flex items-center gap-3">
            {showMockLabel ? (
              <span className="rounded-full border border-sky-300/20 px-3 py-1 text-[10px] text-sky-200 uppercase">
                Mock mode
              </span>
            ) : null}
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

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            ROW Opportunity Review
          </h1>
          <span
            className="rounded-full border border-[#d89a52]/30 bg-[#d89a52]/10 px-3 py-1 font-mono text-[10px] text-[#e8c79e] uppercase"
            data-testid="batch-label"
          >
            {normalizedBatchName}
          </span>
        </div>
        <p className="mt-2 font-mono text-[11px] text-white/35" data-testid="batch-id">
          Batch ID: {batchId}
        </p>

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span>{savedCount} of {leads.length} reviewed</span>
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

        {reviewComplete ? (
          <section
            className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-200/[0.06] p-5 sm:p-7"
            data-testid="review-complete"
          >
            <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-200 uppercase">
              Review complete
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {savedCount} of {leads.length} reviewed
            </h2>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
              {completionCounts.map((decision) => (
                <div key={decision.value} className="flex gap-2">
                  <dt>{decision.label}</dt>
                  <dd
                    className="font-mono text-emerald-200"
                    aria-label={`${decision.label} count`}
                  >
                    {decision.count}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" onClick={() => exportReview("markdown")} className={buttonClass}>
                Download Markdown
              </button>
              <button type="button" onClick={() => exportReview("json")} className={buttonClass}>
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(summary).then(() => setCopied(true))}
                className={buttonClass}
              >
                {copied ? "Review copied" : "Copy concise summary"}
              </button>
              {resultsHref ? (
                <a href={resultsHref} className={`${buttonClass} text-center`}>
                  Email results
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav
            aria-label="Pilot opportunities"
            className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3 lg:sticky lg:top-5"
          >
            <ol className="grid gap-2 sm:grid-cols-5 lg:grid-cols-1">
              {leads.map((item, index) => {
                const current = item.leadId === lead.leadId;
                const saved = reviews[item.leadId]?.saved;
                return (
                  <li key={item.leadId}>
                    <button
                      type="button"
                      aria-current={current ? "step" : undefined}
                      onClick={() => setActiveLeadId(item.leadId)}
                      className={`min-h-12 w-full rounded-2xl px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-[#d89a52] ${
                        current
                          ? "bg-[#d89a52] text-[#17120c]"
                          : "text-white/60 hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase opacity-60">
                        {saved ? "✓ Reviewed" : `Lead ${index + 1}`}
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold">
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
              <div className="flex flex-wrap gap-2 text-[10px] uppercase">
                <span className="rounded-full bg-[#d89a52]/15 px-3 py-1 font-semibold text-[#e8c79e]">
                  {humanize(lead.experimentType)}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-white/45">
                  {humanize(lead.rowRelevance)} ROW
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
                {lead.address}
              </h2>
              <p className="mt-2 max-w-3xl text-base leading-7 text-white/60">
                {lead.projectDescription}
              </p>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              <section data-testid="opportunity-summary">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#d89a52] uppercase">
                  Opportunity
                </p>
                <p className="mt-2 text-base leading-7">{lead.whyElevateMayCare}</p>
              </section>

              <section data-testid="scope-certainty">
                <h3 className="text-lg font-semibold">What is known</h3>
                <div className="mt-3 grid gap-2">
                  {lead.evidence.map((item) => (
                    <div
                      key={`${item.kind}-${item.claim}`}
                      className="rounded-xl border border-white/[0.08] bg-black/10 p-3"
                    >
                      <span className="text-[10px] font-semibold tracking-wide text-[#e8c79e] uppercase">
                        {scopeLabels[item.kind]}
                      </span>
                      <p className="mt-1 text-sm leading-6">{item.claim}</p>
                    </div>
                  ))}
                </div>
              </section>

              <ContactSummary lead={lead} review={review} />

              <section
                className="rounded-3xl border border-[#d89a52]/25 bg-[#0c141c] p-5 sm:p-6"
                data-testid="email-actions"
              >
                <h3 className="text-xl font-semibold">What do you want to do?</h3>
                {legacyDecision ? (
                  <p className="mt-2 rounded-xl border border-amber-200/15 bg-amber-100/[0.04] p-3 text-xs leading-5 text-amber-50/65">
                    {actionLabel(review.decision)} is retained for reference. It does not count as an email sent.
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-6 text-white/50">
                  Opens a prefilled draft in your email app. Nothing sends until you click Send.
                </p>
                {!emailRoute ? (
                  <p
                    className="mt-3 rounded-xl border border-amber-200/20 bg-amber-100/[0.04] p-3 text-sm text-amber-50/70"
                    data-testid="email-route-limitation"
                  >
                    Email now is unavailable because this lead has no usable verified email route.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {review.emailDraftOpenedAt && review.decision !== "email_sent" ? (
                    <button
                      type="button"
                      onClick={() => completeLead("email_sent")}
                      disabled={Boolean(actionPending)}
                      className="min-h-14 rounded-xl bg-[#d89a52] px-4 py-3 text-sm font-semibold text-[#17120c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                    >
                      {actionPending === "email_sent" ? "Saving…" : "Mark email sent & next"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void prepareEmail()}
                      disabled={
                        !hydrated ||
                        !emailRoute ||
                        preparingEmail ||
                        review.decision === "email_sent"
                      }
                      className="min-h-14 rounded-xl bg-[#d89a52] px-4 py-3 text-sm font-semibold text-[#17120c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {review.decision === "email_sent"
                        ? "Email sent · recorded"
                        : preparingEmail
                          ? "Preparing email…"
                          : "Email now"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => completeLead("pass")}
                    disabled={!hydrated || Boolean(actionPending) || preparingEmail}
                    className={buttonClass}
                  >
                    {actionPending === "pass" ? "Saving…" : "Pass"}
                  </button>
                  <button
                    type="button"
                    onClick={() => completeLead("already_known")}
                    disabled={!hydrated || Boolean(actionPending) || preparingEmail}
                    className={buttonClass}
                  >
                    {actionPending === "already_known"
                      ? "Saving…"
                      : "Already know this project"}
                  </button>
                </div>
                {review.emailDraftOpenedAt && review.decision !== "email_sent" ? (
                  <p className="mt-3 text-sm leading-6 text-emerald-100/75" role="status">
                    Draft opened in your email app. Review it, click Send, then return here.
                  </p>
                ) : null}
                <details className={`${detailsClass} mt-4`}>
                  <summary className="p-3 text-sm font-semibold text-white/65">
                    Add a note
                  </summary>
                  <div className="border-t border-white/[0.08] p-3">
                    <label className="text-sm">
                      Optional lead note
                      <textarea
                        value={review.notes}
                        onChange={(event) =>
                          updateReview(lead.leadId, lead, {
                            notes: event.target.value,
                          })
                        }
                        rows={3}
                        maxLength={3000}
                        className={`${inputClass} mt-2 resize-y`}
                      />
                    </label>
                  </div>
                </details>
                {error ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-300/20 bg-red-200/[0.04] p-3 text-sm text-red-100"
                  >
                    {error}
                  </p>
                ) : null}
              </section>

              <details className={detailsClass} data-testid="secondary-evidence">
                <summary className="flex items-center justify-between gap-4 p-4 text-sm font-semibold">
                  Evidence, timing, confidence & contacts
                  <span aria-hidden="true" className="text-[#d89a52]">+</span>
                </summary>
                <div className="space-y-6 border-t border-white/[0.08] p-4">
                  <section>
                    <h3 className="font-semibold">Trigger and timing</h3>
                    <p className="mt-2 text-sm leading-6 text-white/60">{lead.trigger}</p>
                    <p className="mt-1 text-xs text-white/40">
                      {lead.triggerDate} · {lead.currentStage} · {lead.latestMeaningfulEvent}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/55">{lead.timingAssessment}</p>
                  </section>
                  <section>
                    <h3 className="font-semibold">Likely ROW scope</h3>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {lead.likelyScopes.map((scope) => (
                        <li key={scope} className="rounded-xl border border-white/[0.08] p-3 text-sm text-white/60">
                          {scope}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3 className="font-semibold">Contact packet</h3>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      <ContactDetails title="Primary route" contact={lead.primaryContact} />
                      <ContactDetails title="Backup route" contact={lead.backupContact} />
                    </div>
                  </section>
                  <section>
                    <h3 className="font-semibold">Confidence</h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      {confidenceLabel(lead.projectConfidence)} project ·{" "}
                      {confidenceLabel(lead.rowScopeConfidence)} ROW scope ·{" "}
                      {confidenceLabel(lead.timingConfidence)} timing ·{" "}
                      {confidenceLabel(lead.contactConfidence)} contact
                    </p>
                  </section>
                  <section>
                    <h3 className="font-semibold">Risks and caveats</h3>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-white/55">
                      {lead.risksAndCaveats.map((risk) => (
                        <li key={risk}>• {risk}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3 className="font-semibold">Sources</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {lead.sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words text-[#e8c79e] underline"
                          >
                            {source.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </details>

              <section className={detailsClass}>
                <button
                  type="button"
                  aria-expanded={chatOpen}
                  onClick={() => setChatOpen((open) => !open)}
                  className="flex min-h-12 w-full items-center justify-between gap-4 p-4 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#d89a52]"
                >
                  Ask TruLot about this lead
                  <span aria-hidden="true">{chatOpen ? "−" : "+"}</span>
                </button>
                {chatOpen ? (
                  <div className="border-t border-white/[0.08] p-4" data-testid="lead-chat">
                    <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-black/15 p-3" aria-live="polite">
                      {review.chatTranscript.length ? (
                        review.chatTranscript.map((message, index) => (
                          <div
                            key={`${message.createdAt}-${index}`}
                            className={`rounded-xl p-3 text-sm leading-6 whitespace-pre-wrap ${
                              message.role === "user"
                                ? "ml-6 bg-[#d89a52]/12"
                                : "mr-6 bg-white/[0.05]"
                            }`}
                          >
                            {message.content}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-white/40">
                          Ask about the contact, scope, timing, or why this became a lead.
                        </p>
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
                ) : null}
              </section>

              <details className={detailsClass} data-testid="review-history">
                <summary className="p-4 text-sm font-semibold">Review history</summary>
                <div className="border-t border-white/[0.08] p-4 text-sm leading-6 text-white/55">
                  <p>Current record: {actionLabel(review.decision)}</p>
                  {review.emailDraftOpenedAt ? <p>Email draft opened on this device.</p> : null}
                  {review.emailSentConfirmedAt ? <p>Email send marked by the reviewer.</p> : null}
                  {review.outcome ? <p>Prior outcome: {humanize(review.outcome)}</p> : null}
                  {review.followUpDate ? <p>Prior follow-up: {review.followUpDate}</p> : null}
                  {review.reasons.length ? <p>Prior reasons: {review.reasons.join("; ")}</p> : null}
                </div>
              </details>
            </div>
          </article>
        </div>

        <section className="mt-8 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-7">
          <h2 className="text-xl font-semibold">Review record</h2>
          <p className="mt-2 text-sm text-white/45">
            Downloads contain the private batch and this browser-local review.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => exportReview("markdown")} className={buttonClass}>
              Download Markdown
            </button>
            <button type="button" onClick={() => exportReview("json")} className={buttonClass}>
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => void copyText(summary).then(() => setCopied(true))}
              className={buttonClass}
            >
              {copied ? "Review copied" : "Copy concise summary"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
