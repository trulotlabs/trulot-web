import fs from "node:fs";
import path from "node:path";

const FORBIDDEN = [
  "can build",
  "will allow",
  "guaranteed",
  "best use",
  "underutilized",
  "hidden value",
  "maximize",
  "investment opportunity",
];

const ROOT = "/Users/ops/trulot-web";
const TARGETS = [
  "app/parcel",
  "lib/parcel-page-v1.ts",
  "docs/parcel-page-v1-field-mapping.md",
];

function collectFiles(targetPath, bucket) {
  const stats = fs.statSync(targetPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      collectFiles(path.join(targetPath, entry), bucket);
    }
    return;
  }
  if (/\.(ts|tsx|md|html|css|mjs)$/.test(targetPath)) {
    bucket.push(targetPath);
  }
}

const files = [];
for (const target of TARGETS) {
  const absolute = path.join(ROOT, target);
  if (fs.existsSync(absolute)) {
    collectFiles(absolute, files);
  }
}

const violations = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8").toLowerCase();
  for (const term of FORBIDDEN) {
    if (content.includes(term)) {
      violations.push(`${path.relative(ROOT, file)}: ${term}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Forbidden parcel-page copy found:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Copy guardrail check passed.");
