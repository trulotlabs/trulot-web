import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { parsePilotBatchJson } from "../../lib/elevate-review/batch-config";
import {
  buildMailtoHref,
  findVerifiedEmailRoute,
  isLegacyCallDecision,
} from "../../lib/elevate-review/email-action";
import { normalizeBatchLabel } from "../../lib/elevate-review/export";
import {
  buildLeadContactGrounding,
  buildPhoneVerificationAnswer,
  classifyLeadChatIntent,
  normalizePhoneVerification,
} from "../../lib/elevate-review/chat-grounding";
import { mockChatAnswer, mockEnrichment } from "../../lib/elevate-review/mock";
import {
  outreachModeForLead,
  outreachModeGuidance,
} from "../../lib/elevate-review/outreach-style";
import {
  buildContactEnrichmentPrompt,
  buildLeadChatPrompt,
} from "../../lib/elevate-review/prompts";
import {
  validateOutreachDraft,
} from "../../lib/elevate-review/outreach-reliability";
import {
  completedReviewExportSchema,
  enrichmentResultSchema,
  savedReviewSchema,
} from "../../lib/elevate-review/schema";
import {
  elevatePilotBatchConfigFixture,
  elevatePilotBatchFixture,
} from "../fixtures/elevate-pilot-batch";

const reviewUrl = "/elevate/interview/elevate-playwright-token";
test.setTimeout(90_000);

declare global {
  interface Window {
    __capturedMailtos?: string[];
  }
}

async function captureMailtos(page: Page) {
  await page.addInitScript(() => {
    window.__capturedMailtos = [];
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        const anchor =
          target instanceof Element ? target.closest("a") : null;
        if (anchor?.href.startsWith("mailto:")) {
          event.preventDefault();
          window.__capturedMailtos?.push(anchor.href);
        }
      },
      true,
    );
  });
}

async function capturedMailtos(page: Page) {
  return page.evaluate(() => window.__capturedMailtos ?? []);
}

async function openEmailDraft(page: Page) {
  await page.getByRole("button", { name: "Email now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark email sent & next", exact: true }),
  ).toBeVisible();
}

async function downloadedText(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("Download path was unavailable.");
  return readFile(path, "utf8");
}

test("grounds contact questions separately from lead-origin questions", () => {
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
  ] as const;
  for (const [question, intent] of cases) {
    expect(classifyLeadChatIntent(question)).toBe(intent);
  }
  const broker = mockChatAnswer(brokerLead, "Is this a broker?");
  expect(broker.answer).toMatch(/^Yes\./);
  expect(broker.answer).toContain("Not a verified construction buyer");
  expect(broker.sourceIndexes).toEqual([]);
  const origin = mockChatAnswer(
    brokerLead,
    "Why did this project become a lead?",
  );
  expect(origin.answer).toContain("permit milestone");
  expect(origin.sourceIndexes).toEqual([0]);
  expect(buildLeadContactGrounding(generalInboxLead).contactType).toBe(
    "general company route",
  );
  expect(buildLeadContactGrounding(ownerRouteLead).contactType).toBe(
    "owner-side router",
  );
  const prompt = buildLeadChatPrompt(brokerLead, "contact_broker");
  expect(prompt).toContain('"contactGrounding"');
  expect(prompt).toContain("Answer the actual question in the first sentence");
});

test("preserves exact phone verification language", () => {
  expect(normalizePhoneVerification("Verified company main line")).toBe(
    "verified_company_main_line",
  );
  expect(
    buildPhoneVerificationAnswer(elevatePilotBatchFixture[0]).answer,
  ).toMatch(/^Yes\. Verified company main line, not a direct line\./);
  expect(
    buildPhoneVerificationAnswer(elevatePilotBatchFixture[4]).answer,
  ).toMatch(/^No\. Unverified\./);
});

