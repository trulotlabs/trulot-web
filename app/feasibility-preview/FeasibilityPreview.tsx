import Link from "next/link";
import type { PreviewMode, PreviewPayload, ProductState, RuleResult } from "@/lib/bounded-feasibility-preview";
import styles from "./feasibility-preview.module.css";

const RESIDENTIAL_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf";
const MEASUREMENT_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf";
const ORDINANCE_21618 = "https://docs.sandiego.gov/council_reso_ordinance/rao2023/O-21618.pdf";

const STATE_LABELS: Record<ProductState, string> = {
  MEETS_BASE_RULE: "Meets base rule", DOES_NOT_MEET_BASE_RULE: "Does not meet base rule", CONDITIONAL: "Conditional",
  NEEDS_EVIDENCE: "Needs evidence", NOT_APPLICABLE: "Not applicable", NOT_EVALUATED: "Not evaluated",
  SOURCE_UNAVAILABLE: "Source unavailable", OUTSIDE_CURRENT_SCOPE: "Outside current scope",
};

const OVERALL_LABELS: Record<PreviewPayload["overall_state"], string> = {
  BASE_PARCEL_RULES_EVALUATED: "Base parcel rules evaluated", PARTIAL_EVALUATION: "Partial evaluation",
  MORE_EVIDENCE_NEEDED: "More evidence needed", OUTSIDE_CURRENT_SCOPE: "Outside current scope", SOURCE_UNAVAILABLE: "Source unavailable",
};

const BLOCKER_COPY: Record<string, { missing: string; why: string }> = {
  CURRENT_SURVEY_STRUCTURE_GEOMETRY: {
    missing: "An existing-building setback check needs a current survey tying the building frame to the property lines.",
    why: "A setback rule by itself does not establish where an existing building sits.",
  },
  CODE_HEIGHT_ANALYSIS: {
    missing: "A project-height check needs a dimensioned height analysis using the City’s required grade and roof measurement rules.",
    why: "A plan label cannot be compared until its grade, highest point, roof treatment, and angled-plane measurements use the City’s method.",
  },
  CODE_GFA_AND_PREMISES_AREA: {
    missing: "A project FAR check needs a floor-area worksheet showing what counts toward FAR and a verified legal premises area.",
    why: "The counted floor area and legal premises area must both use the applicable City definitions.",
  },
};

type EvidenceDetail = { label: string; value: string; href?: string };
const COMMON_RS: EvidenceDetail[] = [
  { label: "Authoritative rule", value: "San Diego Municipal Code Table 131-04D", href: RESIDENTIAL_CODE },
  { label: "Rule profile", value: "RS-1-7 · effective April 24, 2025" },
  { label: "Parcel facts", value: "Recorded public parcel evaluation for APN 6341302200" },
];

