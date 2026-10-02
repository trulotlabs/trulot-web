#!/usr/bin/env python3
"""Deterministic state mapping and copy rendering for Packet 59."""

from __future__ import annotations

import hashlib
import json
from typing import Any

CONTRACT_VERSION = "bounded-feasibility-product-contract-v3-2026-10-02-p60e"

PRODUCT_STATES = {
    "MEETS_BASE_RULE",
    "DOES_NOT_MEET_BASE_RULE",
    "CONDITIONAL",
    "NEEDS_EVIDENCE",
    "NOT_APPLICABLE",
    "NOT_EVALUATED",
    "SOURCE_UNAVAILABLE",
    "OUTSIDE_CURRENT_SCOPE",
}

STATE_COPY = {
    "MEETS_BASE_RULE": "Meets the {requirement} base {rule_name} rule.",
    "DOES_NOT_MEET_BASE_RULE": "Does not meet the {requirement} base {rule_name} rule.",
    "CONDITIONAL": "The base {rule_name} requirement is conditional: {condition}.",
    "NEEDS_EVIDENCE": "This rule cannot be evaluated yet because {blocker_copy}",
    "NOT_APPLICABLE": "This rule does not apply to this parcel.",
    "NOT_EVALUATED": "TruLot has not evaluated {subject} yet.",
    "SOURCE_UNAVAILABLE": "This rule cannot be evaluated because its authoritative source is unavailable.",
    "OUTSIDE_CURRENT_SCOPE": "This rule is outside the current TruLot scope.",
}

INTERNAL_TO_PRODUCT = {
    "RULE_REQUIREMENT_SATISFIED": "MEETS_BASE_RULE",
    "PLAN_RULE_REQUIREMENT_SATISFIED": "MEETS_BASE_RULE",
    "RULE_REQUIREMENT_NOT_SATISFIED": "DOES_NOT_MEET_BASE_RULE",
    "RULE_REQUIREMENT_CONDITIONAL": "CONDITIONAL",
    "SETBACK_REQUIREMENT_CONDITIONAL": "CONDITIONAL",
    "RULE_BLOCKED_BY_MISSING_EVIDENCE": "NEEDS_EVIDENCE",
    "HEIGHT_RULE_EVALUATION_UNRESOLVED": "NEEDS_EVIDENCE",
    "FAR_RULE_EVALUATION_UNRESOLVED": "NEEDS_EVIDENCE",
    "STREET_SIDE_SETBACK_NOT_APPLICABLE": "NOT_APPLICABLE",
    "NOT_APPLICABLE": "NOT_APPLICABLE",
    "RULE_NOT_EVALUATED": "NOT_EVALUATED",
    "RULE_SOURCE_UNAVAILABLE": "SOURCE_UNAVAILABLE",
    "RULE_OUTSIDE_V0_SCOPE": "OUTSIDE_CURRENT_SCOPE",
}


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def sha256(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def map_state(internal_state: str) -> str:
    try:
        return INTERNAL_TO_PRODUCT[internal_state]
    except KeyError as exc:
        raise ValueError(f"unmapped internal state: {internal_state}") from exc


def render(state: str, values: dict[str, str]) -> str:
    if state not in PRODUCT_STATES:
        raise ValueError(f"unsupported product state: {state}")
    template = STATE_COPY[state]
    required = [field.split("}")[0] for field in template.split("{")[1:]]
    missing = [field for field in required if field not in values]
    if missing:
        raise ValueError(f"missing template values: {missing}")
    return template.format(**values)


def overall_state(rule_states: list[str], scope_state: str = "IN_SCOPE") -> str:
    if scope_state == "OUTSIDE_CURRENT_SCOPE":
        return "OUTSIDE_CURRENT_SCOPE"
    if scope_state == "SOURCE_UNAVAILABLE":
        return "SOURCE_UNAVAILABLE"
    final = {"MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "NOT_APPLICABLE"}
    if rule_states and all(state in final for state in rule_states):
        return "BASE_PARCEL_RULES_EVALUATED"
    if any(state in final for state in rule_states):
        return "PARTIAL_EVALUATION"
    return "MORE_EVIDENCE_NEEDED"
