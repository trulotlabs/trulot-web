"""Bounded Packet 28 minimum-lot-depth evaluator.

Evaluates one named rule for one sealed legal lot. It cannot evaluate width,
setbacks, overall zoning compliance, or development capacity.
"""

from __future__ import annotations

import math
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import (  # noqa: E402
    canonical_json, compare_values, conclusion_guard_fields,
    evaluate_evidence_gates, fingerprint, integrity_artifact,
    provenance_graph, unresolved_result,
)


CONTRACT_VERSION = "minimum-lot-depth-evaluation-v0-2026-09-30-p28"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "lot_depth_min"

FORBIDDEN_CONCLUSIONS = (
    "OVERALL_ZONING_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
    "MAXIMUM_UNITS",
    "LOT_WIDTH_COMPLIANCE",
    "FRONTAGE_COMPLIANCE",
    "SETBACK_COMPLIANCE",
    "FAR_COMPLIANCE",
    "SUBDIVISION_ELIGIBILITY",
    "PERMIT_LIKELIHOOD",
    "BUILDABILITY",
    "ENTITLEMENT",
)


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _bearing_vector(length: Decimal, degrees: int, minutes: int, seconds: int) -> tuple[float, float]:
    """Return east/north components for an N dd mm ss E map bearing."""
    azimuth = math.radians(degrees + minutes / 60 + seconds / 3600)
    return float(length) * math.sin(azimuth), float(length) * math.cos(azimuth)


def evaluate_minimum_lot_depth(
    parcel: dict[str, Any],
    legal_lot: dict[str, Any],
    rule: dict[str, Any],
    measurement_authority: dict[str, Any],
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
        "recorded_map": any(a.get("sheet") == 2 and a.get("artifact_state") == "ACQUIRED_AUTHORITATIVE_TIFF" for a in legal_lot.get("recorded_map_artifacts", [])),
        "rule_family": rule.get("standard_key") == EXPECTED_RULE_KEY and rule.get("zone_code") == EXPECTED_ZONE,
        "rule_state": rule.get("fact_state") == "RECORDED" and rule.get("condition") == [] and rule.get("operator") == "MIN",
        "depth_definition": measurement_authority.get("depth_definition_state") == "RESOLVED_MIDPOINT_TO_MIDPOINT",
        "front_line": measurement_authority.get("front_property_line", {}).get("state") == "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY",
        "rear_line": measurement_authority.get("rear_property_line", {}).get("state") == "RESOLVED_OPPOSITE_MOST_DISTANT_WEST_LINE",
        "right_of_way": measurement_authority.get("right_of_way_treatment", {}).get("state") == "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY",
        "geometry": measurement_authority.get("geometry_state") == "RECORDED_MAP_SUFFICIENT",
    }
    gate_result = evaluate_evidence_gates(gates)
    if not gate_result.passed:
        return unresolved_result(contract_version=CONTRACT_VERSION, apn=EXPECTED_APN, rule_family="minimum_lot_depth", failed_gates=gate_result.failed, false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"))

    geometry = measurement_authority["recorded_geometry"]
    north_length = _decimal(geometry["north_rear_to_front"]["length_ft"])
    south_length = _decimal(geometry["south_rear_to_front"]["length_ft"])
    north_vector = _bearing_vector(north_length, 89, 55, 5)
    south_vector = _bearing_vector(south_length, 89, 54, 59)
    midpoint_vector = ((north_vector[0] + south_vector[0]) / 2, (north_vector[1] + south_vector[1]) / 2)
    raw_depth = Decimal(str(math.hypot(*midpoint_vector)))
    code_depth = raw_depth.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    required_depth = _decimal(rule["value"]["number"])
    comparison = compare_values(measured=code_depth, required=required_depth, unit="ft", operator="MIN", expression="code_defined_lot_depth_ft >= minimum_lot_depth_ft")

    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "minimum_lot_depth",
        "evaluation_scope": "MINIMUM_LOT_DEPTH_ONLY",
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
            "recorded_map_artifact_sha256": next(a["artifact_sha256"] for a in legal_lot["recorded_map_artifacts"] if a["sheet"] == 2),
            "deed_artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"],
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
            "numeric_value": int(required_depth),
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
            "dependency_disposition": {"131.0442": "REVIEWED_NOT_APPLICABLE_TO_RS_1_7_LOT_DEPTH; section governs frontage exceptions and RX-1-2 dimensions"},
            "source_section": rule["source_section"],
            "source_table": rule["source_table"],
            "source_page": rule["source_page"],
            "source_url": rule["source_url"],
            "source_edition": rule["source_evidence"]["source_edition"],
            "source_sha256": rule["source_evidence"]["source_sha256"],
            "provenance_sha256": rule["provenance_sha256"],
        },
        "measurement_doctrine": measurement_authority,
        "dimension_distinctions": {
            "recorded_boundary_lengths": "PM 17383 survey calls; none is relabeled as lot depth",
            "parcel_map_geometry": "Recorded bearings and lengths reconstruct the rear-to-front boundary vectors",
            "development_regulation_boundary": "The line separating the lot from the 27th Street public right-of-way is the front property line",
            "code_defined_lot_depth": "Straight-line distance from the midpoint of the front property line to the midpoint of the rear property line",
        },
        "geometry_reconstruction": {
            "coordinate_convention": "east-positive x, north-positive y; rear-line endpoints are the origins of the two rear-to-front side vectors",
            "north_rear_to_front_vector_ft": {"east": f"{north_vector[0]:.9f}", "north": f"{north_vector[1]:.9f}"},
            "south_rear_to_front_vector_ft": {"east": f"{south_vector[0]:.9f}", "north": f"{south_vector[1]:.9f}"},
            "rear_midpoint_to_front_midpoint_vector_ft": {"east": f"{midpoint_vector[0]:.9f}", "north": f"{midpoint_vector[1]:.9f}"},
            "identity": "For a four-sided lot, the vector between opposite-line midpoints equals the arithmetic mean of the two connecting side vectors.",
            "unrounded_distance_ft": f"{raw_depth:.12f}",
            "source_precision": "Lengths are recorded to 0.01 ft and bearings to 1 arc-second.",
            "reported_code_defined_lot_depth_ft": str(code_depth),
            "derivation_class": "DETERMINISTIC_DERIVED_FROM_RECORDED_MAP_AND_CODE_MEASUREMENT_RULE",
            "assumptions": [],
            "parcel_v2_geometry_used": False,
        },
        "comparison": comparison.comparison,
        "state": comparison.state,
        "bounded_conclusion": "The supported Code-defined lot depth satisfies the RS-1-7 minimum lot depth standard." if comparison.state == "RULE_REQUIREMENT_SATISFIED" else "The supported Code-defined lot depth does not satisfy the RS-1-7 minimum lot depth standard.",
        "mandatory_qualifier": "This evaluates only the minimum-lot-depth rule. It does not establish overall zoning compliance, development capacity, setback compliance, or project approval.",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