test("keeps Cesar route-check and fictional warm generation valid", () => {
  for (const lead of elevatePilotBatchFixture) {
    const result = enrichmentResultSchema.parse(mockEnrichment(lead));
    const guidance = outreachModeGuidance(outreachModeForLead(lead));
    const validation = validateOutreachDraft(
      lead,
      result.revisedDraftEmailSubject,
      result.revisedDraftEmailBody,
    );
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.wordCount).toBeGreaterThanOrEqual(
        guidance.minimumWords,
      );
      expect(validation.wordCount).toBeLessThanOrEqual(
        guidance.maximumWords,
      );
      expect(validation.body).not.toMatch(/\n\s*cesar\b/i);
    }
  }
  expect(outreachModeForLead(elevatePilotBatchFixture[3])).toBe(
    "warm_opportunity",
  );
  expect(
    buildContactEnrichmentPrompt(elevatePilotBatchFixture[0]),
  ).toContain("Concise route-check email, 70-105 words");
});

test("selects only verified email routes and never pattern-derived addresses", () => {
  const direct = findVerifiedEmailRoute(elevatePilotBatchFixture[0]);
  expect(direct?.address).toBe("morgan.lane@example.test");
  expect(direct?.routeType).toBe("direct");
  const general = findVerifiedEmailRoute(elevatePilotBatchFixture[1]);
  expect(general?.routeType).toBe("general");
  const fallback = findVerifiedEmailRoute(elevatePilotBatchFixture[2]);
  expect(fallback?.address).toBe("precon-three@example.test");
  expect(findVerifiedEmailRoute(elevatePilotBatchFixture[4])).toBeNull();

  const unsafe = structuredClone(elevatePilotBatchFixture[0]);
  unsafe.primaryContact.methods = [
    {
      type: "email",
      label: "Pattern inferred email",
      value: "guessed@example.test",
    },
  ];
  unsafe.backupContact = null;
  expect(findVerifiedEmailRoute(unsafe)).toBeNull();
});

test("encodes recipient, subject, and body in a standard mailto", () => {
  const href = buildMailtoHref(
    "route@example.test",
    "ROW & frontage",
    "Hello,\n\nI’d like to review the plans.",
  );
  expect(href).toBe(
    "mailto:route%40example.test?subject=ROW%20%26%20frontage&body=Hello%2C%0A%0AI%E2%80%99d%20like%20to%20review%20the%20plans.",
  );
});

test("migrates v2 storage and preserves call decisions without calling them email", () => {
  const base = {
    ...mockSavedLead(),
    decision: "call_now" as const,
    saved: true,
  };
  const parsed = savedReviewSchema.parse({
    version: 2,
    activeLeadId: "TEST-LEAD-1",
    reviews: { "TEST-LEAD-1": base },
    updatedAt: "2026-07-28T12:00:00.000Z",
  });
  expect(parsed.version).toBe(3);
  expect(parsed.reviews["TEST-LEAD-1"].decision).toBe("call_now");
  expect(parsed.reviews["TEST-LEAD-1"].emailSentConfirmedAt).toBeNull();
  expect(isLegacyCallDecision(parsed.reviews["TEST-LEAD-1"].decision)).toBe(
    true,
  );
});

test("parses structured and legacy batches with stable identity", () => {
  const configured = parsePilotBatchJson(
    JSON.stringify(elevatePilotBatchConfigFixture),
  );
  expect(configured.ok).toBe(true);
  if (!configured.ok) return;
  expect(configured.batchId).toBe("batch-2-playwright");
  expect(configured.leads.map((lead) => lead.leadId)).toEqual(
    elevatePilotBatchFixture.map((lead) => lead.leadId),
  );
  const legacy = parsePilotBatchJson(JSON.stringify(elevatePilotBatchFixture));
  expect(legacy.ok).toBe(true);
  expect(normalizeBatchLabel()).toBe("Current batch");
});

test("denies an invalid token without calling private APIs", async ({ page }) => {
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
  expect(privateRequests).toEqual([]);
});