const EVIDENCE: Record<string, EvidenceDetail[]> = {
  RS17_AREA: [...COMMON_RS, { label: "Comparison inputs", value: "5,000 sq ft minimum; 22,096.320 sq ft Code-defined area" }],
  RS17_WIDTH: [...COMMON_RS, { label: "Comparison inputs", value: "50 ft minimum; 94.00 ft Code-defined width" }],
  RS17_DEPTH: [...COMMON_RS, { label: "Comparison inputs", value: "95 ft minimum; 235.02 ft Code-defined depth" }],
  RS17_FRONTAGE: [...COMMON_RS, { label: "Comparison inputs", value: "50 ft minimum; 94.00 ft supported frontage" }],
  RS17_FRONT: [...COMMON_RS, { label: "Rule location", value: "Table 131-04D front setback; slope, cul-de-sac, and Fire conditions remain separate" }],
  RS17_REAR: [...COMMON_RS, { label: "Selected calculation", value: "235.02 ft lot depth × 10% = 23.502 ft; 13 ft is the table base" }],
  RS17_SIDE: [...COMMON_RS, { label: "Rule location", value: "Table 131-04D interior-side setback; 4 ft ordinary base per side" }],
  RS17_STREET_SIDE: [...COMMON_RS, { label: "Parcel condition", value: "Recorded line roles show no street-side property line" }],
  RS17_EXISTING: [...COMMON_RS, { label: "Evidence needed", value: "Current survey-controlled building-frame geometry" }],
  RM25_ZONE: [
    { label: "Mapping source", value: "SanGIS Zoning_Base_SD public mapping · acquisition zoning-city-sd-20260930T024032Z" },
    { label: "Mapped result", value: "RM-2-5 principal zone for APN 5442140600" },
  ],
  RM25_HEIGHT: [
    { label: "Authoritative rule", value: "SDMC Table 131-04G and §§113.0270, 131.0444", href: RESIDENTIAL_CODE },
    { label: "Measurement rules", value: "SDMC Chapter 11, Article 3, Division 2", href: MEASUREMENT_CODE },
    { label: "Rule profile", value: "RM-2-5 · effective May 6, 2023 · 40 ft base plus angled-plane conditions" },
  ],
  RM25_FAR: [
    { label: "Authoritative rule", value: "SDMC Table 131-04G and §§113.0234, 131.0446", href: RESIDENTIAL_CODE },
    { label: "Measurement rules", value: "SDMC Chapter 11, Article 3, Division 2", href: MEASUREMENT_CODE },
    { label: "Rule profile", value: "RM-2-5 · effective May 6, 2023 · 1.35 in each recorded unit band" },
  ],
  RM25_SDA: [
    { label: "Mapped geometry", value: "City DSD Planning MapServer layer 11 recorded an SDA intersection for APN 5442140600" },
    { label: "Mapping receipt", value: "Packet 42 public mapping evidence records feature 1548 and the parcel intersection" },
    { label: "Product status", value: "SDA source reconciliation pending; the observation is not used for a regulatory or eligibility conclusion" },
  ],
  RM25_FIRE: [
    { label: "Mapped source", value: "City of San Diego Fire Hazard Severity Zone Map 2025 · effective August 30, 2025" },
    { label: "Mapped result", value: "Parcel intersects the mapped Very High Fire Hazard Severity Zone" },
    { label: "Limit", value: "Mapped geography is not a project-specific Fire Official determination" },
  ],
  PRJ1111087_SIDE: [
    { label: "Private plan evidence", value: "PRJ-1111087 · Architectural Site Plan A0.1, page 15 · fourth construction-document submittal" },
    { label: "Plan status", value: "Issuance has not been proven" }, { label: "Application record", value: "January 29, 2024" },
    { label: "Applicable rule profile", value: "Outside Coastal · Ordinance O-21618 · effective May 6, 2023", href: ORDINANCE_21618 },
    { label: "Comparison inputs", value: "5 ft 11-1/2 in proposed enclosed-ADU frame setback; 4 ft selected minimum" },
  ],
  P50_HEIGHT: [
    { label: "Base rule", value: "RM-2-5 · 40 ft base profile plus angled-plane conditions", href: RESIDENTIAL_CODE },
    { label: "Private plan fact", value: "The plan labels 40 ft, but its measurement method has not been reconciled to the City’s rules" },
    { label: "Evidence needed", value: "Dimensioned grade, highest-point, roof-treatment, and angled-plane analysis" },
  ],
  P50_FAR: [
    { label: "Base rule", value: "RM-2-5 · 1.35 selected maximum", href: RESIDENTIAL_CODE },
    { label: "Private plan fact", value: "The plan labels FAR 1.10, but the counted floor area and premises area are not independently verified" },
    { label: "Evidence needed", value: "Code-compatible floor-area worksheet and verified legal premises area" },
  ],
};

const VIEWS: Array<{ mode: PreviewMode; label: string }> = [
  { mode: "rs", label: "Public RS" }, { mode: "rm", label: "Public RM" },
  { mode: "private", label: "Private project" }, { mode: "blocked", label: "Height / FAR blockers" },
];
type SummaryItem = { text: string; target: string };
type SummarySection = { title: string; items: SummaryItem[] };

