# Parcel V1/V2 identity exception resolution

Packet 8 preserves the Packet 7 comparison exactly and refines its exception categories from sealed local evidence. Parcel Base V2 remains the clean current SanGIS layer. No legacy address, APN relationship, or quarantined geometry is copied into it.

Machine-readable evidence is in [`data/parcel-v1-v2-identity-exceptions/report.json`](../data/parcel-v1-v2-identity-exceptions/report.json). The proposed offline contract is [`data/parcel-v1-v2-identity-exceptions/identity-exception.schema.json`](../data/parcel-v1-v2-identity-exceptions/identity-exception.schema.json).

## Evidence boundary

The analysis used the live V1 presentation export, historical V1 parcel lineage and geometry, historical Regrid address export, the sealed SanGIS accepted/quarantine artifacts, and the committed Packet 7 report. Every source hash is recorded in the report. The V1 address lineage is `REGRID_CA_SAN_DIEGO_2026`; it is historical presentation evidence, not current SanGIS situs authority.

Two bounded read-only production centroid aggregate queries timed out. They performed no mutation and yielded no evidence. Packet 7's committed live stored-coordinate count of 3,889 remains canonical. The Packet 8 resolver independently recomputes historical and current geometry centroids offline.

## Quarantine resolution

| Class | Count | Doctrine |
| --- | ---: | --- |
| A — identity recoverable without geometry | 59 | May later be discoverable through an identity-only exception with geometry explicitly unavailable. |
| B — duplicate/source conflict | 1 | Block automatic serving. |
| C — replacement represented elsewhere | 0 | No row met the strict accepted-same-parcel-ID rule. |
| D — cannot safely serve | 12 | Block automatic serving. |

No row moved out of quarantine and no geometry was fabricated.

## Missing V2 addresses

| Cause | Count | Share |
| --- | ---: | ---: |
| Current source street without number | 9,218 | 90.5946% |
| Stack sibling has current address | 957 | 9.4054% |

All 10,175 current rows retain a SanGIS street component but have no usable situs number. V1 shows a leading-zero historical address for 10,158 rows, and three more values exactly repeat a numeric current street name. Those 10,161 values are street locators, not valid presentation addresses. Only 14 V1 addresses have a positive house number, do not merely repeat a numeric street name, and pass the bounded historical fallback rule.

Future presentation/search behavior may use the current SanGIS street with an explicit “number unavailable” state. The 14 validated V1 addresses may be retained only as `fallback_presentation`, labelled historical, with Regrid provenance. A leading-zero historical value must never be presented as current situs.

## Address differences

Packet 7's 96,745 material strings are refined without fuzzy matching:

| Difference class | Count |
| --- | ---: |
| Unit display omission confirmed by current component | 81,567 |
| Street-name change | 4,491 |
| Street-name abbreviation | 4,690 |
| Directional change | 2,918 |
| House-number change | 957 |
| Completely different situs | 869 |
| Suffix change | 667 |
| Suffix standardization | 285 |
| Unit component conflict | 258 |
| Directional formatting | 35 |
| Historical unit only | 6 |
| Punctuation/spacing | 2 |

Safe formatting or current-component explanations account for 86,579. The conservative conflict set is 10,166. It includes every suffix/directional/house-number/street-name/situs change not explained by the explicit mapping plus 258 unit conflicts and six historical-only units. The report contains a deterministic 50-row sample spanning every conflict class. A separate locality diagnostic finds 116 shared rows whose V1 city label is not exactly `San Diego`; it does not overlap or rewrite the address partition.

## Parcel-ID changes

| Class | Count |
| --- | ---: |
| Stack membership change | 286 |
| Source-ID rekey with diagnostic geometry difference | 41 |
| Source-ID rekey with stable geometry | 5 |
| Possible split/consolidation pattern | 1 |
| Source-ID rekey with material geometry change | 1 |

APN stays stable for all 334 rows. These labels are evidence patterns, not legal subdivision conclusions. The report records old/current parcel IDs, group sizes, centroid distance, area difference, and related APNs.

## Centroid triage

Packet 7 recorded 3,889 live V1 stored coordinates more than 250 feet from current V2 geometry centroids. A like-for-like geometry-centroid recomputation leaves two rows over 250 feet:

