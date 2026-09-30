# Inside-Coastal RS Standards V0

## Decision

`INSIDE_COASTAL_RS_STANDARDS_V0_READY`

As of September 30, 2026, the controlling City of San Diego inside-Coastal RS base-standards version is the 2024 Land Development Code update in O-21836, conditionally certified by the California Coastal Commission as LCP amendment LCP-6-SAN-24-0038-3 on February 5, 2026, with the two modifications accepted by the City in O-22117. The City’s adopted-update ledger records September 10, 2026 as the inside-Coastal effective date.

The Commission modifications address sections 143.0740 and 143.0743. They do not modify Residential Base Zones Division 4 or Table 131-04D. The inside-Coastal composite also includes O-21934: the Commission concurred with de minimis LCP amendment LCP-6-SAN-25-0037-1 on September 11, 2025, and the amendment became a certified part of the LCP ten days later. The prior inside-Coastal version was the 2022 update, O-21618 as modified by O-21905, effective February 6, 2025.

## Later ordinance status

- O-21934 took effect outside Coastal on April 24, 2025. The Coastal Commission processed its Footnote 7 repeal as de minimis LCP amendment LCP-6-SAN-25-0037-1, concurred on September 11, 2025, and the amendment became certified on September 21, 2025. Footnote 7 is therefore repealed in the controlling inside-Coastal version.
- O-22109 took effect outside Coastal on July 15, 2026. The City ledger states that it was not yet approved inside Coastal as of September 30, 2026. Its changes to dependent Division 4 sections, including the section 131.0443(i) defensible-space condition and section 131.0448 changes, do not enter this inside-Coastal version.

## Independent extraction and comparison

The packet re-extracts the controlling inside-Coastal rules by using the independently verified Packet 12 cell coordinates and applying only the legal-version transformations established by the ordinance chain. The result contains 343 records for RS-1-1 through RS-1-14. Every value was compared cell by cell with the outside-Coastal bundle.

| Comparison measure | Count |
| --- | ---: |
| Cells compared | 343 |
| Printed value same | 343 |
| Printed value changed | 0 |
| Conditional difference | 56 |
| Provenance-only difference | 280 |
| Unresolved | 7 |

The mutually exclusive review classes total 343. The 56 conditional differences are setback records from which the outside-only O-22109 condition is removed. The seven unresolved records are the RS-1-8 through RS-1-14 bedroom-regulation cells tied to orphan Footnote 8.

## Footnotes

Footnotes 1 through 6 remain unchanged. Footnote 7 remains repealed because O-21934 was certified as LCP-6-SAN-25-0037-1. Footnote 8 remains missing in the controlling source; the seven linked bedroom-regulation records remain `UNKNOWN`.

## Runtime selection

The offline Parcel RS resolver now selects:

- `OUTSIDE_COASTAL`: the existing Packet 12 outside-Coastal version for September 30, 2026;
- `INSIDE_COASTAL`: the inside-Coastal version for September 10 through September 30, 2026;
- `BOUNDARY_AMBIGUOUS`: no definitive version;
- `SOURCE_UNAVAILABLE`: unavailable;
- `APPLICABILITY_UNRESOLVED`: unresolved.

Dates outside the sealed intervals fail closed. Split zones preserve each zone separately. Non-RS, ambiguous zoning, and unmapped zoning retain their prior refusal behavior. The resolver does not use majority Coastal area, evaluate compliance, calculate capacity, or run in the production application.

## Sources and artifacts

The source ledger, hashes, page coordinates, legal chain, 343-record bundle, complete comparison, fixtures, fingerprints, and containment decision are in `data/inside-coastal-rs-standards-v0/`. Acquired official PDFs are sealed outside Git under `/Users/ops/trulot-data/inside-coastal-rs-standards-v0/inside-coastal-rs-20260930T151730Z/`.

The acquired materials include O-21836, the Coastal Commission staff report for LCP-6-SAN-24-0038-3, O-22117, O-21934, the Commission report and minutes for LCP-6-SAN-25-0037-1, corrected O-22109, and the September 2026 Residential Base Zones PDF. The City update ledger is retained as authoritative effective-date evidence. An independent ministerial Commission certification-review memo was not located; this narrow evidence gap does not change the City’s explicit recorded effective date.

## Containment

This packet changes only offline legal data, selectors, fixtures, tests, and documentation. It does not access production, load zoning, select a snapshot, evaluate parcel compliance, calculate capacity, wire application runtime, modify Parcel V1, deploy, or push.
