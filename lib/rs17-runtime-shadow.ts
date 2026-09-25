import type { ParcelPageV1Result } from "./parcel-page-v1";
import { verifiedStandardsMode } from "./rs17-shadow-gate";
import { renderResidentialDisplay } from "./verified-standards-display";
import { resolveCompiledVerifiedStandards } from "./verified-standards-runtime";

const approvedRuntimeContext = {
  evaluation_date: "2026-09-24",
  coastal_context: "outside",
  application_context: "new_application",
  airport_context: "outside_miramar_transition",
  lot_context: "unknown",
} as const;

export async function renderRs17RuntimeShadow(result: ParcelPageV1Result): Promise<string | null> {
  // Defense in depth: callers cannot bypass the gate by importing this module.
  const mode = verifiedStandardsMode();
  if (!mode) return null;
  const parcel = result.truth.parcel;
  if (!result.data || parcel.state !== "supported" || !parcel.value ||
      !result.data.zoning.baseCode.value) return null;
  try {
    // Local/staging previews may use the canonical page's single recorded base
    // code. Production remains denied until a sealed Base Zoning V2 cohort is
    // committed; this adapter never upgrades legacy zoning into production proof.
    const safe = resolveCompiledVerifiedStandards({
      apn: parcel.value.apn.replace(/\D/g, ""),
      zoneCodes: [result.data.zoning.baseCode.value],
      mappingState: "SINGLE_ZONE",
      context: approvedRuntimeContext,
    });
    if (!safe) return null;
    return renderResidentialDisplay(safe);
  } catch {
    // Optional standards must never break or alter the existing page on failure.
    return null;
  }
}
