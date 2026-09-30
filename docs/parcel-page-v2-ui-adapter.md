# Parcel Page V2 UI adapter

Packet 19 adapts the sealed `ParcelIntelligenceV2` result into a presentation-safe model and static review page. It is disconnected from the application runtime and production data. The canonical Parcel V1 route remains unchanged.

## Contract boundary

The adapter groups facts, formats units, shortens source labels, and generates deterministic wording from structured states. It refuses inputs that claim parcel compliance, development capacity, blended standards, or production runtime wiring. It does not select zoning, infer Coastal context, resolve a conditional rule, or turn unknown values into false or zero.

The presentation model has eight sections:

1. parcel identity;
2. regulatory orientation;
3. standards grouped by every material zone;
4. existing property facts;
5. material unresolved facts;
6. deterministic next-investigation actions;
7. progressively disclosed evidence;
8. an explicit `Development capacity — Not evaluated yet` state.

## Truth-state language

The interface combines visible text with restrained colors. Status is never color-only.

| Contract state | Display language |
| --- | --- |
| supported / recorded | Recorded |
| conditional | Conditional, with exact condition disclosure |
| unknown | Not yet verified |
| source unavailable | Source currently unavailable |
| mapping ambiguous | Zoning requires review |
| non-RS standards | Standards outside this RS adapter |

Outside-Coastal and inside-Coastal results show their exact sealed standards version. `BOUNDARY_AMBIGUOUS` shows `Coastal applicability requires review` and refuses to select a version.

## Product behavior

Split-zone parcels show every material zone, its mapped coverage, and an independent standards group. APN `4304211000` therefore shows both RS-1-7 and OR-1-1; OR-1-1 remains visibly unsupported by the RS resolver. No standard is blended.

Packet 20 adds a compact `At a glance` region with zoning, Coastal context, existing units, approximate parcel area, and standards state. The same first section states that development capacity is not evaluated. Mapping, Coastal, acquisition, and standards-version evidence are one disclosure away.

RS-1-7 examples preserve their source meaning:

- minimum lot width: `50 ft`;
- minimum corner-lot width: `55 ft — if corner lot`;
- maximum structure height: `24/30 ft — condition-dependent`;
- maximum floor-area ratio: `Varies — additional rule conditions apply`.

Assessor facts remain `Existing dwelling units` and `Living area`; living area is never relabeled gross floor area. Building outlines are visibly labeled `2017 imagery` and described as historical plan-view evidence.

Unknowns are ordered by materiality and linked to the corresponding Packet 18 action when one exists. Each action states why it matters, the evidence needed, and the blocked conclusion.

Primary dimensional standards remain visible. Corner width, FAR, and density basis move into an `additional base standards` disclosure. Historical outlines, future-analysis unknowns, technical limitations, evidence collection details, and low-level provenance use progressive disclosure. No contract content is removed.

## Responsive and accessibility review

The review set contains ten representative pages and browser checks at 390 × 844, 820 × 1180, and 1440 × 1000. Core comprehension uses cards rather than horizontal tables. Pages use one `h1`, ordered semantic section headings, native keyboard-operable `details`/`summary` controls, visible focus treatment, text status labels, and sufficient foreground/background contrast in the fixed palette.

The three canonical parcels have mobile and desktop screenshots under `data/parcel-page-v2-ui/screenshots/`. Browser review also checks horizontal overflow, disclosure keyboard operation, status text, required sections, and console errors.

The Packet 20 default mobile pages are 42.5–52.5 percent shorter than the Packet 19 renderings. The before/after contact sheet is `data/parcel-page-v2-ui/screenshots/before-after-contact-sheet.png`.

## Parcel V1 comparison

The structured comparison is recorded in `data/parcel-page-v2-ui/v1-comparison.json`. V2 makes zoning truth, uncertainty, standards conditions, and evidence easier to inspect. This conclusion is limited to the static Packet 19 review surface; runtime integration is a later bounded decision.

## Remaining boundaries

- **UI:** no map or production navigation is part of this static review artifact. Zone percentages and the split-zone callout are sufficient for the bounded review; a parcel map remains a later enhancement.
- **Runtime integration:** no route, loader, feature flag, or production read is wired.
- **Compliance:** legal dimensions and conditional predicates remain unresolved; no rule is applied to the parcel.
- **Capacity:** no unit or buildable-area calculation exists.
- **Additional programs:** ADU, SB9, SB79, Density Bonus, and Complete Communities remain excluded.
