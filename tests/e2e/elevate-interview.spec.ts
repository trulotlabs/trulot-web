import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { parsePilotBatchJson } from "../../lib/elevate-review/batch-config";
import { normalizeBatchLabel } from "../../lib/elevate-review/export";
import {
  buildLeadContactGrounding,
  classifyLeadChatIntent,
} from "../../lib/elevate-review/chat-grounding";
import {
  mockChatAnswer,
  mockEnrichment,
} from "../../lib/elevate-review/mock";
import {
  outreachModeForLead,
  outreachModeGuidance,
} from "../../lib/elevate-review/outreach-style";
import {
  buildContactEnrichmentPrompt,
  buildLeadChatPrompt,
} from "../../lib/elevate-review/prompts";
import {
  completedReviewExportSchema,
  enrichmentResultSchema,
  type LeadDecision,
} from "../../lib/elevate-review/schema";
import {
  elevatePilotBatchConfigFixture,
  elevatePilotBatchFixture,
} from "../fixtures/elevate-pilot-batch";

const reviewUrl = "/elevate/interview/elevate-playwright-token";
test.setTimeout(90_000);

const decisionLabels: Record<LeadDecision, string> = {
  call_now: "Call now",
  call_later: "Call later",
  pass: "Pass",
  already_known: "Already known",
};

async function chooseDecision(
  page: Page,
  decision: LeadDecision,
  reasons: string[] = [],
) {
  await page
    .getByRole("radio", { name: decisionLabels[decision], exact: true })
    .check({ force: true });
  for (const reason of reasons) {
    await page
      .getByRole("checkbox", { name: reason, exact: true })
      .check({ force: true });
  }
}

async function saveAndNext(page: Page) {
  await page.getByRole("button", { name: "Save and Next" }).click();
}

async function downloadedText(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("Download path was unavailable.");
  return readFile(path, "utf8");
}

