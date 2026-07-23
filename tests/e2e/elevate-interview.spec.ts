import { expect, test, type Page } from "@playwright/test";

const interviewUrl = "/elevate/interview/elevate-playwright-token";
test.setTimeout(60_000);

async function currentStep(page: Page, name: string) {
  await expect(
    page.getByRole("listitem").filter({ hasText: name }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
}

async function continueStep(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function classify(
  page: Page,
  signal: string,
  value: "Send now" | "Supporting" | "Ignore",
) {
  await page
    .getByRole("radiogroup", { name: `${signal} classification` })
    .getByRole("radio", { name: value })
    .check({ force: true });
}

async function completeFlow(page: Page) {
  await classify(page, "ROW / encroachment permit applied", "Supporting");
  await classify(page, "ROW / encroachment permit approved", "Send now");
  await classify(
    page,
    "Traffic-control permit applied or approved",
    "Supporting",
  );
  await classify(page, "Utility service or lateral application", "Send now");
  await classify(
    page,
    "Plan-check corrections identify frontage or ROW work",
    "Send now",
  );
  await classify(
    page,
    "Building permit conditions require public improvements",
    "Send now",
  );
  await classify(
    page,
    "Plans visibly show sidewalk, curb, ADA, trenching, or restoration scope",
    "Send now",
  );
  await classify(
    page,
    "GC, estimator, or permit applicant identified",
    "Supporting",
  );
  await continueStep(page);

  await page
    .getByRole("checkbox", {
      name: "ROW scope is visible in plans, corrections, or conditions",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "A responsible applicant, GC, or estimator is named",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Project address and parcel are reconciled",
    })
    .check();
  await continueStep(page);

  await page
    .getByRole("checkbox", {
      name: "Private on-site work only; no public ROW impact",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Completed, expired, withdrawn, or cancelled work",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Duplicate records for the same project and signal",
    })
    .check();
  await continueStep(page);

  await page.getByRole("radio", { name: "5 real leads" }).check();
  await page
    .getByRole("radio", { name: "As soon as the first five are ready" })
    .check();
  await page
    .getByText("Feedback owner, if known")
    .locator("input")
    .fill("Cesar");
  await continueStep(page);
}

test("invalid token remains neutral and invokes no interview API", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/elevate/interview")) requests += 1;
  });
  await page.goto("/elevate/interview/not-the-token");
  await expect(
    page.getByRole("heading", { name: "This link isn’t available." }),
  ).toBeVisible();
  await expect(page.getByText("Signal Calibration")).toHaveCount(0);
  expect(requests).toBe(0);
});

test("uses a strict four-step app-controlled sequence and ignores model jumps", async ({
  page,
}) => {
  await page.route("**/api/elevate/interview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        acknowledgement: "Saved.",
        assistantMessage: "Jump to delivery.",
        requiresClarification: false,
        clarificationQuestion: null,
        unresolvedIssue: null,
        activeSection: "delivery",
        progressPercent: 99,
      }),
    }),
  );
  await page.goto(interviewUrl);
  await currentStep(page, "Signals");
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(page.getByText("San Diego County")).toBeVisible();
  await expect(page.getByText("any project size", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await currentStep(page, "Evidence");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
});

test("classifies signals, requires explicit continue, and resumes exactly", async ({
  page,
}) => {
  await page.goto(interviewUrl);
  await expect(page.getByTestId("signal-classifier").getByRole("radiogroup")).toHaveCount(8);
  await classify(page, "ROW / encroachment permit approved", "Send now");
  await expect(page.getByTestId("signal-classifier-summary-core")).toContainText(
    "ROW / encroachment permit approved",
  );
  await expect(page.getByTestId("section-signals")).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", {
        name: "ROW / encroachment permit approved classification",
      })
      .getByRole("radio", { name: "Send now" }),
  ).toBeChecked();
  await continueStep(page);
  await expect(page.getByTestId("unresolved-warning")).toBeVisible();
  await page
    .getByRole("button", { name: "Continue with unresolved items" })
    .click();
  await currentStep(page, "Evidence");
  const storage = await page.evaluate(() => Object.entries(localStorage));
  expect(storage).toHaveLength(1);
  expect(storage[0][0]).toMatch(
    /^trulot:elevate-signal-calibration:v3:/,
  );
  expect(storage[0][1]).not.toContain("elevate-playwright-token");
});

test("completes review, correction, approval, exports, clipboard, email, refresh, and restart", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(interviewUrl);
  await completeFlow(page);
  await expect(page.getByTestId("review")).toBeVisible();
  await expect(page.locator('[data-testid^="summary-"]')).toHaveCount(4);
  await expect(page.getByText("Elevate Signal Calibration Summary")).toBeVisible();
  await expect(page.getByTestId("summary-signals")).toContainText(
    "ROW / encroachment permit approved",
  );
  await expect(page.getByTestId("summary-delivery")).toContainText(
    "5 leads",
  );

  await page
    .getByTestId("summary-delivery")
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByRole("radio", { name: "10 real leads" }).check();
  await continueStep(page);
  await expect(page.getByTestId("summary-delivery")).toContainText("10 leads");
  await expect(page.getByTestId("summary-signals")).toContainText(
    "ROW / encroachment permit approved",
  );

  await page.getByRole("button", { name: "That looks right" }).click();
  await expect(page.getByTestId("approved-actions")).toBeVisible();
  const markdown = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  expect((await markdown).suggestedFilename()).toBe(
    "elevate-signal-calibration.md",
  );
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await json).suggestedFilename()).toBe(
    "elevate-signal-calibration.json",
  );
  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByRole("button", { name: "Summary copied" })).toBeVisible();
  await page.getByRole("button", { name: "Copy clarification notes" }).click();
  await expect(
    page.getByRole("button", { name: "Transcript copied" }),
  ).toBeVisible();
  await expect(page.getByTestId("email-summary")).toHaveAttribute(
    "href",
    /^mailto:results%40example\.test/,
  );
  await page.reload();
  await expect(page.getByTestId("approved-actions")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByTestId("section-signals")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("is usable without overflow or framework errors on phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(interviewUrl);
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
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});
