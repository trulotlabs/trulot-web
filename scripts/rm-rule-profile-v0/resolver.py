"""Deterministic, fail-closed resolver primitives for RM Rule Profile V0."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any, Mapping


CONTRACT_VERSION = "rm-rule-profile-v0-2026-10-02-p51"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def select_version(profiles: list[Mapping[str, Any]], *, on_date: str, coastal_context: str) -> Mapping[str, Any]:
    matches = [
        p for p in profiles
        if p["effective_from"] <= on_date
        and (p["effective_through"] is None or on_date <= p["effective_through"])
        and p["coastal_applicability"] == coastal_context
    ]
    if len(matches) != 1:
        raise ValueError("VERSION_SELECTION_MUST_BE_UNIQUE")
    return matches[0]


def select_unit_band(bands: list[Mapping[str, Any]], units: int) -> Mapping[str, Any]:
    if units < 1:
        raise ValueError("DWELLING_UNIT_COUNT_MUST_BE_POSITIVE")
    matches = [b for b in bands if units >= b["minimum_units"] and (b["maximum_units"] is None or units <= b["maximum_units"])]
    if len(matches) != 1:
        raise ValueError("UNIT_BAND_SELECTION_MUST_BE_UNIQUE")
    return matches[0]


def apply_footnote(base: Mapping[str, Any], footnote: Mapping[str, Any], predicates: Mapping[str, bool | None]) -> dict[str, Any]:
    values = [predicates.get(name) for name in footnote["trigger_predicates"]]
    if any(value is None for value in values):
        return {"state": "unknown", "value": None, "base_value": base["base_value"], "derivation": "conditional"}
    if all(values):
        return {"state": "supported", "value": footnote["effect"]["value"], "base_value": base["base_value"], "derivation": "deterministic_derived"}
    return {"state": "supported", "value": base["base_value"], "base_value": base["base_value"], "derivation": "recorded"}


def apply_modifier(value: str, modifier: Mapping[str, Any], predicates: Mapping[str, bool | None]) -> dict[str, Any]:
    resolved = [predicates.get(name) for name in modifier["predicates"]]
    if any(item is None for item in resolved):
        return {"state": "unknown", "value": None, "derivation": "conditional"}
    if not all(resolved):
        return {"state": "supported", "value": value, "derivation": "recorded", "modifier_applied": False}
    mode = modifier["operation"]
    if mode == "UNCHANGED":
        result = Decimal(value)
    elif mode == "ADDITIVE":
        result = Decimal(value) + Decimal(modifier["operand"])
    elif mode == "OVERRIDE":
        result = Decimal(modifier["operand"])
    elif mode == "EXEMPTION":
        return {"state": "not_applicable", "value": None, "derivation": "deterministic_derived", "modifier_applied": True}
    else:
        raise ValueError("UNSUPPORTED_MODIFIER_OPERATION")
    return {"state": "supported", "value": format(result, "f"), "derivation": "deterministic_derived", "modifier_applied": True}


def proportional_setback(*, premises_width_ft: str, fraction: str, floor_ft: str) -> str:
    return format(max(Decimal(premises_width_ft) * Decimal(fraction), Decimal(floor_ft)), "f")


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
