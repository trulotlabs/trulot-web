# Verified residential shadow coverage

This inventory describes the existing sealed Packet 12.5 approval, not complete zoning rules, parcel compliance, or production-display authorization. No source evidence was modified.

## Sealed subset

The canonical `data/residential-standards-review/residential_standards_v2_integration_safe.json` contains exactly **97 records**, all `SOURCE_VERIFIED`. Its other review-state counts are zero: `INTERPRETATION_REQUIRED`, `APPLICABILITY_UNRESOLVED`, `SOURCE_INCOMPLETE`, `CONFLICTING_AUTHORITY`, and any unrecognized state. The existing `scripts/residential-standards-review/gate.py` `validate(load())` returned `[]`: the sealed review artifacts and Packet 12 source artifacts match. This verifies the local approval seal, not a fresh legal or online-source review.

Approval is limited to `BASE_TABLE_PARAMETERS_ONLY`, observation date **2026-09-24**, outside Coastal, new application, outside Miramar transition, and the approved lot-context branches. All outputs preserve `project_applicability_determined: false`. The gate rehashes every pinned public artifact; drift invalidates the whole selection under the existing conservative architecture.

## Residential-zone inventory

**33 codified residential zones; 33 with at least one safe parameter; zero with no safe parameters.** The observed source inventory contains 31 of those zones (RT-1-1 and RT-1-3 are codified but not observed). No real zero-safe residential zone exists in this inventory: a test for that behavior must label an unknown/synthetic residential-looking code honestly, not claim it is a recognized zone.

All 33 zones have **partial overall standards coverage**. Thirty-two have all three approved dimension families; RX-1-2 has depth only. No zone has a complete set of governing standards in this shadow.

| Residential zone | Safe parameter count | Parameter families | Corpus records | Coverage |
|---|---:|---|---:|---|
| RM-1-1 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-1-2 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-1-3 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-2-4 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-2-5 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-2-6 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 27 | Partial overall standards; three dimension families |
| RM-3-7 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RM-3-8 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RM-3-9 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RM-4-10 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RM-4-11 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RM-5-12 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-1 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-10 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-11 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-12 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-13 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-14 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-2 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-3 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-4 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-5 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-6 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-7 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 24 | Partial overall standards; three dimension families |
| RS-1-8 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RS-1-9 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 25 | Partial overall standards; three dimension families |
| RT-1-1 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 23 | Partial overall standards; three dimension families |
| RT-1-2 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 23 | Partial overall standards; three dimension families |
| RT-1-3 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 23 | Partial overall standards; three dimension families |
| RT-1-4 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 23 | Partial overall standards; three dimension families |
| RT-1-5 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 23 | Partial overall standards; three dimension families |
| RX-1-1 | 3 | corner_lot_width_min, lot_depth_min, lot_width_min | 22 | Partial overall standards; three dimension families |
| RX-1-2 | 1 | lot_depth_min | 22 | Partial dimensions; depth only |

## Family and condition counts

| Parameter family | Safe records |
|---|---:|
| corner_lot_width_min | 32 |
| lot_depth_min | 33 |
| lot_width_min | 32 |

RS accounts for 42 safe records, RM 36, RT 15, and RX 4. All safe records are numeric minimum parameters in feet. The only nonempty record condition is `corner lot`: 32 records retain that condition; 65 records have no per-record condition. An empty condition list does not mean parcel applicability has been determined. Unknown corner context must preserve both approved widths where present; no geometry-derived corner selection is approved.

RX-1-2 width and corner-width records remain excluded because their attached exception and §131.0442(c) alley-access context are unresolved for the parameter selection. Show only its approved depth; do not backfill from the excluded corpus.

## Source presentation coordinates

| Table | Pages | Safe records |
|---|---|---:|
| 131-04D | 34, 36 | 42 |
| 131-04E | 37 | 4 |
| 131-04F | 39 | 15 |
| 131-04G | 41, 43 | 36 |

Use each record’s actual table/page/row/column and zone header. The raw corpus stores `source_section: 131.0431` for all 97 corresponding records; preserve the sealed metadata rather than inventing zone-derived section numbers. §131.0430 and §131.0442 (pages 33 and 47–48) are additional recorded governing dependencies, not proof those regulations have been evaluated for the parcel. The source file hash, authority/dependency references, version profile, source observation, conditions, and explicit non-compliance status belong in the preserved data path. Raw hashes belong in deep evidence disclosure, not the primary parameter UI.

## Excluded corpus

The complete research corpus contains 814 records; **717 remain excluded**. Their final closure review states are **665 APPLICABILITY_UNRESOLVED** and **52 INTERPRETATION_REQUIRED**. No source-incomplete, conflicting-authority, or other final states occur in this particular corpus. These counts come from `cell-review.json`, not the earlier extraction-state labels. There are 42 distinct excluded parameter types. No excluded record is eligible merely because its type or numeric shape matches an approved record.

| Excluded parameter type | Records |
|---|---:|
| accessory_uses_and_structures | 33 |
| architectural_projections_and_encroachments | 33 |
| bedroom_regulation_8 | 7 |
| building_spacing | 16 |
| common_open_space | 12 |
| corner_lot_width_min | 1 |
| density_basis | 33 |
| dwelling_unit_protection_regulations | 33 |
| far_1_2_dwellings | 6 |
| far_1_2_stories | 5 |
| far_3_7_dwellings | 6 |
| far_3_stories | 5 |
| far_8_plus_dwellings | 6 |
| floor_area_ratio_bonus_for_child_care | 12 |
| floor_area_ratio_max | 22 |
| front_setback | 33 |
| garage_regulations | 21 |
| ground_floor_height | 12 |
| height_1_2_stories | 5 |
| height_3_stories | 5 |
| interior_side_setback | 33 |
| lot_area_min | 33 |
| lot_consolidation_regulations | 12 |
| lot_coverage_for_sloping_lots | 14 |
| lot_coverage_max | 5 |
| lot_width_min | 1 |
| max_lot_coverage | 12 |
| max_paving_hardscape | 14 |
| max_third_story_dimensions | 14 |
| parkway_requirement | 5 |
| private_exterior_open_space | 12 |
| rear_setback_min | 33 |
| refuse_and_recyclable_material_storage | 33 |
| requirements_for_attached_units | 2 |
| roof_design_variation | 2 |
| setback_requirements_for_resubdivided_corner_lots | 26 |
| street_frontage_min | 33 |
| street_side_setback_min | 33 |
| structure_height_max | 28 |
| supplemental_regulations | 2 |
| supplemental_requirements | 31 |
| visibility_area | 33 |

Important unavailable categories include density, lot area, frontage, setbacks, height, FAR, coverage, open space, building spacing, and supplemental/accessory regulations. The orphan footnote, FAR intervals, compound height/setback expressions, and legal-lot questions remain outside this packet. The three displayed dimension families must not suggest those categories have been cleared.

## Test coverage accounting

The final fixture matrix exercised **97 of 97 distinct approved rule IDs (100%)** through the consumer, display and runtime adapter across all 33 zones. It also exercised 10 additional grouped/unsupported states, for 43 deterministic cases total. All 717 excluded IDs were individually rejected by the real Python consumer and by renderer replacement-injection checks. Desktop browser review used RS-1-7, RM-1-1, RT-1-1 and RX-1-2; mobile used split RS/RM and RX-1-2/unknown cases. Browser coverage is representative, not a claim that all 97 records were separately visually reviewed.
