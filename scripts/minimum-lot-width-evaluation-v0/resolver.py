"""Bounded Packet 29 minimum-lot-width evaluator."""

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


CONTRACT_VERSION = "minimum-lot-width-evaluation-v0-2026-09-30-p29"
EXPECTED_APN = "6341302200"
EXPECTED_ZONE = "RS-1-7"
EXPECTED_RULE_KEY = "lot_width_min"

FORBIDDEN_CONCLUSIONS = (
    "OVERALL_ZONING_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
    "MAXIMUM_UNITS",
    "FRONTAGE_COMPLIANCE",
    "SETBACK_COMPLIANCE",
    "FAR_COMPLIANCE",
    "SUBDIVISION_ELIGIBILITY",
    "PERMIT_LIKELIHOOD",
    "BUILDABILITY",
    "ENTITLEMENT",
)


def _bearing_vector(length: float, degrees: int, minutes: int, seconds: int, east: bool = True) -> tuple[float, float]:
    angle = math.radians(degrees + minutes / 60 + seconds / 3600)
    return ((1 if east else -1) * length * math.sin(angle), length * math.cos(angle))


def _intersection(origin: tuple[float, float], direction: tuple[float, float], line_origin: tuple[float, float], line_direction: tuple[float, float]) -> tuple[float, float, float]:
    """Return parameter on measurement line, parameter on boundary, and determinant."""
    rhs = (line_origin[0] - origin[0], line_origin[1] - origin[1])
    determinant = direction[0] * (-line_direction[1]) - (-line_direction[0]) * direction[1]
    t = (rhs[0] * (-line_direction[1]) - (-line_direction[0]) * rhs[1]) / determinant
    u = (direction[0] * rhs[1] - rhs[0] * direction[1]) / determinant
    return t, u, determinant


