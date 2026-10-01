"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  normalizeAddress,
  PARCEL_LOOKUP_MAX_RESULTS,
  PARCEL_LOOKUP_QUERY_THRESHOLD,
  searchParcelLookup,
  type ParcelLookupRecord,
  type ParcelLookupResponse,
} from "@/lib/parcel-lookup-contract";
import type { ParcelLookupFailureInjection, ParcelLookupSyntheticFixture } from "@/lib/parcel-lookup-v0";
import styles from "./parcel-lookup-preview.module.css";

type Props = {
  records: ParcelLookupRecord[];
  initialApn: string | null;
  failureInjection: ParcelLookupFailureInjection | null;
  syntheticFixture: ParcelLookupSyntheticFixture | null;
};

function Highlight({ value, query }: { value: string; query: string }) {
  const tokens = new Set(normalizeAddress(query).split(" ").filter((token) => token.length >= 2));
  return (
    <>
      {value.split(/(\s+)/).map((part, index) => {
        const normalized = normalizeAddress(part);
        const matched = normalized && [...tokens].some((token) => normalized.startsWith(token));
        return matched ? <mark key={`${part}-${index}`}>{part}</mark> : <span key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function geometryPath(record: ParcelLookupRecord): string {
  const points = record.polygons.flat(2);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.000001);
  const spanY = Math.max(maxY - minY, 0.000001);
  const scale = Math.min(560 / spanX, 300 / spanY);
  const offsetX = (720 - spanX * scale) / 2;
  const offsetY = (420 - spanY * scale) / 2;
  const project = ([x, y]: [number, number]) => [offsetX + (x - minX) * scale, 420 - (offsetY + (y - minY) * scale)];
  return record.polygons
    .flatMap((polygon) => polygon.map((ring) => ring.map((point, index) => {
      const [x, y] = project(point);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") + " Z"))
    .join(" ");
}

function ParcelMap({ record }: { record: ParcelLookupRecord }) {
  const street = record.address?.replace(/^\d+\s+/, "") ?? "Parcel location";
  return (
    <figure className={styles.mapCard}>
      <svg viewBox="0 0 720 420" role="img" aria-label={`Parcel outline for ${record.displayAddress}`}>
        <defs>
          <pattern id="lookup-grid" width="92" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(-7)">
            <path d="M 92 0 L 0 0 0 72" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
          <filter id="parcel-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="9" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width="720" height="420" className={styles.mapBase} />
        <rect width="720" height="420" fill="url(#lookup-grid)" className={styles.mapGrid} />
        <path d="M-30 332 C145 280 288 364 750 248" className={styles.contextRoad} />
        <path d={geometryPath(record)} className={styles.parcelShape} fillRule="evenodd" filter="url(#parcel-shadow)" />
        <g className={styles.northArrow} aria-hidden="true">
          <path d="M668 54 L678 78 L668 72 L658 78 Z" />
          <text x="668" y="45" textAnchor="middle">N</text>
        </g>
        <text x="34" y="383" className={styles.streetLabel}>{street}</text>
      </svg>
      <figcaption>Parcel mapping shown for orientation. GIS parcel geometry is not a legal survey.</figcaption>
    </figure>
  );
}

function zoningLabel(record: ParcelLookupRecord): string {
  if (!record.zones.length) return "Not available in this bounded preview";
  if (record.zones.length === 1) return record.zones[0].code;
  if (record.zoningState === "BOUNDARY_SLIVER") {
    const principal = record.zones.find((zone) => zone.role === "principal") ?? record.zones[0];
    return `${principal.code} · mapped boundary sliver retained`;
  }
  return record.zones.map((zone) => `${zone.code}${zone.coveragePercent === null ? "" : ` ${zone.coveragePercent.toFixed(1)}%`}`).join(" + ");
}

function coastalLabel(record: ParcelLookupRecord): string {
  if (record.coastalValue === "inside_coastal") return "Inside Coastal Overlay Zone";
  if (record.coastalValue === "outside_coastal") return "Outside Coastal Overlay Zone";
  if (record.coastalState === "BOUNDARY_AMBIGUOUS") return "Boundary context requires review";
  return "Not available in this bounded preview";
}

function responseMessage(response: ParcelLookupResponse): string | null {
  if (response.state === "INVALID_APN") return "Enter all 10 APN digits. TruLot will not guess missing digits.";
  if (response.state === "MALFORMED_QUERY") return "Enter at least two address characters or a complete 10-digit APN.";
  if (response.state === "NO_MATCH") return "No parcel matched this bounded preview. Check the address or APN and try again.";
  if (response.state === "SOURCE_UNAVAILABLE") return "Parcel lookup is temporarily unavailable. Retry the lookup or start a new search.";
  if (response.state === "MULTIPLE_MATCHES") return `${response.totalMatches} parcel records share this address. Choose the correct APN or unit.`;
  if (response.state === "PARTIAL_MATCHES") return `${response.totalMatches} matching parcel${response.totalMatches === 1 ? "" : "s"}.`;
  return null;
}

export default function ParcelLookupPreviewClient({ records, initialApn, failureInjection, syntheticFixture }: Props) {
  const initial = initialApn ? records.find((record) => record.apn === initialApn) ?? null : null;
  const [query, setQuery] = useState(initial?.address ?? (initial ? initial.apnDisplay : ""));
  const [selected, setSelected] = useState<ParcelLookupRecord | null>(initial);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [sourceAvailable, setSourceAvailable] = useState(failureInjection !== "source-unavailable");
  const [openFailure, setOpenFailure] = useState<ParcelLookupRecord | null>(null);
  const [selectedFailureInjected, setSelectedFailureInjected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const response = useMemo(
    () => searchParcelLookup(records, query, { maximumResults: PARCEL_LOOKUP_MAX_RESULTS, sourceAvailable }),
    [records, query, sourceAvailable],
  );
  const suggestions = response.candidates;
  const isSearchable = query.trim().length >= PARCEL_LOOKUP_QUERY_THRESHOLD;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function completeSelection(record: ParcelLookupRecord) {
    setSelected(record);
    setOpenFailure(null);
    setQuery(record.address ?? record.apnDisplay);
    setOpen(false);
    setCopied(false);
    setDetailsOpen(false);
    setSubmissionMessage(null);
    window.history.replaceState({}, "", `/parcel-lookup-preview?apn=${record.apn}`);
  }

  function selectParcel(record: ParcelLookupRecord) {
    if (failureInjection === "selected-open" && !selectedFailureInjected) {
      setSelectedFailureInjected(true);
      setSelected(null);
      setOpenFailure(record);
      setQuery(record.address ?? record.apnDisplay);
      setOpen(false);
      setSubmissionMessage(null);
      return;
    }
    completeSelection(record);
  }

  function submitSearch() {
    const trimmed = query.trim();
    setSubmissionMessage(null);
    if (!trimmed) {
      setOpen(false);
      setSubmissionMessage("Enter an address or APN to search.");
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length < PARCEL_LOOKUP_QUERY_THRESHOLD) {
      setOpen(false);
      setSubmissionMessage(`Enter at least ${PARCEL_LOOKUP_QUERY_THRESHOLD} characters.`);
      inputRef.current?.focus();
      return;
    }
    if (response.state === "EXACT_MATCH" && suggestions[0]) selectParcel(suggestions[0].record);
    else if (suggestions.length) {
      setOpen(true);
      setActiveIndex(0);
    } else setOpen(true);
  }

  async function copyApn() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.apnDisplay);
    setCopied(true);
  }

  function resetSearch() {
    setQuery("");
    setSelected(null);
    setOpen(false);
    setDetailsOpen(false);
    setSubmissionMessage(null);
    setOpenFailure(null);
    window.history.replaceState({}, "", "/parcel-lookup-preview");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <main className={styles.shell} data-preview-source="sealed-parcel-lookup-v0" data-production-wired="false" data-lookup-source={sourceAvailable ? "available" : "unavailable"}>
      <header className={styles.header}>
        <Link href="/parcel-lookup-preview" className={styles.wordmark} aria-label="TruLot Parcel Lookup preview home">
          <span className={styles.wordmarkMark}>T</span><span>TRULOT</span>
        </Link>
        <span className={styles.previewBadge}>
          {syntheticFixture ? `SYNTHETIC_${syntheticFixture.toUpperCase()}_FIXTURE` : `Local preview · ${records.length} parcels`}
        </span>
      </header>

      <section className={`${styles.searchSection} ${selected ? styles.searchSectionCompact : ""}`}>
        <p className={styles.eyebrow}>San Diego parcel lookup</p>
        <h1>{selected ? "Find another parcel" : "Start with an address or APN."}</h1>
        {!selected ? <p className={styles.intro}>Identify the parcel first. Then see its outline, APN, zoning, and essential public facts.</p> : null}
        <form className={styles.searchForm} onSubmit={(event) => { event.preventDefault(); submitSearch(); }} role="search">
          <div className={styles.comboboxWrap}>
            <label htmlFor="parcel-query" className={styles.srOnly}>Address or APN</label>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
            <input
              ref={inputRef}
              id="parcel-query"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
                setOpenFailure(null);
                setSubmissionMessage(null);
                setOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => { if (isSearchable) setOpen(true); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1)); }
                if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
                if (event.key === "Enter" && open && suggestions[activeIndex]) { event.preventDefault(); selectParcel(suggestions[activeIndex].record); }
              }}
              placeholder="Try 639 N 67TH ST or 544-214-06-00"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open && isSearchable}
              aria-controls={listId}
              aria-activedescendant={open && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            />
            {query ? <button type="button" className={styles.clearButton} onClick={resetSearch} aria-label="Clear parcel search">×</button> : null}
          </div>
          <button type="submit" className={styles.searchButton}>Find parcel</button>
          {open && isSearchable ? (
            <div className={styles.suggestionPanel}>
              {suggestions.length ? (
                <ul id={listId} role="listbox" aria-label="Parcel matches">
                  {suggestions.map(({ record, matchReason }, index) => (
                    <li key={record.apn} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectParcel(record)} className={index === activeIndex ? styles.activeSuggestion : ""}>
                        <span className={styles.suggestionPin} aria-hidden="true">{index + 1}</span>
                        <span className={styles.suggestionText}>
                          <strong><Highlight value={record.displayAddress} query={query} /></strong>
                          <small>{record.jurisdiction}{record.zip ? ` · ${record.zip}` : ""}</small>
                        </span>
                        <span className={styles.suggestionApn}>APN {record.apnDisplay}<small>{matchReason.replaceAll("_", " ")}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.emptyMessage}>{responseMessage(response)}</p>}
              {suggestions.length && responseMessage(response) ? <p className={styles.resultMessage}>{responseMessage(response)}</p> : null}
              {response.totalMatches > suggestions.length ? <p className={styles.resultMessage}>Showing {suggestions.length} of {response.totalMatches}; add a unit or APN digits to narrow the list.</p> : null}
            </div>
          ) : null}
        </form>
        {submissionMessage ? <p className={styles.validationMessage} role="alert">{submissionMessage}</p> : null}
        {!selected ? (
          <div className={styles.examples} aria-label="Example searches">
            <span>Try an example</span>
            {["639 N 67TH ST", "544-214-06-00", "1501 FRONT ST"].map((example) => <button key={example} type="button" onClick={() => { setQuery(example); setSubmissionMessage(null); setOpen(true); inputRef.current?.focus(); }}>{example}</button>)}
          </div>
        ) : null}
      </section>

      {!sourceAvailable ? (
        <section className={styles.failureCard} role="alert" data-lookup-state="SOURCE_UNAVAILABLE">
          <p className={styles.eyebrow}>Source unavailable</p>
          <h2>Parcel lookup is temporarily unavailable.</h2>
          <p>The bounded preview did not use a fallback source. Your search remains ready to retry.</p>
          <button type="button" onClick={() => {
            setSourceAvailable(true);
            setOpen(query.trim().length >= PARCEL_LOOKUP_QUERY_THRESHOLD);
            window.history.replaceState({}, "", "/parcel-lookup-preview");
            inputRef.current?.focus();
          }}>Retry lookup</button>
        </section>
      ) : null}

      {openFailure ? (
        <section className={styles.failureCard} role="alert" data-lookup-state="SELECTED_PARCEL_UNAVAILABLE">
          <p className={styles.eyebrow}>Parcel unavailable</p>
          <h2>We couldn&apos;t open this parcel.</h2>
          <p>{openFailure.displayAddress} · APN {openFailure.apnDisplay}</p>
          <div className={styles.failureActions}>
            <button type="button" onClick={() => completeSelection(openFailure)}>Retry parcel</button>
            <button type="button" onClick={resetSearch}>Search again</button>
          </div>
        </section>
      ) : null}

      {selected ? (
        <section className={styles.resultSection} aria-live="polite">
          <div className={styles.identityCard}>
            <div className={styles.identityTopline}><span>Parcel found</span><button type="button" onClick={resetSearch}>New search</button></div>
            <h2>{selected.address ?? `APN ${selected.apnDisplay}`}</h2>
            {selected.unit ? <p className={styles.unitLine}>Unit {selected.unit}</p> : null}
            <div className={styles.apnUtility}>
              <div><span>Assessor parcel number</span><strong>APN {selected.apnDisplay}</strong></div>
              <button type="button" onClick={copyApn}>{copied ? "Copied" : "Copy APN"}</button>
            </div>
            <p className={styles.locationLine}>{selected.jurisdiction}{selected.zip ? ` · ${selected.zip}` : ""}</p>
            <dl className={styles.facts}>
              <div><dt>Base zoning</dt><dd>{zoningLabel(selected)}</dd></div>
              <div><dt>Coastal status</dt><dd>{coastalLabel(selected)}</dd></div>
              <div><dt>Approx. parcel area</dt><dd>{Math.round(selected.approximateAreaSqFt).toLocaleString()} sq ft</dd></div>
              {selected.existingUnits !== null ? <div><dt>Existing dwelling units</dt><dd>{selected.existingUnits}</dd></div> : null}
            </dl>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>{detailsOpen ? "Hide parcel details" : "View parcel details"}</button>
              {selected.parcelIntelligenceAvailable ? <Link href={`/parcel-v2-preview/${selected.apn}`}>View zoning details</Link> : <span>Zoning detail preview unavailable</span>}
            </div>
          </div>
          <ParcelMap record={selected} />
          {detailsOpen ? (
            <aside className={styles.detailPanel}>
              <div><span>Stable parcel identity</span><strong>{selected.apn}</strong></div>
              <div><span>Parcel record</span><strong>{selected.parcelId ?? "Not recorded"}</strong></div>
              <div><span>Geometry source</span><strong>SanGIS · {selected.geometryType}</strong></div>
              <p>This lookup confirms parcel orientation only. It does not evaluate compliance, feasibility, legal-lot status, or development capacity.</p>
            </aside>
          ) : null}
        </section>
      ) : (
        <section className={styles.promiseGrid} aria-label="Parcel lookup sequence">
          <article><span>01</span><h2>Find the identity</h2><p>Search a full or partial address, a formatted APN, or all 10 APN digits.</p></article>
          <article><span>02</span><h2>Confirm the shape</h2><p>See the sealed parcel outline and public identity before opening deeper intelligence.</p></article>
          <article><span>03</span><h2>Continue with context</h2><p>Move into available zoning detail while keeping uncertainty explicit.</p></article>
        </section>
      )}

      <footer className={styles.footer}>Development/test preview · Sealed local parcel data · No production database</footer>
    </main>
  );
}