test("renders the fast queue in the required information order", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  const ids = await page
    .getByTestId("lead-card")
    .locator("section[data-testid]")
    .evaluateAll((sections) =>
      sections.map((section) => section.getAttribute("data-testid")),
    );
  expect(ids.slice(0, 4)).toEqual([
    "opportunity-summary",
    "scope-certainty",
    "contact-route",
    "email-actions",
  ]);
  await expect(
    page.getByRole("heading", { name: "What do you want to do?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email now", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pass", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Already know this project",
      exact: true,
    }),
  ).toBeVisible();
});

test("removes call-era controls and the inline outreach editor", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  for (const removed of [
    "Call now",
    "Call later",
    "Save and Next",
    "Copy email",
    "Copy call opener",
    "Open email client",
    "Find a better contact",
  ]) {
    await expect(
      page.getByRole("button", { name: removed, exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.getByLabel("Email body")).toHaveCount(0);
  await expect(page.getByLabel("Email subject")).toHaveCount(0);
});

test("keeps secondary evidence, notes, history, and chat collapsed", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect(page.getByTestId("secondary-evidence")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByLabel("Optional lead note")).toBeHidden();
  await expect(page.getByTestId("review-history")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByTestId("lead-chat")).toHaveCount(0);
});

test("labels direct, general, and fallback verified routes", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect(page.getByTestId("contact-route")).toContainText(
    "Verified direct route",
  );
  await page.getByRole("button", { name: /202 Example Avenue/ }).click();
  await expect(page.getByTestId("contact-route")).toContainText(
    "Verified general route",
  );
  await page.getByRole("button", { name: /303 Example Avenue/ }).click();
  await expect(page.getByTestId("contact-route")).toContainText(
    "precon-three@example.test",
  );
});

test("never represents routing contacts as verified buyers", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect(page.getByTestId("contact-route")).toContainText(
    "Routing contact — not a verified buyer",
  );
  await page.getByRole("button", { name: /202 Example Avenue/ }).click();
  await expect(page.getByTestId("contact-route")).toContainText(
    "General company route",
  );
});

test("disables Email now when no verified email route exists", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: /505 Example Avenue/ }).click();
  await expect(
    page.getByRole("button", { name: "Email now", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("email-route-limitation")).toContainText(
    "no usable verified email route",
  );
});

test("prepares a validated draft before opening one mailto", async ({
  page,
}) => {
  await captureMailtos(page);
  const enrichRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/elevate/enrich")) {
      enrichRequests.push(request.url());
    }
  });
  await page.goto(reviewUrl);
  await openEmailDraft(page);
  expect(enrichRequests).toHaveLength(1);
  const mailtos = await capturedMailtos(page);
  expect(mailtos).toHaveLength(1);
  const decoded = decodeURIComponent(mailtos[0]);
  expect(decoded).toContain("mailto:morgan.lane@example.test");
  expect(decoded).toContain("subject=");
  expect(decoded).toContain("body=");
  expect(decoded).toContain("civil/ROW package");
  expect(decoded).not.toMatch(/\n\s*cesar\b/i);
});

test("shows Preparing email and prevents duplicate opens", async ({ page }) => {
  await captureMailtos(page);
  let requests = 0;
  await page.route("**/api/elevate/enrich", async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto(reviewUrl);
  const emailNow = page.getByRole("button", { name: "Email now", exact: true });
  await emailNow.dblclick({ delay: 10 });
  await expect(
    page.getByRole("button", { name: "Preparing email…", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark email sent & next", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(await capturedMailtos(page)).toHaveLength(1);
});

test("does not mark an opened draft as sent", async ({ page }) => {
  await captureMailtos(page);
  await page.goto(reviewUrl);
  await openEmailDraft(page);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  const state = await readCurrentStorage(page);
  expect(state.reviews["TEST-LEAD-1"].saved).toBe(false);
  expect(state.reviews["TEST-LEAD-1"].contacted).toBe(false);
  expect(state.reviews["TEST-LEAD-1"].emailDraftOpenedAt).toBeTruthy();
  expect(state.reviews["TEST-LEAD-1"].emailSentConfirmedAt).toBeNull();
});

test("marks email sent only after confirmation and advances", async ({
  page,
}) => {
  await captureMailtos(page);
  await page.goto(reviewUrl);
  await openEmailDraft(page);
  await page
    .getByRole("button", { name: "Mark email sent & next", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "202 Example Avenue" }),
  ).toBeVisible();
  const state = await readCurrentStorage(page);
  const first = state.reviews["TEST-LEAD-1"];
  expect(first.decision).toBe("email_sent");
  expect(first.saved).toBe(true);
  expect(first.contacted).toBe(true);
  expect(first.emailSentConfirmedAt).toBeTruthy();
});

test("Pass saves and advances without a reason", async ({ page }) => {
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "202 Example Avenue" }),
  ).toBeVisible();
  const state = await readCurrentStorage(page);
  expect(state.reviews["TEST-LEAD-1"].decision).toBe("pass");
  expect(state.reviews["TEST-LEAD-1"].reasons).toEqual([]);
});

