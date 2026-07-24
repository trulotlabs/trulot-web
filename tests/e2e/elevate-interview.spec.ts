import { expect, test, type Page } from "@playwright/test";

const reviewUrl = "/elevate/interview/elevate-playwright-token";
test.setTimeout(60_000);

async function chooseDecision(
  page: Page,
  decision: "Call now" | "Call later" | "Pass" | "Already known",
  reason: string,
) {
  await page
    .getByRole("radio", { name: decision, exact: true })
    .check({ force: true });
  await page
    .getByRole("radio", { name: reason, exact: true })
    .check({ force: true });
}

async function saveAndNext(page: Page) {
  await page.getByRole("button", { name: "Save and Next" }).click();
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

test("supports all four decisions, structured reasons, notes, save, and resume", async ({
  page,
}) => {
  await page.goto(reviewUrl);

  await chooseDecision(page, "Call now", "Scope looks real");
  await page
    .getByLabel("What did TruLot get right or wrong?")
    .fill("The timing signal is useful.");
  await saveAndNext(page);

  await chooseDecision(page, "Call later", "Waiting for permit milestone");
  await saveAndNext(page);

  await chooseDecision(page, "Pass", "No useful contact");
  await saveAndNext(page);

  await chooseDecision(page, "Already known", "Already tracking");
  await saveAndNext(page);

  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "80",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /404 Example Avenue/ }))
    .toContainText("Saved");
  await page.getByRole("button", { name: /101 Example Avenue/ }).click();
  await expect(
    page.getByRole("radio", { name: "Call now", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Scope looks real", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("What did TruLot get right or wrong?"),
  ).toHaveValue("The timing signal is useful.");

  const storage = await page.evaluate(() => Object.entries(localStorage));
  expect(storage).toHaveLength(1);
  expect(storage[0][0]).toMatch(
    /^trulot:elevate-opportunity-review:v1:/,
  );
  expect(storage[0][0]).not.toContain("elevate-playwright-token");
});

test("supports lead chat, mock enrichment, editable outreach, and outcomes", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(reviewUrl);
  await chooseDecision(page, "Call now", "Contact route looks usable");

  await page
    .getByRole("button", { name: "Discuss this lead with TruLot" })
    .click();
  await page.getByLabel("Question").fill("Who should I call?");
  await page.getByRole("button", { name: "Ask about this lead" }).click();
  await expect(page.getByTestId("lead-chat")).toContainText(
    "Fictional Builder 1",
  );
  await expect(page.getByTestId("lead-chat")).toContainText(
    "currently verified route",
  );

  await page.getByRole("button", { name: "Find a better contact" }).click();
  await expect(page.getByTestId("enrichment-result")).toBeVisible();
  await expect(page.getByTestId("enrichment-result")).toContainText(
    "Probable Routing Contact",
  );
  await expect(page.getByTestId("enrichment-result")).toContainText(
    "Relationship: Medium",
  );
  await expect(page.getByTestId("enrichment-result")).toContainText(
    "Routing: Medium",
  );
  await page
    .getByRole("button", { name: "Use enriched outreach draft" })
    .click();

  const subject = page.getByLabel("Email subject");
  await subject.fill("Edited fictional ROW subject");
  const body = page.getByLabel("Email body");
  await body.fill("Edited fictional email body.");
  const opener = page.getByLabel("Suggested call opener");
  await opener.fill("Edited fictional call opener.");

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
  await expect(page.getByTestId("outcome-tracking")).toBeVisible();
  await page.getByLabel("Current outcome").selectOption("row_scope_confirmed");
  await page
    .getByLabel("Estimated opportunity value")
    .fill("$25,000 test estimate");
  await page.getByLabel("Follow-up date").fill("2026-08-01");
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

test("exports review, builds Brian mailto, and restarts with confirmation", async ({
  page,
}) => {
  await page.goto(reviewUrl);
  await chooseDecision(page, "Pass", "Wrong timing");
  await page.getByRole("button", { name: "Save and Next" }).click();

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  expect((await markdownDownload).suggestedFilename()).toBe(
    "elevate-opportunity-review.md",
  );

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await jsonDownload).suggestedFilename()).toBe(
    "elevate-opportunity-review.json",
  );

  await page.getByRole("button", { name: "Copy concise summary" }).click();
  await expect(page.getByRole("button", { name: "Review copied" })).toBeVisible();
  await expect(page.getByTestId("email-review-summary")).toHaveAttribute(
    "href",
    /^mailto:results%40example\.test/,
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
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
