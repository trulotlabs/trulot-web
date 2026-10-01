"""Generic, fail-closed machinery for parcel-specific dimensional rules.

Measurement doctrine remains in rule-specific modules. This module owns the
shared evidence gate, numeric comparison, conclusion containment, provenance
shape, and deterministic rendering used by Packets 27–30.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Mapping, Sequence


CONTRACT_VERSION = "dimensional-rule-evaluator-v0-2026-10-01-p31"
RESULT_STATES = ("RULE_REQUIREMENT_SATISFIED", "RULE_REQUIREMENT_NOT_SATISFIED", "RULE_EVALUATION_UNRESOLVED")
CONTRACT_FIELDS = (
    "parcel_identity", "legal_lot_state", "rule_family", "rule_id", "rule_source",
    "measurement_doctrine", "required_semantic_inputs", "resolved_inputs",
    "measurement_result", "unit", "applicable_requirement", "operator",
    "condition_state", "comparison_result", "bounded_conclusion",
    "forbidden_conclusions", "provenance",
)
CORE_FORBIDDEN_CONCLUSIONS = (
    "OVERALL_ZONING_COMPLIANCE", "BUILDABILITY", "DEVELOPMENT_CAPACITY",
    "ENTITLEMENT", "PERMIT_LIKELIHOOD", "SUBDIVISION_ELIGIBILITY",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


@dataclass(frozen=True)
class GateResult:
    passed: bool
    failed: tuple[str, ...]


def evaluate_evidence_gates(gates: Mapping[str, Any]) -> GateResult:
    """Require literal True for every gate; nulls and truthy values do not pass."""
    failed = tuple(name for name, state in gates.items() if state is not True)
    return GateResult(passed=not failed, failed=failed)


def unresolved_result(*, contract_version: str, apn: str, rule_family: str, failed_gates: Sequence[str], false_fields: Sequence[str]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "contract_version": contract_version,
        "apn": apn,
        "rule_family": rule_family,
        "state": "RULE_EVALUATION_UNRESOLVED",
        "reason": "REQUIRED_GATE_FAILED",
        "failed_gates": list(failed_gates),
    }
    result.update({name: False for name in false_fields})
    result["other_rule_families_evaluated"] = []
    return result


@dataclass(frozen=True)
class ComparisonResult:
    comparison: dict[str, str]
    state: str


def compare_values(*, measured: Decimal, required: Decimal, unit: str, operator: str, expression: str) -> ComparisonResult:
    operations = {
        "MIN": (">=", lambda left, right: left >= right),
        "MAX": ("<=", lambda left, right: left <= right),
        "EXACT": ("==", lambda left, right: left == right),
    }
    if operator not in operations:
        raise ValueError(f"UNSUPPORTED_COMPARISON_OPERATOR:{operator}")
    symbol, operation = operations[operator]
    satisfied = operation(measured, required)
    return ComparisonResult(
        comparison={"expression": expression, "left": str(measured), "operator": symbol, "right": str(required), "unit": unit},
        state="RULE_REQUIREMENT_SATISFIED" if satisfied else "RULE_REQUIREMENT_NOT_SATISFIED",
    )


def conclusion_guard_fields(forbidden_conclusions: Iterable[str], false_fields: Sequence[str]) -> dict[str, Any]:
    forbidden = tuple(forbidden_conclusions)
    if not forbidden:
        raise ValueError("FORBIDDEN_CONCLUSIONS_REQUIRED")
    result: dict[str, Any] = {"forbidden_conclusions": list(forbidden)}
    result.update({name: False for name in false_fields})
    result["other_rule_families_evaluated"] = []
    return result


def provenance_graph(contract_version: str, hops: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    if not hops or any(not hop.get("hop") for hop in hops):
        raise ValueError("PROVENANCE_HOPS_REQUIRED")
    return {"contract_version": contract_version, "chain": [dict(hop) for hop in hops]}


def integrity_artifact(contract_version: str, outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {"contract_version": contract_version, "artifacts": {name: fingerprint(value) for name, value in outputs.items()}, "bundle_sha256": fingerprint(outputs)}


def validate_contract(contract: Mapping[str, Any]) -> None:
    missing = [field for field in CONTRACT_FIELDS if field not in contract]
    if missing:
        raise ValueError(f"MISSING_CONTRACT_FIELDS:{','.join(missing)}")
    if contract["comparison_result"] not in RESULT_STATES:
        raise ValueError("INVALID_COMPARISON_RESULT")


def combined_fingerprint(contracts: Sequence[Mapping[str, Any]]) -> str:
    for contract in contracts:
        validate_contract(contract)
    return fingerprint(list(contracts))
