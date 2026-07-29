import { expect, test } from "@playwright/test";
import {
  buildOutreachRepairInput,
  deterministicEnrichmentFallback,
  finalizeOutreachCandidate,
  hasExplicitRoutingRequest,
  OUTREACH_FAILURE_MESSAGE,
  resolveOutreachGeneration,
  validateOutreachDraft,
  type OutreachValidationCategory,
} from "../../lib/elevate-review/outreach-reliability";
import { outreachModeForLead } from "../../lib/elevate-review/outreach-style";
import type { PilotLead } from "../../lib/elevate-review/schema";
import { elevatePilotBatchFixture } from "../fixtures/elevate-pilot-batch";

const routingLead = elevatePilotBatchFixture[0];
const generalCompanyLead = elevatePilotBatchFixture[1];
const fictionalWarmLead = elevatePilotBatchFixture[3];

function candidate(
  lead: PilotLead,
  transform?: (body: string) => string,
) {
  const value = deterministicEnrichmentFallback(lead, "2026-07-27");
  return {
    ...value,
    revisedDraftEmailBody: transform
      ? transform(value.revisedDraftEmailBody)
      : value.revisedDraftEmailBody,
  };
}

function rejectedCategories(
  lead: PilotLead,
  transform: (body: string) => string,
) {
  const value = candidate(lead, transform);
  const result = validateOutreachDraft(
    lead,
    value.revisedDraftEmailSubject,
    value.revisedDraftEmailBody,
  );
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.categories;
}

