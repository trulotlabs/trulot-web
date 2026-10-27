#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const mode = process.argv[2] ?? "on"; assert.ok(["on", "off"].includes(mode));
const output = path.resolve(process.argv[3] ?? `/private/tmp/packet90-browser-${mode}.json`);
const root = process.cwd(); const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trulot-packet90-next-"));
for (const entry of fs.readdirSync(root)) { if ([".git", ".next"].includes(entry)) continue; if (["data", "node_modules"].includes(entry)) fs.symlinkSync(path.join(root, entry), path.join(reviewRoot, entry)); else fs.cpSync(path.join(root, entry), path.join(reviewRoot, entry), { recursive: true }); }
const allCases = JSON.parse(fs.readFileSync("data/san-diego-canonical-normalization-latency-repair-v0/browser-benchmark.json", "utf8")).cases;
const cases = process.argv[4] ? allCases.slice(0, Number(process.argv[4])) : allCases;
const byApn = new Map(allCases.map((item) => [item.apn, item]));
const knownLossy = { "5442140600": "639 67TH ST", "2692411801": "14690 VIA FIESTA UNIT 1", "2692411802": "14690 VIA FIESTA UNIT 2", "2692411803": "14690 VIA FIESTA UNIT 3" };
const oldSlugs = { "5442140600": "544-214-06-00-639-67th-st", "2692411801": "269-241-18-01-14690-via-fiesta-unit-1", "2692411802": "269-241-18-02-14690-via-fiesta-unit-2", "2692411803": "269-241-18-03-14690-via-fiesta-unit-3" };
const stageDelayMs = { exactParcel: 80, similarParcel: 90, permits: 120, overlays: 100 };
const counts = { exactParcel: 0, similarParcel: 0, permits: 0, overlays: 0 };
const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4591"); let data; let delay = 0;
  if (req.method === "GET" && url.pathname === "/rest/v1/parcel_page_api_v2") {
    const raw = url.searchParams.get("apn_norm"); const exact = raw?.startsWith("eq.") ? raw.slice(3) : null;
    if (exact) { counts.exactParcel++; delay = stageDelayMs.exactParcel; const item = byApn.get(exact); const display = item?.identity?.canonicalDisplayAddress ?? item?.identity?.address?.displayAddress ?? null; data = item ? [{ apn_norm: exact, address: knownLossy[exact] ?? display, city: "San Diego", state: "CA", situs_zip: "92101", zone_name: "RS-1-7", base_zone: "RS-1-7", lot_area_sqft: 7000, lat: 32.75, lng: -117.19, generated_at: "2026-10-27T00:00:00Z" }] : []; }
    else { counts.similarParcel++; delay = stageDelayMs.similarParcel; data = []; }
  } else if (req.method === "GET" && ["/rest/v1/trulot_permit_parcel_link_v1", "/rest/v1/parcel_permit_terminal_v2"].includes(url.pathname)) { counts.permits++; delay = stageDelayMs.permits; data = []; }
  else if (req.method === "POST" && url.pathname === "/rest/v1/rpc/check_parcel_overlays") { counts.overlays++; delay = stageDelayMs.overlays; data = { tpa: false, ctcac: false, sda: false }; }
  else { res.writeHead(400); res.end(JSON.stringify({ message: `Unexpected ${req.method} ${url.pathname}` })); return; }
  setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); }, delay);
});
const waitFor = async (url) => { for (let i = 0; i < 160; i++) { try { const response = await fetch(url); if (response.status < 500) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("Next server timeout"); };
await new Promise((resolve) => api.listen(4591, "127.0.0.1", resolve));
const env = { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4591", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-not-a-credential", TRULOT_SD_PUBLIC_ZONING_SNAPSHOT: mode === "on" ? "1" : "0", TRULOT_SD_INDEXING: "0", TRULOT_PARCEL_SERVER_TIMING: "1" };
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4592"], { cwd: reviewRoot, env, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; child.stdout.on("data", (value) => logs += value); child.stderr.on("data", (value) => logs += value);
let browser; const reviewed = []; const consoleErrors = [];
try {
  await waitFor("http://127.0.0.1:4592"); browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  for (const item of cases) {
    const identity = item.identity; const before = { ...counts }; const started = performance.now(); const target = identity.canonicalUrl.replace("https://trulot.com", "http://127.0.0.1:4592");
    const response = await page.goto(target, { waitUntil: "domcontentloaded" }); const elapsedMs = +(performance.now() - started).toFixed(1); const ttfbMs = +(response?.request().timing().responseStart ?? elapsedMs).toFixed(1); assert.equal(response?.status(), 200, item.apn);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href"); const robots = await page.locator('meta[name="robots"]').getAttribute("content"); const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    assert.equal(canonical, identity.canonicalUrl, item.apn); assert.equal(ld.url, identity.canonicalUrl, item.apn); assert.match(robots ?? "", /noindex/);
    const delta = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - before[key]])); assert.equal(delta.exactParcel, 1, `${item.apn} core parcel invocation`); assert.ok(delta.permits <= 2, `${item.apn} permit reads`); assert.equal(delta.overlays, 1, `${item.apn} overlay reads`);
    reviewed.push({ apn: item.apn, categories: item.categories, canonical, ttfbMs, elapsedMs, requests: delta });
  }
  const redirects = [];
  for (const [apn, slug] of Object.entries(oldSlugs)) { const before = { ...counts }; const response = await page.goto(`http://127.0.0.1:4592/parcel/san-diego/${slug}`, { waitUntil: "domcontentloaded" }); assert.equal(response?.status(), 200); const expected = byApn.get(apn).identity.canonicalUrl.replace("https://trulot.com", "http://127.0.0.1:4592"); assert.equal(page.url(), expected); let redirectHops = 0; let request = response.request(); while (request.redirectedFrom()) { redirectHops += 1; request = request.redirectedFrom(); } assert.equal(redirectHops, 1, `${apn} redirect hops`); redirects.push({ apn, from: slug, to: page.url(), redirectHops, coreInvocations: counts.exactParcel - before.exactParcel }); }
  assert.deepEqual(consoleErrors, []);
  const timing = [...logs.matchAll(/\{"event":"trulot_parcel_server_timing"[^\n]+/g)].map((match) => { try { return JSON.parse(match[0]); } catch { return null; } }).filter(Boolean);
  const values = reviewed.map((row) => row.ttfbMs).sort((a, b) => a - b); const percentile = (p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
  const stageTimingMs = Object.fromEntries([...new Set(timing.map((row) => row.stage))].map((stage) => { const durations = timing.filter((row) => row.stage === stage).map((row) => row.durationMs).sort((a, b) => a - b); return [stage, { count: durations.length, median: durations[Math.ceil(durations.length * .5) - 1], p95: durations[Math.ceil(durations.length * .95) - 1], maximum: durations.at(-1) }]; }));
  const stageTimingByOperation = Object.fromEntries(["metadata", "page"].map((operation) => [operation, Object.fromEntries([...new Set(timing.filter((row) => row.operation === operation).map((row) => row.stage))].map((stage) => { const durations = timing.filter((row) => row.operation === operation && row.stage === stage).map((row) => row.durationMs).sort((a, b) => a - b); return [stage, { count: durations.length, median: durations[Math.ceil(durations.length * .5) - 1], p95: durations[Math.ceil(durations.length * .95) - 1], maximum: durations.at(-1) }]; }))]));
  const result = { mode, reviewed, redirects, performance: { cases: values.length, medianMs: percentile(.5), p75Ms: percentile(.75), p95Ms: percentile(.95), maximumMs: values.at(-1), coldMs: reviewed[0]?.elapsedMs }, stageDelayMs, stageTimingMs, stageTimingByOperation, consoleErrors, productionAccess: false, indexing: "OFF", sitemap: "OFF" };
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify({ mode, cases: reviewed.length, redirects: redirects.length, performance: result.performance, output }));
} finally { await browser?.close(); child.kill("SIGTERM"); api.close(); if (!reviewed.length && logs) console.error(logs.slice(-8000)); }
if (new RegExp(["https:\\/\\/[^\\s]*supabase", ["service", "_role"].join(""), "eyJ[A-Za-z0-9_-]{20,}"].join("|")).test(logs)) throw new Error("Sensitive or remote material in logs");
