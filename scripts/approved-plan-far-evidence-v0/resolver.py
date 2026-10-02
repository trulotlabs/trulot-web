"""Deterministic, fail-closed FAR evidence helpers for Packet 52."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP, localcontext
from math import cos, radians, sin
from typing import Any, Mapping

CONTRACT_VERSION = "approved-plan-far-evidence-v0-2026-10-02-p52"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def sum_areas(rows: list[Mapping[str, Any]], predicate=lambda row: True) -> Decimal:
    return sum((Decimal(row["labeled_area_sq_ft"]) for row in rows if predicate(row)), Decimal("0"))


def recompute_far(numerator: str, denominator: str) -> dict[str, str]:
    with localcontext() as context:
        context.prec = 40
        value = Decimal(numerator) / Decimal(denominator)
    return {
        "exact": str(value),
        "one_decimal_half_up": str(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
        "two_decimal_half_up": str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
    }


def survey_traverse_area(courses: list[Mapping[str, Any]]) -> dict[str, str]:
    points = [(0.0, 0.0)]
    for course in courses:
        angle = radians(course["degrees"] + course["minutes"] / 60 + course["seconds"] / 3600)
        length = course["length_ft"]
        dy = cos(angle) * length * (1 if course["north_south"] == "N" else -1)
        dx = sin(angle) * length * (1 if course["east_west"] == "E" else -1)
        x, y = points[-1]
        points.append((x + dx, y + dy))
    area = abs(sum(points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1] for i in range(len(courses)))) / 2
    closure = (points[-1][0] ** 2 + points[-1][1] ** 2) ** 0.5
    return {"area_sq_ft": f"{area:.6f}", "closure_ft": f"{closure:.6f}"}


def compare_max(*, measured: str | None, maximum: str, gates_pass: bool) -> dict[str, Any]:
    if not gates_pass or measured is None:
        return {"state": "FAR_RULE_EVALUATION_UNRESOLVED", "comparison": None, "margin": None}
    value = Decimal(measured)
    limit = Decimal(maximum)
    return {
        "state": "FAR_RULE_REQUIREMENT_SATISFIED" if value <= limit else "FAR_RULE_REQUIREMENT_NOT_SATISFIED",
        "comparison": f"{value} <= {limit}",
        "margin": str(limit - value),
    }


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
