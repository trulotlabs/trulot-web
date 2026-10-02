"""Reusable fail-closed current-structure compliance geometry contract."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


CONTRACT_VERSION = "current-structure-compliance-geometry-v0-2026-10-02-p56"

GEOMETRY_LEVELS = (
    "OBSERVATIONAL_STRUCTURE_GEOMETRY",
    "PROJECT_PLAN_STRUCTURE_GEOMETRY",
    "SURVEY_CONTROLLED_STRUCTURE_GEOMETRY",
    "CURRENT_AS_BUILT_STRUCTURE_GEOMETRY",
)

READY_GATES = (
    "legal_property_boundary_established",
    "property_line_roles_established",
    "current_existing_structure_identified",
    "code_relevant_structure_edge_identified",
    "direct_or_survey_controlled_distance",
    "plan_or_survey_status_known",
    "currentness_date_known",
    "no_unresolved_later_footprint_change",
    "geometry_semantics_compatible",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def assess_readiness(gates: Mapping[str, bool]) -> dict[str, Any]:
    unknown = sorted(set(gates) - set(READY_GATES))
    missing = [name for name in READY_GATES if name not in gates]
    if unknown or missing:
        raise ValueError(f"INVALID_READINESS_GATES:unknown={unknown}:missing={missing}")
    failed = [name for name in READY_GATES if gates[name] is not True]
    return {
        "state": "COMPLIANCE_GEOMETRY_READY" if not failed else "COMPLIANCE_GEOMETRY_NOT_READY",
        "gates": {name: gates[name] for name in READY_GATES},
        "failed_gates": failed,
    }


def assess_currentness(*, source_date: str | None, existing_or_as_built: bool,
                       later_change_reconciled: bool, observational_only: bool) -> str:
    if not source_date:
        return "CURRENTNESS_UNRESOLVED"
    if existing_or_as_built and later_change_reconciled and not observational_only:
        return "CURRENTNESS_SUPPORTED"
    return "CURRENTNESS_PARTIAL"


def validate_envelope(envelope: Mapping[str, Any]) -> None:
    required = {
        "parcel_identity", "geometry_subject", "subject_status", "legal_boundary_source",
        "coordinate_reference_system", "property_line_role", "structure_edge_type",
        "direct_dimension", "survey_control", "source_date", "currentness_evidence",
        "later_change_reconciliation", "provenance", "privacy_class",
    }
    missing = sorted(required - set(envelope))
    if missing:
        raise ValueError(f"GEOMETRY_ENVELOPE_MISSING_FIELDS:{','.join(missing)}")
    if envelope["subject_status"] not in {"EXISTING", "PROPOSED", "AS_BUILT", "UNKNOWN"}:
        raise ValueError("INVALID_SUBJECT_STATUS")
    if envelope["privacy_class"] not in {"PUBLIC_AUTHORITY", "PRIVATE_VALIDATION_EVIDENCE", "PUBLIC_DERIVED_FACT"}:
        raise ValueError("INVALID_PRIVACY_CLASS")


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
