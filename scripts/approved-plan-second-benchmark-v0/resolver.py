"""Fail-closed rule selection for the second approved-plan benchmark."""

from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-second-benchmark-v0-2026-10-02-p49"
EXPECTED_PROJECT = "PRJ-1140985"
EXPECTED_APN = "5442140600"
EXPECTED_STATUS = "CITY_ISSUED_2025-11-25"
PRIVATE_CLASS = "PRIVATE_VALIDATION_EVIDENCE"
PUBLIC_CLASS = "PUBLIC_AUTHORITY"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def feet_inches_to_decimal(label: str) -> Decimal:
    match = re.fullmatch(r"\s*(\d+)'-(\d+)\"\s*", label)
    if not match:
        raise ValueError("UNSUPPORTED_DIRECT_HEIGHT_LABEL")
    feet, inches = (Decimal(value) for value in match.groups())
    if inches >= 12:
        raise ValueError("INVALID_INCH_VALUE")
    return feet + inches / Decimal(12)


def select_wall_permit_requirement(
    *,
    subject: str,
    jurisdiction: str,
    outside_coastal: bool,
    direct_dimension: bool,
    scale_derived: bool,
    wall_scope: str,
    proposed_max_height_ft: Decimal | None,
    application_profile: str,
) -> dict[str, Any]:
    gates = {
        "proposed_subject": subject == "PROPOSED_PROJECT_FACT",
        "city_jurisdiction": jurisdiction == "CITY_OF_SAN_DIEGO",
        "outside_coastal": outside_coastal is True,
        "direct_dimension": direct_dimension is True,
        "not_scale_derived": scale_derived is False,
        "wall_scope_supported": wall_scope in {"FENCE", "RETAINING_WALL", "SITE_OR_RETAINING_WALL"},
        "application_profile": application_profile == "OUTSIDE_COASTAL_TABLE_142_03A_EFFECTIVE_2024-10-05",
    }
    failed = [name for name, passed in gates.items() if passed is not True]
    if proposed_max_height_ft is None:
        failed.append("proposed_max_height")
    if failed:
        return {"state": "SECOND_BENCHMARK_RULE_SELECTION_UNRESOLVED", "failed_gates": failed, "required_ft": None}

    assert proposed_max_height_ft is not None
    thresholds = {"FENCE": Decimal("7"), "RETAINING_WALL": Decimal("3")}
    if wall_scope in thresholds:
        selected_threshold = thresholds[wall_scope]
        selected_branch = wall_scope
    elif proposed_max_height_ft >= thresholds["FENCE"]:
        # The exact subtype is unnecessary above 7 feet because both Table
        # 142-03A branches independently require a Process One building permit.
        selected_threshold = thresholds["FENCE"]
        selected_branch = "BRANCH_INVARIANT_FENCE_OR_RETAINING_WALL"
    else:
        return {
            "state": "SECOND_BENCHMARK_RULE_SELECTION_UNRESOLVED",
            "failed_gates": ["wall_subtype_changes_threshold"],
            "required_ft": None,
        }
    return {
        "state": "WALL_PERMIT_TRIGGER_REQUIREMENT_RESOLVED",
        "failed_gates": [],
        "required_ft": str(selected_threshold),
        "operator": "MIN",
        "selected_branch": selected_branch,
        "fence_trigger_ft": "7",
        "retaining_wall_trigger_ft": "3",
        "yard_location_required": False,
        "maximum_permitted_height_evaluated": False,
    }


def compare_plan_rule(*, proposed_max_height_ft: Decimal | None, requirement: Mapping[str, Any]) -> dict[str, Any]:
    if requirement.get("state") != "WALL_PERMIT_TRIGGER_REQUIREMENT_RESOLVED" or proposed_max_height_ft is None:
        return {"state": "PLAN_RULE_EVALUATION_UNRESOLVED", "comparison": None}
    required = Decimal(str(requirement["required_ft"]))
    return {
        "state": "PLAN_RULE_REQUIREMENT_SATISFIED" if proposed_max_height_ft >= required else "PLAN_RULE_REQUIREMENT_NOT_SATISFIED",
        "comparison": {
            "expression": "proposed_plan_max_wall_height_ft >= branch_invariant_building_permit_trigger_ft",
            "left": str(proposed_max_height_ft),
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
