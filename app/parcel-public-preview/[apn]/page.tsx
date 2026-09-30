import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadParcelV2PreviewResult,
  ParcelV2PreviewFixtureError,
  parcelV2PreviewEnabled,
} from "@/lib/parcel-v2-preview";
import { adaptPublicParcelPageV0 } from "@/scripts/parcel-page-public-v0/adapter";
import {
  PUBLIC_PARCEL_PAGE_V0_CSS,
  renderPublicParcelPageV0Fragment,
} from "@/scripts/parcel-page-public-v0/renderer";
import { adaptParcelIntelligenceV2 } from "@/scripts/parcel-page-v2-ui/adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Public parcel presentation preview | TruLot",
  description: "A simplified, non-production parcel orientation preview.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

function Unavailable({ message, apn }: { message: string; apn?: string }) {
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-20 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Public preview</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{message}</h1>
        {apn ? <p className="mt-4 text-sm text-slate-600">APN {apn}</p> : null}
        <p className="mt-6 text-sm leading-6 text-slate-600">No legacy parcel result or calculated substitute was used.</p>
      </section>
    </main>
  );
}

export default async function ParcelPublicPreviewPage({ params }: { params: Promise<{ apn: string }> }) {
  if (!parcelV2PreviewEnabled()) notFound();
  const { apn } = await params;
  let outcome: { state: "ready"; html: string } | { state: "not_found" } | { state: "unavailable" };
  try {
    const fixture = loadParcelV2PreviewResult(apn);
    if (fixture.state === "not_found") {
      outcome = { state: "not_found" };
    } else {
      const expertModel = adaptParcelIntelligenceV2(fixture.result);
      outcome = { state: "ready", html: renderPublicParcelPageV0Fragment(adaptPublicParcelPageV0(expertModel)) };
    }
  } catch (error) {
    if (error instanceof ParcelV2PreviewFixtureError) outcome = { state: "unavailable" };
    else throw error;
  }
  if (outcome.state === "not_found") return <Unavailable message="Preview data not available for this parcel" apn={apn} />;
  if (outcome.state === "unavailable") return <Unavailable message="Preview data is unavailable" apn={apn} />;
  return (
    <div data-preview-source="sealed-packet-18-fixture" data-presentation="public-v0">
      <style dangerouslySetInnerHTML={{ __html: PUBLIC_PARCEL_PAGE_V0_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: outcome.html }} />
    </div>
  );
}
