# Packet 13: offline parcel RS standards runtime V0

Decision: **RS_STANDARDS_RUNTIME_V0_READY**. This repository-only contract deterministically composes accepted Parcel V2 identity, Packet 9 Base Zoning V2 mapping evidence, and Packet 12 RS Base Standards V0. It records standards for review. It is not imported by the application, does not query a database or network, and does not evaluate parcel compliance or development capacity.

## Runtime input and result

The input requires a ten-digit City parcel APN, Parcel V2 acquisition identity, exact Packet 9 detailed mapping state and ordered zoning evidence, mapping provenance, an explicit Coastal context, and an ISO `as_of` date. `outside_coastal`, `inside_coastal`, and `unknown` are distinct values. Omission is invalid.

The result retains the Parcel Truth vocabulary where practical: truth `state` is `supported`, `partial`, `unknown`, `unavailable`, or `not_applicable`; `source_state` is `available`, `source_unavailable`, or `not_evaluated`; derivation is `deterministic_derived`. Domain resolution states add `RESOLVED`, `PARTIAL_RS_RESOLUTION`, `NOT_APPLICABLE`, `APPLICABILITY_UNRESOLVED`, `MAPPING_UNRESOLVED`, and `SOURCE_UNAVAILABLE` without replacing the source rule's `RECORDED`, `CONDITIONAL`, `UNKNOWN`, or `NOT_APPLICABLE` fact state.

Every result includes ordered zoning evidence, separate zone results, unresolved reasons, explicit exclusions, false compliance/capacity flags, and a SHA-256 fingerprint over canonical JSON. Each resolved rule is the complete Packet 12 record, including its value or expression, unit, condition, exception, unresolved dependency, version, source location, authoritative source hash, and record provenance hash.

## Mapping behavior

Packet 9's detailed evidence and canonical lineage terms are both retained:

| Detailed evidence state | Canonical state | V0 behavior |
|---|---|---|
| `SINGLE_ZONE` | `SINGLE_ZONE` | Resolve the exact zone when it is RS; otherwise return `NOT_APPLICABLE`. |
| `BOUNDARY_SLIVER` | `SINGLE_ZONE` | Follow Packet 9's principal-zone doctrine, resolve the principal RS zone, and preserve secondary sliver evidence without attaching a second standards set. |
| `MULTI_ZONE` | `SPLIT_ZONE` | Return one unblended result for every material zone. RS zones receive their own rule sets; non-RS zones remain visible as `UNSUPPORTED_BY_RS_V0`. |
| `UNMAPPED` | `UNMAPPED` | Return no definitive standards. |
| `INDETERMINATE` | `AMBIGUOUS` | Preserve every candidate zone and return no definitive standards set. |

The resolver never invents a primary standards set for a split or ambiguous parcel.

## Applicability and version refusal

Packet 12 seals only `outside-coastal-2026-09-30`. That exact Coastal/date pair can resolve. `inside_coastal` and `unknown` return `APPLICABILITY_UNRESOLVED` with no standards. Dates after September 30, 2026 require source reacquisition; earlier dates require a historical law version that V0 does not contain. Both fail closed.

## Conditional and unknown values

Rules pass through unchanged. The RS-1-7 `24/30` height expression remains unevaluated, setbacks retain their conditions and footnotes, and `varies` FAR remains an expression. No corner-lot, slope, lot-geometry, alley, or defensible-space assumption is supplied. The missing Table 131-04D footnote 8 remains one `UNKNOWN` rule in each of RS-1-8 through RS-1-14; no neighboring-zone inference fills it.

## Fixture and example evidence

Thirteen cases use real APNs and exact evidence from Packet 9's golden fixture or the sealed Base Zoning V2 lineage casebook. They cover single RS-1-7, another RS zone, RS-primary boundary sliver, RS+RS split, RS+non-RS split, unmapped, ambiguous/indeterminate, non-RS single-zone, inside Coastal, unknown Coastal, future date, historical date, and the RS-1-14 footnote-8 unknown.

Representative APNs include:

- `3506320400`: `SINGLE_ZONE` RS-1-7;
- `2748323700`: RS-1-14 principal plus RM-1-1 boundary sliver;
- `3013101500`: material RS-1-3 and RS-1-6 split;
- `4304211000`: material RS-1-7 and OR-1-1 split;
- `4303410600`: indeterminate RS-1-7 and CC-3-9 evidence;
- `7600360300`: unmapped.

`data/parcel-rs-standards-runtime-v0/example-result.json` is the full machine-readable Parcel Intelligence example for APN `3506320400`. It returns all RS-1-7 source records and lists later work as exclusions.

## Provenance and deterministic build

Fixture mapping provenance pins its source artifact path, SHA-256, acquisition identities, mapping method, and evidence commit. Each supported or conditional rule must resolve to Packet 12's version record and an authoritative source hash. A missing or corrupt standards bundle produces `SOURCE_UNAVAILABLE` and no standards.

`scripts/parcel-rs-standards-runtime-v0/build.py` regenerates fixture outputs, the example, decision, and integrity manifest. `test.py` compares a clean rebuild byte for byte and verifies every per-result and aggregate fingerprint.

## Explicit boundaries and extension points

V0 excludes parcel measurement, compliance, lot legality, unit counts, buildable area, FAR calculation, geometry-applied setbacks, Coastal standards, overlays, parking, ADU/JADU, SB 9, SB 79, Density Bonus, and Complete Communities. Future layers may add separately sourced Coastal profiles, historical versions, cross-reference evaluators, overlays/programs, and parcel facts. They must preserve the current fail-closed states and must not mutate this source contract in place.

No Parcel V1 file, production runtime module, migration, deployment configuration, or database object is changed by this packet.