test("Already know this project saves and advances", async ({ page }) => {
  await page.goto(reviewUrl);
  await page
    .getByRole("button", {
      name: "Already know this project",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "202 Example Avenue" }),
  ).toBeVisible();
  const state = await readCurrentStorage(page);
  expect(state.reviews["TEST-LEAD-1"].decision).toBe("already_known");
});

test("persists an optional note without requiring it", async ({ page }) => {
  await page.goto(reviewUrl);
  await page.getByText("Add a note", { exact: true }).click();
  await page
    .getByLabel("Optional lead note")
    .fill("Fictional note about estimator routing.");
  await page.reload();
  await page.getByText("Add a note", { exact: true }).click();
  await expect(page.getByLabel("Optional lead note")).toHaveValue(
    "Fictional note about estimator routing.",
  );
});

test("shows the safe error and no mailto when generation fails", async ({
  page,
}) => {
  await captureMailtos(page);
  await page.route("**/api/elevate/enrich", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "private provider detail" }),
    }),
  );
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Email now", exact: true }).click();
  await expect(
    page.getByText("We couldn’t prepare the email. Please try again.", {
      exact: true,
    }),
  ).toHaveText(
    "We couldn’t prepare the email. Please try again.",
  );
  expect(await capturedMailtos(page)).toEqual([]);
  const state = await readCurrentStorage(page);
  expect(state.reviews["TEST-LEAD-1"].saved).toBe(false);
  expect(state.reviews["TEST-LEAD-1"].contacted).toBe(false);
});

test("allows retry after a preparation failure", async ({ page }) => {
  await captureMailtos(page);
  let attempts = 0;
  await page.route("**/api/elevate/enrich", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "failure" }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Email now", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Email now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark email sent & next", exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(await capturedMailtos(page)).toHaveLength(1);
});

test("keeps state isolated by token, batch, and ordered lead IDs", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect.poll(() => storageKeys(page)).toHaveLength(1);
  const current = (await storageKeys(page))[0];
  await page.evaluate((key) => {
    localStorage.setItem(
      "trulot:elevate-opportunity-review:v1:legacy-batch",
      JSON.stringify({ preserved: true }),
    );
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("missing current state");
    localStorage.setItem(`${key}:other-batch`, raw);
  }, current);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "101 Example Avenue" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        "trulot:elevate-opportunity-review:v1:legacy-batch",
      ),
    ),
  ).not.toBeNull();
});

test("maps a saved legacy call decision conservatively in the UI", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await expect.poll(() => storageKeys(page)).toHaveLength(1);
  const key = (await storageKeys(page))[0];
  await expect
    .poll(() =>
      page.evaluate((storageKey) => localStorage.getItem(storageKey), key),
    )
    .not.toBeNull();
  await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) throw new Error("missing state");
    const saved = JSON.parse(raw);
    saved.version = 2;
    saved.reviews["TEST-LEAD-1"].decision = "call_now";
    saved.reviews["TEST-LEAD-1"].saved = true;
    delete saved.reviews["TEST-LEAD-1"].emailDraftOpenedAt;
    delete saved.reviews["TEST-LEAD-1"].emailSentConfirmedAt;
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, key);
  await page.reload();
  await expect(page.getByTestId("email-actions")).toContainText(
    "Previous call-now decision is retained for reference",
  );
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(page.getByTestId("email-actions")).not.toContainText(
    "Email sent · recorded",
  );
});

