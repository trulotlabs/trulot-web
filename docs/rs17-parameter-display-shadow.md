# RS-1-7 parameter display shadow

Verified clean baseline: `/Users/ops/trulot-web-parcel`, branch
`codex/trulot-parcel-v1-hardening`, HEAD `0e25cca4dd70d0b4e41b729f716ddc58fe99fbe6`,
tree `0ca2270b4e5949e1d89ab0872248c8fdef5e20b4`.

This is an isolated offline presentation rehearsal. No production route, UI,
consumer, standards gate, zoning source or approved evidence was modified.

## 1. Display contract

`scripts/rs17-display-shadow/display.ts` consumes the unchanged Packet 13 result.
The separate presentation model carries zone, human-readable label, value/unit,
condition, source/review/applicability states, false project applicability, and
structured citation details. It does not resolve law or perform measurements.

Labels are Minimum lot width, Minimum corner-lot width and Minimum lot depth.
The approved records carry operator MIN and belong to the source's minimum lot
dimensions group. The display confirms exact IDs, values, units, hash, coordinates,
conditions, profile and source identity against the existing approved subset.
No value is supplied as a fallback. A missing/altered member blocks the entire card.

## 2. Qualifier/copy

Before every displayed parameter set:

> These are source-verified base-zone parameters. TruLot has not determined whether
> this parcel satisfies them or whether additional regulations apply.

The corner row visibly says “Corner-lot condition; no parcel determination”.
The primary state reads “Source verified · Conditional · Parcel applicability not
yet determined”. Both widths remain visible for unknown, corner and non-corner
contexts; no applicable parcel threshold is selected. Empty states do not claim
their unavailable evidence is verified.

## 3. Applicability behavior

The unchanged Packet 13 consumer enforces the approved September 24, 2026 outside-
Coastal, new-application and airport context. Unknown/inside Coastal, unsupported
date or missing application context shows an unresolved-version explanation with
no values. Source drift shows a distinct source-unavailable/reverification message.

Unsupported identity, unavailable zoning, UNMAPPED and INDETERMINATE zoning cause
no standards resolution. The surrounding fixture's zoning label also follows truth;
it does not assert RS-1-7 merely because the test input requested that zone.

## 4. Provenance disclosure

Primary view: standard, value, visible condition and plain-language verification/
applicability statement. Native “Why TruLot says this” disclosure exposes City of
San Diego, §131.0431, Table 131-04D, page 34, source link and reviewed context.
Nested “Source evidence details” exposes each evidence/rule reference, profile,
acquisition timestamp, artifact hash and dependency reference. Hashes, rule IDs
and internal review enums do not appear as primary UI.

Native details/summary, scoped table headers, caption, heading associations,
textual states and focus-visible CSS provide semantic accessibility. Browser/mobile
layout and actual keyboard interaction were not verified; see section 8.

## 5. Split-zone behavior

Groups are separate and deterministically ordered by zone. RS-1-7 receives its three
parameters; RM-1-1 explicitly says its parameters are not included in this preview.
No blending, transfer or parcel-wide standards summary occurs.

## 6. Golden display states

Fifteen generated states cover supported, unknown corner, corner, unknown Coastal,
inside Coastal, source drift, zoning unavailable, unmapped, indeterminate, split
zones, other residential zone, unknown zone, identity unavailable, unsupported
historical date and missing application context.

All assignments are synthetic offline fixtures. HTML is committed under
`data/rs17-display-shadow/renderings/`; display models are in `results.json`.
The focused mock places the section below zoning identity and before an explicitly
unevaluated development-pathways placeholder.

An additional comparison renders the real current Parcel V1 page through its existing
mocked fixture. The proposed section is inserted after the base-zoning card and before
the current program cards. Removing only that insertion restores the current markup
byte-for-byte. Both comparison files retain existing route information, including
its current published-standards placeholder. Their banners identify offline comparison.
The generic offline stylesheet is for structural review, not a claim of pixel-perfect
production styling. No runtime output is changed by this string-only insertion.

## 7. Excluded-standard enforcement

Only the three known presentation keys can render; exact approved record identity is
also checked. Tests inject all 21 excluded RS-1-7 records and confirm none is rendered.
Changed values, hash, corner condition or unsafe source URL block the card. Reordered
input retains deterministic display order. No density, area, setbacks, height, FAR,
coverage or other extracted standards are surfaced by this section.

## 8. UX/trust review

A separate reviewer assessed whether a reasonable user could interpret the screen as
a compliance/buildability decision. One defect was found: the initial golden-page
scaffold asserted RS-1-7 even when zoning/identity was unresolved. That heading now
derives from consumer truth, with a regression covering all four affected states.
The independent static copy/semantic review passes after the correction.

**Visual-verification limitation:** the agent-browser CLI was unavailable. The desktop
browser rejected local-file preview under its URL security policy and expressly
prohibited workarounds. No alternative browser/server bypass was attempted. Generated
HTML, CSS and semantic structure were inspected; no screenshot, actual browser layout,
mobile clipping or interactive keyboard verification is claimed. Those checks remain
required for any later display implementation. This packet's pass covers only the
offline design and its tested state/provenance boundaries.

## 9. Tests

From the repository root:

```sh
node scripts/rs17-display-shadow/test.mjs /path/to/source-paths.json /tmp/rs17-display-shadow
node scripts/rs17-parameter-rehearsal/test.mjs /path/to/source-paths.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-standards-review/test.py /path/to/source-paths.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/test.py
node_modules/.bin/tsc --noEmit --incremental false
```

Use the same existing public-source file manifest as Packet 13. No installation,
network acquisition, credentials or production query is required. Output is written
only to the explicit external fixture directory. Results: 15 display states, 21
excluded-record injections, four evidence mutations, deterministic order and exact
current/shadow preservation pass. Packet 13's 22 fixtures, 21 exclusions and isolation
checks pass; Packet 12.5's 29 tests, Packet 12's 35 tests and 20 prior safe suites pass.
TypeScript passes. Lint retains the baseline one error and six warnings.
Recorded commands/results: `data/rs17-display-shadow/validation.json`.

## 10. Diff

New isolated presentation/test scripts, offline rendered fixtures, evidence/results
and this report only. No edits under `app`, `lib`, SQL, package state, prior consumer
or prior standards artifacts. No production import of the new display module.

## 11. Commit identity

One local commit: `Design RS-1-7 parameter display shadow`. Exact resulting SHA is
reported in the completion response. No push. The next runtime-shadow design is not
implemented by this packet, and this pass does not authorize production display.

## 12. Preservation

Original checkout branch, HEAD, status, diffs, untracked inventory and all 57 tracked/
nonignored untracked file hashes match the initial snapshot. No production runtime
change, parcel compliance calculation, geometry-based corner inference, capacity
calculation, deployment or push.

RS_1_7_PARAMETER_DISPLAY_SHADOW_PASS

READY_FOR_BOUNDED_STANDARDS_RUNTIME_SHADOW
