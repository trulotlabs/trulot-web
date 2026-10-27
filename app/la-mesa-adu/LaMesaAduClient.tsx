"use client";

import { useId, useRef, useState } from "react";
import {
  buildLocalWaypointHandoff,
  evaluateLaMesaFrontDoor,
  propertyConfirmationFor,
  resolveLaMesaFrontDoor,
  type AduIdea,
  type ExistingSpace,
  type ExistingUse,
  type FrontDoorCandidate,
  type FrontDoorEvaluation,
  type FrontDoorLookupResult,
  type HomeownerAnswers,
  type LocalLeadDraft,
  type LaMesaFrontDoorDataset,
  type PropertyRecordConfirmation,
} from "@/lib/la-mesa-adu-front-door";
import styles from "./la-mesa-adu.module.css";

type Option<T extends string> = { value: T; label: string };

const EXISTING_USE_OPTIONS: Option<ExistingUse>[] = [
  { value: "ONE_DETACHED_HOUSE", label: "One detached house" },
  { value: "TWO_OR_MORE_DWELLINGS", label: "Two or more dwelling units" },
  { value: "VACANT_LAND", label: "Vacant land" },
  { value: "NOT_SURE", label: "Not sure" },
];
const ADU_IDEA_OPTIONS: Option<AduIdea>[] = [
  { value: "NEW_DETACHED_ADU", label: "New detached ADU" },
  { value: "ATTACHED_ADDITION", label: "Attached addition" },
  { value: "CONVERSION", label: "Garage or accessory-space conversion" },
  { value: "JADU", label: "JADU" },
  { value: "NOT_SURE", label: "Not sure yet" },
];
const EXISTING_SPACE_OPTIONS: Option<ExistingSpace>[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NOT_SURE", label: "Not sure" },
];
const PROPERTY_CONFIRMATION_OPTIONS: Option<PropertyRecordConfirmation>[] = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "NOT_SURE", label: "Not sure" },
];
const EMPTY_LEAD: LocalLeadDraft = {
  name: "",
  email: "",
  phone: "",
  consentToContact: false,
};

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>{legend}</legend>
      <div className={styles.optionGrid}>
        {options.map((option) => (
          <label className={styles.radioCard} key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SourceDisclosure({ evaluation }: { evaluation: FrontDoorEvaluation }) {
  if (!evaluation.evidenceSources.length) return null;
  return (
    <details className={styles.disclosure}>
      <summary>Why TruLot says this</summary>
      <div className={styles.disclosureBody}>
        <p>
          Public zoning, rule, and recorded property sources are kept separate from anything
          you tell us. Recorded characteristics may lag current conditions; operative law and
          project-specific evidence remain controlling.
        </p>
        <ul>
          {evaluation.evidenceSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer" target="_blank">{source.label}</a>
              <span>{source.publisher} · {source.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function ParcelIdentity({ candidate }: { candidate: FrontDoorCandidate }) {
  return (
    <div className={styles.identity}>
      <div>
        <p className={styles.kicker}>Selected property</p>
        <h2>{candidate.displayAddress}</h2>
        <p>APN {candidate.apnDisplay}</p>
      </div>
      <span className={candidate.jurisdiction === "CITY_OF_LA_MESA" ? styles.confirmed : styles.unresolved}>
        {candidate.jurisdictionLabel}
      </span>
    </div>
  );
}

function ResultPanel({ evaluation }: { evaluation: FrontDoorEvaluation }) {
  return (
    <section aria-labelledby="adu-result-heading" className={styles.resultCard}>
      <div className={styles.resultLead}>
        <p className={styles.status}>{evaluation.answerCategory}</p>
        <h2 id="adu-result-heading">{evaluation.headline}</h2>
        {evaluation.baseZone ? <p className={styles.zone}>Base zoning: <strong>{evaluation.baseZone}</strong></p> : null}
        {evaluation.evaluationDate ? <p className={styles.freshness}>Rules checked for October 2026</p> : null}
      </div>

      {evaluation.mappedContexts.length ? (
        <div className={styles.contextGrid} aria-label="Mapped planning context">
          {evaluation.mappedContexts.map((context) => (
            <article key={context.id}>
              <h3>{context.label}</h3>
              <p>{context.explanation}</p>
            </article>
          ))}
        </div>
      ) : null}

      {evaluation.specificPlanMessage ? <p className={styles.notice}>{evaluation.specificPlanMessage}</p> : null}

      {evaluation.pathways.length ? (
        <div className={styles.pathways}>
          <h3>Pathways relevant to your answers</h3>
          {evaluation.pathways.map((pathway) => (
            <article key={pathway.id}>
              <div>
                <h4>{pathway.label}</h4>
                <span>{pathway.category}</span>
              </div>
              <p>{pathway.reason}</p>
              <p><strong>Major constraint:</strong> {pathway.majorConstraint}</p>
              <details>
                <summary>What is still needed</summary>
                <ul>{pathway.stillNeeded.map((item) => <li key={item}>{item}</li>)}</ul>
              </details>
            </article>
          ))}
        </div>
      ) : null}

      {evaluation.missingFacts.length && !evaluation.pathways.length ? (
        <details className={styles.disclosure}>
          <summary>What TruLot still needs to know</summary>
          <ul className={styles.compactList}>
            {evaluation.missingFacts.slice(0, 7).map((fact) => (
              <li key={fact}>{fact.replaceAll("_", " ")}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {evaluation.homeownerAnswers ? (
        <details className={styles.disclosure}>
          <summary>Limits of this preliminary screen</summary>
          <ul className={styles.compactList}>
            {evaluation.userAnswerLimits.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        </details>
      ) : null}

      {evaluation.futureChangeNotice ? <p className={styles.futureNotice}>{evaluation.futureChangeNotice}</p> : null}
      <SourceDisclosure evaluation={evaluation} />
    </section>
  );
}

function LeadCapture({ evaluation }: { evaluation: FrontDoorEvaluation }) {
  const [lead, setLead] = useState<LocalLeadDraft>(EMPTY_LEAD);
  const [message, setMessage] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const consentId = useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handoff = buildLocalWaypointHandoff(evaluation, lead);
    setMessage(
      handoff
        ? "Saved in this local preview only. Nothing was sent."
        : "Add your name and email, then confirm consent if you want a local follow-up draft.",
    );
  }

  return (
    <section aria-labelledby="help-heading" className={styles.helpCard}>
      <p className={styles.kicker}>Optional next step</p>
      <h2 id="help-heading">Talk through this property</h2>
      <p>
        TruLot’s parcel analysis stays separate from any professional service request.
        This private preview saves no lead and sends nothing.
      </p>
      <form onSubmit={submit}>
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} onChange={(event) => setLead((current) => ({ ...current, name: event.target.value }))} value={lead.name} />
        <label htmlFor={emailId}>Email</label>
        <input id={emailId} onChange={(event) => setLead((current) => ({ ...current, email: event.target.value }))} type="email" value={lead.email} />
        <label htmlFor={phoneId}>Phone <span>optional</span></label>
        <input id={phoneId} onChange={(event) => setLead((current) => ({ ...current, phone: event.target.value }))} type="tel" value={lead.phone} />
        <label className={styles.consent} htmlFor={consentId}>
          <input
            checked={lead.consentToContact}
            id={consentId}
            onChange={(event) => setLead((current) => ({ ...current, consentToContact: event.target.checked }))}
            type="checkbox"
          />
          <span>I consent to be contacted about planning help for this property.</span>
        </label>
        <button type="submit">Create local follow-up draft</button>
        <p aria-live="polite" className={styles.formMessage}>{message}</p>
      </form>
    </section>
  );
}

export default function LaMesaAduClient({ dataset }: { dataset: LaMesaFrontDoorDataset }) {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<FrontDoorLookupResult | null>(null);
  const [selected, setSelected] = useState<FrontDoorCandidate | null>(null);
  const [evaluation, setEvaluation] = useState<FrontDoorEvaluation | null>(null);
  const [existingUse, setExistingUse] = useState<ExistingUse | null>(null);
  const [propertyConfirmation, setPropertyConfirmation] = useState<PropertyRecordConfirmation | null>(null);
  const [aduIdea, setAduIdea] = useState<AduIdea | null>(null);
  const [existingSpace, setExistingSpace] = useState<ExistingSpace | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const candidatesRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = resolveLaMesaFrontDoor(query, dataset);
    setLookup(result);
    setSelected(null);
    setEvaluation(null);
    window.setTimeout(() => candidatesRef.current?.focus(), 0);
  }

  function choose(candidate: FrontDoorCandidate) {
    const next = evaluateLaMesaFrontDoor(candidate, dataset);
    setSelected(candidate);
    setEvaluation(next);
    setLookup(null);
    setExistingUse(null);
    setPropertyConfirmation(null);
    setAduIdea(null);
    setExistingSpace(null);
    setIntakeError(null);
    window.setTimeout(() => resultRef.current?.focus(), 0);
  }

  function restart() {
    setQuery("");
    setLookup(null);
    setSelected(null);
    setEvaluation(null);
    setPropertyConfirmation(null);
    setIntakeError(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function confirmRecordedProperty(value: PropertyRecordConfirmation) {
    setPropertyConfirmation(value);
    const model = selected ? propertyConfirmationFor(dataset.propertyIntelligence[selected.apn]) : null;
    if (value === "YES") setExistingUse(model?.preselectedUse ?? null);
    else if (value === "NOT_SURE") setExistingUse("NOT_SURE");
    else setExistingUse(null);
    setAduIdea(null);
    setExistingSpace(null);
  }

  function reevaluate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !existingUse || !aduIdea) {
      setIntakeError("Choose one answer in each required group.");
      return;
    }
    if (aduIdea === "CONVERSION" && !existingSpace) {
      setIntakeError("Tell us whether conversion space may already exist.");
      return;
    }
    const answers: HomeownerAnswers = {
      existingUse: { value: existingUse, provenance: "USER_PROVIDED" },
      aduIdea: { value: aduIdea, provenance: "USER_PROVIDED" },
      ...(aduIdea === "CONVERSION" && existingSpace
        ? { existingSpace: { value: existingSpace, provenance: "USER_PROVIDED" as const } }
        : {}),
    };
    setEvaluation(evaluateLaMesaFrontDoor(selected, dataset, answers));
    setIntakeError(null);
    window.setTimeout(() => resultRef.current?.focus(), 0);
  }

  const showIntake = selected?.jurisdiction === "CITY_OF_LA_MESA" &&
    selected.canonicalScopeState === "IN_SCOPE_CONFIRMED" &&
    evaluation?.answerCategory !== "Outside current scope" &&
    evaluation?.answerCategory !== "Source unavailable";
  const confirmationModel = selected
    ? propertyConfirmationFor(dataset.propertyIntelligence[selected.apn])
    : null;
  const showExistingUseQuestion = !confirmationModel || propertyConfirmation === "NO";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="La Mesa ADU home">
          <span>La Mesa</span><strong>ADU</strong>
        </a>
        <span className={styles.privateBadge}>Private local preview</span>
      </header>

      <section className={styles.hero} id="top">
        <div>
          <p className={styles.kicker}>Start with the property</p>
          <h1>See which ADU questions matter for your La Mesa home.</h1>
          <p className={styles.heroCopy}>
            Find the parcel, review its recorded zoning and mapped context, then answer a few
            questions to narrow the relevant 2026 ADU pathways.
          </p>
        </div>
        <form className={styles.search} onSubmit={search} role="search">
          <label htmlFor={inputId}>Property address or APN</label>
          <div>
            <input
              autoComplete="street-address"
              id={inputId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="5836 Pawnee Dr or 464-030-11-00"
              ref={inputRef}
              value={query}
            />
            <button type="submit">Find property</button>
          </div>
          <p>Searches {dataset.canonicalCount.toLocaleString()} sealed La Mesa parcel records. No production lookup is used.</p>
        </form>
      </section>

      {lookup ? (
        <section
          aria-live="polite"
          className={styles.candidates}
          ref={candidatesRef}
          tabIndex={-1}
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Search result</p>
              <h2>{lookup.candidates.length ? "Choose the property" : "No property selected"}</h2>
            </div>
            <p>{lookup.message}</p>
          </div>
          {lookup.candidates.length ? (
            <ul>
              {lookup.candidates.map((candidate) => (
                <li key={`${candidate.jurisdiction}-${candidate.apn}`}>
                  <button onClick={() => choose(candidate)} type="button">
                    <span><strong>{candidate.displayAddress}</strong><small>APN {candidate.apnDisplay}</small></span>
                    <span><small>{candidate.jurisdictionLabel}</small><b>{candidate.confidence === "EXACT" ? "Exact match" : "Possible match"}</b></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {selected && evaluation ? (
        <div className={styles.workspace} ref={resultRef} tabIndex={-1}>
          <ParcelIdentity candidate={selected} />
          <ResultPanel evaluation={evaluation} />

          {showIntake ? (
            <section aria-labelledby="intake-heading" className={styles.intakeCard}>
              <p className={styles.kicker}>Check my ADU options</p>
              <h2 id="intake-heading">A few facts can narrow the pathways</h2>
              <p>Your answers are labeled as homeowner-provided and remain separate from recorded parcel facts.</p>
              <form onSubmit={reevaluate}>
                {confirmationModel ? (
                  <RadioGroup legend={confirmationModel.prompt} name="property-record-confirmation" onChange={confirmRecordedProperty} options={PROPERTY_CONFIRMATION_OPTIONS} value={propertyConfirmation} />
                ) : null}
                {showExistingUseQuestion ? (
                  <RadioGroup legend="What is currently on the property?" name="existing-use" onChange={setExistingUse} options={EXISTING_USE_OPTIONS} value={existingUse} />
                ) : null}
                {existingUse ? <RadioGroup legend="What are you considering?" name="adu-idea" onChange={setAduIdea} options={ADU_IDEA_OPTIONS} value={aduIdea} /> : null}
                {aduIdea === "CONVERSION" ? (
                  <RadioGroup legend="Is there an existing garage or accessory structure you may want to convert?" name="existing-space" onChange={setExistingSpace} options={EXISTING_SPACE_OPTIONS} value={existingSpace} />
                ) : null}
                <button className={styles.primaryButton} type="submit">Update my options</button>
                <p aria-live="polite" className={styles.formMessage}>{intakeError}</p>
              </form>
            </section>
          ) : null}

          {evaluation.homeownerAnswers && evaluation.jurisdictionConfirmed ? <LeadCapture evaluation={evaluation} /> : null}
          <button className={styles.restart} onClick={restart} type="button">Check another property</button>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <p><strong>Powered by TruLot property intelligence.</strong> Public parcel and rule context stays neutral and separate from optional professional help.</p>
        <p>No production data, public indexing, or live lead delivery is active in this preview.</p>
      </footer>
    </main>
  );
}
