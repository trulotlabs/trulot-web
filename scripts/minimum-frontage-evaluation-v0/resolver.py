"""Bounded Packet 30 minimum-street-frontage evaluator."""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import (  # noqa: E402
    canonical_json, compare_values, conclusion_guard_fields,
    evaluate_evidence_gates, fingerprint, integrity_artifact,
    provenance_graph, unresolved_result,
)


CONTRACT_VERSION = "minimum-frontage-evaluation-v0-2026-10-01-p30"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "street_frontage_min"

FORBIDDEN_CONCLUSIONS = (
    "LEGAL_ACCESS",
    "DRIVEWAY_ACCESS",
    "CURB_CUT_PERMISSION",
    "SETBACK_COMPLIANCE",
    "OVERALL_ZONING_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
    "MAXIMUM_UNITS",
    "SUBDIVISION_ELIGIBILITY",
    "PERMIT_APPROVAL",
    "BUILDABILITY",
)


def evaluate_minimum_frontage(parcel: dict[str, Any], legal_lot: dict[str, Any], rule: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    identity = parcel.get("identity", {})
    zoning = parcel.get("zoning", {})
    coastal = parcel.get("coastal_context", {})
    standards = parcel.get("base_standards", {})
    condition = rule.get("condition", [])
    gates = {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards": standards.get("state") == "supported" and standards.get("resolution_state") == "RESOLVED",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "recorded_map": any(a.get("sheet") == 2 and a.get("artifact_state") == "ACQUIRED_AUTHORITATIVE_TIFF" for a in legal_lot.get("recorded_map_artifacts", [])),
        "frontage_definition": authority.get("frontage_definition_state") == "RESOLVED_PROPERTY_LINE_ALONG_STREET",
        "classification": authority.get("lot_classification_state") == "SINGLE_FRONTAGE_INTERIOR_NON_CORNER",
        "front_line": authority.get("front_property_line", {}).get("state") == "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY",
        "right_of_way": authority.get("right_of_way_treatment", {}).get("state") == "RESOLVED_PROPERTY_LINE_ALONG_STREET",
        "street_geometry": authority.get("street_geometry", {}).get("state") == "STRAIGHT_NOT_TURNAROUND",
        "exception": authority.get("frontage_exception", {}).get("state") == "NOT_APPLICABLE",
        "geometry": authority.get("geometry_state") == "RECORDED_MAP_SUFFICIENT",
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_state": rule.get("fact_state") == "CONDITIONAL" and rule.get("operator") == "MIN",
        "rule_condition": len(condition) == 1 and "131.0442(a)" in condition[0],
    }
    gate_result = evaluate_evidence_gates(gates)
    if not gate_result.passed:
        return unresolved_result(contract_version=CONTRACT_VERSION, apn=EXPECTED_APN, rule_family="minimum_frontage", failed_gates=gate_result.failed, false_fields=("legal_access_evaluated", "parcel_compliance_evaluated", "development_capacity_calculated"))

    recorded_frontage = Decimal(str(authority["recorded_geometry"]["street_adjoining_property_line"]["length_ft"])).quantize(Decimal("0.01"))
    required_frontage = Decimal(str(rule["value"]["number"]))
    comparison = compare_values(measured=recorded_frontage, required=required_frontage, unit="ft", operator="MIN", expression="code_defined_frontage_ft >= applicable_minimum_frontage_ft")
    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "minimum_frontage",
        "evaluation_scope": "MINIMUM_STREET_FRONTAGE_ONLY",
        "gates": gates,
        "parcel_identity": {"situs_address": identity.get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256"), "parcel_geometry_sha256": identity.get("geometry_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "recorded_deed": "DOC # 2001-0706032", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"], "recorded_map_artifact_sha256": authority["recorded_geometry"]["artifact_sha256"], "deed_artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
        "zoning": {"mapping_state": zoning["mapping_state"], "zone_code": EXPECTED_ZONE, "mapping_row_sha256": zoning.get("mapping_row_sha256"), "coastal_state": coastal["evidence_state"], "coastal_fingerprint_sha256": coastal.get("layer_fingerprint_sha256"), "standards_version": standards["rule_set_version"], "standards_fingerprint_sha256": standards.get("fingerprint_sha256")},
        "measurement_doctrine": authority,
        "applicable_rule": {"selection": "BASE_RS_1_7_MINIMUM_FRONTAGE", "exception_disposition": "SECTION_131_0442_A_NOT_APPLICABLE", "rule_id": rule["rule_id"], "standard_key": rule["standard_key"], "numeric_value": int(required_frontage), "unit": rule["unit"], "operator": rule["operator"], "fact_state": rule["fact_state"], "condition": condition, "condition_resolved": True, "jurisdiction_variant": rule["jurisdiction_variant"], "rule_set_version": rule["rule_set_version"], "source_section": rule["source_section"], "source_table": rule["source_table"], "source_page": rule["source_page"], "source_url": rule["source_url"], "source_edition": rule["source_evidence"]["source_edition"], "source_sha256": rule["source_evidence"]["source_sha256"], "provenance_sha256": rule["provenance_sha256"]},
        "frontage_measurement": {"street": "27th Street", "source_line": "east/front development-regulation property line at west edge of 27th Street right-of-way", "bearing": authority["recorded_geometry"]["street_adjoining_property_line"]["bearing"], "recorded_length_ft": "94.00", "code_defined_frontage_ft": str(recorded_frontage), "method": "Length of the premises property line along the street it borders", "derivation_class": "DIRECT_RECORDED_MAP_MEASUREMENT_WITH_CODE_SEMANTICS", "precision": "Recorded to 0.01 ft; no additional rounding", "assumptions": [], "parcel_v2_geometry_used": False},
        "frontage_access_distinctions": {"frontage": "Length of the premises property line along the street it borders; evaluated", "street_adjacency": "Parcel boundary relationship to 27th Street; established", "legal_access": "Separate legal right or approval to enter the street; not evaluated", "driveway_access": "Physical or permitted driveway connection; not evaluated", "public_right_of_way": "Dedicated street area east of the premises property line; establishes the street boundary but is not itself frontage length", "curb_cut_or_access_point": "Specific opening or permission in the curb; not evaluated"},
        "comparison": comparison.comparison,
        "state": comparison.state,
        "bounded_conclusion": "The supported Code-defined lot frontage satisfies the RS-1-7 minimum frontage standard." if comparison.state == "RULE_REQUIREMENT_SATISFIED" else "The supported Code-defined lot frontage does not satisfy the RS-1-7 minimum frontage standard.",
        "mandatory_qualifier": "This evaluates only the minimum-frontage rule. It does not establish access adequacy, driveway compliance, setback compliance, development capacity, or project approval.",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("legal_access_evaluated", "driveway_access_evaluated", "parcel_compliance_evaluated", "development_capacity_calculated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
