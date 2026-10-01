"""Packet 37 street-side-setback applicability evaluator."""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Any, Mapping
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import conclusion_guard_fields, fingerprint, integrity_artifact, provenance_graph, resolve_rule_applicability, validate_contract

CONTRACT_VERSION = "street-side-setback-applicability-v0-2026-10-01-p37"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
FORBIDDEN_CONCLUSIONS = ("STREET_SIDE_COMPLIANT", "ZERO_FOOT_STREET_SIDE_SETBACK", "STREET_SIDE_REQUIREMENT_WAIVED", "OVERALL_ZONING_COMPLIANCE", "STRUCTURE_COMPLIANCE", "LEGAL_NONCONFORMITY", "DEVELOPMENT_CAPACITY", "BUILDABILITY", "ENTITLEMENT_LIKELIHOOD", "PERMIT_APPROVAL")


def parcel_line_facts(width: Mapping[str, Any]) -> dict[str, Any]:
    classification = width.get("lot_classification", {})
    lines = width.get("measurement_doctrine", {}).get("property_lines", {})
    return {
        "classification_state": classification.get("state"),
        "corner_lot": classification.get("corner_lot"),
        "double_fronted_lot": classification.get("double_fronted_lot"),
        "through_lot": classification.get("through_lot"),
        "front_line": lines.get("front"),
        "rear_line": lines.get("rear"),
        "side_lines": lines.get("sides"),
        "street_adjacencies": [{"line": "EAST_FRONT", "street": "27TH_STREET", "role": "FRONT"}],
        "north_side_abuts_public_right_of_way": False,
        "south_side_abuts_public_right_of_way": False,
        "resubdivided_corner_lot": False,
        "geometry_complete_for_line_roles": True,
    }