test.describe("server-owned outreach validation", () => {
  test("accepts valid concise and fictional warm drafts in exact ranges", () => {
    for (const lead of [routingLead, fictionalWarmLead]) {
      const finalized = finalizeOutreachCandidate(lead, candidate(lead));
      expect(finalized.ok).toBe(true);
      if (!finalized.ok) continue;

      const words = finalized.result.revisedDraftEmailBody
        .trim()
        .split(/\s+/).length;
      if (outreachModeForLead(lead) === "warm_opportunity") {
        expect(words).toBeGreaterThanOrEqual(105);
        expect(words).toBeLessThanOrEqual(150);
        expect(finalized.result.buyerRouterStatus).toBe(
          "verified_construction_buyer",
        );
      } else {
        expect(words).toBeGreaterThanOrEqual(70);
        expect(words).toBeLessThanOrEqual(105);
        expect(finalized.result.buyerRouterStatus).toBe("routing_contact");
      }
      expect(finalized.result.scopeCertaintySafeguards.length).toBeGreaterThan(
        0,
      );
    }
  });

  test("rejects empty, one-word, and short bodies", () => {
    expect(rejectedCategories(routingLead, () => "")).toContain(
      "body_missing",
    );
    expect(rejectedCategories(routingLead, () => "Hello.")).toContain(
      "body_too_short",
    );
    expect(
      rejectedCategories(
        routingLead,
        () =>
          `Hello. Project: ${routingLead.address}. Has the civil/ROW package been assigned? I can review plans and provide pricing. Please route me to the manager.`,
      ),
    ).toContain("body_too_short");
    const shortSubject = validateOutreachDraft(
      routingLead,
      "ROW",
      candidate(routingLead).revisedDraftEmailBody,
    );
    expect(shortSubject.ok).toBe(false);
    expect(shortSubject.ok ? [] : shortSubject.categories).toContain(
      "subject_too_short",
    );
  });

  test("rejects overlong and truncated bodies", () => {
    expect(
      rejectedCategories(
        routingLead,
        (body) => `${body} ${"Additional construction context ".repeat(25)}.`,
      ),
    ).toContain("body_too_long");
    expect(
      rejectedCategories(routingLead, (body) => body.slice(0, -1)),
    ).toContain("body_fragment_or_truncated");
  });

  test("rejects missing project and scope grounding", () => {
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(routingLead.address, "the project site"),
      ),
    ).toContain("project_reference_missing");
    expect(
      rejectedCategories(routingLead, (body) =>
        body
          .replace(/sidewalk restoration/gi, "site logistics")
          .replace(/traffic control/gi, "schedule coordination"),
      ),
    ).toContain("scope_signals_missing");
  });

  test("rejects missing assignment, plans, or pricing requirements", () => {
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace("Has the civil/ROW package been assigned? ", ""),
      ),
    ).toContain("assignment_question_missing");
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(
          "I can review the plans and provide pricing for the supported work.",
          "I can discuss the drawings and provide pricing for the supported work.",
        ),
      ),
    ).toContain("plans_offer_missing");
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(
          "I can review the plans and provide pricing for the supported work.",
          "I can review the plans and discuss costs for the supported work.",
        ),
      ),
    ).toContain("pricing_offer_missing");
  });

  test("requires routing for broker and general-company drafts", () => {
    for (const lead of [routingLead, generalCompanyLead]) {
      expect(
        rejectedCategories(lead, (body) =>
          body.replace(
            /(?:Would you mind routing|Could you connect|Who is managing)[^?]+\? (?=Thank you)/,
            "Please let me know if there is a convenient time to discuss it. ",
          ),
        ),
      ).toContain("routing_request_missing");
    }
    expect(
      hasExplicitRoutingRequest(
        "Would you mind pointing me in the right direction?",
      ),
    ).toBe(false);
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(
          /(?:Would you mind routing|Could you connect|Who is managing)[^?]+\?/,
          "Would you mind pointing me in the right direction?",
        ),
      ),
    ).toContain("routing_request_missing");
  });

  test("rejects absent certainty safeguards and unsupported certainty", () => {
    expect(
      rejectedCategories(routingLead, (body) =>
        body
          .replace(
            "final scope and award status remain unconfirmed",
            "and the listed scope is included",
          )
          .replace("possible traffic control", "traffic control"),
      ),
    ).toContain("certainty_safeguard_missing");
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(
          "The packet references",
          "Permit records confirm",
        ),
      ),
    ).toContain("unsupported_scope_certainty");
  });

  test("rejects unsupported availability and buyer authority", () => {
    expect(
      rejectedCategories(routingLead, (body) =>
        body.replace(
          "final scope and award status remain unconfirmed",
          "while final scope is unconfirmed and the package remains open",
        ),
      ),
    ).toContain("unsupported_package_availability");
    expect(
      rejectedCategories(
        routingLead,
        (body) =>
          `${body.slice(0, -1)} Your company controls the civil/ROW package.`,
      ),
    ).toContain("unsupported_buyer_authority");

    const promoted = finalizeOutreachCandidate(routingLead, {
      ...candidate(routingLead),
      primaryContact: {
        ...routingLead.primaryContact,
        classification: "project_specific_decision_maker",
      },
    });
    expect(promoted.ok).toBe(false);
    expect(promoted.ok ? [] : promoted.categories).toContain(
      "unsupported_buyer_authority",
    );
  });

  test("rejects signatures and raw schema JSON", () => {
    expect(
      rejectedCategories(
        routingLead,
        (body) =>
          `${body}\n\nThank you,\nCesar Hernandez\nElevate\n\nCesar Hernandez\nElevate`,
      ),
    ).toContain("signature_present");
    expect(
      rejectedCategories(
        routingLead,
        () =>
          '{"revisedDraftEmailBody":"Hello","primaryContact":{"name":"Test"}}',
      ),
    ).toContain("raw_json_present");
  });
});

