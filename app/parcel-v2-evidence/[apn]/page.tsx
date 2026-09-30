import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadParcelV2PreviewResult,
  ParcelV2PreviewFixtureError,
  parcelV2PreviewEnabled,
} from "@/lib/parcel-v2-preview";
import { adaptParcelIntelligenceV2 } from "@/scripts/parcel-page-v2-ui/adapter";
import {
  PARCEL_TECHNICAL_EVIDENCE_CSS,
  renderParcelTechnicalEvidenceFragment,
} from "@/scripts/parcel-page-v2-ui/technical-renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Parcel technical evidence preview | TruLot",
  description: "A bounded, non-production parcel provenance preview.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

function Unavailable({ message, apn }: { message: string; apn?: string }) {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-20 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Technical evidence preview</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{message}</h1>
        {apn ? <p className="mt-4 text-sm text-slate-600">APN {apn}</p> : null}
        <p className="mt-6 text-sm leading-6 text-slate-600">No legacy result, calculated substitute, or production data access was used.</p>
      </section>
    </main>
  );
}

export default async function ParcelV2EvidencePage({ params }: { params: Promise<{ apn: string }> }) {
  if (!parcelV2PreviewEnabled()) notFound();
  const { apn } = await params;
  let outcome: { state: "ready"; html: string } | { state: "not_found" } | { state: "unavailable" };
  try {
    const fixture = loadParcelV2PreviewResult(apn);
    if (fixture.state === "not_found") outcome = { state: "not_found" };
    else outcome = { state: "ready", html: renderParcelTechnicalEvidenceFragment(adaptParcelIntelligenceV2(fixture.result)) };
  } catch (error) {
    if (error instanceof ParcelV2PreviewFixtureError) outcome = { state: "unavailable" };
    else throw error;
  }
  if (outcome.state === "not_found") return <Unavailable message="Technical evidence is not available for this parcel" apn={apn} />;
  if (outcome.state === "unavailable") return <Unavailable message="Technical evidence is unavailable" apn={apn} />;
  return (
    <div data-preview-source="sealed-packet-18-fixture" data-presentation="technical-evidence">
      <style dangerouslySetInnerHTML={{ __html: PARCEL_TECHNICAL_EVIDENCE_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: outcome.html }} />
    </div>
  );
}
