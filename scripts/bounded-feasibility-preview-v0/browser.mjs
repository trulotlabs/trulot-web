#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(root, "data/bounded-feasibility-preview-v0/review-evidence");
const base = process.env.FEASIBILITY_PREVIEW_URL ?? "http://127.0.0.1:3016/feasibility-preview";
const prohibited = /\b(buildable|can build|\d+\s+units allowed|fully compliant|zoning compliant|existing structure legal|qualifies for ADU bonus)\b/i;
const technical = /\b(not accepted|sealed|predicates|bounded|profile selected|retained boundary sliver)\b/i;

fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function openPage(mode, viewport, expectations) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${base}?view=${mode}`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${mode} status`);
  await page.locator("h1").waitFor();
  const text = await page.locator("body").innerText();
  assert.doesNotMatch(text, prohibited, `${mode} prohibited claim`);
  assert.doesNotMatch(text, technical, `${mode} technical product wording`);
  for (const value of expectations.present) assert.match(text, value, `${mode} missing ${value}`);
  for (const value of expectations.absent ?? []) assert.doesNotMatch(text, value, `${mode} leaked ${value}`);
  assert.equal(errors.length, 0, `${mode} console errors: ${errors.join(" | ")}`);
  assert.equal(await page.locator("main[data-preview-mode]").count(), 1);
  assert.equal(await page.locator("nav[aria-label='Preview examples']").count(), 1);

  const summaryLinks = page.locator("section[aria-labelledby='summary-heading'] a[href^='#']");
  for (let i = 0; i < await summaryLinks.count(); i += 1) {
    const target = await summaryLinks.nth(i).getAttribute("href");
    assert.equal(await page.locator(target).count(), 1, `${mode} summary target ${target}`);
  }
  const firstDetails = page.locator("details").first();
  if (await firstDetails.count()) {
    await firstDetails.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await firstDetails.getAttribute("open"), "", `${mode} keyboard disclosure`);
    await page.keyboard.press("Enter");
  }
  if (viewport.width <= 400) {
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(documentWidth <= viewport.width, `${mode} horizontal overflow: ${documentWidth}`);
    const h1 = await page.locator("h1").boundingBox();
    const overall = await page.getByText(/Partial evaluation|More evidence needed/, { exact: true }).first().boundingBox();
    const firstSummaryResult = await summaryLinks.first().boundingBox();
    assert.ok(h1 && h1.y < 844, `${mode} identity outside first viewport`);
    assert.ok(overall && overall.y < 844, `${mode} overall state outside first viewport`);
    assert.ok(firstSummaryResult && firstSummaryResult.y < 844, `${mode} first result outside first viewport`);
  }
  return { context, page };
}

async function capture(mode, viewport, file, expectations) {
  const { context, page } = await openPage(mode, viewport, expectations);
  await page.screenshot({ path: path.join(output, file), fullPage: true });
  await context.close();
}

async function captureExpanded(mode, viewport, file, cardId, expectations) {
  const { context, page } = await openPage(mode, viewport, expectations);
  const card = page.locator(`#${cardId}`);
  const details = card.locator("details");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, file), fullPage: true });
  await context.close();
}

try {
  const desktop = { width: 1440, height: 1000 };
  const mobile = { width: 390, height: 844 };
  const rs = { present: [/1456 27th St/, /Current calculated rear setback rule: 23\.5 ft/, /table base is 13 ft/, /22,096 sq ft/, /Not applicable/] };
  const rm = { present: [/639 N 67th St/, /Base zone: RM-2-5/, /Sustainable Development Area \(SDA\) geometry was detected/, /Verification is pending/, /Very High Fire Hazard Severity Zone \(VHFHSZ\)/, /Project height: not evaluated/], absent: [/PRJ-1111087/, /26 ADUs/, /5 ft 11-1\/2 in/, /FOURTH_CD/] };
  const privateView = { present: [/Private project analysis/, /Construction-document submittal — issuance not proven/, /January 29, 2024/, /Ordinance O-21618/, /Meets selected rule · this dimension/, /This dimension only/] };
  const blocked = { present: [/More evidence needed/, /Base height rule: 40 ft plus angled-plane conditions/, /This check cannot be completed yet/, /dimensioned height analysis/, /floor-area worksheet/] };

  await capture("rs", desktop, "public-rs-desktop.png", rs);
  await capture("rs", mobile, "public-rs-mobile.png", rs);
  await captureExpanded("rs", desktop, "public-rs-rear-setback-expanded.png", "RS17_REAR", rs);
  await capture("rm", desktop, "public-rm-desktop.png", rm);
  await capture("rm", mobile, "public-rm-mobile.png", rm);
  await captureExpanded("rm", desktop, "public-rm-sda-context-expanded.png", "RM25_SDA", rm);
  await capture("private", desktop, "private-project-desktop.png", privateView);
  await capture("private", mobile, "private-project-mobile.png", privateView);
  await captureExpanded("private", desktop, "private-project-status-expanded.png", "PRJ1111087_SIDE", privateView);
  await capture("blocked", desktop, "height-far-blocked-desktop.png", blocked);
} finally {
  await browser.close();
}

console.log("PASS Packet 60E browser: 10 responsive screenshots, summary links, keyboard disclosure, containment, no overflow or console errors");
