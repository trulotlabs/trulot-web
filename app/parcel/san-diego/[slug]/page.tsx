import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  getParcelPageV1Result,
  type FaqItem,
  type SourcedFact,
} from "@/lib/parcel-page-v1";
import { extractApnFromSlug } from "@/lib/parcel-slug";

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

function factDisplay(value: string | null): ReactNode {
  if (!value) {
    return <span className="italic text-slate-400">Not available in public records</span>;
  }
  return <span className="text-slate-900">{value}</span>;
}

function SourceMeta({ fact }: { fact: SourcedFact<string> }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
      <span>Source: {fact.sourceLabel}</span>
      <span aria-hidden="true" className="text-slate-300">·</span>
      <span>{confidenceLabel(fact.confidenceTier)}</span>
      {fact.todo ? (
        <>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>TODO: {fact.todo}</span>
        </>
      ) : null}
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[19px] font-semibold tracking-tight text-slate-950">
      {children}
    </h2>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
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

  if (slug !== data.canonicalSlug) {
    redirect(data.canonicalPath);
  }

  const pageTitle = `${data.identity.address}, ${data.identity.city}, ${data.identity.state}${data.identity.zip ? ` ${data.identity.zip}` : ""}`;
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
            <a href="#receipts" className="hover:text-slate-900">Methodology</a>
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

        {data.identity.stale ? (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">Stale data notice.</span>{" "}
            {data.identity.staleReason ?? "This parcel record is older than the current freshness target."}
          </div>
        ) : null}

        {data.pageStatus === "partial" ? (
          <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <span className="font-medium">Some sources are temporarily unavailable.</span>{" "}
            TruLot is showing the parts of the public record that loaded successfully and withholding absence conclusions where a source did not complete.
          </div>
        ) : null}

        <section className="flex flex-col gap-5 border-b border-slate-100 py-6 md:flex-row md:items-start md:justify-between" id="identity">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">
              {pageTitle}
            </h1>
            <p className="mt-2 text-[15px] text-slate-600">
              APN {data.identity.apn}
              {data.identity.neighborhood ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  {data.identity.neighborhood}
                </>
              ) : null}
              {data.identity.communityPlanArea ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  {data.identity.communityPlanArea}
                </>
              ) : null}
            </p>
            <p className="mt-4 text-[13px] text-slate-500">
              {data.identity.dataRefreshedAt
                ? `Data last refreshed ${data.identity.dataRefreshedAt}`
                : "Refresh date not available in the current parcel views"}
              <span className="mx-2 text-slate-300">·</span>
              Sources: <a href="#receipts" className="underline decoration-slate-300 underline-offset-2">see receipts</a>
            </p>
          </div>

          <figure className="h-[180px] w-full shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50 md:w-[260px]">
            <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-slate-500">
              {data.identity.boundaryAvailable
                ? "Static parcel map is available."
                : data.identity.mapCaption}
            </div>
            <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              {data.identity.mapCaption}
            </figcaption>
          </figure>
        </section>

        <section className="border-b border-slate-100 py-7" id="facts">
          <SectionHeading id="property-facts">Property facts</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">
            Values from public records. Source and confidence shown for each item.
          </p>
          <div className="mt-4 overflow-hidden rounded border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {data.facts.map(({ label, fact }) => (
                  <tr key={label} className="border-t border-slate-200 first:border-t-0">
                    <th className="w-[34%] bg-slate-50 px-4 py-3 text-left font-medium text-slate-700">
                      {label}
                    </th>
                    <td className="px-4 py-3 align-top">
                      {factDisplay(fact.value)}
                      <SourceMeta fact={fact} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-b border-slate-100 py-7" id="snapshot">
          <SectionHeading id="property-snapshot">Property snapshot</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">
            A plain-English summary assembled from the recorded and mapped facts above.
          </p>
          {data.snapshot.length > 0 ? (
            <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="space-y-4">
                {data.snapshot.map((item, index) => (
                  <div key={`${item.value}-${index}`}>
                    <p className="text-[15px] leading-7 text-slate-800">{item.value}</p>
                    <SourceMeta fact={item} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="Property snapshot unavailable"
                body="The current parcel views do not expose enough confirmed fields to assemble the snapshot for this parcel yet."
              />
            </div>
          )}
        </section>

        <section className="border-b border-slate-100 py-7" id="zoning">
          <SectionHeading id="zoning-overlay-context">Zoning &amp; overlay context</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">
            Base zoning, mapped overlays, and conditional program statements are kept separate here.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
                Base zoning
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900">
                {data.zoning.baseCode.value ?? "Base zone not available"}
              </h3>
              <div className="mt-3">
                <p className="text-sm text-slate-700">
                  {data.zoning.plainName.value ?? "Plain-language zone description not yet attached to this parcel record."}
                </p>
                <SourceMeta fact={data.zoning.plainName.value ? data.zoning.plainName : data.zoning.baseCode} />
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                {data.zoning.standards.length > 0 ? (
                  <dl className="space-y-2 text-sm">
                    {data.zoning.standards.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-4">
                        <dt className="text-slate-600">{item.label}</dt>
                        <dd className="text-right text-slate-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <EmptyState
                    title="Published standards unavailable"
                    body="Published standards and code citations are not yet attached to the active parcel route for this base zone."
                  />
                )}
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
                Current programs &amp; overlays
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900">
                Program rows
              </h3>
              <ul className="mt-3 space-y-4">
                {data.zoning.programs.map((item) => (
                  <li key={item.name} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm text-slate-800">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.value ?? "Eligibility not yet exposed in the current parcel views."}
                    </p>
                    <SourceMeta fact={item} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-sky-200 bg-sky-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
                What this means, cautiously
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900">
                In plain English
              </h3>
              <div className="mt-3 space-y-4">
                {data.zoning.interpretation.map((item, index) => (
                  <div key={`${item.value}-${index}`}>
                    <p className="text-sm leading-6 text-slate-700">{item.value}</p>
                    <SourceMeta fact={item} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 py-7" id="similar">
          <SectionHeading id="similar-lots-precedents">Similar lots &amp; nearby precedents</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">
            {data.similarLots.criteriaLabel}
          </p>
          {data.similarLots.matches.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="overflow-hidden rounded border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-4 py-3 font-medium">Address</th>
                      <th className="px-4 py-3 font-medium">What happened</th>
                      <th className="px-4 py-3 font-medium">Permit status</th>
                      <th className="px-4 py-3 font-medium">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.similarLots.matches.map((match) => (
                      <tr key={match.url} className="border-t border-slate-200">
                        <td className="px-4 py-3 align-top">
                          <Link href={match.url} className="text-sky-800 hover:underline">
                            {match.address}
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div>{match.value}</div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            Source: {match.sourceLabel} · {confidenceLabel(match.confidenceTier)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {match.permitStatus ?? "—"}
                          {match.permitDate ? ` · ${match.permitDate}` : ""}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {match.distanceMiles !== null ? `${match.distanceMiles.toFixed(1)} mi` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <figure className="overflow-hidden rounded border border-slate-200 bg-slate-50">
                <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm leading-6 text-slate-500">
                  Similar-lot map preview is not yet attached to the current parcel route. Internal links above use the canonical parcel URLs.
                </div>
                <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                  Similar lots are linked using canonical parcel URLs.
                </figcaption>
              </figure>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No nearby precedents found"
                body={data.similarLots.emptyState ?? "No matching nearby parcel precedents were returned for this parcel."}
              />
            </div>
          )}
        </section>

        <section className="border-b border-slate-100 py-7" id="permits">
          <div className="flex flex-wrap items-center gap-2">
            <SectionHeading id="permit-development-activity">Permit &amp; development activity</SectionHeading>
            <span className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Recorded permit data
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Permit activity from the current city permit view for this parcel, plus the nearby activity summary already attached to the parcel record.
          </p>

          <div className="mt-5">
            <h3 className="text-[15px] font-semibold text-slate-900">This parcel</h3>
            {data.permits.thisParcel.length > 0 ? (
              <div className="mt-3 border-l-2 border-slate-200 pl-5">
                <div className="space-y-5">
                  {data.permits.thisParcel.map((permit, index) => (
                    <div key={`${permit.permitNumber}-${index}`} className="relative">
                      <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-sky-800 bg-white" />
                      <p className="text-[13px] text-slate-500">{permit.date ?? "Date not available"}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-800">
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
                      <SourceMeta fact={permit} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title="No permits on record"
                  body={data.permits.emptyState ?? `No permits are on file for this parcel since ${data.permits.earliestDataYear}.`}
                />
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-dashed border-slate-200 pt-5">
            <h3 className="text-[15px] font-semibold text-slate-900">Nearby</h3>
            <div className="mt-3 space-y-3">
              {data.permits.nearbySummary.map(({ label, fact }) => (
                <div key={label}>
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{label}:</span>{" "}
                    {fact.value ?? NULL_PUBLIC_RECORD}
                  </p>
                  <SourceMeta fact={fact} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 py-7" id="signals">
          <SectionHeading id="development-potential-signals">Development potential signals</SectionHeading>
          <p className="mt-1 text-sm text-slate-500">
            Signals are derived from mapped data or conditional overlay context. They are observations, not a score.
          </p>
          {data.signals.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {data.signals.map((signal) => (
                <div key={signal.title} className="max-w-[340px] rounded border border-slate-200 bg-white px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{signal.title}</p>
                  <p className="mt-1 text-sm text-slate-700">{signal.value}</p>
                  {signal.detail ? (
                    <p className="mt-1 text-[12px] leading-5 text-slate-500">{signal.detail}</p>
                  ) : null}
                  <SourceMeta fact={signal} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No development signals available"
                body={data.signalsEmptyState ?? "No development signals are available from the current public record fields for this parcel."}
              />
            </div>
          )}
        </section>

        <section className="bg-slate-50 py-7" id="receipts" itemScope itemType="https://schema.org/Dataset">
          <SectionHeading id="receipts-methodology">Receipts &amp; methodology</SectionHeading>
          <p className="mt-1 text-sm text-slate-500" itemProp="description">
            Every dataset used on this page, and how the current parcel route uses it.
          </p>

          <div className="mt-4 overflow-hidden rounded border border-slate-200 bg-white">
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
                        <a href={source.url} className="text-sky-800 hover:underline">
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

          <div className="mt-5 space-y-3">
            {data.methodology.sections.map((section) => (
              <details key={section.id} className="rounded border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
                  {section.title}
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  {section.body}
                </div>
              </details>
            ))}
          </div>

          <h3 className="mt-6 text-[15px] font-semibold text-slate-900">Frequently asked questions</h3>
          <div className="mt-3 space-y-3" itemScope itemType="https://schema.org/FAQPage">
            {data.methodology.faq.map((item) => (
              <details key={item.question} className="rounded border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
                  {item.question}
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-6 rounded border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
            <strong className="text-slate-900">Disclaimer.</strong>{" "}
            {data.methodology.disclaimer}
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[960px] px-5 py-6 text-[13px] leading-6 text-slate-500">
          TruLot · Public parcel records for San Diego, explained ·{" "}
          <a href="#receipts" className="text-sky-800 hover:underline">Methodology</a> ·{" "}
          <Link href="/parcel/san-diego" className="text-sky-800 hover:underline">Browse parcels</Link>
          <br />
          Canonical: {data.canonicalPath}
        </div>
      </footer>
    </main>
  );
}