function summariesFor(mode: PreviewMode): SummarySection[] {
  if (mode === "rs") return [
    { title: "Meets base rule", items: [
      { text: "Minimum lot area", target: "RS17_AREA" }, { text: "Minimum lot width", target: "RS17_WIDTH" },
      { text: "Minimum lot depth", target: "RS17_DEPTH" }, { text: "Minimum frontage", target: "RS17_FRONTAGE" },
    ] },
    { title: "Conditional", items: [
      { text: "Front setback", target: "RS17_FRONT" }, { text: "Rear setback", target: "RS17_REAR" },
      { text: "Interior-side setback", target: "RS17_SIDE" }, { text: "Height profile", target: "RS17_HEIGHT_PROFILE" },
      { text: "FAR profile", target: "RS17_FAR_PROFILE" },
    ] },
    { title: "Needs evidence", items: [{ text: "Existing-building setbacks", target: "RS17_EXISTING" }] },
    { title: "Not applicable", items: [{ text: "Street-side setback", target: "RS17_STREET_SIDE" }] },
  ];
  if (mode === "rm") return [
    { title: "Conditional", items: [{ text: "Base height rule", target: "RM25_HEIGHT" }, { text: "Base FAR rule", target: "RM25_FAR" }] },
    { title: "Mapped context", items: [
      { text: "SDA geometry detected; verification pending", target: "RM25_SDA" },
      { text: "Very High Fire Hazard Severity Zone mapped", target: "RM25_FIRE" },
    ] },
    { title: "Not evaluated", items: [
      { text: "Project height comparison", target: "RM25_HEIGHT" }, { text: "Project FAR comparison", target: "RM25_FAR" },
      { text: "SDA program eligibility", target: "RM25_SDA" }, { text: "Project-specific Fire requirements", target: "RM25_FIRE" },
    ] },
  ];
  if (mode === "private") return [
    { title: "Meets base rule", items: [{ text: "Building 1 north enclosed-ADU frame setback — this dimension only", target: "PRJ1111087_SIDE" }] },
    { title: "Not evaluated", items: [
      { text: "Height", target: "private-scope-status" }, { text: "FAR", target: "private-scope-status" },
      { text: "Development capacity", target: "private-scope-status" }, { text: "Whole-project compliance", target: "private-scope-status" },
    ] },
  ];
  return [
    { title: "Conditional", items: [{ text: "RM-2-5 base height rule", target: "P50_HEIGHT" }, { text: "RM-2-5 base FAR rule", target: "P50_FAR" }] },
    { title: "Needs evidence", items: [{ text: "Project height comparison", target: "P50_HEIGHT" }, { text: "Project FAR comparison", target: "P50_FAR" }] },
  ];
}

function groupFor(card: RuleResult): string {
  if (card.rule_family === "BASE_ZONING") return "Base facts";
  if (/AREA|WIDTH|DEPTH|FRONTAGE/.test(card.rule_family)) return "Parcel dimensions";
  if (/SETBACK/.test(card.rule_family)) return "Setbacks";
  if (card.rule_family === "STRUCTURE_HEIGHT" || card.rule_family === "FAR") return "Height and FAR";
  if (card.scope === "PROGRAM_OR_OVERLAY") return "Mapped context";
  return "Evidence needed";
}