test("grounds contact, lead-origin, and scope questions with the relevant packet section", () => {
  const [brokerLead, generalInboxLead, ownerRouteLead] =
    elevatePilotBatchFixture;
  const cases = [
    ["Is this a broker?", "contact_broker"],
    ["Is this the decision-maker?", "contact_decision_maker"],
    ["Why are we contacting this person?", "contact_relevance"],
    ["Who should I ask for?", "contact_routing"],
    ["Is this phone number verified?", "contact_method_verification"],
    ["What should I say when I call?", "contact_call_opener"],
    ["Why did this project become a lead?", "lead_origin"],
    ["Is the wet tap confirmed?", "scope_certainty"],
    ["What scope is unresolved?", "scope_unresolved"],
  ] as const;
  for (const [question, intent] of cases) {
    expect(classifyLeadChatIntent(question)).toBe(intent);
  }

  const broker = mockChatAnswer(brokerLead, "Is this a broker?");
  expect(broker.answer).toMatch(/^Yes\./);
  expect(broker.answer).toContain("Morgan Lane");
  expect(broker.answer).toContain("Fictional Commercial Realty");
  expect(broker.answer).toContain("broker/contact");
  expect(broker.answer).toContain("Not a verified construction buyer");
  expect(broker.answer).toContain("routing contact");
  expect(broker.answer).toContain("assigned or awarded");
  expect(broker.sourceIndexes).toEqual([]);

  const decisionMaker = mockChatAnswer(
    brokerLead,
    "Is this the decision-maker?",
  );
  expect(decisionMaker.answer).toMatch(/^Morgan Lane is not a verified/i);
  expect(decisionMaker.answer).toContain("routing contact");
  expect(decisionMaker.answer).not.toMatch(/controls procurement/i);

  const relevance = mockChatAnswer(
    brokerLead,
    "Why are we contacting this person?",
  );
  expect(relevance.answer).toMatch(/^We are contacting Morgan Lane because/i);
  expect(relevance.answer).toContain("routing step");

  const routing = mockChatAnswer(brokerLead, "Who should I ask for?");
  expect(routing.answer).toMatch(/^Ask Morgan Lane/i);
  expect(routing.answer).toContain("person managing the ROW/frontage package");

  const verification = mockChatAnswer(
    brokerLead,
    "Is this phone number verified?",
  );
  expect(verification.answer).toMatch(
    /^The packet explicitly labels this method as verified\./,
  );
  expect(verification.answer).not.toMatch(/personal|mobile/i);

  const opener = mockChatAnswer(
    brokerLead,
    "What should I say when I call?",
  );
  expect(opener.answer).toMatch(/^Use a concise routing opener:/);
  expect(opener.answer).toContain("Who is managing the ROW/frontage package");

  const origin = mockChatAnswer(
    brokerLead,
    "Why did this project become a lead?",
  );
  expect(origin.answer).toMatch(/^101 Example Avenue became a lead because/i);
  expect(origin.answer).toContain("permit milestone");
  expect(origin.sourceIndexes).toEqual([0]);

  const wetTap = mockChatAnswer(brokerLead, "Is the wet tap confirmed?");
  expect(wetTap.answer).toMatch(/^No, this scope is not confirmed\./);
  expect(wetTap.answer).toContain("remains unresolved");
  expect(wetTap.sourceIndexes).toEqual([]);

  const unresolved = mockChatAnswer(
    brokerLead,
    "What scope is unresolved?",
  );
  expect(unresolved.answer).toMatch(/^The unresolved scope is:/);
  expect(unresolved.answer).toContain("wet tap");

  for (const question of cases.slice(0, 6).map(([value]) => value)) {
    const response = mockChatAnswer(brokerLead, question);
    expect(response.answer).not.toMatch(
      /became a lead|surfaced because|permit milestone/i,
    );
  }

  const general = buildLeadContactGrounding(generalInboxLead);
  expect(general.contactName).toBe("No named person in packet");
  expect(general.contactType).toBe("general company route");
  expect(general.verifiedBuyerStatus).toContain(
    "Not a verified construction buyer",
  );

  const owner = buildLeadContactGrounding(ownerRouteLead);
  expect(owner.contactName).toBe("Taylor Reed");
  expect(owner.contactType).toBe("owner-side router");
  expect(owner.verifiedBuyerStatus).toContain(
    "Not a verified construction buyer",
  );

  const prompt = buildLeadChatPrompt(brokerLead, "contact_broker");
  expect(prompt).toContain('"contactGrounding"');
  expect(prompt).toContain('"scopeGrounding"');
  expect(prompt).toContain('"verifiedBuyerStatus"');
  expect(prompt).toContain('"fallbackRoute"');
  expect(prompt).toContain("Answer the actual question in the first sentence");
  expect(prompt).toContain(
    "Do not recite projectGrounding or permit evidence",
  );
});

