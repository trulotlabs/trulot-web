"""Packet 32 bounded RS-1-7 front-setback evaluator."""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import (  # noqa: E402
    canonical_json,
    compare_values,
    conclusion_guard_fields,
    evaluate_evidence_gates,
    fingerprint,
    integrity_artifact,
    provenance_graph,
    unresolved_result,
    validate_contract,
)


CONTRACT_VERSION = "front-setback-evaluator-v0-2026-10-01-p32"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "front_setback_min"
PREDICATE_STATES = ("TRUE", "FALSE", "UNKNOWN", "SOURCE_UNAVAILABLE", "NOT_APPLICABLE")
REQUIREMENT_STATES = ("SETBACK_REQUIREMENT_RESOLVED", "SETBACK_REQUIREMENT_CONDITIONAL", "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE")
COMPLIANCE_STATES = ("RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED", "SETBACK_COMPLIANCE_NOT_EVALUATED")
FORBIDDEN_CONCLUSIONS = (
    "OVERALL_ZONING_COMPLIANCE",
    "LEGAL_NONCONFORMITY",
    "VARIANCE_REQUIREMENT",
    "PERMIT_VIOLATION",
    "DEVELOPMENT_CAPACITY",
    "BUILDABILITY",
    "ENTITLEMENT_LIKELIHOOD",
    "PERMIT_APPROVAL",
)


def _predicate(state: str, value: Any, basis: str, source: str, effect: str) -> dict[str, Any]:
    if state not in PREDICATE_STATES:
        raise ValueError(f"INVALID_PREDICATE_STATE:{state}")
    if state in {"UNKNOWN", "SOURCE_UNAVAILABLE"} and value is not None:
        raise ValueError("UNRESOLVED_PREDICATE_MUST_HAVE_NULL_VALUE")
    return {"state": state, "value": value, "basis": basis, "source": source, "effect": effect}


def _baseline_gates(parcel: Mapping[str, Any], legal_lot: Mapping[str, Any], rule: Mapping[str, Any]) -> dict[str, bool]:
    identity = parcel.get("identity", {})
    zoning = parcel.get("zoning", {})
    coastal = parcel.get("coastal_context", {})
    standards = parcel.get("base_standards", {})
    return {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "outside_coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards_version": standards.get("rule_set_version") == "sd-rs-base-standards-2026-09-30-v0" and standards.get("state") == "supported",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_shape": rule.get("fact_state") == "CONDITIONAL" and rule.get("operator") == "MIN" and rule.get("value", {}).get("number") == 15.0,
        "dependencies": set(rule.get("unresolved_dependencies", [])) == {"131.0443(a)(1)", "131.0443(i)", "131-04D:1"},
    }


def evaluate_structure_compliance(*, requirement_state: str, measured_ft: Decimal | None, required_ft: Decimal | None, current_structure_geometry: bool, measurement_semantics: bool, projection_scope_resolved: bool) -> dict[str, Any]:
    gates = {
        "requirement_resolved": requirement_state == "SETBACK_REQUIREMENT_RESOLVED",
        "current_structure_geometry": current_structure_geometry,
        "measurement_semantics": measurement_semantics,
        "projection_scope_resolved": projection_scope_resolved,
        "measured_value": measured_ft is not None,
        "required_value": required_ft is not None,
    }
    result = evaluate_evidence_gates(gates)
    if not result.passed:
        return {"state": "SETBACK_COMPLIANCE_NOT_EVALUATED", "gates": gates, "failed_gates": list(result.failed), "comparison": None}
    comparison = compare_values(
        measured=measured_ft, required=required_ft, unit="ft", operator="MIN",
        expression="measured_structure_setback_ft >= applicable_front_setback_ft",
    )
    return {"state": comparison.state, "gates": gates, "failed_gates": [], "comparison": comparison.comparison}


