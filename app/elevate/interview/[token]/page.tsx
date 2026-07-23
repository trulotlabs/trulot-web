import type { Metadata } from "next";
import { isValidElevateToken } from "@/lib/elevate-interview/security";
import { ElevateInterview } from "./ElevateInterview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ROW Revenue Opportunity Interview | Elevate × TruLot",
  description: "A private ROW revenue-opportunity interview prepared for Elevate.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

function AccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1117] px-6 text-[#f4f1e8]">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-sm font-semibold tracking-[0.16em] text-[#d89a52] uppercase">
          <span className="h-px w-8 bg-[#d89a52]" aria-hidden="true" />
          Elevate × TruLot
        </div>
        <p className="mb-3 font-mono text-xs tracking-[0.18em] text-white/45 uppercase">
          Private pilot
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">This link isn’t available.</h1>
        <p className="mt-4 max-w-md leading-7 text-white/60">
          Please use the private interview link provided by TruLot or ask Brian for a fresh link.
        </p>
      </section>
    </main>
  );
}

export default async function ElevateInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isValidElevateToken(token)) {
    return <AccessDenied />;
  }

  return (
    <ElevateInterview
      token={token}
      resultsEmail={process.env.NEXT_PUBLIC_ELEVATE_RESULTS_EMAIL ?? ""}
      showMockLabel={
        process.env.NODE_ENV !== "production" &&
        process.env.ELEVATE_INTERVIEW_MOCK === "true"
      }
    />
  );
}
