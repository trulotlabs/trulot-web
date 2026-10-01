"""Fail-closed contracts for Approved Plan Golden Corpus V0."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-golden-corpus-v0-2026-10-01-p41"
AUTHORIZED_CLASSES = {
    "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED",
    "PUBLIC_RECORD",
    "RESTRICTED_COPY",
}
EVIDENTIARY_METHODS = {
    "DIRECT_RECORDED_DIMENSION",
    "DIRECT_LABELED_PLAN_DIMENSION",
    "DIRECT_RECORDED_FACT",
    "DIRECT_LABELED_PLAN_ANNOTATION",
}
DIAGNOSTIC_METHODS = {
    "SCALE_DERIVED_MEASUREMENT",
    "IMAGE_PIXEL_ESTIMATE",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def validate_candidate(candidate: Mapping[str, Any]) -> None:
    classification = candidate.get("privacy_classification")
    if classification not in AUTHORIZED_CLASSES:
        raise ValueError("UNAUTHORIZED_OR_UNCLEAR_SOURCE")
    if not candidate.get("source_location"):
        raise ValueError("SOURCE_LOCATION_REQUIRED")
    if candidate.get("selected") and not candidate.get("plan_set_present"):
        raise ValueError("SELECTED_PROJECT_REQUIRES_PLAN_SET")


def classify_extraction(method: str, *, reproduction_integrity_validated: bool = False) -> str:
    if method in EVIDENTIARY_METHODS:
        return "GOLDEN_EVIDENCE"
    if method == "SCALE_DERIVED_MEASUREMENT":
        # Scale-derived values remain diagnostic even after reproduction validation.
        return "DIAGNOSTIC_SCALE_DERIVED_VALIDATED" if reproduction_integrity_validated else "DIAGNOSTIC_ONLY"
    if method == "IMAGE_PIXEL_ESTIMATE":
        return "DIAGNOSTIC_ONLY"
    raise ValueError(f"UNSUPPORTED_EXTRACTION_METHOD:{method}")


def validate_fact(fact: Mapping[str, Any]) -> None:
    if fact.get("subject") not in {"PROPOSED_PROJECT_FACT", "EXISTING_PARCEL_FACT"}:
        raise ValueError("FACT_SUBJECT_REQUIRED")
    if fact.get("method") not in EVIDENTIARY_METHODS | DIAGNOSTIC_METHODS:
        raise ValueError("INVALID_EXTRACTION_METHOD")
    if not all(fact.get(key) for key in ("sheet_number", "sheet_title", "source_state", "provenance")):
        raise ValueError("SHEET_PROVENANCE_REQUIRED")
    expected = classify_extraction(
        fact["method"],
        reproduction_integrity_validated=bool(fact.get("reproduction_integrity_validated")),
    )
    if fact.get("evidence_class") != expected:
        raise ValueError("EXTRACTION_CLASS_MISMATCH")
    if fact["subject"] == "EXISTING_PARCEL_FACT" and fact.get("project_scope") == "PROPOSED_WORK":
        raise ValueError("PROPOSED_FACT_MUST_NOT_BECOME_EXISTING_FACT")


def geometry_readiness(evidence: Mapping[str, Any]) -> str:
    required = (
        "property_line_tie",
        "building_frame_location",
        "setback_dimensions",
        "plan_status_recorded",
        "project_semantics_clear",
    )
    return "COMPLIANCE_GEOMETRY_READY" if all(evidence.get(key) is True for key in required) else "COMPLIANCE_GEOMETRY_NOT_READY"


def build_integrity(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
