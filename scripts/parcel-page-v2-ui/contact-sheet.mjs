#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const beforeCommit = "dd8cf49c540d8583100c31853ca4dc9ffee8ed28";
const apns = ["6341302200", "3506320400", "4304211000"];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "parcel-page-v2-contact-sheet-"));
try {
  const rows = [];
  for (const apn of apns) {
    const relative = `data/parcel-page-v2-ui/screenshots/${apn}-desktop.png`;
    const before = path.join(temp, `${apn}-before.png`);
    fs.writeFileSync(before, execFileSync("git", ["show", `${beforeCommit}:${relative}`], { cwd: root, maxBuffer: 10_000_000 }));
    rows.push(`<section><h2>APN ${apn}</h2><div class="pair"><figure><figcaption>Packet 19 — before</figcaption><img src="${pathToFileURL(before).href}"></figure><figure><figcaption>Packet 20 — after</figcaption><img src="${pathToFileURL(path.join(root, relative)).href}"></figure></div></section>`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf1f5;color:#172033;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{margin-bottom:24px}h1{font-size:30px;margin:0 0 6px}p{color:#5b6475;margin:0}section{background:white;border:1px solid #dbe1ea;border-radius:16px;padding:18px;margin:0 0 22px}h2{font-size:18px;margin:0 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;min-width:0}figcaption{font-weight:750;margin:0 0 8px}img{display:block;width:100%;height:650px;object-fit:cover;object-position:top;border:1px solid #ccd4df;border-radius:10px}</style></head><body><header><h1>Parcel Page V2 product UI</h1><p>Before/after comparison of the default desktop view. Each image is cropped from the top to emphasize the first-screen hierarchy and standards presentation.</p></header>${rows.join("")}</body></html>`;
  const file = path.join(temp, "contact-sheet.html");
  fs.writeFileSync(file, html);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.screenshot({ path: path.join(root, "data/parcel-page-v2-ui/screenshots/before-after-contact-sheet.png"), fullPage: true });
  } finally {
    await browser.close();
  }
  console.log("PASS created Packet 19 / Packet 20 before-after contact sheet");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
