"""Deterministic Legal Lot Evidence V0 resolver.

The resolver preserves assessor, recorded-map, and legal-status evidence as
separate classes.  It never treats an APN or assessor map as proof of a legal
development lot and never calculates compliance or capacity.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any


CONTRACT_VERSION = "legal-lot-evidence-v0-2026-09-30-p25"
LEGAL_STATES = (
    "LEGAL_LOT_ESTABLISHED",
    "LEGAL_LOT_EVIDENCE_PARTIAL",
    "LEGAL_LOT_STATUS_UNRESOLVED",
    "LEGAL_LOT_SOURCE_UNAVAILABLE",
)
DIMENSION_SEMANTICS = (
    "RECORDED_BOUNDARY_LENGTH",
    "ARC_LENGTH",
    "RADIAL_DIMENSION",
    "STREET_WIDTH",
    "EASEMENT_WIDTH",
    "LOT_WIDTH_EXPLICIT",
    "LOT_DEPTH_EXPLICIT",
    "UNKNOWN_DIMENSION",
)
RECONCILIATION_STATES = (
    "EXACT_RECORDED_LOT_MATCH",
    "MULTIPLE_RECORDED_LOTS_ONE_APN",
    "CURRENT_CONFIGURATION_REQUIRES_MODIFICATION_RECORD",
    "IDENTITY_MISMATCH",
    "UNRESOLVED",
)
CHAIN_STATES = ("REMOTE_CHAIN_SUFFICIENT", "RECORDER_CHECK_REQUIRED")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def parse_recorded_references(raw: str | None) -> dict[str, Any]:
    """Parse only explicit common County reference forms; preserve raw text."""
    if not raw:
        return {"raw": raw, "state": "NO_REFERENCE", "references": []}
    cleaned = " ".join(raw.upper().replace("*", " ").split())
    refs: list[dict[str, Any]] = []
    pm = re.search(r"\bPM\s*0*(\d+)\b", cleaned)
    tract = re.search(r"\bTR\s*0*(\d+)\b", cleaned)
    block = re.search(r"\bBLK\s+([A-Z0-9-]+)\b", cleaned)
    parcel = re.search(r"\bPAR\s+([A-Z0-9-]+)\b", cleaned)
    lots = re.search(r"\bLOTS?\s+([A-Z0-9-]+)(?:\s+THRU\s+([A-Z0-9-]+))?", cleaned)
    if pm:
        refs.append({"type": "PARCEL_MAP", "raw": pm.group(0), "normalized": f"PM {int(pm.group(1)):05d}"})
    if tract:
        refs.append({"type": "SUBDIVISION_MAP", "raw": tract.group(0), "normalized": f"MAP {int(tract.group(1)):05d}"})
    if block:
        refs.append({"type": "BLOCK", "raw": block.group(0), "normalized": f"BLOCK {block.group(1)}"})
    if parcel:
        refs.append({"type": "PARCEL", "raw": parcel.group(0), "normalized": f"PARCEL {parcel.group(1)}"})
    if lots:
        normalized = f"LOT {lots.group(1)}" if not lots.group(2) else f"LOTS {lots.group(1)}-{lots.group(2)}"
        refs.append({"type": "LOT", "raw": lots.group(0), "normalized": normalized})
    map_refs = [item for item in refs if item["type"] in {"PARCEL_MAP", "SUBDIVISION_MAP"}]
    ambiguous = bool(re.search(r"\b(?:PM|TR|MAP)\b(?!\s*\d)", cleaned)) or len(map_refs) > 1
    return {"raw": raw, "normalized_text": cleaned, "state": "AMBIGUOUS_REFERENCE" if ambiguous else ("REFERENCE_FOUND" if map_refs else "NO_RESOLVABLE_MAP_REFERENCE"), "references": refs}


def classify_dimension(raw_label: str | None, explicit_role: str | None = None) -> str:
    label = (raw_label or "").lower()
    role = (explicit_role or "").lower()
    if role == "lot_width":
        return "LOT_WIDTH_EXPLICIT"
    if role == "lot_depth":
        return "LOT_DEPTH_EXPLICIT"
    if "arc" in label:
        return "ARC_LENGTH"
    if "radial" in label or "radius" in label:
        return "RADIAL_DIMENSION"
    if "street" in label or "r.o.w" in label or "right of way" in label:
        return "STREET_WIDTH"
    if "easement" in label:
        return "EASEMENT_WIDTH"
    if "boundary" in label or "lot line" in label:
        return "RECORDED_BOUNDARY_LENGTH"
    return "UNKNOWN_DIMENSION"


def legal_area_support(
    area: dict[str, Any],
    modification_chain_complete: bool,
    reconciliation_state: str = "UNRESOLVED",
    legal_status_state: str = "LEGAL_LOT_STATUS_UNRESOLVED",
) -> dict[str, Any]:
    accepted = {"RECORDED_MAP_AREA", "LEGAL_STATUS_RECORD_AREA", "LICENSED_SURVEY_AREA"}
    if area.get("source_semantic") not in accepted:
        return {"state": "UNSUPPORTED", "reason": "ASSESSOR_OR_GEOMETRY_AREA_IS_NOT_LEGAL_LOT_AREA"}
    if not area.get("artifact_sha256"):
        return {"state": "UNSUPPORTED", "reason": "AUTHORITATIVE_ARTIFACT_REQUIRED"}
    if reconciliation_state != "EXACT_RECORDED_LOT_MATCH":
        return {"state": "UNSUPPORTED", "reason": "EXACT_RECORDED_ENTITY_MATCH_REQUIRED"}
    if legal_status_state != "LEGAL_LOT_ESTABLISHED":
        return {"state": "UNSUPPORTED", "reason": "CURRENT_LEGAL_LOT_STATUS_REQUIRED"}
    if not modification_chain_complete:
        return {"state": "UNSUPPORTED", "reason": "MODIFICATION_CHAIN_UNRESOLVED"}
    return {"state": "LEGAL_LOT_AREA_SUPPORTED", "value": area.get("value"), "unit": area.get("unit"), "provenance": area.get("provenance")}


def assign_lot_line_role(evidence: dict[str, Any]) -> dict[str, Any]:
    if evidence.get("explicit_role") in {"FRONT", "REAR", "INTERIOR_SIDE", "STREET_SIDE"} and evidence.get("authoritative_artifact_sha256"):
        return {"state": "SUPPORTED", "role": evidence["explicit_role"]}
    return {"state": "REFUSED", "reason": "RECORDED_MAP_DOES_NOT_EXPLICITLY_ESTABLISH_CODE_LOT_LINE_ROLE"}


def resolve_frontage(evidence: dict[str, Any]) -> dict[str, Any]:
    required = ("street_adjacency", "dedicated_right_of_way", "frontage_length", "code_frontage_semantics", "authoritative_artifact_sha256")
    if all(evidence.get(key) is not None for key in required):
        return {"state": "SUPPORTED", "length_ft": evidence["frontage_length"]}
    return {"state": "REFUSED", "reason": "SITUS_OR_SPATIAL_ADJACENCY_DOES_NOT_ESTABLISH_LEGAL_FRONTAGE", "missing": [key for key in required if evidence.get(key) is None]}


def resolve_legal_lot(fixture: dict[str, Any]) -> dict[str, Any]:
    if fixture.get("source_unavailable"):
        return {"legal_status_state": "LEGAL_LOT_SOURCE_UNAVAILABLE", "reason": fixture["source_unavailable"], "land_dimensions_assigned_to_apn": False, "condo_stack_refusal": "UNDERLYING_LAND_PARCEL_EVIDENCE_REQUIRED" if fixture.get("stacked_or_condo") else None}
    if fixture.get("stacked_or_condo") and not fixture.get("underlying_land_parcel_evidence"):
        state = "LEGAL_LOT_EVIDENCE_PARTIAL" if fixture.get("assessor_evidence") else "LEGAL_LOT_STATUS_UNRESOLVED"
        return {"legal_status_state": state, "reason": "CONDO_APN_LAND_DIMENSIONS_REFUSED", "land_dimensions_assigned_to_apn": False}
    legal = fixture.get("legal_status_evidence") or {}
    if legal.get("establishes_legal_lot") and legal.get("artifact_sha256") and fixture.get("modification_chain", {}).get("state") == "COMPLETE_TO_CURRENT":
        return {"legal_status_state": "LEGAL_LOT_ESTABLISHED", "reason": "AUTHORITATIVE_LEGAL_STATUS_AND_CURRENT_MODIFICATION_CHAIN", "land_dimensions_assigned_to_apn": True}
    if fixture.get("assessor_evidence") or fixture.get("recorded_map_references") or fixture.get("recorded_map_artifacts"):
        return {"legal_status_state": "LEGAL_LOT_EVIDENCE_PARTIAL", "reason": "RELEVANT_RECORDS_DO_NOT_CONCLUSIVELY_ESTABLISH_CURRENT_LEGAL_LOT", "land_dimensions_assigned_to_apn": False}
    return {"legal_status_state": "LEGAL_LOT_STATUS_UNRESOLVED", "reason": "NO_ADEQUATE_LEGAL_STATUS_EVIDENCE", "land_dimensions_assigned_to_apn": False}


def resolve_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    result = resolve_legal_lot(fixture)
    result.update({
        "fixture_id": fixture["fixture_id"],
        "apn": fixture["apn"],
        "parcel_v2_source_identity": fixture["parcel_v2_source_identity"],
        "assessor_map_identifier": fixture.get("assessor_map_identifier"),
        "assessor_evidence": fixture.get("assessor_evidence"),
        "recorded_map_references": fixture.get("recorded_map_references", []),
        "recorded_map_artifacts": fixture.get("recorded_map_artifacts", []),
        "map_lot_or_parcel_identifier": fixture.get("map_lot_or_parcel_identifier"),
        "dimensions": fixture.get("dimensions", []),
        "areas": fixture.get("areas", []),
        "frontage_evidence": fixture.get("frontage_evidence"),
        "lot_line_evidence": fixture.get("lot_line_evidence"),
        "subsequent_modifying_records": fixture.get("subsequent_modifying_records", []),
        "modification_chain": fixture.get("modification_chain"),
        "apn_recorded_entity_reconciliation": fixture.get("apn_recorded_entity_reconciliation", {"state": "UNRESOLVED"}),
        "recorder_chain_state": fixture.get("recorder_chain_state", "RECORDER_CHECK_REQUIRED"),
        "provenance": fixture.get("provenance", []),
        "limitations": fixture.get("limitations", []),
        "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False,
    })
    reconciliation_state = result["apn_recorded_entity_reconciliation"]["state"]
    modification_chain_complete = fixture.get("modification_chain", {}).get("state") == "COMPLETE_TO_CURRENT"
    area_results = [
        legal_area_support(area, modification_chain_complete, reconciliation_state, result["legal_status_state"])
        for area in fixture.get("areas", [])
    ]
    result["legal_area_findings"] = area_results
    result["minimum_lot_area_evaluation_state"] = "READY_FOR_DETERMINISTIC_EVALUATION" if any(item.get("state") == "LEGAL_LOT_AREA_SUPPORTED" for item in area_results) else "BLOCKED_BY_LEGAL_LOT_AREA_EVIDENCE"
    core = dict(result)
    result["fingerprint_sha256"] = fingerprint(core)
    return result