def evaluate_minimum_lot_width(parcel: dict[str, Any], legal_lot: dict[str, Any], standard_rule: dict[str, Any], corner_rule: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
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
        "width_definition": authority.get("width_definition_state") == "RESOLVED_PERPENDICULAR_AT_DEPTH_MIDPOINT",
        "irregularity": authority.get("irregular_lot_disposition", {}).get("state") == "NOT_APPLICABLE",
        "lot_classification": authority.get("lot_classification", {}).get("state") == "SINGLE_FRONTAGE_INTERIOR_NON_CORNER",
        "property_lines": authority.get("property_line_roles_state") == "RESOLVED",
        "right_of_way": authority.get("right_of_way_treatment", {}).get("state") == "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY",
        "geometry": authority.get("geometry_state") == "RECORDED_MAP_SUFFICIENT",
        "rule_family": standard_rule.get("standard_key") == EXPECTED_RULE_KEY and standard_rule.get("zone_code") == EXPECTED_ZONE,
        "rule_state": standard_rule.get("fact_state") == "RECORDED" and standard_rule.get("condition") == [] and standard_rule.get("operator") == "MIN",
        "corner_rule_excluded": corner_rule.get("standard_key") == "corner_lot_width_min" and corner_rule.get("fact_state") == "CONDITIONAL" and authority.get("lot_classification", {}).get("corner_lot") is False,
    }
    gate_result = evaluate_evidence_gates(gates)
    if not gate_result.passed:
        return unresolved_result(contract_version=CONTRACT_VERSION, apn=EXPECTED_APN, rule_family="minimum_lot_width", failed_gates=gate_result.failed, false_fields=("parcel_compliance_evaluated", "development_capacity_calculated"))

    g = authority["recorded_geometry"]
    southwest = (0.0, 0.0)
    rear_vector = _bearing_vector(float(g["rear_line"]["length_ft"]), 0, 4, 59, east=False)
    northwest = rear_vector
    south_vector = _bearing_vector(float(g["south_rear_to_front"]["length_ft"]), 89, 54, 59)
    north_vector = _bearing_vector(float(g["north_rear_to_front"]["length_ft"]), 89, 55, 5)
    southeast = south_vector
    northeast = (northwest[0] + north_vector[0], northwest[1] + north_vector[1])
    rear_midpoint = ((southwest[0] + northwest[0]) / 2, (southwest[1] + northwest[1]) / 2)
    front_midpoint = ((southeast[0] + northeast[0]) / 2, (southeast[1] + northeast[1]) / 2)
    depth_vector = (front_midpoint[0] - rear_midpoint[0], front_midpoint[1] - rear_midpoint[1])
    depth_midpoint = ((rear_midpoint[0] + front_midpoint[0]) / 2, (rear_midpoint[1] + front_midpoint[1]) / 2)
    width_direction = (-depth_vector[1], depth_vector[0])
    south_t, south_u, _ = _intersection(depth_midpoint, width_direction, southwest, south_vector)
    north_t, north_u, _ = _intersection(depth_midpoint, width_direction, northwest, north_vector)
    south_point = (depth_midpoint[0] + south_t * width_direction[0], depth_midpoint[1] + south_t * width_direction[1])
    north_point = (depth_midpoint[0] + north_t * width_direction[0], depth_midpoint[1] + north_t * width_direction[1])
    raw_width = Decimal(str(math.hypot(north_point[0] - south_point[0], north_point[1] - south_point[1])))
    code_width = raw_width.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    required_width = Decimal(str(standard_rule["value"]["number"]))
    comparison = compare_values(measured=code_width, required=required_width, unit="ft", operator="MIN", expression="code_defined_lot_width_ft >= applicable_minimum_width_ft")

    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": "minimum_lot_width",
        "evaluation_scope": "MINIMUM_LOT_WIDTH_ONLY",
        "gates": gates,
        "parcel_identity": {"situs_address": identity.get("situs_address"), "parcel_intelligence_fingerprint_sha256": parcel.get("fingerprint_sha256"), "parcel_geometry_sha256": identity.get("geometry_sha256")},
        "legal_lot": {"recorded_entity": "PM 17383 PARCEL 1", "recorded_deed": "DOC # 2001-0706032", "state": legal_lot["legal_status_state"], "reconciliation_state": legal_lot["apn_recorded_entity_reconciliation"]["state"], "recorded_map_artifact_sha256": g["artifact_sha256"], "deed_artifact_sha256": legal_lot["recorded_deed_artifacts"][0]["artifact_sha256"]},
        "zoning": {"mapping_state": zoning["mapping_state"], "zone_code": EXPECTED_ZONE, "mapping_row_sha256": zoning.get("mapping_row_sha256"), "coastal_state": coastal["evidence_state"], "coastal_fingerprint_sha256": coastal.get("layer_fingerprint_sha256"), "standards_version": standards["rule_set_version"], "standards_fingerprint_sha256": standards.get("fingerprint_sha256")},
        "lot_classification": authority["lot_classification"],
        "applicable_rule": {"selection": "STANDARD_MINIMUM_WIDTH", "excluded_rule": {"standard_key": corner_rule["standard_key"], "numeric_value": int(Decimal(str(corner_rule["value"]["number"]))), "reason": "Parcel is not a corner lot."}, "rule_id": standard_rule["rule_id"], "standard_key": standard_rule["standard_key"], "numeric_value": int(required_width), "unit": standard_rule["unit"], "operator": standard_rule["operator"], "fact_state": standard_rule["fact_state"], "condition": standard_rule["condition"], "jurisdiction_variant": standard_rule["jurisdiction_variant"], "rule_set_version": standard_rule["rule_set_version"], "dependency_disposition": {"131.0442": "REVIEWED_NOT_APPLICABLE_TO_RS_1_7_WIDTH; section governs street-frontage exceptions and RX-1-2 dimensions"}, "source_section": standard_rule["source_section"], "source_table": standard_rule["source_table"], "source_page": standard_rule["source_page"], "source_url": standard_rule["source_url"], "source_edition": standard_rule["source_evidence"]["source_edition"], "source_sha256": standard_rule["source_evidence"]["source_sha256"], "provenance_sha256": standard_rule["provenance_sha256"]},
        "measurement_doctrine": authority,
        "dimension_distinctions": {"recorded_boundary_lengths": "PM 17383 survey calls; the 94-foot edges are not relabeled as width", "frontage": "Length of the premises property line along the street; not evaluated", "property_line_roles": "East line is front, west line is rear, north and south lines are side property lines", "development_regulation_boundary": "Front line separates the lot from the 27th Street public right-of-way", "code_defined_lot_width": "Perpendicular distance between side lot lines at the midpoint of the front-to-rear depth line"},
        "geometry_reconstruction": {"coordinate_convention": "east-positive x, north-positive y; southwest rear corner is the origin", "depth_midpoint_ft": {"east": f"{depth_midpoint[0]:.9f}", "north": f"{depth_midpoint[1]:.9f}"}, "south_intersection_ft": {"east": f"{south_point[0]:.9f}", "north": f"{south_point[1]:.9f}", "side_parameter": f"{south_u:.12f}"}, "north_intersection_ft": {"east": f"{north_point[0]:.9f}", "north": f"{north_point[1]:.9f}", "side_parameter": f"{north_u:.12f}"}, "unrounded_distance_ft": f"{raw_width:.12f}", "source_precision": "Lengths are recorded to 0.01 ft and bearings to 1 arc-second; result is reported to 0.01 ft.", "reported_code_defined_lot_width_ft": str(code_width), "derivation_class": "DETERMINISTIC_DERIVED_FROM_RECORDED_MAP_AND_CODE_MEASUREMENT_RULE", "assumptions": [], "parcel_v2_geometry_used": False},
        "comparison": comparison.comparison,
        "state": comparison.state,
        "bounded_conclusion": "The supported Code-defined lot width satisfies the RS-1-7 minimum lot width standard." if comparison.state == "RULE_REQUIREMENT_SATISFIED" else "The supported Code-defined lot width does not satisfy the RS-1-7 minimum lot width standard.",
        "mandatory_qualifier": "This evaluates only the minimum-lot-width rule. It does not establish overall zoning compliance, development capacity, frontage compliance, setback compliance, or project approval.",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
