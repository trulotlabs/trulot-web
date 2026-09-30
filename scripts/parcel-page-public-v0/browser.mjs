#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const publicDir = path.join(root, "data/parcel-page-public-v0");
const detailDir = path.join(root, "data/parcel-page-v2-ui");
const publicScreens = path.join(publicDir, "screenshots");
const detailScreens = path.join(detailDir, "screenshots");
const fixtures = JSON.parse(fs.readFileSync(path.join(publicDir, "fixtures.json"), "utf8"));
const renderingByApn = new Map(fixtures.fixtures.map((fixture) => [fixture.apn, fixture.rendering]));
const parcels = [
  { apn: "6341302200", title: "1456 27th St", zoning: "RS-1-7", coastal: "Outside Coastal Overlay Zone", area: "21,841 sq ft", units: "1", summary: "This parcel is mapped RS-1-7" },
  { apn: "3506320400", title: "7553 Cabrillo Ave", zoning: "RS-1-7", coastal: "Inside Coastal Overlay Zone", area: "9,138 sq ft", units: "1", summary: "This parcel is mapped RS-1-7" },
  { apn: "4304211000", title: "4927 Whitehaven Way", zoning: "RS-1-7 64.3% + OR-1-1 35.7%", coastal: "Outside Coastal Overlay Zone", area: "17,147 sq ft", units: "1", summary: "This property has two mapped zoning areas" },
];
const viewports = [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }];

