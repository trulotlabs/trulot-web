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

fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

async function verify(mode, viewport, file, expectations) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const response = await page.goto(`${base}?view=${mode}`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${mode} status`);
  await page.locator("h1").waitFor();
  const text = await page.locator("body").innerText();
  assert.doesNotMatch(text, prohibited, `${mode} prohibited copy`);
  for (const value of expectations.present) assert.match(text, value, `${mode} missing ${value}`);
  for (const value of expectations.absent ?? []) assert.doesNotMatch(text, value, `${mode} leaked ${value}`);
  assert.equal(consoleErrors.length, 0, `${mode} console errors: ${consoleErrors.join(" | ")}`);
  assert.equal(await page.locator("main[data-preview-mode]").count(), 1);
  assert.equal(await page.locator("nav[aria-label='Preview examples']").count(), 1);
  assert.ok(await page.locator("h2").count() >= 2, `${mode} heading structure`);
  const firstDetails = page.locator("details").first();
  if (await firstDetails.count()) {
    const summary = firstDetails.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await firstDetails.getAttribute("open"), "", `${mode} keyboard disclosure`);
  }
  if (viewport.width <= 400) {
    const identityBox = await page.locator("h1").boundingBox();
    const overallBox = await page.getByText(/Partial evaluation|More evidence needed/, { exact: true }).first().boundingBox();
    const summaryBox = await page.getByRole("heading", { name: "What TruLot knows" }).boundingBox();
    assert.ok(identityBox && identityBox.y < 844, `${mode} mobile identity first viewport`);
    assert.ok(overallBox && overallBox.y < 844, `${mode} mobile overall state first viewport`);
    assert.ok(summaryBox && summaryBox.y < 844, `${mode} mobile summary cue first viewport`);
  }
  await page.screenshot({ path: path.join(output, file), fullPage: true });
  await context.close();
}

try {
  const desktop = { width: 1440, height: 1000 };
  const mobile = { width: 390, height: 844 };
  await verify("rs", desktop, "public-rs-desktop.png", { present: [/1456 27th St/, /Meets the 5,000 sq ft/, /This rule does not apply to this parcel/, /24 ft at applicable setback lines/] });
  await verify("rs", mobile, "public-rs-mobile.png", { present: [/1456 27th St/, /Partial evaluation/, /What TruLot knows/] });
  await verify("rm", desktop, "public-rm-desktop.png", { present: [/639 N 67th St/, /RM-2-5/, /1\.35/, /SDA context is mapped/, /Fire hazard context is mapped/], absent: [/PRJ-1111087/, /26 ADUs/, /5 ft 11-1\/2 in/, /FOURTH_CD/] });
  await verify("rm", mobile, "public-rm-mobile.png", { present: [/639 N 67th St/, /Partial evaluation/, /What TruLot knows/], absent: [/PRJ-1111087/] });
  await verify("private", desktop, "private-project-desktop.png", { present: [/Private project analysis/, /Not for public indexing/, /PRJ-1111087/, /5 ft 11-1\/2 in/] });
  await verify("private", mobile, "private-project-mobile.png", { present: [/Private project analysis/, /Not for public indexing/, /PRJ-1111087/] });
  await verify("blocked", desktop, "height-far-blocked-desktop.png", { present: [/More evidence needed/, /Code-compatible grade and top-elevation analysis/, /reconciled gross-floor-area worksheet/] });
} catch (error) {
  failures.push(error);
} finally {
  await browser.close();
}

if (failures.length) throw failures[0];
console.log("PASS Packet 60 browser: 7 responsive screenshots, deterministic copy, containment, keyboard disclosure, no console errors");
