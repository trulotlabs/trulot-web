import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import {
  buildPublicParcelFeasibility,
  type PublicParcelFeasibilityInput,
} from "../lib/public-parcel-feasibility";
import {
  DevelopmentRulesSection,
  DevelopmentRulesSummary,
} from "../app/parcel/san-diego/[slug]/parcel-feasibility";

const input: PublicParcelFeasibilityInput = {
  jurisdictionId: "CITY_OF_SAN_DIEGO",
  parcelId: "6341302200",
  address: "1456 27TH ST",
  ruleProfileVersion: "SD_CURRENT_2026_07_15",
  baseZoneCode: "RS-1-7",
  coastalContext: "OUTSIDE_COASTAL",
  sourceFreshness: "September 2026",
  contexts: {},
  measurements: {
    LOT_AREA: { value: 22096.32, unit: "sq ft", sourceLabel: "SanGIS public parcel area", sourceDate: "September 2026", sourceUrl: null, availability: "AVAILABLE" },
    LOT_WIDTH: { value: 94, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: null, availability: "AVAILABLE" },
    LOT_DEPTH: { value: 235.02, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: null, availability: "AVAILABLE" },
    STREET_FRONTAGE: { value: 94, unit: "ft", sourceLabel: "Recorded public map", sourceDate: "Recorded public map", sourceUrl: null, availability: "AVAILABLE" },
  },
};

const feasibility = buildPublicParcelFeasibility(input);
assert.equal(feasibility.readiness, "READY");

const markup = renderToStaticMarkup(
  <main className="mx-auto max-w-[960px] px-5">
    <section id="identity" className="border-b border-slate-100 py-4">
      <h1 className="text-[26px] font-semibold">1456 27TH ST</h1>
      <p>APN 634-130-22-00</p>
    </section>
    <DevelopmentRulesSummary feasibility={feasibility} />
    <section id="facts" className="border-b border-slate-100 py-4">
      <h2>Property facts</h2><p>Lot area: 22,096 sq ft</p>
    </section>
    <section id="zoning" className="border-b border-slate-100 py-4">
      <h2>Zoning &amp; overlay context</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
        <DevelopmentRulesSection feasibility={feasibility} />
      </div>
    </section>
    <section id="downstream"><h2>Similar lots &amp; nearby precedents</h2></section>
  </main>,
);

const root = process.cwd();
const cssDirectory = path.join(root, ".next/static/css");
const css = fs.existsSync(cssDirectory)
  ? fs.readdirSync(cssDirectory).filter((file) => file.endsWith(".css")).map((file) => fs.readFileSync(path.join(cssDirectory, file), "utf8")).join("\n")
  : "body{font-family:Arial,sans-serif;margin:0}main{max-width:960px;margin:auto;padding:0 20px}section,aside{border-bottom:1px solid #e2e8f0;padding:16px 0}article{padding:10px;border-top:1px solid #f1f5f9}details{max-width:100%}";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`;

async function main() {
  const evidenceDirectory = "/private/tmp/trulot-packet62";
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
  for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.setContent(html);
    const identity = page.locator("#identity");
    const summary = page.getByTestId("development-rules-summary");
    const facts = page.locator("#facts");
    assert.ok((await identity.boundingBox())!.y < (await summary.boundingBox())!.y);
    assert.ok((await summary.boundingBox())!.y < (await facts.boundingBox())!.y);
    if (viewport.name === "mobile") {
      const summaryHeight = (await summary.boundingBox())!.height;
      assert.ok(summaryHeight <= 120, `mobile summary height was ${summaryHeight}px`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.equal(await page.getByText("Current calculated rear setback rule: 23.5 ft.", { exact: false }).count(), 1);
    const rearRule = page.locator('[data-rule-family="REAR_SETBACK"]');
    const disclosure = rearRule.getByText("Calculation & evidence", { exact: true });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    assert.equal(await rearRule.getByText(/235\.02 ft × 10% = 23\.502 ft/).first().isVisible(), true);
    const pageText = await page.locator("body").innerText();
    assert.doesNotMatch(pageText, /PRJ-1111087|PRIVATE_|private survey|project status/i);
    await page.screenshot({
      path: path.join(evidenceDirectory, `${viewport.name}-development-rules.png`),
      fullPage: true,
    });
    await page.close();
  }
  } finally {
    await browser.close();
  }

  console.log("PASS Packet 62 browser: compact mobile/desktop hierarchy, disclosure interaction, no overflow, and public-only output");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "Packet 62 browser check failed");
  process.exitCode = 1;
});
