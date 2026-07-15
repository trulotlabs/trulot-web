import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.TRULOT_SDA_BROWSER_BASE_URL ?? "http://127.0.0.1:3008").replace(/\/$/, "");
const outputDir = process.env.TRULOT_SDA_BROWSER_OUTPUT_DIR
  ?? path.join(os.tmpdir(), "trulot-sda-browser-output");
fs.mkdirSync(outputDir, { recursive: true });

const cases = [
  { name: "fixture-sda-observed-positive", apn: "1111111111", unaffectedText: "Transit Priority Area" },
  { name: "fixture-sda-observed-negative", apn: "2222222222", unaffectedText: "CTCAC mapped area" },
  { name: "fixture-unaffected-overlays-negative", apn: "3333333333", unaffectedText: "No TPA or CTCAC overlay" },
];

const browser = await chromium.launch({ headless: true });
const receipts = [];

try {
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(`${baseUrl}/parcel/san-diego/${testCase.apn}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    assert(response?.ok(), `${testCase.name} returned ${response?.status() ?? "no response"}`);
    const bodyText = await page.locator("body").innerText();
    assert.match(bodyText, /SDA source reconciliation pending/);
    assert.match(bodyText, /SDA status is temporarily unavailable/);
    assert.doesNotMatch(bodyText, /outside the current mapped SDA overlay/);
    assert.match(bodyText, new RegExp(testCase.unaffectedText));
    assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0, "Next.js error overlay is visible");
    assert.deepEqual(pageErrors, [], `${testCase.name} page errors`);
    assert.deepEqual(consoleErrors, [], `${testCase.name} console errors`);

    const screenshot = path.join(outputDir, `${testCase.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    receipts.push({
      ...testCase,
      finalUrl: page.url(),
      httpStatus: response.status(),
      screenshot,
      consoleErrors,
      pageErrors,
      reconciliationNotice: "visible",
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const receiptPath = path.join(outputDir, "browser-acceptance.json");
fs.writeFileSync(receiptPath, `${JSON.stringify({
  result: "SDA reconciliation browser acceptance passed",
  fixtureMode: true,
  productionAccessed: false,
  receipts,
}, null, 2)}\n`, "utf8");
console.log(fs.readFileSync(receiptPath, "utf8"));
