#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outputDir = path.join(root, "data/parcel-lookup-v0/screenshots");
const reportPath = path.join(root, "data/parcel-lookup-v0/acceptance-result.json");
const baseUrl = process.env.PARCEL_LOOKUP_PREVIEW_URL ?? "http://127.0.0.1:3013/parcel-lookup-preview";
fs.mkdirSync(outputDir, { recursive: true });

const errors = [];
const observe = (page, label) => {
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${label}: pageerror: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`${label}: requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
};

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
const desktop = await desktopContext.newPage();
observe(desktop, "desktop");

await desktop.goto(`${baseUrl}?fixture=ranking`, { waitUntil: "networkidle" });
await desktop.getByText("SYNTHETIC_RANKING_FIXTURE", { exact: true }).waitFor();
let input = desktop.getByRole("combobox", { name: "Address or APN" });
await input.fill("202 C ST");
await desktop.getByRole("listbox").waitFor();
const rankingOptions = await desktop.getByRole("option").allTextContents();
assert.equal(rankingOptions.length, 2);
assert.match(rankingOptions[0], /202 C ST.*990-000-00-01.*exact address/is);
assert.match(rankingOptions[1], /100 C ST.*Unit 202.*990-000-00-02.*incidental unit match/is);
await desktop.screenshot({ path: path.join(outputDir, "p43b-civic-vs-unit-ranking-desktop.png"), fullPage: true });

await desktop.goto(`${baseUrl}?fixture=normalization`, { waitUntil: "networkidle" });
await desktop.getByText("SYNTHETIC_NORMALIZATION_FIXTURE", { exact: true }).waitFor();
input = desktop.getByRole("combobox", { name: "Address or APN" });
await input.fill("0123456789");
await desktop.getByText("APN 012-345-67-89", { exact: false }).first().waitFor();
await input.press("Enter");
await desktop.getByRole("button", { name: "Copy APN" }).click();
await desktop.getByRole("button", { name: "Copied" }).waitFor();
assert.equal(await desktop.evaluate(() => navigator.clipboard.readText()), "012-345-67-89");

await desktop.goto(baseUrl, { waitUntil: "networkidle" });
input = desktop.getByRole("combobox", { name: "Address or APN" });
await input.fill("639 N 67TH ST");
await desktop.getByText("APN 544-214-06-00", { exact: false }).first().waitFor();
await desktop.screenshot({ path: path.join(outputDir, "p43b-autocomplete-apn-desktop.png"), fullPage: true });
await input.press("Enter");
await desktop.getByRole("button", { name: "Copy APN" }).waitFor();
assert.ok(await desktop.locator("svg[aria-label^='Parcel outline']").isVisible());
await desktop.getByRole("button", { name: "Copy APN" }).click();
assert.equal(await desktop.evaluate(() => navigator.clipboard.readText()), "544-214-06-00");
await desktop.screenshot({ path: path.join(outputDir, "p43b-selected-identity-desktop.png"), fullPage: true });

await desktop.getByRole("button", { name: "New search" }).click();
input = desktop.getByRole("combobox", { name: "Address or APN" });
await input.fill("1501 FRONT ST");
await desktop.getByRole("listbox").waitFor();
const firstActive = await input.getAttribute("aria-activedescendant");
await input.press("ArrowDown");
const secondActive = await input.getAttribute("aria-activedescendant");
assert.notEqual(firstActive, secondActive);
await input.press("ArrowUp");
assert.equal(await input.getAttribute("aria-activedescendant"), firstActive);
await input.press("ArrowDown");
await input.press("Enter");
await desktop.getByText("APN 533-364-13-02", { exact: true }).waitFor();
await desktop.getByRole("button", { name: "New search" }).click();
await input.fill("5173 BRIGHTON AVE");
await desktop.getByRole("listbox").waitFor();
await input.press("Escape");
assert.equal(await input.getAttribute("aria-expanded"), "false");
await input.fill("1456 27TH ST");
await desktop.getByText("APN 634-130-22-00", { exact: false }).first().waitFor();

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
const mobile = await mobileContext.newPage();
observe(mobile, "mobile");
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
const mobileInput = mobile.getByRole("combobox", { name: "Address or APN" });

await mobile.getByRole("button", { name: "Find parcel" }).click();
await mobile.getByText("Enter an address or APN to search.", { exact: true }).waitFor();
assert.ok(await mobileInput.evaluate((element) => element === document.activeElement));
await mobile.screenshot({ path: path.join(outputDir, "p43b-empty-query-mobile.png"), fullPage: false });

await mobileInput.fill("x");
assert.equal(await mobile.getByText("Enter at least 2 characters.", { exact: true }).count(), 0);
await mobile.getByRole("button", { name: "Find parcel" }).click();
await mobile.getByText("Enter at least 2 characters.", { exact: true }).waitFor();
assert.ok(await mobileInput.evaluate((element) => element === document.activeElement));
await mobile.screenshot({ path: path.join(outputDir, "p43b-too-short-mobile.png"), fullPage: false });

await mobileInput.fill("639 N 67TH ST");
await mobile.getByText("APN 544-214-06-00", { exact: false }).first().waitFor();
await mobile.getByRole("option").first().getByRole("button").click();
await mobile.getByRole("button", { name: "Copy APN" }).waitFor();
const addressBox = await mobile.getByRole("heading", { name: "639 N 67TH ST" }).boundingBox();
const apnBox = await mobile.getByText("APN 544-214-06-00", { exact: true }).boundingBox();
const copyBox = await mobile.getByRole("button", { name: "Copy APN" }).boundingBox();
for (const box of [addressBox, apnBox, copyBox]) assert.ok(box && box.y >= 0 && box.y + box.height <= 844);
await mobile.screenshot({ path: path.join(outputDir, "p43b-selected-identity-mobile.png"), fullPage: false });

await mobile.goto(`${baseUrl}?failure=source-unavailable`, { waitUntil: "networkidle" });
await mobile.locator('[data-lookup-state="SOURCE_UNAVAILABLE"]').waitFor();
assert.ok(await mobile.getByRole("combobox", { name: "Address or APN" }).isEnabled());
assert.equal(await mobile.locator('[data-lookup-state="SELECTED_PARCEL_UNAVAILABLE"]').count(), 0);
await mobile.screenshot({ path: path.join(outputDir, "p43b-source-unavailable-mobile.png"), fullPage: false });
await mobile.getByRole("button", { name: "Retry lookup" }).click();
await mobile.getByRole("combobox", { name: "Address or APN" }).fill("639 N 67TH ST");
await mobile.getByText("APN 544-214-06-00", { exact: false }).first().waitFor();

await mobile.goto(`${baseUrl}?failure=selected-open`, { waitUntil: "networkidle" });
const failureInput = mobile.getByRole("combobox", { name: "Address or APN" });
await failureInput.fill("639 N 67TH ST");
await mobile.getByRole("option").first().getByRole("button").click();
const failedOpen = mobile.locator('[data-lookup-state="SELECTED_PARCEL_UNAVAILABLE"]');
await failedOpen.waitFor();
assert.match(await failedOpen.innerText(), /639 N 67TH ST.*544-214-06-00/is);
assert.equal(await mobile.locator("section[aria-live='polite']").count(), 0);
await mobile.screenshot({ path: path.join(outputDir, "p43b-selected-open-failure-mobile.png"), fullPage: false });
await mobile.getByRole("button", { name: "Retry parcel" }).click();
await mobile.getByRole("button", { name: "Copy APN" }).waitFor();
assert.equal(await mobile.locator('[data-lookup-state="SELECTED_PARCEL_UNAVAILABLE"]').count(), 0);

await browser.close();
assert.deepEqual(errors, []);

const report = {
  contractVersion: "parcel-lookup-v0-acceptance-2026-10-01-p43b",
  evidence: "LOCAL_FIXTURE_EVIDENCE",
  baseUrl,
  viewports: { desktop: "1440x1000", mobile: "390x844" },
  checks: {
    mobileIdentityAboveFold: true,
    emptySubmissionRecovery: true,
    tooShortSubmissionRecovery: true,
    passiveTypingDoesNotFlashValidation: true,
    civicAddressOutranksIncidentalUnit: true,
    leadingZeroNormalizationAndCopy: true,
    sourceUnavailableRecovery: true,
    selectedOpenFailureRecovery: true,
    suggestionApn: true,
    ambiguityAndKeyboard: true,
    cleanCopy: true,
    selectedOutline: true,
    consoleErrorsAbsent: true
  },
  mobilePositions: { address: addressBox, apn: apnBox, copy: copyBox },
  screenshots: fs.readdirSync(outputDir).filter((file) => file.startsWith("p43b-") && file.endsWith(".png")).sort()
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Packet 43B browser acceptance\n${JSON.stringify(report, null, 2)}`);
