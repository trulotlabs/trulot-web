import { expect, test, type Page } from "@playwright/test";

const interviewUrl = "/elevate/interview/elevate-playwright-token";

test.setTimeout(60_000);

async function currentStep(page: Page, name: string) {
  const step = page.getByRole("listitem").filter({ hasText: name });
  await expect(step).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
}

async function continueSection(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function skipSection(page: Page) {
  await page.getByRole("button", { name: "Skip for now" }).click();
}

async function classify(
  page: Page,
  groupName: string,
  classification: "Core" | "Selective" | "Excluded" | "Unassigned",
) {
  await page
    .getByRole("radiogroup", { name: groupName })
    .getByRole("radio", { name: classification, exact: true })
    .check({ force: true });
}

async function advanceToEconomics(page: Page) {
  await page.getByRole("button", { name: "San Diego County only" }).click();
  await continueSection(page);
  await expect(page.getByTestId("section-scopes")).toBeVisible();
  await skipSection(page);
  await expect(page.getByTestId("section-economics")).toBeVisible();
}

async function completeFromEconomics(page: Page) {
  await page
    .getByLabel("Ordinary minimum worthwhile ROW contract value")
    .fill("25000");
  await page.getByLabel("Preferred contract value minimum").fill("50000");
  await page.getByLabel("Preferred contract value maximum").fill("150000");
  await page.getByText("Existing relationship", { exact: true }).click();
  await continueSection(page);

  await expect(page.getByTestId("section-customers")).toBeVisible();
  await classify(page, "General contractors classification", "Core");
  await classify(page, "Utilities classification", "Selective");
  await classify(page, "Developers / owners classification", "Core");
  await classify(page, "Direct public-agency work classification", "Excluded");
  await continueSection(page);

  await expect(page.getByTestId("section-contacts")).toBeVisible();
  await page
    .getByLabel("No strong preference — use the best available named contact")
    .check();
  await continueSection(page);

  await expect(page.getByTestId("section-timing")).toBeVisible();
  await page
    .getByRole("radio", { name: "First plan-check corrections issued" })
    .check();
  await page
    .getByRole("checkbox", {
      name: "First corrections clearly scope ROW work",
    })
    .check();
  await page
    .getByRole("checkbox", { name: "GC or estimator identified" })
    .check();
  await page.getByRole("radio", { name: "Work is underway" }).check();
  await continueSection(page);

  await expect(page.getByTestId("section-disqualifiers")).toBeVisible();
  await page
    .getByRole("radiogroup", {
      name: "No public ROW impact / private on-site work only screening rule",
    })
    .getByRole("radio", { name: "Suppress" })
    .check({ force: true });
  await page
    .getByRole("radiogroup", {
      name: "Direct-to-agency prime bid screening rule",
    })
    .getByRole("radio", { name: "Conditional" })
    .check({ force: true });
  await expect(
    page.getByLabel("Direct-to-agency prime bid condition"),
  ).toBeVisible();
  await page
    .getByLabel("Direct-to-agency prime bid condition")
    .fill("Only when a qualified prime partner is identified.");
  for (const name of [
    "Outside Elevate’s selected service geography screening rule",
    "Traffic-control-only opportunity screening rule",
    "Design-only or feasibility-only work with no construction screening rule",
  ]) {
    await page
      .getByRole("radiogroup", { name })
      .getByRole("radio", { name: "Allow" })
      .check({ force: true });
  }
  await page.getByPlaceholder("Short, participant-provided rule").fill(
    "Requires unavailable specialty certification",
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("radiogroup", {
      name: "Requires unavailable specialty certification screening rule",
    })
    .getByRole("radio", { name: "Suppress" })
    .check({ force: true });
  await continueSection(page);

  await expect(page.getByTestId("section-capacity_examples")).toBeVisible();
  await page.getByLabel("Leads reviewable per weekday").fill("5");
  await page.getByLabel("Outreach actions per weekday").fill("3");
  await page.getByText("Follow-up owner, if known").locator("input").fill("Cesar");
  await page
    .getByText("Expected response time")
    .locator("input")
    .fill("Within one business day");
  const goodFit = page
    .getByRole("group", { name: "Optional good-fit example" });
  await goodFit.getByLabel("Project type or location").fill("Completed ROW project");
  await goodFit.getByLabel("Main ROW scopes").fill("Sidewalk and ADA ramps");
  await goodFit.getByLabel("Why it was a good fit").fill("Matched crew capability");
  await continueSection(page);
  await expect(page.getByTestId("review")).toBeVisible();
}

test("denies an invalid private link without invoking or revealing the interview", async ({
  page,
}) => {
  let aiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/elevate/interview")) aiRequests += 1;
  });

  await page.goto("/elevate/interview/not-the-token");

  await expect(
    page.getByRole("heading", { name: "This link isn’t available." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /ROW Revenue/ })).toHaveCount(
    0,
  );
  expect(aiRequests).toBe(0);
});

