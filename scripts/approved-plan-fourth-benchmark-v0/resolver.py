"""Fail-closed selection for Packet 57's fourth approved-plan benchmark."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


CONTRACT_VERSION = "approved-plan-fourth-benchmark-v0-2026-10-02-p57"
EXCLUDED_PRIMARY_APNS = {"5442140600", "6341302200"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def eligible(candidate: Mapping[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if candidate.get("apn") in EXCLUDED_PRIMARY_APNS:
        reasons.append("EXCLUDED_PRIMARY_PARCEL")
    if not candidate.get("plan_set_available"):
        reasons.append("NO_PLAN_SET")
    if not candidate.get("apn"):
        reasons.append("PARCEL_IDENTITY_UNRESOLVED")
    if not candidate.get("direct_site_dimensions_available"):
        reasons.append("NO_DIRECT_PLAN_DIMENSION")
    if not candidate.get("authoritative_rule_candidate_available"):
        reasons.append("NO_SEALED_RULE_CANDIDATE")
    return not reasons, reasons


def select_candidate(candidates: list[Mapping[str, Any]]) -> dict[str, Any]:
    qualifying = []
    dispositions = []
    for candidate in candidates:
        passed, reasons = eligible(candidate)
        dispositions.append({"project_id": candidate["project_id"], "eligible": passed, "exclusion_reasons": reasons})
        if passed:
            qualifying.append(candidate)
    if not qualifying:
        return {
            "state": "FOURTH_BENCHMARK_PROJECT_NOT_AVAILABLE",
            "selected_project_id": None,
            "candidate_dispositions": dispositions,
        }
    raise ValueError("PACKET_57_REQUIRES_EXPLICIT_QUALITATIVE_SELECTION_IF_ELIGIBLE_CANDIDATES_EXIST")


def integrity_artifact(outputs: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "artifacts": {name: fingerprint(value) for name, value in outputs.items()},
        "bundle_sha256": fingerprint(outputs),
    }
