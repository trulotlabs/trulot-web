"""Packet 34 bounded RS-1-7 rear-setback evaluator."""

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


CONTRACT_VERSION = "rear-setback-evaluator-v0-2026-10-01-p34"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "rear_setback_min"
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


def _baseline_gates(parcel: Mapping[str, Any], legal_lot: Mapping[str, Any], rule: Mapping[str, Any], depth: Mapping[str, Any], area: Mapping[str, Any]) -> dict[str, bool]:
    identity = parcel.get("identity", {})
    zoning = parcel.get("zoning", {})
    coastal = parcel.get("coastal_context", {})
    standards = parcel.get("base_standards", {})
    return {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn") == depth.get("apn") == area.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "outside_coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards_version": standards.get("rule_set_version") == "sd-rs-base-standards-2026-09-30-v0" and standards.get("state") == "supported",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "legal_area": area.get("area_denominator", {}).get("state") == "RESOLVED_EXCLUDE_PUBLIC_RIGHT_OF_WAY",
        "resolved_depth": depth.get("state") == "RULE_REQUIREMENT_SATISFIED" and depth.get("geometry_reconstruction", {}).get("reported_code_defined_lot_depth_ft") == "235.02",
        "rear_line": depth.get("measurement_doctrine", {}).get("rear_property_line", {}).get("state") == "RESOLVED_OPPOSITE_MOST_DISTANT_WEST_LINE",
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_shape": rule.get("fact_state") == "CONDITIONAL" and rule.get("operator") == "MIN" and rule.get("value", {}).get("number") == 13.0,
        "dependencies": set(rule.get("unresolved_dependencies", [])) == {"131.0443(a)(2)", "131.0443(a)(3)", "131.0443(i)", "131-04D:3"},
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
    result = evaluate_evidence_gates(gates)
    if not result.passed:
        return {"state": "SETBACK_COMPLIANCE_NOT_EVALUATED", "gates": gates, "failed_gates": list(result.failed), "comparison": None}
    comparison = compare_values(
        measured=measured_ft,
        required=required_ft,
        unit="ft",
        operator="MIN",
        expression="measured_structure_rear_setback_ft >= applicable_rear_setback_ft",
    )
    return {"state": comparison.state, "gates": gates, "failed_gates": [], "comparison": comparison.comparison}


def evaluate_rear_setback(parcel: dict[str, Any], legal_lot: dict[str, Any], rule: dict[str, Any], depth: dict[str, Any], area: dict[str, Any], structure: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    gates = _baseline_gates(parcel, legal_lot, rule, depth, area)
    gate_result = evaluate_evidence_gates(gates)
    if not gate_result.passed:
        return unresolved_result(
            contract_version=CONTRACT_VERSION,
            apn=EXPECTED_APN,
            rule_family="rear_setback",
            failed_gates=gate_result.failed,
            false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"),
        )

    lot_depth = Decimal(depth["geometry_reconstruction"]["reported_code_defined_lot_depth_ft"])
    table_value = Decimal(str(rule["value"]["number"]))
    depth_fraction = lot_depth * Decimal("0.10")
    if lot_depth < Decimal("100"):
        depth_branch = "SHORT_LOT_EXPLICIT_EXCEPTION"
        depth_requirement = max(Decimal("5"), depth_fraction)
        cross_reference_disposition = "GENERAL_TABLE_REFERENCE_NOT_NEEDED_FOR_SHORT_LOT_EXCEPTION"
    elif lot_depth > Decimal("150"):
        depth_branch = "LONG_LOT_EXPLICIT_EXCEPTION"
        depth_requirement = max(table_value, depth_fraction)
        cross_reference_disposition = "RESOLVED_BY_131_0443_A_2_A_II_EXPLICIT_TABLE_131_04D_REFERENCE"
    else:
        return {
            **unresolved_result(
                contract_version=CONTRACT_VERSION,
                apn=EXPECTED_APN,
                rule_family="rear_setback",
                failed_gates=("authoritative_general_table_cross_reference",),
                false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"),
            ),
            "requirement_state": "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE",
            "reason": "SECTION_131_0443_A_2_A_REFERENCES_NONEXISTENT_TABLE_141_04D",
        }

    predicates = {
        "current_outside_coastal_profile": _predicate("TRUE", "outside-coastal-2026-09-30", "Parcel Coastal mapping is supported OUTSIDE_COASTAL and the selected current rule set applies.", "Parcel Intelligence V2 + RS Base Standards V0", "Selects the reviewed current outside-Coastal authority envelope."),
        "application_complete_date": _predicate("NOT_APPLICABLE", None, "This evaluator is scoped to the current-version development profile and does not adjudicate a protected earlier application.", "Packet 17 authority/version profile", "An earlier complete-application profile requires a separately versioned evaluation."),
        "rear_property_line": _predicate("TRUE", "WEST_BOUNDARY", "PM 17383 Parcel 1 and §113.0246(c) resolve the west line opposite 27th Street as the rear property line.", "PM 17383 sheet 2 + Minimum Lot Depth Evaluation V0", "Selects the rear-setback measurement origin."),
        "lot_depth_less_than_100_ft": _predicate("FALSE", False, "The sealed Code-defined lot depth is 235.02 feet.", "Minimum Lot Depth Evaluation V0", "Excludes §131.0443(a)(2)(A)(i)."),
        "lot_depth_greater_than_150_ft": _predicate("TRUE", True, "The sealed Code-defined lot depth is 235.02 feet.", "Minimum Lot Depth Evaluation V0", "Selects §131.0443(a)(2)(A)(ii)."),
        "general_table_cross_reference_valid": _predicate("FALSE", False, "The general sentence prints Table 141-04D, which is not the residential RS table.", "SDMC §131.0443(a)(2)(A)", "Would fail closed for an ordinary 100-to-150-foot lot."),
        "long_lot_clause_table_cross_reference_valid": _predicate("TRUE", True, "The selected greater-than-150-foot clause expressly references Table 131-04D.", "SDMC §131.0443(a)(2)(A)(ii)", "Allows this parcel's depth-adjusted requirement to be computed without repairing the malformed general reference."),
        "rear_yard_abuts_alley": _predicate("FALSE", False, "PM 17383 depicts the west rear boundary adjoining land, with no alley; the only public right-of-way adjacency is 27th Street at the east front line.", "PM 17383 sheet 2", "Excludes the alley-width credit in §131.0443(a)(2)(B)."),
        "parking_access_taken_from_rear_alley": _predicate("NOT_APPLICABLE", None, "The recorded rear line does not abut an alley.", "PM 17383 sheet 2", "Excludes §131.0443(a)(2)(C)."),
        "parking_spaces_not_parallel_to_alley": _predicate("NOT_APPLICABLE", None, "There is no rear alley branch for this parcel.", "Derived from PM 17383 sheet 2", "No 21-foot alley parking distance is selected."),
        "rs_1_8_through_1_14_alley_permission": _predicate("NOT_APPLICABLE", None, "The parcel is RS-1-7, outside the zones listed in §131.0443(a)(3).", "Parcel Intelligence V2 + SDMC §131.0443(a)(3)", "Excludes the four-foot alley-access permission."),
        "garage_within_embankment_rule": _predicate("NOT_APPLICABLE", None, "Section 131.0449(a) authorizes encroachment only into front and street-side yards.", "SDMC §131.0449(a)", "Does not alter the rear-setback requirement."),
        "small_lot_accessory_building_encroachment": _predicate("FALSE", False, "The sealed Code lot area is 22,096.320 square feet, exceeding the 10,000-square-foot ceiling in §131.0461(a)(12)(A).", "Minimum Lot Area Evaluation V0 + SDMC §131.0461(a)(12)", "Excludes the garage/non-habitable accessory-building rear-yard encroachment."),
        "fire_official_defensible_space_buffer": _predicate("UNKNOWN", None, "No project-specific Fire Code Official determination is in sealed evidence.", "SDMC §131.0443(i)", "May require a buffer greater than the depth-adjusted base-zone setback."),
        "airport_transition_context": _predicate("UNKNOWN", None, "No sealed airport-transition applicability determination was made for this parcel.", "O-22109 effective-version record", "May affect applicability of the O-22109 provision."),
        "document_modified_setback": _predicate("UNKNOWN", None, "The legal-lot chain is sufficient for identity but is not a complete search for every ordinance, final subdivision, record of survey, or division-plat setback modification.", "SDMC §113.0249(b)-(c) + Legal Lot Evidence V0 limitation", "A controlling document can replace the calculated setback line."),
        "required_street_or_alley_dedication": _predicate("UNKNOWN", None, "No proposed development or dedication determination is supplied.", "SDMC §113.0246 and §142.0610", "A future required rear-alley dedication can alter the property line used for measurement."),
        "completely_underground_structure": _predicate("UNKNOWN", None, "No proposed structure is supplied.", "SDMC §113.0252(b)", "Completely underground construction has separate setback treatment."),
        "permitted_projection_or_encroachment": _predicate("UNKNOWN", None, "No current or proposed building element is classified under §131.0461(a).", "SDMC §131.0461(a)", "The element-specific reference edge may differ from the primary building frame."),
        "structure_or_project_classification": _predicate("UNKNOWN", None, "The sealed facts do not classify a current/proposed structure element or project scope for rear-setback comparison.", "Packet 17 Structure Facts V0", "Prevents selection of projection, pool, patio, equipment, and other element-specific rules."),
        "special_program_or_overlay_modification": _predicate("UNKNOWN", None, "No project/program scope or complete overlay-specific setback-modification review is supplied.", "SDMC §131.0430(a)", "A separate applicable regulation may modify the base-zone envelope."),
    }

    branches = [
        {
            "branch_id": "DEPTH_ADJUSTED_BASE",
            "value_ft": str(depth_requirement),
            "formula": "max(0.10 × 235.02 ft, 13 ft) = 23.502 ft",
            "operator": "MIN",
            "modality": "REQUIRED_BASE",
            "parcel_disposition": "VALID_POSSIBLE_BRANCH",
            "conditions": ["Lot depth greater than 150 feet", "No greater Fire Code Official buffer", "No controlling documentary/program modification"],
            "source": "Table 131-04D + SDMC §131.0443(a)(2)(A)(ii)",
        },
        {
            "branch_id": "REAR_ALLEY_CREDIT",
            "value_ft": None,
            "modality": "MAY_COUNT_ALLEY_WIDTH",
            "parcel_disposition": "EXCLUDED_PREDICATE_FALSE",
            "conditions": ["Rear yard abuts an alley", "At most half alley width and 10 feet credited", "At least 5 feet remains on premises"],
            "source": "SDMC §131.0443(a)(2)(B)",
        },
        {
            "branch_id": "FIRE_OFFICIAL_BUFFER",
            "value_ft": None,
            "operator": "GREATER_THAN_OTHERWISE_APPLICABLE",
            "modality": "MAY_REQUIRE",
            "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED",
            "conditions": ["O-22109 provision applies", "Fire Code Official requires a greater defensible-space buffer"],
            "source": "SDMC §131.0443(i)",
        },
        {
            "branch_id": "DOCUMENT_OR_PROGRAM_MODIFICATION",
            "value_ft": None,
            "operator": "REPLACES_OR_MODIFIES_BASE",
            "modality": "CONDITIONAL",
            "parcel_disposition": "VALID_POSSIBLE_BRANCH_VALUE_UNRESOLVED",
            "conditions": ["A controlling document, program, or overlay modifies the base-zone rear setback"],
            "source": "SDMC §§113.0249(b)-(c), 131.0430(a)",
        },
    ]
    unresolved_requirement_predicates = [
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
        structure_classification=False,
        measurement_semantics=True,
        projection_scope_resolved=False,
    )
    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "rear_setback",
        "evaluation_scope": "RS_1_7_REAR_SETBACK_CURRENT_OUTSIDE_COASTAL_PROFILE_ONLY",
        "gates": gates,
        "parcel_identity": {"situs_address": parcel["identity"].get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"]},
        "zoning": {"zone_code": EXPECTED_ZONE, "coastal_state": "OUTSIDE_COASTAL", "standards_version": parcel["base_standards"]["rule_set_version"], "verified_as_of": parcel["base_standards"]["provenance"]["verified_as_of"]},
        "applicable_rule": {
            "rule_id": rule["rule_id"],
            "table_value_ft": 13,
            "operator": "MIN",
            "fact_state": "CONDITIONAL",
            "requirement_state": requirement_state,
            "source_edition": rule["source_evidence"]["source_edition"],
            "source_table": rule["source_table"],
            "source_page": rule["source_page"],
            "source_sha256": rule["source_evidence"]["source_sha256"],
            "section_text_sha256": authority["section_131_0443_text_sha256"],
            "cross_reference_disposition": cross_reference_disposition,
        },
        "depth_adjustment": {
            "branch": depth_branch,
            "lot_depth_ft": str(lot_depth),
            "ten_percent_ft": str(depth_fraction),
            "table_value_ft": str(table_value),
            "result_ft": str(depth_requirement),
            "rounding": "No rounding; Decimal arithmetic preserves the sealed 0.01-foot lot-depth precision.",
        },
        "conditional_branches": branches,
        "valid_possible_requirement_branches": ["DEPTH_ADJUSTED_BASE:23.502_FT", "FIRE_OFFICIAL_BUFFER:GREATER_VALUE_IF_REQUIRED", "DOCUMENT_OR_PROGRAM_MODIFICATION:VALUE_IF_APPLICABLE"],
        "predicates": predicates,
        "unresolved_requirement_predicates": unresolved_requirement_predicates,
        "evidence_needed_to_select": {
            "fire": "A project-specific Fire Code Official determination and supported O-22109 applicability.",
            "modifications": "Project/document review sufficient to exclude or apply controlling setback modifications and special programs.",
        },
        "measurement_doctrine": {
            "rear_property_line": "West boundary of PM 17383 Parcel 1, opposite and most distant from the east front line at 27th Street.",
            "setback_line": "A line parallel to the west rear property line at the required inward distance; the intervening area is the rear yard (SDMC §113.0249(a)).",
            "direction": "Measured inward and perpendicular to the west rear property line (SDMC §113.0252(a)(4)).",
            "structure_edge": "For new-development compliance, measured to the outer edge of the building frame (SDMC §113.0252(c)); element-specific permitted projections and encroachments remain governed by §131.0461(a).",
            "above_grade_scope": "Above-grade portions of underground parking, first stories, and basements are subject to setbacks; completely underground structures have the bounded exception in §113.0252(b).",
            "alley_treatment": "An alley-adjacent rear line remains a rear property line under §113.0246(e)(3), with the separate credit and parking-distance rules in §131.0443(a)(2)(B)-(C); this parcel has no rear alley.",
            "accessory_treatment": "Section 131.0449(a) concerns front/street-side embankment garages. Section 131.0461(a)(12) rear-yard garage/non-habitable accessory encroachment is unavailable because the sealed Code lot area exceeds 10,000 square feet.",
            "living_area_excluded": True,
            "required_inputs": ["resolved applicable rear-setback branch", "current authoritative structure geometry", "structure/project classification", "permitted projection or encroachment classification", "resolved documentary/program modifications"],
            "source": authority["measurement_source"],
        },
        "structure_evidence": {
            "assessor_living_area_available": any(x.get("fact_key") == "assessor_total_living_area_sq_ft" and x.get("fact_state") == "supported" for x in structure_facts),
            "assessor_living_area_is_geometry": False,
            "historical_outline_count": len(historical),
            "authoritative_current_structure_geometry": bool(current_geometry),
            "completeness_proven": False,
            "structure_classification_resolved": False,
        },
        "historical_diagnostic": {
            "classification": "HISTORICAL_DIAGNOSTIC_REAR_SETBACK",
            "state": "NOT_MEASURED",
            "reason": "Compact Packet 17 evidence retains geometry hashes rather than coordinates, uses a Spring 2017 imagery baseline, and does not establish current completeness or legal-boundary registration for compliance.",
            "source_vintage": historical[0]["source_vintage"] if historical else None,
            "source_record_ids": [x["source_record_id"] for x in historical],
            "current_compliance_evidence": False,
        },
        "state": requirement_state,
        "compliance_state": compliance["state"],
        "compliance": compliance,
        "bounded_conclusion": "The ordinary depth-adjusted rear-setback branch is 23.502 feet; the final applicable requirement remains conditional on Fire Official and controlling-document/program predicates, and current structure compliance is not evaluated.",
        "mandatory_qualifier": "This evaluates only the current outside-Coastal RS-1-7 rear-setback rule envelope. It does not establish current structure compliance, overall zoning compliance, development capacity, legal nonconformity, or project approval.",
        "setback_family_assessment": {
            "state": "SETBACK_FAMILY_PATTERN_READY",
            "shared_pattern": "Evidence gates → rule selection → explicit predicates → valid branches → measurement doctrine → compliance gates → contained result.",
            "new_reusable_pattern": "A malformed general cross-reference fails closed unless a selected, mutually exclusive parcel branch supplies its own valid authoritative reference; the greater-than-150-foot branch does so here.",
        },
        "next_feasibility_source_target": "Fire Official / defensible-space applicability",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated", "capacity_calculated", "current_structure_compliance_evaluated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
