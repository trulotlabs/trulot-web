#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const mode = process.argv[2] ?? "on";
assert.ok(["on", "off"].includes(mode));
const output = path.resolve(process.argv[3] ?? `/private/tmp/packet88-browser-${mode}.json`);
const repositoryRoot = process.cwd();
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-packet88-next-"));
for (const entry of fs.readdirSync(repositoryRoot)) {
  if ([".git", ".next"].includes(entry)) continue;
  if (["data", "node_modules"].includes(entry)) fs.symlinkSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry));
  else fs.cpSync(path.join(repositoryRoot, entry), path.join(reviewRoot, entry), { recursive: true });
}
const cases = JSON.parse(fs.readFileSync("data/san-diego-canonical-identity-performance-repair-v0/canonical-benchmark.json", "utf8")).cases;
const byApn = Object.fromEntries(cases.map((item) => [item.apn, item]));
const stageDelayMs = { exactParcel: 80, similarParcel: 90, permits: 120, overlays: 100 };
const counts = { exactParcel: 0, similarParcel: 0, permits: 0, overlays: 0 };
const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4491"); let data; let delay = 0;
  if (req.method === "GET" && url.pathname === "/rest/v1/parcel_page_api_v2") {
    const rawApn = url.searchParams.get("apn_norm"); const exact = rawApn?.startsWith("eq.") ? rawApn.slice(3) : null;
    if (exact) { counts.exactParcel++; delay = stageDelayMs.exactParcel; const item = byApn[exact]; data = item ? [{ apn_norm: exact, address: item.canonicalIdentity.canonicalDisplayAddress, city: "San Diego", state: "CA", situs_zip: "92101", zone_name: "LEGACY-ZONE", base_zone: "LEGACY-ZONE", lot_area_sqft: 7000, lat: 32.75, lng: -117.19, generated_at: "2026-10-27T00:00:00Z" }] : []; }
    else { counts.similarParcel++; delay = stageDelayMs.similarParcel; data = []; }
  } else if (req.method === "GET" && ["/rest/v1/trulot_permit_parcel_link_v1", "/rest/v1/parcel_permit_terminal_v2"].includes(url.pathname)) { counts.permits++; delay = stageDelayMs.permits; data = []; }
  else if (req.method === "POST" && url.pathname === "/rest/v1/rpc/check_parcel_overlays") { counts.overlays++; delay = stageDelayMs.overlays; data = { tpa: false, ctcac: false, sda: false }; }
  else { res.writeHead(400); res.end(JSON.stringify({ message: `Unexpected ${req.method} ${url.pathname}` })); return; }
  setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); }, delay);
});
const waitFor = async (url) => { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error("Next server timeout"); };
await new Promise((resolve) => api.listen(4491, "127.0.0.1", resolve));
const env = { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4491", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-not-a-credential", TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: mode === "on" ? "1" : "0", TRULOT_SD_INDEXING: "0" };
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4492"], { cwd: reviewRoot, env, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; child.stdout.on("data", (x) => logs += x); child.stderr.on("data", (x) => logs += x);
let browser; const reviewed = []; const consoleErrors = [];
try {
  await waitFor("http://127.0.0.1:4492"); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  for (const item of cases) {
    const before = { ...counts }; const started = performance.now();
    const response = await page.goto(item.canonicalIdentity.canonicalUrl.replace("https://trulot.com", "http://127.0.0.1:4492"), { waitUntil: "networkidle" });
    const elapsedMs = +(performance.now() - started).toFixed(1); assert.equal(response?.status(), 200, item.apn);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href"); const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    assert.equal(canonical, item.canonicalIdentity.canonicalUrl); assert.equal(ld.url, item.canonicalIdentity.canonicalUrl); assert.match(robots ?? "", /noindex/);
    const delta = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - before[key]])); assert.equal(delta.exactParcel, 1, `${item.apn} duplicate page loader`);
    reviewed.push({ apn: item.apn, categories: { stacked: item.stacked, zoningState: item.zoningState, coastalState: item.coastalState }, canonical, robots, elapsedMs, requests: delta });
  }
  for (const item of cases.filter((x) => ["5333641301", "5333641302"].includes(x.apn))) {
    const oldPath = new URL(item.oldCanonical).pathname; const response = await page.goto(`http://127.0.0.1:4492${oldPath}`, { waitUntil: "networkidle" }); assert.equal(response?.status(), 200); assert.equal(page.url(), item.canonicalIdentity.canonicalUrl.replace("https://trulot.com", "http://127.0.0.1:4492"));
  }
  assert.deepEqual(consoleErrors, []);
  fs.writeFileSync(output, `${JSON.stringify({ mode, reviewed, stageDelayMs, serialStageFloorMs: 390, parallelStageFloorMs: 200, redirectPair: "PASS", consoleErrors, productionAccess: false, indexing: "OFF", sitemap: "OFF" }, null, 2)}\n`);
  console.log(JSON.stringify({ mode, cases: reviewed.length, redirectPair: "PASS", output }));
} finally { await browser?.close(); child.kill("SIGTERM"); api.close(); if (!reviewed.length && logs) console.error(logs.slice(-5000)); }
if (/https:\/\/[^\s]*supabase|service_role|eyJ[A-Za-z0-9_-]{20,}/.test(logs)) throw new Error("Sensitive or remote material in logs");
