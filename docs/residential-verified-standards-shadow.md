# Verified residential standards shadow

Baseline verified exact and clean: branch `codex/trulot-parcel-v1-hardening`,
HEAD `b842211cea327801e3f22be36404b3540b6464db`. This packet does not authorize
public display. The Packet 15 production/dev/test/VERCEL/CI gate is unchanged.

## 1. Safe-subset verification

Exactly 97 SOURCE_VERIFIED records are eligible from the sealed Packet 12.5
integration-safe artifact. Interpretation-required, applicability-unresolved,
source-incomplete, conflicting-authority and other review states each count zero
within that subset. No authoritative evidence, seal or approved record was edited.

## 2. Residential-zone coverage

See `residential-verified-shadow-coverage.md` for the full 33-zone table. Every
zone has partial overall standards coverage; RX-1-2 has depth only. The other
32 zones each have width, corner width and depth. There are no real zero-safe
residential zones in the existing codified inventory; the zero-safe fixture is
explicitly synthetic `RS-TEST-UNRECOGNIZED`, not an invented City zoning district.

## 3. Generalized consumer

The Packet 13 bridge now has explicit residential mode selecting exact IDs from
the sealed subset. It still invokes the unchanged Packet 12.5 selector, checks
the separate integrity seal and rehashes all pinned public source files. Default
RS-1-7 mode and its restricted types/APIs remain available for prior tests.
The raw corpus is read only to enrich exact already-approved IDs with their
existing version/dependency metadata, never to derive eligibility.

Zone, type, numeric value/unit/operator, conditions, source evidence, source and
authority metadata, version, applicability, unresolved dependencies and false
project applicability are retained. No parcel dimensions or legal conclusions
are inferred. The new renderer compares every sealed record field, all enriched
metadata and the full generated TruthFact provenance to canonical expectations.
Missing/altered fields or an unexpected group member suppress the group.

## 4. Display model

The section is “Verified base-zone parameters”. Deterministic zone groups contain
only the “Lot dimensions — verified subset” category when it has rows. Within
that category, ordering is width, corner width, depth. Labels, values/units and
conditions are associated through semantic definition lists. There are no empty
headings for excluded categories and no completeness implied by a three-row set.
Only the relevant zone groups appear, not the global 97-record list; at most
three parameters per zone means no assumption-based ranking is necessary.

## 5. Applicability behavior

Existing gates retain the exact 2026-09-24 evaluation/authority observation,
outside-Coastal, new-application and outside-Miramar context. Missing/unsupported
required context suppresses values. Unknown corner status retains conditional
alternatives rather than selecting a parcel threshold. The native gate remains
OFF unless explicitly opted in with development/test and no VERCEL/CI context;
production always remains OFF, regardless of the flag.

## 6. Exclusion containment

All 717 excluded records were individually requested through the real consumer
with source rehashing active, and each was separately injected into the renderer.
None crossed the boundary. Malformed states, missing metadata, altered operator,
missing conditions and missing provenance are rejected. Source review states
were mutated only in memory to verify seal invalidation, never in stored evidence.

## 7. Split-zone behavior

Validated local V2 zoning supplies separate groups. The canonical V1 base code
must agree with its principal zone; the page's original identity/truth is not
rewritten. The shadow banner explicitly distinguishes local group evidence from
the existing parcel record. A second zone without an approved subset receives
an unavailable message, never values copied from the first. Unmapped,
indeterminate or unavailable zoning causes no standards resolution.

## 8. Coverage/incompleteness UX

Before any parameters:

> Only standards that passed source and applicability review are shown. This is
> not the complete set of zoning rules. Additional regulations may apply.
> Parcel-specific compliance has not been determined.

Corner rows visibly retain “Corner-lot condition; no parcel determination”.
All other approved conditions are empty; no conditional expression was flattened.

## 9. Browser review

Actual loopback Next.js canonical route and loader, using only the in-memory
fixture API: desktop review covered RS-1-7, RM-1-1, RT-1-1 and RX-1-2. Source table
and page references varied correctly; depth-only RX did not invent width values.

At 390×844, the RS-1-7/RM-1-1 split layout retained labels, value/unit association,
readable corner conditions, visible qualifier and distinct zone headings. Both
closed and expanded deep-disclosure measurements reported page width/scroll
width 390/390 and shadow width/scroll width 346/346: no horizontal overflow.
The RX-1-2/unknown split also showed one approved depth and an explicit unavailable
message, not copied standards. Heading order is page zoning h2, section h3,
zone h4, category h5. Keyboard Tab reached the disclosure; focus-visible outline
was a solid 2px outline; Enter expanded and collapsed native disclosures.