test("applies Cesar's soft outreach profile with route-check and warm modes", () => {
  const bodies = elevatePilotBatchFixture.map((lead) => {
    const result = enrichmentResultSchema.parse(mockEnrichment(lead));
    const mode = outreachModeForLead(lead);
    const guidance = outreachModeGuidance(mode);
    const body = result.revisedDraftEmailBody;
    const wordCount = body.trim().split(/\s+/).length;

    expect(wordCount).toBeGreaterThanOrEqual(guidance.minimumWords);
    expect(wordCount).toBeLessThanOrEqual(guidance.maximumWords);
    expect(body).toMatch(/\bI(?:’m|’d| wanted| work| can)\b/);
    expect(body).toContain("civil/ROW package");
    expect(body).toMatch(/review the plans/i);
    expect(body).toMatch(/provide (?:practical )?pricing/i);
    expect(body).toContain("final scope and award status remain unconfirmed");
    expect(body).not.toMatch(
      /Public City records show|Our intelligence detected|permit monitoring|As an AI|I hope this message finds you well/i,
    );
    expect(body).not.toMatch(
      /\n\s*(?:thank you,?\s*\n)?\s*cesar\b|\n\s*elevate\s*$/i,
    );
    if (mode === "concise_route_check") {
      expect(body).toMatch(/pointing me|routed to|right direction/i);
    }
    return body;
  });

  expect(outreachModeForLead(elevatePilotBatchFixture[0])).toBe(
    "concise_route_check",
  );
  expect(outreachModeForLead(elevatePilotBatchFixture[3])).toBe(
    "warm_opportunity",
  );
  expect(new Set(bodies).size).toBe(bodies.length);
  const openings = bodies.map(
    (body) => body.split("\n\n")[1]?.split(".")[0] ?? "",
  );
  expect(new Set(openings).size).toBeGreaterThanOrEqual(3);

  const routePrompt = buildContactEnrichmentPrompt(
    elevatePilotBatchFixture[0],
  );
  expect(routePrompt).toContain("soft guidance, not a rigid template");
  expect(routePrompt).toContain("Concise route-check email, 70-105 words");
  expect(routePrompt).toContain("hands-on contractor and company president");
  expect(routePrompt).toContain("Accuracy overrides style");

  const warmPrompt = buildContactEnrichmentPrompt(
    elevatePilotBatchFixture[3],
  );
  expect(warmPrompt).toContain("Warm opportunity email, 105-150 words");
});

test("parses structured and legacy batches with neutral naming and stable lead order", () => {
  const configured = parsePilotBatchJson(
    JSON.stringify(elevatePilotBatchConfigFixture),
  );
  expect(configured.ok).toBe(true);
  if (!configured.ok) throw new Error("Expected configured batch.");
  expect(configured.batchId).toBe("batch-2-playwright");
  expect(configured.batchName).toBe("Batch 2 test review");
  expect(configured.leads.map((lead) => lead.leadId)).toEqual(
    elevatePilotBatchFixture.map((lead) => lead.leadId),
  );

  const blankName = parsePilotBatchJson(
    JSON.stringify({ ...elevatePilotBatchConfigFixture, batchName: "   " }),
  );
  expect(blankName.ok && blankName.batchName).toBe("Current batch");

  const missingNameConfig: Record<string, unknown> = {
    ...elevatePilotBatchConfigFixture,
  };
  delete missingNameConfig.batchName;
  const missingName = parsePilotBatchJson(JSON.stringify(missingNameConfig));
  expect(missingName.ok && missingName.batchName).toBe("Current batch");

  const legacy = parsePilotBatchJson(JSON.stringify(elevatePilotBatchFixture));
  const reorderedLegacy = parsePilotBatchJson(
    JSON.stringify([...elevatePilotBatchFixture].reverse()),
  );
  expect(legacy.ok && legacy.batchName).toBe("Current batch");
  expect(reorderedLegacy.ok).toBe(true);
  if (!legacy.ok || !reorderedLegacy.ok) {
    throw new Error("Expected valid legacy batches.");
  }
  expect(legacy.batchId).not.toBe(reorderedLegacy.batchId);

  const duplicateIds = elevatePilotBatchFixture.map((lead, index) => ({
    ...lead,
    leadId: index === 1 ? elevatePilotBatchFixture[0].leadId : lead.leadId,
  }));
  expect(
    parsePilotBatchJson(
      JSON.stringify({
        ...elevatePilotBatchConfigFixture,
        leads: duplicateIds,
      }),
    ).ok,
  ).toBe(false);
  expect(normalizeBatchLabel()).toBe("Current batch");
});

test("invalid token is denied neutrally without calling private APIs", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/elevate/")) {
      privateRequests.push(request.url());
    }
  });

  await page.goto("/elevate/interview/not-the-token");

  await expect(
    page.getByRole("heading", { name: "This link isn’t available." }),
  ).toBeVisible();
  await expect(page.getByText("ROW Opportunity Review")).toHaveCount(0);
  expect(privateRequests).toEqual([]);
});

