#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const component = read("app/feasibility-preview/FeasibilityPreview.tsx");
const css = read("app/feasibility-preview/feasibility-preview.module.css");
const sda = read("lib/sda-source-reconciliation.ts");
const parcelPage = read("lib/parcel-page-v1.ts");

// State taxonomy: facts, contexts, base rules, and comparisons remain distinct.
assert.match(component, /Base zone identified/);
assert.doesNotMatch(component, /RM25_ZONE[\s\S]{0,300}Meets base rule/);
assert.match(component, /Meets setback rule/);
assert.match(component, /This dimension only/);
assert.match(component, /Mapped context/);
assert.match(component, /Not applicable/);
assert.match(component, /Base rule · Conditional/);
assert.match(component, /Project comparison · Needs evidence/);

// Canonical SDA presentation carries the observation and unresolved product state together.
assert.match(component, /Mapped SDA geometry detected\. SDA verification is pending\./);
assert.match(component, /not used for a regulatory or eligibility conclusion/);
assert.match(sda, /source_reconciliation_pending/);
assert.match(sda, /authoritative: false/);
assert.match(parcelPage, /SDA_RECONCILIATION_LABEL/);

// Parcel-specific selected branch is foregrounded; exact arithmetic remains inspectable.
assert.match(component, /Current calculated rear setback rule: 23\.5 ft/);
assert.match(component, /235\.02 ft lot depth × 10% = 23\.502 ft/);
assert.match(component, /13 ft is the table base/);

// Summary items are complete and each is an actual in-page link.
assert.doesNotMatch(component, /items\.slice/);
assert.doesNotMatch(css, /nth-child\(n\+4\)/);
assert.match(component, /href={`#\$\{item\.target\}`}/);
for (const target of ["RS17_HEIGHT_PROFILE", "RS17_FAR_PROFILE", "RS17_EXISTING", "RM25_HEIGHT", "RM25_FAR", "RM25_SDA", "RM25_FIRE", "private-scope-status"]) {
  assert.match(component, new RegExp(target));
}

// Evidence exposes real citations, legal dates, comparison inputs, and private status.
assert.match(component, /San Diego Municipal Code Table 131-04D/);
assert.match(component, /effective April 24, 2025/);
assert.match(component, /effective May 6, 2023/);
assert.match(component, /Mapping receipt/);
assert.match(component, /Fourth construction-document submittal — issuance not proven/);
assert.match(component, /January 29, 2024/);
assert.match(component, /Ordinance O-21618/);
assert.doesNotMatch(component, /Version details remain attached/);

// Public parcel cards use educational comparison copy, not fake blocker actions.
assert.match(component, /Project height: not evaluated/);
assert.match(component, /A project-specific comparison would require/);
assert.doesNotMatch(component, /Add a survey|See what evidence is needed|Review source/);
assert.doesNotMatch(component, /<button/);

// Plain-language and precision checks.
assert.match(component, /Very High Fire Hazard Severity Zone \(VHFHSZ\)/);
assert.match(component, /22,096 sq ft Code-defined area/);
assert.doesNotMatch(component, /not accepted|numerator and denominator were not sealed|eligibility predicates|retained boundary sliver/);

// Public/private containment remains explicit in both copy and component structure.
assert.match(component, /Not for public indexing/);
assert.match(component, /no public cache/);
assert.match(component, /Private authorized evidence · excluded from public caching and indexing/);

console.log("PASS Packet 60B: state taxonomy, SDA reconciliation, rear-setback emphasis, summary integrity, evidence, actions, language, and containment");
