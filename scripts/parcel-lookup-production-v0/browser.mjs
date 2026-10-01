#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const baseUrl = process.env.PARCEL_LOOKUP_PRODUCTION_URL ?? "http://127.0.0.1:3216/parcel-lookup";
const outputDir = path.join(root, "data/parcel-lookup-production-v0/screenshots");
const reportPath = path.join(root, "data/parcel-lookup-production-v0/browser-result.json");
fs.mkdirSync(outputDir, { recursive: true });

const percentile = (values, proportion) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * proportion) - 1];
const round = (value) => Number(value.toFixed(1));
const errors = [];
const observe = (page, label) => {
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${label}: pageerror: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`${label}: requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
};

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await desktopContext.newPage();
observe(page, "desktop");
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("Private production-shaped lookup", { exact: true }).waitFor();
assert.equal(await page.locator("[data-production-wired='true']").count(), 1);
assert.equal(await page.locator("[data-preview-source]").count(), 0);

const api = await desktopContext.request.get(`${new URL(baseUrl).origin}/api/parcel-lookup?q=${encodeURIComponent("544-214-06-00")}&limit=1`);
assert.equal(api.status(), 200);
assert.equal(api.headers()["cache-control"], "private, no-store, max-age=0");
assert.match(api.headers()["x-robots-tag"], /noindex/);
const apiBody = await api.json();
assert.equal(apiBody.contractVersion, "parcel-lookup-production-v0-p45");
assert.equal(apiBody.state, "EXACT_MATCH");
assert.equal(apiBody.selected.apnDisplay, "544-214-06-00");
assert.deepEqual(Object.keys(apiBody.candidates[0]).sort(), ["address", "apn", "apnDisplay", "displayAddress", "jurisdiction", "orientation", "zip"]);
assert.doesNotMatch(JSON.stringify(apiBody), /source_object|geometry_sha|parcel_id|trulot_v2|sql/i);

const invalid = await desktopContext.request.get(`${new URL(baseUrl).origin}/api/parcel-lookup?q=x&limit=1`);
assert.equal(invalid.status(), 400);
assert.equal((await invalid.json()).state, "INVALID_QUERY");

const input = page.getByRole("combobox", { name: "Address or APN" });
const renderedSamples = [];
for (let index = 0; index < 20; index += 1) {
  await input.fill("");
  await page.getByRole("listbox").waitFor({ state: "detached" });
  const started = performance.now();
  await input.fill("639 N 67");
  await page.getByText("APN 544-214-06-00", { exact: false }).first().waitFor();
  renderedSamples.push(performance.now() - started);
}
await page.screenshot({ path: path.join(outputDir, "production-autocomplete-desktop.png"), fullPage: true });

await input.fill("");
await page.getByRole("listbox").waitFor({ state: "detached" });
const copyStarted = performance.now();
await input.fill("639 N 67TH ST");
await page.getByRole("option").first().getByRole("button").click();
await page.getByRole("button", { name: "Copy APN" }).waitFor();
await page.getByRole("button", { name: "Copy APN" }).click();
await page.getByRole("button", { name: "Copied" }).waitFor();
const copiedApn = await page.evaluate(() => navigator.clipboard.readText());
const copiedElapsedMs = performance.now() - copyStarted;
assert.equal(copiedApn, "544-214-06-00");
assert.ok(copiedElapsedMs < 2000, `copy path took ${copiedElapsedMs}ms`);
assert.ok(await page.locator("svg[aria-label^='Display orientation point']").isVisible());
assert.equal(await page.locator("svg[aria-label^='Parcel outline']").count(), 0);
const destination = await page.getByRole("link", { name: "Open canonical parcel page" }).getAttribute("href");
assert.match(destination, /^\/parcel\/san-diego\//);
assert.equal(await page.getByText("Base zoning", { exact: true }).count(), 0);
assert.equal(await page.getByText("Coastal status", { exact: true }).count(), 0);
await page.screenshot({ path: path.join(outputDir, "production-selected-desktop.png"), fullPage: true });

await page.getByRole("button", { name: "New search" }).click();
await input.fill("1501 FRONT ST");
await page.getByText(/parcel records share this address/i).waitFor();
assert.equal(await page.getByRole("option").count(), 10);
const activeBefore = await input.getAttribute("aria-activedescendant");
await input.press("ArrowDown");
assert.notEqual(await input.getAttribute("aria-activedescendant"), activeBefore);
await input.press("ArrowUp");
assert.equal(await input.getAttribute("aria-activedescendant"), activeBefore);
await input.press("Escape");
assert.equal(await input.getAttribute("aria-expanded"), "false");

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const mobile = await mobileContext.newPage();
observe(mobile, "mobile");
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
const mobileInput = mobile.getByRole("combobox", { name: "Address or APN" });
await mobileInput.fill("544 214 06 00");
await mobile.getByRole("option").first().getByRole("button").click();
await mobile.getByRole("button", { name: "Copy APN" }).waitFor();
const addressBox = await mobile.getByRole("heading", { name: "639 N 67TH ST" }).boundingBox();
const apnBox = await mobile.getByText("APN 544-214-06-00", { exact: true }).boundingBox();
const copyBox = await mobile.getByRole("button", { name: "Copy APN" }).boundingBox();
for (const box of [addressBox, apnBox, copyBox]) assert.ok(box && box.y >= 0 && box.y + box.height <= 844);
await mobile.screenshot({ path: path.join(outputDir, "production-selected-mobile.png"), fullPage: false });

await browser.close();
assert.deepEqual(errors, []);

const renderedMedianMs = percentile(renderedSamples, 0.5);
const renderedP95Ms = percentile(renderedSamples, 0.95);
assert.ok(renderedMedianMs <= 300, `rendered median ${renderedMedianMs}ms`);
assert.ok(renderedP95Ms <= 800, `rendered p95 ${renderedP95Ms}ms`);
const report = {
  contractVersion: "parcel-lookup-production-v0-browser-2026-10-01-p45",
  evidence: "LOCAL_PRODUCTION_SHAPED_EVIDENCE",
  baseUrl,
  productionAccessed: false,
  viewports: { desktop: "1440x1000", mobile: "390x844" },
  renderedWarmSearch: {
    query: "639 N 67",
    sampleCount: renderedSamples.length,
    medianMs: round(renderedMedianMs),
    p95Ms: round(renderedP95Ms),
    target: "median <= 300 ms; p95 <= 800 ms",
  },
  correctlyCopiedApn: {
    query: "639 N 67TH ST",
    value: copiedApn,
    elapsedMs: round(copiedElapsedMs),
    target: "< 2000 ms warm session",
  },
  checks: {
    actualApiRoute: true,
    stableResponseSchema: true,
    internalFieldsAbsent: true,
    invalidQueryStable: true,
    apnVisibleInAutocomplete: true,
    exactAddressRanking: true,
    formattedSpacedApn: true,
    ambiguitySafety: true,
    keyboard: true,
    cleanCopy: true,
    mobileIdentityAboveFold: true,
    pointOrientationOnly: true,
    canonicalParcelV1Destination: true,
    zoningAndCoastalAbsent: true,
    consoleErrorsAbsent: true,
  },
  mobilePositions: { address: addressBox, apn: apnBox, copy: copyBox },
  screenshots: fs.readdirSync(outputDir).filter((name) => name.endsWith(".png")).sort(),
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Packet 45 local production-shaped browser\n${JSON.stringify(report, null, 2)}`);
