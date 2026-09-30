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

export interface PublicBaseStandard {
  label: string;
  value: string;
  qualifier?: string;
  state: DisplayState;
}

export interface PublicParcelPageV0Model {
  presentationVersion: "public-parcel-page-v0-2026-09-30";
  header: {
    title: string;
    address: string | null;
    apn: string;
    apnDisplay: string;
    jurisdiction: string;
  };
  facts: PublicParcelFact[];
  keyStandards: {
    zoneCode: string;
    explanation: string;
    items: PublicBaseStandard[];
  } | null;
  splitDiagram: {
    title: "Approximate zoning mapping";
    zones: Array<{ code: string; coverage: string }>;
    explanation: string;
  } | null;
  summary: {
    kind: PublicSummaryKind;
    meaning: string;
    materialNotice?: { title: string; detail: string };
  };
  capacityStatement: "Development capacity has not yet been evaluated.";
  primaryAction: {
    label: "See what's needed to evaluate this property";
    explanation: string;
    requiredInputs: string[];
  };
  secondaryAction: {
    label: "View zoning details and sources";
    href: string;
  };
  sourceSummary: Array<{ label: string; detail: string; href: string }>;
  dates: {
    compiled: string;
    parcelSnapshot: "September 24, 2026";
    zoningAndCoastalSnapshots: "September 30, 2026";
    standardsEdition: "September 2026";
  };
  productionSeo: {
    title: string;
    description: string;
    canonicalPath: string;
    structuredData: {
      "@context": "https://schema.org";
      "@type": "WebPage";
      name: string;
      description: string;
      about: {
        "@type": "Place";
        name: string;
        identifier: { "@type": "PropertyValue"; name: "APN"; value: string };
      };
    };
  };
  safeguards: ParcelPageV2UiModel["safeguards"] & {
    generatedFromExistingTruthStates: true;
  };
}

function displayApn(apn: string): string {
  const digits = apn.replace(/\D/g, "");
  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
    : digits;
}