fs.mkdirSync(publicScreens, { recursive: true });
fs.mkdirSync(detailScreens, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const parcel of parcels) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
      const response = await page.goto(`${baseUrl}/parcel-public-preview/${parcel.apn}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("h1").textContent(), parcel.title);
      assert.deepEqual(await page.locator(".public-fact dd").allTextContents(), [parcel.zoning, parcel.coastal, parcel.area, parcel.units]);
      const bodyText = await page.locator("body").innerText();
      assert.ok(bodyText.includes(parcel.summary));
      assert.ok(bodyText.includes("See what's needed to evaluate this property"));
      assert.ok(bodyText.includes("View zoning details and sources"));
      assert.ok(bodyText.includes("Key base standards · RS-1-7"));
      assert.doesNotMatch(bodyText, /Artifact SHA-256|Record SHA-256|Base Zoning V2|Coastal Context V0|Packet 20|\bVerified\b/);
      assert.equal(await page.locator("meta[name=robots]").getAttribute("content"), "noindex, nofollow, noarchive, nosnippet");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.equal(await page.locator(".public-map").count(), parcel.apn === "4304211000" ? 1 : 0);

      const primary = page.locator(".public-primary > summary");
      await primary.focus();
      assert.equal(await primary.evaluate((node) => document.activeElement === node), true);
      await primary.press("Enter");
      assert.equal(await primary.evaluate((node) => Boolean(node.parentElement?.open)), true);
      assert.match(await page.locator(".public-primary__body").innerText(), /performs no calculation and does not request an evaluation/);
      await primary.press("Enter");

      const detail = await browser.newPage({ viewport });
      const detailErrors = [];
      detail.on("console", (message) => { if (message.type() === "error") detailErrors.push(message.text()); });
      detail.on("pageerror", (error) => detailErrors.push(error.message));
      const detailResponse = await detail.goto(`${baseUrl}/parcel-v2-preview/${parcel.apn}`, { waitUntil: "networkidle" });
      assert.equal(detailResponse?.status(), 200);
      const detailText = await detail.locator("body").innerText();
      for (const heading of ["Parcel orientation", "Base zoning standards", "Existing property facts", "What still needs to be confirmed", "Official sources"]) assert.ok(detailText.includes(heading), heading);
      assert.ok(detailText.includes("Lot-line designations not yet verified"));
      assert.ok(detailText.includes("Open technical evidence and provenance"));
      assert.doesNotMatch(detailText, /Artifact SHA-256|Record SHA-256|data\/parcel-|Packet 20|sealed RS|\bVerified\b/);
      assert.equal(await detail.locator(".back-link").getAttribute("href"), `/parcel-public-preview/${parcel.apn}`);
      assert.equal(await detail.locator(".technical-link").getAttribute("href"), `/parcel-v2-evidence/${parcel.apn}`);
      assert.equal(await detail.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(detailErrors, []);

      const technical = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      const technicalErrors = [];
      technical.on("console", (message) => { if (message.type() === "error") technicalErrors.push(message.text()); });
      technical.on("pageerror", (error) => technicalErrors.push(error.message));
      const technicalResponse = await technical.goto(`${baseUrl}/parcel-v2-evidence/${parcel.apn}`, { waitUntil: "networkidle" });
      assert.equal(technicalResponse?.status(), 200);
      const technicalText = await technical.locator("body").innerText();
      assert.match(technicalText, /Source layers and fingerprints/);
      assert.match(technicalText, /Artifact SHA-256/);
      assert.match(technicalText, /Record SHA-256/);
      assert.match(technicalText, /Front lot line/);
      assert.equal(await technical.locator("a").first().getAttribute("href"), `/parcel-v2-preview/${parcel.apn}`);
      assert.equal(await technical.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(technicalErrors, []);

      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await detail.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      const publicScreenshot = `data/parcel-page-public-v0/screenshots/${parcel.apn}-${viewport.name}.png`;
      const detailScreenshot = `data/parcel-page-v2-ui/screenshots/${parcel.apn}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(root, publicScreenshot), fullPage: true });
      await detail.screenshot({ path: path.join(root, detailScreenshot), fullPage: true });
      let technicalScreenshot = null;
      if (viewport.name === "desktop") {
        await technical.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        technicalScreenshot = `data/parcel-page-v2-ui/screenshots/${parcel.apn}-technical.png`;
        await technical.screenshot({ path: path.join(root, technicalScreenshot), fullPage: true });
      }

      let staticComparison = null;
      if (viewport.name === "desktop") {
        const staticPage = await browser.newPage({ viewport });
        await staticPage.goto(pathToFileURL(path.join(root, renderingByApn.get(parcel.apn))).href, { waitUntil: "load" });
        assert.equal(await page.locator("main").innerText(), await staticPage.locator("main").innerText());
        staticComparison = "exact visible Level 1 text match";
        await staticPage.close();
      }
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(failedRequests, []);
      checks.push({ apn: parcel.apn, viewport: `${viewport.width}x${viewport.height}`, public: "PASS", zoning_detail: "PASS", technical_evidence: "PASS", keyboard_disclosure: "PASS", noindex: "PASS", console_errors: [], horizontal_overflow: false, static_comparison: staticComparison, screenshots: [publicScreenshot, detailScreenshot, technicalScreenshot].filter(Boolean) });
      await technical.close();
      await detail.close();
      await page.close();
    }
  }

  const statePage = await browser.newPage({ viewport: { width: 900, height: 900 } });
  for (const [apn, expected] of [["4303410600", "zoning mapping requires review"], ["3082980200", "Coastal applicability requires review"], ["7600360300", "Base zoning has not yet been mapped"], ["5470501600", "Detailed standards for this zone are not yet"], ["3031701800", "Parcel 3031701800"]]) {
    const response = await statePage.goto(`${baseUrl}/parcel-public-preview/${apn}`, { waitUntil: "load" });
    assert.equal(response?.status(), 200);
    assert.ok((await statePage.locator("body").innerText()).includes(expected));
  }
  const unknownResponse = await statePage.goto(`${baseUrl}/parcel-public-preview/9999999999`, { waitUntil: "load" });
  assert.equal(unknownResponse?.status(), 200);
  assert.ok((await statePage.locator("body").innerText()).includes("Preview data not available for this parcel"));
  await statePage.close();

  const overviewImage = fs.readFileSync(path.join(publicScreens, "6341302200-mobile.png")).toString("base64");
  const detailImage = fs.readFileSync(path.join(detailScreens, "6341302200-mobile.png")).toString("base64");
  const comparison = await browser.newPage({ viewport: { width: 920, height: 1000 } });
  await comparison.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#e9eeeb;color:#14211b;font-family:Arial,sans-serif}h1{margin:0 0 22px;font-size:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}figure{margin:0;background:#fff;border-radius:14px;padding:12px;box-shadow:0 8px 28px #273d3420}figcaption{padding:4px 4px 12px;font-size:16px;font-weight:700}img{display:block;width:100%;height:auto;border:1px solid #dce4df}</style><h1>Parcel overview vs zoning details · 1456 27th St</h1><div class="grid"><figure><figcaption>Level 1 · Parcel overview</figcaption><img src="data:image/png;base64,${overviewImage}"></figure><figure><figcaption>Level 2 · Zoning details</figcaption><img src="data:image/png;base64,${detailImage}"></figure></div>`, { waitUntil: "load" });
  await comparison.screenshot({ path: path.join(publicScreens, "public-vs-expert-6341302200.png"), fullPage: true });
  await comparison.close();
} finally {
  await browser.close();
}

const report = { result: "PASS", routes: ["/parcel-public-preview/[apn]", "/parcel-v2-preview/[apn]", "/parcel-v2-evidence/[apn]"], checks: checks.length, viewports: viewports.map((item) => `${item.width}x${item.height}`), public_truth_vocabulary: "PASS", split_zone_map: "PASS", zoning_detail_conditions: "PASS", technical_provenance_separation: "PASS", navigation: "PASS", keyboard: "PASS", noindex: "PASS", console_errors: "PASS", horizontal_overflow: "PASS", scenario_states: "PASS", check_details: checks };
fs.writeFileSync(path.join(publicDir, "browser-review.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(detailDir, "browser-review.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS ${checks.length} three-level browser checks, five state cases, navigation, keyboard, noindex, and console review`);