| APN | Shift | Area difference | Parcel-ID state | Geometry/stack |
| --- | ---: | ---: | --- | --- |
| `3487300501` | 258.613 ft | 86.1407% | different; possible group relationship | Polygon; repeated stack |
| `4375706100` | 519.354 ft | 78.3175% | different; source-ID rekey | Polygon; single |

Both meet the combined high-risk rule: geometry-centroid shift over 250 feet, geometry area difference over 10%, and a parcel-ID difference or conservative address conflict. Their addresses do not conflict. The 3,887-row reduction is evidence that the live stored-coordinate flag primarily reflects V1 coordinate methodology/lineage, while these two geometry cases require review.

## Presence refinements

V1-only, preserving all 175 Packet 7 rows:

| Category | Count |
| --- | ---: |
| Current-source omission | 74 |
| Quarantine A | 59 |
| Possible replacement relationship | 18 |
| Quarantine D | 12 |
| Likely historical source artifact | 11 |
| Quarantine B | 1 |
| Quarantine C | 0 |
| Likely jurisdiction/filter difference | 0 |

The 18 possible relationships combine Packet 7's six same-parcel-ID patterns with 12 additional historical IDs now found on accepted current rows. None is a legal successor finding and none authorizes a redirect.

V2-only, preserving all 544 Packet 7 rows:

| Category | Count |
| --- | ---: |
| Stacked/repeated parcel-ID APN | 457 |
| Likely current-source addition | 87 |
| Likely historical V1 omission | 0 |
| Split/subunit pattern outside the stack set | 0 |
| Unresolved | 0 |

“Likely current-source addition” means present in sealed current SanGIS and absent from the historical Regrid/V1 evidence. It is an observed source delta, not a legal creation date.

## Exception contract and search behavior

The smallest compatibility layer is a separate, provenance-aware record with current/alternate APN, optional fallback address, relationship type, reason, observed date, confidence, geometry state, and `legalRelationshipAsserted: false`. Supported relationships are `historical_alias`, `possible_replacement`, `fallback_presentation`, `quarantine_identity`, and `unresolved`.

- A historical APN with relationship evidence may show a labelled relationship. It must not silently redirect.
- A valid identity with bad geometry may render an identity-only result that states geometry is unavailable.
- A V2 parcel without current situs may show a current street locator; one of the 14 validated historical addresses may appear only as labelled fallback evidence.
- An unresolved identity must not redirect, inherit geometry, or be promoted automatically.

## Revised primary user-impact partition

| Impact | Count |
| --- | ---: |
| No material user impact | 372,562 |
| Improved identity | 830 |
| Safely recoverable by bounded fallback | 10,326 |
| Genuine potential regression | 18 |
| Unresolved needs review | 10,172 |

The partition covers all 393,908 APNs in the Packet 7 union exactly once. Diagnostic parcel-ID and centroid flags are not added again. The 18 genuine potential regressions are 12 quarantine-D identities and six historical units absent from current components. The unresolved set contains 10,160 remaining address conflicts, one duplicate-source quarantine identity, and 11 historical artifacts without current-source or Regrid address support.

## Decision

`PARCEL_V2_IDENTITY_EXCEPTIONS_NOT_BOUNDED`

The exception mechanisms are bounded, but 10,172 unresolved cases remain too material for identity shadow serving or cutover. Base Zoning V2 may proceed in parallel only as isolated current-source work keyed to canonical V2 APNs. This decision does not authorize V2 selection, shadow reads, zoning load, mappings, deployment, or changes to Parcel V1.

## Reproduction

```bash
python3 scripts/parcel-v1-v2-exceptions/resolve.py \
  --v1 /path/to/v2_with_addr.jsonl \
  --v1-lineage /path/to/parcels_enriched_canon_v1.csv \
  --v1-addresses /path/to/regrid_addresses.csv \
  --v2 /path/to/rows.ndjson.gz \
  --quarantine /path/to/rejected.ndjson.gz \
  --packet7 data/parcel-v1-v2-comparison/report.json \
  --schema data/parcel-v1-v2-identity-exceptions/identity-exception.schema.json \
  --output /tmp/packet8-report.json

python3 scripts/parcel-v1-v2-exceptions/test_resolve.py
```
