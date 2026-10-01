"""Packet 36 bounded RS-1-7 interior-side-setback evaluator."""
from __future__ import annotations
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import (canonical_json, compare_values, conclusion_guard_fields, evaluate_evidence_gates, fingerprint, integrity_artifact, provenance_graph, unresolved_result, validate_contract)

CONTRACT_VERSION = "interior-side-setback-evaluator-v0-2026-10-01-p36"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "interior_side_setback_min"
PREDICATE_STATES = ("TRUE", "FALSE", "UNKNOWN", "SOURCE_UNAVAILABLE", "NOT_APPLICABLE")
FORBIDDEN_CONCLUSIONS = ("OVERALL_ZONING_COMPLIANCE", "LEGAL_NONCONFORMITY", "VARIANCE_REQUIREMENT", "PERMIT_VIOLATION", "DEVELOPMENT_CAPACITY", "BUILDABILITY", "ENTITLEMENT_LIKELIHOOD", "PERMIT_APPROVAL")


def _predicate(state: str, value: Any, basis: str, source: str, effect: str) -> dict[str, Any]:
    if state not in PREDICATE_STATES:
        raise ValueError(f"INVALID_PREDICATE_STATE:{state}")
    if state in {"UNKNOWN", "SOURCE_UNAVAILABLE"} and value is not None:
        raise ValueError("UNRESOLVED_PREDICATE_MUST_HAVE_NULL_VALUE")
    return {"state": state, "value": value, "basis": basis, "source": source, "effect": effect}


def _baseline_gates(parcel: Mapping[str, Any], legal_lot: Mapping[str, Any], rule: Mapping[str, Any], width: Mapping[str, Any], area: Mapping[str, Any], fire: Mapping[str, Any]) -> dict[str, bool]:
    identity, zoning = parcel.get("identity", {}), parcel.get("zoning", {})
    coastal, standards = parcel.get("coastal_context", {}), parcel.get("base_standards", {})
    return {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn") == width.get("apn") == area.get("apn") == fire.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "outside_coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards_version": standards.get("rule_set_version") == "sd-rs-base-standards-2026-09-30-v0" and standards.get("state") == "supported",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "legal_area": area.get("area_denominator", {}).get("state") == "RESOLVED_EXCLUDE_PUBLIC_RIGHT_OF_WAY",
        "resolved_width": width.get("state") == "RULE_REQUIREMENT_SATISFIED" and width.get("geometry_reconstruction", {}).get("reported_code_defined_lot_width_ft") == "94.00",
        "lot_classification": width.get("lot_classification", {}).get("state") == "SINGLE_FRONTAGE_INTERIOR_NON_CORNER",
        "side_lines": width.get("measurement_doctrine", {}).get("property_lines", {}).get("sides") == ["north rear-to-front boundary", "south rear-to-front boundary"],
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_shape": rule.get("fact_state") == "CONDITIONAL" and rule.get("operator") == "MIN" and rule.get("value", {}).get("number") == 4.0,
        "dependencies": set(rule.get("unresolved_dependencies", [])) == {"131.0443(a)(4)", "131.0443(i)", "131-04D:2"},
        "fire_doctrine": fire.get("state") == "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED" and fire.get("legal_doctrine", {}).get("scope") == "ALL_STRUCTURES_OUTSIDE_COASTAL_CURRENT_PROFILE",
    }


def evaluate_structure_compliance(*, requirement_state: str, measured_ft: Decimal | None, required_ft: Decimal | None, current_structure_geometry: bool, structure_classification: bool, measurement_semantics: bool, projection_scope_resolved: bool) -> dict[str, Any]:
    gates = {
        "requirement_resolved": requirement_state == "SETBACK_REQUIREMENT_RESOLVED",
        "current_structure_geometry": current_structure_geometry,
        "structure_classification": structure_classification,
        "measurement_semantics": measurement_semantics,
        "projection_scope_resolved": projection_scope_resolved,
        "measured_value": measured_ft is not None,
        "required_value": required_ft is not None,
    }
    gate = evaluate_evidence_gates(gates)
    if not gate.passed:
        return {"state": "SETBACK_COMPLIANCE_NOT_EVALUATED", "gates": gates, "failed_gates": list(gate.failed), "comparison": None}
    comparison = compare_values(measured=measured_ft, required=required_ft, unit="ft", operator="MIN", expression="measured_structure_interior_side_setback_ft >= applicable_interior_side_setback_ft")
    return {"state": comparison.state, "gates": gates, "failed_gates": [], "comparison": comparison.comparison}


