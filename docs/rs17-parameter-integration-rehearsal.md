# RS-1-7 parameter integration rehearsal

Baseline verified clean at `/Users/ops/trulot-web-parcel`, branch
`codex/trulot-parcel-v1-hardening`, HEAD `793cbe612191ebaf8cd5bdbca1b876ee2bdd9d2b`,
tree `ead7e3107770c1884b26b1acda8f1b9a888efb1d`.

## 1. Approved source records

The unchanged committed integration-safe subset supplies every returned value.
Rule ID prefix: `sd-residential-2026-09-24-research-v1:RS-1-7:34:`.

| Parameter | Value | ID suffix / row | Source |
|---|---:|---:|---|
| lot_width_min | 50 ft | 7 | §131.0431, Table 131-04D, page 34, column 8 |
| corner_lot_width_min | 55 ft | 9 | Same; source condition `corner lot` |
| lot_depth_min | 95 ft | 10 | Same |

All are `SOURCE_VERIFIED`, scope `BASE_TABLE_PARAMETERS_ONLY`, profile
`outside-2026-09-24-reviewed-dimensions`. Source SHA-256:
`513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9`.
The bridge reads values, citations, original rule-set identity, and acquisition
metadata from committed evidence; it does not transcribe values from this document.

## 2. Consumer contract

`scripts/rs17-parameter-rehearsal/adapter.ts` defines typed inputs and outputs and
uses the existing `TruthFact`/`FactProvenance` vocabulary. Its composer calls the
existing offline `lookupParcelIntelligenceV2`, then adds a separate standards array.
Each parameter retains its zone, identifier, value/unit, review/version state,
conditions, citation, source hash, authority metadata, unresolved dependencies and
`project_applicability_determined: false`.

The Python bridge reuses the unchanged Packet 12.5 gate. It has no network or
database operation. The TypeScript process invocation is deliberately offline
rehearsal infrastructure, not a proposed production execution architecture.

## 3. Applicability gates

Only RS-1-7 and evaluation date 2026-09-24 are supported. Coastal must be outside;
application must be new; airport context must be outside the Miramar transition
exception. Missing or unsupported values produce no parameters.

User-authorized conditional catalogue behavior is explicit: corner, non-corner,
unknown and omitted lot context retain all three source parameters. The bridge
enumerates the existing gate's corner/non-corner branches as **rule conditions**,
not supplied parcel facts. It preserves actual lot context separately and emits
`branch_is_parcel_fact: false`. The existing review gate is not weakened or edited.
It does not choose 50 versus 55 feet for a parcel; even known lot context does not
create a compliance threshold. Invalid lot-context values fail closed.

## 4. Truth-state behavior

Parcel identity and zoning facts remain independently composed by the existing
offline adapters. Supported RS-1-7 zoning plus approved context yields supported,
conditionally derived parameter facts. Unknown Coastal yields unknown standards
while parcel/zoning remain supported. Source failure yields unavailable standards.
Missing context is never converted to `not_applicable`.

Absent/ambiguous parcel identity or unsupported zoning truth produces no standards.
The existing upstream truth and reason remain available in `parcelIntelligence`.
There is no aggregate parcel-compliance state.

## 5. Provenance behavior

Each record retains source URL/publisher, artifact/hash, page/table/row/column/bbox,
rule-set version and profile, acquisition timestamp, full reviewed authority
observation and approved context. `effectiveAt` is null rather than treating the
snapshot date as a wholesale enactment date; provision-specific metadata remains
attached. Dependency citations/hash and unresolved section references survive.
Broad dependency prose is not embedded, avoiding unintended extra numeric standards.

## 6. Excluded standards enforcement

The bridge allowlists three exact rule IDs and parameter identifiers. Requests for
any excluded identifier fail closed as a whole, including mixed requests. All 21
other RS-1-7 records are exercised by the test, covering density, area, frontage,
setbacks, height, FAR, coverage, paving, accessory, garage, spacing, third-story,
projections, supplemental, refuse, visibility and dwelling protection records.
The broad corpus is used only to attach provenance/dependencies to the selected IDs.

