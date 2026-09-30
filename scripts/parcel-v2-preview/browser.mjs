#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3210";
const outputDir = path.join(root, "data/parcel-page-v2-preview");
const screenshotDir = path.join(outputDir, "screenshots");
const staticFixtures = JSON.parse(fs.readFileSync(path.join(root, "data/parcel-page-v2-ui/fixtures.json"), "utf8"));
const staticByApn = new Map(staticFixtures.fixtures.map((fixture) => [fixture.apn, fixture.rendering]));
const parcels = [
  { apn: "6341302200", coastal: "Outside Coastal Overlay Zone", version: "sd-rs-base-standards-2026-09-30-v0", split: false },
  { apn: "3506320400", coastal: "Inside Coastal Overlay Zone", version: "sd-rs-base-standards-inside-coastal-2026-09-10-v0", split: false },
  { apn: "4304211000", coastal: "Outside Coastal Overlay Zone", version: "sd-rs-base-standards-2026-09-30-v0", split: true },
];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 1000 },
];

fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const parcel of parcels) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
      const started = performance.now();
      const response = await page.goto(`${baseUrl}/parcel-v2-preview/${parcel.apn}`, { waitUntil: "load" });
      const responseMs = Number((performance.now() - started).toFixed(1));
      await page.waitForLoadState("networkidle");
      assert.equal(response?.status(), 200);
      const bodyText = await page.locator("body").innerText();
      const fullText = await page.locator("body").textContent();
      assert.ok(bodyText.includes(parcel.coastal));
      assert.ok(fullText?.includes(parcel.version));
      assert.ok(bodyText.includes("Development capacity: Not evaluated yet"));
      assert.equal(bodyText.includes("This parcel has split zoning"), parcel.split);
      assert.equal(await page.locator("h1").count(), 1);
      assert.deepEqual(await page.locator("h2").allTextContents(), [
        "At a glance",
        "Base development standards",
        "Existing property facts",
        "What we don’t know yet",
        "Next investigation",
        "Evidence / How TruLot knows",
      ]);
      assert.equal(await page.locator("meta[name=robots]").getAttribute("content"), "noindex, nofollow, noarchive, nosnippet");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false);
      const summaries = [
        page.locator(".orientation-evidence > summary").first(),
        page.locator(".item-details > summary").first(),
        page.locator(".evidence > summary").first(),
      ];
      for (const summary of summaries) {
        assert.equal(await summary.count(), 1);
        await summary.focus();
        assert.equal(await summary.evaluate((node) => document.activeElement === node), true);
        await summary.press("Enter");
        assert.equal(await summary.evaluate((node) => Boolean(node.parentElement?.open)), true);
      }
      const hydrationErrors = consoleErrors.filter((message) => /hydration|did not match|server rendered/i.test(message));
      assert.deepEqual(hydrationErrors, []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(failedRequests, []);

      let screenshot = null;
      if (viewport.name !== "tablet") {
        screenshot = `data/parcel-page-v2-preview/screenshots/${parcel.apn}-${viewport.name}.png`;
        // Return disclosures to their initial state before capturing the product view.
        for (const summary of summaries) await summary.press("Enter");
        await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
      }

      let staticComparison = null;
      if (viewport.name === "desktop") {
        const integratedText = await page.locator("main").innerText();
        const staticPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await staticPage.goto(pathToFileURL(path.join(root, staticByApn.get(parcel.apn))).href, { waitUntil: "load" });
        const staticText = await staticPage.locator("main").innerText();
        assert.equal(integratedText, staticText);
        staticComparison = "exact visible main text match";
        await staticPage.close();
      }

      checks.push({
        apn: parcel.apn,
        viewport: `${viewport.width}x${viewport.height}`,
        response_ms: responseMs,
        horizontal_overflow: overflow,
        console_errors: consoleErrors,
        failed_requests: failedRequests,
        keyboard_disclosures: "PASS",
        accessibility_structure: "PASS",
        truth_state: "PASS",
        split_zone: "PASS",
        coastal_version: "PASS",
        capacity_not_evaluated: "PASS",
        static_comparison: staticComparison,
        screenshot,
      });
      await page.close();
    }
  }

  const edgePage = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const unknown = await edgePage.goto(`${baseUrl}/parcel-v2-preview/9999999999`, { waitUntil: "networkidle" });
  assert.equal(unknown?.status(), 200);
  assert.ok((await edgePage.locator("body").innerText()).includes("Preview data not available for this parcel"));
  assert.equal(await edgePage.locator("[data-preview-source]").count(), 0);
  const secondaryMissing = await edgePage.goto(`${baseUrl}/parcel-v2-preview/7600300100`, { waitUntil: "networkidle" });
  assert.equal(secondaryMissing?.status(), 200);
  const missingText = await edgePage.locator("body").innerText();
  assert.ok(missingText.includes("APN 7600300100"));
  assert.ok(missingText.includes("Source currently unavailable"));
  await edgePage.close();
} finally {
  await browser.close();
}

const timings = checks.map((check) => check.response_ms).sort((a, b) => a - b);
const report = {
  result: "PASS",
  route: "/parcel-v2-preview/[apn]",
  browser: "Playwright Chromium",
  checks: checks.length,
  canonical_parcels: parcels.map((parcel) => parcel.apn),
  viewports: viewports.map((viewport) => `${viewport.width}x${viewport.height}`),
  local_response_timing_ms: {
    minimum: timings[0],
    median: timings[Math.floor(timings.length / 2)],
    maximum: timings.at(-1),
  },
  static_vs_integrated: "PASS — exact visible main text for all three canonical parcels",
  unknown_apn: "PASS — explicit preview-unavailable message and no fallback",
  missing_secondary_layer: "PASS — APN identity retained while unavailable evidence stays unavailable",
  screenshots: checks.map((check) => check.screenshot).filter(Boolean),
  checks_detail: checks,
};
fs.writeFileSync(path.join(outputDir, "browser-review.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS ${checks.length} integrated browser checks; 6 screenshots; response ${report.local_response_timing_ms.minimum}-${report.local_response_timing_ms.maximum} ms`);
