"""Bounded Packet 27 minimum-lot-area evaluator.

Evaluates one named rule for one sealed legal lot. It cannot calculate capacity,
overall zoning compliance, or any other rule family.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any


CONTRACT_VERSION = "minimum-lot-area-evaluation-v0-2026-09-30-p27"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "lot_area_min"
ACRE_TO_SQFT = Decimal("43560")

FORBIDDEN_CONCLUSIONS = (
    "OVERALL_ZONING_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
    "MAXIMUM_UNITS",
    "FAR_READINESS",
    "SETBACK_READINESS",
    "SUBDIVISION_ELIGIBILITY",
    "PERMIT_LIKELIHOOD",
    "BUILDABILITY",
    "ENTITLEMENT",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def evaluate_minimum_lot_area(
    parcel: dict[str, Any],
    legal_lot: dict[str, Any],
    rule: dict[str, Any],
    denominator_authority: dict[str, Any],
) -> dict[str, Any]:
    identity = parcel.get("identity", {})
    zoning = parcel.get("zoning", {})
    coastal = parcel.get("coastal_context", {})
    standards = parcel.get("base_standards", {})

    gates = {
        "apn": identity.get("apn") == EXPECTED_APN == legal_lot.get("apn"),
        "parcel_identity": identity.get("state") == "supported",
        "single_zone": zoning.get("mapping_state") == "SINGLE_ZONE" and len(zoning.get("zone_evidence", [])) == 1,
        "zone": zoning.get("zone_evidence", [{}])[0].get("zone_code") == EXPECTED_ZONE,
        "coastal": coastal.get("evidence_state") == "OUTSIDE_COASTAL" and coastal.get("state") == "supported",
        "standards": standards.get("state") == "supported" and standards.get("resolution_state") == "RESOLVED",
        "legal_match": legal_lot.get("apn_recorded_entity_reconciliation", {}).get("state") == "EXACT_RECORDED_LOT_MATCH",
        "legal_lot": legal_lot.get("legal_status_state") == "LEGAL_LOT_ESTABLISHED",
        "legal_area": any(item.get("state") == "LEGAL_LOT_AREA_SUPPORTED" for item in legal_lot.get("legal_area_findings", [])),
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_state": rule.get("fact_state") == "RECORDED" and rule.get("condition") == [] and rule.get("operator") == "MIN",
        "denominator": denominator_authority.get("state") == "RESOLVED_EXCLUDE_PUBLIC_RIGHT_OF_WAY",
    }
    failed = [name for name, passed in gates.items() if not passed]
    if failed:
        return {
            "contract_version": CONTRACT_VERSION,
            "apn": EXPECTED_APN,
            "rule_family": "minimum_lot_area",
            "state": "RULE_EVALUATION_UNRESOLVED",
            "reason": "REQUIRED_GATE_FAILED",
            "failed_gates": failed,
            "parcel_compliance_evaluated": False,
            "development_capacity_calculated": False,
            "other_rule_families_evaluated": [],
        }

    supported_area = next(item for item in legal_lot["legal_area_findings"] if item.get("state") == "LEGAL_LOT_AREA_SUPPORTED")
    recorded_acres = _decimal(supported_area["value"])
    gross_sqft = recorded_acres * ACRE_TO_SQFT
    street_width = _decimal(denominator_authority["mapped_public_right_of_way"]["width_ft"])
    street_length = _decimal(denominator_authority["mapped_public_right_of_way"]["length_ft"])
    public_right_of_way_sqft = street_width * street_length
    code_lot_area_sqft = gross_sqft - public_right_of_way_sqft
    required_sqft = _decimal(rule["value"]["number"])
    satisfied = code_lot_area_sqft >= required_sqft

    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "minimum_lot_area",
        "evaluation_scope": "MINIMUM_LOT_AREA_ONLY",
        "gates": gates,
        "parcel_identity": {
            "situs_address": identity.get("situs_address"),
            "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256"),
            "parcel_geometry_sha256": identity.get("geometry_sha256"),
        },
        "legal_lot": {
            "recorded_entity": "PM 17383 PARCEL 1",
            "recorded_deed": "DOC # 2001-0706032",
            "state": legal_lot["legal_status_state"],
            "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"],
            "recorded_area": {"value": float(recorded_acres), "unit": "acre"},
            "recorded_area_artifact_sha256": supported_area.get("provenance", {}).get("artifact_sha256") or next(a.get("artifact_sha256") for a in legal_lot["areas"] if a.get("source_semantic") == "RECORDED_MAP_AREA"),
            "deed_artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"],
            "superseded_secondary_description": legal_lot["authority_resolution"]["secondary_conflict_retained"],
        },
        "zoning": {
            "mapping_state": zoning["mapping_state"],
            "zone_code": EXPECTED_ZONE,
            "mapping_row_sha256": zoning.get("mapping_row_sha256"),
            "coastal_state": coastal["evidence_state"],
            "coastal_fingerprint_sha256": coastal.get("layer_fingerprint_sha256"),
            "standards_version": standards["rule_set_version"],
            "standards_fingerprint_sha256": standards.get("fingerprint_sha256"),
        },
        "rule": {
            "rule_id": rule["rule_id"],
            "standard_key": rule["standard_key"],
            "value": required_sqft.to_integral_value().__str__(),
            "numeric_value": int(required_sqft),
            "unit": rule["unit"],
            "operator": rule["operator"],
            "fact_state": rule["fact_state"],
            "derivation_class": rule["derivation_class"],
            "condition": rule["condition"],
            "exceptions": rule["exceptions"],
            "jurisdiction_variant": rule["jurisdiction_variant"],
            "rule_set_version": rule["rule_set_version"],
            "effective_from": rule["effective_from"],
            "effective_to": rule["effective_to"],
            "effective_date_basis": rule["effective_date_basis"],
            "unresolved_dependencies": rule["unresolved_dependencies"],
            "source_section": rule["source_section"],
            "source_table": rule["source_table"],
            "source_page": rule["source_page"],
            "source_url": rule["source_url"],
            "source_edition": rule["source_evidence"]["source_edition"],
            "source_sha256": rule["source_evidence"]["source_sha256"],
            "provenance_sha256": rule["provenance_sha256"],
        },
        "area_denominator": {
            "state": denominator_authority["state"],
            "code_source": denominator_authority["code_source"],
            "recorded_parcel_map_area": {"value": str(recorded_acres), "unit": "acre", "square_feet": str(gross_sqft)},
            "public_right_of_way_area": {"value": str(public_right_of_way_sqft), "unit": "sq_ft", "derivation": "30 ft × 94 ft from PM 17383"},
            "code_lot_area_used": {"value": str(code_lot_area_sqft), "unit": "sq_ft", "derivation_class": "DETERMINISTIC_DERIVED_FROM_RECORDED_MAP"},
            "assessor_area": {"value": legal_lot["current_area_comparison"]["assessor_sqft"], "unit": "sq_ft", "classification": "COMPARISON_ONLY"},
            "parcel_v2_geometry_area": {"value": legal_lot["current_area_comparison"]["parcel_v2_geometry_sqft"], "unit": "sq_ft", "classification": "DIAGNOSTIC_ONLY"},
            "pre_dedication_exception_scope": "MAXIMUM_PERMITTED_DENSITY_AND_MAXIMUM_PERMITTED_GROSS_FLOOR_AREA_ONLY",
        },
        "normalization": {
            "original": {"value": str(recorded_acres), "unit": "acre"},
            "conversion": "1 acre = 43,560 sq ft",
            "gross_result_sqft": str(gross_sqft),
            "rounding": "No rounding; Decimal arithmetic preserves the recorded three-decimal acre value exactly.",
        },
        "comparison": {
            "expression": "code_lot_area_sqft >= minimum_lot_area_sqft",
            "left": str(code_lot_area_sqft),
            "operator": ">=",
            "right": str(required_sqft),
            "unit": "sq_ft",
        },
        "state": "RULE_REQUIREMENT_SATISFIED" if satisfied else "RULE_REQUIREMENT_NOT_SATISFIED",
        "bounded_conclusion": "The supported Code-defined lot area satisfies the RS-1-7 minimum lot area standard." if satisfied else "The supported Code-defined lot area does not satisfy the RS-1-7 minimum lot area standard.",
        "mandatory_qualifier": "This evaluates only the minimum-lot-area rule. It does not establish overall zoning compliance, development capacity, subdivision rights, or project approval.",
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
        "other_rule_families_evaluated": [],
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
