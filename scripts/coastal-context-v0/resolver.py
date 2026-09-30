#!/usr/bin/env python3
"""Pure Coastal Context V0 truth-state and Packet 13 bridge logic."""
from __future__ import annotations
import hashlib, json
from typing import Any

CONTRACT_VERSION = "coastal-context-city-sd-2026-09-30-v0"
MAPPING_METHOD = "coastal-overlay-union-positive-area-v1"
STATES = {"OUTSIDE_COASTAL", "INSIDE_COASTAL", "BOUNDARY_AMBIGUOUS", "SOURCE_UNAVAILABLE", "APPLICABILITY_UNRESOLVED"}
EPSILON_SQFT = 0.000001


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def classify_areas(parcel_area_sqft: float | None, coastal_area_sqft: float | None, epsilon_sqft: float = EPSILON_SQFT) -> str:
    if parcel_area_sqft is None or coastal_area_sqft is None or parcel_area_sqft <= 0:
        return "APPLICABILITY_UNRESOLVED"
    if coastal_area_sqft < -epsilon_sqft or coastal_area_sqft > parcel_area_sqft + epsilon_sqft:
        raise ValueError("coastal area must be within parcel area")
    inside = max(0.0, min(parcel_area_sqft, coastal_area_sqft))
    outside = max(0.0, parcel_area_sqft - inside)
    if inside <= epsilon_sqft:
        return "OUTSIDE_COASTAL"
    if outside <= epsilon_sqft:
        return "INSIDE_COASTAL"
    return "BOUNDARY_AMBIGUOUS"


def packet13_projection(state: str) -> dict[str, Any]:
    if state not in STATES:
        raise ValueError(f"unsupported Coastal state: {state}")
    if state == "OUTSIDE_COASTAL":
        return {"coastal_context": "outside_coastal", "source_state": "available", "standards_resolution": "MAY_USE_OUTSIDE_COASTAL_RS_V0"}
    if state == "SOURCE_UNAVAILABLE":
        return {"coastal_context": "unknown", "source_state": "source_unavailable", "standards_resolution": "SOURCE_UNAVAILABLE"}
    return {"coastal_context": "inside_coastal" if state == "INSIDE_COASTAL" else "unknown", "source_state": "available", "standards_resolution": "APPLICABILITY_UNRESOLVED"}


def resolve_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    state = evidence.get("state")
    if state not in STATES:
        raise ValueError("explicit Coastal state required")
    apn = evidence.get("apn")
    if not isinstance(apn, str) or len(apn) != 10 or not apn.isdigit():
        raise ValueError("APN must be ten digits")
    if evidence.get("mapping_method") != MAPPING_METHOD:
        raise ValueError("unrecognized mapping method")
    if state in {"OUTSIDE_COASTAL", "INSIDE_COASTAL", "BOUNDARY_AMBIGUOUS"}:
        derived = classify_areas(evidence.get("parcel_area_sqft"), evidence.get("coastal_area_sqft"))
        if derived != state:
            raise ValueError(f"area evidence resolves {derived}, not {state}")
    if state == "SOURCE_UNAVAILABLE":
        truth_state, value = "unavailable", None
    elif state == "APPLICABILITY_UNRESOLVED":
        truth_state, value = "unknown", None
    elif state == "BOUNDARY_AMBIGUOUS":
        truth_state, value = "partial", None
    else:
        truth_state = "supported"
        value = "outside_coastal" if state == "OUTSIDE_COASTAL" else "inside_coastal"
    result = {
      "contract_version": CONTRACT_VERSION,
      "parcel": {"apn": apn, "parcel_acquisition_id": evidence.get("parcel_acquisition_id"), "source_object_id": evidence.get("parcel_source_object_id"), "geometry_sha256": evidence.get("parcel_geometry_sha256")},
      "coastal_context": {"state": truth_state, "value": value, "evidence_state": state, "source_state": "source_unavailable" if state == "SOURCE_UNAVAILABLE" else "available", "derivation_class": "deterministic_derived", "mapping_method": MAPPING_METHOD, "coastal_area_share_percent": evidence.get("coastal_area_share_percent"), "source_feature_ids": evidence.get("coastal_source_object_ids", [])},
      "packet13_bridge": packet13_projection(state),
      "parcel_compliance_evaluated": False,
      "development_capacity_calculated": False,
      "permit_jurisdiction_inferred": False,
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result