An early disclosure interaction produced one React hydration warning involving
the injected HTML. It did not recur on settled reloads and subsequent keyboard
interactions; the exact timing cause is not proven. Fresh unknown-Coastal and
final OFF-page sessions recorded no console warnings/errors. Do not interpret
this as an exhaustive no-warning claim under all pre-hydration interactions.
Two later inspection-tool timeouts were recovered using accessibility state.
The successful mobile measurements above preceded those tool timeouts.

Unknown-Coastal browser state showed no values. OFF browser state had zero shadow
elements and retained the existing placeholder. Automated tests separately prove
OFF markup equality with the Packet 15 baseline. Viewport override was reset;
both local servers were stopped. No production browser or database was used.

## 10. Provenance UX

Level 1: label/value/condition. Level 2: City source, table/page, reviewed context.
Level 3: acquired timestamp, exact rule/version/hash, recorded section and
unresolved dependency evidence. Raw hashes are never primary UI. Existing source
metadata records section 131.0431 across families; this is preserved at the deep
level, while primary citations use the accurate family-specific table/page.
No legal-source metadata correction is silently made in this display packet.

## 11. Drift behavior

Existing Packet 12.5 behavior is whole-bundle invalidation: every pinned public
artifact is rehashed. Any drift/missing file or changed authority observation
blocks selection, rather than retaining other apparently unaffected values.
This deliberately retains the safer established scope, not per-record drift
scoping invented by the UI. The test suite exercises actual source-byte drift
and missing files through the prior consumer and review suites.

## 12. Product coverage statistics

33 residential zones represented and 33 with approved records; zero real zones
without any. RS:42 records/14 zones; RM:36/12; RT:15/5; RX:4/2. Parameter counts:
32 minimum widths, 32 corner widths, 33 depths. Test exercise:97/97, 100% through
consumer/display/runtime. Forty-three deterministic cases include every zone and
10 split/unknown/unsupported cases. Density, area, frontage, setbacks, height,
FAR, coverage, open space and supplemental rules remain unavailable. The orphan
footnote, FAR intervals and compound expressions remain unresolved/excluded.

## 13. Independent review

The separate reviewer attempted 717 consumer requests, 717 renderer injections,
150 environment combinations and metadata/condition/provenance attacks. Initial
metadata and operator gaps were corrected before the final PASS. Both reasonable-
user questions (complete zoning rules? proof of compliance?) were answered NO.
See `data/residential-verified-shadow/independent-review.json`. Browser review was
performed by the main agent and is not claimed as independently repeated.

## 14. Tests

From repository root, using the previously acquired local source manifest:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-display-shadow/test-consumer.py /absolute/source-paths.json
node scripts/residential-display-shadow/test.mjs /absolute/source-paths.json /tmp/residential-shadow-review
node scripts/test-rs17-runtime-shadow.mjs /absolute/source-paths.json
node scripts/rs17-parameter-rehearsal/test.mjs /absolute/source-paths.json
node scripts/rs17-display-shadow/test.mjs /absolute/source-paths.json /tmp/prior-display
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-standards-review/test.py /absolute/source-paths.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/test.py
node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

All pass: generalized exhaustive checks,24 metadata/state mutations, Packet15
20 gate combinations, Packet13 22 fixtures, Packet14 15 fixtures, Packet12.5
29 tests, Packet12 35 tests, plus20 prior safe suites. Lint remains at three
pre-existing errors and six warnings in unchanged files; no new lint findings.

To reproduce browser review, copy a generated case (such as `RS-1-7.json` or
`split.json`) to an explicit temporary `active.json`, then run:

```sh
node scripts/rs17-local-review.mjs /absolute/active.json on
```

The local fixture API derives its base-zone label from that case. Replace the
active file with another generated case and reload. The gate variables keep
their Packet15 names intentionally; no second weaker enablement mechanism exists.
Use `off` for baseline inspection. Ctrl-C stops the two loopback services.

## 15. Diff

Generalized existing consumer/bridge, new strict presentation and exhaustive
tests, bounded runtime grouping, local review fixture support, documentation and
new validation evidence only. No source dataset, seal, SQL, package, environment,
deployment configuration, canonical routing or SEO changes.

## 16. Commit identity

Authorized single local commit: `Expand verified residential standards shadow`.
Exact commit/tree/parent are provided in the completion report. PASS remains
shadow-only and does not authorize production enablement or the next packet.

## 17. Preservation

Original checkout branch, HEAD, short status, staged/unstaged diffs, untracked
inventory and all57 tracked/nonignored untracked file hashes match the initial
snapshot. Production shadow remains OFF. No compliance/capacity calculation,
deployment or push. No new product packet begun.

RESIDENTIAL_VERIFIED_STANDARDS_SHADOW_PASS

READY_FOR_VERIFIED_STANDARDS_PRODUCT_DECISION
