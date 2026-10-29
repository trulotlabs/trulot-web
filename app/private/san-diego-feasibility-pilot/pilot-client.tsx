"use client";

import { useState } from "react";
import styles from "./pilot.module.css";

type Candidate = { apn: string; apnDisplay: string; displayAddress: string };
type View = {
  sessionId: string;
  questions: string[];
  evidenceLevel: string;
  confirmation: string | null;
  projectIntent: string | null;
  result: {
    headline: string;
    whatWeKnow: string[];
    whatYouToldUs: string[];
    whatWeDoNotKnow: string[];
    preliminaryGuidance: string;
    nextAction: string;
    whyItMatters: string;
    evidenceProvenance: string[];
    contradiction: string | null;
    aduLifecycle: string | null;
  };
  hasAduContext: boolean;
  hasAccessoryQuestion: boolean;
};

async function call(token: string, body: object) {
  const response = await fetch("/api/private/san-diego-feasibility-pilot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-trulot-pilot-token": token },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Private pilot request failed.");
  return value;
}

const initialSessionId = () => crypto.randomUUID();

export default function PilotClient({ operatorMode }: { operatorMode: boolean }) {
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [useApn, setUseApn] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [currentPropertyQuestion, setCurrentPropertyQuestion] = useState("");
  const [answered, setAnswered] = useState(false);
  const [confirmation, setConfirmation] = useState("YES");
  const [existingUse, setExistingUse] = useState("ONE_DETACHED_HOUSE");
  const [intent, setIntent] = useState("GENERAL");
  const [aduWorkAnswer, setAduWorkAnswer] = useState("NOT_SURE");
  const [accessoryAnswer, setAccessoryAnswer] = useState("UNANSWERED");
  const [clarity, setClarity] = useState("YES");
  const [trust, setTrust] = useState("SOMEWHAT");
  const [desiredAction, setDesiredAction] = useState("KEEP_REVIEWING_PROPERTY");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function startOver() {
    setSessionId(initialSessionId());
    setUseApn(false);
    setQuery("");
    setCandidates([]);
    setSelected(null);
    setView(null);
    setCurrentPropertyQuestion("");
    setAnswered(false);
    setConfirmation("YES");
    setExistingUse("ONE_DETACHED_HOUSE");
    setIntent("GENERAL");
    setAduWorkAnswer("NOT_SURE");
    setAccessoryAnswer("UNANSWERED");
    setClarity("YES");
    setTrust("SOMEWHAT");
    setDesiredAction("KEEP_REVIEWING_PROPERTY");
    setNote("");
    setMessage("");
  }

  async function findProperty() {
    setBusy(true);
    setMessage("");
    setCandidates([]);
    setSelected(null);
    try {
      const result = await call(token, { action: "lookup", query });
      setCandidates(result.candidates ?? []);
      setSelected(result.selected ?? null);
      if (!(result.candidates ?? []).length) setMessage("No matching San Diego parcel was found. Check the address or use APN instead.");
      else if (result.ambiguous) setMessage("More than one parcel matches. Choose the address and APN you want to review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Property lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startReview() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const started = await call(token, { action: "start", sessionId, apn: selected.apn });
      setView(started);
      setCurrentPropertyQuestion(started.questions[0] ?? "Confirm the current property");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Private pilot request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateReview() {
    setBusy(true);
    setMessage("");
    try {
      const accessoryStillPresent = accessoryAnswer === "YES" ? true : accessoryAnswer === "NO" ? false : undefined;
      const next = await call(token, {
        action: "answer",
        sessionId,
        confirmation,
        existingUse: confirmation === "NO" ? existingUse : undefined,
        projectIntent: intent,
        aduWorkAnswer: view?.hasAduContext ? aduWorkAnswer : undefined,
        accessoryStillPresent,
      });
      setView(next);
      setAnswered(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Private pilot request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function recordFeedback() {
    setBusy(true);
    setMessage("");
    try {
      await call(token, {
        action: "observe",
        sessionId,
        observation: {
          firstQuestion: confirmation === "NOT_SURE" ? "NOT_SURE" : confirmation === "NO" ? "CORRECTED_RECORD" : "UNDERSTOOD",
          trust: trust === "YES" ? "HIGH" : trust === "SOMEWHAT" ? "MEDIUM" : "LOW",
          result: clarity === "YES" ? "CLEAR" : "CONFUSED_OTHER",
          evidence: "NONE",
          desiredAction,
          role: "HOMEOWNER",
          confusion: clarity === "YES" ? "NONE" : "OTHER",
          trustSignal: "NONE",
          notSureOutcome: confirmation === "NOT_SURE" ? "KEPT_MOVING" : "NOT_USED",
          questionBurden: "ACCEPTABLE",
          dataQuality: "NONE",
        },
      });
      setMessage(note.trim()
        ? "Feedback recorded. Your optional note remains on this screen for the operator and is not stored in analytics."
        : "Feedback recorded without parcel, address, or answer content.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feedback failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.pilot}>
    {(query || selected || view) ? <div className={styles.toolbar}><button type="button" className={styles.secondaryButton} onClick={startOver}>Start over</button></div> : null}
    {!view ? <section className={styles.card}>
      <label>Private pilot access code<input autoComplete="off" onChange={event => setToken(event.target.value)} type="password" value={token}/></label>
      <div className={styles.intakeHeading}><div><p className={styles.eyebrow}>Find the property</p><h2>{useApn ? "Use the parcel number" : "Start with the property address"}</h2></div><button type="button" className={styles.textButton} onClick={() => { setUseApn(value => !value); setQuery(""); setCandidates([]); setSelected(null); }}>{useApn ? "Use address instead" : "Use APN instead"}</button></div>
      <label>{useApn ? "10-digit APN" : "Property address"}<input autoComplete="street-address" inputMode={useApn ? "numeric" : "text"} placeholder={useApn ? "544-214-06-00" : "639 N 67th St"} onChange={event => { setQuery(event.target.value); setCandidates([]); setSelected(null); }} value={query}/></label>
      <button disabled={busy || !token || query.trim().length < 2} onClick={findProperty}>Find property</button>
      {message ? <p role="status">{message}</p> : null}
      {candidates.length ? <div className={styles.candidates} aria-label="Matching parcels">{candidates.map(candidate => <button className={selected?.apn === candidate.apn ? styles.selectedCandidate : styles.candidate} key={candidate.apn} onClick={() => setSelected(candidate)} type="button"><strong>{candidate.displayAddress}</strong><span>APN {candidate.apnDisplay}</span></button>)}</div> : null}
      {selected ? <div className={styles.selectedProperty}><p>Reviewing</p><strong>{selected.displayAddress}</strong><span>APN {selected.apnDisplay}</span><button disabled={busy} onClick={startReview}>Continue with this property</button></div> : null}
      <p className={styles.limit}>Use a real property you care about. Do not enter owner names or other personal information.</p>
    </section> : null}
    {view ? <div className={styles.grid}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>What&apos;s on the property now?</p><h2>{currentPropertyQuestion || "Confirm the current property"}</h2><p className={styles.explanation}>This helps TruLot choose the right rules to review.</p>
        <div className={styles.options}>{["YES", "NO", "NOT_SURE"].map(value => <label key={value}><input checked={confirmation === value} name="confirm" onChange={() => setConfirmation(value)} type="radio"/>{value === "NOT_SURE" ? "Not sure" : value === "YES" ? "Yes" : "No"}</label>)}</div>
        {confirmation === "NO" ? <label>What is on the property today?<select onChange={event => setExistingUse(event.target.value)} value={existingUse}><option value="ONE_DETACHED_HOUSE">One main home</option><option value="TWO_OR_MORE_DWELLINGS">Two or more dwelling units</option><option value="CONDOMINIUM">Condominium property</option><option value="VACANT_LAND">Vacant land</option><option value="NOT_SURE">Not sure</option></select></label> : null}
        <hr/><p className={styles.eyebrow}>What are you thinking about building?</p>
        <label>Project idea<select onChange={event => setIntent(event.target.value)} value={intent}><option value="DETACHED_ADU">Add one detached ADU</option><option value="ATTACHED_ADU">Add one attached ADU</option><option value="GARAGE_CONVERSION">Convert a garage or other existing space</option><option value="JADU">Add a JADU</option><option value="MULTIPLE_ADUS">Add multiple ADUs</option><option value="ADDITIONAL_UNIT">Add another non-ADU dwelling or unit</option><option value="MULTIFAMILY_ADDITION">Add to an existing multifamily property</option><option value="GENERAL">I&apos;m not sure — show me what&apos;s possible</option></select></label>
        {view.hasAduContext ? <label>What is the current status of the ADU-related work?<select onChange={event => setAduWorkAnswer(event.target.value)} value={aduWorkAnswer}><option value="PRESENT">The work is present</option><option value="NOT_COMPLETED_OR_DIFFERS">Not completed or differs from the record</option><option value="NOT_STARTED">Not started</option><option value="NOT_SURE">Not sure</option></select></label> : null}
        {view.hasAccessoryQuestion ? <label>Is the older mapped secondary structure still there?<select onChange={event => setAccessoryAnswer(event.target.value)} value={accessoryAnswer}><option value="UNANSWERED">Not sure</option><option value="YES">Yes</option><option value="NO">No</option></select></label> : null}
        <button disabled={busy} onClick={updateReview}>Show my preliminary review</button>{message ? <p role="status">{message}</p> : null}
      </section>
      {answered ? <section className={styles.card}>
        <p className={styles.eyebrow}>Preliminary result</p><h2>{view.result.headline}</h2>
        <h3>What TruLot knows</h3>{view.result.whatWeKnow.map(value => <p key={value}>{value}</p>)}
        <h3>What you told us</h3>{view.result.whatYouToldUs.length ? view.result.whatYouToldUs.map(value => <p key={value}>{value}</p>) : <p>No homeowner confirmation has been added yet.</p>}
        <h3>What still needs confirmation</h3>{view.result.whatWeDoNotKnow.length ? view.result.whatWeDoNotKnow.map(value => <p key={value}>{value}</p>) : <p>No additional material fact was left unresolved by this step.</p>}
        <h3>What this means so far</h3><p className={styles.guidance}>{view.result.preliminaryGuidance}</p>{view.result.aduLifecycle ? <p>{view.result.aduLifecycle}</p> : null}{view.result.contradiction ? <aside>{view.result.contradiction}</aside> : null}
        <h3>Next best step</h3><p>{view.result.nextAction}</p><details><summary>Why TruLot says this</summary><ul>{view.result.evidenceProvenance.map(value => <li key={value}>{value}</li>)}</ul></details>
        <hr/><h3>Private pilot feedback</h3>
        <label>Was this clear?<select onChange={event => setClarity(event.target.value)} value={clarity}><option value="YES">Yes</option><option value="SOMEWHAT">Somewhat</option><option value="NO">No</option></select></label>
        <label>Did you trust the result?<select onChange={event => setTrust(event.target.value)} value={trust}><option value="YES">Yes</option><option value="SOMEWHAT">Somewhat</option><option value="NO">No</option></select></label>
        <label>What would you want to do next?<select onChange={event => setDesiredAction(event.target.value)} value={desiredAction}><option value="KEEP_REVIEWING_PROPERTY">Keep reviewing this property</option><option value="CHECK_ANOTHER_PARCEL">Check another property</option><option value="UPLOAD_EVIDENCE">Upload or verify information</option><option value="TALK_TO_PROFESSIONAL">Talk to a professional</option><option value="OTHER">Other</option></select></label>
        <label>Anything confusing or wrong? <span className={styles.optional}>(optional)</span><textarea onChange={event => setNote(event.target.value.slice(0, 500))} value={note}/><small>This note stays on this screen for the operator and is not stored in analytics.</small></label>
        <button disabled={busy} onClick={recordFeedback}>Record feedback</button>
        {operatorMode ? <details className={styles.operatorPanel}><summary>Operator diagnostics</summary><p>Internal research taxonomy remains separate from participant feedback. Use the content-free aggregate endpoint for formal classification.</p><dl><dt>Session</dt><dd>Anonymous session active</dd><dt>Evidence level</dt><dd>{view.evidenceLevel}</dd><dt>Not-sure state</dt><dd>{confirmation === "NOT_SURE" ? "Used and continued" : "Not used"}</dd></dl></details> : null}
        {message ? <p role="status">{message}</p> : null}<button type="button" className={styles.secondaryButton} onClick={startOver}>Check another property</button>
      </section> : null}
    </div> : null}
  </div>;
}