def evaluate_interior_side_setback(parcel: dict[str, Any], legal_lot: dict[str, Any], rule: dict[str, Any], width: dict[str, Any], area: dict[str, Any], structure: dict[str, Any], fire: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    gates = _baseline_gates(parcel, legal_lot, rule, width, area, fire)
    gate = evaluate_evidence_gates(gates)
    if not gate.passed:
        return unresolved_result(contract_version=CONTRACT_VERSION, apn=EXPECTED_APN, rule_family="interior_side_setback", failed_gates=gate.failed, false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"))

    lot_width = Decimal(width["geometry_reconstruction"]["reported_code_defined_lot_width_ft"])
    zone_minimum_width = Decimal(str(width["applicable_rule"]["numeric_value"]))
    base = Decimal(str(rule["value"]["number"]))
    predicates = {
        "current_outside_coastal_profile": _predicate("TRUE", "outside-coastal-2026-09-30", "The parcel is supported outside Coastal and uses the current reviewed rule set.", "Parcel Intelligence V2 + RS Base Standards V0", "Selects the current outside-Coastal authority envelope."),
        "application_complete_date": _predicate("NOT_APPLICABLE", None, "This evaluator is limited to the current-version profile and does not adjudicate a protected earlier application.", "Packet 17 authority/version profile", "Earlier applications require a separately versioned evaluation."),
        "interior_side_property_lines": _predicate("TRUE", ["NORTH_BOUNDARY", "SOUTH_BOUNDARY"], "PM 17383 and §113.0246(d) resolve both non-street lines connecting east front to west rear as interior side lines.", "PM 17383 sheet 2 + Minimum Lot Width Evaluation V0", "Selects two interior-side measurement origins."),
        "lot_is_non_corner": _predicate("TRUE", True, "The sealed classification is SINGLE_FRONTAGE_INTERIOR_NON_CORNER.", "Minimum Lot Width Evaluation V0", "Uses the ordinary RS-1-7 minimum-width row and excludes street-side evaluation."),
        "lot_width_less_than_zone_minimum": _predicate("FALSE", False, "The sealed Code-defined width is 94.00 feet and the ordinary RS-1-7 minimum is 50 feet.", "Minimum Lot Width Evaluation V0 + Table 131-04D", "Excludes the mandatory 8-percent narrow-lot branch."),
        "lot_width_greater_than_50_ft": _predicate("TRUE", True, "The sealed Code-defined width is 94.00 feet.", "Minimum Lot Width Evaluation V0", "Makes optional side-setback reallocation legally available."),
        "side_setback_reallocation_elected": _predicate("UNKNOWN", None, "No proposed project, approved reallocation, or established-side-setback record is supplied.", "SDMC §131.0443(a)(4)(B)", "Controls whether the optional reallocation/continuation branch is selected."),
        "combined_table_side_setback_total": _predicate("TRUE", "8_FT_FOR_TWO_INTERIOR_SIDES", "This non-corner lot has two interior side lines and the RS-1-7 table minimum is 4 feet for each.", "Table 131-04D + resolved property-line roles", "A reallocation must preserve at least the 8-foot combined total."),
        "reallocated_interior_side_floor": _predicate("TRUE", "4_FT_EACH", "Section 131.0443(a)(4)(B)(ii) bars a reallocated side setback below 4 feet.", "SDMC §131.0443(a)(4)(B)(ii)", "For this parcel, reallocation cannot reduce either interior side below the table base."),
        "existing_primary_structure_addition": _predicate("UNKNOWN", None, "No proposed project scope or complete established-side-setback history is supplied.", "SDMC §§113.0249(d), 131.0443(a)(4)(B)(i)", "An addition may have to maintain an established reallocated side setback."),
        "established_side_setback_dimension": _predicate("UNKNOWN", None, "Historical outlines do not establish an approved reallocation or compliance-grade current dimension.", "Packet 17 Structure Facts V0", "Needed if the project is an addition subject to continuation rules."),
        "small_lot_accessory_building_encroachment": _predicate("FALSE", False, "The sealed Code lot area is 22,096.320 square feet, above the 10,000-square-foot ceiling.", "Minimum Lot Area Evaluation V0 + SDMC §131.0461(a)(12)", "Excludes the garage/non-habitable accessory-building side-yard encroachment."),
        "accessory_or_element_classification": _predicate("UNKNOWN", None, "No current or proposed element is classified.", "Packet 17 Structure Facts V0", "Controls element-specific projection, equipment, patio, pool, unroofed-structure, and other encroachment rules."),
        "permitted_projection_or_encroachment": _predicate("UNKNOWN", None, "No proposed element is tested against §131.0461(a)(1)-(12).", "SDMC §131.0461(a)", "Can change the allowed element edge while preserving the building-frame base setback."),
        "garage_within_embankment_rule": _predicate("NOT_APPLICABLE", None, "Section 131.0449(a) applies only to front and street-side yards.", "SDMC §131.0449(a)", "Does not alter an interior-side setback."),
        "fire_official_defensible_space_buffer": _predicate("UNKNOWN", None, "Packet 35 proves that mapped fire geography does not select a number; project review is required.", "Fire Defensible Space Predicate V0 + SDMC §131.0443(i)", "May require a buffer greater than the otherwise applicable side setback."),
        "document_modified_setback": _predicate("UNKNOWN", None, "The legal-lot chain is not a complete search for every ordinance, final subdivision, record of survey, or division-plat setback modification.", "SDMC §113.0249(b)-(c) + Legal Lot Evidence V0 limitation", "A controlling document can replace the calculated line."),
        "required_street_or_alley_dedication": _predicate("NOT_APPLICABLE", None, "The north and south interior lines abut land and are not street or alley lines in the sealed recorded map.", "PM 17383 sheet 2 + SDMC §113.0246(e)", "No alley remapping or current side-line dedication branch is selected."),
        "resubdivided_corner_lot": _predicate("FALSE", False, "The parcel is a single-frontage interior non-corner recorded lot.", "Minimum Lot Width Evaluation V0", "Excludes §113.0246(f) original-corner-line treatment."),
        "completely_underground_structure": _predicate("UNKNOWN", None, "No proposed structure is supplied.", "SDMC §113.0252(b)", "Completely underground construction has separate treatment."),
        "special_program_or_overlay_modification": _predicate("UNKNOWN", None, "No project/program scope or complete overlay-specific setback review is supplied.", "SDMC §131.0430(a)", "A separate applicable regulation may modify the base-zone envelope."),
    }
    branches = [
        {"branch_id": "BASE_TABLE_EACH_INTERIOR_SIDE", "value_ft": 4, "operator": "MIN", "modality": "REQUIRED_BASE", "parcel_disposition": "VALID_POSSIBLE_BRANCH", "conditions": ["No applicable established-side continuation", "No greater Fire Official buffer", "No controlling documentary/program modification"], "source": "SDMC §131.0431(a), Table 131-04D, RS-1-7 row"},
        {"branch_id": "NARROW_LOT_EIGHT_PERCENT_EACH_SIDE", "value_ft": "7.520", "formula": "8% × 94.00 ft", "operator": "MIN", "modality": "MANDATORY_IF_WIDTH_BELOW_MINIMUM", "parcel_disposition": "EXCLUDED_PREDICATE_FALSE", "conditions": ["Lot width is strictly less than applicable zone minimum"], "source": "SDMC §131.0443(a)(4)(A)"},
        {"branch_id": "OPTIONAL_SIDE_REALLOCATION", "value_ft": None, "operator": "COMBINED_MINIMUM_WITH_LINE_FLOORS", "modality": "MAY", "parcel_disposition": "AVAILABLE_BUT_NO_REDUCTION_BELOW_BASE_FOR_THIS_TWO_INTERIOR_SIDE_CONFIGURATION", "conditions": ["Lot width strictly greater than 50 feet", "Reallocation elected", "Combined side setbacks at least 8 feet", "Each reallocated interior side at least 4 feet"], "source": "SDMC §131.0443(a)(4)(B)(i)-(ii)"},
        {"branch_id": "ESTABLISHED_SIDE_SETBACK_FOR_ADDITION", "value_ft": None, "operator": "MAINTAIN_ESTABLISHED_DIMENSION", "modality": "REQUIRED_IF_APPLICABLE", "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED", "conditions": ["Project is an addition to primary structure", "A qualifying side setback was previously established"], "source": "SDMC §§113.0249(d), 131.0443(a)(4)(B)(i)"},
        {"branch_id": "ELEMENT_SPECIFIC_ENCROACHMENT", "value_ft": None, "operator": "ELEMENT_SPECIFIC", "modality": "PERMITTED_IF_ALL_CONDITIONS_MET", "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED", "conditions": ["Element is classified under §131.0461(a)", "Every applicable dimensional and location condition is met"], "source": "SDMC §131.0461(a)(1)-(12)"},
        {"branch_id": "FIRE_OFFICIAL_BUFFER", "value_ft": None, "operator": "GREATER_THAN_OTHERWISE_APPLICABLE", "modality": "MAY_REQUIRE", "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED", "conditions": ["Fire Code Official requires a project-specific greater defensible-space buffer"], "source": "SDMC §131.0443(i) + Fire Defensible Space Predicate V0"},
        {"branch_id": "DOCUMENT_OR_PROGRAM_MODIFICATION", "value_ft": None, "operator": "REPLACES_OR_MODIFIES_BASE", "modality": "CONDITIONAL", "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED", "conditions": ["A controlling document, program, or overlay modifies the base-zone side setback"], "source": "SDMC §§113.0249(b)-(c), 131.0430(a)"},
    ]
    unresolved = ["existing_primary_structure_addition", "established_side_setback_dimension", "accessory_or_element_classification", "permitted_projection_or_encroachment", "fire_official_defensible_space_buffer", "document_modified_setback", "special_program_or_overlay_modification"]
    requirement_state = "SETBACK_REQUIREMENT_CONDITIONAL"
    facts = structure.get("facts", [])
    historical = [x for x in facts if x.get("fact_key") == "historical_building_footprint_geometry"]
    current = [x for x in facts if x.get("fact_key") == "current_building_footprint_geometry" and x.get("fact_state") == "supported"]
    compliance = evaluate_structure_compliance(requirement_state=requirement_state, measured_ft=None, required_ft=None, current_structure_geometry=bool(current), structure_classification=False, measurement_semantics=True, projection_scope_resolved=False)
    result = {
        "contract_version": CONTRACT_VERSION, "apn": EXPECTED_APN, "rule_family": "interior_side_setback", "evaluation_scope": "RS_1_7_INTERIOR_SIDE_SETBACK_CURRENT_OUTSIDE_COASTAL_PROFILE_ONLY", "gates": gates,
        "parcel_identity": {"situs_address": parcel["identity"].get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"]},
        "zoning": {"zone_code": EXPECTED_ZONE, "coastal_state": "OUTSIDE_COASTAL", "standards_version": parcel["base_standards"]["rule_set_version"], "verified_as_of": parcel["base_standards"]["provenance"]["verified_as_of"]},
        "applicable_rule": {"rule_id": rule["rule_id"], "base_value_ft_each_interior_side": 4, "operator": "MIN", "fact_state": "CONDITIONAL", "requirement_state": requirement_state, "source_edition": rule["source_evidence"]["source_edition"], "source_table": rule["source_table"], "source_page": rule["source_page"], "source_sha256": rule["source_evidence"]["source_sha256"], "section_131_0443_text_sha256": authority["section_131_0443_text_sha256"], "section_131_0461_text_sha256": authority["section_131_0461_text_sha256"]},
        "width_analysis": {"code_defined_lot_width_ft": str(lot_width), "zone_minimum_width_ft": str(zone_minimum_width), "narrow_lot_threshold_met": lot_width < zone_minimum_width, "reallocation_threshold_met": lot_width > Decimal("50"), "strict_threshold_note": "Exactly 50 feet satisfies neither strict inequality."},
        "conditional_branches": branches, "valid_possible_requirement_branches": ["BASE_TABLE:4_FT_EACH", "ESTABLISHED_SIDE_SETBACK_FOR_ADDITION:VALUE_IF_APPLICABLE", "ELEMENT_SPECIFIC_ENCROACHMENT:VALUE_IF_APPLICABLE", "FIRE_OFFICIAL_BUFFER:GREATER_VALUE_IF_REQUIRED", "DOCUMENT_OR_PROGRAM_MODIFICATION:VALUE_IF_APPLICABLE"],
        "predicates": predicates, "unresolved_requirement_predicates": unresolved,
        "evidence_needed_to_select": {"project": "Current/proposed project type, structure classification, and whether work is an addition.", "established_setback": "Approval/history and compliance-grade dimension for any established reallocated side setback.", "element": "Element classification and geometry sufficient to test every applicable §131.0461(a) condition.", "fire": "Project-specific Fire Code Official evidence accepted by Packet 35.", "modifications": "Project/document review sufficient to exclude or apply controlling setback modifications and special programs."},
        "measurement_doctrine": {"interior_side_property_lines": {"north": "north rear-to-front boundary", "south": "south rear-to-front boundary", "basis": "§113.0246(d) and PM 17383"}, "setback_line": "For each side, a line parallel to the nearest side property line at the required inward distance; the intervening area is the required side yard (SDMC §113.0249(a)).", "direction": "Measured inward and perpendicular to the applicable north or south side property line (SDMC §113.0252(a)(2)).", "structure_edge": "For new-development compliance, measured to the outer edge of the building frame (SDMC §113.0252(c)); qualifying element-specific projections and encroachments remain governed by §131.0461(a).", "above_grade_scope": "Above-grade portions of underground parking, first stories, and basements are subject to setbacks; completely underground structures have the bounded exception in §113.0252(b).", "projection_treatment": "Roof projections, openly supported projections, bay windows, fireplaces, mechanical equipment, patios, dormers, low unroofed structures, pools/spas/hot tubs, and qualifying small-lot accessory buildings each retain their own §131.0461(a) conditions; no permission is selected without element facts.", "accessory_treatment": "The §131.0461(a)(12) garage/non-habitable accessory-building permission is unavailable because lot area exceeds 10,000 square feet; other accessory standards remain project/classification dependent.", "living_area_excluded": True, "required_inputs": ["resolved final parcel-specific requirement", "current authoritative structure geometry registered to legal boundaries", "structure/project classification", "projection/encroachment classification", "established-side-setback history if addition", "resolved Fire and documentary/program predicates"], "source": authority["measurement_source"]},
        "structure_evidence": {"assessor_living_area_available": any(x.get("fact_key") == "assessor_total_living_area_sq_ft" and x.get("fact_state") == "supported" for x in facts), "assessor_living_area_is_geometry": False, "historical_outline_count": len(historical), "authoritative_current_structure_geometry": bool(current), "completeness_proven": False, "structure_classification_resolved": False},
        "historical_diagnostic": {"classification": "HISTORICAL_DIAGNOSTIC_INTERIOR_SIDE_SETBACK", "lines": ["NORTH_INTERIOR_SIDE", "SOUTH_INTERIOR_SIDE"], "state": "NOT_MEASURED", "reason": "Packet 17 retains geometry hashes rather than coordinates, uses a Spring 2017 imagery baseline, and does not prove current completeness or compliance-grade registration to the legal side lines.", "source_vintage": historical[0]["source_vintage"] if historical else None, "source_record_ids": [x["source_record_id"] for x in historical], "current_compliance_evidence": False},
        "fire_integration": {"state": fire["state"], "greater_buffer_ft": fire["greater_buffer_ft"], "geography_determines_greater_buffer": fire["geography_determines_greater_buffer"], "source_fingerprint_sha256": fire["fingerprint_sha256"]},
        "state": requirement_state, "compliance_state": compliance["state"], "compliance": compliance,
        "bounded_conclusion": "The ordinary base is 4 feet from each north and south interior side line. The narrow-lot branch is excluded, and optional reallocation cannot reduce either line below 4 feet here. The final project-specific requirement remains conditional; current structure compliance is not evaluated.",
        "mandatory_qualifier": "This evaluates only the current outside-Coastal RS-1-7 interior-side-setback rule envelope. It does not establish current structure compliance, overall zoning compliance, capacity, legal nonconformity, or project approval.",
        "setback_family_assessment": {"state": "SETBACK_FAMILY_PATTERN_STABLE", "shared_pattern": "Evidence gates → rule selection → explicit predicates → valid branches → measurement doctrine → compliance gates → contained result.", "side_specific_extension": "Paired side lines add strict width thresholds, a combined-total reallocation permission with line-specific floors, and established-side continuation for additions without changing the shared evaluator contract."},
        "next_rule_evaluation_target": "street-side setback", "other_rule_families_evaluated": [],
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated", "capacity_calculated", "current_structure_compliance_evaluated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
