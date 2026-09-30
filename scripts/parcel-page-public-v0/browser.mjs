#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3220";
const outputDir = path.join(root, "data/parcel-page-public-v0");
const screenshotDir = path.join(outputDir, "screenshots");
const fixtures = JSON.parse(fs.readFileSync(path.join(outputDir, "fixtures.json"), "utf8"));
const renderingByApn = new Map(fixtures.fixtures.map((fixture) => [fixture.apn, fixture.rendering]));
const parcels = [
  { apn: "6341302200", title: "1456 27TH ST", zoning: "RS-1-7 100%", coastal: "Outside Coastal Overlay Zone", area: "21,841 sq ft", units: "1", summary: "Residential zoning is verified." },
  { apn: "3506320400", title: "7553 CABRILLO AVE", zoning: "RS-1-7 100%", coastal: "Inside Coastal Overlay Zone", area: "9,138 sq ft", units: "1", summary: "Residential zoning is verified." },
  { apn: "4304211000", title: "4927 WHITEHAVEN WAY", zoning: "RS-1-7 64.3% + OR-1-1 35.7%", coastal: "Outside Coastal Overlay Zone", area: "17,147 sq ft", units: "1", summary: "This parcel has split zoning." },
];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
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
      const response = await page.goto(`${baseUrl}/parcel-public-preview/${parcel.apn}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("h1").textContent(), parcel.title);
      const factValues = await page.locator(".public-fact dd").allTextContents();
      assert.deepEqual(factValues, [parcel.zoning, parcel.coastal, parcel.area, parcel.units]);
      const bodyText = await page.locator("body").innerText();
      assert.ok(bodyText.includes(parcel.summary));
      assert.ok(bodyText.includes("Development capacity has not yet been evaluated."));
      assert.ok(bodyText.includes("Evaluate development potential"));
      assert.ok(bodyText.includes("View zoning details and sources"));
      assert.doesNotMatch(bodyText, /Artifact fingerprint|Record fingerprint|Legal lot width|Front lot line|Base Zoning V2|Coastal Context V0/);
      assert.equal(await page.locator("h1").count(), 1);
      assert.deepEqual(await page.locator("h2").allTextContents(), ["Property snapshot", "What this means"]);
      assert.equal(await page.locator("meta[name=robots]").getAttribute("content"), "noindex, nofollow, noarchive, nosnippet");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

      const primary = page.locator(".public-primary > summary");
      await primary.focus();
      assert.equal(await primary.evaluate((node) => document.activeElement === node), true);
      await primary.press("Enter");
      assert.equal(await primary.evaluate((node) => Boolean(node.parentElement?.open)), true);
      assert.ok((await page.locator(".public-primary__body").innerText()).includes("does not run a feasibility calculation"));
      await primary.press("Enter");
      await page.locator("h1").click();

      const secondary = page.locator(".public-secondary");
      assert.equal(await secondary.getAttribute("href"), `/parcel-v2-preview/${parcel.apn}`);
      await secondary.focus();
      assert.equal(await secondary.evaluate((node) => document.activeElement === node), true);
      const expertPage = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      const expertResponse = await expertPage.goto(`${baseUrl}/parcel-v2-preview/${parcel.apn}`, { waitUntil: "load" });
      assert.equal(expertResponse?.status(), 200);
      assert.ok((await expertPage.locator("body").innerText()).includes("Base development standards"));
      const publicTextLength = bodyText.length;
      const expertTextLength = (await expertPage.locator("body").innerText()).length;
      assert.ok(publicTextLength < expertTextLength * 0.35);
      await expertPage.close();

      let firstScreen = null;
      if (viewport.name === "mobile") {
        const selectors = ["h1", ".public-facts", ".public-meaning", ".public-capacity", ".public-primary > summary"];
        const bounds = [];
        for (const selector of selectors) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box, selector);
          bounds.push({ selector, bottom: Number((box.y + box.height).toFixed(1)) });
        }
        assert.ok(bounds.every((item) => item.bottom <= viewport.height), JSON.stringify(bounds));
        firstScreen = bounds;
      }

      let staticComparison = null;
      if (viewport.name === "desktop") {
        const integratedText = await page.locator("main").innerText();
        const staticPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await staticPage.goto(pathToFileURL(path.join(root, renderingByApn.get(parcel.apn))).href, { waitUntil: "load" });
        assert.equal(integratedText, await staticPage.locator("main").innerText());
        staticComparison = "exact visible main text match";
        await staticPage.close();
      }

      assert.deepEqual(consoleErrors.filter((message) => /hydration|did not match|server rendered/i.test(message)), []);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(failedRequests, []);
      const screenshot = `data/parcel-page-public-v0/screenshots/${parcel.apn}-${viewport.name}.png`;
      await page.locator("h1").click();
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
      checks.push({ apn: parcel.apn, viewport: `${viewport.width}x${viewport.height}`, five_second_test: "PASS", product_simplicity: "PASS", trust_path: "PASS", first_screen: firstScreen, console_errors: consoleErrors, failed_requests: failedRequests, horizontal_overflow: false, keyboard_primary_action: "PASS", static_comparison: staticComparison, screenshot });
      await page.close();
    }
  }

  const states = [
    ["4303410600", "The parcel’s zoning mapping requires review"],
    ["3082980200", "Coastal applicability requires review"],
    ["7600360300", "Base zoning has not yet been mapped"],
    ["5470501600", "Detailed standards for this zone are not yet available"],
    ["3031701800", "Parcel 3031701800"],
  ];
  const statePage = await browser.newPage({ viewport: { width: 900, height: 900 } });
  for (const [apn, expected] of states) {
    const response = await statePage.goto(`${baseUrl}/parcel-public-preview/${apn}`, { waitUntil: "load" });
    assert.equal(response?.status(), 200);
    assert.ok((await statePage.locator("body").innerText()).includes(expected));
  }
  const unknownResponse = await statePage.goto(`${baseUrl}/parcel-public-preview/9999999999`, { waitUntil: "load" });
  assert.equal(unknownResponse?.status(), 200);
  assert.ok((await statePage.locator("body").innerText()).includes("Preview data not available for this parcel"));
  assert.equal(await statePage.locator("[data-presentation=public-v0]").count(), 0);
  await statePage.close();

  const publicImage = fs.readFileSync(path.join(screenshotDir, "6341302200-mobile.png")).toString("base64");
  const expertCapture = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await expertCapture.goto(`${baseUrl}/parcel-v2-preview/6341302200`, { waitUntil: "networkidle" });
  await expertCapture.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const expertImage = (await expertCapture.screenshot({ fullPage: true })).toString("base64");
  await expertCapture.close();
  const comparison = await browser.newPage({ viewport: { width: 920, height: 1000 }, deviceScaleFactor: 1 });
  await comparison.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#e9eeeb;color:#14211b;font-family:Arial,sans-serif}h1{margin:0 0 22px;font-size:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}figure{margin:0;background:#fff;border-radius:14px;padding:12px;box-shadow:0 8px 28px #273d3420}figcaption{padding:4px 4px 12px;font-size:16px;font-weight:700}img{display:block;width:100%;height:auto;border:1px solid #dce4df}</style><h1>Public view vs Expert view · 1456 27TH ST</h1><div class="grid"><figure><figcaption>Public Parcel Page V0 · orientation</figcaption><img src="data:image/png;base64,${publicImage}"></figure><figure><figcaption>Expert Parcel Page V2 · inspection</figcaption><img src="data:image/png;base64,${expertImage}"></figure></div>`, { waitUntil: "load" });
  await comparison.screenshot({ path: path.join(screenshotDir, "public-vs-expert-6341302200.png"), fullPage: true });
  await comparison.close();
} finally {
  await browser.close();
}

const report = {
  result: "PASS",
  route: "/parcel-public-preview/[apn]",
  canonical_checks: checks.length,
  viewports: viewports.map((viewport) => `${viewport.width}x${viewport.height}`),
  five_second_test: "PASS",
  product_test: "PASS — four facts, two headings, one primary CTA; public visible text remains under 35% of expert text",
  trust_test: "PASS — secondary action opens the unchanged expert presentation",
  mobile_first_screen: "PASS — identity, four facts, meaning, capacity statement, and primary action end within 844px",
  scenario_states: "PASS — ambiguous, Coastal boundary, unmapped, non-RS, missing-address, and explicit unknown-APN failure",
  comparison_screenshot: "data/parcel-page-public-v0/screenshots/public-vs-expert-6341302200.png",
  checks,
};
fs.writeFileSync(path.join(outputDir, "browser-review.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS ${checks.length} public browser checks, five state cases, 6 screenshots, and public-vs-expert comparison`);