function titleCaseAddress(address: string): string {
  return address.toLowerCase().split(/\s+/).map((word) => {
    if (/^\d+(st|nd|rd|th)$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

function canonicalPath(apn: string, address: string | null): string {
  const addressSlug = (address || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `/parcel/san-diego/${addressSlug ? `${displayApn(apn)}-${addressSlug}` : `apn-${apn}`}`;
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
  const split = model.orientation.zones.length > 1;
  const zones = model.orientation.zones.map((zone) => `${zone.code}${split && zone.coverage ? ` ${zone.coverage}` : ""}`);
  return {
    label: "Zoning",
    value: zones.join(" + ") || model.orientation.zoningLabel,
    detail: zones.length > 1 ? "Mapped from City zoning data; different rules apply to each mapped portion." : "Mapped from City zoning data.",
    state: model.orientation.zoningState,
  };
}

function coastalFact(model: ParcelPageV2UiModel): PublicParcelFact {
  const value = model.orientation.coastalState === "review"
    ? "Boundary review needed"
    : model.orientation.coastalState === "unavailable"
      ? "Currently unavailable"
      : model.orientation.coastalLabel;
  return { label: "Coastal status", value, detail: "Mapped from City Coastal Overlay data.", state: model.orientation.coastalState };
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
      meaning: "This property has two mapped zoning areas. Different rules apply to each portion, and TruLot currently has detailed standards for the RS-1-7 portion only.",
      materialNotice: { title: "Split-zone parcel", detail: "Each zone's rules apply to its mapped portion. Percentages describe mapped land area, not buildable area." },
    };
  }
  if (nonRs) {
    return {
      kind: "non_rs",
      meaning: "Base zoning is recorded. Detailed standards for this zone are not yet available in this TruLot version.",
    };
  }
  if (sourceBackedStandards && model.orientation.zones.some((zone) => zone.code.startsWith("RS-"))) {
    const zone = model.orientation.zones.find((item) => item.code.startsWith("RS-"))?.code || "the mapped RS zone";
    return {
      kind: "verified_residential",
      meaning: `This parcel is mapped ${zone}. TruLot has source-backed base residential standards for this zone. Parcel-specific compliance and development capacity have not yet been evaluated.`,
    };
  }
  return {
    kind: "limited",
    meaning: "TruLot has recorded parcel evidence, but detailed standards are not yet definitive.",
  };
}

function standard(group: ParcelPageV2UiModel["standardsGroups"][number], label: string) {
  return group.standards.find((item) => item.label === label);
}

function compactStandards(model: ParcelPageV2UiModel): PublicParcelPageV0Model["keyStandards"] {
  const group = model.standardsGroups.find((item) => item.zoneCode.startsWith("RS-") && item.standards.length > 0);
  if (!group) return null;
  const item = (label: string, publicLabel: string, qualifier?: string): PublicBaseStandard | null => {
    const found = standard(group, label);
    if (!found) return null;
    return {
      label: publicLabel,
      value: found.value,
      qualifier: qualifier || (found.state === "conditional" ? "Conditions apply; parcel-specific requirement not determined." : "Base zoning rule."),
      state: found.state,
    };
  };
  const interior = standard(group, "Minimum interior-side setback");
  const street = standard(group, "Minimum street-side setback");
  const sides: PublicBaseStandard | null = interior && street ? {
    label: "Side setbacks",
    value: `${interior.value} interior · ${street.value} street side`,
    qualifier: "Conditions apply; lot-line designations are not yet verified.",
    state: interior.state === "conditional" || street.state === "conditional" ? "conditional" : interior.state,
  } : null;
  const items = [
    item("Minimum lot area", "Minimum lot area"),
    item("Minimum front setback", "Front setback"),
    sides,
    item("Minimum rear setback", "Rear setback"),
    item("Maximum structure height", "Height"),
    item("Density basis", "Base density", "Base rule; this is not a development-capacity conclusion."),
    item("Maximum floor-area ratio", "Floor-area ratio"),
  ].filter((value): value is PublicBaseStandard => Boolean(value));
  return {
    zoneCode: group.zoneCode,
    explanation: "These are selected base zoning rules. TruLot has not determined parcel-specific compliance.",
    items,
  };
}

export function adaptPublicParcelPageV0(model: ParcelPageV2UiModel): PublicParcelPageV0Model {
  if (model.safeguards.parcelComplianceEvaluated !== false || model.safeguards.developmentCapacityCalculated !== false || model.safeguards.standardsBlended !== false || model.safeguards.productionRuntimeWired !== false) {
    throw new Error("Public Parcel Page V0 accepts only the sealed non-compliance, non-capacity preview model");
  }
  const area = propertyFact(model, "Approximate parcel geometry area");
  const units = propertyFact(model, "Existing dwelling units");
  const publicSummary = summary(model);
  const normalizedAddress = model.header.address ? titleCaseAddress(model.header.address) : null;
  const title = normalizedAddress || `Parcel ${model.header.apn}`;
  const apnDisplay = displayApn(model.header.apn);
  const zoning = model.orientation.zones.map((zone) => zone.code).join(" + ") || "zoning review needed";
  const seoTitle = `${title}, San Diego · APN ${apnDisplay} · Zoning ${zoning}`;
  const seoDescription = `${title} parcel record: APN ${apnDisplay}, mapped zoning ${zoning}, Coastal context, assessor facts, and source-backed base standards where available.`;
  const seoCanonicalPath = canonicalPath(model.header.apn, normalizedAddress);
  if (!publicSummary.materialNotice && !model.header.address) {
    publicSummary.materialNotice = {
      title: "Street address not available",
      detail: "The APN remains the supported parcel identity for this preview.",
    };
  }
  return {
    presentationVersion: "public-parcel-page-v0-2026-09-30",
    header: {
      title,
      address: normalizedAddress,
      apn: model.header.apn,
      apnDisplay,
      jurisdiction: model.header.jurisdiction,
    },
    facts: [
      zoningFact(model),
      coastalFact(model),
      { label: "Approx. parcel area", value: area?.value || "Not yet verified", detail: "Estimated from parcel geometry; not a legal lot-area determination.", state: area?.state || "unknown" },
      { label: "Existing dwelling units", value: units?.value || "Not yet verified", detail: units?.state === "supported" ? "County assessor reports." : "County assessor value not yet verified.", state: units?.state || "unknown" },
    ],
    keyStandards: compactStandards(model),
    splitDiagram: model.orientation.zones.length > 1 ? {
      title: "Approximate zoning mapping",
      zones: model.orientation.zones.filter((zone) => zone.coverage).map((zone) => ({ code: zone.code, coverage: zone.coverage! })),
      explanation: "Diagram uses mapped area shares for orientation. It is not a surveyed boundary, legal lot-line determination, buildable envelope, or exact development allocation.",
    } : null,
    summary: publicSummary,
    capacityStatement: "Development capacity has not yet been evaluated.",
    primaryAction: {
      label: "See what's needed to evaluate this property",
      explanation: "A parcel-specific evaluation would require the missing property and project evidence below. This disclosure performs no calculation and does not request an evaluation.",
      requiredInputs: model.investigations.slice(0, 3).map((item) => item.title),
    },
    secondaryAction: {
      label: "View zoning details and sources",
      href: `/parcel-v2-preview/${model.header.apn}`,
    },
    sourceSummary: [
      { label: "SanGIS parcel and County assessor records", detail: "Snapshot acquired September 24, 2026", href: "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0" },
      { label: "City of San Diego Base Zoning", detail: "Snapshot acquired September 30, 2026", href: "https://geo.sandag.org/server/rest/services/Hosted/Zoning_Base_SD/FeatureServer/0" },
      { label: "City Coastal Overlay map", detail: "Snapshot acquired September 30, 2026", href: "https://webmaps.sandiego.gov/arcgis/rest/services/DSD/Zoning_Overlay/MapServer/2" },
      { label: "San Diego Municipal Code, residential zones", detail: "September 2026 edition", href: "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf" },
    ],
    dates: {
      compiled: model.asOf,
      parcelSnapshot: "September 24, 2026",
      zoningAndCoastalSnapshots: "September 30, 2026",
      standardsEdition: "September 2026",
    },
    productionSeo: {
      title: seoTitle,
      description: seoDescription,
      canonicalPath: seoCanonicalPath,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: seoTitle,
        description: seoDescription,
        about: {
          "@type": "Place",
          name: title,
          identifier: { "@type": "PropertyValue", name: "APN", value: model.header.apn },
        },
      },
    },
    safeguards: {
      ...model.safeguards,
      generatedFromExistingTruthStates: true,
    },
  };
}
