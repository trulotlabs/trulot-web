import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FeasibilityPreviewError,
  feasibilityPreviewEnabled,
  loadFeasibilityPreview,
  normalizePreviewMode,
} from "@/lib/bounded-feasibility-preview";
import FeasibilityPreview from "./FeasibilityPreview";
import styles from "./feasibility-preview.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Bounded feasibility preview | TruLot",
  description: "A local development preview of deterministic bounded parcel-feasibility results.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
};

function PreviewContractError() {
  return (
    <main className={styles.errorShell} data-preview-error="contract-rejected">
      <section>
        <p>Development preview</p>
        <h1>Preview contract rejected</h1>
        <p>The local contract evidence did not pass its containment checks. No fallback data or production service was used.</p>
      </section>
    </main>
  );
}

export default async function FeasibilityPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  if (!feasibilityPreviewEnabled()) notFound();
  const mode = normalizePreviewMode((await searchParams).view);
  let preview;
  try {
    preview = loadFeasibilityPreview(mode);
  } catch (error) {
    if (!(error instanceof FeasibilityPreviewError)) throw error;
    return <PreviewContractError />;
  }
  return <FeasibilityPreview selectedView={mode} payload={preview.payload} renderer={preview.renderer} />;
}
