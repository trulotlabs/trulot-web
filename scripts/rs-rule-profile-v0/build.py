#!/usr/bin/env python3
"""Build deterministic Packet 58 RS Rule Profile V0 artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, sha256

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "rs-rule-profile-v0"

RESIDENTIAL_SHA = "9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538"
MEASUREMENT_SHA = "5766096f34fe5d5fd6b807e6c9aaa40393f31e6c4c76d85ff4de68cff032a345"
DEFINITIONS_SHA = "7a2234c4b02089867be21002036235c7eba2abebd60fa2ef0413a60b00a652ae"
O21934_SHA = "162f93058df3a250846da3bc6d7ac6a74e900a7ae0bf649be51da278e7da86b6"
O22109_SHA = "ed7c48fb1d182777615c9223353bc26e78f9cd058916e6d462557c5ea0e9a677"


def rule(rule_id: str, family: str, raw: str, value: Any, unit: str | None, comparator: str,
         footnotes: list[str] | None = None, predicates: list[str] | None = None,
         measurement: str | None = None, derivation: str = "recorded") -> dict[str, Any]:
    return {
        "rule_id": rule_id, "zone_code": "RS-1-7", "legal_version": "RS17_TABLE_131_04D",
        "effective_date": "2025-04-24", "effective_through": None,
        "coastal_applicability_profile": "VERSION_SELECTED_OUTSIDE_OR_INSIDE_COASTAL",
        "rule_family": family, "base_value": value, "raw_value": raw, "unit": unit,
        "comparator": comparator, "applicability_predicates": predicates or ["ZONE_IS_RS_1_7"],
        "footnotes": footnotes or [], "exceptions": [], "measurement_definition": measurement,
        "program_modifiers": [], "source_provenance": ["CURRENT_RESIDENTIAL_TABLE_131_04D"],
        "derivation_class": derivation, "unresolved_dependencies": [],
        "table_locator": {"table": "131-04D", "row": family, "column": "RS-1-7", "page": 33},
    }


def schema() -> dict[str, Any]:
    required = ["rule_id", "zone_code", "legal_version", "effective_date", "coastal_applicability_profile", "rule_family", "base_value", "unit", "comparator", "applicability_predicates", "footnotes", "exceptions", "measurement_definition", "program_modifiers", "source_provenance", "derivation_class", "unresolved_dependencies"]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "trulot://schemas/shared-base-zone-rule-profile-v0",
        "title": "Reusable residential base-zone rule record", "type": "object", "required": required,
        "properties": {
            "rule_id": {"type": "string"}, "zone_code": {"type": "string", "pattern": "^(RM|RS)-[0-9]+-[0-9]+$"},
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
        }, "additionalProperties": True,
        "layer_separation": ["BASE_ZONE_RULE", "DEFINITION_MEASUREMENT", "FOOTNOTE_EXCEPTION", "PROGRAM_MODIFIER", "PROJECT_FACT"],
        "compatibility_decision": "RS_PROFILE_SCHEMA_EXTENSION_REQUIRED: existing RM schema restricts zone_code to RM; this generic pattern extension preserves every field and layer for RM and RS",
    }


def versions() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "profiles": [
        {"profile_id": "RS17_OUTSIDE_COASTAL_2025_04_24", "zone": "RS-1-7", "effective_from": "2025-04-24", "effective_through": "2026-07-14", "coastal_context": "OUTSIDE_COASTAL", "table": "O-21934/Table 131-04D", "fire_section_131_0443_i": False, "sources": ["O21934"]},
        {"profile_id": "RS17_OUTSIDE_COASTAL_2026_07_15", "zone": "RS-1-7", "effective_from": "2026-07-15", "effective_through": None, "coastal_context": "OUTSIDE_COASTAL", "table": "compiled 9-2026/Table 131-04D", "fire_section_131_0443_i": True, "sources": ["CURRENT_RESIDENTIAL", "O22109"]},
        {"profile_id": "RS17_INSIDE_COASTAL_2025_09_21", "zone": "RS-1-7", "effective_from": "2025-09-21", "effective_through": "2026-09-09", "coastal_context": "INSIDE_COASTAL", "table": "O-21934 certified Coastal/Table 131-04D", "fire_section_131_0443_i": False, "sources": ["O21934"]},
        {"profile_id": "RS17_INSIDE_COASTAL_2026_09_10", "zone": "RS-1-7", "effective_from": "2026-09-10", "effective_through": None, "coastal_context": "INSIDE_COASTAL", "table": "O-21836 plus certified chain and O-21934/Table 131-04D", "fire_section_131_0443_i": False, "excluded_pending": ["O-22109"], "sources": ["INSIDE_COASTAL_LEGAL_VERSION_CHAIN", "O21934"]},
    ], "selection_rule": "Select independently by date and proven Coastal context; O-22109 is current outside Coastal and remains pending inside Coastal.", "benchmark_preservation": "The 1456 27th St replay selects current outside-Coastal law; no later law is back-applied to earlier benchmarks."}


def base_rules() -> dict[str, Any]:
    rows = [
        rule("RS17_DENSITY", "DENSITY_BASIS", "1", "1", "dwelling_unit_per_lot", "PROCESS", predicates=["ZONE_IS_RS_1_7"], measurement="BASE_ZONE_DENSITY_ONLY"),
        rule("RS17_MIN_LOT_AREA", "MINIMUM_LOT_AREA", "5,000", "5000", "sq_ft", "MIN", measurement="SDMC_LOT_AREA"),
        rule("RS17_MIN_LOT_WIDTH", "MINIMUM_LOT_WIDTH", "50", "50", "ft", "MIN", measurement="SDMC_LOT_WIDTH"),
        rule("RS17_MIN_STREET_FRONTAGE", "MINIMUM_STREET_FRONTAGE", "50", "50", "ft", "MIN", predicates=["ZONE_IS_RS_1_7", "NO_131_0442_A_REDUCTION"], measurement="SDMC_STREET_FRONTAGE"),
        rule("RS17_MIN_CORNER_WIDTH", "MINIMUM_CORNER_LOT_WIDTH", "55", "55", "ft", "MIN", predicates=["ZONE_IS_RS_1_7", "LOT_IS_CORNER"], measurement="SDMC_LOT_WIDTH"),
        rule("RS17_MIN_LOT_DEPTH", "MINIMUM_LOT_DEPTH", "95", "95", "ft", "MIN", measurement="SDMC_LOT_DEPTH"),
        rule("RS17_FRONT_SETBACK", "FRONT_SETBACK", "(1) 15", "15", "ft", "MIN", ["FN1"], measurement="SDMC_113_0252"),
        rule("RS17_INTERIOR_SIDE_SETBACK", "INTERIOR_SIDE_SETBACK", "4(2)", "4", "ft", "FORMULA", ["FN2"], measurement="SDMC_113_0252"),
        rule("RS17_STREET_SIDE_SETBACK", "STREET_SIDE_SETBACK", "5(2)", "5", "ft", "FORMULA", ["FN2"], predicates=["ZONE_IS_RS_1_7", "STREET_SIDE_PROPERTY_LINE_EXISTS"], measurement="SDMC_113_0252"),
        rule("RS17_REAR_SETBACK", "REAR_SETBACK", "(3) 13", "13", "ft", "FORMULA", ["FN3"], measurement="SDMC_113_0252"),
        rule("RS17_STRUCTURE_HEIGHT", "STRUCTURE_HEIGHT", "(4) 24/30", {"setback_line_ft": "24", "overall_ft": "30"}, "ft", "MAX", ["FN4"], measurement="SDMC_113_0270_AND_131_0444"),
        rule("RS17_FAR", "FAR", "(5) varies", None, "ratio", "FORMULA", ["FN5"], predicates=["ZONE_IS_RS_1_7", "CODE_LOT_AREA_AVAILABLE"], measurement="SDMC_113_0234_AND_131_0446"),
        rule("RS17_LOT_COVERAGE", "LOT_COVERAGE", "applies", None, "percent", "FORMULA", predicates=["ZONE_IS_RS_1_7", "STEEP_HILLSIDE_SHARE_KNOWN"], measurement="SDMC_LOT_COVERAGE"),
    ]
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "rules": rows, "direct_cross_references": ["resubdivided corner-lot setbacks", "hardscape", "accessory structures", "garage placement", "structure spacing", "third-story requirements", "projections", "supplemental regulations", "refuse/recyclables", "visibility", "environmentally sensitive lands"], "capacity_calculation_authorized": False}


def definitions() -> dict[str, Any]:
    items = {
        "lot": {"meaning": "Legally established parcel, tract, or area of land under SDMC §113.0237; APN identity alone is insufficient.", "source": "SDMC §113.0237"},
        "premises": {"meaning": "Land and structures with unity of use constituting the smallest conveyable unit.", "source": "SDMC Chapter 11 definitions"},
        "lot_area": {"meaning": "Area bounded by Code-determined property lines; public right-of-way treatment follows §113.0246.", "source": "SDMC §§113.0222, 113.0246"},
        "lot_width": {"meaning": "Perpendicular distance between side lot lines at the midpoint of the front-to-rear depth line.", "source": "SDMC Chapter 11 measurement rules"},
        "lot_depth": {"meaning": "Straight-line distance from midpoint of front property line to midpoint of rear property line.", "source": "SDMC Chapter 11 measurement rules"},
        "street_frontage": {"meaning": "Length of premises property line along the street it borders.", "source": "SDMC Chapter 11 definitions"},
        "front_property_line": {"meaning": "Street-adjoining line selected under §113.0246, including corner and double-fronted rules.", "source": "SDMC §113.0246(a)-(b)"},
        "side_property_line": {"meaning": "Property line connecting front and rear lines and not selected as a front line.", "source": "SDMC §113.0246"},
        "street_side_property_line": {"meaning": "Side property line abutting public right-of-way; alley adjacency does not create one.", "source": "SDMC §113.0246(d)-(e)"},
        "rear_property_line": {"meaning": "Line opposite and most distant from the front line under the Code classification rules.", "source": "SDMC §113.0246"},
        "structure_edge": {"meaning": "Setback comparison uses the qualifying structure/building feature and projection rules, not an undifferentiated footprint.", "source": "SDMC §§113.0252, 131.0461"},
        "structure_height": {"meaning": "Measured at plumb lines to the lower of existing or proposed grade and subject to overall, topographic, roof, parapet, and appurtenance rules.", "source": "SDMC §113.0270"},
        "far": {"meaning": "Gross floor area of all buildings on a premises divided by total premises area, with express component rules.", "source": "SDMC §113.0234"},
    }
    return {"contract_version": CONTRACT_VERSION, "definitions": items, "source_sha256": {"measurement": MEASUREMENT_SHA, "definitions": DEFINITIONS_SHA}, "policy": "Definitions are authoritative measurement semantics, separate from table values and project facts."}


def footnotes() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "footnotes": [
        {"footnote_id": "FN1", "families": ["FRONT_SETBACK"], "trigger_predicates": ["AT_LEAST_HALF_FRONT_50_FT_DEPTH_HAS_MIN_SLOPE_25_PERCENT", "SETBACK_IS_CLOSEST_TO_STREET", "REDUCTION_ELECTED"], "effect": {"kind": "NUMERIC_PERMISSION", "minimum_ft": "6"}, "evidence": ["code_compatible_slope_analysis", "frontage_and_depth_geometry", "election"], "source": "Table 131-04D footnote 1", "version": "ALL_MODELED"},
        {"footnote_id": "FN2", "families": ["INTERIOR_SIDE_SETBACK", "STREET_SIDE_SETBACK"], "trigger_predicates": ["SECTION_131_0443_A_4_APPLIES"], "effect": {"kind": "FORMULA", "value": "APPLY_SIDE_WIDTH_AND_REALLOCATION_BRANCHES"}, "evidence": ["code_lot_width", "line_roles", "reallocation_election"], "source": "Table 131-04D footnote 2", "version": "ALL_MODELED"},
        {"footnote_id": "FN3", "families": ["REAR_SETBACK"], "trigger_predicates": ["SECTION_131_0443_A_2_APPLIES"], "effect": {"kind": "FORMULA", "value": "APPLY_DEPTH_AND_ALLEY_BRANCHES"}, "evidence": ["code_lot_depth", "rear_alley_status"], "source": "Table 131-04D footnote 3", "version": "ALL_MODELED"},
        {"footnote_id": "FN4", "families": ["STRUCTURE_HEIGHT"], "trigger_predicates": ["SECTION_131_0444_B_APPLIES"], "effect": {"kind": "GEOMETRIC_ENVELOPE", "value": "APPLY_TABLE_131_04H_ANGLE"}, "evidence": ["code_lot_width", "setback_lines", "code_grade_and_top_geometry"], "source": "Table 131-04D footnote 4", "version": "ALL_MODELED"},
        {"footnote_id": "FN5", "families": ["FAR"], "trigger_predicates": ["SECTION_131_0446_A_APPLIES"], "effect": {"kind": "FORMULA", "value": "APPLY_TABLE_131_04J_AND_STEEP_HILLSIDE_BRANCH"}, "evidence": ["code_lot_area", "premises_identity", "code_gfa", "steep_hillside_share"], "source": "Table 131-04D footnote 5", "version": "ALL_MODELED"},
    ], "unknown_policy": "A missing trigger predicate produces UNKNOWN and cannot select the no-footnote branch."}


def setbacks() -> dict[str, Any]:
    fire = {"branch_id": "FIRE_OFFICIAL_GREATER_BUFFER", "predicate": "PROJECT_SPECIFIC_FIRE_OFFICIAL_BUFFER_REQUIRED", "effect": "GREATER_THAN_OTHERWISE_APPLICABLE", "value_ft": None, "version_gate": "SECTION_131_0443_I_EFFECTIVE"}
    projections = {"source": "SDMC §131.0461", "treatment": "SEPARATE_FEATURE_SPECIFIC_EXCEPTION", "policy": "Never subtract from base setback without qualifying feature and dimension evidence."}
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "profiles": {
        "front": {"base_ft": "15", "branches": [
            {"branch_id": "BASE", "effect_ft": "15"},
            {"branch_id": "CUL_DE_SAC", "predicates": ["FRONTS_CUL_DE_SAC", "REDUCTION_ELECTED"], "formula": "max(5, table-5)", "effect_ft": "10"},
            {"branch_id": "SLOPE", "predicates": ["AT_LEAST_HALF_FRONT_50_FT_DEPTH_HAS_MIN_SLOPE_25_PERCENT", "SETBACK_IS_CLOSEST_TO_STREET", "REDUCTION_ELECTED"], "effect_ft": "6"}, fire], "projections": projections},
        "rear": {"base_ft": "13", "branches": [
            {"branch_id": "DEPTH_LT_100", "predicate": "LOT_DEPTH_LT_100", "formula": "max(5, 10% lot depth)"},
            {"branch_id": "DEPTH_100_TO_150", "predicate": "100_LE_LOT_DEPTH_LE_150", "effect_ft": "13"},
            {"branch_id": "DEPTH_GT_150", "predicate": "LOT_DEPTH_GT_150", "formula": "max(13, 10% lot depth)"},
            {"branch_id": "REAR_ALLEY", "predicate": "REAR_ABUTS_ALLEY", "effect": "credit half alley width capped at 10 ft; at least 5 ft remains on premises"},
            {"branch_id": "ALLEY_PARKING_ACCESS", "predicate": "NONPARALLEL_PARKING_ACCESSED_FROM_ALLEY", "effect": "21 ft between opposite alley ROW edge and nearest garage/stall edge"}, fire], "projections": projections},
        "interior_side": {"base_each_ft": "4", "branches": [
            {"branch_id": "WIDTH_BELOW_ZONE_MIN", "predicate": "LOT_WIDTH_LT_50", "formula": "8% lot width each side"},
            {"branch_id": "REALLOCATION", "predicates": ["LOT_WIDTH_GT_50", "REALLOCATION_ELECTED"], "combined_min_ft": "8", "each_interior_floor_ft": "4", "street_side_floor_ft": "10"},
            {"branch_id": "ESTABLISHED_SIDE_FOR_ADDITION", "predicate": "QUALIFYING_PRIMARY_STRUCTURE_ADDITION", "effect": "maintain qualifying established side dimension"}, fire], "projections": projections},
        "street_side": {"applicability": "STREET_SIDE_PROPERTY_LINE_EXISTS", "base_ft": "5", "not_applicable_state": "NOT_APPLICABLE", "branches": [{"branch_id": "REALLOCATION", "predicates": ["LOT_WIDTH_GT_50", "REALLOCATION_ELECTED"], "street_side_floor_ft": "10"}, fire], "projections": projections},
    }, "document_or_program_override": "External modifier only; no project document is inferred."}


def height() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "raw_cell": "(4) 24/30", "branches": [
        {"branch_id": "SETBACK_LINE_HEIGHT", "maximum_ft": "24", "applies_at": ["required_side_yards", "front_and_street_side_yards_when_overall_height_exceeds_27_ft"]},
        {"branch_id": "OVERALL_HEIGHT", "maximum_ft": "30", "applies_at": ["overall_structure_high_point_subject_to_measurement_rules"]},
        {"branch_id": "ANGLED_ENVELOPE_LT_75", "predicate": "LOT_WIDTH_LT_75", "angle_degrees_from_vertical_inward": "45"},
        {"branch_id": "ANGLED_ENVELOPE_75_TO_150", "predicate": "75_LE_LOT_WIDTH_LE_150", "angle_degrees_from_vertical_inward": "30"},
        {"branch_id": "ANGLED_ENVELOPE_GT_150", "predicate": "LOT_WIDTH_GT_150", "angle": "NOT_APPLICABLE"},
    ], "measurement": {"section": "SDMC §113.0270", "plumb_line": "lower of existing or proposed grade directly below", "overall": "lowest applicable grade near structure to highest point, subject to express topographic rule", "roof_and_topography": "requires classification under express Code provisions"}, "overlay_policy": "Any overlay or program change attaches as a separate proven modifier.", "evidence_prerequisites": ["code_lot_width", "required_setback_lines", "existing_grade", "proposed_grade", "highest_structure_points", "roof_parapet_appurtenance_classification", "overlay_and_program_predicates"], "unsupported_shortcut": "24/30 is not one interchangeable maximum."}


def far() -> dict[str, Any]:
    bands = [["0", "3000", "0.70"], ["3001", "4000", "0.65"], ["4001", "5000", "0.60"], ["5001", "6000", "0.59"], ["6001", "7000", "0.58"], ["7001", "8000", "0.57"], ["8001", "9000", "0.56"], ["9001", "10000", "0.55"], ["10001", "11000", "0.54"], ["11001", "12000", "0.53"], ["12001", "13000", "0.52"], ["13001", "14000", "0.51"], ["14001", "15000", "0.50"], ["15001", "16000", "0.49"], ["16001", "17000", "0.48"], ["17001", "18000", "0.47"], ["18001", "19000", "0.46"], ["19001", None, "0.45"]]
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "raw_cell": "(5) varies", "ordinary_branch": {"source": "SDMC §131.0446(a)(1), Table 131-04J", "selector": "CODE_LOT_AREA_SQ_FT", "bands": [{"minimum": a, "maximum": b, "maximum_far": c} for a,b,c in bands]}, "steep_hillside_branch": {"source": "SDMC §131.0446(a)(2)", "predicates": ["LOT_AREA_EXCEEDS_ZONE_MINIMUM", "STEEP_HILLSIDES_OVER_50_PERCENT"], "maximum_gfa_formula": "max(non_steep_hillside_area, minimum_zone_lot_area) + 25% of remaining lot area", "result_type": "MAXIMUM_GFA_FORMULA_NOT_SINGLE_FAR_RATIO"}, "definition": {"source": "SDMC §113.0234", "numerator": "Code-compatible gross floor area of all buildings", "denominator": "total area of legal premises"}, "unknown_policy": "If hillside share or Code-compatible numerator/denominator is missing, evaluation remains unresolved."}


def density() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "base_rule": {"raw_cell": "1", "meaning": "one dwelling unit per lot", "source": "Table 131-04D", "operator": "PROCESS"}, "doctrine": "This is a base-zone fact, not final development capacity.", "excluded_from_base_result": ["ADU", "JADU", "ADU_HOME_DENSITY_BONUS", "SB9", "COMPLETE_COMMUNITIES", "SDA", "AFFORDABLE_BONUS", "OTHER_PROGRAMS"], "development_capacity_calculated": False}


def lot_coverage() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "branches": [
        {"branch_id": "STEEP_HILLSIDE_PREMISES", "predicate": "MORE_THAN_50_PERCENT_OF_PREMISES_CONTAINS_STEEP_HILLSIDES", "maximum_percent": "50", "source": "SDMC §131.0445(a)"},
        {"branch_id": "OTHERWISE", "predicate": "STEEP_HILLSIDE_PREDICATE_FALSE", "value": "NOT_SPECIFIED", "source": "No general numeric RS-1-7 lot-coverage maximum in §131.0445"},
        {"branch_id": "UNKNOWN", "predicate": "STEEP_HILLSIDE_PREDICATE_UNKNOWN", "value": "UNRESOLVED"},
    ], "policy": "The conditional 50 percent maximum is not generalized to every RS-1-7 premises."}


def modifiers() -> dict[str, Any]:
    programs = ["ORDINARY_ADU_JADU", "ADU_HOME_DENSITY_BONUS", "SB9", "COMPLETE_COMMUNITIES", "SDA", "FIRE_REQUIREMENTS", "COASTAL_APPLICABILITY"]
    return {"contract_version": CONTRACT_VERSION, "schema": {"required": ["modifier_id", "program", "rule_family", "operation", "predicates", "effective_from", "effective_through", "coastal_applicability", "operand", "provenance"], "operations": ["OVERRIDE", "EXEMPTION", "ADDITIVE", "UNCHANGED"], "predicate_policy": "Apply only when every predicate is supported; false leaves base unchanged; unknown remains unknown."}, "program_stubs": [{"program": p, "implementation": "INTERFACE_ONLY", "base_rule_mutated": False} for p in programs], "invariant": "Program label, geography, or plan annotation does not prove eligibility or an operand."}


def fire() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "doctrine": {"mapped_fire_hazard": "CONTEXT_ONLY", "project_specific_fire_official_determination": "SEPARATE_REQUIRED_EVIDENCE", "missing_determination": "UNKNOWN_NOT_FALSE", "effect": "May require a greater defensible-space buffer and never silently reduces a base setback."}, "versioning": {"outside_coastal_from_2026_07_15": "§131.0443(i) included by O-22109", "inside_coastal_current": "§131.0443(i) excluded because O-22109 remains pending in the established chain"}, "apn_specific_logic": False}


def slope() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "predicate": "At least one-half of the front 50 feet of lot depth has a minimum slope gradient of 25 percent.", "required_evidence": ["legal boundary and front-line role", "front 50-foot depth geometry", "authoritative Code-compatible elevation surface", "method computing area/extent meeting minimum gradient", "reviewable calculation"], "generic_dem_limit": "A diagnostic DEM does not alone establish the legal surface, required precision, boundary alignment, or Code-compatible gradient determination.", "unresolved_outcome": "FRONT_SETBACK_BRANCH_UNRESOLVED; do not treat predicate as false", "dem_research_reopened": False}


def evidence() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "families": {
        "LOT_AREA": {"required": ["legal_premises_identity", "recorded_boundary", "code_property_lines", "code_defined_lot_area"]},
        "WIDTH_DEPTH_FRONTAGE": {"required": ["legal_boundary_geometry", "front_rear_side_line_roles", "code_measurement_semantics"]},
        "SETBACKS": {"required": ["property_line_roles", "branch_predicates", "version_and_coastal_context"], "compliance_additional": ["current_or_proposed_structure_geometry", "feature_classification", "projection predicates"]},
        "STRUCTURE_HEIGHT": {"required": ["code_lot_width", "setback_lines", "existing_and_proposed_grade", "highest_points", "roof_topography_overlay_predicates"]},
        "FAR": {"required": ["legal_premises_identity", "code_compatible_gfa", "total_premises_area", "lot_area_band", "steep_hillside_share", "program_predicates"]},
        "LOT_COVERAGE": {"required": ["legal_premises_identity", "steep_hillside_share", "code_compatible_coverage_components"]},
    }, "gate": "Missing required evidence yields UNKNOWN or NOT_EVALUATED, never a favorable default."}


def replay() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "apn": "6341302200", "address": "1456 27th St", "profile": "RS17_OUTSIDE_COASTAL_2026_07_15", "results": {
        "minimum_lot_area": {"state": "SATISFIED", "measured": "22096.320 sq ft", "required": "5000 sq ft", "source_artifact": "data/minimum-lot-area-evaluation-v0/evaluation.json"},
        "minimum_lot_width": {"state": "SATISFIED", "measured": "94.00 ft", "required": "50 ft", "source_artifact": "data/minimum-lot-width-evaluation-v0/evaluation.json"},
        "minimum_lot_depth": {"state": "SATISFIED", "measured": "235.02 ft", "required": "95 ft", "source_artifact": "data/minimum-lot-depth-evaluation-v0/evaluation.json"},
        "minimum_frontage": {"state": "SATISFIED", "measured": "94.00 ft", "required": "50 ft", "source_artifact": "data/minimum-frontage-evaluation-v0/evaluation.json"},
        "front_setback": {"state": "CONDITIONAL", "source_artifact": "data/front-setback-evaluator-v0/evaluation.json"},
        "rear_setback": {"state": "CONDITIONAL", "ordinary_depth_branch_ft": "23.502", "source_artifact": "data/rear-setback-evaluator-v0/evaluation.json"},
        "interior_side_setback": {"state": "CONDITIONAL", "ordinary_base_each_ft": "4", "source_artifact": "data/interior-side-setback-evaluator-v0/evaluation.json"},
        "street_side_setback": {"state": "NOT_APPLICABLE", "value": None, "source_artifact": "data/street-side-setback-applicability-v0/evaluation.json"},
    }, "differences_from_prior": [], "whole_project_compliance": False, "development_capacity": False}


def public_consistency() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "zone": "RS-1-7", "approved_public_parameters": [
        {"family": "MINIMUM_LOT_WIDTH", "value": "50", "unit": "ft"},
        {"family": "MINIMUM_CORNER_LOT_WIDTH", "value": "55", "unit": "ft", "qualifier": "corner lots only"},
        {"family": "MINIMUM_LOT_DEPTH", "value": "95", "unit": "ft"},
    ], "profile_supply": "EXACT_MATCH", "truth_semantics_changed": False, "ui_wired": False, "excluded_standards_exposed": False}


def family_extension() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "decision": "RS_ZONE_FAMILY_EXTENSION_READY", "zones": [f"RS-1-{i}" for i in range(1, 15)], "basis": "Tables 131-04D and 131-04E are already structured by the same rule families, locators, footnote references, definitions, and version axes.", "schema_change_required": False, "research_policy": "Zone cells and their footnotes must still be transcribed and tested; unresolved source footnote 8 for RS-1-8 through RS-1-14 remains explicit and does not block RS-1-7 or the shared architecture."}


def invariants() -> dict[str, Any]:
    names = ["CURRENT_AND_HISTORICAL_LAW_ISOLATED", "COASTAL_VERSIONS_ISOLATED", "FOOTNOTE_TRIGGER_REQUIRED", "UNKNOWN_IS_NOT_FALSE", "NOT_APPLICABLE_IS_NOT_ZERO", "FIRE_CONTEXT_IS_NOT_PROJECT_DETERMINATION", "DENSITY_IS_NOT_CAPACITY", "BASE_ZONE_RULE_IS_NOT_PROGRAM_RESULT", "PLAN_FACT_IS_NOT_PUBLIC_RULE", "NO_UNSUPPORTED_HEIGHT_OR_FAR_CONCLUSION", "TABLE_CELL_IS_SEPARATE_FROM_DEFINITION", "PROJECT_FACTS_DO_NOT_MUTATE_PROFILE"]
    return {"contract_version": CONTRACT_VERSION, "invariants": names}


def provenance() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "sources": {
        "CURRENT_RESIDENTIAL_TABLE_131_04D": {"title": "SDMC Chapter 13 Article 1 Division 4 (9-2026)", "url": "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf", "sha256": RESIDENTIAL_SHA, "pages": [33, 57, 58, 59, 60, 61, 64, 65, 66]},
        "CURRENT_MEASUREMENT": {"title": "SDMC Chapter 11 Article 3 Division 2", "url": "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf", "sha256": MEASUREMENT_SHA},
        "CURRENT_DEFINITIONS": {"title": "SDMC Chapter 11 definitions", "sha256": DEFINITIONS_SHA},
        "O21934": {"sha256": O21934_SHA, "role": "table and Coastal-effective version chain"},
        "O22109": {"sha256": O22109_SHA, "role": "outside-Coastal current Fire buffer and amendment boundary"},
    }, "derived_from_public_sources_only": True, "private_plans_included": False}


def decision() -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "schema": "RS_PROFILE_SCHEMA_EXTENSION_REQUIRED: existing RM schema restricts zone_code to RM; generic zone pattern extension only", "family_extension": "RS_ZONE_FAMILY_EXTENSION_READY", "readiness": "RS_RULE_PROFILE_V0_READY", "architecture": "FEASIBILITY_ARCHITECTURE_READY_FOR_BOUNDED_PRODUCT_CONTRACT", "next": "NEXT_FEASIBILITY_STEP: bounded feasibility product contract", "production": False, "capacity_calculated": False}


def build_outputs() -> dict[str, Any]:
    outputs = {
        "contract.json": {"contract_version": CONTRACT_VERSION, "scope": "REUSABLE_VERSIONED_RS_BASE_ZONE_RULE_PROFILE", "zone": "RS-1-7", "production": False, "ui": False, "capacity": False},
        "schema.json": schema(), "version-profiles.json": versions(), "rs-1-7-base-rules.json": base_rules(),
        "definitions.json": definitions(), "footnotes.json": footnotes(), "setbacks.json": setbacks(),
        "height.json": height(), "far.json": far(), "density.json": density(), "lot-coverage.json": lot_coverage(),
        "program-modifier-interface.json": modifiers(), "fire-doctrine.json": fire(), "slope-dependency.json": slope(),
        "evidence-requirements.json": evidence(), "apn-6341302200-replay.json": replay(),
        "public-page-consistency.json": public_consistency(), "family-extension.json": family_extension(),
        "invariants.json": invariants(), "provenance.json": provenance(), "decision.json": decision(),
    }
    integrity = {name: sha256(value) for name, value in sorted(outputs.items())}
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "algorithm": "SHA-256 of canonical JSON with final newline", "files": integrity}
    return outputs


def write_outputs() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = build_outputs()
    for path in OUTPUT.glob("*.json"):
        if path.name not in outputs:
            path.unlink()
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    write_outputs()
