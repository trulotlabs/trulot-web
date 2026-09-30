#!/usr/bin/env python3
"""Pure Structure Facts V0 normalization helpers.

The helpers preserve source semantics. They never turn a zero, missing row, or
failed source into evidence that a parcel is vacant.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

CONTRACT_VERSION = "structure-facts-v0-2026-09-30"
PARCEL_ACQUISITION = "sangis-20260924T183743Z"
PARCEL_VINTAGE = "2026-08-29"
PARCEL_DATASET = "parcel_base_sangis_v2"
PARCEL_SOURCE_URL = "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0"
FOOTPRINT_ACQUISITION = "building-outlines-city-20260930T161931Z"
FOOTPRINT_VINTAGE = "SPRING_2017_IMAGERY_BASELINE"
FOOTPRINT_DATASET = "city_sandag_building_outlines_2017"
FOOTPRINT_SOURCE_URL = "https://webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer/1"


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def _base_fact(
    *, apn: str | None, source_record_id: str | None, fact_key: str,
    unit: str | None, semantics: str, value: Any, state: str,
    source_state: str, derivation: str, acquisition: str,
    vintage: str, linkage_method: str, linkage_confidence: str,
    provenance_ref: str, limitations: list[str], reason: str | None = None,
) -> dict[str, Any]:
    return {
        "apn": apn,
        "source_record_id": source_record_id,
        "fact_key": fact_key,
        "value": value,
        "unit": unit,
        "source_semantics": semantics,
        "fact_state": state,
        "source_state": source_state,
        "derivation_class": derivation,
        "source_acquisition": acquisition,
        "source_vintage": vintage,
        "linkage_method": linkage_method,
        "linkage_confidence": linkage_confidence,
        "provenance_ref": provenance_ref,
        "limitations": limitations,
        "state_reason": reason,
    }


def unavailable_fact(apn: str | None, fact_key: str, semantics: str, unit: str | None = None) -> dict[str, Any]:
    return _base_fact(
        apn=apn, source_record_id=None, fact_key=fact_key, unit=unit,
        semantics=semantics, value=None, state="unavailable",
        source_state="source_unavailable", derivation="recorded",
        acquisition=PARCEL_ACQUISITION, vintage=PARCEL_VINTAGE,
        linkage_method="EXACT_APN", linkage_confidence="unavailable",
        provenance_ref="sangis_parcel_arcc_mpr_par", limitations=[],
        reason="SOURCE_UNAVAILABLE",
    )


def no_record_fact(apn: str, fact_key: str, semantics: str, unit: str | None = None) -> dict[str, Any]:
    return _base_fact(
        apn=apn, source_record_id=None, fact_key=fact_key, unit=unit,
        semantics=semantics, value=None, state="unknown", source_state="available",
        derivation="recorded", acquisition=PARCEL_ACQUISITION,
        vintage=PARCEL_VINTAGE, linkage_method="EXACT_APN",
        linkage_confidence="no_source_record", provenance_ref="sangis_parcel_arcc_mpr_par",
        limitations=[], reason="NO_SOURCE_RECORD",
    )


def assessor_unit_fact(apn: str, object_id: int, raw_value: str | int | None) -> dict[str, Any]:
    record = f"sangis-parcel-objectid:{object_id}"
    value = int(raw_value) if raw_value not in (None, "") else None
    if value is not None and value > 0:
        state, normalized, reason = "supported", value, None
    else:
        state, normalized, reason = "unknown", None, "SOURCE_ZERO_UNRESOLVED" if value == 0 else "SOURCE_NULL"
    return _base_fact(
        apn=apn, source_record_id=record, fact_key="assessor_dwelling_unit_count",
        unit="dwelling_unit", semantics="Number of units currently constructed on the parcel (SanGIS UNITQTY sourced from County ARCC MPR/PAR).",
        value=normalized, state=state, source_state="available", derivation="recorded",
        acquisition=PARCEL_ACQUISITION, vintage=PARCEL_VINTAGE,
        linkage_method="EXACT_APN", linkage_confidence="authoritative_identifier",
        provenance_ref="sangis_parcel_arcc_mpr_par",
        limitations=[
            "Parcel-level assessment fact; not a building-level record.",
            "A source zero is unresolved and is not evidence of a vacant parcel.",
            "Does not describe proposed units or legal entitlement.",
        ], reason=reason,
    )


def assessor_living_area_fact(apn: str, object_id: int, raw_value: str | int | None) -> dict[str, Any]:
    record = f"sangis-parcel-objectid:{object_id}"
    value = int(raw_value) if raw_value not in (None, "") else None
    if value is not None and 0 < value < 99999:
        state, normalized, reason = "supported", value, None
    elif value == 99999:
        state, normalized, reason = "unknown", None, "SOURCE_LIMIT_VALUE_UNRESOLVED"
    else:
        state, normalized, reason = "unknown", None, "SOURCE_ZERO_UNRESOLVED" if value == 0 else "SOURCE_NULL"
    return _base_fact(
        apn=apn, source_record_id=record, fact_key="assessor_total_living_area_sq_ft",
        unit="square_foot", semantics="Total living area currently constructed on the parcel (SanGIS TOTAL_LVG_AREA sourced from County ARCC MPR/PAR).",
        value=normalized, state=state, source_state="available", derivation="recorded",
        acquisition=PARCEL_ACQUISITION, vintage=PARCEL_VINTAGE,
        linkage_method="EXACT_APN", linkage_confidence="authoritative_identifier",
        provenance_ref="sangis_parcel_arcc_mpr_par",
        limitations=[
            "Living area is not gross floor area, building footprint, or assessed improvement area.",
            "Not approved as a FAR numerator.",
            "A source zero or limit value is unresolved and is not evidence of no structure.",
        ], reason=reason,
    )


def footprint_geometry_fact(apn: str, record: dict[str, str]) -> dict[str, Any]:
    object_id = int(record["objectid"])
    return _base_fact(
        apn=apn, source_record_id=f"building-outline-objectid:{object_id}",
        fact_key="historical_building_footprint_geometry",
        unit="EPSG:2230", semantics="Building outline polygon delineated from Spring 2017 regional imagery using EagleView/Pictometry ChangeFinder methodology.",
        value={"geometry_sha256": record["geometry_sha256"]}, state="supported",
        source_state="available", derivation="recorded", acquisition=FOOTPRINT_ACQUISITION,
        vintage=FOOTPRINT_VINTAGE, linkage_method="SPATIAL_POSITIVE_AREA_SINGLE_PHYSICAL_PARCEL",
        linkage_confidence="conditional_historical", provenance_ref="city_sandag_building_outlines",
        limitations=[
            "Historical 2017 imagery baseline; current completeness is not established.",
            "The source has no APN; this APN link is deterministic spatial derivation.",
            "Not a current structure-presence or vacancy conclusion.",
        ],
    )


def footprint_area_fact(apn: str, record: dict[str, str]) -> dict[str, Any]:
    object_id = int(record["objectid"])
    return _base_fact(
        apn=apn, source_record_id=f"building-outline-objectid:{object_id}",
        fact_key="historical_building_footprint_area_sq_ft",
        unit="square_foot", semantics="Plan-view polygon area derived from the authoritative building-outline geometry in EPSG:2230.",
        value=float(record["derived_footprint_area_sq_ft"]), state="supported",
        source_state="available", derivation="deterministic_derived",
        acquisition=FOOTPRINT_ACQUISITION, vintage=FOOTPRINT_VINTAGE,
        linkage_method="SPATIAL_POSITIVE_AREA_SINGLE_PHYSICAL_PARCEL",
        linkage_confidence="conditional_historical", provenance_ref="city_sandag_building_outlines",
        limitations=[
            "Footprint area is not living area or gross floor area.",
            "Historical 2017 imagery baseline; current completeness is not established.",
            "Not approved for current lot-coverage compliance.",
        ],
    )


def resolve_parcel(
    assessor_row: dict[str, str] | None,
    footprint_summary: dict[str, Any] | None,
    footprint_records: dict[int, dict[str, str]],
    *, source_available: bool = True,
) -> dict[str, Any]:
    apn = (assessor_row or {}).get("apn") or (footprint_summary or {}).get("apn")
    if not source_available:
        return {
            "apn": apn,
            "facts": [
                unavailable_fact(apn, "assessor_dwelling_unit_count", "Number of units currently constructed on the parcel.", "dwelling_unit"),
                unavailable_fact(apn, "assessor_total_living_area_sq_ft", "Total living area currently constructed on the parcel.", "square_foot"),
            ],
            "footprint_linkage": {"state": "SOURCE_UNAVAILABLE", "vacancy_conclusion": None},
        }
    if assessor_row is None:
        return {
            "apn": apn,
            "facts": [
                no_record_fact(apn, "assessor_dwelling_unit_count", "Number of units currently constructed on the parcel.", "dwelling_unit"),
                no_record_fact(apn, "assessor_total_living_area_sq_ft", "Total living area currently constructed on the parcel.", "square_foot"),
            ],
            "footprint_linkage": {"state": "NO_SOURCE_RECORD", "vacancy_conclusion": None},
        }
    apn = assessor_row["apn"]
    object_id = int(assessor_row["objectid"])
    facts = [
        assessor_unit_fact(apn, object_id, assessor_row.get("unitqty")),
        assessor_living_area_fact(apn, object_id, assessor_row.get("total_lvg_area")),
    ]
    summary = footprint_summary or {
        "footprint_state": "SOURCE_UNAVAILABLE", "direct_source_object_ids": [],
        "stack_group_source_object_ids": [], "ambiguous_source_object_ids": [],
    }
    for source_id in summary.get("direct_source_object_ids", []):
        record = footprint_records[int(source_id)]
        facts.extend([footprint_geometry_fact(apn, record), footprint_area_fact(apn, record)])
    return {
        "apn": apn,
        "facts": facts,
        "footprint_linkage": {
            "state": summary["footprint_state"],
            "direct_source_object_ids": summary.get("direct_source_object_ids", []),
            "stack_group_source_object_ids": summary.get("stack_group_source_object_ids", []),
            "ambiguous_source_object_ids": summary.get("ambiguous_source_object_ids", []),
            "vacancy_conclusion": None,
        },
        "raw_assessor_evidence": {
            "year_effective": assessor_row.get("year_effective") or None,
            "bedrooms": assessor_row.get("bedrooms") or None,
            "baths": assessor_row.get("baths") or None,
            "nucleus_use_cd": assessor_row.get("nucleus_use_cd") or None,
            "garage_stalls": assessor_row.get("garage_stalls") or None,
            "usable_sq_feet": assessor_row.get("usable_sq_feet") or None,
            "promotion_state": "RAW_ONLY_SEMANTICS_OR_CURRENTNESS_UNRESOLVED",
        },
    }
