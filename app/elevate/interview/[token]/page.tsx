import type { Metadata } from "next";
import { isValidElevateToken } from "@/lib/elevate-interview/security";
import { loadPilotBatch } from "@/lib/elevate-review/batch";
import { OpportunityReview } from "./OpportunityReview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ROW Opportunity Review | Elevate × TruLot",
  description: "A private ROW opportunity review prepared for Elevate.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

function PrivateFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1117] px-6 text-[#f4f1e8]">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-sm font-semibold tracking-[0.16em] text-[#d89a52] uppercase">
          <span className="h-px w-8 bg-[#d89a52]" aria-hidden="true" />
          Elevate × TruLot
        </div>
        <p className="mb-3 font-mono text-xs tracking-[0.18em] text-white/45 uppercase">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
        <div className="mt-4 max-w-md leading-7 text-white/60">{children}</div>
      </section>
    </main>
  );
}

function AccessDenied() {
  return (
    <PrivateFrame eyebrow="Private pilot" title="This link isn’t available.">
      <p>Please use the private review link provided by TruLot or ask Brian for a fresh link.</p>
    </PrivateFrame>
  );
}

function BatchUnavailable() {
  return (
    <PrivateFrame eyebrow="Private pilot" title="The review is temporarily unavailable.">
      <p>The private pilot batch could not be loaded. Please contact TruLot.</p>
    </PrivateFrame>
  );
}

export default async function ElevateOpportunityReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidElevateToken(token)) return <AccessDenied />;

  const batch = loadPilotBatch();
  if (!batch.ok) return <BatchUnavailable />;

  return (
    <OpportunityReview
      token={token}
      leads={batch.leads}
      resultsEmail={process.env.ELEVATE_RESULTS_EMAIL ?? ""}
      showMockLabel={
        process.env.NODE_ENV !== "production" &&
        process.env.ELEVATE_INTERVIEW_MOCK === "true"
      }
    />
  );
}
