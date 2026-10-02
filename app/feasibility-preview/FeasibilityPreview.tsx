import Link from "next/link";
import type { PreviewMode, PreviewPayload, ProductState, RuleResult } from "@/lib/bounded-feasibility-preview";
import styles from "./feasibility-preview.module.css";

const STATE_LABELS: Record<ProductState, string> = {
  MEETS_BASE_RULE: "Meets base rule",
  DOES_NOT_MEET_BASE_RULE: "Does not meet base rule",
  CONDITIONAL: "Conditional",
  NEEDS_EVIDENCE: "Needs evidence",
  NOT_APPLICABLE: "Not applicable",
  NOT_EVALUATED: "Not evaluated",
  SOURCE_UNAVAILABLE: "Source unavailable",
  OUTSIDE_CURRENT_SCOPE: "Outside current scope",
};

const OVERALL_LABELS: Record<PreviewPayload["overall_state"], string> = {
  BASE_PARCEL_RULES_EVALUATED: "Base parcel rules evaluated",
  PARTIAL_EVALUATION: "Partial evaluation",
  MORE_EVIDENCE_NEEDED: "More evidence needed",
  OUTSIDE_CURRENT_SCOPE: "Outside current scope",
  SOURCE_UNAVAILABLE: "Source unavailable",
};

const BLOCKER_COPY: Record<string, { missing: string; why: string; action: string }> = {
  CURRENT_SURVEY_STRUCTURE_GEOMETRY: {
    missing: "A current survey tying the building frame to property lines.",
    why: "A rule requirement alone cannot establish an existing structure’s setback.",
    action: "Add a survey",
  },
  CODE_HEIGHT_ANALYSIS: {
    missing: "A Code-compatible grade and top-elevation analysis.",
    why: "The height rule depends on grade, highest-point, roof, and envelope measurements.",
    action: "See what evidence is needed",
  },
  CODE_GFA_AND_PREMISES_AREA: {
    missing: "A reconciled gross-floor-area worksheet and legal premises area.",
    why: "Both the numerator and denominator must follow the selected Code definitions.",
    action: "See what evidence is needed",
  },
  PROGRAM_ELIGIBILITY_EVIDENCE: {
    missing: "Evidence supporting the program’s eligibility predicates.",
    why: "Mapped geography does not establish program eligibility.",
    action: "Review source",
  },
  FIRE_OFFICIAL_DETERMINATION: {
    missing: "Any project-specific Fire Official setback determination.",
    why: "Mapped Fire context is separate from a project-specific requirement.",
    action: "See what evidence is needed",
  },
};

const EVIDENCE_LABELS: Array<[RegExp, string]> = [
  [/rs-rule-profile-v0\/rs-1-7-base-rules/, "RS-1-7 base-rule profile"],
  [/rs-rule-profile-v0\/apn-6341302200-replay/, "Recorded parcel and rule evaluation"],
  [/approved-plan-setback-benchmark-v0\/public-rule-profile/, "Public parcel, zoning, and overlay sources"],
  [/rm-rule-profile-v0\/rm-2-5-base-rules/, "RM-2-5 base-rule profile"],
  [/approved-plan-setback-benchmark-v0\/benchmark-result/, "Authorized proposed-plan comparison"],
  [/approved-plan-setback-benchmark-v0\/plan-fact-envelope/, "Authorized plan evidence"],
  [/rm-rule-profile-v0\/packet-50-replay/, "Height and FAR evidence review"],
];

const VIEWS: Array<{ mode: PreviewMode; label: string }> = [
  { mode: "rs", label: "Public RS" },
  { mode: "rm", label: "Public RM" },
  { mode: "private", label: "Private project" },
  { mode: "blocked", label: "Height / FAR blockers" },
];

function evidenceLabel(artifact: string): string {
  return EVIDENCE_LABELS.find(([pattern]) => pattern.test(artifact))?.[1] ?? "Authoritative rule evidence";
}

function groupFor(card: RuleResult): string {
  if (/AREA|WIDTH|DEPTH|FRONTAGE|ZONING/.test(card.rule_family)) return "Parcel dimensions";
  if (/SETBACK/.test(card.rule_family)) return "Setbacks";
  if (card.rule_family === "STRUCTURE_HEIGHT" || card.rule_family === "FAR") return "Height and FAR";
  if (card.scope === "PROGRAM_OR_OVERLAY") return "Programs and overlays";
  return "Evidence needed";
}

function RuleCard({ card }: { card: RuleResult }) {
  const blocker = card.blocker_codes.map((code) => BLOCKER_COPY[code]).find(Boolean);
  return (
    <article className={styles.ruleCard} data-state={card.result_state} data-card-id={card.card_id}>
      <div className={styles.cardTopline}>
        <h3>{card.rule_name}</h3>
        <span className={styles.stateBadge} data-state={card.result_state}>{STATE_LABELS[card.result_state]}</span>
      </div>
      <p className={styles.answer}>{card.answer}</p>
      {(card.requirement || card.fact) ? (
        <dl className={styles.ruleFacts}>
          {card.requirement ? <div><dt>Rule requirement</dt><dd>{card.requirement}</dd></div> : null}
          {card.fact ? <div><dt>{card.scope === "PROJECT_COMPARISON" ? "Proposed-plan fact" : "Parcel fact"}</dt><dd>{card.fact}</dd></div> : null}
        </dl>
      ) : null}
      <p className={styles.why}>{card.why}</p>
      {blocker ? (
        <section className={styles.blocker} aria-label="Evidence needed">
          <div><span>What’s missing</span><p>{blocker.missing}</p></div>
          <div><span>Why it matters</span><p>{blocker.why}</p></div>
          <p className={styles.nextAction}><strong>Next action</strong> {blocker.action}</p>
        </section>
      ) : null}
      <details className={styles.evidence}>
        <summary>Evidence and context</summary>
        <ul>
          {[...new Set(card.evidence.map((item) => evidenceLabel(item.artifact)))].map((label) => <li key={label}>{label}</li>)}
          <li>Version details remain attached to the selected rule profile.</li>
          {card.privacy === "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" ? <li>Private authorized evidence · excluded from public caching and indexing.</li> : null}
        </ul>
      </details>
    </article>
  );
}

function SummaryGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={styles.summaryGroup}>
      <h3>{title}<span>{items.length}</span></h3>
      {items.length ? <ul>{items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : <p>Nothing in this group.</p>}
    </section>
  );
}

function RsProfileNotes() {
  return (
    <section className={styles.profileNotes} aria-labelledby="rs-profile-heading">
      <div className={styles.sectionHeading}>
        <p>Base rule profiles</p>
        <h2 id="rs-profile-heading">Height and FAR remain branch-based</h2>
      </div>
      <div className={styles.profileGrid}>
        <article>
          <span>Height profile</span>
          <h3>24 ft at applicable setback lines · 30 ft overall</h3>
          <p>The inward angled plane depends on Code-defined lot width. A project comparison still needs grade and top-elevation evidence.</p>
        </article>
        <article>
          <span>FAR profile</span>
          <h3>Table 131-04J lot-area branch</h3>
          <p>The applicable branch depends on Code-defined area and the separate steep-hillside formula. No project FAR is evaluated here.</p>
        </article>
      </div>
    </section>
  );
}

function identityFor(mode: PreviewMode, payload: PreviewPayload) {
  if (mode === "rs") return { eyebrow: "Public parcel feasibility", title: "1456 27th St", detail: `APN ${payload.apn} · RS-1-7 · Outside Coastal` };
  if (mode === "rm") return { eyebrow: "Public parcel feasibility", title: "639 N 67th St", detail: `APN ${payload.apn} · RM-2-5 · Outside Coastal` };
  if (mode === "private") return { eyebrow: "Private project analysis", title: payload.project_id ?? "Private project", detail: `APN ${payload.apn} · Not for public indexing` };
  return { eyebrow: "Evidence-blocked examples", title: payload.project_id ?? "Height and FAR", detail: "Private evidence review · Not for public indexing" };
}

export default function FeasibilityPreview({ mode, payload }: { mode: PreviewMode; payload: PreviewPayload }) {
  const identity = identityFor(mode, payload);
  const groups = new Map<string, RuleResult[]>();
  for (const result of payload.rule_results) {
    const group = groupFor(result);
    groups.set(group, [...(groups.get(group) ?? []), result]);
  }
  return (
    <main className={styles.shell} data-preview-mode={mode}>
      <header className={styles.header}>
        <div className={styles.wordmark}><span aria-hidden="true">T</span> TRULOT</div>
        <div className={styles.previewBadge}>Development preview · local only</div>
      </header>

      <nav className={styles.viewNav} aria-label="Preview examples">
        {VIEWS.map((view) => (
          <Link key={view.mode} href={`/feasibility-preview?view=${view.mode}`} aria-current={mode === view.mode ? "page" : undefined}>{view.label}</Link>
        ))}
      </nav>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{identity.eyebrow}</p>
          <h1>{identity.title}</h1>
          <p className={styles.identityDetail}>{identity.detail}</p>
        </div>
        <div className={styles.overallCard}>
          <span>Overall evaluation</span>
          <strong>{OVERALL_LABELS[payload.overall_state]}</strong>
          <p>This describes evaluation coverage. It is not a whole-property or whole-project conclusion.</p>
        </div>
      </section>

      {mode === "private" || mode === "blocked" ? (
        <aside className={styles.privateBanner}><strong>Private project analysis</strong><span>Not for public indexing · no public cache</span></aside>
      ) : null}

      <section className={styles.summary} aria-labelledby="summary-heading">
        <div className={styles.sectionHeading}>
          <p>Bounded summary</p>
          <h2 id="summary-heading">What TruLot knows</h2>
        </div>
        <div className={styles.summaryGrid}>
          <SummaryGroup title="Verified" items={payload.summary.verified} />
          <SummaryGroup title="Conditional" items={payload.summary.conditional} />
          <SummaryGroup title="Needs evidence" items={payload.summary.needs_evidence} />
          <SummaryGroup title="Not evaluated" items={payload.summary.not_evaluated} />
        </div>
      </section>

      {mode === "rs" ? <RsProfileNotes /> : null}

      <section className={styles.results} aria-labelledby="rules-heading">
        <div className={styles.sectionHeading}>
          <p>Rule-by-rule</p>
          <h2 id="rules-heading">Requirements, facts, and bounded results</h2>
        </div>
        {["Parcel dimensions", "Setbacks", "Height and FAR", "Programs and overlays", "Evidence needed"].map((group) => {
          const cards = groups.get(group);
          return cards?.length ? (
            <section className={styles.ruleGroup} key={group}>
              <h2>{group}</h2>
              <div className={styles.cardGrid}>{cards.map((item) => <RuleCard card={item} key={item.card_id} />)}</div>
            </section>
          ) : null;
        })}
      </section>

      <footer className={styles.footer}>Static development evidence · Packet 59 contract · no production data source</footer>
    </main>
  );
}