function cardCopy(card: RuleResult) {
  if (card.card_id === "RM25_ZONE") return { label: "Base zone identified", answer: "Public mapping identifies the parcel’s base zone as RM-2-5.", why: "The principal mapped zoning feature is RM-2-5.", requirement: null, fact: "RM-2-5 mapped zone" };
  if (card.card_id === "PRJ1111087_SIDE") return { label: "Meets setback rule", answer: "This proposed dimension meets the selected 4 ft interior-side setback rule.", why: "This dimension only: Building 1’s north enclosed-ADU frame is compared with the identified rule. This does not establish project compliance, approval, or issuance.", requirement: "4 ft selected application-date minimum", fact: "5 ft 11-1/2 in proposed enclosed-ADU frame setback" };
  if (card.card_id === "RS17_REAR") return { label: "Conditional", answer: "Current calculated rear setback rule: 23.5 ft.", why: "The RS-1-7 table base is 13 ft, but this lot’s depth triggers the long-lot formula. Additional unresolved conditions may still increase or modify the requirement.", requirement: "23.5 ft current calculated rule; 13 ft table base", fact: "235 ft Code-defined lot depth" };
  if (card.card_id === "RS17_FRONT") return { label: "Conditional", answer: "The current front-setback rule starts at 15 ft.", why: "Lot slope, cul-de-sac geometry, and project-specific Fire conditions may change the requirement.", requirement: card.requirement, fact: null };
  if (card.card_id === "RS17_SIDE") return { label: "Conditional", answer: "The current interior-side setback rule starts at 4 ft per side.", why: "Additions, side-yard reallocation, projections, and project-specific Fire conditions remain separate.", requirement: card.requirement, fact: "94 ft Code-defined lot width" };
  if (card.card_id === "RS17_AREA") return { label: STATE_LABELS[card.result_state], answer: card.answer, why: card.why, requirement: card.requirement, fact: "22,096 sq ft Code-defined area" };
  if (card.card_id === "RS17_WIDTH") return { label: STATE_LABELS[card.result_state], answer: card.answer, why: card.why, requirement: card.requirement, fact: "94 ft Code-defined width" };
  if (card.card_id === "RS17_DEPTH") return { label: STATE_LABELS[card.result_state], answer: card.answer, why: card.why, requirement: card.requirement, fact: "235 ft Code-defined depth" };
  if (card.card_id === "RS17_FRONTAGE") return { label: STATE_LABELS[card.result_state], answer: card.answer, why: card.why, requirement: card.requirement, fact: "94 ft supported frontage" };
  if (card.card_id === "RM25_SDA") return { label: "Mapped context", answer: "Mapped SDA geometry detected. SDA verification is pending.", why: "A City planning-map intersection was recorded, but the SDA source is still being reconciled. It is not used for a regulatory or eligibility conclusion.", requirement: "SDA source verification pending", fact: "Mapped geometry intersects the parcel" };
  if (card.card_id === "RM25_FIRE") return { label: "Mapped context", answer: "Very High Fire Hazard Severity Zone (VHFHSZ) context is mapped.", why: "The mapped area is context only. Project-specific Fire requirements have not been evaluated.", requirement: "Project-specific requirements: not evaluated", fact: "Parcel intersects mapped VHFHSZ geography" };
  if (card.card_id === "RM25_HEIGHT") return { label: "Base rule · Conditional", answer: "Base height rule: 40 ft, with angled-plane and other applicable conditions.", why: "Project height: not evaluated. A project-specific comparison would require dimensions using the City’s grade, roof, and angled-plane measurement rules.", requirement: "40 ft maximum with angled-plane and overlay conditions", fact: null };
  if (card.card_id === "RM25_FAR") return { label: "Base rule · Conditional", answer: "Base FAR maximum: 1.35 in each recorded RM-2-5 unit band.", why: "Project FAR: not evaluated. A project-specific comparison would require a floor-area worksheet and verified legal premises area.", requirement: card.requirement, fact: null };
  if (card.card_id === "P50_HEIGHT") return { label: "Project comparison · Needs evidence", answer: "The base height rule is conditional; the private project comparison needs evidence.", why: "The plan’s labelled height cannot be compared yet because its measurement method has not been reconciled to the City’s height rules.", requirement: "Conditional base rule: 40 ft plus angled-plane conditions", fact: "Project comparison: needs evidence" };
  if (card.card_id === "P50_FAR") return { label: "Project comparison · Needs evidence", answer: "The base FAR rule is conditional; the private project comparison needs evidence.", why: "The plan’s counted floor area and legal premises area have not yet been independently verified.", requirement: "Conditional base rule: 1.35 selected maximum", fact: "Project comparison: needs evidence" };
  return { label: STATE_LABELS[card.result_state], answer: card.answer, why: card.why, requirement: card.requirement, fact: card.fact };
}

