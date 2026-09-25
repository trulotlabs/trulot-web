# Packet 17 — high-value residential standards closure

Starting branch `codex/trulot-parcel-v1-hardening`, HEAD `ea25454ffafafe40d3ab564e5b12c03ddd884ad2`, tree `7f1dc9da78cabc21e25e969140c3194cf99d1e5d`; worktree clean before this packet. Observation date: 2026-09-24. This is an offline proposed expansion. The existing runtime, 97 approved dimension records, their seals, canonical ledger and authoritative sources are unchanged.

## Decision and coverage

The proposed combined subset has **213 records**: the existing 97 plus **116 new DISPLAY_SAFE_PARAMETER** records. It covers the same 33 residential zones. None of the new records is PARCEL_APPLICATION_SAFE. No public display or runtime integration is authorized by this decision.

| Family | Existing | New | Proposed total |
|---|---:|---:|---:|
|Lot width|32|0|32|
|Corner width|32|0|32|
|Lot depth|33|0|33|
|Density basis|0|33|33|
|Minimum lot area|0|33|33|
|Front setback|0|14|14|
|Interior-side setback|0|14|14|
|Street-side setback|0|0|0|
|Rear setback|0|0|0|
|Height|0|7|7|
|FAR|0|8|8|
|Conditional lot coverage|0|7|7|

The candidate denominator is 317 excluded base records, with 272 prior APPLICABILITY_UNRESOLVED and 45 prior INTERPRETATION_REQUIRED states. New approvals are 116/317 (36.59%); 201 candidates remain excluded. Fifty supplemental records are explicitly outside this priority denominator; they have not been silently approved. The full 814-record ledger therefore has 213 proposed-safe and 601 still-excluded records; the **actual runtime continues to use only97**.

Zone-category metrics are nonexclusive: dimensions-only falls from33 to0; dimensions+density33; dimensions+setbacks14; dimensions+height7; dimensions+FAR8; a broader set (density, lot area and another priority family)14. Seven RS1-1..7 zones also have conditional coverage. RS1-1 has all seven promoted priority families. RX/RT/RM currently gain density and minimum-area information only. Existing RX1-2 width/corner exclusions remain untouched.

## Canonical RS-1-7 closure

All approvals below concern the full qualified expression, never an unconditional parcel result.

| Priority | Decision | Meaning |
|---|---|---|
|Density|DISPLAY_SAFE_PARAMETER|Base one dwelling unit per legal lot; separately regulated uses/programs excluded; no count calculated|
|Lot area|DISPLAY_SAFE_PARAMETER|5,000sf base minimum-area standard, with legal-lot exception; not a legal-lot test|
|Front|DISPLAY_SAFE_PARAMETER|15ft base, distinct cul-de-sac and slope permissions, Fire Official condition; ordinary above-grade primary-building profile|
|Interior side|DISPLAY_SAFE_PARAMETER|4ft base,8% narrow-lot clause and optional reallocation preserved; explicit non-corner limited profile|
|Street side|REMAINS_EXCLUDED|Scope of “each side” in narrow-lot clause not resolved for street side|
|Rear|REMAINS_EXCLUDED|Adopted/current §131.0443(a)(2)(A) says Table141-04D; no correction established|
|Height|DISPLAY_SAFE_PARAMETER|24ft angled-plane origin/30ft zone maximum, width-angle/yard/grade conditions; no actual envelope or setback line selected|
|FAR|REMAINS_EXCLUDED|TableJ `4.001–5,000` and fractional interval gaps; no operative correction|
|Coverage|DISPLAY_SAFE_PARAMETER|50% maximum only when more than half the premises meets the complete steep-hillside definition; no slope determination|

The three existing width/corner/depth records remain approved through their original contract. RS-1-7 has nine proposed-safe records in total, six new and three preserved, out of its24 original records. The15 others remain excluded. This is information coverage, not development capacity.

## Root issues and retained gaps

Shared version and measurement issues were reviewed once and tied to exact IDs. Density/lot-area authority, RM density footnotes, legal-lot semantics, RX/RT minimum-area alley credit, RS conditional front/interior clauses, RS height envelope, direct RS FAR and steep-hillside coverage are closed only for their stated display scope.

Hard retained source/interpretation gaps include rear Table141-04D, TableJ punctuation/fractional boundaries, RT1-5 front10/15ft conflict, RM5-12 TablesI/K missing10-story/competing-height selection, RM historic FAR “shall not increase” baseline, street-side reach of the narrow-width clause, and fractional height-step treatment in RM5-12 setbacks. No older or planned-district table is treated as a correction to current base-zone law.

Measurement defects outside the claimed ordinary setback scope include the `front of street side` dedication sentence, adopted/codified alley-child-clause mismatch, and underground §113.0461 reference. The verified density/GFA pre-dedication sentence is independently preserved; it does not import those setback defects. Exclusions are explicit context boundaries, not assertions that a parcel avoids them.