test.describe("deterministic fallback field normalization", () => {
  test("handles full and sparse contact metadata without using optional narrative fields", () => {
    const sparseLead: PilotLead = {
      ...routingLead,
      leadId: "SPARSE-ROUTING-FIXTURE",
      backupContact: null,
      risksAndCaveats: [],
      primaryContact: {
        ...routingLead.primaryContact,
        name: null,
        caveats: [],
        methods: [],
      },
    };

    for (const lead of [routingLead, sparseLead]) {
      const result = finalizeOutreachCandidate(
        lead,
        deterministicEnrichmentFallback(lead, "2026-07-28"),
      );
      expect(result.ok).toBe(true);
    }
  });

  test("ignores long relationship text and compacts long scope descriptions", () => {
    const longMetadataLead: PilotLead = {
      ...routingLead,
      leadId: "LONG-METADATA-FIXTURE",
      primaryContact: {
        ...routingLead.primaryContact,
        role: "Fictional routing relationship ".repeat(6).trim(),
        caveats: ["Fictional verification narrative ".repeat(12).trim()],
      },
      likelyScopes: [
        "Sidewalk restoration along the fictional frontage with several optional sequencing notes that are not outreach copy",
        "Traffic control coordination around the fictional access point with extended internal planning detail",
      ],
    };
    const draft = deterministicEnrichmentFallback(
      longMetadataLead,
      "2026-07-28",
    );
    const result = finalizeOutreachCandidate(longMetadataLead, draft);
    expect(result.ok).toBe(true);
    expect(draft.revisedDraftEmailBody).not.toContain(
      "Fictional routing relationship",
    );
    expect(draft.revisedDraftEmailBody).not.toContain(
      "Fictional verification narrative",
    );
  });

  test("adds a conservative second category when only one strong scope exists", () => {
    const oneScopeLead: PilotLead = {
      ...routingLead,
      leadId: "ONE-SCOPE-FIXTURE",
      likelyScopes: ["Sidewalk restoration"],
      evidence: routingLead.evidence.filter((item) =>
        /sidewalk|wet tap/i.test(item.claim),
      ),
    };
    const draft = deterministicEnrichmentFallback(
      oneScopeLead,
      "2026-07-28",
    );
    expect(draft.revisedDraftEmailBody).toContain(
      "related frontage or off-site civil work",
    );
    expect(finalizeOutreachCandidate(oneScopeLead, draft).ok).toBe(true);
  });

  test("preserves every required commercial element in a concise fallback", () => {
    const draft = deterministicEnrichmentFallback(routingLead, "2026-07-28");
    const body = draft.revisedDraftEmailBody;
    const result = validateOutreachDraft(
      routingLead,
      draft.revisedDraftEmailSubject,
      body,
    );
    expect(result.ok).toBe(true);
    expect(body).toContain(routingLead.address);
    expect(body).toMatch(/sidewalk restoration/i);
    expect(body).toMatch(/traffic control/i);
    expect(body).toContain("final scope and award status remain unconfirmed");
    expect(body).toContain("Has the civil/ROW package been assigned?");
    expect(body).toMatch(/review the plans/i);
    expect(body).toMatch(/provide pricing/i);
    expect(hasExplicitRoutingRequest(body)).toBe(true);
    expect(body).not.toMatch(/\n\s*cesar\b/i);
    expect(body).not.toMatch(
      /verified construction buyer|confirmed buyer|controls procurement/i,
    );
  });
});

