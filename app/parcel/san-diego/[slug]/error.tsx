"use client";

export default function ParcelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[960px] px-5 py-20 text-center text-slate-900">
      <h1 className="text-xl font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong on our end. The public record itself is unaffected — try again shortly, or view this parcel at the{" "}
        <a href="https://arcc.sdcounty.ca.gov" rel="noopener" className="text-[#1f4e6e] hover:underline">
          San Diego County Assessor
        </a>
        .
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Try again
      </button>
    </div>
  );
}
