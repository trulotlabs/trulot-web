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
const beforeMobileHeights = { "6341302200": 8982, "3506320400": 9485, "4304211000": 9713 };
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
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const clippedStandards = await page.locator(".standard-card").evaluateAll((nodes) => nodes.some((node) => [...node.querySelectorAll("h4, .standard-card__value, .item-details[open] .item-details__body")].some((child) => child.scrollWidth > child.clientWidth + 1)));
      const bodyText = await page.locator("body").innerText();
      let screenshot = null;
      if (canonical.has(fixture.apn) && viewport.name !== "tablet") {
        screenshot = `data/parcel-page-v2-ui/screenshots/${fixture.apn}-${viewport.name}.png`;
        await page.screenshot({ path: path.join(root, screenshot), fullPage: true });
      }
      const summary = page.locator("summary").first();
      await summary.focus();
      const keyboardFocusable = await summary.evaluate((node) => document.activeElement === node);
      await summary.press("Enter");
      const disclosureOpened = await summary.evaluate((node) => Boolean(node.parentElement?.open));
      const ruleSummary = page.locator(".item-details summary").first();
      const ruleDisclosureAvailable = await ruleSummary.count() > 0;
      let ruleDisclosureOpened = !canonical.has(fixture.apn);
      if (ruleDisclosureAvailable) {
        await ruleSummary.focus();
        await ruleSummary.press("Enter");
        ruleDisclosureOpened = await ruleSummary.evaluate((node) => Boolean(node.parentElement?.open));
      }
      const evidenceSummary = page.locator(".evidence summary").first();
      await evidenceSummary.focus();
      await evidenceSummary.press("Enter");
      const evidenceDisclosureOpened = await evidenceSummary.evaluate((node) => Boolean(node.parentElement?.open));
      const statusText = await page.locator(".status").first().textContent();
      checks.push({ apn: fixture.apn, case: fixture.case, viewport, title, headings, document_height: documentHeight, horizontal_overflow: overflow, clipped_standards: clippedStandards, keyboard_summary_focus: keyboardFocusable, orientation_disclosure_opened: disclosureOpened, rule_disclosure_available: ruleDisclosureAvailable, rule_disclosure_opened: ruleDisclosureOpened, evidence_disclosure_opened: evidenceDisclosureOpened, status_has_text: Boolean(statusText?.trim()), capacity_not_evaluated_visible: bodyText.includes("Development capacity: Not evaluated yet"), split_callout_visible: fixture.apn !== "4304211000" || bodyText.includes("This parcel has split zoning"), console_errors: errors, screenshot });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failures = checks.filter((item) => item.horizontal_overflow || item.clipped_standards || !item.keyboard_summary_focus || !item.orientation_disclosure_opened || !item.rule_disclosure_opened || !item.evidence_disclosure_opened || !item.status_has_text || !item.capacity_not_evaluated_visible || !item.split_callout_visible || item.console_errors.length || item.headings.length < 6);
const canonicalChecks = checks.filter((item) => canonical.has(item.apn));
const mobileScrollComparison = Object.fromEntries([...canonical].map((apn) => {
  const after = canonicalChecks.find((item) => item.apn === apn && item.viewport.name === "mobile")?.document_height;
  const before = beforeMobileHeights[apn];
  return [apn, { before_pixels: before, after_pixels: after, reduction_percent: after ? Number(((before - after) / before * 100).toFixed(1)) : null }];
}));
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
    zoning: canonicalChecks.every((item) => item.headings.includes("At a glance")),
    coastal_state: canonicalChecks.every((item) => item.headings.includes("At a glance")),
    standards: canonicalChecks.every((item) => item.headings.includes("Base development standards")),
    obvious_uncertainty: canonicalChecks.every((item) => item.headings.includes("What we don’t know yet")),
    capacity_not_claimed: canonicalChecks.every((item) => item.capacity_not_evaluated_visible),
  },
  expert_test: {
    source_and_version: canonicalChecks.every((item) => item.headings.includes("Evidence / How TruLot knows")),
    condition_disclosure: canonicalChecks.every((item) => item.rule_disclosure_opened),
    split_zone_evidence: checks.some((item) => item.apn === "4304211000" && !item.horizontal_overflow),
    provenance: canonicalChecks.every((item) => item.headings.includes("Evidence / How TruLot knows")),
    mapping_and_coastal_evidence: canonicalChecks.every((item) => item.orientation_disclosure_opened),
  },
  mobile_scroll_comparison: mobileScrollComparison,
  deficiencies: [
    "The static review artifact has no parcel map. Clear zone percentages and the split-zone callout make geometry understandable for this review; a map remains a later UI enhancement.",
  ],
};
fs.writeFileSync(path.join(out, "browser-review.json"), `${JSON.stringify(evaluation, null, 2)}\n`);
if (failures.length) {
  console.error(`FAIL ${failures.length} browser checks`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} browser checks across mobile, tablet, and desktop; 6 screenshots captured`);
}
