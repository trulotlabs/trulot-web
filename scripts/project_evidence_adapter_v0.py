"""Generic private project-evidence envelope validation.

The adapter validates shape, identity containment, status containment, and the
public/private boundary. Project and parcel identities are caller-supplied so
the adapter does not encode assumptions from any benchmark project.
"""

from __future__ import annotations

import json
import re
from typing import Any, Collection, Mapping


PRIVATE_CLASS = "PRIVATE_VALIDATION_EVIDENCE"
PROPOSED_SUBJECT = "PROPOSED_PROJECT_FACT"
REQUIRED_FIELDS = {
    "project_id", "apn", "address", "project_status", "plan_set_version",
    "subject", "sheet_provenance", "legal_survey_line_roles", "structure_id",
    "geometry_semantics", "direct_dimensions", "height", "floor_area",
    "proposed_use_units", "project_specific_conditions",
    "privacy_classification", "source_sha256",
}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def validate_project_evidence_envelope(
    envelope: Mapping[str, Any],
    *,
    expected_project_id: str,
    expected_apn: str,
    allowed_project_statuses: Collection[str],
    required_subject: str = PROPOSED_SUBJECT,
) -> None:
    missing = sorted(REQUIRED_FIELDS - set(envelope))
    if missing:
        raise ValueError(f"PLAN_FACT_ENVELOPE_MISSING:{','.join(missing)}")
    if envelope["project_id"] != expected_project_id or envelope["apn"] != expected_apn:
        raise ValueError("PLAN_PROJECT_IDENTITY_MISMATCH")
    if envelope["subject"] != required_subject:
        raise ValueError("PRIVATE_PLAN_FACT_MUST_REMAIN_PROPOSED")
    if envelope["project_status"] not in set(allowed_project_statuses):
        raise ValueError("PLAN_STATUS_OUTSIDE_ALLOWED_SCOPE")
    if envelope["privacy_classification"] != PRIVATE_CLASS:
        raise ValueError("PRIVATE_CLASSIFICATION_REQUIRED")
    if "source_path" in envelope or "private_path" in _canonical_json(envelope):
        raise ValueError("PRIVATE_PATH_LEAKAGE")
    if not re.fullmatch(r"[0-9a-f]{64}", str(envelope["source_sha256"])):
        raise ValueError("PRIVATE_SOURCE_SHA256_REQUIRED")
    provenance = envelope["sheet_provenance"]
    if not isinstance(provenance, Mapping) or not provenance.get("sheet") or not provenance.get("source_ref"):
        raise ValueError("SHEET_PROVENANCE_REQUIRED")
    if not isinstance(envelope["direct_dimensions"], Mapping) or not envelope["direct_dimensions"]:
        raise ValueError("DIRECT_DIMENSION_REQUIRED")