function RuleCard({ card }: { card: RuleResult }) {
  const copy = cardCopy(card);
  const blocker = card.blocker_codes.map((code) => BLOCKER_COPY[code]).find(Boolean);
  return (
    <article id={card.card_id} className={styles.ruleCard} data-state={card.result_state} data-card-id={card.card_id}>
      <div className={styles.cardTopline}><h3>{card.rule_name}</h3><span className={styles.stateBadge} data-state={card.result_state}>{copy.label}</span></div>
      <p className={styles.answer}>{copy.answer}</p>
      {card.card_id === "PRJ1111087_SIDE" ? <p className={styles.dimensionQualifier}>This dimension only</p> : null}
      {(copy.requirement || copy.fact) ? <dl className={styles.ruleFacts}>
        {copy.requirement ? <div><dt>Rule requirement</dt><dd>{copy.requirement}</dd></div> : null}
        {copy.fact ? <div><dt>{card.scope === "PROJECT_COMPARISON" ? "Project comparison" : "Parcel fact"}</dt><dd>{copy.fact}</dd></div> : null}
      </dl> : null}
      <p className={styles.why}>{copy.why}</p>
      {card.result_state === "NEEDS_EVIDENCE" && blocker ? <section className={styles.blocker} aria-label="Evidence needed">
        <div><span>What’s needed</span><p>{blocker.missing}</p></div><div><span>Why it matters</span><p>{blocker.why}</p></div>
      </section> : null}
      <details className={styles.evidence}><summary>Evidence and sources</summary><dl>
        {(EVIDENCE[card.card_id] ?? []).map((item) => <div key={`${item.label}-${item.value}`}><dt>{item.label}</dt><dd>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.value}</a> : item.value}</dd></div>)}
        {card.privacy === "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" ? <div><dt>Privacy</dt><dd>Private authorized evidence · excluded from public caching and indexing</dd></div> : null}
      </dl></details>
    </article>
  );
}

function SummaryGroup({ title, items }: SummarySection) {
  return <section className={styles.summaryGroup}><h3>{title}<span>{items.length}</span></h3><ul>{items.map((item) => <li key={`${item.target}-${item.text}`}><a href={`#${item.target}`}>{item.text}</a></li>)}</ul></section>;
}

function RsProfileNotes() {
  return <section className={styles.profileNotes} aria-labelledby="rs-profile-heading">
    <div className={styles.sectionHeading}><p>Base rule profiles</p><h2 id="rs-profile-heading">Height and FAR rule profiles</h2></div>
    <div className={styles.profileGrid}>
      <article id="RS17_HEIGHT_PROFILE"><span>Conditional</span><h3>24 ft at applicable setback lines · 30 ft overall</h3><p>The inward angled plane depends on Code-defined lot width. Project height has not been evaluated.</p><a href={RESIDENTIAL_CODE} target="_blank" rel="noreferrer">SDMC Table 131-04D · effective April 24, 2025</a></article>
      <article id="RS17_FAR_PROFILE"><span>Conditional</span><h3>Table 131-04J lot-area rule</h3><p>The applicable rule depends on Code-defined area and the separate steep-hillside formula. Project FAR has not been evaluated.</p><a href={RESIDENTIAL_CODE} target="_blank" rel="noreferrer">SDMC residential development regulations</a></article>
    </div>
  </section>;
}

function BaseFacts({ mode }: { mode: PreviewMode }) {
  if (mode !== "rs" && mode !== "rm") return null;
  return <section className={styles.baseFacts} aria-label="Parcel identity and mapped facts">
    <div><span>Base zone identified</span><strong>{mode === "rs" ? "RS-1-7" : "RM-2-5"}</strong></div>
    <div><span>Coastal context</span><strong>Outside Coastal</strong></div>
    <div><span>Evidence scope</span><strong>Public parcel sources only</strong></div>
  </section>;
}

