"""Fail-closed rule selection for the third approved-plan benchmark."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-third-benchmark-v0-2026-10-02-p55"
EXPECTED_PROJECT = "PRJ-1110168"
EXPECTED_APN = "5442140600"
EXPECTED_STATUS = "REFERENCE_SHEETS_EMBEDDED; DIRECT_APPROVAL_STATUS_NOT_INDEPENDENTLY_VERIFIED"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def select_driveway_requirement(
    *,
    subject: str,
    jurisdiction: str,
    lot_width_gt_50: bool,
    use_category: str,
    outside_parking_impact_overlay: bool,
    direct_dimension: bool,
    scale_derived: bool,
    application_profile: str,
) -> dict[str, Any]:
    gates = {
        "proposed_subject": subject == "PROPOSED_PROJECT_FACT",
        "city_jurisdiction": jurisdiction == "CITY_OF_SAN_DIEGO",
        "lot_width_greater_than_50_ft": lot_width_gt_50 is True,
        "detached_single_dwelling_unit_use": use_category == "DETACHED_SINGLE_DWELLING_UNIT_WITH_ACCESSORY_DWELLING_UNITS",
        "outside_parking_impact_overlay": outside_parking_impact_overlay is True,
        "direct_dimension": direct_dimension is True,
        "not_scale_derived": scale_derived is False,
        "application_profile": application_profile == "RESIDENTIAL_TABLE_142_05M_UNCHANGED_ACROSS_2024_APPLICATION_AND_2025_PLAN",
    }
    failed = [name for name, passed in gates.items() if passed is not True]
    if failed:
        return {
            "state": "THIRD_BENCHMARK_RULE_SELECTION_UNRESOLVED",
            "failed_gates": failed,
            "minimum_ft": None,
            "maximum_ft": None,
        }
    return {
        "state": "DRIVEWAY_WIDTH_REQUIREMENT_RESOLVED",
        "failed_gates": [],
        "selected_branch": "LOT_GT_50_DETACHED_SINGLE_DWELLING_OUTSIDE_PIOZ",
        "minimum_ft": "12",
        "maximum_ft": "25",
        "minimum_operator": "MIN",
        "maximum_operator": "MAX",
    }


def compare_plan_rule(*, proposed_width_ft: Decimal | None, requirement: Mapping[str, Any]) -> dict[str, Any]:
    if requirement.get("state") != "DRIVEWAY_WIDTH_REQUIREMENT_RESOLVED" or proposed_width_ft is None:
        return {"state": "PLAN_RULE_EVALUATION_UNRESOLVED", "comparisons": []}
    minimum = Decimal(str(requirement["minimum_ft"]))
    maximum = Decimal(str(requirement["maximum_ft"]))
    comparisons = [
        {
            "expression": "proposed_driveway_width_ft >= applicable_minimum_width_ft",
            "left": str(proposed_width_ft), "operator": ">=", "right": str(minimum), "unit": "ft",
            "state": "RULE_REQUIREMENT_SATISFIED" if proposed_width_ft >= minimum else "RULE_REQUIREMENT_NOT_SATISFIED",
        },
        {
            "expression": "proposed_driveway_width_ft <= applicable_maximum_width_ft",
            "left": str(proposed_width_ft), "operator": "<=", "right": str(maximum), "unit": "ft",
            "state": "RULE_REQUIREMENT_SATISFIED" if proposed_width_ft <= maximum else "RULE_REQUIREMENT_NOT_SATISFIED",
        },
    ]
    state = "PLAN_RULE_REQUIREMENT_SATISFIED" if all(item["state"] == "RULE_REQUIREMENT_SATISFIED" for item in comparisons) else "PLAN_RULE_REQUIREMENT_NOT_SATISFIED"
    return {"state": state, "comparisons": comparisons}


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
