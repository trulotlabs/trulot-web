"""Deterministic Packet 52A FAR closure helpers."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, localcontext
from typing import Any, Mapping

CONTRACT_VERSION = "approved-plan-far-closure-v0-2026-10-02-p52a"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def decimal_ratio(numerator: str, denominator: str) -> str:
    with localcontext() as context:
        context.prec = 50
        return str(Decimal(numerator) / Decimal(denominator))


def interval_sensitivity(*, numerator_min: str, numerator_max: str, denominator_candidates: list[str], maximum: str) -> dict[str, Any]:
    with localcontext() as context:
        context.prec = 50
        ratios = [Decimal(n) / Decimal(d) for n in (numerator_min, numerator_max) for d in denominator_candidates]
        low, high, limit = min(ratios), max(ratios), Decimal(maximum)
        margin_min, margin_max = limit - high, limit - low
    branch_states = ["FAR_RULE_REQUIREMENT_SATISFIED" if ratio <= limit else "FAR_RULE_REQUIREMENT_NOT_SATISFIED" for ratio in ratios]
    return {
        "candidate_far_min": str(low),
        "candidate_far_max": str(high),
        "candidate_margin_min": str(margin_min),
        "candidate_margin_max": str(margin_max),
        "numeric_branch_state": branch_states[0] if len(set(branch_states)) == 1 else "MIXED",
        "all_enumerated_candidates_same": len(set(branch_states)) == 1,
    }


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
