#!/usr/bin/env node
// Local-only browser review. The entire Data API is an in-memory loopback fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const mode = process.argv[2] ?? "on";
assert.ok(["on", "off"].includes(mode));
const output = path.resolve(process.argv[3] ?? `/private/tmp/packet86-browser-${mode}.json`);
const repositoryRoot = process.cwd();
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-packet86-next-"));
for (const entry of fs.readdirSync(repositoryRoot)) {
  if ([".git", ".next"].includes(entry)) continue;
  if (["data", "node_modules"].includes(entry)) {
    fs.symlinkSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry));
  } else {
    fs.cpSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry), { recursive: true });
  }
}
const cases = JSON.parse(fs.readFileSync("data/san-diego-phase-a-indexing-activation-review-v0/canary.json", "utf8")).cases;
const addresses = Object.fromEntries(cases.map((item) => [item.apn, item.address]));
const parcel = (apn) => ({
  apn_norm: apn, address: Object.hasOwn(addresses, apn) ? addresses[apn] : `${Number(apn.slice(-4))} PACKET 86 FIXTURE ST`,
  city: "San Diego", state: "CA", zip: "92101", zone_name: "LEGACY-ZONE", base_zone: "LEGACY-ZONE",
  lot_area_sqft: 7000, lat: 32.75, lng: -117.19, refreshed_at: "2026-10-27T00:00:00Z",
});
const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4393");
  let data;
  if (req.method === "GET" && url.pathname === "/rest/v1/parcel_page_api_v2") {
    const exact = url.searchParams.get("apn_norm")?.replace(/^eq\./, "");
    data = exact ? [parcel(exact)] : [];
  } else if (req.method === "GET" && ["/rest/v1/trulot_permit_parcel_link_v1", "/rest/v1/parcel_permit_terminal_v2"].includes(url.pathname)) {
    data = [];
  } else if (req.method === "POST" && url.pathname === "/rest/v1/rpc/check_parcel_overlays") {
    data = { tpa: false, ctcac: false, sda: false };
  } else {
    res.writeHead(400); res.end(JSON.stringify({ message: `Unexpected fixture request ${req.method} ${url.pathname}` })); return;
  }
  res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data));
});

const waitFor = async (url) => {
  for (let i = 0; i < 120; i += 1) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next local review server did not start");
};

await new Promise((resolve) => api.listen(4393, "127.0.0.1", resolve));
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4393", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-not-a-credential",
  TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: mode === "on" ? "1" : "0", TRULOT_SD_INDEXING: "0",
};
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4394"], { cwd: reviewRoot, env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
const consoleErrors = [];
const reviewed = [];
let browser;
try {
  await waitFor("http://127.0.0.1:4394");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  for (const item of cases) {
    const response = await page.goto(`http://127.0.0.1:4394/parcel/san-diego/apn-${item.apn}`, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, item.apn);
    const text = await page.locator("body").innerText();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    assert.match(robots ?? "", /noindex/);
    assert.equal(canonical, item.canonical);
    assert.equal(jsonLd["@type"], "Place");
    assert.doesNotMatch(JSON.stringify(jsonLd), /token|secret|owner|mailing|geometry|private/i);
    if (mode === "on") {
      assert.match(text, new RegExp(item.zoningState.replaceAll("_", " "), "i"), item.apn);
      assert.match(text, /Coastal context/i);
      assert.match(text, new RegExp(item.coastalState.replaceAll("_", " "), "i"));
      assert.match(text, new RegExp(item.profileSupportState.replaceAll("_", " "), "i"));
      assert.doesNotMatch(text, /LEGACY-ZONE/);
      if (item.selectedZone) assert.match(text, new RegExp(item.selectedZone));
    } else {
      assert.doesNotMatch(text, /Mapping state/);
      assert.match(text, /LEGACY-ZONE/);
    }
    reviewed.push({ apn: item.apn, categories: item.categories, status: response?.status(), robots, canonical, placeJsonLd: true });
  }
  assert.deepEqual(consoleErrors, []);
  fs.writeFileSync(output, `${JSON.stringify({ mode, reviewed, consoleErrors, productionAccess: false, sitemapActivated: false }, null, 2)}\n`);
  console.log(JSON.stringify({ mode, reviewed: reviewed.length, output }));
} finally {
  if (!reviewed.length && logs) console.error(logs.slice(-4000));
  await browser?.close(); child.kill("SIGTERM"); api.close();
}
if (/https:\/\/[^\s]*supabase|service_role|eyJ[A-Za-z0-9_-]{20,}/.test(logs)) throw new Error("Sensitive or remote material appeared in local review logs");
