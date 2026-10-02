"""Deterministic Packet 54 lot-coverage helpers."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, localcontext
from typing import Any, Mapping

CONTRACT_VERSION = "approved-plan-lot-coverage-v0-2026-10-02-p54"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def decimal_sum(values: list[str]) -> str:
    with localcontext() as context:
        context.prec = 50
        return str(sum((Decimal(value) for value in values), Decimal("0")))


def coverage_ratio(covered_area: str, lot_area: str) -> str:
    with localcontext() as context:
        context.prec = 50
        return str(Decimal(covered_area) / Decimal(lot_area))


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