Other potentially mechanical groups remain deferred, distinctly from those defects: RS8-14/RX rear alternatives; RX/RT/RM compound setbacks; RS8-14/RX/RT/RM heights; RX/RT/RM FAR; RT coverage. Their complete group-specific conditional contracts have not passed this bounded independent admission review. Detailed per-group source sections and exact per-record decisions are in the research artifacts and `decision.json`.

## Authority, predicates and contract

The dated profile is outside Coastal, new application, outside Miramar transition, conditional base-zone parameters only. O21618/O21836/O21934/O22109 outside effectiveness and their applicable amendment/no-change clauses were reviewed; corrected adopted instruments take priority over flattened strikeout text. Inside Coastal is NOT_APPROVED; unknown Coastal is BLOCKED. The gate rejects other dates, protected/unknown applications, unknown/transition airport context, and changed authority observations. This is a dated source review, not a live legal-monitoring service.

Controlled inputs include legal lot and lot/premises area, single/multiple/visitor use, community-plan geography, multi-zone premises, alley service/geometry, required dedication, legal line roles, corner status, lot width and frontage configuration, slope/elevation, Fire Official buffer, project/structure/garage/GFA characteristics, existing/proposed grade, overlays, documentary setbacks, and grandfathering. Every predicate has state UNRESOLVED and value null. No predicate is silently inferred from geometry or absence of data.

`scripts/high-value-residential-review/consumer.py` is an offline-only selector. It accepts exact approved zone identities, rehashes17 pinned source files and old seals, validates the exact new artifact seal, and returns whole qualified records. There is no value-only fallback, density heuristic, expression evaluator, geometry calculation, network call or product import. Scalar/formula/conditional/range/reference carriers and lossless qualification transport are covered by tests. Domain-specific expression objects preserve alternatives and operators without executing them. Extracting a scalar while discarding its scope would be a new, unapproved consumer.

The proposal does not replace the original97 consumer. Existing approvals are incorporated by exact IDs, not relabeled or regenerated. `assemble.py` defaults to read-only deterministic comparison. Its explicit `--write` mode regenerates only this packet's four derived artifacts and cannot create a seal or authorize a new rule. A future packet must independently decide and implement runtime transport.

## Review evidence

- `high-value-candidate-inventory.md` and `candidate-inventory.json`:317 exact IDs, prior states, root clusters, source coordinates, ancillary exclusions.
- `high-value-density-lot-area-research.md`:66 cells and density/minimum-area semantics, operative chain and exceptions.
- `high-value-setback-research.md` and `setback-proposals.json`:28 proposals plus104 exact exclusions.
- `high-value-height-far-coverage-research.md` and companion JSON:22 proposals,121 other decisions, complete pinned dependency-page text.
- `high-value-independent-adversarial-review.md` and companion JSON: logically separate source, contract and executable attack findings,116 exact cell checks.
- `authority-excerpts.json`, `authority-observation.json`, `predicate-taxonomy.json`, `proposed-safe-subset.json`, `decision.json`, `integrity.json`: source evidence and sealed proposed consumer contract.
- `validation-results.json`: reproducible command results and preservation evidence.

## Verification and preservation

The new semantic/drift suite has21 tests. Prior Packet12,12.5,13,14,15,16 standards suites, TypeScript and20 foundational regression commands were run offline. Exact results and commands are recorded in `validation-results.json`. Runtime tests retain20 gate combinations and hosting guards: defaultOFF, production alwaysOFF, only explicit local development/test opt-in with hosting guards. The disabled page matches the prior baseline. No browser review is claimed or needed for this offline-only packet.

Global lint retains its pre-existing three errors and six warnings, all outside this packet:

|File|Location|Rule / finding|
|---|---|---|
|scripts/rs17-display-shadow/test.mjs|14:2|error: @next/next/no-assign-module-variable (`module`)|
|scripts/rs17-parameter-rehearsal/test.mjs|15:3|error: @next/next/no-assign-module-variable (`module`)|
|supabase/functions/nearby-parcels/index.ts|125:67|error: @typescript-eslint/no-explicit-any|
|app/api/jobs-feed/route.ts|114:9|warning: unused `isEarlyReview`|
|lib/infer-phase.ts|163:10|warning: unused `descSignal`|
|lib/infer-phase.ts|227:9|warning: unused `signals`|
|lib/infer-phase.ts|237:9|warning: unused `primaryLabel`|
|lib/infer-phase.ts|261:9|warning: unused `isDemoDesc`|
|scripts/triage-overlay-integrity.mjs|76:10|warning: unused `parseRowsOutput`|

Original checkout `/Users/ops/trulot-web`: branch `codex/elevate-row-interview`, HEAD `8d82378e5b6a3cb2aba1153b96f025bc71a78d16`. Before/after branch,HEAD,status,tracked/staged diffs,untracked listing and57 file SHA256s match. Its dirty status remains:

```text
 M supabase/functions/nearby-parcels/index.ts
?? docs/sda-source-of-record-recovery-discovery-architecture-2026-07-15.md
?? supabase/.temp/
```

No runtime/public display, production/deployment configuration, SQL, source PDF, existing evidence seal or original-checkout file was changed. No capacity/compliance calculation, database action, push or deployment occurred. This packet authorizes one local review commit only, followed by a separate product decision.
