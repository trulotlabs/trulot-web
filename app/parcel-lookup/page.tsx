import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ParcelLookupPreviewClient from "@/app/parcel-lookup-preview/ParcelLookupPreviewClient";
import { parcelLookupProductionEnabled } from "@/lib/parcel-lookup-production-v0";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Parcel Lookup | TruLot",
  description: "Private, bounded parcel identity lookup.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function ParcelLookupPage() {
  if (!parcelLookupProductionEnabled()) notFound();
  return (
    <ParcelLookupPreviewClient
      records={[]}
      initialApn={null}
      failureInjection={null}
      syntheticFixture={null}
      dataSource="bounded-production-api"
    />
  );
}
