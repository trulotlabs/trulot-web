import type { DisplayState, ParcelPageV2UiModel } from "../parcel-page-v2-ui/adapter";

export type PublicSummaryKind =
  | "verified_residential"
  | "split_zone"
  | "coastal_review"
  | "ambiguous_zoning"
  | "unmapped_zoning"
  | "non_rs"
  | "source_unavailable"
  | "limited";

export interface PublicParcelFact {
  label: string;
  value: string;
  detail?: string;
  state: DisplayState;
}
export interface PublicParcelPageV0Model {
  presentationVersion: "public-parcel-page-v0-2026-09-30";
  header: {
    title: string;
    address: string | null;
    apn: string;
    jurisdiction: string;
  };
  facts: PublicParcelFact[];
  summary: {
    kind: PublicSummaryKind;
    meaning: string;
    materialNotice?: { title: string; detail: string };
  };
  capacityStatement: "Development capacity has not yet been evaluated.";
  primaryAction: {
    label: "Evaluate development potential";
    explanation: string;
    requiredInputs: string[];
  };
  secondaryAction: {
    label: "View zoning details and sources";
    href: string;
  };
  safeguards: ParcelPageV2UiModel["safeguards"] & {
    generatedFromExistingTruthStates: true;
  };
}

function propertyFact(model: ParcelPageV2UiModel, label: string) {
  return model.propertyFacts.find((fact) => fact.label === label);
}

function zoningFact(model: ParcelPageV2UiModel): PublicParcelFact {
  if (model.orientation.zoningLabel === "Zoning requires review") {
    return {
      label: "Zoning",
      value: "Mapping review needed",
      detail: "Candidate map evidence is not a definitive zoning selection.",
      state: "review",
    };
  }
  if (model.orientation.zoningLabel === "Base zoning not yet mapped") {
    return { label: "Zoning", value: "Not yet mapped", state: "unknown" };
  }
  if (model.orientation.zoningState === "unavailable") {
    return { label: "Zoning", value: "Currently unavailable", state: "unavailable" };
  }
  const zones = model.orientation.zones.map((zone) => `${zone.code}${zone.coverage ? ` ${zone.coverage}` : ""}`);
  return {
    label: "Zoning",
    value: zones.join(" + ") || model.orientation.zoningLabel,
    detail: zones.length > 1 ? "Different rules apply to each mapped portion." : undefined,
    state: model.orientation.zoningState,
  };
}

function coastalFact(model: ParcelPageV2UiModel): PublicParcelFact {
  const value = model.orientation.coastalState === "review"
    ? "Boundary review needed"
    : model.orientation.coastalState === "unavailable"
      ? "Currently unavailable"
      : model.orientation.coastalLabel;
  return { label: "Coastal status", value, state: model.orientation.coastalState };
}

function summary(model: ParcelPageV2UiModel): PublicParcelPageV0Model["summary"] {
  const split = model.orientation.zoningLabel === "Split-zone parcel";
  const nonRs = model.standardsGroups.every((group) => group.state === "not_applicable");
  const sourceBackedStandards = model.standardsGroups.some((group) => group.standards.length > 0);

  if (model.orientation.zoningState === "unavailable") {
    return {
      kind: "source_unavailable",
      meaning: "Parcel identity is available, but the zoning source is currently unavailable.",
      materialNotice: { title: "Zoning source unavailable", detail: "TruLot is not substituting an older zoning result or estimate." },
    };
  }
  if (model.orientation.zoningLabel === "Zoning requires review") {
    return {
      kind: "ambiguous_zoning",
      meaning: "The parcel’s zoning mapping requires review before TruLot can present definitive standards.",
      materialNotice: { title: "Zoning review needed", detail: "The mapped evidence does not support selecting one definitive base zone." },
    };
  }
  if (model.orientation.zoningLabel === "Base zoning not yet mapped") {
    return {
      kind: "unmapped_zoning",
      meaning: "Base zoning has not yet been mapped for this parcel, so definitive standards are not available.",
      materialNotice: { title: "Zoning not yet mapped", detail: "TruLot is keeping the zoning result unresolved instead of estimating it." },
    };
  }
  if (model.orientation.coastalState === "review") {
    return {
      kind: "coastal_review",
      meaning: "Coastal applicability requires review before TruLot can select a definitive standards version.",
      materialNotice: { title: "Coastal boundary review", detail: "The parcel intersects the mapped Coastal boundary, so applicability remains unresolved." },
    };
  }
  if (split) {
    return {
      kind: "split_zone",
      meaning: "This parcel has split zoning. Different rules apply to different portions of the property.",
      materialNotice: { title: "Split-zone parcel", detail: "Each zone percentage applies only to its mapped portion; no primary zone has been selected." },
    };
  }
  if (nonRs) {
    return {
      kind: "non_rs",
      meaning: "Base zoning is recorded. Detailed standards for this zone are not yet available in this TruLot version.",
    };
  }
  if (sourceBackedStandards && model.orientation.zones.some((zone) => zone.code.startsWith("RS-"))) {
    return {
      kind: "verified_residential",
      meaning: "Residential zoning is verified. TruLot has source-backed base standards for this parcel.",
    };
  }
  return {
    kind: "limited",
    meaning: "TruLot has recorded parcel evidence, but detailed standards are not yet definitive.",
  };
}

export function adaptPublicParcelPageV0(model: ParcelPageV2UiModel): PublicParcelPageV0Model {
  if (model.safeguards.parcelComplianceEvaluated !== false || model.safeguards.developmentCapacityCalculated !== false || model.safeguards.standardsBlended !== false || model.safeguards.productionRuntimeWired !== false) {
    throw new Error("Public Parcel Page V0 accepts only the sealed non-compliance, non-capacity preview model");
  }
  const area = propertyFact(model, "Approximate parcel geometry area");
  const units = propertyFact(model, "Existing dwelling units");
  const publicSummary = summary(model);
  if (!publicSummary.materialNotice && !model.header.address) {
    publicSummary.materialNotice = {
      title: "Street address not available",
      detail: "The APN remains the supported parcel identity for this preview.",
    };
  }
  return {
    presentationVersion: "public-parcel-page-v0-2026-09-30",
    header: {
      title: model.header.title,
      address: model.header.address,
      apn: model.header.apn,
      jurisdiction: model.header.jurisdiction,
    },
    facts: [
      zoningFact(model),
      coastalFact(model),
      { label: "Approx. parcel area", value: area?.value || "Not yet verified", state: area?.state || "unknown" },
      { label: "Existing dwelling units", value: units?.value || "Not yet verified", state: units?.state || "unknown" },
    ],
    summary: publicSummary,
    capacityStatement: "Development capacity has not yet been evaluated.",
    primaryAction: {
      label: "Evaluate development potential",
      explanation: "This preview does not run a feasibility calculation. A future evaluation would require the missing parcel and project evidence shown below.",
      requiredInputs: model.investigations.slice(0, 3).map((item) => item.title),
    },
    secondaryAction: {
      label: "View zoning details and sources",
      href: `/parcel-v2-preview/${model.header.apn}`,
    },
    safeguards: {
      ...model.safeguards,
      generatedFromExistingTruthStates: true,
    },
  };
}
