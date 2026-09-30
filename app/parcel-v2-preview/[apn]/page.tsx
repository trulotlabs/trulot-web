import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadParcelV2PreviewResult,
  ParcelV2PreviewFixtureError,
  parcelV2PreviewEnabled,
} from "@/lib/parcel-v2-preview";
import { adaptParcelIntelligenceV2 } from "@/scripts/parcel-page-v2-ui/adapter";
import {
  PARCEL_PAGE_V2_CSS,
  renderParcelPageV2Fragment,
} from "@/scripts/parcel-page-v2-ui/renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Parcel V2 review preview | TruLot",
  description: "A bounded, non-production parcel evidence preview.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

function Unavailable({ message, apn }: { message: string; apn?: string }) {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-20 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Non-production V2 preview</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{message}</h1>
        {apn ? <p className="mt-4 text-sm text-slate-600">APN {apn}</p> : null}
        <p className="mt-6 text-sm leading-6 text-slate-600">No legacy parcel result or calculated substitute was used.</p>
      </section>
    </main>
  );
}

export default async function ParcelV2PreviewPage({
  params,
}: {
  params: Promise<{ apn: string }>;
}) {
  if (!parcelV2PreviewEnabled()) notFound();
  const { apn } = await params;

  let outcome:
    | { state: "ready"; html: string }
    | { state: "not_found" }
    | { state: "unavailable" };
  try {
    const fixture = loadParcelV2PreviewResult(apn);
    if (fixture.state === "not_found") {
      outcome = { state: "not_found" };
    } else {
      const model = adaptParcelIntelligenceV2(fixture.result);
      outcome = { state: "ready", html: renderParcelPageV2Fragment(model) };
    }
  } catch (error) {
    if (error instanceof ParcelV2PreviewFixtureError) {
      outcome = { state: "unavailable" };
    } else {
      throw error;
    }
  }

  if (outcome.state === "not_found") {
    return <Unavailable message="Preview data not available for this parcel" apn={apn} />;
  }
  if (outcome.state === "unavailable") {
    return <Unavailable message="Preview data is unavailable" apn={apn} />;
  }
  return (
    <div data-preview-source="sealed-packet-18-fixture">
      <style dangerouslySetInnerHTML={{ __html: PARCEL_PAGE_V2_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: outcome.html }} />
    </div>
  );
}
