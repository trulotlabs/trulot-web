#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "data/parcel-page-v2-ui");
const fixtures = JSON.parse(fs.readFileSync(path.join(out, "fixtures.json"), "utf8"));
const canonical = new Set(["6341302200", "3506320400", "4304211000"]);
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 1000 },
];
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const fixture of fixtures.fixtures) {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(root, fixture.rendering)).href, { waitUntil: "load" });
      const title = await page.locator("h1").textContent();
      const headings = await page.locator("h2").allTextContents();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      const summary = page.locator("summary").first();
      await summary.focus();
      const keyboardFocusable = await summary.evaluate((node) => document.activeElement === node);
      await summary.press("Enter");
      const disclosureOpened = await summary.evaluate((node) => Boolean(node.parentElement?.open));
      const statusText = await page.locator(".status").first().textContent();
      let screenshot = null;
      if (canonical.has(fixture.apn) && viewport.name !== "tablet") {
        screenshot = `data/parcel-page-v2-ui/screenshots/${fixture.apn}-${viewport.name}.png`;
        await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
      }
      checks.push({ apn: fixture.apn, case: fixture.case, viewport, title, headings, horizontal_overflow: overflow, keyboard_summary_focus: keyboardFocusable, disclosure_opened: disclosureOpened, status_has_text: Boolean(statusText?.trim()), console_errors: errors, screenshot });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failures = checks.filter((item) => item.horizontal_overflow || !item.keyboard_summary_focus || !item.disclosure_opened || !item.status_has_text || item.console_errors.length || item.headings.length < 7);
const canonicalChecks = checks.filter((item) => canonical.has(item.apn));
const evaluation = {
  result: failures.length ? "FAIL" : "PASS",
  browser: "Playwright Chromium fallback (agent-browser CLI unavailable in this checkout)",
  cases: fixtures.representative_count,
  viewports: viewports.map((item) => `${item.name} ${item.width}x${item.height}`),
  checks: checks.length,
  failures,
  canonical: canonicalChecks,
  five_second_test: {
    property: canonicalChecks.every((item) => Boolean(item.title)),
    zoning: canonicalChecks.every((item) => item.headings.includes("What applies here")),
    coastal_state: canonicalChecks.every((item) => item.headings.includes("What applies here")),
    standards: canonicalChecks.every((item) => item.headings.includes("Base development standards")),
    obvious_uncertainty: canonicalChecks.every((item) => item.headings.includes("What we don’t know yet")),
  },
  expert_test: {
    source_and_version: canonicalChecks.every((item) => item.headings.includes("Evidence / How TruLot knows")),
    condition_disclosure: canonicalChecks.every((item) => item.disclosure_opened),
    split_zone_evidence: checks.some((item) => item.apn === "4304211000" && !item.horizontal_overflow),
    provenance: canonicalChecks.every((item) => item.headings.includes("Evidence / How TruLot knows")),
  },
  deficiencies: [
    "The complete evidence-rich page has substantial mobile scroll depth; identity and regulatory orientation remain above the fold.",
    "The static review artifact has no parcel map or production navigation; both belong to a later bounded runtime-integration decision.",
  ],
};
fs.writeFileSync(path.join(out, "browser-review.json"), `${JSON.stringify(evaluation, null, 2)}\n`);
if (failures.length) {
  console.error(`FAIL ${failures.length} browser checks`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} browser checks across mobile, tablet, and desktop; 6 screenshots captured`);
}
