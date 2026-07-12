import { notFound, redirect } from "next/navigation";
import { getParcelPageV1Result } from "@/lib/parcel-page-v1";

export const dynamic = "force-dynamic";

export default async function LegacyParcelRedirect({
  params,
}: {
  params: Promise<{ apn: string }>;
}) {
  const { apn } = await params;
  const result = await getParcelPageV1Result(apn);
  if (result.status === "invalid_request" || result.status === "not_found" || !result.data) {
    if (result.status === "source_unavailable") {
      return (
        <main className="mx-auto max-w-3xl px-6 py-16 text-slate-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Public record unavailable
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            This parcel record is temporarily unavailable
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
            {result.sourceStatus.parcel.publicMessage ?? "The current parcel source could not be read, so TruLot is not making a parcel-absence claim for this page right now."}
          </p>
        </main>
      );
    }
    notFound();
  }
  redirect(result.data.canonicalPath);
}
