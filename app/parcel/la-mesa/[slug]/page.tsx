import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLaMesaPublicParcel } from "@/lib/la-mesa-public-parcel-server";
import {
  canonicalParcelPathFor,
  parcelMetadata,
  parcelPlaceJsonLd,
} from "@/lib/parcel-indexing";
import { extractApnFromSlug, formatApnForDisplay } from "@/lib/parcel-slug";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const apn = extractApnFromSlug(slug);
  if (!apn) return { title: "Parcel not found | TruLot", robots: { index: false, follow: true } };
  const result = getLaMesaPublicParcel(apn);
  if (result.state !== "FOUND") {
    return { title: "Parcel not found | TruLot", robots: { index: false, follow: true } };
  }
  return parcelMetadata({ payload: result.payload, jurisdiction: "LA_MESA", state: result.indexState });
}

export default async function LaMesaParcelPage({ params }: RouteProps) {
  const { slug } = await params;
  const apn = extractApnFromSlug(slug);
  if (!apn) notFound();
  const result = getLaMesaPublicParcel(apn);
  if (result.state !== "FOUND") notFound();
  const canonicalPath = canonicalParcelPathFor("LA_MESA", result.payload.apn, result.canonicalAddress);
  if (slug !== canonicalPath.split("/").at(-1)) redirect(canonicalPath);
  const jsonLd = parcelPlaceJsonLd(result.payload);
  const contexts = Array.isArray(result.payload.materialZoningContext) ? result.payload.materialZoningContext : [];
  const overlays = result.payload.overlays ?? [];
  const plans = result.payload.specificPlans ?? [];

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="font-semibold">Tru<span className="text-sky-800">Lot</span></Link>
          <Link href="/la-mesa-adu" className="text-sm text-sky-800 underline">La Mesa ADU guide</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">City of La Mesa parcel</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {result.payload.address ?? `APN ${formatApnForDisplay(result.payload.apn)}`}
        </h1>
        <p className="mt-2 text-sm text-slate-600">APN {formatApnForDisplay(result.payload.apn)}</p>
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This public parcel route is in review and remains excluded from search indexing.
        </div>
        <section className="mt-8" aria-labelledby="zoning-heading">
          <h2 id="zoning-heading" className="text-xl font-semibold">Mapped zoning context</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-slate-200 p-4"><dt className="text-xs uppercase text-slate-500">Base zone</dt><dd className="mt-1 font-medium">{result.payload.baseZoning ?? "Unavailable"}</dd></div>
            <div className="rounded border border-slate-200 p-4"><dt className="text-xs uppercase text-slate-500">Mapping state</dt><dd className="mt-1 font-medium">{result.payload.zoningState ?? "Unavailable"}</dd></div>
          </dl>
          {contexts.length > 1 ? <p className="mt-3 text-sm text-slate-600">This parcel has multiple mapped zoning contexts and requires review.</p> : null}
          {overlays.length ? <p className="mt-3 text-sm text-slate-600">Mapped planning overlays are present. They are context only and do not establish program eligibility.</p> : null}
          {plans.length ? <p className="mt-2 text-sm text-slate-600">An adopted specific-plan context is mapped to this parcel and may require project-specific review.</p> : null}
        </section>
        <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="limits-heading">
          <h2 id="limits-heading" className="text-lg font-semibold">What this page does not decide</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Mapped context does not establish ADU eligibility, legal unit count, permit completion, project compliance, or development capacity.</p>
        </section>
        <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-lg font-semibold">Sources</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {(result.payload.sources ?? []).map((source, index) => <li key={index}>{typeof source === "object" && source && "label" in source ? String(source.label) : "Public source"}</li>)}
          </ul>
        </section>
      </article>
    </main>
  );
}
