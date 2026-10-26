import type {
  PublicMappedContextInput,
  PublicMeasurementInput,
} from "./public-parcel-feasibility";
import publicParcelEvidence from "@/data/parcel-page-feasibility-v0/public-parcel-evidence.json";

export interface LocalPublicParcelFeasibilityEvidence {
  coastalContext: "OUTSIDE_COASTAL" | "INSIDE_COASTAL" | "UNKNOWN";
  measurements: Partial<
    Record<"LOT_WIDTH" | "LOT_DEPTH" | "STREET_FRONTAGE", PublicMeasurementInput>
  >;
  fire?: PublicMappedContextInput;
}

/**
 * Reviewed public parcel-condition evidence, separate from rule requirements.
 * This sanitized runtime registry was derived from the authoritative local
 * evidence artifacts. It contains no V4 benchmark/replay or private evidence.
 */
const LOCAL_PUBLIC_EVIDENCE: Readonly<Record<string, LocalPublicParcelFeasibilityEvidence>> =
  Object.fromEntries(
    publicParcelEvidence.parcels.map((parcel) => {
      const source = parcel.measurement_source;
      const measurement = (
        value: number | null,
        label: string,
      ): PublicMeasurementInput | undefined =>
        value === null || source === null
          ? undefined
          : {
              value,
              unit: "ft",
              sourceLabel: `${source.label} · ${label}`,
              sourceDate: source.date,
              sourceUrl: source.url,
              availability: "AVAILABLE",
            };
      return [
        parcel.apn,
        {
          coastalContext: parcel.coastal_context as LocalPublicParcelFeasibilityEvidence["coastalContext"],
          measurements: {
            LOT_WIDTH: measurement(parcel.measurements.lot_width_ft, "legal-lot width"),
            LOT_DEPTH: measurement(parcel.measurements.lot_depth_ft, "Code-defined lot depth"),
            STREET_FRONTAGE: measurement(parcel.measurements.street_frontage_ft, "street frontage"),
          },
          fire: parcel.fire
            ? {
                mapped: parcel.fire.mapped,
                verification: parcel.fire.verification as PublicMappedContextInput["verification"],
                sourceLabel: parcel.fire.label,
                sourceDate: parcel.fire.date,
                sourceUrl: parcel.fire.url,
              }
            : undefined,
        },
      ];
    }),
  );

export function getLocalPublicParcelFeasibilityEvidence(
  apn: string,
): LocalPublicParcelFeasibilityEvidence | null {
  return LOCAL_PUBLIC_EVIDENCE[apn] ?? null;
}
