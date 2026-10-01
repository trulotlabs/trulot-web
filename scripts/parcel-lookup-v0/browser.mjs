#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outputDir = path.join(root, "data/parcel-lookup-v0/screenshots");
const baseUrl = process.env.PARCEL_LOOKUP_PREVIEW_URL ?? "http://127.0.0.1:3013/parcel-lookup-preview";
fs.mkdirSync(outputDir, { recursive: true });

const errors = [];
function observe(page, label) {
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${label}: pageerror: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`${label}: requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await desktop.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
const page = await desktop.newPage();
observe(page, "desktop");

await page.goto(baseUrl, { waitUntil: "networkidle" });
assert.equal(await page.locator("body").innerText().then((text) => text.trim().length > 0), true);
assert.equal(await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count(), 0);
await page.getByRole("heading", { name: "Start with an address or APN." }).waitFor();
await page.getByRole("combobox", { name: "Address or APN" }).waitFor();
await page.screenshot({ path: path.join(outputDir, "lookup-home-desktop.png"), fullPage: true });

const input = page.getByRole("combobox", { name: "Address or APN" });
const interactionStarted = performance.now();
await input.fill("639 N 67TH ST");
await page.getByRole("option").waitFor();
await input.press("ArrowDown");
await input.press("Enter");
await page.getByRole("heading", { name: "639 N 67TH ST" }).waitFor();
const canonicalElapsedMs = performance.now() - interactionStarted;
assert.match(page.url(), /\?apn=5442140600$/);
await page.getByText("APN 544-214-06-00", { exact: true }).waitFor();
await page.getByText(/RM-2-5/).waitFor();
assert.ok((await page.locator("svg[aria-label^='Parcel outline'] path").count()) > 0);
await page.getByRole("button", { name: "Copy APN" }).click();
await page.getByRole("button", { name: "Copied" }).waitFor();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "544-214-06-00");
await page.getByRole("button", { name: "View parcel details" }).click();
await page.getByText("Stable parcel identity").waitFor();
await page.screenshot({ path: path.join(outputDir, "639-n-67th-result-desktop.png"), fullPage: true });

await page.getByRole("button", { name: "New search" }).click();
await input.fill("1501 FRONT ST");
await page.getByText("2 parcel records share this address. Choose the correct APN or unit.").waitFor();
assert.equal(await page.getByRole("option").count(), 2);
await input.press("Escape");
assert.equal(await input.getAttribute("aria-expanded"), "false");
await input.fill("");
await input.fill("1501 FRONT ST");
await page.getByText("2 parcel records share this address. Choose the correct APN or unit.").waitFor();
await page.screenshot({ path: path.join(outputDir, "multiple-match-desktop.png"), fullPage: true });

await page.getByRole("button", { name: "Clear parcel search" }).click();
await input.fill("303-170-18-00");
await input.press("Enter");
await page.getByRole("heading", { name: "APN 303-170-18-00" }).waitFor();
await page.screenshot({ path: path.join(outputDir, "missing-address-apn-desktop.png"), fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobilePage = await mobile.newPage();
observe(mobilePage, "mobile");
await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
await mobilePage.getByRole("heading", { name: "Start with an address or APN." }).waitFor();
await mobilePage.screenshot({ path: path.join(outputDir, "lookup-home-mobile.png"), fullPage: true });
const mobileInput = mobilePage.getByRole("combobox", { name: "Address or APN" });
const apnFirstStarted = performance.now();
await mobileInput.fill("544-214-06-00");
await mobileInput.press("Enter");
await mobilePage.getByRole("heading", { name: "639 N 67TH ST" }).waitFor();
const apnFirstElapsedMs = performance.now() - apnFirstStarted;
await mobilePage.getByText("APN 544-214-06-00", { exact: true }).waitFor();
await mobilePage.screenshot({ path: path.join(outputDir, "639-n-67th-result-mobile.png"), fullPage: true });

await browser.close();
assert.deepEqual(errors, []);
const report = {
  browser: "Playwright Chromium",
  baseUrl,
  screenshots: fs.readdirSync(outputDir).filter((name) => name.endsWith(".png")).sort(),
  canonicalInteraction: {
    query: "639 N 67TH ST",
    inputActions: ["focus/fill", "ArrowDown", "Enter"],
    elapsedMs: Number(canonicalElapsedMs.toFixed(1)),
    hesitationObserved: false,
  },
  apnFirstInteraction: {
    query: "544-214-06-00",
    inputActions: ["focus/fill", "Enter"],
    elapsedMs: Number(apnFirstElapsedMs.toFixed(1)),
    exactResult: true,
  },
  checks: {
    pageContent: true,
    frameworkOverlayAbsent: true,
    consoleErrorsAbsent: true,
    keyboardSelection: true,
    escapeDismissal: true,
    copyApn: true,
    parcelOutline: true,
    ambiguousAddress: true,
    missingAddressApn: true,
    desktop: true,
    mobile: true,
  },
};
fs.writeFileSync(path.join(root, "data/parcel-lookup-v0/browser-result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS Parcel Lookup V0 browser\n${JSON.stringify(report, null, 2)}`);
