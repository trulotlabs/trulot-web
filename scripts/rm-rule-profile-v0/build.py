#!/usr/bin/env python3
"""Build deterministic Packet 51 RM Rule Profile V0 artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, integrity_artifact

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "rm-rule-profile-v0"

CURRENT_RESIDENTIAL_SHA = "513f34d5245e24ec90b6d2cb2c621cab16b29847dcbfd0ef67c9b697ce464cc9"
CURRENT_MEASUREMENT_SHA = "5766096f34fe5d5fd6b807e6c9aaa40393f31e6c4c76d85ff4de68cff032a345"
CURRENT_DEFINITIONS_SHA = "7a2234c4b02089867be21002036235c7eba2abebd60fa2ef0413a60b00a652ae"
O21618_SHA = "a3b3bdbbc9a3d780f099e4404a2c13d82341c73db8abddb23476da988f9ef467"


def provenance(source_id: str, citation: str, url: str, sha256: str, pages: list[int]) -> dict[str, Any]:
    return {"source_id": source_id, "citation": citation, "url": url, "artifact_sha256": sha256, "pages": pages}


def rule(rule_id: str, family: str, raw: str, value: str | None, unit: str | None, comparator: str, footnotes: list[str], row: str, column: str) -> dict[str, Any]:
    return {
        "rule_id": rule_id, "zone_code": "RM-2-5", "legal_version": "TABLE_131_04G_SHARED_APPLICATION_AND_CURRENT",
        "coastal_applicability_profile": "BASE_ZONE_ALL_CONTEXTS_SUBJECT_TO_SEPARATE_OVERLAYS", "rule_family": family,
        "base_value": value, "raw_value": raw, "unit": unit, "comparator": comparator,
        "applicability_predicates": ["ZONE_IS_RM_2_5"], "footnotes": footnotes, "exceptions": [],
        "measurement_definition": None, "program_modifiers": [],
        "table_locator": {"table": "131-04G", "row": row, "column": column},
        "source_provenance": ["CURRENT_RESIDENTIAL", "O21618_APPLICATION_VERSION"],
        "derivation_class": "recorded", "unresolved_dependencies": [],
    }


def schema() -> dict[str, Any]:
    required = ["rule_id", "zone_code", "legal_version", "effective_date", "coastal_applicability_profile", "rule_family", "base_value", "unit", "comparator", "applicability_predicates", "footnotes", "exceptions", "measurement_definition", "program_modifiers", "source_provenance", "derivation_class", "unresolved_dependencies"]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "trulot://schemas/rm-rule-profile-v0",
        "title": "Reusable RM zone rule record", "type": "object", "required": required,
        "properties": {
            "rule_id": {"type": "string"}, "zone_code": {"type": "string", "pattern": "^RM-[0-9]+-[0-9]+$"},
            "legal_version": {"type": "string"}, "effective_date": {"type": "string", "format": "date"},
            "effective_through": {"type": ["string", "null"]}, "coastal_applicability_profile": {"type": "string"},
            "rule_family": {"type": "string"}, "base_value": {}, "raw_value": {"type": ["string", "null"]},
            "unit": {"type": ["string", "null"]}, "comparator": {"enum": ["MIN", "MAX", "FORMULA", "PROCESS", "NOT_SPECIFIED"]},
            "applicability_predicates": {"type": "array", "items": {"type": "string"}},
            "footnotes": {"type": "array", "items": {"type": "string"}}, "exceptions": {"type": "array"},
            "measurement_definition": {"type": ["string", "null"]}, "program_modifiers": {"type": "array"},
            "source_provenance": {"type": "array", "minItems": 1},
            "derivation_class": {"enum": ["recorded", "deterministic_derived", "inferred", "conditional"]},
            "unresolved_dependencies": {"type": "array", "items": {"type": "string"}},
        },
        "additionalProperties": True,
        "layer_separation": ["BASE_ZONE_RULE", "DEFINITION_MEASUREMENT", "FOOTNOTE_EXCEPTION", "PROGRAM_MODIFIER", "PROJECT_FACT"],
    }


def versions() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "profiles": [
            {
                "profile_id": "RM25_2023_05_06_OUTSIDE_COASTAL", "zone": "RM-2-5", "effective_from": "2023-05-06", "effective_through": "2024-03-15",
                "coastal_applicability": "OUTSIDE_COASTAL", "selected_for": "PACKET_50_APPLICATION_2024_01_29", "ordinance": "O-21618 N.S.",
                "table_status": "O-21618 records no change from maximum permitted density through maximum lot coverage; its Table 131-04G independently records all three RM-2-5 FAR cells as 1.35.",
                "far_definition_status": "PRE_O21836_TEXT; later O-21836 strikeout is retained as amendment-boundary evidence and cannot be back-applied.",
                "sources": ["O21618_APPLICATION_VERSION", "O21836_STRIKEOUT_BOUNDARY"],
            },
            {
                "profile_id": "RM25_CURRENT_2026_07_15_OUTSIDE_COASTAL", "zone": "RM-2-5", "effective_from": "2026-07-15", "effective_through": None,
                "coastal_applicability": "OUTSIDE_COASTAL", "selected_for": "CURRENT_COMPILED_CODE", "ordinance": "O-22109 N.S. compiled 7-2026",
                "table_status": "CURRENT_TABLE_131_04G", "far_definition_status": "CURRENT_SECTION_113_0234", "sources": ["CURRENT_RESIDENTIAL", "CURRENT_MEASUREMENT", "CURRENT_DEFINITIONS"],
            },
        ],
        "inside_coastal": {"state": "unavailable", "source_state": "not_evaluated", "reason": "No inside-Coastal project evaluation is required by Packet 50 and the existing source set does not contain a fully verified inside-Coastal composite. The schema preserves the axis for later evidence."},
        "selection_rule": "Choose by application date and independently proven Coastal context; never substitute a later compiled section into an earlier profile.",
    }


def base_rules() -> dict[str, Any]:
    rules = [
        rule("RM25_DENSITY", "DENSITY", "1,500 sq ft per dwelling unit", "1500", "sq_ft_per_dwelling_unit", "PROCESS", ["FN1", "FN2"], "Maximum permitted residential density", "RM-2-5"),
        rule("RM25_MIN_LOT_AREA", "MINIMUM_LOT_AREA", "6,000", "6000", "sq_ft", "MIN", [], "Minimum lot dimensions / lot area", "RM-2-5"),
        rule("RM25_MIN_LOT_WIDTH", "MINIMUM_LOT_WIDTH", "50", "50", "ft", "MIN", [], "Minimum lot dimensions / width", "RM-2-5"),
        rule("RM25_MIN_STREET_FRONTAGE", "MINIMUM_STREET_FRONTAGE", "50", "50", "ft", "MIN", [], "Minimum lot dimensions / street frontage", "RM-2-5"),
        rule("RM25_MIN_CORNER_WIDTH", "MINIMUM_CORNER_LOT_WIDTH", "55", "55", "ft", "MIN", [], "Minimum lot dimensions / corner lot width", "RM-2-5"),
        rule("RM25_MIN_LOT_DEPTH", "MINIMUM_LOT_DEPTH", "90", "90", "ft", "MIN", [], "Minimum lot dimensions / depth", "RM-2-5"),
        rule("RM25_FRONT_MIN", "FRONT_SETBACK_MINIMUM", "15", "15", "ft", "MIN", ["FN7"], "Setback requirements / front / minimum", "RM-2-5"),
        rule("RM25_FRONT_STANDARD", "FRONT_SETBACK_STANDARD", "20", "20", "ft", "MIN", ["FN7"], "Setback requirements / front / standard", "RM-2-5"),
        rule("RM25_SIDE_MIN", "INTERIOR_SIDE_SETBACK", "5", "5", "ft", "FORMULA", ["FN8"], "Setback requirements / side / minimum", "RM-2-5"),
        rule("RM25_STREET_SIDE_MIN", "STREET_SIDE_SETBACK", "10", "10", "ft", "FORMULA", ["FN9"], "Setback requirements / street side / minimum", "RM-2-5"),
        rule("RM25_REAR_MIN", "REAR_SETBACK", "15", "15", "ft", "MIN", ["FN10"], "Setback requirements / rear / minimum", "RM-2-5"),
        rule("RM25_HEIGHT", "STRUCTURE_HEIGHT", "40", "40", "ft", "MAX", ["FN18", "FN37"], "Maximum structure height", "RM-2-5"),
        rule("RM25_LOT_COVERAGE", "LOT_COVERAGE", "—", None, None, "NOT_SPECIFIED", [], "Maximum lot coverage", "RM-2-5"),
    ]
    for band_id, raw, minimum, maximum in (
        ("RM25_FAR_1_2", "1.35", 1, 2),
        ("RM25_FAR_3_7", "1.35", 3, 7),
        ("RM25_FAR_8_PLUS", "1.35", 8, None),
    ):
        record = rule(band_id, "FAR", raw, "1.35", "ratio", "MAX", [], "Maximum floor area ratio", band_id.removeprefix("RM25_FAR_").replace("_", "-"))
        record["applicability_predicates"] = ["ZONE_IS_RM_2_5", f"UNIT_BAND_IS_{band_id.removeprefix('RM25_FAR_')}"]
        record["program_modifiers"] = ["CHILD_CARE_FAR_BONUS", "EXTERNAL_ADU_OR_AFFORDABLE_PROGRAM_IF_PROVEN"]
        record["unit_band"] = {"minimum_units": minimum, "maximum_units": maximum}
        rules.append(record)
    for record in rules:
        record["effective_date"] = "2023-05-06"
        record["effective_through"] = None
    return {"contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "rules": rules, "deferred": {"usable_open_space": "Not needed to resolve Packet 50 height/FAR and not forced into V0.", "parking": "Deferred; no selected height/FAR branch depends on parking supply. GFA treatment of parking structures remains in the FAR definition."}}


def footnotes() -> dict[str, Any]:
    items = [
        ("FN1", ["DENSITY"], ["CODE_DEFINED_LOT_AREA_AVAILABLE"], {"kind": "PROCESS", "value": "CALCULATE_PER_SDMC_113_0222"}, "One dwelling unit per specified square feet of lot area, determined under §113.0222."),
        ("FN2", ["DENSITY"], ["CHAPTER_14_ARTICLE_3_DIVISION_7_APPLIES"], {"kind": "EXCEPTION", "value": "DENSITY_EXCEPTION_MAY_APPLY"}, "A density exception may be permitted under the Affordable Housing Regulations."),
        ("FN7", ["FRONT_SETBACK_MINIMUM", "FRONT_SETBACK_STANDARD"], ["RM_SETBACK_SECTION_APPLIES"], {"kind": "PROCESS", "value": "APPLY_131_0443_E_1"}, "Apply the RM front-setback rules in §131.0443(e)(1)."),
        ("FN8", ["INTERIOR_SIDE_SETBACK"], ["RM_SETBACK_SECTION_APPLIES"], {"kind": "FORMULA", "value": "APPLY_131_0443_E_2"}, "Apply the RM side-setback rules in §131.0443(e)(2)."),
        ("FN9", ["STREET_SIDE_SETBACK"], ["RM_SETBACK_SECTION_APPLIES"], {"kind": "FORMULA", "value": "APPLY_131_0443_E_3"}, "Apply the RM street-side setback rules in §131.0443(e)(3)."),
        ("FN10", ["REAR_SETBACK"], ["RM_SETBACK_SECTION_APPLIES"], {"kind": "EXCEPTION", "value": "APPLY_131_0443_E_4"}, "Apply the RM rear-setback rules in §131.0443(e)(4)."),
        ("FN18", ["STRUCTURE_HEIGHT"], ["ZONE_IS_RM_2_4_OR_RM_2_5_OR_RM_2_6", "STRUCTURE_PORTION_ABOVE_30_FT"], {"kind": "GEOMETRIC_LIMIT", "value": "SIXTY_DEGREE_PLANE_FROM_SIDE_SETBACK_LINE_AT_30_FT"}, "For RM-2-4, RM-2-5, and RM-2-6, §131.0444(f) adds a 60-degree inward angled plane above 30 feet at each side setback line."),
        ("FN37", ["STRUCTURE_HEIGHT"], ["IN_COASTAL_HEIGHT_LIMIT_OVERLAY", "IN_PENINSULA_COMMUNITY_PLAN"], {"kind": "NUMERIC_OVERRIDE", "value": "30"}, "Within the Coastal Height Limit Overlay Zone in the Peninsula Community Plan area, the base-zone maximum structure height is 30 feet measured under §113.0270(a)(4)(D)."),
    ]
    return {"contract_version": CONTRACT_VERSION, "footnotes": [{"footnote_id": i, "affected_rule_families": f, "trigger_predicates": p, "effect": e, "meaning": m, "source": "SDMC Table 131-04G footnote and cited section", "unresolved_external_evidence": p if i in {"FN2", "FN37"} else []} for i, f, p, e, m in items], "invariant": "A footnote remains a separate conditional object; it never overwrites its table cell until every trigger predicate is supported."}


def height_definition() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "definition_id": "SDMC_113_0270_HEIGHT", "legal_versions": ["APPLICATION_2024_01_29", "CURRENT_2026_07_15"],
        "plumb_line": {"rule": "Each point at the top is measured vertically to the lower of existing or proposed grade directly below.", "required_evidence": ["top_point_geometry", "existing_grade_directly_below", "proposed_grade_directly_below"]},
        "overall": {"low_point": "Lowest existing or proposed grade within 5 feet of the structure perimeter, or at the property line when closer than 5 feet.", "high_point": "Highest point of the structure.", "maximum": "Base-zone maximum plus the lesser of the footprint grade differential or 10 feet; no top point may exceed the zone maximum by plumb-line measurement."},
        "per_structure": {"separate_when": "Structures are separated by 6 feet or more.", "predicate": "STRUCTURE_SEPARATION_AT_LEAST_6_FT"},
        "special_conditions": ["extreme_topographic_variation", "subterranean_structure", "pool", "coastal_height_limit_overlay"],
        "roof_and_parapet": {"default": "Top points are measured unless an express Code exclusion applies.", "conditional_exclusion": "§113.0270(a)(5) applies only when all stated development and roof-form predicates are proven; it is not a default RM-2-5 exclusion."},
        "coastal_overlay": {"method": "§113.0270(a)(4)(D)", "uppermost_point": "Includes appurtenances", "base": "Finished grade under the referenced 1970 Uniform Building Code method", "additional_limit": "Lowest surface constraint of 10 feet and the applicable zoning maximum both remain operative."},
        "source_provenance": ["CURRENT_MEASUREMENT"], "derivation_class": "recorded",
    }


def height_branches() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "branch_tree": {
            "base": {"value_ft": "40", "source_rule": "RM25_HEIGHT"},
            "footnote_37": {"if_all": ["IN_COASTAL_HEIGHT_LIMIT_OVERLAY", "IN_PENINSULA_COMMUNITY_PLAN"], "then_value_ft": "30", "measurement": "SDMC_113_0270_A_4_D", "else_value_ft": "40", "unknown_result": "HEIGHT_BRANCH_UNRESOLVED"},
            "footnote_18": {"if_all": ["ZONE_IS_RM_2_5", "STRUCTURE_PORTION_ABOVE_30_FT"], "then_constraint": "SIXTY_DEGREE_INWARD_PLANE_FROM_SIDE_SETBACK_LINE_AT_30_FT", "numeric_maximum_unchanged": True},
        },
        "outside_coastal": {"footnote_37": False, "numeric_maximum_ft": "40", "footnote_18_still_applies": True},
        "inside_coastal_unknown_community": {"numeric_maximum_ft": None, "state": "unknown", "required_evidence": ["coastal_height_limit_overlay_mapping", "community_plan_mapping"]},
        "no_other_rm_2_5_numeric_height_modifier_found": True,
    }


def far_definition() -> dict[str, Any]:
    common = {
        "formula": "TOTAL_GROSS_FLOOR_AREA_OF_ALL_BUILDINGS_ON_PREMISES / TOTAL_AREA_OF_PREMISES",
        "multiple_building_aggregation": True,
        "premises_denominator": "Total area of the legally established premises, subject to express property-line and dedication rules.",
        "inclusions": ["floors_within_exterior_wall_surfaces", "qualifying_basement_area", "enclosed_stairs_and_elevators", "shafts_stairs_ramps_and_mechanical_rooms_on_each_floor", "nonexcluded_parking_garages_and_carports", "nonexcluded_penthouses", "qualifying_roofed_residential_porches_entries_balconies_and_patios", "phantom_floors_high_spaces_underfloor_area_mezzanines_lofts_and_atriums", "roof_decks_with_enclosure_over_code_threshold"],
        "exclusions": ["interior_courts", "interior_modifications_that_do_not_change_envelope", "parking_structures_only_when_express_design_conditions_are_met", "qualifying_bay_windows"],
        "parking_storage_common_area": "No categorical project-wide exclusion is inferred. Each space follows §113.0234's express inclusion/exclusion predicates.",
        "roofed_open_area": "Count only under the openness, recession, support, and dimensional predicates in §113.0234; a plan label alone is insufficient.",
        "required_dedication": "For a street/alley dedication required under §142.0610, maximum permitted GFA and density use property lines before dedication.",
        "unit_band_interaction": "Unit count selects a Table 131-04G maximum; it does not redefine numerator or denominator.",
    }
    return {
        "contract_version": CONTRACT_VERSION, "definition_id": "SDMC_113_0234_FAR",
        "application_profile_2024_01_29": {**common, "version": "PRE_O21836", "later_change_excluded": "The at-grade space with enclosed space above paragraph added by O-21836 and the multiple-base-zone paragraph added by O-22109 are not back-applied; pre-amendment numbering for phantom floors and roof decks is retained.", "parking_exclusion_boundary": "Pre-O-21836 text excludes the parking-structure exclusion for garages or carports serving single-dwelling-unit or duplex development.", "source_provenance": ["O21836_STRIKEOUT_BOUNDARY", "O22109_STRIKEOUT_BOUNDARY", "O21618_APPLICATION_VERSION"]},
        "current_profile_2026_07_15": {**common, "version": "CURRENT_COMPILED_7_2026", "additional_inclusion": "Qualifying at-grade space with enclosed space above under §113.0234(b)(3).", "parking_exclusion_boundary": "Current text applies the stated parking exclusion limitations to single-dwelling-unit garages/carports and separately accessed multiple-dwelling-unit garages/carports.", "multiple_zones": "Calculate maximum GFA separately from the lot area in each base zone, add the maxima, and allow distribution without following zone boundaries where §113.0234 permits.", "source_provenance": ["CURRENT_MEASUREMENT", "CURRENT_DEFINITIONS", "O22109_STRIKEOUT_BOUNDARY"]},
        "plan_label_policy": "A plan-labeled gross floor area, lot area, or FAR cannot satisfy the Code definition until every included/excluded component and the premises denominator are reconciled.",
    }


def unit_bands() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "bands": [
        {"band_id": "RM25_FAR_1_2", "minimum_units": 1, "maximum_units": 2, "far_maximum": "1.35", "table_cell": "1-2 dwelling units"},
        {"band_id": "RM25_FAR_3_7", "minimum_units": 3, "maximum_units": 7, "far_maximum": "1.35", "table_cell": "3-7 dwelling units"},
        {"band_id": "RM25_FAR_8_PLUS", "minimum_units": 8, "maximum_units": None, "far_maximum": "1.35", "table_cell": "8 or more dwelling units"},
    ], "all_values_equal": True, "selection_still_required": True, "families_varying_by_band": [], "families_with_distinct_legal_cells_but_equal_values": ["FAR"], "capacity_calculation_authorized": False}


def far_branches() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "base": {"selector": "EXPLICIT_UNIT_BAND", "bands_artifact": "unit-bands.json"},
        "branches": [
            {"branch_id": "BASE_UNIT_BAND", "effect": "MAXIMUM_1_35_IN_EACH_DISTINCT_BAND"},
            {"branch_id": "HISTORIC_RESOURCE", "predicate": "QUALIFYING_HISTORIC_RESOURCE_PROVEN", "effect": "NO_RM25_FAR_MODIFIER_IDENTIFIED_IN_BOUNDED_PROFILE", "state_if_claimed": "REQUIRES_EXTERNAL_PROGRAM_PROFILE"},
            {"branch_id": "CHILD_CARE", "predicate": "QUALIFYING_CHILD_CARE_FACILITY", "effect": "MONOTONIC_BONUS_UNDER_131_0446_E", "maximum": None, "state_if_triggered": "REQUIRES_PROGRAM_SPECIFIC_OPERAND"},
            {"branch_id": "ADU", "predicate": "ADU_PROGRAM_APPLIES", "effect": "SEE_RM25_ADU_INTERACTIONS"},
            {"branch_id": "SDA", "predicate": "SDA_PROGRAM_APPLIES", "effect": "NO_AUTOMATIC_BASE_FAR_CHANGE; external program must declare any override"},
            {"branch_id": "AFFORDABLE_BONUS", "predicate": "QUALIFYING_AFFORDABLE_PROGRAM_APPLIES", "effect": "EXTERNAL_MODIFIER_ONLY; no unproven bonus is applied"},
        ],
        "numerator_or_denominator_exceptions": "Only express §113.0234, §113.0246, or program-specific provisions may change inputs; none is inferred from project naming.",
    }


def area_semantics() -> tuple[dict[str, Any], dict[str, Any]]:
    premises = {
        "contract_version": CONTRACT_VERSION, "term": "premises", "definition": "An area of land with its structures that has unity of use and is the smallest conveyable unit.",
        "far_role": "The denominator is total area of the premises, not automatically an APN, assessor area, GIS polygon, or a single legal lot.",
        "lot_vs_parcel": "A lot is legally established under the Code definition; an assessor parcel is an administrative mapping/tax unit and does not alone establish the premises.",
        "multiple_legal_lots_one_apn": "Resolve recorded lots, conveyability, tie agreements, and unity of use before choosing a denominator.",
        "split_or_multizone_premises": "Apply the version-selected §113.0234 multiple-zone calculation; do not divide or aggregate based only on GIS polygons.",
        "dedication": "Required street/alley dedication under §142.0610 uses pre-dedication property lines for maximum permitted GFA and density.",
        "easements": "No general denominator deduction is modeled. Any claimed easement effect requires an express controlling provision and recorded instrument.",
        "unresolved_dependencies": ["recorded_boundary", "smallest_conveyable_unit", "unity_of_use", "required_dedication", "multiple_zone_areas"],
    }
    lot = {
        "contract_version": CONTRACT_VERSION, "term": "lot", "definition": "A parcel, tract, or area of land established by plat, subdivision, or other legally recognized means under §113.0237.",
        "evidence_map": [
            {"evidence": "recorded_legal_area", "can_satisfy": ["LEGAL_LOT_IDENTITY", "RECORDED_BOUNDARY"], "condition": "instrument and subject match"},
            {"evidence": "code_defined_area", "can_satisfy": ["LOT_AREA", "PREMISES_AREA", "FAR_DENOMINATOR"], "condition": "recorded geometry plus selected Code measurement rules and premises identity"},
            {"evidence": "parcel_v2_geometry_area", "can_satisfy": ["DIAGNOSTIC_RECONCILIATION"], "cannot_satisfy_alone": ["LEGAL_LOT_STATUS", "FAR_DENOMINATOR", "MINIMUM_LOT_AREA"]},
            {"evidence": "assessor_area", "can_satisfy": ["RECORDED_ADMINISTRATIVE_FACT"], "cannot_satisfy_alone": ["CODE_DEFINED_AREA", "FAR_DENOMINATOR"]},
            {"evidence": "plan_provided_area", "can_satisfy": ["PROJECT_ASSERTION"], "cannot_satisfy_alone": ["LEGAL_LOT_STATUS", "CODE_DEFINED_AREA", "FAR_DENOMINATOR"]},
        ],
        "packet_27_reuse": "Uses the recorded/legal versus GIS/assessor hierarchy; RM premises and §113.0246 rules are added explicitly rather than assumed identical to RS rules.",
    }
    return premises, lot


def setbacks() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "profiles": {
            "front": {"base_min_ft": "15", "standard_ft": "20", "rule": "Up to 50% of building-envelope width may use minimum; remainder uses standard, floor by floor.", "curving_street_exception": {"centerline_radius_below_ft": "100", "standard_ft": "10", "minimum_ft": "5"}},
            "interior_side": {"formula": "max(5 ft, 10% of premises width)", "width_exception": {"premises_width_gt_ft": "40", "premises_width_lte_ft": "50", "setback_ft": "4"}, "narrow_lot_exception": {"lot_width_lt_ft": "40", "formula": "max(3 ft, 10% of lot width)"}},
            "street_side": {"formula": "max(10 ft, 10% of premises width)", "facade_encroachment": "Up to 50% of facade may encroach 5 ft into required street-side yard, floor by floor."},
            "rear": {"base_min_ft": "15", "alley_credit": "One-half alley width, capped at 10 ft; on-premises rear setback may not be below 5 ft."},
        },
        "projection_exceptions": {"source": "SDMC 131.0461", "treatment": "SEPARATE_CONDITIONAL_RULE; never deducted from base setback without qualifying feature evidence"},
        "fire_override": {"treatment": "GENERAL_EXTERNAL_SAFETY_CONSTRAINT", "effect": "May require greater separation; never silently reduces a base setback."},
        "project_evaluation": False,
    }


def modifier_interface() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "schema": {
            "required": ["modifier_id", "program", "rule_family", "operation", "predicates", "effective_from", "effective_through", "coastal_applicability", "operand", "provenance"],
            "operations": ["OVERRIDE", "EXEMPTION", "ADDITIVE", "UNCHANGED"],
            "predicate_policy": "All predicates must be supported before application; false means unchanged and unknown remains unknown.",
        },
        "program_stubs": [
            {"program": "ORDINARY_ADU", "implementation": "BOUNDED_HEIGHT_FAR_INTERACTIONS_ONLY"},
            {"program": "ADU_HOME_DENSITY_BONUS", "implementation": "BOUNDED_HEIGHT_FAR_INTERACTIONS_ONLY"},
            {"program": "SDA", "implementation": "INTERFACE_ONLY"},
            {"program": "AFFORDABLE_DEED_RESTRICTED_BONUS", "implementation": "INTERFACE_ONLY"},
        ],
        "invariant": "Program identity or a plan annotation is not proof of eligibility, predicates, or an operand.",
    }


def adu_interactions() -> dict[str, Any]:
    modifiers = [
        {"modifier_id": "RM25_ADU_HEIGHT_UNCHANGED", "program": "ORDINARY_ADU_OR_ADU_HOME_DENSITY_BONUS", "rule_family": "STRUCTURE_HEIGHT", "operation": "UNCHANGED", "predicates": ["ADU_PROGRAM_APPLIES"], "effective_from": "2023-05-06", "effective_through": None, "coastal_applicability": "OUTSIDE_COASTAL", "operand": None, "provenance": ["PACKET50_HEIGHT_RULE_RECONSTRUCTION"]},
        {"modifier_id": "RM25_ADU_FAR_MAX_UNCHANGED", "program": "ORDINARY_ADU_OR_ADU_HOME_DENSITY_BONUS", "rule_family": "FAR_MAXIMUM", "operation": "UNCHANGED", "predicates": ["ADU_PROGRAM_APPLIES", "NO_SEPARATE_PROVEN_FAR_OVERRIDE"], "effective_from": "2023-05-06", "effective_through": None, "coastal_applicability": "OUTSIDE_COASTAL", "operand": None, "provenance": ["PACKET50_FAR_RULE_RECONSTRUCTION"]},
        {"modifier_id": "RM25_ADU_FAR_NUMERATOR_UNCHANGED", "program": "ORDINARY_ADU_OR_ADU_HOME_DENSITY_BONUS", "rule_family": "FAR_NUMERATOR", "operation": "UNCHANGED", "predicates": ["ADU_PROGRAM_APPLIES", "NO_EXPRESS_GFA_EXCLUSION_PROVEN"], "effective_from": "2023-05-06", "effective_through": None, "coastal_applicability": "OUTSIDE_COASTAL", "operand": None, "provenance": ["PACKET50_FAR_RULE_RECONSTRUCTION"]},
        {"modifier_id": "RM25_ADU_FAR_DENOMINATOR_UNCHANGED", "program": "ORDINARY_ADU_OR_ADU_HOME_DENSITY_BONUS", "rule_family": "FAR_DENOMINATOR", "operation": "UNCHANGED", "predicates": ["ADU_PROGRAM_APPLIES"], "effective_from": "2023-05-06", "effective_through": None, "coastal_applicability": "OUTSIDE_COASTAL", "operand": None, "provenance": ["PACKET50_FAR_RULE_RECONSTRUCTION"]},
    ]
    return {
        "contract_version": CONTRACT_VERSION, "zone": "RM-2-5", "scope": ["ORDINARY_ADU", "ADU_HOME_DENSITY_BONUS"],
        "modifiers": modifiers,
        "height": {"operation": "UNCHANGED", "base_zone_maximum_preserved": True, "overlay_maximum_preserved": True, "footnote_18_preserved": True, "program_specific_numeric_increase_found": False, "predicates": ["ADU_PROGRAM_APPLIES"], "project_eligibility_evaluated": False},
        "far": {
            "maximum_far": {"operation": "UNCHANGED", "program_specific_rm_2_5_override_found": False},
            "numerator": {"operation": "UNCHANGED", "rule": "ADU floor area follows Code GFA unless a proven express exclusion applies; no blanket Home Density Bonus exclusion is modeled."},
            "denominator": {"operation": "UNCHANGED", "rule": "Total premises area remains the denominator."},
            "applicability": {"operation": "UNCHANGED", "rule": "Base RM-2-5 FAR remains applicable absent a proven external override."},
            "ordinary_single_adu_800_sq_ft_rule": {"state": "conditional", "effect": "Retained as an external ADU-specific exception candidate; it cannot be used for a 26-unit bonus project or any project until exact version and predicates are proven."},
        },
        "packet_50_context": {"plan_annotation": "ADU_HOME_DENSITY_BONUS_WITH_AFFORDABLE_ADUS", "annotation_proves_eligibility": False, "inside_sda_fact_changes_base_height_or_far": False},
    }


def evidence_requirements() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "families": {
            "STRUCTURE_HEIGHT": {"required": ["controlling_structure", "structure_separation", "existing_grade_surface", "proposed_grade_surface", "lower_grade_at_each_plumb_line", "lowest_applicable_grade", "highest_structure_point", "roof_parapet_and_appurtenance_classification", "coastal_height_limit_overlay", "community_plan", "side_setback_lines_and_above_30_ft_envelope"], "comparison_gate": "ALL_REQUIRED_SEMANTICS_SUPPORTED"},
            "FAR": {"required": ["code_compatible_gfa_schedule_all_buildings", "component_level_inclusion_exclusion_reconciliation", "legal_premises_identity", "total_premises_area", "required_dedication_status", "multiple_zone_areas", "unit_band", "program_modifier_predicates"], "comparison_gate": "NUMERATOR_AND_DENOMINATOR_BOTH_CODE_COMPATIBLE"},
            "SETBACK": {"required": ["legal_property_line_roles", "premises_width", "lot_width", "building_frame_geometry", "alley_width", "street_centerline_radius", "projection_classification", "fire_constraints"], "comparison_gate": "SELECTED_FORMULA_AND_EXCEPTIONS_RESOLVED"},
            "LOT_DIMENSIONS": {"required": ["legal_lot_identity", "recorded_boundary", "code_measurement_method", "corner_lot_status", "street_frontage"], "comparison_gate": "LEGAL_GEOMETRY_SUPPORTED"},
        },
        "fail_closed": "A missing prerequisite produces unknown/unresolved, never false and never compliant.",
    }


def truth_integration() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "mappings": [
            {"output": "authoritative_table_cell", "SourceState": "available", "FactState": "supported", "DerivationClass": "recorded"},
            {"output": "computed_proportional_setback_with_supported_inputs", "SourceState": "available", "FactState": "supported", "DerivationClass": "deterministic_derived"},
            {"output": "triggered_footnote_with_supported_predicates", "SourceState": "available", "FactState": "supported", "DerivationClass": "deterministic_derived"},
            {"output": "unresolved_footnote_predicate", "SourceState": "partial", "FactState": "unknown", "DerivationClass": "conditional"},
            {"output": "deferred_rule_family", "SourceState": "not_evaluated", "FactState": "unavailable", "DerivationClass": "conditional"},
            {"output": "predicate_proven_not_applicable", "SourceState": "available", "FactState": "not_applicable", "DerivationClass": "deterministic_derived"},
        ],
        "allowed_source_states": ["available", "partial", "source_unavailable", "not_evaluated"],
        "allowed_fact_states": ["supported", "partial", "unknown", "not_applicable", "unavailable"],
        "allowed_derivations": ["recorded", "deterministic_derived", "inferred", "conditional"],
        "new_categories_added": False,
    }


def packet50_replay() -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION, "project_id": "PRJ-1111087", "application_date": "2024-01-29", "selected_version_profile": "RM25_2023_05_06_OUTSIDE_COASTAL",
        "height": {"state": "HEIGHT_RULE_EVALUATION_UNRESOLVED", "base_branch": "40_FT_PLUS_FOOTNOTE_18_ANGLED_PLANE", "footnote_37": "NOT_TRIGGERED_BY_SUPPORTED_OUTSIDE_COASTAL_FACT", "precise_missing_evidence": ["controlling building/structure", "per-structure separation", "existing and proposed grade surfaces", "lower grade beneath each top point", "lowest applicable perimeter grade", "highest structure point", "roof/parapet/appurtenance classification", "side-setback angled-plane geometry above 30 ft"], "plan_label": "40'-0\"", "plan_label_is_code_measurement": False, "comparison": None},
        "far": {"state": "FAR_RULE_EVALUATION_UNRESOLVED", "unit_band": "RM25_FAR_8_PLUS", "maximum_ratio": "1.35", "plan_inputs": {"labeled_numerator_sq_ft": "22219.6", "labeled_denominator_sq_ft": "20084", "exact_recomputation": "1.106333399721171081457876916948814977096", "nearest_hundredth": "1.11", "displayed": "1.10"}, "precise_missing_numerator_evidence": ["all-building GFA schedule", "component inclusion/exclusion reconciliation under application-time §113.0234", "parking/roofed-open/phantom-floor treatment"], "precise_missing_denominator_evidence": ["legal premises identity", "smallest conveyable unit and unity of use", "recorded boundary and total premises area", "required dedication status", "multiple-zone area if applicable"], "program_modifier_predicates_proven": False, "comparison": None},
        "whole_project_compliance": False, "development_capacity": False,
    }


def sources() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "sources": [
        provenance("CURRENT_RESIDENTIAL", "SDMC Chapter 13, Article 1, Division 4 (7-2026), Table 131-04G and §§131.0443-131.0446", "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf", CURRENT_RESIDENTIAL_SHA, list(range(41, 59))),
        provenance("CURRENT_MEASUREMENT", "SDMC Chapter 11, Article 3, Division 2 (7-2026), §§113.0222, 113.0234, 113.0246, 113.0270", "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf", CURRENT_MEASUREMENT_SHA, list(range(9, 20))),
        provenance("CURRENT_DEFINITIONS", "SDMC Chapter 11 definitions (7-2026), Lot and Premises", "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division01.pdf", CURRENT_DEFINITIONS_SHA, [10]),
        provenance("O21618_APPLICATION_VERSION", "Ordinance O-21618 N.S.; effective outside Coastal 2023-05-06", "https://docs.sandiego.gov/council_reso_ordinance/rao2023/O-21618.pdf", O21618_SHA, [20, 21]),
        {"source_id": "O21836_STRIKEOUT_BOUNDARY", "citation": "O-21836 corrected strikeout, §113.0234 amendment boundary", "url": "https://docs.sandiego.gov/municode_strikeout_ord/O-21836-SO.pdf", "artifact_sha256": "2f9bbdac685280f658c03611fbdc21b0b3e6396fa92518735a6de5604ced6028", "pages": [9, 10, 11, 12, 13], "use": "Separates pre-amendment application profile from later FAR-definition text; later provisions are not back-applied."},
        {"source_id": "O22109_STRIKEOUT_BOUNDARY", "citation": "O-22109 corrected strikeout, §113.0234(b)(5)", "url": "https://docs.sandiego.gov/municode_strikeout_ord/O-22109-SO.pdf", "artifact_sha256": "b4f1125d64c9a20752e8eb2ddd247b7f1543e43248a899ffc74409b36dc5714e", "pages": [15], "use": "Shows the multiple-base-zone paragraph is a later addition and is excluded from the 2024-01-29 application profile."},
        {"source_id": "PACKET50_HEIGHT_RULE_RECONSTRUCTION", "citation": "Packet 50 public RM-2-5 height rule reconstruction backed by SDMC Table 131-04G and §§113.0270 and 131.0444", "url": None, "artifact_sha256": "784bfb53d7f967f14ef442c9cdf14dab26862844d19f0d7fa65bac5c9d05f65a", "pages": [], "use": "Carries the sealed bounded ADU/base-height interaction into the reusable interface without project facts."},
        {"source_id": "PACKET50_FAR_RULE_RECONSTRUCTION", "citation": "Packet 50 public RM-2-5 FAR rule reconstruction backed by SDMC Table 131-04G and §§113.0234 and 131.0446", "url": None, "artifact_sha256": "368eedc8c4845cb542eeeabffe3698ce8153237acffea5e422ce151f4c62e1eb", "pages": [], "use": "Carries the sealed bounded ADU/base-FAR interaction into the reusable interface without project facts."},
    ], "private_sources": [], "production_access": False}


def invariants() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "invariants": [
        "FOOTNOTE_REQUIRES_RECORDED_TRIGGER_BEFORE_MODIFYING_BASE",
        "UNIT_BAND_SELECTION_IS_EXPLICIT_EVEN_WHEN_VALUES_ARE_EQUAL",
        "HISTORICAL_PROFILE_CANNOT_USE_LATER_ORDINANCE_TEXT",
        "PROGRAM_MODIFIER_REQUIRES_ALL_PREDICATES",
        "PLAN_LABEL_NEVER_PROVES_CODE_DEFINITION_BY_ITSELF",
        "UNKNOWN_EVIDENCE_CANNOT_BECOME_FALSE",
        "DISTINCT_LEGAL_TABLE_CELLS_REMAIN_DISTINCT_RECORDS",
        "BASE_RULE_DEFINITION_FOOTNOTE_PROGRAM_AND_PROJECT_FACT_LAYERS_REMAIN_SEPARATE",
        "NO_CAPACITY_OR_WHOLE_PROJECT_COMPLIANCE_OUTPUT",
    ]}


def build_outputs() -> dict[str, Any]:
    premises, lot = area_semantics()
    outputs = {
        "schema.json": schema(), "version-profiles.json": versions(), "rm-2-5-base-rules.json": base_rules(), "footnotes.json": footnotes(),
        "height-definition.json": height_definition(), "rm-2-5-height-branches.json": height_branches(), "far-definition.json": far_definition(), "rm-2-5-far-branches.json": far_branches(),
        "premises-area-semantics.json": premises, "lot-area-semantics.json": lot, "setbacks.json": setbacks(), "unit-bands.json": unit_bands(),
        "program-modifier-interface.json": modifier_interface(), "rm-2-5-adu-interactions.json": adu_interactions(), "evidence-requirements.json": evidence_requirements(),
        "truth-state-integration.json": truth_integration(), "packet-50-replay.json": packet50_replay(), "invariants.json": invariants(), "provenance.json": sources(),
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "VERSIONED_REUSABLE_RM_RULE_LAYER_STARTING_WITH_RM_2_5", "production": False, "project_compliance": False, "capacity": False, "private_plan_publication": False},
        "decision.json": {"contract_version": CONTRACT_VERSION, "readiness": "RM_RULE_PROFILE_V0_READY", "next": "NEXT_FEASIBILITY_STEP: close Packet 50 FAR evidence", "reason": "Code-compatible GFA and legal premises area are the broadest remaining reusable prerequisites; closing them removes both numerator and denominator uncertainty before a numeric FAR comparison."},
    }
    outputs["integrity.json"] = integrity_artifact(outputs)
    return outputs


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