test.describe("one repair attempt and deterministic fallback", () => {
  test("repairs an incomplete response once", async () => {
    const calls: Array<OutreachValidationCategory[] | null> = [];
    const resolution = await resolveOutreachGeneration(
      routingLead,
      async ({ repairCategories }) => {
        calls.push(repairCategories);
        if (calls.length === 1) throw new Error("incomplete");
        return candidate(routingLead);
      },
    );
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.strategy).toBe("repair");
    expect(calls).toEqual([null, ["response_incomplete"]]);
  });

  test("repairs an invalid first draft with category-only instructions", async () => {
    const calls: Array<OutreachValidationCategory[] | null> = [];
    const resolution = await resolveOutreachGeneration(
      routingLead,
      async ({ repairCategories }) => {
        calls.push(repairCategories);
        return calls.length === 1
          ? candidate(routingLead, () => "Hello.")
          : candidate(routingLead);
      },
    );
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.strategy).toBe("repair");
    const instruction = buildOutreachRepairInput(calls[1] ?? []);
    expect(instruction).toContain("body_too_short");
    expect(instruction).not.toContain(routingLead.address);
    expect(instruction).not.toContain(routingLead.primaryContact.company);
  });

  test("uses a validated fallback after two invalid attempts", async () => {
    let calls = 0;
    const resolution = await resolveOutreachGeneration(
      routingLead,
      async () => {
        calls += 1;
        return candidate(routingLead, () => "No.");
      },
    );
    expect(calls).toBe(2);
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.strategy).toBe("fallback");
  });

  test("trims optional fallback capability language once when length is the only defect", async () => {
    const fallbackCalls: boolean[] = [];
    const resolution = await resolveOutreachGeneration(
      routingLead,
      async () => {
        throw new Error("incomplete");
      },
      (lead, options) => {
        fallbackCalls.push(Boolean(options?.trimOptionalCapability));
        const value = deterministicEnrichmentFallback(
          lead,
          "2026-07-28",
          options,
        );
        return options?.trimOptionalCapability
          ? value
          : {
              ...value,
              revisedDraftEmailBody: `${value.revisedDraftEmailBody.slice(0, -1)} Our optional capabilities include ${"extensive site logistics and schedule coordination support ".repeat(5).trim()}.`,
            };
      },
    );
    expect(fallbackCalls).toEqual([false, true]);
    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.strategy).toBe("fallback");
  });

  test("returns five of five valid fictional routing fallbacks repeatedly", async () => {
    const allRouting = elevatePilotBatchFixture.map((lead, index) => ({
      ...lead,
      leadId: `REPEAT-ROUTING-${index + 1}`,
      primaryContact: {
        ...routingLead.primaryContact,
        company: `Fictional Route ${index + 1}`,
      },
      contactClassification: "probable_routing_contact" as const,
      contactConfidence: "medium" as const,
    }));
    for (const lead of allRouting) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const resolution = await resolveOutreachGeneration(lead, async () => {
          throw new Error("incomplete");
        });
        expect(resolution.ok).toBe(true);
        expect(resolution.ok && resolution.strategy).toBe("fallback");
      }
    }
  });

  test("returns explicit non-success when all three stages fail", async () => {
    const resolution = await resolveOutreachGeneration(
      routingLead,
      async () => candidate(routingLead, () => "No."),
      () => candidate(routingLead, () => "Still no."),
    );
    expect(resolution.ok).toBe(false);
    expect(OUTREACH_FAILURE_MESSAGE).toBe(
      "Draft generation failed. Please retry.",
    );
  });

  test("accepts an all-routing batch without requiring a warm lead", () => {
    const allRouting = elevatePilotBatchFixture.map((lead, index) => ({
      ...lead,
      leadId: `ALL-ROUTING-${index + 1}`,
      primaryContact: {
        ...routingLead.primaryContact,
        company: `Fictional Route ${index + 1}`,
      },
      contactClassification: "probable_routing_contact" as const,
      contactConfidence: "medium" as const,
    }));

    for (const lead of allRouting) {
      expect(outreachModeForLead(lead)).toBe("concise_route_check");
      const finalized = finalizeOutreachCandidate(lead, candidate(lead));
      expect(finalized.ok).toBe(true);
      if (finalized.ok) {
        expect(finalized.result.outreachMode).toBe("concise_route_check");
        expect(finalized.result.buyerRouterStatus).toBe("routing_contact");
      }
    }
  });

  test("selects concise mode for a broker", () => {
    expect(outreachModeForLead(routingLead)).toBe("concise_route_check");
  });

  test("selects concise mode for a general inbox", () => {
    expect(outreachModeForLead(generalCompanyLead)).toBe(
      "concise_route_check",
    );
  });

  test("selects concise mode for an owner-side router", () => {
    expect(outreachModeForLead(elevatePilotBatchFixture[2])).toBe(
      "concise_route_check",
    );
  });

  test("selects warm mode only for a qualifying fictional decision-maker", () => {
    expect(outreachModeForLead(fictionalWarmLead)).toBe("warm_opportunity");
    expect(
      outreachModeForLead({
        ...fictionalWarmLead,
        contactConfidence: "medium",
      }),
    ).toBe("concise_route_check");
  });
});