test("displays the batch name and derives counts for every experiment type", async ({
  page,
}) => {
  await page.goto(reviewUrl);

  await expect(
    page.getByRole("heading", { name: "ROW Opportunity Review" }),
  ).toBeVisible();
  await expect(page.getByTestId("batch-label")).toHaveText(
    "Batch 2 test review",
  );
  await expect(page.getByTestId("batch-id")).toHaveText(
    "Batch ID: batch-2-playwright",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Pilot opportunities" })
      .getByRole("button"),
  ).toHaveCount(5);
  await expect(page.getByText(/TruLot found 5 projects/)).toBeVisible();
  await expect(page.getByText(/0 proprietary discoveries/)).toBeVisible();
  await expect(page.getByText(/2 small non-obvious opportunities/)).toBeVisible();
  await expect(page.getByText(/1 medium opportunity/)).toBeVisible();
  await expect(page.getByText(/1 obvious control/)).toBeVisible();
  await expect(page.getByText(/1 routing experiment/)).toBeVisible();
  await expect(page.getByText("Mock mode")).toBeVisible();
  await expect(page.getByTestId("confidence-summary")).toContainText(
    "High project signal",
  );
  await expect(page.getByTestId("confidence-details")).toBeHidden();

  await page.getByRole("button", { name: /404 Example Avenue/ }).click();
  await expect(page.getByTestId("obvious-control")).toContainText(
    "procurement may already be assigned",
  );

  await page.getByRole("button", { name: /505 Example Avenue/ }).click();
  await expect(page.getByTestId("routing-experiment")).toContainText(
    "contact route is indirect",
  );
  await expect(page.getByTestId("routing-experiment")).toContainText(
    "Do not treat this lead as equally call-ready",
  );
});

test("isolates state by token, batch ID, and ordered lead IDs while preserving legacy records", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith("trulot:elevate-opportunity-review:v2:"),
          ).length,
      ),
    )
    .toBe(1);

  const state = await page.evaluate(async () => {
    const token = "elevate-playwright-token";
    const batchId = "batch-2-playwright";
    const leadIds = [
      "TEST-LEAD-1",
      "TEST-LEAD-2",
      "TEST-LEAD-3",
      "TEST-LEAD-4",
      "TEST-LEAD-5",
    ];
    const keyFor = async (candidateBatchId: string, ids: string[]) => {
      const scope = JSON.stringify({
        token,
        batchId: candidateBatchId,
        leadIds: ids,
      });
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(scope),
      );
      const suffix = Array.from(new Uint8Array(hash).slice(0, 12))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return `trulot:elevate-opportunity-review:v2:${candidateBatchId}:${suffix}`;
    };

    const currentKey = await keyFor(batchId, leadIds);
    const reorderedKey = await keyFor(batchId, [...leadIds].reverse());
    const otherBatchKey = await keyFor("batch-1-playwright", leadIds);
    const currentRaw = localStorage.getItem(currentKey);
    if (!currentRaw) throw new Error("Expected current batch state.");

    const decoy = JSON.parse(currentRaw) as { activeLeadId: string };
    decoy.activeLeadId = "TEST-LEAD-2";
    const decoyRaw = JSON.stringify(decoy);
    localStorage.setItem(reorderedKey, decoyRaw);
    localStorage.setItem(otherBatchKey, decoyRaw);

    const legacyKey = "trulot:elevate-opportunity-review:v1:legacy-batch-1";
    const legacyRaw = JSON.stringify({ preserved: true });
    localStorage.setItem(legacyKey, legacyRaw);

    return {
      currentKey,
      reorderedKey,
      otherBatchKey,
      legacyKey,
      legacyRaw,
    };
  });

  expect(state.currentKey).not.toBe(state.reorderedKey);
  expect(state.currentKey).not.toBe(state.otherBatchKey);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "101 Example Avenue" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      ({ legacyKey }) => localStorage.getItem(legacyKey),
      state,
    ),
  ).toBe(state.legacyRaw);
  expect(
    await page.evaluate(
      ({ reorderedKey }) => localStorage.getItem(reorderedKey),
      state,
    ),
  ).not.toBeNull();
  expect(
    await page.evaluate(
      ({ otherBatchKey }) => localStorage.getItem(otherBatchKey),
      state,
    ),
  ).not.toBeNull();
});