test("keeps sequence app-controlled and ignores a model attempt to jump", async ({
  page,
}) => {
  await page.route("**/api/elevate/interview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        acknowledgement: "Saved.",
        assistantMessage: "Timing should be next.",
        requiresClarification: false,
        clarificationQuestion: null,
        unresolvedIssue: null,
        activeSection: "timing",
        progressPercent: 99,
      }),
    });
  });
  await page.goto(interviewUrl);
  await currentStep(page, "Service area");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );

  await page.getByRole("button", { name: "San Diego County only" }).click();
  await expect(page.getByTestId("section-service_area")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await continueSection(page);

  await expect(page.getByTestId("section-scopes")).toBeVisible();
  await currentStep(page, "ROW scopes");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "13",
  );
});

test("scope classifier moves rows, warns on unresolved items, and resumes exactly", async ({
  page,
}) => {
  await page.goto(interviewUrl);
  await page.getByRole("button", { name: "San Diego County only" }).click();
  await continueSection(page);

  const scopes = page.getByTestId("scope-classifier");
  await expect(scopes.getByRole("radiogroup")).toHaveCount(12);
  await expect(scopes.getByRole("radio", { name: "Unassigned" })).toHaveCount(
    12,
  );
  await expect(
    scopes.getByRole("radio", { name: "Unassigned" }).first(),
  ).toBeChecked();

  await classify(page, "Sidewalks classification", "Core");
  await expect(
    page.getByTestId("scope-classifier-summary-core"),
  ).toContainText("Sidewalks");
  await classify(page, "Sidewalks classification", "Selective");
  await expect(
    page.getByTestId("scope-classifier-summary-selective"),
  ).toContainText("Sidewalks");
  await classify(page, "Curb & gutter classification", "Core");
  await classify(page, "Traffic control (setups, MOT) classification", "Excluded");
  await page
    .getByLabel("Additional scopes or qualifications")
    .fill("Participant-provided qualification");

  await page.reload();
  await expect(page.getByTestId("section-scopes")).toBeVisible();
  await expect(
    page
      .getByRole("radiogroup", { name: "Sidewalks classification" })
      .getByRole("radio", { name: "Selective" }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Additional scopes or qualifications"),
  ).toHaveValue("Participant-provided qualification");

  await continueSection(page);
  await expect(page.getByTestId("unresolved-warning")).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByTestId("section-scopes")).toBeVisible();
  await continueSection(page);
  await page
    .getByRole("button", { name: "Continue with unresolved items" })
    .click();

  await expect(page.getByTestId("section-economics")).toBeVisible();
  await currentStep(page, "Economics");
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).map(([key, value]) => ({ key, value })),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].key).toMatch(/^trulot:elevate-interview:v2:/);
  expect(stored[0].value).not.toContain("elevate-playwright-token");
});

test("completes all structured sections, correction, approval, exports, clipboard, email, and restart", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(interviewUrl);
  await advanceToEconomics(page);
  await completeFromEconomics(page);

  await expect(page.locator('[data-testid^="summary-"]')).toHaveCount(8);
  await expect(page.getByTestId("summary-customers")).toContainText(
    "General contractors",
  );
  await expect(page.getByTestId("summary-timing")).toContainText(
    "First plan-check corrections issued",
  );
  await expect(page.getByTestId("summary-disqualifiers")).toContainText(
    "Requires unavailable specialty certification",
  );
  await expect(page.getByText("title taxonomy", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByText("named account", { exact: false })).toHaveCount(0);

  await page
    .getByTestId("summary-economics")
    .getByRole("button", { name: "Edit" })
    .click();
  await expect(page.getByTestId("section-economics")).toBeVisible();
  await expect(
    page.getByLabel("Ordinary minimum worthwhile ROW contract value"),
  ).toHaveValue("25000");
  await page
    .getByLabel("Ordinary minimum worthwhile ROW contract value")
    .fill("30000");
  await continueSection(page);
  await expect(page.getByTestId("review")).toBeVisible();
  await expect(page.getByTestId("summary-economics")).toContainText("$30,000");
  await expect(page.getByTestId("summary-capacity_examples")).toContainText(
    "5 per weekday",
  );

  await page
    .getByRole("button", { name: "That looks right" })
    .click();
  await expect(page.getByTestId("approved-actions")).toBeVisible();
  await expect(page.getByText("✓ Approved by Cesar")).toBeVisible();

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  expect((await markdownDownload).suggestedFilename()).toBe(
    "elevate-buy-box-v0.1.md",
  );

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await jsonDownload).suggestedFilename()).toBe(
    "elevate-buy-box-v0.1.json",
  );

  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(
    page.getByRole("button", { name: "Summary copied" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy full transcript" }).click();
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
  await expect(page.getByTestId("section-service_area")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  expect(consoleErrors).toEqual([]);
});

test("accepts no hard disqualifiers without reopening and has no mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(interviewUrl);
  for (let index = 0; index < 6; index += 1) {
    await skipSection(page);
  }
  await expect(page.getByTestId("section-disqualifiers")).toBeVisible();
  await page
    .getByRole("button", { name: "No hard disqualifiers yet" })
    .click();
  await continueSection(page);
  await expect(page.getByTestId("section-capacity_examples")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("section-capacity_examples")).toBeVisible();

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
  await expect(page.getByText("Optional good-fit example")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Optional good-fit example" }).getByRole(
      "textbox",
    ),
  ).toHaveCount(5);
});
