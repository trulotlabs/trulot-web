"""Packet 35 bounded Fire Code Official setback predicate."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import (  # noqa: E402
    conclusion_guard_fields,
    fingerprint,
)


CONTRACT_VERSION = "fire-defensible-space-predicate-v0-2026-10-01-p35"
EXPECTED_APN = "6341302200"
FIRE_BUFFER_STATES = (
    "FIRE_BUFFER_NOT_REQUIRED_BY_PUBLISHED_DETERMINISTIC_RULE",
    "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED",
    "FIRE_BUFFER_REQUIREMENT_SUPPORTED",
    "FIRE_BUFFER_SOURCE_UNAVAILABLE",
)
PROJECT_EVIDENCE_TYPES = (
    "APPROVED_PROJECT_CONDITION",
    "FIRE_PLAN_REVIEW_COMMENT",
    "FIRE_CODE_OFFICIAL_DETERMINATION",
    "APPROVED_FIRE_ACCESS_OR_DEFENSIBLE_SPACE_PLAN",
    "PERMIT_RECORD_REQUIRED_FIRE_BUFFER",
)
REQUIRED_SOURCE_IDS = {
    "sdmc_131_0443_i",
    "sd_fire_code_adoption",
    "sd_wui_code",
    "california_fire_code",
    "city_defensible_space_guidance",
    "city_vhfhsz_map",
}
FORBIDDEN_CONCLUSIONS = (
    "FIRE_COMPLIANT",
    "FIRE_SAFE",
    "NO_FIRE_ISSUE",
    "FINAL_PROJECT_SETBACK",
    "STRUCTURE_COMPLIANCE",
    "DEVELOPMENT_CAPACITY",
    "BUILDABILITY",
    "PERMIT_APPROVAL",
)


def evaluate_fire_buffer(
    *,
    apn: str,
    sources: Mapping[str, Any],
    geography: Mapping[str, Any],
    project_determination: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve doctrine without converting geography or record absence to false."""

    available = {source_id for source_id, source in sources.items() if source.get("state") == "AVAILABLE"}
    missing = sorted(REQUIRED_SOURCE_IDS - available)
    if apn != EXPECTED_APN or missing:
        result = {
            "contract_version": CONTRACT_VERSION,
            "apn": apn,
            "state": "FIRE_BUFFER_SOURCE_UNAVAILABLE",
            "missing_sources": missing,
            "reason": "APN_SCOPE_MISMATCH" if apn != EXPECTED_APN else "CONTROLLING_SOURCE_UNAVAILABLE",
            "greater_buffer_ft": None,
            "automatic_numeric_rule": None,
            "geography_determines_greater_buffer": None,
            **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("structure_compliance_evaluated", "capacity_calculated")),
        }
        result["fingerprint_sha256"] = fingerprint(result)
        return result

    if geography.get("city_vhfhsz_intersects") is not True:
        geography_state = "CITY_VHFHSZ_NOT_ESTABLISHED"
    else:
        geography_state = "CITY_VHFHSZ_INTERSECTION_SUPPORTED"

    automatic_rule_state = "FIRE_BUFFER_NOT_REQUIRED_BY_PUBLISHED_DETERMINISTIC_RULE"
    if project_determination is None:
        state = "FIRE_BUFFER_PROJECT_REVIEW_REQUIRED"
        greater_buffer_ft = None
        determination = {
            "state": state,
            "record": None,
            "absence_semantics": "No project-specific Fire Code Official determination is present; absence is not FALSE and does not establish that no greater buffer will be required.",
        }
    else:
        evidence_type = project_determination.get("evidence_type")
        value = project_determination.get("required_buffer_ft")
        record_id = project_determination.get("record_id")
        issued_by = project_determination.get("issued_by")
        if evidence_type not in PROJECT_EVIDENCE_TYPES or not record_id or issued_by != "FIRE_CODE_OFFICIAL" or not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
            state = "FIRE_BUFFER_SOURCE_UNAVAILABLE"
            greater_buffer_ft = None
            determination = {
                "state": state,
                "record": None,
                "reason": "PROJECT_DETERMINATION_INCOMPLETE_OR_NONAUTHORITATIVE",
            }
        else:
            state = "FIRE_BUFFER_REQUIREMENT_SUPPORTED"
            greater_buffer_ft = value
            determination = {
                "state": state,
                "record": {
                    "evidence_type": evidence_type,
                    "record_id": record_id,
                    "issued_by": issued_by,
                    "required_buffer_ft": value,
                },
            }

    result = {
        "contract_version": CONTRACT_VERSION,
        "apn": apn,
        "state": state,
        "automatic_rule_state": automatic_rule_state,
        "geography_state": geography_state,
        "geography": dict(geography),
        "legal_doctrine": {
            "section": "SDMC §131.0443(i)",
            "scope": "ALL_STRUCTURES_OUTSIDE_COASTAL_CURRENT_PROFILE",
            "geographic_gate": False,
            "authority": "The Fire Code Official may require a defensible-space buffer greater than the base-zone setback.",
            "automatic_numeric_greater_setback": False,
            "decision_type": "PROJECT_SPECIFIC_FIRE_CODE_OFFICIAL_DETERMINATION",
            "city_wui_relationship": "Mapped WUI/VHFHSZ geography establishes separate fire-hazard, construction, vegetation, and fuel-management context. It does not itself select a greater §131.0443(i) zoning setback.",
            "fuel_zone_relationship": "SDMC §§512.0603 and 512.0604 allow site-specific Fire Code Official increases to fuel-modification distances. Those vegetation/fuel distances do not automatically become a numeric structure-to-property-line setback under §131.0443(i).",
        },
        "automatic_numeric_rule": False,
        "geography_determines_greater_buffer": False,
        "greater_buffer_ft": greater_buffer_ft,
        "project_determination": determination,
        "project_evidence_contract": {
            "accepted_evidence_types": list(PROJECT_EVIDENCE_TYPES),
            "required_fields": ["evidence_type", "record_id", "issued_by=FIRE_CODE_OFFICIAL", "required_buffer_ft"],
            "excluded_as_determinations": ["VHFHSZ map", "WUI map", "general defensible-space guidance", "brush-management obligation", "absence of a located record"],
        },
        "publication_contract": {
            "base_setback_reportable": True,
            "fire_branch_resolved": state == "FIRE_BUFFER_REQUIREMENT_SUPPORTED",
            "final_project_setback_resolved": False,
            "required_caveat": "A greater fire-safety buffer may be required for a specific project by the Fire Code Official.",
            "forbidden_phrases": ["fire compliant", "fire safe", "no fire issue", "final project setback"],
        },
        "gis_lookup_determination": "FIRE_BUFFER_GIS_LOOKUP_NOT_DETERMINATIVE",
        **conclusion_guard_fields(FORBIDDEN_CONCLUSIONS, ("structure_compliance_evaluated", "capacity_calculated")),
    }
    result["fingerprint_sha256"] = fingerprint(result)
    return result