def evaluate_front_setback(parcel: dict[str, Any], legal_lot: dict[str, Any], rule: dict[str, Any], proposal: dict[str, Any], structure: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    gates = _baseline_gates(parcel, legal_lot, rule)
    gate_result = evaluate_evidence_gates(gates)
    if not gate_result.passed:
        return unresolved_result(
            contract_version=CONTRACT_VERSION,
            apn=EXPECTED_APN,
            rule_family="front_setback",
            failed_gates=gate_result.failed,
            false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"),
        )

    predicates = {
        "current_outside_coastal_profile": _predicate("TRUE", "outside-coastal-2026-09-30", "Parcel Coastal mapping is supported OUTSIDE_COASTAL and the selected rule set is the current 9-2026 outside-Coastal profile.", "Parcel Intelligence V2 + RS Base Standards V0", "Selects the reviewed current outside-Coastal authority envelope."),
        "application_complete_date": _predicate("NOT_APPLICABLE", None, "This evaluator is expressly scoped to the current-version development profile and does not adjudicate a protected earlier application.", "Packet 17 authority/version profile", "An earlier complete-application profile would require a separately versioned evaluation."),
        "property_line_roles": _predicate("TRUE", "SINGLE_FRONTAGE_INTERIOR_NON_CORNER", "PM 17383 Parcel 1 and §§113.0246(a)-(d) resolve the east boundary at 27th Street as the front property line.", "PM 17383 sheet 2 + SDMC §113.0246", "Selects the front-setback family and its measurement origin."),
        "cul_de_sac_frontage_portion": _predicate("FALSE", False, "The recorded 27th Street frontage and centerline are straight survey lines with no curve, radius, or turnaround.", "PM 17383 sheet 2", "Excludes the §131.0443(a)(1) 10-foot permission for this parcel."),
        "cul_de_sac_permission_elected": _predicate("NOT_APPLICABLE", None, "The physical cul-de-sac predicate is false.", "Derived from PM 17383 sheet 2", "No parcel branch may select this permission."),
        "front_50ft_fraction_at_least_25pct_slope": _predicate("UNKNOWN", None, "No sealed authoritative topographic source measures the slope gradient across the front 50 feet of lot depth.", "Packet 14 condition inventory; no qualifying source", "Controls availability of the Table 131-04D footnote 1 six-foot permission."),
        "defined_steep_hillside_condition": _predicate("NOT_APPLICABLE", None, "Table 131-04D footnote 1 states its own literal front-50-foot slope test; the separate Code-defined steep-hillside concept must not be substituted for it.", "Table 131-04D footnote 1 + Packet 17 authority review", "Does not select or alter the front-setback branch in this evaluator."),
        "setback_is_closest_to_street_frontage": _predicate("TRUE", True, "The evaluated line is the only Code front property line, at 27th Street.", "PM 17383 sheet 2 + SDMC §113.0246", "Satisfies the line-selection part of footnote 1."),
        "slope_permission_elected": _predicate("UNKNOWN", None, "The footnote is permissive and no proposed project or election is supplied.", "Table 131-04D footnote 1", "Even a qualifying slope retains both the ordinary base and elected permission branches."),
        "fire_official_defensible_space_buffer": _predicate("UNKNOWN", None, "No project-specific Fire Code Official determination is in sealed evidence.", "SDMC §131.0443(i)", "May require a buffer greater than the otherwise applicable base-zone setback."),
        "airport_transition_context": _predicate("UNKNOWN", None, "No sealed airport transition-area determination was made for this parcel.", "O-22109 §§60-62 effective-version record", "Can affect applicability of the O-22109 fire-buffer provision."),
        "alley_property_line_special_mapping": _predicate("NOT_APPLICABLE", None, "The resolved front line abuts 27th Street public right-of-way, not an alley.", "PM 17383 sheet 2 + SDMC §113.0246(e)", "Does not remap this front line to a rear-yard standard."),
        "required_street_or_alley_dedication": _predicate("UNKNOWN", None, "The existing 30-foot dedication is accounted for, but no proposed-development dedication determination exists.", "PM 17383 sheet 2; Packet 30 doctrine", "A future required dedication can change the measurement line for a proposed project."),
        "completely_underground_structure": _predicate("UNKNOWN", None, "No proposed structure is supplied.", "SDMC §113.0252(b)", "Completely underground construction has a separate setback treatment."),
        "resubdivided_corner_lot": _predicate("FALSE", False, "The legal-lot evaluation classifies Parcel 1 as single-frontage, interior, and non-corner.", "PM 17383 sheet 2 + Packet 29", "Excludes §113.0246(f) original-corner-line treatment."),
        "document_modified_setback": _predicate("UNKNOWN", None, "The recorded map/deed chain resolves the lot but is not a complete search for every ordinance, survey, division plat, or approved subdivision setback modification.", "SDMC §113.0249(b)-(c) + Legal Lot Evidence V0 limitation", "A controlling document can replace the base-zone setback line."),
        "existing_primary_structure_addition": _predicate("UNKNOWN", None, "No proposed project scope is supplied.", "Packet 14 condition inventory", "Addition-specific established-setback rules remain outside this evaluation."),
        "accessory_structure_standard": _predicate("UNKNOWN", None, "No proposed structure classification is supplied.", "SDMC §§131.0448/141.0307", "Accessory structures use separate standards."),
        "projection_or_encroachment": _predicate("UNKNOWN", None, "No proposed building element is supplied.", "SDMC §131.0461", "Permitted projections or encroachments can change which edge is tested."),
        "special_program_or_overlay_modification": _predicate("UNKNOWN", None, "No project/program scope or complete overlay-specific modification review is supplied.", "SDMC §131.0430(a)", "A separate applicable regulation may modify the base-zone envelope."),
    }

    branches = [
        {"branch_id": "BASE_TABLE", "value_ft": 15, "modality": "REQUIRED_BASE", "parcel_disposition": "VALID_POSSIBLE_BRANCH", "conditions": ["No elected qualifying reduction", "No greater Fire Code Official buffer", "No controlling documentary/program modification"], "source": "SDMC §131.0431(a), Table 131-04D, RS-1-7 row"},
        {"branch_id": "CUL_DE_SAC_PERMISSION", "value_ft": 10, "formula": "max(5, 15 - 5)", "modality": "MAY", "parcel_disposition": "EXCLUDED_PREDICATE_FALSE", "conditions": ["Portion of lot fronts a cul-de-sac", "Permission elected"], "source": "SDMC §131.0443(a)(1)"},
        {"branch_id": "SLOPE_PERMISSION", "value_ft": 6, "modality": "MAY", "parcel_disposition": "VALID_POSSIBLE_BRANCH_PREDICATES_UNRESOLVED", "conditions": ["At least one-half of the front 50 feet of lot depth has minimum slope gradient of 25 percent", "Evaluated setback is closest to street frontage", "Permission elected"], "source": "Table 131-04D footnote 1"},
        {"branch_id": "FIRE_OFFICIAL_BUFFER", "value_ft": None, "operator": "GREATER_THAN_OTHERWISE_APPLICABLE", "modality": "MAY_REQUIRE", "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED", "conditions": ["O-22109 provision applies", "Fire Code Official requires a greater defensible-space buffer"], "source": "SDMC §131.0443(i)"},
    ]
    unresolved_requirement_predicates = [
        "front_50ft_fraction_at_least_25pct_slope",
        "slope_permission_elected",
        "fire_official_defensible_space_buffer",
        "airport_transition_context",
        "document_modified_setback",
        "special_program_or_overlay_modification",
    ]
    requirement_state = "SETBACK_REQUIREMENT_CONDITIONAL"

    structure_facts = structure.get("facts", [])
    historical = [x for x in structure_facts if x.get("fact_key") == "historical_building_footprint_geometry"]
    current_geometry = [x for x in structure_facts if x.get("fact_key") == "current_building_footprint_geometry" and x.get("fact_state") == "supported"]
    compliance = evaluate_structure_compliance(
        requirement_state=requirement_state,
        measured_ft=None,
        required_ft=None,
        current_structure_geometry=bool(current_geometry),
        measurement_semantics=True,
        projection_scope_resolved=False,
    )
    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "front_setback",
        "evaluation_scope": "RS_1_7_FRONT_SETBACK_CURRENT_OUTSIDE_COASTAL_PROFILE_ONLY",
        "gates": gates,
        "parcel_identity": {"situs_address": parcel["identity"].get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"]},
        "zoning": {"zone_code": EXPECTED_ZONE, "coastal_state": "OUTSIDE_COASTAL", "standards_version": parcel["base_standards"]["rule_set_version"], "verified_as_of": parcel["base_standards"]["provenance"]["verified_as_of"]},
        "applicable_rule": {
            "rule_id": rule["rule_id"], "base_value_ft": 15, "operator": "MIN", "fact_state": "CONDITIONAL",
            "requirement_state": requirement_state, "source_edition": rule["source_evidence"]["source_edition"],
            "source_table": rule["source_table"], "source_page": rule["source_page"], "source_sha256": rule["source_evidence"]["source_sha256"],
            "section_text_sha256": authority["section_131_0443_text_sha256"], "proposal_rule_id": proposal["rule_id"],
        },
        "conditional_branches": branches,
        "valid_possible_requirement_branches": ["BASE_TABLE:15_FT", "SLOPE_PERMISSION:6_FT_IF_QUALIFIED_AND_ELECTED", "FIRE_OFFICIAL_BUFFER:GREATER_VALUE_IF_REQUIRED"],
        "non_cumulative_rule": "The cul-de-sac reduction is from the table requirement and must not be subtracted from the six-foot slope permission.",
        "predicates": predicates,
        "unresolved_requirement_predicates": unresolved_requirement_predicates,
        "evidence_needed_to_select": {
            "slope": "Authoritative slope/topography measuring the literal Table 131-04D footnote 1 test across the front 50 feet of lot depth.",
            "permission_election": "A project-specific election of the permissive slope alternative.",
            "fire": "A project-specific Fire Code Official determination and supported airport-transition applicability.",
            "modifications": "Project/document review sufficient to exclude or apply controlling setback modifications and programs.",
        },
        "measurement_doctrine": {
            "front_property_line": "East boundary of PM 17383 Parcel 1 at the west edge of 27th Street public right-of-way.",
            "setback_line": "A line parallel to the nearest property line at the required inward distance; the intervening area is the required yard (SDMC §113.0249(a)).",
            "direction": "Measured inward and perpendicular to the front property line (SDMC §113.0252(a)(1)).",
            "structure_edge": "For new-development compliance, measured to the outer edge of the building frame (SDMC §113.0252(c)).",
            "required_inputs": ["authoritative front property line", "authoritative current or proposed structure geometry", "resolved parcel-specific requirement", "resolved structure/project classification", "resolved projection/encroachment treatment"],
            "living_area_excluded": True,
        },
        "structure_evidence": {
            "assessor_living_area_sq_ft": next((x.get("value") for x in structure_facts if x.get("fact_key") == "assessor_total_living_area_sq_ft"), None),
            "living_area_is_geometry": False,
            "authoritative_current_structure_geometry": False,
            "current_completeness_proven": False,
            "historical_outline_count": len(historical),
            "footprint_linkage_state": structure.get("footprint_linkage", {}).get("state"),
        },
        "historical_diagnostic": {
            "classification": "HISTORICAL_DIAGNOSTIC_SETBACK",
            "state": "NOT_MEASURED",
            "source_vintage": "SPRING_2017_IMAGERY_BASELINE",
            "geometry_source": "City/SANDAG Building Outlines",
            "source_record_ids": [x["source_record_id"] for x in historical],
            "limitations": ["No current completeness", "No current compliance use", "Compact repository evidence retains geometry hashes but not coordinates for a setback measurement", "An additional boundary-touching outline is ambiguous in sealed linkage evidence"],
        },
        "compliance": compliance,
        "state": requirement_state,
        "compliance_state": compliance["state"],
        "bounded_conclusion": "The current outside-Coastal RS-1-7 front-setback rule is supported as a conditional envelope, but the parcel-specific distance and structure compliance are not resolved.",
        "mandatory_qualifier": "This evaluates only the front-setback rule envelope. It does not establish overall zoning compliance, legal nonconformity, a variance or violation, capacity, buildability, entitlement likelihood, or permit status.",
        "next_feasibility_source_target": "authoritative slope/topography for the front 50 feet",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated", "capacity_calculated", "current_structure_compliance_evaluated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result


__all__ = [
    "COMPLIANCE_STATES", "CONTRACT_VERSION", "EXPECTED_APN", "FORBIDDEN_CONCLUSIONS",
    "PREDICATE_STATES", "REQUIREMENT_STATES", "canonical_json", "evaluate_front_setback",
    "evaluate_structure_compliance", "fingerprint", "integrity_artifact", "provenance_graph", "validate_contract",
]
