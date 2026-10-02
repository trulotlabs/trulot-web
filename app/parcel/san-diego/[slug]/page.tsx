import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import type { ReactNode } from "react";
import {
  getParcelPageV1Result,
  type FaqItem,
  type ProgramDisplayState,
  type SourcedFact,
} from "@/lib/parcel-page-v1";
import { extractApnFromSlug } from "@/lib/parcel-slug";
import { parcelServingV2ShadowEnabled, runParcelServingV2Shadow } from "@/lib/parcel-serving-v2-shadow";
import { verifiedStandardsEnabled } from "@/lib/rs17-shadow-gate";
import { CopyApnButton } from "./copy-apn-button";
import { SourcesMethodologyLink } from "./sources-methodology-link";

const BASE_URL = "https://trulot-web.vercel.app";
const NULL_PUBLIC_RECORD = "Not available in public records";

export const dynamic = "force-dynamic";

function absoluteUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

function confidenceLabel(confidence: SourcedFact["confidenceTier"]): string {
  if (confidence === "recorded") return "Recorded fact";
  if (confidence === "mapped") return "Mapped fact";
  return "Conditional";
}

function publicSourceLabel(sourceLabel: string): string {
  const labels: Record<string, string> = {
    "check_parcel_overlays(lat,lng)": "Mapped public planning overlays",
    "TODO — owner type category adapter": "Public ownership records",
    "TODO — recorder sale-date adapter": "County recorder sale records",
    "TODO — sewer adapter": "Public utility records",
    "TODO — program rules adapter": "Program eligibility review",
    "TODO — curated zoning copy table": "Reviewed zoning descriptions",
    "TODO — zoning standards adapter": "Published zoning standards",
    "TODO — zoning adapter": "Mapped public zoning sources",
    "Current parcel ownership field": "Public parcel ownership record",
    "Current parcel utility field": "Public utility record",
    "Current parcel community field": "Public parcel community record",
    "parcel_page_api_v2 nearby development summary": "Nearby public development records",
    "Mapped base zone + overlay lookup": "Mapped zoning and public planning overlays",
    "Overlay lookup + SDA source control": "Mapped planning overlays and SDA verification record",
    "Overlay lookup unavailable + SDA source control": "SDA verification record",
    "Same-zone parcel query + permit records": "Similar parcel and permit records",
  };
  if (labels[sourceLabel]) return labels[sourceLabel];
  if (/TODO|adapter|parcel_page_api_v2|check_parcel_overlays|lookup function/i.test(sourceLabel)) {
    return "Public-record source details";
  }
  return sourceLabel;
}

function programStateLabel(state: ProgramDisplayState): string {
  if (state === "mapped_overlay") return "Mapped overlay";
  if (state === "verification_pending") return "Verification pending";
  if (state === "source_unavailable") return "Source unavailable";
  if (state === "not_evaluated") return "Eligibility not yet evaluated";
  return "Conditional";
}

function programStateClass(state: ProgramDisplayState): string {
  if (state === "mapped_overlay") return "border-sky-200 bg-sky-50 text-sky-900";
  if (state === "verification_pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (state === "source_unavailable") return "border-rose-200 bg-rose-50 text-rose-900";
  if (state === "conditional") return "border-violet-200 bg-violet-50 text-violet-900";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function factDisplay(value: string | null): ReactNode {
  if (!value) {
    return <span className="italic text-slate-400">Not available in public records</span>;
  }
  return <span className="text-slate-900">{value}</span>;
}

function SourceMeta({
  fact,
  context = "this fact",
  stateLabel,
}: {
  fact: SourcedFact<string>;
  context?: string;
  stateLabel?: string | null;
}) {
  const publicLabel = publicSourceLabel(fact.sourceLabel);
  const publicState = stateLabel === undefined ? confidenceLabel(fact.confidenceTier) : stateLabel;
  return (
    <details className="group mt-1 text-xs text-slate-500">
      <summary aria-label={`Source for ${context}`} className="inline-flex min-h-6 cursor-pointer list-none items-center rounded py-1 text-sky-800 underline decoration-slate-300 underline-offset-2 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
        Source
      </summary>
      <div className="mt-1 max-w-xl rounded bg-slate-50 px-2.5 py-2 leading-5 text-slate-600">
        <span className="sr-only">Source: </span><span>{publicLabel}</span>
        {publicState ? <><span aria-hidden="true" className="mx-1.5 text-slate-300">·</span><span>{publicState}</span></> : null}
        <p className="mt-1"><SourcesMethodologyLink className="inline-flex min-h-6 items-center text-sky-800 underline underline-offset-2">Sources</SourcesMethodologyLink></p>
      </div>
    </details>
  );
}

function SectionSource() {
  return <SourcesMethodologyLink className="inline-flex min-h-6 items-center rounded py-1 text-xs text-sky-800 underline decoration-slate-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Sources</SourcesMethodologyLink>;
}

function FactCard({ label, fact }: { label: string; fact: SourcedFact<string> }) {
  return (
    <div className="min-w-0 rounded border border-slate-200 bg-white px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium leading-5 text-slate-900">{factDisplay(fact.value)}</dd>
      <SourceMeta fact={fact} context={label} />
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[18px] font-semibold tracking-tight text-slate-950">
      {children}
    </h2>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{body}</p>
    </div>
  );
}

function SourceUnavailableState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-900">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Public record unavailable
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{body}</p>
    </main>
  );
}

