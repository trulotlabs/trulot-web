"""Fail-closed contracts for the first approved-plan setback benchmark."""

from __future__ import annotations

import hashlib
import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_evidence_adapter_v0 import validate_project_evidence_envelope


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
    try:
        validate_project_evidence_envelope(
            envelope,
            expected_project_id=EXPECTED_PROJECT,
            expected_apn=EXPECTED_APN,
            allowed_project_statuses={"FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED"},
        )
    except ValueError as error:
        if str(error) == "PLAN_STATUS_OUTSIDE_ALLOWED_SCOPE":
            raise ValueError("SUBMITTAL_STATUS_REQUIRED") from error
        raise


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