test("completes five leads with emailed, passed, and already-known counts", async ({
  page,
}) => {
  await captureMailtos(page);
  await page.goto(reviewUrl);
  await openEmailDraft(page);
  await page
    .getByRole("button", { name: "Mark email sent & next", exact: true })
    .click();
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Already know this project",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  const complete = page.getByTestId("review-complete");
  await expect(complete).toContainText("5 of 5 reviewed");
  await expect(complete.getByLabel("Emailed count")).toHaveText("1");
  await expect(complete.getByLabel("Passed count")).toHaveText("3");
  await expect(complete.getByLabel("Already known count")).toHaveText("1");
});

test("exports batch identity, contact evidence, and email confirmation", async ({
  page,
}) => {
  await captureMailtos(page);
  await page.goto(reviewUrl);
  await openEmailDraft(page);
  await page
    .getByRole("button", { name: "Mark email sent & next", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).last().click();
  const json = JSON.parse(await downloadedText(await downloadPromise));
  const parsed = completedReviewExportSchema.parse(json);
  expect(parsed.batchId).toBe("batch-2-playwright");
  expect(parsed.leads[0].review.decision).toBe("email_sent");
  expect(parsed.leads[0].review.contacted).toBe(true);
  expect(parsed.leads[0].verifiedPacket.primaryContact.company).toBe(
    "Fictional Commercial Realty",
  );
});

test("keeps contact chat optional and operational", async ({ page }) => {
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Ask TruLot about this lead" }).click();
  await page.getByLabel("Question").fill("Is this the decision-maker?");
  await page.getByRole("button", { name: "Ask about this lead" }).click();
  await expect(page.getByTestId("lead-chat")).toContainText(
    "not a verified construction buyer",
  );
});

test("restart returns the batch to zero of five", async ({ page }) => {
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(
    page.getByRole("heading", { name: "101 Example Avenue" }),
  ).toBeVisible();
});

test("supports keyboard focus, touch-sized actions, and no overflow", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Email now", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "Email now", exact: true }),
  ).toBeFocused();
  const dimensions = await page.evaluate(() => {
    const button = document.querySelector(
      '[data-testid="email-actions"] button',
    );
    const rect = button?.getBoundingClientRect();
    return {
      body: document.body.scrollWidth,
      viewport: document.documentElement.clientWidth,
      actionHeight: rect?.height ?? 0,
      dialog: Boolean(
        document.querySelector(
          "[data-nextjs-dialog-overlay], [data-nextjs-toast]",
        ),
      ),
    };
  });
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.actionHeight).toBeGreaterThanOrEqual(48);
  expect(dimensions.dialog).toBe(false);
  expect(consoleErrors).toEqual([]);
});

function mockSavedLead() {
  return {
    decision: null,
    reasons: [],
    otherReason: "",
    notes: "",
    saved: false,
    chatTranscript: [],
    enrichment: null,
    editedEmailSubject: "Fictional subject",
    editedEmailBody: "Fictional body",
    editedCallOpener: "Fictional opener",
    contacted: false,
    outcome: null,
    outcomeNotes: "",
    estimatedOpportunityValue: "",
    followUpDate: null,
    enrichedOutreachAdopted: false,
    updatedAt: "2026-07-28T12:00:00.000Z",
  };
}

async function storageKeys(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith("trulot:elevate-opportunity-review:v2:"),
    ),
  );
}

async function readCurrentStorage(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("trulot:elevate-opportunity-review:v2:"),
    );
    if (!key) throw new Error("Missing current review state.");
    return JSON.parse(localStorage.getItem(key) ?? "{}") as {
      version: number;
      reviews: Record<
        string,
        {
          decision: string | null;
          reasons: string[];
          saved: boolean;
          contacted: boolean;
          emailDraftOpenedAt: string | null;
          emailSentConfirmedAt: string | null;
        }
      >;
    };
  });
}
