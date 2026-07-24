import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import {
  completedReviewExportSchema,
  type LeadDecision,
} from "../../lib/elevate-review/schema";

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

test("loads five fictional leads with navigation and experiment disclosures", async ({
  page,
}) => {
  await page.goto(reviewUrl);

  await expect(
    page.getByRole("heading", { name: "ROW Opportunity Review" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Pilot opportunities" })
      .getByRole("button"),
  ).toHaveCount(5);
  await expect(page.getByText("Four are considered actionable")).toBeVisible();
  await expect(page.getByText("Mock mode")).toBeVisible();
  await expect(page.getByText("Project", { exact: true })).toBeVisible();
  await expect(page.getByText("ROW scope", { exact: true })).toBeVisible();
  await expect(page.getByText("Contact", { exact: true })).toBeVisible();

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

  await page
    .getByRole("button", { name: "Discuss this lead with TruLot" })
    .click();
  await page.getByLabel("Question").fill("Who should I call?");
  await page.getByRole("button", { name: "Ask about this lead" }).click();
  await expect(page.getByTestId("lead-chat")).toContainText(
    "Fictional Builder 1",
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
  expect(mockOutreach).toContain(
    "I’m reaching out regarding the active project at",
  );
  expect(mockOutreach).toContain("Has that package been assigned?");

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
    /^mailto:routing-1%40example\.test\?subject=Edited%20fictional%20ROW%20subject/,
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
  const markdown = await downloadedText(await markdownDownload);
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
  const json = JSON.parse(await downloadedText(await jsonDownload));
  const validated = completedReviewExportSchema.parse(json);
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