function FaqJsonLd({ faq }: { faq: FaqItem[] }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const apn = extractApnFromSlug(slug);
  if (!apn) {
    return {
      title: "Parcel not found | TruLot",
      description: "Public parcel record not found.",
    };
  }

  const result = await getParcelPageV1Result(apn);
  if (!result.data) {
    if (result.status === "source_unavailable") {
      return {
        title: "Parcel record temporarily unavailable | TruLot",
        description: "Public parcel records are temporarily unavailable.",
      };
    }
    return {
      title: "Parcel not found | TruLot",
      description: "Public parcel record not found.",
    };
  }
  const data = result.data;

  const title = `${data.identity.address}, ${data.identity.city}, ${data.identity.state}${data.identity.zip ? ` ${data.identity.zip}` : ""} — zoning, permits, and public parcel records | TruLot`;
  const description = `Public parcel record for ${data.identity.address}, ${data.identity.city} (APN ${data.identity.apn}): lot size, zoning, mapped overlays, permit activity, nearby precedents, and sources.`;

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl(data.canonicalPath),
    },
  };
}

export default async function ParcelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const apn = extractApnFromSlug(slug);
  if (!apn) notFound();

  const result = await getParcelPageV1Result(apn);
  if (result.status === "invalid_request" || result.status === "not_found") notFound();
  if (result.status === "source_unavailable" || !result.data) {
    return (
      <SourceUnavailableState
        title="This parcel record is temporarily unavailable"
        body={result.sourceStatus.parcel.publicMessage ?? "The current parcel source could not be read, so TruLot is not making a parcel-absence claim for this page right now."}
      />
    );
  }
  const data = result.data;

  if (parcelServingV2ShadowEnabled()) {
    after(() => runParcelServingV2Shadow(slug, result));
  }

  if (slug !== data.canonicalSlug) {
    redirect(data.canonicalPath);
  }

  let standardsShadow: string | null = null;
  if (verifiedStandardsEnabled()) {
    try {
      standardsShadow = await (await import("@/lib/rs17-runtime-shadow")).renderRs17RuntimeShadow(result);
    } catch {
      // A missing local preview dependency must leave the existing page intact.
    }
  }

  const pageTitle = `${data.identity.address}, ${data.identity.city}, ${data.identity.state}${data.identity.zip ? ` ${data.identity.zip}` : ""}`;
  const primaryFacts = data.facts.slice(0, 6).filter(({ fact }) => fact.value);
  const additionalFacts = data.facts.filter(({ fact }, index) => index >= 6 || !fact.value);
  const unavailableFactCount = additionalFacts.filter(({ fact }) => !fact.value).length;
  const placeJsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: pageTitle,
    address: {
      "@type": "PostalAddress",
      streetAddress: data.identity.address,
      addressLocality: data.identity.city,
      addressRegion: data.identity.state,
      postalCode: data.identity.zip ?? undefined,
    },
    identifier: {
      "@type": "PropertyValue",
      name: "APN",
      value: data.identity.apn,
    },
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd) }}
      />
      <FaqJsonLd faq={data.methodology.faq} />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-5">
          <div className="text-base font-semibold text-slate-900">
            Tru<span className="text-sky-800">Lot</span>
          </div>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 md:flex">
            <Link href="/" className="hover:text-slate-900">Search parcels</Link>
            <SourcesMethodologyLink className="inline-flex min-h-6 items-center hover:text-slate-900">Sources &amp; methodology</SourcesMethodologyLink>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[960px] px-5 pb-16 pt-3">
        <nav aria-label="Breadcrumb" className="text-[13px] text-slate-500">
          <Link href="/parcel/san-diego" className="hover:text-slate-800">San Diego parcels</Link>
          <span className="mx-1.5 text-slate-300">›</span>
          {data.identity.communityPlanArea ? (
            <>
              <span>{data.identity.communityPlanArea}</span>
              <span className="mx-1.5 text-slate-300">›</span>
            </>
          ) : null}
          <span>{data.identity.address}</span>
        </nav>

        <details className="mt-3 rounded border border-amber-200 bg-amber-50 text-sm text-amber-950" data-testid="sda-reconciliation-notice">
          <summary className="cursor-pointer rounded px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
            Data status · SDA verification pending{data.identity.stale ? " · stale parcel source" : ""}{data.pageStatus === "partial" ? " · some sources unavailable" : ""}
          </summary>
          <div className="space-y-2 border-t border-amber-200 px-3 py-2.5 leading-6">
            {data.identity.stale ? <p><span className="font-medium">Stale data notice.</span> {data.identity.staleReason ?? "This parcel record is older than the current freshness target."}</p> : null}
            <p><span className="font-medium">SDA source reconciliation pending.</span> SDA status is temporarily unavailable. Other overlay results remain separate.</p>
            {data.pageStatus === "partial" ? <p><span className="font-medium">Some sources are temporarily unavailable.</span> TruLot is showing the parts of the public record that loaded successfully and withholding absence conclusions where a source did not complete.</p> : null}
          </div>
        </details>

        <section className="border-b border-slate-100 py-4" id="identity">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{data.identity.city}, {data.identity.state} parcel</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-950 md:text-[30px]">
              {pageTitle}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1 text-sm text-slate-600">
                <span>APN {data.identity.apn}</span><CopyApnButton apn={data.identity.apn} />
                {data.identity.neighborhood ? <><span aria-hidden="true" className="text-slate-300">·</span><span>{data.identity.neighborhood}</span></> : null}
                {data.identity.communityPlanArea ? <><span aria-hidden="true" className="text-slate-300">·</span><span>{data.identity.communityPlanArea}</span></> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <a href="#zoning" className="rounded bg-sky-800 px-3 py-2 text-sm font-medium text-white hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">See development context</a>
              <Link href="/parcel/san-diego" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Search another parcel</Link>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{data.identity.dataRefreshedAt ? `Parcel view last rebuilt ${data.identity.dataRefreshedAt}` : "Source refresh date unavailable"}</span>
            <span aria-hidden="true" className="text-slate-300">·</span><SectionSource />
            <details className="basis-full text-xs text-slate-500">
              <summary className="w-fit cursor-pointer rounded text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Map context</summary>
              <figure className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"><div>{data.identity.boundaryAvailable ? "Static parcel map is available." : data.identity.mapCaption}</div><figcaption className="mt-1 text-[11px]">{data.identity.mapCaption}</figcaption></figure>
            </details>
          </div>
        </section>

        <section className="border-b border-slate-100 py-4" id="facts">
          <div className="flex items-baseline justify-between gap-3"><SectionHeading id="property-facts">Property facts</SectionHeading><SectionSource /></div>
          <p className="mt-1 text-xs text-slate-500">Values from public records. Source and confidence remain available for each item.</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {primaryFacts.map(({ label, fact }) => <FactCard key={label} label={label} fact={fact} />)}
          </dl>
          {additionalFacts.length > 0 ? (
            <details className="mt-2 rounded border border-slate-200 bg-slate-50 text-sm">
              <summary className="cursor-pointer rounded px-3 py-2 font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                Additional public records · {unavailableFactCount} {unavailableFactCount === 1 ? "field" : "fields"} currently unavailable
              </summary>
              <dl className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
                {additionalFacts.map(({ label, fact }) => <FactCard key={label} label={label} fact={fact} />)}
              </dl>
            </details>
          ) : null}
        </section>

        <section className="border-b border-slate-100 py-4" id="snapshot">
          <div className="flex items-baseline justify-between gap-3"><SectionHeading id="property-snapshot">Property snapshot</SectionHeading><SectionSource /></div>
          <p className="mt-1 text-xs text-slate-500">A plain-English summary assembled from the recorded and mapped facts above.</p>
          {data.snapshot.length > 0 ? (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="space-y-2">
                {data.snapshot.slice(0, 2).map((item, index) => <div key={`${item.value}-${index}`}><p className="text-sm leading-6 text-slate-800">{item.value}</p><SourceMeta fact={item} context="property snapshot" /></div>)}
                {data.snapshot.length > 2 ? <details className="text-sm"><summary className="inline-flex min-h-6 cursor-pointer items-center rounded py-1 font-medium text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">More parcel context</summary><div className="mt-2 space-y-2">{data.snapshot.slice(2).map((item, index) => <div key={`${item.value}-${index}`}><p className="leading-6 text-slate-700">{item.value}</p><SourceMeta fact={item} context="property snapshot" /></div>)}</div></details> : null}
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <EmptyState
                title="Property snapshot unavailable"
                body="The available public records do not contain enough confirmed fields to assemble a property snapshot."
              />
            </div>
          )}
        </section>

        <section className="border-b border-slate-100 py-4" id="zoning">
          <div className="flex items-baseline justify-between gap-3"><SectionHeading id="zoning-overlay-context">Zoning &amp; overlay context</SectionHeading><SectionSource /></div>
          <p className="mt-1 text-sm text-slate-500">Base zoning, mapped overlays, and conditional program statements are kept separate here.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">Base zoning</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{data.zoning.baseCode.value ?? "Not available"}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{data.zoning.plainName.value ?? "Plain-language zone description unavailable."}</p>
              <SourceMeta fact={data.zoning.plainName.value ? data.zoning.plainName : data.zoning.baseCode} context="base zoning" />
            </div>
            <div className="rounded border border-slate-200 bg-white">
              <h3 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Programs &amp; overlays</h3>
              <ul className="divide-y divide-slate-100">
                {data.zoning.programs.map((item) => (
                  <li key={item.name} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(150px,0.45fr)_1fr]">
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <div>
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${programStateClass(item.displayState)}`}>{programStateLabel(item.displayState)}</span>
                      {item.value ? <p className="mt-1 text-slate-600">{item.value}</p> : null}
                      <SourceMeta fact={item} context={item.name} stateLabel={programStateLabel(item.displayState)} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {standardsShadow ? <div data-testid="rs17-runtime-shadow" className="col-span-full rounded border-2 border-amber-400 bg-amber-50 p-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-3 [&_table]:w-full [&_th]:p-2 [&_th]:text-left [&_td]:p-2 [&_td]:align-top [&_summary]:cursor-pointer [&_summary]:py-3 [&_a]:underline [&_code]:break-all [&_details]:border-t [&_details]:border-amber-200"><div dangerouslySetInnerHTML={{ __html: standardsShadow }} /></div> : null}
          </div>
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-3">
            <h3 className="text-sm font-semibold text-slate-900">What this means, cautiously</h3>
            {data.zoning.interpretation[0] ? <p className="mt-1 text-sm leading-6 text-slate-700">{data.zoning.interpretation[0].value}</p> : null}
            <details className="mt-1 text-sm">
              <summary className="w-fit cursor-pointer rounded font-medium text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">How TruLot interprets this</summary>
              <div className="mt-2 space-y-2">
                {data.zoning.interpretation.map((item, index) => <div key={`${item.value}-${index}`}><p className="leading-6 text-slate-700">{item.value}</p><SourceMeta fact={item} context="zoning interpretation" /></div>)}
                <div className="border-t border-sky-200 pt-2">
                  {data.zoning.standards.length > 0 ? <dl className="space-y-1">{data.zoning.standards.map(item => <div key={item.label} className="flex justify-between gap-3"><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p className="text-slate-600"><span className="font-medium">Published standards unavailable.</span> Published standards and code citations are unavailable for this base zone.</p>}
                </div>
              </div>
            </details>
          </div>
        </section>

        <section className="border-b border-slate-100 py-4" id="similar">
          <div className="flex items-baseline justify-between gap-3"><SectionHeading id="similar-lots-precedents">Similar lots &amp; nearby precedents</SectionHeading><SectionSource /></div>
          <p className="mt-1 text-sm text-slate-600">{data.similarLots.matches.length > 0 ? data.similarLots.activityMatchCount > 0 ? `${data.similarLots.activityMatchCount} nearby parcels have recorded development activity. ` : "No matched nearby parcels have recorded development activity in this source. " : ""}<span className="text-slate-500">{data.similarLots.criteriaLabel}</span></p>
          {data.similarLots.matches.length > 0 ? (
            <div className="mt-3">
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-medium">Address</th><th className="px-3 py-2 font-medium">What happened</th><th className="px-3 py-2 font-medium">Permit status</th><th className="px-3 py-2 font-medium">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.similarLots.matches.slice(0, 3).map((match) => (
                      <tr key={match.url} className="border-t border-slate-200">
                        <td className="px-3 py-2 align-top"><Link href={match.url} className="text-sky-800 hover:underline">{match.address}</Link></td>
                        <td className="px-3 py-2 align-top"><div>{match.value}</div><SourceMeta fact={match} context={`similar parcel ${match.address}`} /></td>
                        <td className="px-3 py-2 align-top text-slate-700">{match.permitStatus ?? "—"}{match.permitDate ? ` · ${match.permitDate}` : ""}</td>
                        <td className="px-3 py-2 align-top text-slate-700">{match.distanceMiles !== null ? `${match.distanceMiles.toFixed(1)} mi` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.similarLots.matches.length > 3 ? <details className="mt-2 rounded border border-slate-200"><summary className="cursor-pointer rounded px-3 py-2 text-sm font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">View all {data.similarLots.matches.length}</summary><div className="overflow-x-auto border-t border-slate-200"><table className="w-full border-collapse text-sm"><tbody>{data.similarLots.matches.slice(3).map(match => <tr key={match.url} className="border-t border-slate-100 first:border-t-0"><td className="px-3 py-2"><Link href={match.url} className="text-sky-800 hover:underline">{match.address}</Link></td><td className="px-3 py-2">{match.value}<SourceMeta fact={match} context={`similar parcel ${match.address}`} /></td><td className="px-3 py-2">{match.permitStatus ?? "—"}{match.permitDate ? ` · ${match.permitDate}` : ""}</td><td className="px-3 py-2">{match.distanceMiles !== null ? `${match.distanceMiles.toFixed(1)} mi` : "—"}</td></tr>)}</tbody></table></div></details> : null}
              <details className="mt-2 text-xs text-slate-500"><summary className="inline-flex min-h-6 cursor-pointer items-center rounded py-1 text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Matching and map notes</summary><p className="mt-1">A similar-lot map preview is unavailable. The parcel links use canonical URLs.</p></details>
            </div>
          ) : (
            <div className="mt-2">
              <EmptyState
                title="No nearby precedents found"
                body={data.similarLots.emptyState ?? "No matching nearby parcel precedents were returned for this parcel."}
              />
            </div>
          )}
        </section>

        <section className="border-b border-slate-100 py-4" id="permits">
          <div className="flex flex-wrap items-center gap-2">
            <SectionHeading id="permit-development-activity">Permit &amp; development activity</SectionHeading>
            <span className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Recorded permit data
            </span>
            <span className="ml-auto"><SectionSource /></span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Permit activity from available City records for this parcel, plus its nearby activity summary.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_1fr]">
            <div>
            <h3 className="text-sm font-semibold text-slate-900">This parcel</h3>
            {data.permits.thisParcel.length > 0 ? (
              <div className="mt-2 border-l-2 border-slate-200 pl-4">
                <div className="space-y-3">
                  {data.permits.thisParcel.map((permit, index) => (
                    <div key={`${permit.permitNumber}-${index}`} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-sky-800 bg-white" />
                      <p className="text-xs text-slate-500">{permit.date ?? "Date not available"}</p>
                      <p className="text-sm leading-5 text-slate-800">
                        {permit.value}
                        {permit.permitNumber ? (
                          <>
                            {" "}—{" "}
                            <a href={permit.permitUrl ?? "#"} className="text-sky-800 hover:underline">
                              Permit #{permit.permitNumber}
                            </a>
                          </>
                        ) : null}
                        {permit.status ? ` · ${permit.status}` : ""}
                      </p>
                      <SourceMeta fact={permit} context={permit.permitNumber ? `permit ${permit.permitNumber}` : "permit record"} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <EmptyState
                  title={result.truth.permits.state === "unavailable" ? "Permit history unavailable" : result.truth.permits.state === "partial" ? "Permit history incomplete" : "No linked permits in this source"}
                  body={data.permits.emptyState ?? "No linked permit records were found in the current direct permit-history source."}
                />
              </div>
            )}
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Nearby</h3>
            <div className="mt-2 grid gap-2">
              {data.permits.nearbySummary.map(({ label, fact }) => (
                <div key={label}>
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{label}:</span>{" "}
                    {fact.value ?? NULL_PUBLIC_RECORD}
                  </p>
                  <SourceMeta fact={fact} context={label} />
                </div>
              ))}
            </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 py-4" id="signals">
          <div className="flex items-baseline justify-between gap-3"><SectionHeading id="development-potential-signals">Development potential signals</SectionHeading><SectionSource /></div>
          <p className="mt-1 text-sm text-slate-500">Signals are derived from mapped data or conditional overlay context. They are observations, not a score.</p>
          {data.signals.length > 0 ? (
            <><div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {data.signals.map((signal) => (
                <div key={signal.title} className="rounded border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-900">{signal.title}</p>
                  <p className="text-sm text-slate-700">{signal.value}</p>
                  {signal.detail ? (
                    <p className="mt-1 text-[12px] leading-5 text-slate-500">{signal.detail}</p>
                  ) : null}
                </div>
              ))}
            </div><details className="mt-2 text-xs text-slate-500"><summary className="inline-flex min-h-6 cursor-pointer items-center rounded py-1 text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Sources</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{data.signals.map(signal => <div key={signal.title} className="rounded bg-slate-50 p-2"><span className="font-medium text-slate-700">{signal.title}</span><SourceMeta fact={signal} context={signal.title} /></div>)}</div></details></>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No development signals available"
                body={data.signalsEmptyState ?? "No development signals are available from the current public record fields for this parcel."}
              />
            </div>
          )}
        </section>

        <p className="border-b border-slate-100 py-3 text-xs leading-5 text-slate-500">TruLot summarizes public records and planning data. It is not a substitute for official records, city determinations, or professional advice.</p>

        <section className="bg-slate-50 py-4" id="receipts" itemScope itemType="https://schema.org/Dataset">
          <details className="rounded border border-slate-200 bg-white">
            <summary id="sources-methodology" className="flex cursor-pointer items-center justify-between gap-3 rounded px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
              <span><span id="receipts-methodology" className="block text-[18px] font-semibold tracking-tight text-slate-950">Sources &amp; methodology</span><span className="mt-0.5 block text-xs text-slate-500">{data.sources.length} datasets · receipts, methods, FAQ, and limitations</span></span>
              <span aria-hidden="true" className="text-sky-800">View</span>
            </summary>
          <div className="border-t border-slate-200 px-4 pb-4">
          <h3 className="mt-3 text-base font-semibold text-slate-900">Receipts &amp; methodology</h3>
          <p className="mt-3 text-sm text-slate-500" itemProp="description">Every dataset used on this page, and how TruLot uses it here.</p>
          <div className="mt-3 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-medium">Dataset</th>
                  <th className="px-4 py-3 font-medium">Publisher</th>
                  <th className="px-4 py-3 font-medium">Vintage / refresh</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source.dataset} className="border-t border-slate-200">
                    <td className="px-4 py-3" itemProp="name">{source.dataset}</td>
                    <td className="px-4 py-3">{source.publisher}</td>
                    <td className="px-4 py-3">{source.vintageOrRefresh}</td>
                    <td className="px-4 py-3">
                      {source.url ? (
                        <a href={source.url} className="inline-flex min-h-6 items-center text-sky-800 hover:underline">
                          Source
                        </a>
                      ) : (
                        <span className="text-slate-400">Not linked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2">
            {data.methodology.sections.map((section) => (
              <details key={section.id} className="rounded border border-slate-200 bg-white">
                <summary className="cursor-pointer rounded px-3 py-2 text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                  {section.title}
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  {section.body}
                </div>
              </details>
            ))}
          </div>

          <h3 className="mt-4 text-[15px] font-semibold text-slate-900">Frequently asked questions</h3>
          <div className="mt-2 space-y-2" itemScope itemType="https://schema.org/FAQPage">
            {data.methodology.faq.map((item) => (
              <details key={item.question} className="rounded border border-slate-200 bg-white">
                <summary className="cursor-pointer rounded px-3 py-2 text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                  {item.question}
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
            <strong className="text-slate-900">Disclaimer.</strong>{" "}
            {data.methodology.disclaimer}
          </div>
          </div>
          </details>
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[960px] px-5 py-6 text-[13px] leading-6 text-slate-500">
          TruLot · Public parcel records for San Diego, explained ·{" "}
          <SourcesMethodologyLink className="inline-flex min-h-6 items-center text-sky-800 hover:underline">Sources &amp; methodology</SourcesMethodologyLink> ·{" "}
          <Link href="/parcel/san-diego" className="text-sky-800 hover:underline">Browse parcels</Link>
          <br />
          Canonical: {data.canonicalPath}
        </div>
      </footer>
    </main>
  );
}
