"""Fail-closed height and FAR evaluation for Packet 50."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-height-far-benchmark-v0-2026-10-02-p50"
EXPECTED_PROJECT = "PRJ-1111087"
EXPECTED_APN = "5442140600"
EXPECTED_STATUS = "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def feet_inches_to_decimal(label: str) -> Decimal:
    if label != "40'-0\"":
        raise ValueError("UNSUPPORTED_HEIGHT_LABEL")
    return Decimal("40.00")


def recompute_far(numerator: Decimal, denominator: Decimal) -> dict[str, Any]:
    if denominator <= 0:
        raise ValueError("FAR_DENOMINATOR_MUST_BE_POSITIVE")
    exact = numerator / denominator
    rounded = exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "numerator_sq_ft": str(numerator),
        "denominator_sq_ft": str(denominator),
        "decimal_40_digit_context": str(exact),
        "nearest_hundredth_half_up": str(rounded),
        "plan_display": "1.10",
        "plan_display_matches_nearest_hundredth": rounded == Decimal("1.10"),
        "plan_display_matches_one_decimal_value_with_trailing_zero": exact.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP) == Decimal("1.1"),
    }


def unresolved_height(*, plan_fact: Mapping[str, Any], rule: Mapping[str, Any]) -> dict[str, Any]:
    failed = [
        "coastal_height_limit_peninsula_predicate_not_in_bounded_profile",
        "plan_measurement_datum_not_established",
        "plan_highest_measured_point_not_established",
        "plan_roof_parapet_treatment_not_established",
        "plan_per_structure_plumb_and_overall_measurement_not_established",
    ]
    return {
        "state": "HEIGHT_RULE_EVALUATION_UNRESOLVED",
        "failed_gates": failed,
        "selected_branch": rule["selected_branch"],
        "base_zone_maximum_ft": rule["maximum_ft"],
        "plan_value_ft": plan_fact["value_ft"],
        "comparison": None,
        "reason": "The title-sheet project maximum is direct, but its datum and Code measurement method are not established by the bounded corpus fact.",
    }


def unresolved_far(*, plan_fact: Mapping[str, Any], rule: Mapping[str, Any]) -> dict[str, Any]:
    failed = [
        "plan_numerator_not_reconciled_to_sdmc_113_0234",
        "plan_denominator_not_proven_total_premises_area",
        "required_dedication_area_treatment_not_established",
        "plan_display_not_nearest_hundredth_of_stated_inputs",
    ]
    return {
        "state": "FAR_RULE_EVALUATION_UNRESOLVED",
        "failed_gates": failed,
        "selected_branch": rule["selected_branch"],
        "base_zone_maximum_ratio": rule["maximum_ratio"],
        "plan_display_ratio": plan_fact["display_ratio"],
        "comparison": None,
        "reason": "The stated arithmetic can be recomputed, but the numerator/denominator do not have sealed Code semantics and the displayed hundredth does not match the stated inputs.",
    }


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