## 7. Split-zone behavior

Each supported upstream zone receives a separate standards entry. A synthetic
RS-1-7 + RM-1-1 fixture receives three parameters under RS-1-7 and none under RM-1-1.
No dominant-zone fallback, blending or parcel-wide conclusion occurs.

## 8. Source drift handling

Packet 12.5's `verify_source_files` and `select` enforce its existing review seal,
Packet 12 hashes, actual public-source file hashes and exact authority observation.
Missing files, changed bytes/hashes, changed effective metadata or certification
invalidate standards. No stale fallback or new authority approval is added.
Later evaluation dates remain unsupported; this is not live authority monitoring.

## 9. Golden fixtures

`scripts/rs17-parameter-rehearsal/fixtures.json` contains 22 cases, covering all 15
required scenarios plus future dates, omitted lot/application context, airport
unknown, actual byte changes and effective/certification metadata changes.
Queries are local injected fixture callbacks. Parcel APN `0000000001` and the
RS-1-7 assignments are synthetic contract fixtures, not findings about a real parcel.
Existing serving fixture shapes are reused with explicitly marked fixture receipts.

## 10. Tests

Run from the repository root with the existing dependencies:

```sh
node scripts/rs17-parameter-rehearsal/test.mjs /path/to/source-paths.json /tmp/rs17-results.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-standards-review/test.py /path/to/source-paths.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/test.py
node scripts/test-parcel-truth.mjs
node scripts/zoning-serving-v2/test-adapter.mjs
node scripts/parcel-serving-v2/test-adapter.mjs
node_modules/.bin/tsc --noEmit --incremental false
```

The source-path manifest maps Packet 12.5 source IDs to existing local public
artifacts. Tests neither download sources nor install dependencies. Missing evidence
fails, rather than silently skipping positive coverage. The optional final argument
writes a synthetic result artifact only to the explicit requested path.

Results: 22 golden fixtures, all 21 excluded records, parcel-absence isolation and
geometry-area independence pass. Changing upstream approximate geometry area to one
square foot does not change standards or produce a compliance judgment. Prior
29 closure tests, 35 Packet 12 tests, 20 safe regression suites (including Parcel
Truth), and TypeScript pass. Lint retains the baseline one error/six warnings.
Exact commands/results are in `data/rs17-parameter-rehearsal/validation.json`.

## 11. Integration-boundary review

A separate reviewer ran 22 gate cases and inspected the truth composer. The reviewer
identified dependency-text leakage of frontage/RX values; it was corrected to
citations/hash/reference-only evidence. The reviewer rechecked and passed the final
boundary: no capacity, legal-lot conclusion, geometry measurement/compliance,
excluded parameter, Coastal assumption or source evidence loss. No runtime file
imports this new rehearsal. The output qualifier explicitly states that parcel
applicability/compliance has not been determined.

## 12. Remaining blockers to parcel compliance

Legal-lot evidence (§113.0237), prescribed measurements (§113.0243), overlays/general
regulations (§131.0430), project/effectiveness facts, and the broader excluded rules
remain unresolved. Nothing in this packet establishes entitlement or buildability.
Inside/unknown Coastal remains unavailable for standards. This pass authorizes only
the next design consideration, not production display or compliance work.

## 13. Diff

Only new rehearsal scripts/fixtures, evidence artifacts and this report are added.
Existing application/runtime/UI, SQL, package state, prior standards data/gates and
prior tests remain unchanged.

## 14. Commit identity

One local commit: `Rehearse RS-1-7 standards integration`. Exact resulting SHA is
reported in the completion response. No push.

## 15. Preservation

Original checkout branch/HEAD/status/diffs/untracked inventory and all 57 recorded
file hashes match the pre-packet snapshot. No production mutation, Parcel V1 runtime
change, capacity calculation, parcel dimensional compliance calculation, deployment,
or push. The synthetic fixture results are not production parcel assertions.

RS_1_7_PARAMETER_INTEGRATION_REHEARSAL_PASS

READY_FOR_PARAMETER_DISPLAY_SHADOW_DESIGN
