import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { laMesaAduPreviewEnabled } from "@/lib/la-mesa-adu-front-door";
import { buildLaMesaFrontDoorDataset } from "@/lib/la-mesa-adu-front-door-server";
import LaMesaAduClient from "./LaMesaAduClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "La Mesa ADU options — private preview",
  description: "A bounded local preview of La Mesa parcel and ADU context powered by TruLot.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
};

export default function LaMesaAduPage() {
  if (!laMesaAduPreviewEnabled()) notFound();
  const dataset = buildLaMesaFrontDoorDataset();
  return <LaMesaAduClient dataset={dataset} />;
}