def bridge_setback(*, rule_family: str, base_value_ft: float, other_unresolved: list[str], fire_result: Mapping[str, Any]) -> dict[str, Any]:
    if fire_result.get("state") == "FIRE_BUFFER_SOURCE_UNAVAILABLE":
        requirement_state = "SETBACK_REQUIREMENT_SOURCE_UNAVAILABLE"
    elif fire_result.get("state") == "FIRE_BUFFER_REQUIREMENT_SUPPORTED":
        requirement_state = "SETBACK_REQUIREMENT_CONDITIONAL"
    else:
        requirement_state = "SETBACK_REQUIREMENT_CONDITIONAL"
    return {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "rule_family": rule_family,
        "base_zoning_setback_ft": base_value_ft,
        "base_zoning_setback_reportable": fire_result.get("state") != "FIRE_BUFFER_SOURCE_UNAVAILABLE",
        "requirement_state": requirement_state,
        "other_unresolved_branches": other_unresolved,
        "fire_branch": {
            "state": fire_result.get("state"),
            "automatic_numeric_greater_setback": fire_result.get("automatic_numeric_rule"),
            "greater_buffer_ft": fire_result.get("greater_buffer_ft"),
            "caveat": fire_result.get("publication_contract", {}).get("required_caveat"),
        },
        "final_project_setback_resolved": False,
        "structure_compliance_evaluated": False,
        "capacity_calculated": False,
    }
