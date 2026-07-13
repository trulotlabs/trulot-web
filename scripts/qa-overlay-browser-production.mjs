import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = (process.env.TRULOT_PRODUCTION_BASE_URL ?? "").replace(/\/+$/, "");
const apns = (process.env.TRULOT_SMOKE_APNS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const outputDir = process.env.TRULOT_BROWSER_OUTPUT_DIR ?? "artifacts/overlay-browser-smoke";

assert.match(baseUrl, /^https:\/\//, "TRULOT_PRODUCTION_BASE_URL must be an HTTPS URL.");
assert.equal(apns.length, 3, "TRULOT_SMOKE_APNS must contain exactly three APNs.");
mkdirSync(outputDir, { recursive: true });

const targets = [
  ["homepage", "/"],
  ["search-ui", `/?q=${encodeURIComponent(apns[0])}`],
  ...apns.map((apn, index) => [`parcel-${index + 1}`, `/parcel/san-diego/${apn}`]),
];
const browser = await chromium.launch({ headless: true });
const receipts = [];

try {
  for (const [name, path] of targets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
    assert(response?.ok(), `${name} returned HTTP ${response?.status() ?? "no response"}.`);
    await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: true });
    receipts.push({ name, path, status: response.status(), consoleErrors, pageErrors });
    assert.equal(pageErrors.length, 0, `${name} raised browser page errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ result: "production browser smoke passed", receipts }, null, 2));
