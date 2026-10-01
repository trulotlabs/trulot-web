import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parcelV2PreviewEnabled } from "@/lib/parcel-v2-preview";
import { loadParcelLookupRecords, ParcelLookupFixtureError } from "@/lib/parcel-lookup-v0";
import type { ParcelLookupRecord } from "@/lib/parcel-lookup-contract";
import ParcelLookupPreviewClient from "./ParcelLookupPreviewClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Parcel Lookup preview | TruLot",
  description: "A bounded, non-production San Diego parcel lookup preview.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function ParcelLookupPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ apn?: string | string[] }>;
}) {
  if (!parcelV2PreviewEnabled()) notFound();
  const params = await searchParams;
  const initialApn = typeof params.apn === "string" ? params.apn : null;
  let records: ParcelLookupRecord[];
  try {
    records = loadParcelLookupRecords();
  } catch (error) {
    if (!(error instanceof ParcelLookupFixtureError)) throw error;
    return (
      <main className="min-h-screen bg-stone-100 px-5 py-20 text-slate-950">
        <section className="mx-auto max-w-2xl rounded-2xl border border-stone-300 bg-white p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Parcel Lookup preview</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Lookup source unavailable</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">The sealed local parcel source could not be verified. No fallback or production service was used.</p>
        </section>
      </main>
    );
  }
  return <ParcelLookupPreviewClient records={records} initialApn={initialApn} />;
}