function PrivateStatus({ payload }: { payload: PreviewPayload }) {
  return <section className={styles.privateStatus} id="private-scope-status" aria-labelledby="private-status-heading">
    <div><p>Private evidence scope</p><h2 id="private-status-heading">Fourth construction-document submittal — issuance not proven</h2></div>
    <dl><div><dt>Project</dt><dd>{payload.project_id}</dd></div><div><dt>Application record</dt><dd>January 29, 2024</dd></div><div><dt>Applicable rule profile</dt><dd>Outside Coastal · Ordinance O-21618 · effective May 6, 2023</dd></div><div><dt>Not evaluated</dt><dd>Height, FAR, development capacity, and whole-project compliance</dd></div></dl>
  </section>;
}

function identityFor(mode: PreviewMode, payload: PreviewPayload) {
  if (mode === "rs") return { eyebrow: "Public parcel feasibility", title: "1456 27th St", detail: `APN ${payload.apn} · RS-1-7 · Outside Coastal` };
  if (mode === "rm") return { eyebrow: "Public parcel feasibility", title: "639 N 67th St", detail: `APN ${payload.apn} · RM-2-5 · Outside Coastal` };
  if (mode === "private") return { eyebrow: "Private project analysis", title: payload.project_id ?? "Private project", detail: `APN ${payload.apn} · Not for public indexing` };
  return { eyebrow: "Evidence review", title: payload.project_id ?? "Height and FAR", detail: "Private project comparison · Not for public indexing" };
}

export default function FeasibilityPreview({ mode, payload }: { mode: PreviewMode; payload: PreviewPayload }) {
  const identity = identityFor(mode, payload);
  const groups = new Map<string, RuleResult[]>();
  for (const result of payload.rule_results) { const group = groupFor(result); groups.set(group, [...(groups.get(group) ?? []), result]); }
  return <main className={styles.shell} data-preview-mode={mode}>
    <header className={styles.header}><div className={styles.wordmark}><span aria-hidden="true">T</span> TRULOT</div><div className={styles.previewBadge}>Development preview · local only</div></header>
    <nav className={styles.viewNav} aria-label="Preview examples">{VIEWS.map((view) => <Link key={view.mode} href={`/feasibility-preview?view=${view.mode}`} aria-current={mode === view.mode ? "page" : undefined}>{view.label}</Link>)}</nav>
    <section className={styles.hero}><div><p className={styles.eyebrow}>{identity.eyebrow}</p><h1>{identity.title}</h1><p className={styles.identityDetail}>{identity.detail}</p></div><div className={styles.overallCard}><span>Overall evaluation</span><strong>{OVERALL_LABELS[payload.overall_state]}</strong><p>This describes evaluation coverage. It is not a whole-property or whole-project conclusion.</p></div></section>
    {mode === "private" || mode === "blocked" ? <aside className={styles.privateBanner}><strong>Private project analysis</strong><span>Not for public indexing · no public cache</span></aside> : null}
    <BaseFacts mode={mode} />{mode === "private" ? <PrivateStatus payload={payload} /> : null}
    <section className={styles.summary} aria-labelledby="summary-heading"><div className={styles.sectionHeading}><p>Current evaluation</p><h2 id="summary-heading">What TruLot knows</h2></div><div className={styles.summaryGrid}>{summariesFor(mode).map((group) => <SummaryGroup key={group.title} {...group} />)}</div></section>
    {mode === "rs" ? <RsProfileNotes /> : null}
    <section className={styles.results} aria-labelledby="rules-heading"><div className={styles.sectionHeading}><p>Rule-by-rule</p><h2 id="rules-heading">Requirements, facts, and current results</h2></div>
      {["Base facts", "Parcel dimensions", "Setbacks", "Height and FAR", "Mapped context", "Evidence needed"].map((group) => { const cards = groups.get(group); return cards?.length ? <section className={styles.ruleGroup} key={group}><h2>{group}</h2><div className={styles.cardGrid}>{cards.map((item) => <RuleCard card={item} key={item.card_id} />)}</div></section> : null; })}
    </section><footer className={styles.footer}>Static development evidence · deterministic contract · no production data source</footer>
  </main>;
}
