"""Deterministic Packet 53 height-evidence helpers."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any, Mapping

CONTRACT_VERSION = "approved-plan-height-closure-v0-2026-10-02-p53"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def feet(feet_value: str, inches_value: str = "0") -> str:
    """Return an exact decimal-foot representation for a labeled feet/inches dimension."""
    return str(Decimal(feet_value) + Decimal(inches_value) / Decimal("12"))


def compare_max(value: str, maximum: str) -> str:
    return "HEIGHT_RULE_REQUIREMENT_SATISFIED" if Decimal(value) <= Decimal(maximum) else "HEIGHT_RULE_REQUIREMENT_NOT_SATISFIED"


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