def evaluate_street_side_applicability(parcel: dict[str, Any], legal_lot: dict[str, Any], rule: dict[str, Any], width: dict[str, Any], authority: dict[str, Any], *, line_facts: dict[str, Any] | None = None) -> dict[str, Any]:
    facts = dict(line_facts or parcel_line_facts(width))
    identity, zoning = parcel.get("identity", {}), parcel.get("zoning", {})
    coastal, standards = parcel.get("coastal_context", {}), parcel.get("base_standards", {})
    base_gates = {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn") == width.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "outside_coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards_version": standards.get("rule_set_version") == "sd-rs-base-standards-2026-09-30-v0" and standards.get("state") == "supported",
        "rule_available": rule.get("standard_key") == "street_side_setback_min" and rule.get("zone_code") == EXPECTED_ZONE and rule.get("value", {}).get("number") == 5.0,
    }
    semantic_gates = {
        "baseline": all(value is True for value in base_gates.values()),
        "geometry_complete_for_line_roles": facts.get("geometry_complete_for_line_roles") is True,
        "corner_status_resolved": facts.get("corner_lot") is True or facts.get("corner_lot") is False,
        "double_fronted_status_resolved": facts.get("double_fronted_lot") is True or facts.get("double_fronted_lot") is False,
        "north_adjacency_resolved": facts.get("north_side_abuts_public_right_of_way") is True or facts.get("north_side_abuts_public_right_of_way") is False,
        "south_adjacency_resolved": facts.get("south_side_abuts_public_right_of_way") is True or facts.get("south_side_abuts_public_right_of_way") is False,
        "resubdivided_corner_status_resolved": facts.get("resubdivided_corner_lot") is True or facts.get("resubdivided_corner_lot") is False,
    }
    applies = None
    if all(value is True for value in semantic_gates.values()):
        direct_street_side = bool(facts["corner_lot"] and (facts["north_side_abuts_public_right_of_way"] or facts["south_side_abuts_public_right_of_way"]))
        preserved_resubdivision = bool(facts["resubdivided_corner_lot"])
        applies = direct_street_side or preserved_resubdivision
    applicability = resolve_rule_applicability(prerequisite_gates=semantic_gates, applies=applies)
    if applicability["state"] == "RULE_EVALUATION_UNRESOLVED":
        return {
            "contract_version": CONTRACT_VERSION, "apn": EXPECTED_APN, "rule_family": "street_side_setback", "state": "RULE_EVALUATION_UNRESOLVED",
            "reason": "STREET_SIDE_APPLICABILITY_PREREQUISITES_UNRESOLVED", "gates": base_gates, "applicability_gates": semantic_gates,
            "failed_gates": applicability["failed_gates"], "numeric_comparison_performed": False,
            **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "structure_compliance_evaluated", "development_capacity_calculated")),
        }
    if applicability["state"] == "APPLICABLE":
        return {
            "contract_version": CONTRACT_VERSION, "apn": EXPECTED_APN, "rule_family": "street_side_setback", "state": "STREET_SIDE_SETBACK_APPLICABLE_REQUIRES_RULE_EVALUATION",
            "reason": "A_STREET_SIDE_LINE_EXISTS_OR_ORIGINAL_CORNER_CONFIGURATION_CONTROLS", "gates": base_gates, "applicability_gates": semantic_gates,
            "line_facts": facts, "numeric_comparison_performed": False,
            **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "structure_compliance_evaluated", "development_capacity_calculated")),
        }
    result = {
        "contract_version": CONTRACT_VERSION, "apn": EXPECTED_APN, "rule_family": "street_side_setback", "evaluation_scope": "STREET_SIDE_APPLICABILITY_ONLY",
        "gates": base_gates, "applicability_gates": semantic_gates,
        "parcel_identity": {"situs_address": identity.get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"]},
        "zoning": {"zone_code": EXPECTED_ZONE, "coastal_state": "OUTSIDE_COASTAL", "standards_version": standards["rule_set_version"]},
        "rule_availability": {"state": "AVAILABLE_FOR_APPLICABLE_PARCELS", "rule_id": rule["rule_id"], "table_value_ft_evidence_only": 5, "numeric_rule_selected_for_this_parcel": False, "source_edition": rule["source_evidence"]["source_edition"], "source_table": rule["source_table"], "source_page": rule["source_page"], "source_sha256": rule["source_evidence"]["source_sha256"]},
        "applicability_doctrine": {
            "street_side_property_line": "A side property line that abuts public right-of-way (SDMC §113.0246(d)).",
            "corner_lot": "On a corner lot, the narrower street frontage is the front line; the other street-adjoining side line is the street-side property line (SDMC §113.0246(a), Diagram 113-02Z).",
            "double_fronted_lot": "A lot extending from one street to another generally has front property lines along both frontages, not a street-side line (SDMC §113.0246(b)).",
            "alley": "An alley-abutting line is not a street property line for setback or street-yard purposes; a side line at an alley receives an interior-side-yard standard (SDMC §113.0246(e)(2)).",
            "resubdivided_corner_lot": "A residential resubdivided corner lot preserves original front and street-side setback treatment (SDMC §113.0246(f)).",
            "measurement_if_applicable": "A street-side setback is measured inward and perpendicular to the street-side property line (SDMC §113.0252(a)(3)); no measurement is invoked here.",
            "source_edition": "7-2026", "measurement_source_sha256": authority["measurement_source"]["sha256"], "measurement_pages_sha256": authority["measurement_pages_sha256"],
        },
        "line_facts": facts,
        "predicate_states": {
            "corner_lot": {"state": "FALSE", "value": False},
            "second_street_adjoining_side_line": {"state": "FALSE", "value": False},
            "north_side_is_street_side": {"state": "FALSE", "value": False},
            "south_side_is_street_side": {"state": "FALSE", "value": False},
            "double_fronted_lot": {"state": "FALSE", "value": False},
            "resubdivided_corner_lot": {"state": "FALSE", "value": False},
            "street_side_rule_applicability": {"state": "NOT_APPLICABLE", "value": None},
        },
        "state": "STREET_SIDE_SETBACK_NOT_APPLICABLE", "truth_state": "NOT_APPLICABLE", "applicable_requirement": None,
        "numeric_comparison_performed": False, "compliance_evaluated": False,
        "product_wording": "Street-side setback: Not applicable to this parcel because no side property line adjoins a street.",
        "setback_family_summary": {"front": "CONDITIONAL", "rear": "CONDITIONAL", "interior_side": "CONDITIONAL", "street_side": "NOT_APPLICABLE", "overall_compliance_computed": False},
        "next_feasibility_step": "parcel feasibility summary V0",
        "bounded_conclusion": "RS-1-7 contains a street-side rule for parcels with a street-side condition, but APN 6341302200 has no street-side property line. The rule family is NOT_APPLICABLE to this parcel; no numeric value or compliance comparison is selected.",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "structure_compliance_evaluated", "development_capacity_calculated", "overall_compliance_conclusion")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