test("orders and discloses confidence accessibly without overflow", async ({
  page,
}) => {
  await page.goto(reviewUrl);

  const orderedSections = await page
    .getByTestId("lead-card")
    .locator("section[data-testid]")
    .evaluateAll((sections) =>
      sections
        .map((section) => section.getAttribute("data-testid"))
        .filter((value): value is string =>
          [
            "why-surfaced",
            "trigger-timing",
            "row-scope",
            "contact-packet",
            "risks-caveats",
            "evidence-sources",
            "confidence-summary",
            "cesar-decision",
          ].includes(value ?? ""),
        ),
    );
  expect(orderedSections).toEqual([
    "why-surfaced",
    "trigger-timing",
    "row-scope",
    "contact-packet",
    "risks-caveats",
    "evidence-sources",
    "confidence-summary",
    "cesar-decision",
  ]);

  const disclosure = page.getByRole("button", { name: "Expand", exact: true });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toHaveAttribute(
    "aria-controls",
    /confidence-details-/,
  );
  await expect(page.getByTestId("confidence-details")).toBeHidden();

  await disclosure.focus();
  await page.keyboard.press("Enter");
  const collapse = page.getByRole("button", { name: "Collapse", exact: true });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");

  const details = page.getByTestId("confidence-details");
  for (const category of [
    "Project",
    "ROW scope",
    "Timing",
    "Contact",
    "Relationship",
    "Routing",
  ]) {
    await expect(details.getByText(category, { exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: /202 Example Avenue/ }).click();
  await expect(
    page.getByRole("button", { name: "Collapse", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Collapse", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Expand", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("confidence-details")).toBeHidden();

  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
});

test("supports multi-select reasons, independent deselection, Other, reconciliation, and resume", async ({
  page,
}) => {
  await page.goto(reviewUrl);

  await chooseDecision(page, "call_now", [
    "Scope looks real",
    "Timing looks right",
    "Other",
  ]);
  await page
    .getByLabel("Other reason explanation")
    .fill("Estimator context is worth confirming.");
  await page
    .getByRole("checkbox", { name: "Scope looks real", exact: true })
    .uncheck({ force: true });

  await expect(
    page.getByRole("checkbox", { name: "Scope looks real", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Timing looks right", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Other reason explanation")).toHaveValue(
    "Estimator context is worth confirming.",
  );

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Timing looks right", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Other reason explanation")).toHaveValue(
    "Estimator context is worth confirming.",
  );

  await page
    .getByRole("radio", { name: "Pass", exact: true })
    .check({ force: true });
  await expect(page.getByRole("status")).toContainText(
    "Previous reasons and decision-specific follow-up details were cleared",
  );
  await expect(
    page.getByRole("checkbox", { name: "Wrong timing", exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Other reason explanation")).toHaveCount(0);

  await page
    .getByRole("checkbox", { name: "Wrong timing", exact: true })
    .check({ force: true });
  await page
    .getByRole("checkbox", { name: "No useful contact", exact: true })
    .check({ force: true });
  await saveAndNext(page);
  await page.reload();
  await page.getByRole("button", { name: /101 Example Avenue/ }).click();
  await expect(
    page.getByRole("checkbox", { name: "Wrong timing", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "No useful contact", exact: true }),
  ).toBeChecked();
});

test("validates, presets, persists, clears, and migrates follow-up dates", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await chooseDecision(page, "call_later", [
    "Follow up on a specified date",
  ]);

  const dateInput = page.getByLabel("Follow-up date", { exact: true });
  const quickDates: Array<[string, number]> = [
    ["Tomorrow", 1],
    ["3 days", 3],
    ["1 week", 7],
    ["2 weeks", 14],
  ];
  for (const [label, days] of quickDates) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const expected = await page.evaluate((offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const pad = (value: number) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }, days);
    await expect(dateInput).toHaveValue(expected);
  }
  await page.getByRole("button", { name: "1 month", exact: true }).click();
  const oneMonth = await page.evaluate(() => {
    const date = new Date();
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  await expect(dateInput).toHaveValue(oneMonth);

  await dateInput.fill("2020-01-01");
  await expect(page.getByText("Choose today or a future date.")).toBeVisible();
  await saveAndNext(page);
  await expect(page.getByText(/Follow-up date:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "101 Example Avenue" }))
    .toBeVisible();

  await page.getByRole("button", { name: "1 week", exact: true }).click();
  const validDate = await dateInput.inputValue();
  await saveAndNext(page);
  await page.reload();
  await page.getByRole("button", { name: /101 Example Avenue/ }).click();
  await expect(
    page.getByLabel("Follow-up date", { exact: true }),
  ).toHaveValue(validDate);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByLabel("Follow-up date", { exact: true }),
  ).toHaveValue("");

  const storage = await page.evaluate(() => Object.entries(localStorage));
  expect(storage).toHaveLength(1);
  await page.evaluate(([key, raw]) => {
    const saved = JSON.parse(raw) as {
      version: number;
      reviews: Record<string, Record<string, unknown>>;
    };
    for (const review of Object.values(saved.reviews)) {
      const reasons = Array.isArray(review.reasons)
        ? (review.reasons as string[])
        : [];
      review.reason = reasons[0] ?? "";
      review.followUpDate =
        typeof review.followUpDate === "string" ? review.followUpDate : "";
      delete review.reasons;
      delete review.otherReason;
      delete review.enrichedOutreachAdopted;
    }
    const first = Object.values(saved.reviews)[0];
    first.decision = "call_later";
    first.reason = "Follow up on a specified date";
    first.followUpDate = "0002-01-01";
    saved.version = 1;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storage[0]);
  await page.reload();
  await expect(
    page.getByRole("checkbox", {
      name: "Follow up on a specified date",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Follow-up date", { exact: true }),
  ).toHaveValue("");
});

test("keeps chat, safe mock enrichment, editable outreach, and outcomes working", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(reviewUrl);
  await chooseDecision(page, "call_now", ["Contact route looks usable"]);
  await expect(page.getByTestId("signature-notice")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Discuss this lead with TruLot" })
    .click();
  await page.getByLabel("Question").fill("Who should I call?");
  await page.getByRole("button", { name: "Ask about this lead" }).click();
  await expect(page.getByTestId("lead-chat")).toContainText(
    "Fictional Commercial Realty",
  );

  await page.getByRole("button", { name: "Find a better contact" }).click();
  await expect(page.getByTestId("enrichment-result")).toBeVisible();
  await page
    .getByRole("button", { name: "Use enriched outreach draft" })
    .click();
  const mockOutreach = await page.getByLabel("Email body").inputValue();
  expect(mockOutreach).not.toMatch(
    /Public City records show|Our intelligence detected/i,
  );
  expect(mockOutreach).toMatch(
    /I wanted to reach out regarding|I’m reaching out about|I’d like to ask about/,
  );
  expect(mockOutreach).toContain("Has the civil/ROW package been assigned?");
  const mockOutreachWords = mockOutreach.trim().split(/\s+/).length;
  expect(mockOutreachWords).toBeGreaterThanOrEqual(70);
  expect(mockOutreachWords).toBeLessThanOrEqual(105);

  await page.getByLabel("Email subject").fill("Edited fictional ROW subject");
  await page.getByLabel("Email body").fill("Edited fictional email body.");
  await page
    .getByLabel("Suggested call opener")
    .fill("Edited fictional call opener.");
  await page.getByRole("button", { name: "Copy subject" }).click();
  await expect(page.getByRole("button", { name: "Subject copied" })).toBeVisible();
  await page.getByRole("button", { name: "Copy email" }).click();
  await expect(page.getByRole("button", { name: "Email copied" })).toBeVisible();
  await page.getByRole("button", { name: "Copy call opener" }).click();
  await expect(page.getByRole("button", { name: "Opener copied" })).toBeVisible();
  await expect(page.getByTestId("outreach-mailto")).toHaveAttribute(
    "href",
    /^mailto:morgan\.lane%40example\.test\?subject=Edited%20fictional%20ROW%20subject/,
  );

  await page.getByRole("button", { name: "Mark contacted" }).click();
  await page.getByLabel("Current outcome").selectOption("row_scope_confirmed");
  await page.getByLabel("Estimated opportunity value").fill("25000");
  await page.getByLabel("Outcome notes").fill("Fictional outcome note.");
  await page.reload();
  await expect(page.getByLabel("Current outcome")).toHaveValue(
    "row_scope_confirmed",
  );
  await expect(page.getByLabel("Email subject")).toHaveValue(
    "Edited fictional ROW subject",
  );
  expect(consoleErrors).toEqual([]);
});

test("validates complete exports and exposes completion actions near the top", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await chooseDecision(page, "call_now", [
    "Scope looks real",
    "Timing looks right",
    "Other",
  ]);
  await page
    .getByLabel("Other reason explanation")
    .fill("Fictional estimator context.");
  await page.getByRole("button", { name: "Find a better contact" }).click();
  await page
    .getByRole("button", { name: "Use enriched outreach draft" })
    .click();
  await page
    .getByLabel("Suggested call opener")
    .fill("Final fictional call opener.");
  await page
    .getByLabel("Email subject")
    .fill("Final fictional email subject");
  await page.getByLabel("Email body").fill("Final fictional email body.");
  await page.getByRole("button", { name: "Mark contacted" }).click();
  await page.getByLabel("Current outcome").selectOption("bid_opportunity");
  await page.getByLabel("Outcome notes").fill("Qualified fictional outcome.");
  await page.getByLabel("Estimated opportunity value").fill("$30,000");
  await page.getByRole("button", { name: "1 week", exact: true }).click();
  const followUpDate = await page
    .getByLabel("Follow-up date", { exact: true })
    .inputValue();
  await saveAndNext(page);

  await chooseDecision(page, "call_later");
  await saveAndNext(page);
  await chooseDecision(page, "pass", ["Wrong scope"]);
  await saveAndNext(page);
  await chooseDecision(page, "already_known", ["Already tracking"]);
  await saveAndNext(page);
  await chooseDecision(page, "call_now", ["Need plans or more information"]);
  await page.getByRole("button", { name: "Save decision" }).click();

  const complete = page.getByTestId("review-complete");
  await expect(complete).toContainText("5 of 5 decisions saved");
  await expect(complete.getByLabel("Call now count")).toHaveText("2");
  await expect(complete.getByLabel("Call later count")).toHaveText("1");
  await expect(complete.getByLabel("Pass count")).toHaveText("1");
  await expect(complete.getByLabel("Already known count")).toHaveText("1");
  await expect(complete.getByRole("button", { name: "Download Markdown" }))
    .toBeVisible();
  await expect(complete.getByRole("button", { name: "Download JSON" }))
    .toBeVisible();
  await expect(
    complete.getByRole("button", { name: "Copy concise summary" }),
  ).toBeVisible();
  await expect(complete.getByRole("button", { name: "Continue editing" }))
    .toBeVisible();

  const markdownDownload = page.waitForEvent("download");
  await complete.getByRole("button", { name: "Download Markdown" }).click();
  const markdownFile = await markdownDownload;
  expect(markdownFile.suggestedFilename()).toBe(
    "elevate-opportunity-review-batch-2-test-review-batch-2-playwright.md",
  );
  const markdown = await downloadedText(markdownFile);
  expect(markdown).toContain(
    "# Elevate ROW Opportunity Review — Batch 2 test review",
  );
  expect(markdown).toContain("Batch ID: batch-2-playwright");
  expect(markdown).toContain(
    "**Reasons:** Scope looks real; Timing looks right; Other",
  );
  expect(markdown).toContain(
    "**Other-reason explanation:** Fictional estimator context.",
  );
  expect(markdown).toContain("**Estimated opportunity value:** $30,000");
  expect(markdown).toMatch(
    /\*\*Follow-up date:\*\* [A-Z][a-z]+ \d{1,2}, \d{4}/,
  );
  expect(markdown).toContain("**Enrichment run:** Yes");
  expect(markdown).toContain("**Enriched outreach adopted:** Yes");
  expect(markdown).toContain("Final fictional call opener.");
  expect(markdown).not.toContain("chatTranscript");

  const jsonDownload = page.waitForEvent("download");
  await complete.getByRole("button", { name: "Download JSON" }).click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toBe(
    "elevate-opportunity-review-batch-2-test-review-batch-2-playwright.json",
  );
  const json = JSON.parse(await downloadedText(jsonFile));
  const validated = completedReviewExportSchema.parse(json);
  expect(validated.batchId).toBe("batch-2-playwright");
  expect(validated.batchName).toBe("Batch 2 test review");
  expect(validated.leads[0].review.reasons).toEqual([
    "Scope looks real",
    "Timing looks right",
    "Other",
  ]);
  expect(validated.leads[0].review.otherReason).toBe(
    "Fictional estimator context.",
  );
  expect(validated.leads[0].review.estimatedOpportunityValue).toBe(30000);
  expect(validated.leads[0].review.followUpDate).toBe(followUpDate);
  expect(validated.leads[0].aiEnrichment.ran).toBe(true);
  expect(validated.leads[0].aiEnrichment.outreachAdopted).toBe(true);
  expect(validated.leads[0].aiEnrichment.sourceUrls.length).toBeGreaterThan(0);
  expect(validated.leads[0].finalOutreach.emailSubject).toBe(
    "Final fictional email subject",
  );
  expect(JSON.stringify(validated)).not.toContain("chatTranscript");

  await complete
    .getByRole("button", { name: "Copy concise summary" })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(
      "Elevate ROW Opportunity Review — Batch 2 test review (batch-2-playwright)",
    );
  await expect(complete.getByRole("button", { name: "Review copied" }))
    .toBeVisible();
  await complete.getByRole("button", { name: "Continue editing" }).click();
  await expect(page.getByTestId("lead-card")).toBeVisible();
});

test("hides an unconfigured results-email action and restarts safely", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect(page.getByText("Results email not configured")).toHaveCount(0);
  await expect(page.getByTestId("email-review-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download Markdown" }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Download JSON" })).toBeVisible();

  await chooseDecision(page, "pass", ["Wrong timing"]);
  await saveAndNext(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await page.getByRole("button", { name: /101 Example Avenue/ }).click();
  await expect(
    page.getByRole("radio", { name: "Pass", exact: true }),
  ).not.toBeChecked();
});

test("has keyboard access, no framework errors, and no horizontal overflow", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(reviewUrl);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Restart" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /101 Example Avenue/ }))
    .toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "101 Example Avenue" }))
    .toBeVisible();

  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
    overlay: Boolean(
      document.querySelector(
        "[data-nextjs-dialog-overlay], [data-nextjs-toast]",
      ),
    ),
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.overlay).toBe(false);
  expect(consoleErrors).toEqual([]);
});
