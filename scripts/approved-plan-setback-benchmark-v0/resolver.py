"""Fail-closed contracts for the first approved-plan setback benchmark."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-setback-benchmark-v0-2026-10-01-p42"
EXPECTED_PROJECT = "PRJ-1111087"
EXPECTED_APN = "5442140600"
PRIVATE_CLASS = "PRIVATE_VALIDATION_EVIDENCE"
PUBLIC_CLASS = "PUBLIC_AUTHORITY"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def validate_plan_fact_envelope(envelope: Mapping[str, Any]) -> None:
    required = {
        "project_id", "apn", "address", "project_status", "plan_set_version",
        "subject", "sheet_provenance", "legal_survey_line_roles", "structure_id",
        "geometry_semantics", "direct_dimensions", "height", "floor_area",
        "proposed_use_units", "project_specific_conditions",
        "privacy_classification", "source_sha256",
    }
    missing = sorted(required - set(envelope))
    if missing:
        raise ValueError(f"PLAN_FACT_ENVELOPE_MISSING:{','.join(missing)}")
    if envelope["project_id"] != EXPECTED_PROJECT or envelope["apn"] != EXPECTED_APN:
        raise ValueError("PLAN_PROJECT_IDENTITY_MISMATCH")
    if envelope["subject"] != "PROPOSED_PROJECT_FACT":
        raise ValueError("PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED")
    if envelope["project_status"] != "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED":
        raise ValueError("SUBMITTAL_STATUS_REQUIRED")
    if envelope["privacy_classification"] != PRIVATE_CLASS:
        raise ValueError("PRIVATE_CLASSIFICATION_REQUIRED")
    if "source_path" in envelope or "private_path" in canonical_json(envelope):
        raise ValueError("PRIVATE_PATH_LEAKAGE")


def reconcile_zone(public_zone: str, plan_zone: str) -> dict[str, Any]:
    """The public zone is authoritative; the plan value can only corroborate or conflict."""
    state = "MATCH" if public_zone == plan_zone else "CONFLICT"
    return {
        "authoritative_zone": public_zone,
        "plan_reported_zone": plan_zone,
        "state": state,
        "selected_zone": public_zone,
        "private_plan_overrode_public_zone": False,
    }


def select_setback_requirement(*, subject: str, family: str | None, multistory: bool,
                               adjacent_residential: bool, outside_coastal: bool,
                               application_profile: str,
                               fire_override_applies_to_profile: bool,
                               greater_fire_setback_ft: Decimal | None) -> dict[str, Any]:
    gates = {
        "proposed_subject": subject == "PROPOSED_PROJECT_FACT",
        "family_resolved": family == "INTERIOR_SIDE_SETBACK",
        "multistory": multistory is True,
        "adjacent_residential": adjacent_residential is True,
        "outside_coastal": outside_coastal is True,
        "application_profile": application_profile == "OUTSIDE_COASTAL_O-21618_EFFECTIVE_2023-05-06",
    }
    failed = [name for name, passed in gates.items() if passed is not True]
    if failed:
        return {"state": "PLAN_SETBACK_VALIDATION_UNRESOLVED", "failed_gates": failed, "required_ft": None}
    if fire_override_applies_to_profile and greater_fire_setback_ft is None:
        return {"state": "PLAN_SETBACK_VALIDATION_UNRESOLVED", "failed_gates": ["project_specific_fire_setback"], "required_ft": None}
    required = max(Decimal("4"), greater_fire_setback_ft or Decimal("0"))
    return {
        "state": "SETBACK_REQUIREMENT_RESOLVED",
        "failed_gates": [],
        "required_ft": str(required),
        "operator": "MIN",
        "selected_branch": "MULTISTORY_ADU_ADJACENT_TO_RESIDENTIALLY_ZONED_PREMISES",
        "fire_override_applies_to_selected_profile": fire_override_applies_to_profile,
    }


def compare_plan_setback(*, proposed_ft: Decimal | None, requirement: Mapping[str, Any]) -> dict[str, Any]:
    if requirement.get("state") != "SETBACK_REQUIREMENT_RESOLVED" or proposed_ft is None:
        return {"state": "PLAN_RULE_EVALUATION_UNRESOLVED", "comparison": None}
    required = Decimal(str(requirement["required_ft"]))
    return {
        "state": "PLAN_RULE_REQUIREMENT_SATISFIED" if proposed_ft >= required else "PLAN_RULE_REQUIREMENT_NOT_SATISFIED",
        "comparison": {
            "expression": "proposed_plan_setback_ft >= applicable_required_setback_ft",
            "left": str(proposed_ft),
            "operator": ">=",
            "right": str(required),
            "unit": "ft",
        },
    }


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
