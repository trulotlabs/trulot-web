import { PrivatePropertyIntelligenceRuntime } from "./private-property-intelligence-runtime.ts";
import type { PrivateAuthorization } from "./private-property-intelligence-runtime.ts";
import { enrichPrivateFeasibilityFromLookup } from "./private-feasibility-enrichment.ts";
import type { PrivateFeasibilityEnrichment } from "./private-feasibility-enrichment.ts";
import type { UserExistingUse } from "./private-feasibility-enrichment.ts";

/** Authenticated, server-only seam between the sealed Packet 100 lookup and private V4. */
export class SanDiegoPrivateFeasibilityRuntime {
  private propertyIntelligence: PrivatePropertyIntelligenceRuntime;

  constructor(propertyIntelligence: PrivatePropertyIntelligenceRuntime) {
    this.propertyIntelligence = propertyIntelligence;
  }

  async evaluate(
    apn: string,
    authorization: PrivateAuthorization,
    previousV4: PrivateFeasibilityEnrichment,
    options: { userExistingUse?: UserExistingUse; includeProjectQuestions?: boolean } = {},
  ): Promise<PrivateFeasibilityEnrichment> {
    const lookup = await this.propertyIntelligence.lookup(apn, authorization);
    return enrichPrivateFeasibilityFromLookup(lookup, previousV4, options);
  }
}
