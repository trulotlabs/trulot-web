import Link from "next/link";
import type { ContractAction, FeasibilityItem, PreviewMode, PreviewPayload, TemplateCatalog } from "@/lib/bounded-feasibility-preview";
import { buildSummary, cardFactLabel, cardRequirementLabel, groupItems, OVERALL_LABELS, renderItemAnswer, SECTION_LABELS, SECTION_ORDER } from "@/lib/feasibility-preview-presentation";
import styles from "./feasibility-preview.module.css";

const VIEWS: Array<{ view: PreviewMode; label: string }> = [
  { view: "rs", label: "Public RS" },
  { view: "rm", label: "Public RM" },
  { view: "private", label: "Private project" },
  { view: "blocked", label: "Height / FAR blockers" },
];

function Actions({ actions }: { actions: ContractAction[] }) {
  if (!actions.length) return null;
  return <div className={styles.actions}>{actions.map((action) => action.type === "LINK"
    ? <a key={`${action.type}-${action.label}`} href={action.destination!}>{action.label}</a>
    : <p key={`${action.type}-${action.label}`}>{action.label}</p>)}</div>;
}

function RuleCard({ item, templates }: { item: FeasibilityItem; templates: TemplateCatalog }) {
  const state = item.result_state ?? item.item_kind;
  return <article id={item.item_id} className={styles.ruleCard} data-state={state} data-item-kind={item.item_kind}>
    <div className={styles.cardTopline}><h3>{item.name}</h3><span className={styles.stateBadge} data-state={state}>{item.state_label}</span></div>
    <p className={styles.answer}>{renderItemAnswer(item, templates)}</p>
    {item.comparison_scope === "THIS_DIMENSION_ONLY" ? <p className={styles.dimensionQualifier}>This dimension only</p> : null}
    {(item.display_requirement || item.display_fact) ? <dl className={styles.ruleFacts}>
      {item.display_requirement ? <div><dt>{cardRequirementLabel(item)}</dt><dd>{item.display_requirement}</dd></div> : null}
      {item.display_fact ? <div><dt>{cardFactLabel(item)}</dt><dd>{item.display_fact}</dd></div> : null}
    </dl> : null}
    {item.item_kind === "CONTEXT" ? <dl className={styles.ruleFacts}>
      <div><dt>Verification</dt><dd>{item.verification_state}</dd></div>
      <div><dt>Eligibility</dt><dd>{item.eligibility_state}</dd></div>
      <div><dt>Regulatory use</dt><dd>{item.regulatory_use_state}</dd></div>
    </dl> : null}
    <p className={styles.why}>{item.explanation}</p>
    {item.blocker ? <section className={styles.blocker} aria-label="Evidence needed">
      <div><span>What’s needed</span><p>{item.blocker.missing}</p></div>
      <div><span>Why it matters</span><p>{item.blocker.why}</p></div>
    </section> : null}
    <Actions actions={item.actions} />
    <details className={styles.evidence}><summary>Evidence and sources</summary><dl>
      {item.evidence_entries.map((entry) => <div key={`${entry.type}-${entry.label}-${entry.value}`}><dt>{entry.label}</dt><dd>{entry.url ? <a href={entry.url} target="_blank" rel="noreferrer">{entry.value}</a> : entry.value}</dd></div>)}
    </dl></details>
  </article>;
}

function ProjectStatus({ payload }: { payload: PreviewPayload }) {
  const project = payload.project_context;
  if (!project) return null;
  return <section className={styles.privateStatus} id={project.target_id} aria-labelledby="private-status-heading">
    <div><p>Private evidence scope</p><h2 id="private-status-heading">{project.status}</h2></div>
    <dl>
      <div><dt>Project</dt><dd>{project.project_id}</dd></div>
      <div><dt>Application record</dt><dd>{project.application_date}</dd></div>
      <div><dt>Applicable rule profile</dt><dd>{project.code_profile}</dd></div>
      <div><dt>Not evaluated</dt><dd>{project.not_evaluated.join(", ")}</dd></div>
    </dl>
  </section>;
}

export default function FeasibilityPreview({ selectedView, payload, templates }: { selectedView: PreviewMode; payload: PreviewPayload; templates: TemplateCatalog }) {
  const groups = groupItems(payload.items);
  const summaries = buildSummary(payload);
  return <main className={styles.shell} data-preview-mode={selectedView}>
    <header className={styles.header}><div className={styles.wordmark}><span aria-hidden="true">T</span> TRULOT</div><div className={styles.previewBadge}>Development preview · local only</div></header>
    <nav className={styles.viewNav} aria-label="Preview examples">{VIEWS.map((view) => <Link key={view.view} href={`/feasibility-preview?view=${view.view}`} aria-current={selectedView === view.view ? "page" : undefined}>{view.label}</Link>)}</nav>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>{payload.subject.eyebrow}</p><h1>{payload.subject.title}</h1><p className={styles.identityDetail}>{payload.subject.detail}</p></div>
      <div className={styles.overallCard}><span>Overall evaluation</span><strong>{OVERALL_LABELS[payload.overall_state]}</strong><p>This describes evaluation coverage. It is not a whole-property or whole-project conclusion.</p></div>
    </section>
    {payload.privacy === "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX" ? <aside className={styles.privateBanner}><strong>Private project analysis</strong><span>{payload.project_context?.privacy_label ?? "Not for public indexing · no public cache"}</span></aside> : null}
    {payload.base_facts.length ? <section className={styles.baseFacts} aria-label="Parcel identity and mapped facts">{payload.base_facts.map((fact) => <div key={fact.fact_id}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</section> : null}
    <ProjectStatus payload={payload} />
    <section className={styles.summary} aria-labelledby="summary-heading">
      <div className={styles.sectionHeading}><p>Current evaluation</p><h2 id="summary-heading">What TruLot knows</h2></div>
      <div className={styles.summaryGrid}>{summaries.map((summary) => <section className={styles.summaryGroup} key={summary.group}><h3>{summary.title}<span>{summary.items.length}</span></h3><ul>{summary.items.map((item) => <li key={`${item.target}-${item.text}`}><a href={`#${item.target}`}>{item.text}</a></li>)}</ul></section>)}</div>
    </section>
    <section className={styles.results} aria-labelledby="rules-heading">
      <div className={styles.sectionHeading}><p>Rule-by-rule</p><h2 id="rules-heading">Requirements, facts, and current results</h2></div>
      {SECTION_ORDER.map((section) => { const items = groups.get(section); return items?.length ? <section className={styles.ruleGroup} key={section}><h2>{SECTION_LABELS[section]}</h2><div className={styles.cardGrid}>{items.map((item) => <RuleCard item={item} templates={templates} key={item.item_id} />)}</div></section> : null; })}
    </section>
    <Actions actions={payload.actions} />
    <footer className={styles.footer}>Static development evidence · deterministic contract · no production data source</footer>
  </main>;
}
