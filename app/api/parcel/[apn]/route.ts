import { normalizeApn, getParcelPageData } from "../../../../lib/get-parcel-page-data";
import { publicSdaApiStatus, SDA_RECONCILIATION_LABEL } from "../../../../lib/sda-source-reconciliation";

function unavailableCapacityItem(basis: string) {
  return {
    units: null,
    basis,
    confidence: "unknown" as const,
    source: "Legacy API quarantine",
    note: "Unsupported legacy capacity output removed from the canonical public path pending a reviewed truth engine.",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ apn: string }> }) {
  const { apn: rawApn } = await params;
  const apn = normalizeApn(rawApn);

  const data = await getParcelPageData(rawApn);
  if (!data) {
    return Response.json({ error: "Parcel not found", apn }, { status: 404 });
  }

  const quarantined = {
    ...data,
    constraints: {
      ...data.constraints,
      overlays: {
        ...data.constraints.overlays,
        sda: {
          status: SDA_RECONCILIATION_LABEL,
          confidence: "unknown" as const,
          source: "City of San Diego SDA source",
        },
      },
    },
    source_reconciliation: {
      sda: publicSdaApiStatus(),
    },
    capacity: {
      baseline_units: unavailableCapacityItem(
        "Unavailable in legacy API. Use the canonical Parcel Page route while the reviewed truth engine is being established.",
      ),
      adu_upside_units: unavailableCapacityItem(
        "Unavailable in legacy API. Prior hardcoded ADU capacity outputs were unsupported and are quarantined.",
      ),
    },
    api_status: {
      status: "noncanonical",
      canonical_route: "/parcel/san-diego/[slug]",
      canonical_adapter: "getParcelPageV1Result()",
      deprecated_fields: [
        "capacity.baseline_units",
        "capacity.adu_upside_units",
      ],
      message:
        "This compatibility endpoint remains readable, but unsupported capacity outputs are quarantined until a cited truth engine replaces the legacy heuristics.",
    },
  };

  return Response.json(quarantined, {
    headers: {
      Deprecation: "true",
    },
  });
}
