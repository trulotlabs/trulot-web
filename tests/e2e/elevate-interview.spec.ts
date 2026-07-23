import { expect, test } from "@playwright/test";

const interviewUrl = "/elevate/interview/elevate-playwright-token";

test("denies an invalid private link without revealing the interview", async ({ page }) => {
  let aiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/elevate/interview")) aiRequests += 1;
  });

  await page.goto("/elevate/interview/not-the-token");

  await expect(page.getByRole("heading", { name: "This link isn’t available." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /ROW Revenue/ })).toHaveCount(0);
  expect(aiRequests).toBe(0);
});

test("completes resume, correction, approval, export, email, and restart flow", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(interviewUrl);

  await expect(
    page.getByRole("heading", { name: "ROW Revenue Opportunity Interview" }),
  ).toBeVisible();
  await expect(page.getByText("Prepared specifically for Cesar and Elevate")).toBeVisible();
  await expect(page.getByText("Let’s start with geography", { exact: false })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");

  await page.getByRole("button", { name: "San Diego County" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "32");
  await expect(page.getByText("which ROW scopes are core work", { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "32");
  await expect(page.getByText("San Diego County", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Core: curb/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "58");

  await page.getByRole("button", { name: /I’ll describe a specific project/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "82");

  await page.getByRole("button", { name: "Review 5; contact 3" }).click();
  await expect(page.getByTestId("buy-box-review")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

  await page.getByRole("button", { name: "I need to correct something" }).click();
  await expect(page.getByText("Tell me what needs to change", { exact: false })).toBeVisible();
  await page.getByLabel("Your response").fill("Make Riverside County selective, not core.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("buy-box-review")).toBeVisible();

  await page.getByRole("button", { name: "That looks right" }).click();
  await expect(page.getByTestId("approved-actions")).toBeVisible();

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  expect((await markdownDownload).suggestedFilename()).toBe("elevate-buy-box-v0.1.md");

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await jsonDownload).suggestedFilename()).toBe("elevate-buy-box-v0.1.json");

  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByRole("button", { name: "Summary copied" })).toBeVisible();

  await expect(page.getByTestId("email-summary")).toHaveAttribute(
    "href",
    /^mailto:results%40example\.test/,
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");
  await expect(page.getByText("Let’s start with geography", { exact: false })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("has no horizontal overflow at a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(interviewUrl);

  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByLabel("Your response")).toBeVisible();
});
