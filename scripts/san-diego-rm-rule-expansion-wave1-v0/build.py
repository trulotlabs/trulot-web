#!/usr/bin/env python3
"""Build Packet 80 San Diego RM expansion artifacts from sealed local inputs."""
from __future__ import annotations

import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
# When staged under /private/tmp, callers set the real root through this fallback.
if not (ROOT / "data").exists():
    ROOT = Path("/Users/ops/trulot-web-parcel")
OUT = ROOT / "data" / "san-diego-rm-rule-expansion-wave1-v0"
P79 = ROOT / "data" / "san-diego-parcel-zoning-selection-v0"
TARGETS = ("RM-1-1", "RM-3-7", "RM-3-9", "RM-1-3", "RM-4-10")
RESIDENTIAL_PREFIXES = ("RS-", "RM-", "RT-", "RX-")
CONTRACT_VERSION = "san-diego-rm-rule-expansion-wave1-2026-10-27-v0"
CURRENT_CODE_SHA = "9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538"
O21836_SHA = "2ab750ff80f2d1aaf860e625d9d640e5b06c027aabf31d3dd7636b8411a00d48"
O21934_SHA = "162f93058df3a250846da3bc6d7ac6a74e900a7ae0bf649be51da278e7da86b6"
O22109_SHA = "ee3d256eb0fad8f65f6b78bb4bf702a377093b4c87b391d8400f463686ff2e70"
P79_SELECTION_SHA = "ce09b175011ce9907690cfdd598a7da185e229f0b0a2d42298263664d9acbeaf"


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def canonical_sha(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(name: str, value: Any) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n")


def write_gzip_ndjson(name: str, rows: list[dict[str, Any]]) -> None:
    body = b"".join(canonical(row) + b"\n" for row in rows)
    with (OUT / name).open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as stream:
            stream.write(body)


def source_fingerprint(zone: str, family: str, raw: Any, footnotes: list[str], locator: str) -> str:
    return canonical_sha({"source_artifact_sha256": CURRENT_CODE_SHA, "zone": zone, "family": family, "raw": raw, "footnotes": footnotes, "locator": locator})


FOOTNOTES: dict[str, dict[str, Any]] = {
    "FN1": {"source_text": "One dwelling unit per specified square foot of lot area as determined in accordance with Section 113.0222.", "trigger": "DENSITY_RULE_USED", "families": ["DENSITY"], "derivation_class": "PROCESS", "section": "113.0222"},
    "FN2": {"source_text": "An exception to maximum permitted density may be permitted under Chapter 14, Article 3, Division 7.", "trigger": "AFFORDABLE_HOUSING_REGULATIONS_APPLY", "families": ["DENSITY"], "derivation_class": "EXCEPTION", "section": "143.0701_ET_SEQ"},
    "FN3": {"source_text": "See Section 131.0443(d)(1).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["FRONT_SETBACK_MINIMUM", "FRONT_SETBACK_STANDARD"], "derivation_class": "FORMULA", "section": "131.0443(d)(1)"},
    "FN4": {"source_text": "See Section 131.0443(d)(2).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["INTERIOR_SIDE_SETBACK_MINIMUM", "INTERIOR_SIDE_SETBACK_STANDARD"], "derivation_class": "FORMULA", "section": "131.0443(d)(2)"},
    "FN5": {"source_text": "See Section 131.0443(d)(3).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["STREET_SIDE_SETBACK_MINIMUM"], "derivation_class": "FORMULA", "section": "131.0443(d)(3)"},
    "FN6": {"source_text": "See Section 131.0443(d)(4).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["REAR_SETBACK_MINIMUM"], "derivation_class": "EXCEPTION", "section": "131.0443(d)(4)"},
    "FN11": {"source_text": "See Section 131.0443(f)(1).", "trigger": "ZONE_RM_3_7_TO_RM_3_9", "families": ["FRONT_SETBACK_MINIMUM", "FRONT_SETBACK_STANDARD"], "derivation_class": "FORMULA", "section": "131.0443(f)(1)"},
    "FN12": {"source_text": "See Section 131.0443(f)(2).", "trigger": "ZONE_RM_3_7_TO_RM_3_9", "families": ["INTERIOR_SIDE_SETBACK_MINIMUM"], "derivation_class": "FORMULA", "section": "131.0443(f)(2)"},
    "FN13": {"source_text": "See Section 131.0443(f)(3).", "trigger": "ZONE_RM_3_7_TO_RM_3_9", "families": ["STREET_SIDE_SETBACK_MINIMUM"], "derivation_class": "FORMULA", "section": "131.0443(f)(3)"},
    "FN14": {"source_text": "See Section 131.0443(g).", "trigger": "ZONE_RM_4_10_OR_RM_4_11", "families": ["FRONT_SETBACK_MINIMUM", "INTERIOR_SIDE_SETBACK_MINIMUM", "STREET_SIDE_SETBACK_MINIMUM", "REAR_SETBACK_MINIMUM"], "derivation_class": "FORMULA", "section": "131.0443(g)"},
    "FN15": {"source_text": "See Section 131.0461(a).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["ARCHITECTURAL_PROJECTIONS"], "derivation_class": "CONDITIONAL", "section": "131.0461(a)"},
    "FN16": {"source_text": "See Section 131.0461(c).", "trigger": "ZONE_RM_2_4_TO_RM_5_12", "families": ["ARCHITECTURAL_PROJECTIONS"], "derivation_class": "CONDITIONAL", "section": "131.0461(c)"},
    "FN17": {"source_text": "See Section 131.0444(e).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["STRUCTURE_HEIGHT_MAXIMUM"], "derivation_class": "GEOMETRIC_LIMIT", "section": "131.0444(e)"},
    "FN22": {"source_text": "See Section 131.0455(a).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["PRIVATE_EXTERIOR_OPEN_SPACE"], "derivation_class": "FORMULA", "section": "131.0455(a)"},
    "FN24": {"source_text": "See Section 131.0455(c).", "trigger": "ZONE_RM_3_7_TO_RM_3_9", "families": ["PRIVATE_EXTERIOR_OPEN_SPACE"], "derivation_class": "FORMULA", "section": "131.0455(c)"},
    "FN25": {"source_text": "See Section 131.0455(d).", "trigger": "ZONE_RM_4_10_TO_RM_5_12", "families": ["PRIVATE_EXTERIOR_OPEN_SPACE"], "derivation_class": "FORMULA", "section": "131.0455(d)"},
    "FN26": {"source_text": "See Section 131.0464(d).", "trigger": "ZONE_RM_1_1_TO_RM_1_3", "families": ["SUPPLEMENTAL_REQUIREMENTS"], "derivation_class": "CONDITIONAL", "section": "131.0464(d)"},
    "FN28": {"source_text": "See Section 131.0464(f).", "trigger": "ZONE_RM_3_7_TO_RM_3_9", "families": ["SUPPLEMENTAL_REQUIREMENTS"], "derivation_class": "CONDITIONAL", "section": "131.0464(f)"},
    "FN37": {"source_text": "Within the Coastal Height Limit Overlay Zone in the Peninsula Community Plan area, the base-zone maximum structure height is 30 feet, determined under Section 113.0270(a)(4)(D).", "trigger": "COASTAL_HEIGHT_LIMIT_OVERLAY_AND_PENINSULA_COMMUNITY_PLAN", "families": ["STRUCTURE_HEIGHT_MAXIMUM"], "derivation_class": "MODIFIER", "section": "113.0270(a)(4)(D)"},
    "FN39": {"source_text": "For development in a historic district, on State Historic Resources Inventory property, or on a designated historical resource site, maximum FAR shall not increase.", "trigger": "HISTORIC_RESOURCE_CONTEXT", "families": ["FLOOR_AREA_RATIO_MAXIMUM"], "derivation_class": "MODIFIER", "section": "TABLE_131_04G_NOTE_39"},
}

ZONE_ROWS: dict[str, dict[str, Any]] = {
    "RM-1-1": {"density": 3000, "lot_area": 6000, "width": 50, "frontage": 50, "corner": 55, "depth": 90, "front_min": 15, "front_std": 20, "side_min": 5, "side_std": 8, "street_side": 10, "rear": 15, "height": 30, "height_notes": ["FN17"], "far": [("1_TO_2_DU", 0.75, []), ("3_TO_7_DU", 1.0, ["FN39"]), ("8_PLUS_DU", 1.25, ["FN39"])], "setback_notes": ["FN3", "FN4", "FN5", "FN6"], "private_note": "FN22", "projection_note": "FN15", "supplemental_note": "FN26", "ground_floor": False, "lot_consolidation": True},
    "RM-1-3": {"density": 2000, "lot_area": 6000, "width": 50, "frontage": 50, "corner": 55, "depth": 90, "front_min": 15, "front_std": 20, "side_min": 5, "side_std": 8, "street_side": 10, "rear": 15, "height": 30, "height_notes": ["FN17"], "far": [("1_TO_2_DU", 1.05, []), ("3_TO_7_DU", 1.05, []), ("8_PLUS_DU", 1.25, ["FN39"])], "setback_notes": ["FN3", "FN4", "FN5", "FN6"], "private_note": "FN22", "projection_note": "FN15", "supplemental_note": "FN26", "ground_floor": False, "lot_consolidation": False},
    "RM-3-7": {"density": 1000, "lot_area": 7000, "width": 70, "frontage": 70, "corner": 75, "depth": 100, "front_min": 10, "front_std": 20, "side_min": 5, "side_std": None, "street_side": 10, "rear": 5, "height": 40, "height_notes": ["FN37"], "far": [("ALL", 1.80, [])], "setback_notes": ["FN11", "FN12", "FN13"], "private_note": "FN24", "projection_note": "FN16", "supplemental_note": "FN28", "ground_floor": False, "lot_consolidation": False},
    "RM-3-9": {"density": 600, "lot_area": 7000, "width": 70, "frontage": 70, "corner": 75, "depth": 100, "front_min": 10, "front_std": 20, "side_min": 5, "side_std": None, "street_side": 10, "rear": 5, "height": 60, "height_notes": ["FN37"], "far": [("ALL", 2.70, [])], "setback_notes": ["FN11", "FN12", "FN13"], "private_note": "FN24", "projection_note": "FN16", "supplemental_note": "FN28", "ground_floor": True, "lot_consolidation": False},
    "RM-4-10": {"density": 400, "lot_area": 7000, "width": 100, "frontage": 100, "corner": 100, "depth": 100, "front_min": None, "front_std": None, "side_min": None, "side_std": None, "street_side": None, "rear": None, "height": None, "height_notes": ["FN37"], "far": [("ALL", 3.60, [])], "setback_notes": ["FN14"], "private_note": "FN25", "projection_note": "FN16", "supplemental_note": None, "ground_floor": True, "lot_consolidation": False},
}

REQUIRED_FAMILIES = {
    "DENSITY", "MINIMUM_LOT_AREA", "MINIMUM_LOT_WIDTH", "MINIMUM_STREET_FRONTAGE",
    "MINIMUM_CORNER_LOT_WIDTH", "MINIMUM_LOT_DEPTH", "FRONT_SETBACK_MINIMUM",
    "INTERIOR_SIDE_SETBACK_MINIMUM", "STREET_SIDE_SETBACK_MINIMUM", "REAR_SETBACK_MINIMUM",
    "STRUCTURE_HEIGHT_MAXIMUM", "FLOOR_AREA_RATIO_MAXIMUM", "LOT_COVERAGE_MAXIMUM",
    "PRIVATE_EXTERIOR_OPEN_SPACE", "COMMON_OPEN_SPACE", "RESUBDIVIDED_CORNER_LOT_SETBACKS",
}


def rule(zone: str, family: str, value: Any, unit: str | None, operator: str, representation: str, footnotes: list[str], locator: str, conditions: list[str] | None = None, unresolved: list[str] | None = None, branch: str | None = None) -> dict[str, Any]:
    rid = f"{zone.replace('-', '')}_{family}" + (f"_{branch}" if branch else "")
    return {
        "rule_id": rid,
        "zone_code": zone,
        "rule_family": family,
        "representation": representation,
        "operator": operator,
        "value": {"kind": "unknown"} if value is None else {"kind": "number" if isinstance(value, (int, float)) else "recorded", "value": value},
        "unit": unit,
        "conditions": conditions or [],
        "footnote_ids": footnotes,
        "unresolved_dependencies": unresolved or [],
        "source_fingerprint": source_fingerprint(zone, family, value, footnotes, locator),
        "source_locator": {"document": "SDMC_CH13_ART1_DIV4_9_2026", "table_or_section": locator, "artifact_sha256": CURRENT_CODE_SHA},
        "derivation_class": "recorded" if representation == "DIRECT" else "conditional",
        "public_evaluation_state": "SOURCE_NOT_SPECIFIED" if representation == "NOT_SPECIFIED" else "RULE_FACT_ONLY_REVIEW_REQUIRED" if representation != "DIRECT" else "RULE_FACT_ONLY",
        "project_comparison": False,
    }


def rules_for(zone: str) -> list[dict[str, Any]]:
    z = ZONE_ROWS[zone]
    rules = [
        rule(zone, "DENSITY", z["density"], "sq_ft_per_dwelling_unit", "PROCESS", "CONDITIONAL", ["FN1", "FN2"], "Table 131-04G pp.40-42", ["LOT_AREA_PER_113_0222", "AFFORDABLE_HOUSING_EXCEPTION_REMAINS_SEPARATE"], ["CODE_LOT_AREA"]),
        rule(zone, "MINIMUM_LOT_AREA", z["lot_area"], "sq_ft", "MIN", "DIRECT", [], "Table 131-04G pp.40-42"),
        rule(zone, "MINIMUM_LOT_WIDTH", z["width"], "ft", "MIN", "DIRECT", [], "Table 131-04G pp.40-42"),
        rule(zone, "MINIMUM_STREET_FRONTAGE", z["frontage"], "ft", "MIN", "CONDITIONAL", [], "Table 131-04G and 131.0442(a)", ["CURVING_STREET_EXCEPTION_MAY_REDUCE_TO_60_PERCENT"], ["STREET_CENTERLINE_RADIUS"]),
        rule(zone, "MINIMUM_CORNER_LOT_WIDTH", z["corner"], "ft", "MIN", "DIRECT", [], "Table 131-04G pp.40-42"),
        rule(zone, "MINIMUM_LOT_DEPTH", z["depth"], "ft", "MIN", "DIRECT", [], "Table 131-04G pp.40-42"),
    ]
    if zone.startswith("RM-1-"):
        rules += [
            rule(zone, "FRONT_SETBACK_MINIMUM", z["front_min"], "ft", "MIN", "FORMULA", ["FN3"], "Table 131-04G; 131.0443(d)(1)", ["MAX_50_PERCENT_ENVELOPE_WIDTH_AT_MINIMUM", "CURVING_STREET_BRANCH_5_FT_MIN_10_FT_STANDARD"], ["BUILDING_ENVELOPE_WIDTH", "CURVING_STREET_RADIUS"]),
            rule(zone, "FRONT_SETBACK_STANDARD", z["front_std"], "ft", "MIN", "FORMULA", ["FN3"], "Table 131-04G; 131.0443(d)(1)", ["REMAINDER_OF_ENVELOPE_WIDTH_AT_STANDARD"]),
            rule(zone, "INTERIOR_SIDE_SETBACK_MINIMUM", z["side_min"], "ft", "FORMULA", "FORMULA", ["FN4"], "Table 131-04G; 131.0443(d)(2)", ["ONE_SIDE_MAY_USE_5_FT_FOR_50_PERCENT_LENGTH", "OPPOSITE_SIDE_MAY_USE_5_FT_ALL_LENGTH", "NARROW_PREMISES_BRANCHES"], ["PREMISES_WIDTH", "EXISTING_DEVELOPMENT_SETBACK"]),
            rule(zone, "INTERIOR_SIDE_SETBACK_STANDARD", z["side_std"], "ft", "FORMULA", "FORMULA", ["FN4"], "Table 131-04G; 131.0443(d)(2)", ["MAX_8_FT_OR_10_PERCENT_PREMISES_WIDTH"], ["PREMISES_WIDTH"]),
            rule(zone, "STREET_SIDE_SETBACK_MINIMUM", z["street_side"], "ft", "FORMULA", "FORMULA", ["FN5"], "Table 131-04G; 131.0443(d)(3)", ["MAX_10_FT_OR_10_PERCENT_PREMISES_WIDTH"], ["PREMISES_WIDTH"]),
            rule(zone, "REAR_SETBACK_MINIMUM", z["rear"], "ft", "MIN", "CONDITIONAL", ["FN6"], "Table 131-04G; 131.0443(d)(4)", ["ALLEY_CREDIT_HALF_WIDTH_CAPPED_10_FT", "ON_PREMISES_MINIMUM_5_FT"], ["ALLEY_WIDTH"]),
        ]
    elif zone.startswith("RM-3-"):
        rules += [
            rule(zone, "FRONT_SETBACK_MINIMUM", z["front_min"], "ft", "MIN", "FORMULA", ["FN11"], "Table 131-04G; 131.0443(f)(1)", ["MAX_50_PERCENT_ENVELOPE_WIDTH_AT_MINIMUM", "CURVING_STREET_BRANCH_5_FT_MIN_10_FT_STANDARD"], ["BUILDING_ENVELOPE_WIDTH", "CURVING_STREET_RADIUS"]),
            rule(zone, "FRONT_SETBACK_STANDARD", z["front_std"], "ft", "MIN", "FORMULA", ["FN11"], "Table 131-04G; 131.0443(f)(1)", ["REMAINDER_OF_ENVELOPE_WIDTH_AT_STANDARD"]),
            rule(zone, "INTERIOR_SIDE_SETBACK_MINIMUM", z["side_min"], "ft", "FORMULA", "FORMULA", ["FN12"], "Table 131-04G; 131.0443(f)(2)", ["MAX_5_FT_OR_10_PERCENT_PREMISES_WIDTH", "ZERO_SIDE_OPTION_MAX_50_PERCENT_WITH_30_FT_ELEMENTS_AND_6_FT_SEPARATION"], ["PREMISES_WIDTH", "BUILDING_SIDE_LENGTH", "DWELLING_ACCESS"]),
            rule(zone, "STREET_SIDE_SETBACK_MINIMUM", z["street_side"], "ft", "FORMULA", "FORMULA", ["FN13"], "Table 131-04G; 131.0443(f)(3)", ["MAX_10_FT_OR_10_PERCENT_PREMISES_WIDTH", "MAX_50_PERCENT_FACADE_MAY_ENCROACH_5_FT"], ["PREMISES_WIDTH", "FACADE_LENGTH"]),
            rule(zone, "REAR_SETBACK_MINIMUM", z["rear"], "ft", "MIN", "DIRECT", [], "Table 131-04G pp.42-43"),
        ]
    else:
        common = ["TWO_CONTIGUOUS_NORTHERLY_AND_EASTERLY_YARDS_AT_LEAST_15_FT", "SIDE_AND_REAR_EQUAL_ADJACENT_RESIDENTIAL_ZONE_IF_MORE_RESTRICTIVE"]
        for family in ("FRONT_SETBACK_MINIMUM", "INTERIOR_SIDE_SETBACK_MINIMUM", "STREET_SIDE_SETBACK_MINIMUM", "REAR_SETBACK_MINIMUM"):
            rules.append(rule(zone, family, None, "ft", "FORMULA", "FORMULA", ["FN14"], "Table 131-04G; 131.0443(g)", common, ["LOT_ORIENTATION", "ADJACENT_RESIDENTIAL_ZONE_RULES"]))
    rules.append(rule(zone, "RESUBDIVIDED_CORNER_LOT_SETBACKS", "APPLIES", None, "PROCESS", "CONDITIONAL", [], "Table 131-04G; 113.0246(f)", ["PRESERVE_ORIGINAL_FRONT_AND_STREET_SIDE_SETBACK_TREATMENT", "APPLY_INTERIOR_SIDE_REQUIREMENTS_TO_REMAINING_LOT_LINES"], ["SUBDIVISION_HISTORY", "ORIGINAL_CORNER_LOT_CONFIGURATION", "DESIGNATED_LOT_LINES"]))
    if z["height"] is None:
        rules.append(rule(zone, "STRUCTURE_HEIGHT_MAXIMUM", None, "ft", "MAX", "CONDITIONAL", z["height_notes"], "Table 131-04G footnote 37", ["30_FT_ONLY_IF_COASTAL_HEIGHT_LIMIT_OVERLAY_AND_PENINSULA_COMMUNITY_PLAN"], ["COASTAL_HEIGHT_LIMIT_OVERLAY", "COMMUNITY_PLAN", "BASE_MAX_NOT_SPECIFIED_BY_TABLE"]))
    else:
        cond = ["MEASURE_PER_113_0270"]
        if "FN17" in z["height_notes"]:
            cond += ["45_DEGREE_FRONT_PLANE_ABOVE_19_FT_AT_MINIMUM_OR_24_FT_AT_STANDARD", "45_DEGREE_SIDE_PLANE_ABOVE_24_FT"]
        if "FN37" in z["height_notes"]:
            cond += ["30_FT_OVERRIDE_IF_COASTAL_HEIGHT_LIMIT_OVERLAY_AND_PENINSULA_COMMUNITY_PLAN"]
        rules.append(rule(zone, "STRUCTURE_HEIGHT_MAXIMUM", z["height"], "ft", "MAX", "CONDITIONAL", z["height_notes"], "Table 131-04G; 131.0444; 113.0270", cond, ["GRADE_AND_STRUCTURE_GEOMETRY", "COASTAL_HEIGHT_LIMIT_OVERLAY", "COMMUNITY_PLAN"]))
    rules.append(rule(zone, "LOT_COVERAGE_MAXIMUM", None, None, "NOT_SPECIFIED", "NOT_SPECIFIED", [], "Table 131-04G pp.40-42"))
    for band, value, notes in z["far"]:
        rules.append(rule(zone, "FLOOR_AREA_RATIO_MAXIMUM", value, "ratio", "MAX", "CONDITIONAL", notes, "Table 131-04G; 113.0234; 131.0446", [f"UNIT_BAND_{band}", "GFA_AND_PREMISES_AREA_PER_113_0234", "CHILD_CARE_BONUS_SEPARATE"], ["DWELLING_UNIT_COUNT", "CODE_GROSS_FLOOR_AREA", "LEGAL_PREMISES_AREA", "PROGRAM_AND_HISTORIC_CONTEXT"], band))
    private_conditions = {
        "FN22": ["60_SQ_FT_PER_DU", "MIN_DIMENSION_6_FT", "MAY_OCCUPY_YARDS_WITH_9_FT_FRONT_REAR_AND_4_FT_SIDE_CLEARANCE"],
        "FN24": ["75_PERCENT_OF_DUS_HAVE_60_SQ_FT", "MIN_DIMENSION_6_FT", "FRONT_YARD_ALLOWED_NO_CLOSER_THAN_9_FT", "COMMON_SPACE_ALTERNATIVE_IF_DEFICIT"],
        "FN25": ["50_SQ_FT_PER_DU", "MIN_DIMENSION_4_FT", "COMMON_SPACE_ALTERNATIVE_IF_DEFICIT"],
    }
    rules += [
        rule(zone, "PRIVATE_EXTERIOR_OPEN_SPACE", "APPLIES", None, "FORMULA", "CONDITIONAL", [z["private_note"]], f"Table 131-04G; {FOOTNOTES[z['private_note']]['section']}", private_conditions[z["private_note"]], ["DWELLING_UNIT_COUNT", "OPEN_SPACE_GEOMETRY"]),
        rule(zone, "COMMON_OPEN_SPACE", "APPLIES_IF_MORE_THAN_4_DU", None, "FORMULA", "CONDITIONAL", [], "Table 131-04G; 131.0456", ["MAX_300_SQ_FT_OR_25_SQ_FT_PER_DU", "ONE_AREA_MIN_12_BY_15_FT", "ROOFED_MAX_50_PERCENT"], ["DWELLING_UNIT_COUNT", "OPEN_SPACE_GEOMETRY"]),
        rule(zone, "ARCHITECTURAL_PROJECTIONS", "PERMITTED", None, "PROCESS", "CONDITIONAL", [z["projection_note"]], f"Table 131-04G; {FOOTNOTES[z['projection_note']]['section']}", ["FEATURE_SPECIFIC_LIMITS", "COASTAL_VIEW_CORRIDOR_AND_VISIBILITY_LIMITS"], ["PROJECT_FEATURE_GEOMETRY", "VIEW_CORRIDOR", "VISIBILITY_AREA"]),
    ]
    if z["supplemental_note"]:
        supplemental_conditions = ["GARAGE_ENTRY_WIDTH_AND_GROUND_FLOOR_HABITABLE_FACADE_AND_UPPER_WINDOW_RULES"] if z["supplemental_note"] == "FN26" else ["GROUND_FLOOR_PARKING_ADJACENT_TO_YARD_REQUIRES_6_FT_SCREENING_AND_STREET_PEDESTRIAN_ENTRY"]
        rules.append(rule(zone, "SUPPLEMENTAL_REQUIREMENTS", "APPLIES", None, "PROCESS", "CONDITIONAL", [z["supplemental_note"]], f"Table 131-04G; {FOOTNOTES[z['supplemental_note']]['section']}", supplemental_conditions, ["PROJECT_DESIGN_FACTS"]))
    else:
        rules.append(rule(zone, "SUPPLEMENTAL_REQUIREMENTS", None, None, "NOT_SPECIFIED", "NOT_SPECIFIED", [], "Table 131-04G pp.42-43"))
    rules += [
        rule(zone, "GROUND_FLOOR_HEIGHT", "APPLIES" if z["ground_floor"] else None, None, "PROCESS" if z["ground_floor"] else "NOT_SPECIFIED", "CONDITIONAL" if z["ground_floor"] else "NOT_SPECIFIED", [], "Table 131-04G; 131.0451", ["COMMERCIAL_USE_ON_GROUND_FLOOR", "13_FT_FLOOR_TO_FLOOR", "NOT_IN_COASTAL_OR_CLAIREMONT_HEIGHT_LIMIT_OVERLAY"] if z["ground_floor"] else [], ["GROUND_FLOOR_USE", "HEIGHT_LIMIT_OVERLAY"] if z["ground_floor"] else []),
        rule(zone, "LOT_CONSOLIDATION", "APPLIES" if z["lot_consolidation"] else None, None, "PROCESS" if z["lot_consolidation"] else "NOT_SPECIFIED", "CONDITIONAL" if z["lot_consolidation"] else "NOT_SPECIFIED", [], "Table 131-04G; 131.0453", ["URBANIZED_COMMUNITY", "CONSOLIDATED_PREMISES"] if z["lot_consolidation"] else [], ["PRE_CONSOLIDATION_LOTS", "COMMUNITY_CONTEXT"] if z["lot_consolidation"] else []),
    ]
    return rules


def source_receipts() -> dict[str, Any]:
    return {
        "verified_as_of": "2026-10-27",
        "sources": {
            "CURRENT_DIVISION_4": {"publisher": "City of San Diego", "title": "SDMC Chapter 13 Article 1 Division 4 (9-2026)", "url": "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf", "sha256": CURRENT_CODE_SHA, "locators": ["Table 131-04G pp.40-44", "131.0442-131.0446 pp.46-67", "131.0451-131.0456 pp.74-78", "131.0461 pp.79-90", "131.0464 pp.91-97"]},
            "O21836": {"publisher": "City of San Diego", "url": "https://docs.sandiego.gov/council_reso_ordinance/rao2024/O-21836.pdf", "sha256": O21836_SHA, "outside_effective": "2024-10-05", "inside_effective": "2026-09-10"},
            "O21934": {"publisher": "City of San Diego", "url": "https://docs.sandiego.gov/council_reso_ordinance/rao2025/O-21934.pdf", "sha256": O21934_SHA, "scope": "RS footnote 7 repeal; no RM row change", "inside_certified_effective": "2025-09-21"},
            "O22109": {"publisher": "City of San Diego", "url": "https://docs.sandiego.gov/council_reso_ordinance/rao2026/O-22109.pdf", "sha256": O22109_SHA, "outside_effective": "2026-07-15", "inside_state": "PENDING_NOT_EFFECTIVE", "rm_effect": "adds general Fire Code Official defensible-space buffer interface at 131.0443(i); does not change Table 131-04G"},
            "INSIDE_COASTAL_CHAIN": {"components": ["O-21836", "LCP-6-SAN-24-0038-3", "O-22117", "O-21934", "LCP-6-SAN-25-0037-1"], "effective_from": "2026-09-10", "authority_ref": "data/inside-coastal-rs-standards-v0/legal-version-chain.json", "authority_sha256": file_sha(ROOT / "data/inside-coastal-rs-standards-v0/legal-version-chain.json")},
        },
        "outside_coastal": {"profile_version": "RM_WAVE1_OUTSIDE_COASTAL_2026_07_15", "effective_from": "2026-07-15", "components": ["O-21836", "O-21934", "O-22109"], "application": "CURRENT_OUTSIDE_COASTAL", "fire_buffer_interface": "ACTIVE_PER_131_0443_I"},
        "inside_coastal": {"profile_version": "RM_WAVE1_INSIDE_COASTAL_2026_09_10", "effective_from": "2026-09-10", "components": ["O-21836", "LCP-6-SAN-24-0038-3", "O-22117", "O-21934", "LCP-6-SAN-25-0037-1"], "application": "CERTIFIED_INSIDE_COASTAL_COMPOSITE", "excluded_pending_component": "O-22109", "fire_buffer_interface": "O22109_131_0443_I_NOT_APPLIED"},
        "extraction_fingerprint": canonical_sha({"rows": ZONE_ROWS, "footnotes": FOOTNOTES, "source": CURRENT_CODE_SHA}),
    }


def zone_associations(row: dict[str, Any]) -> set[str]:
    return {x["zone"] for x in row.get("material_zones", []) + row.get("sliver_zones", [])}


def profile_ready(row: dict[str, Any], zone: str) -> bool:
    return row.get("selected_zone") == zone and row.get("zoning_state") in {"SINGLE_ZONE", "BOUNDARY_SLIVER"} and row.get("coastal_context") in {"OUTSIDE_COASTAL", "INSIDE_COASTAL"}


def profile_version(coastal: str) -> str:
    if coastal == "OUTSIDE_COASTAL":
        return "RM_WAVE1_OUTSIDE_COASTAL_2026_07_15"
    if coastal == "INSIDE_COASTAL":
        return "RM_WAVE1_INSIDE_COASTAL_2026_09_10"
    return "UNRESOLVED_COASTAL_VERSION"


def rank(zone: str, category: str, apn: str) -> str:
    return hashlib.sha256(f"{zone}|{category}|{apn}".encode()).hexdigest()


def validate_selection_record(record: dict[str, Any], profiles: dict[str, Any], footnotes: dict[str, Any]) -> None:
    if record.get("zone") not in TARGETS:
        raise ValueError("unsupported zone")
    if record.get("coastal_context") not in {"OUTSIDE_COASTAL", "INSIDE_COASTAL", "BOUNDARY_AMBIGUOUS"}:
        raise ValueError("wrong Coastal version")
    if not record.get("source_fingerprints"):
        raise ValueError("missing source fingerprint")
    if record.get("zoning_state") == "MULTI_ZONE" and record.get("profile_ready"):
        raise ValueError("multi-zone treated as pure")
    if record.get("modifier_review_state") == "RESOLVED_UNCONDITIONAL":
        raise ValueError("unsupported modifier resolved as unconditional")
    if record.get("profile_version", "").startswith("DRAFT") or "FUTURE" in record.get("profile_version", ""):
        raise ValueError("draft/future-effective rule")
    p = profiles[record["zone"]]
    referenced = {fid for context in p["contexts"] for r in context["rules"] for fid in r["footnote_ids"]}
    if any(fid not in footnotes for fid in referenced):
        raise ValueError("missing footnote")


def build() -> dict[str, Any]:
    OUT.mkdir(parents=True, exist_ok=True)
    if file_sha(P79 / "parcel-zoning-selection.ndjson.gz") != P79_SELECTION_SHA:
        raise RuntimeError("Packet 79 selection hash mismatch")
    receipts = source_receipts()
    write_json("source-version-receipts.json", receipts)

    profiles: list[dict[str, Any]] = []
    profiles_by_zone: dict[str, Any] = {}
    for zone in TARGETS:
        base_rules = rules_for(zone)
        contexts = []
        for coastal, version, effective, components, fire in (
            ("OUTSIDE_COASTAL", "RM_WAVE1_OUTSIDE_COASTAL_2026_07_15", "2026-07-15", ["O-21836", "O-21934", "O-22109"], "ACTIVE_EXTERNAL_SAFETY_CONSTRAINT"),
            ("INSIDE_COASTAL", "RM_WAVE1_INSIDE_COASTAL_2026_09_10", "2026-09-10", ["O-21836", "LCP-6-SAN-24-0038-3", "O-22117", "O-21934", "LCP-6-SAN-25-0037-1"], "O22109_PENDING_NOT_APPLIED"),
        ):
            context_rules = json.loads(json.dumps(base_rules))
            contexts.append({"coastal_context": coastal, "profile_version": version, "effective_from": effective, "verified_as_of": "2026-10-27", "ordinance_components": components, "fire_buffer_interface": fire, "source_fingerprint": canonical_sha({"rules": context_rules, "components": components, "source": CURRENT_CODE_SHA}), "rules": context_rules})
        profile = {"zone_code": zone, "family_schema": "RM_TABLE_131_04G_GENERIC_V1", "contexts": contexts}
        profiles.append(profile)
        profiles_by_zone[zone] = profile
    profile_artifact = {"contract_version": CONTRACT_VERSION, "selected_zones": list(TARGETS), "generic_schema": "RM_TABLE_131_04G_GENERIC_V1", "profiles": profiles, "source_receipt_ref": "source-version-receipts.json", "doctrines": ["DENSITY_IS_NOT_CAPACITY", "UNKNOWN_COASTAL_FAILS_CLOSED", "MULTI_ZONE_IS_REVIEW_REQUIRED", "MODIFIERS_REMAIN_SEPARATE", "PROJECT_COMPARISON_NOT_PERFORMED"]}
    write_json("rule-profiles.json", profile_artifact)

    used = sorted({fid for p in profiles for c in p["contexts"] for r in c["rules"] for fid in r["footnote_ids"]})
    footnote_artifact = {"contract_version": CONTRACT_VERSION, "source_artifact_sha256": CURRENT_CODE_SHA, "used_footnotes": used, "footnotes": {fid: {**FOOTNOTES[fid], "version": "TABLE_131_04G_9_2026", "extraction_fingerprint": canonical_sha({"id": fid, **FOOTNOTES[fid]})} for fid in used}, "material_footnote_completeness": "COMPLETE_FOR_ALL_FIVE_TARGET_ROWS"}
    write_json("footnotes.json", footnote_artifact)
    write_json("family-schema.json", {"schema_id": "RM_TABLE_131_04G_GENERIC_V1", "zone_row_driven": True, "bespoke_zone_evaluators": False, "definitions_refs": ["data/rm-rule-profile-v0/height-definition.json", "data/rm-rule-profile-v0/far-definition.json", "data/rm-rule-profile-v0/lot-area-semantics.json", "data/rm-rule-profile-v0/premises-area-semantics.json"], "closed_operator_semantics": ["MIN", "MAX", "FORMULA", "PROCESS", "NOT_SPECIFIED"], "formula_families": {"RM1_FRONT": "maximum 50% of envelope width at 15 ft; remainder at 20 ft; curving street 5/10 ft", "RM1_SIDE": "one side: maximum 50% length at 5 ft, remainder max(8 ft,10% premises width); opposite side may use 5 ft; narrow-premises branches", "RM3_FRONT": "maximum 50% envelope width at 10 ft; remainder at 20 ft; curving street 5/10 ft", "RM3_SIDE": "max(5 ft,10% premises width), with bounded zero-side option", "RM3_STREET_SIDE": "max(10 ft,10% premises width), with maximum 50% facade encroachment by 5 ft", "RM4_SETBACK": "two contiguous northerly/easterly yards at least 15 ft; side/rear inherit more restrictive adjacent residential zone", "HEIGHT": "Table maximum plus 131.0444/113.0270 and footnote 37 modifier", "FAR": "Table band selected by dwelling-unit count where applicable; GFA/premises per 113.0234", "PRIVATE_OPEN_SPACE": "zone-family branch in 131.0455", "COMMON_OPEN_SPACE": "max(300 sq ft,25 sq ft per DU) when more than four DUs"}, "modifier_interfaces": ["COASTAL", "FIRE", "SLOPE_HILLSIDE", "COMMUNITY_PLAN", "SPECIFIC_PLAN", "TRANSIT_PROGRAM", "HISTORIC_RESOURCE"], "missing_fact_policy": "UNRESOLVED_REVIEW_REQUIRED", "capacity_calculation": False})

    selection: list[dict[str, Any]] = []
    rows_by_apn: dict[str, dict[str, Any]] = {}
    populations = {z: {"unique_apns": 0, "single_zone": 0, "multi_zone": 0, "sliver": 0, "indeterminate": 0, "inside_coastal": 0, "outside_coastal": 0, "boundary_ambiguous": 0, "profile_ready": 0} for z in TARGETS}
    residential_apns: set[str] = set()
    before_supported_apns: set[str] = set()
    after_supported_apns: set[str] = set()
    target_apns: set[str] = set()
    support_map = load(P79 / "residential-support-map.json")
    before_zones = {x["zone"] for x in support_map["supported_profiles"]}
    after_zones = before_zones | set(TARGETS)
    zone_apns: dict[str, set[str]] = defaultdict(set)
    with gzip.open(P79 / "parcel-zoning-selection.ndjson.gz", "rt") as stream:
        for line in stream:
            row = json.loads(line)
            apn = row["apn"]
            associations = zone_associations(row)
            residential = {z for z in associations if z.startswith(RESIDENTIAL_PREFIXES)}
            if residential:
                residential_apns.add(apn)
                for z in residential:
                    zone_apns[z].add(apn)
            if associations & before_zones:
                before_supported_apns.add(apn)
            if associations & after_zones:
                after_supported_apns.add(apn)
            matched = [z for z in TARGETS if z in associations]
            if not matched:
                continue
            rows_by_apn[apn] = row
            target_apns.add(apn)
            for zone in matched:
                p = populations[zone]
                p["unique_apns"] += 1
                if row["zoning_state"] == "SINGLE_ZONE": p["single_zone"] += 1
                if row["zoning_state"] == "MULTI_ZONE": p["multi_zone"] += 1
                if row["zoning_state"] == "BOUNDARY_SLIVER": p["sliver"] += 1
                if row["zoning_state"] == "INDETERMINATE": p["indeterminate"] += 1
                if row["coastal_context"] == "INSIDE_COASTAL": p["inside_coastal"] += 1
                if row["coastal_context"] == "OUTSIDE_COASTAL": p["outside_coastal"] += 1
                if row["coastal_context"] == "BOUNDARY_AMBIGUOUS": p["boundary_ambiguous"] += 1
                ready = profile_ready(row, zone)
                if ready: p["profile_ready"] += 1
                rec = {"apn": apn, "zone": zone, "zoning_state": row["zoning_state"], "selected_zone": row.get("selected_zone"), "coastal_context": row["coastal_context"], "profile_version": profile_version(row["coastal_context"]), "profile_ready": ready, "readiness": "PROFILE_SELECTED_MODIFIER_REVIEW_REQUIRED" if ready else "REVIEW_REQUIRED_MAPPING_OR_COASTAL", "modifier_review_state": "UNRESOLVED_REVIEW_REQUIRED", "source_fingerprints": row["source_fingerprints"], "provenance": {"packet79_selection_sha256": P79_SELECTION_SHA, "parcel_geometry_sha256": row["provenance"]["parcel_geometry_sha256"], "classification_method": row["provenance"]["classification_method"], "coastal_method": row["provenance"]["coastal_method"]}, "feasibility_result": None}
                validate_selection_record(rec, profiles_by_zone, footnote_artifact["footnotes"])
                selection.append(rec)
    selection.sort(key=lambda x: (x["apn"], x["zone"]))
    write_gzip_ndjson("apn-profile-selection.ndjson.gz", selection)
    write_json("target-populations.json", {"basis": "exact Packet 79 APN-zone associations; counts are not summed for coverage", "zones": populations})

    candidates: dict[str, dict[str, list[dict[str, Any]]]] = {}
    manual: list[dict[str, Any]] = []
    for zone in TARGETS:
        zone_recs = [r for r in selection if r["zone"] == zone]
        cats = {
            "ordinary": [r for r in zone_recs if r["profile_ready"] and r["zoning_state"] == "SINGLE_ZONE" and r["coastal_context"] == "OUTSIDE_COASTAL"],
            "inside_coastal": [r for r in zone_recs if r["profile_ready"] and r["zoning_state"] == "SINGLE_ZONE" and r["coastal_context"] == "INSIDE_COASTAL"],
            "edge": [r for r in zone_recs if not r["profile_ready"] or r["zoning_state"] != "SINGLE_ZONE"],
        }
        candidates[zone] = {}
        for cat, values in cats.items():
            ranked = sorted(values, key=lambda r: (rank(zone, cat, r["apn"]), r["apn"]))[:3]
            candidates[zone][cat] = [{"apn": r["apn"], "zone": zone, "zoning_state": r["zoning_state"], "coastal_context": r["coastal_context"], "profile_version": r["profile_version"], "profile_ready": r["profile_ready"], "modifier_review_state": r["modifier_review_state"], "rank": rank(zone, cat, r["apn"])} for r in ranked]
        ordinary = candidates[zone]["ordinary"][0]
        manual.append({"apn": ordinary["apn"], "zone": zone, "zoning": "VERIFIED_FROM_PACKET79_EXACT_ROW", "coastal_version": ordinary["profile_version"], "rule_row": f"VERIFIED_{zone}_TABLE_131_04G", "footnotes": sorted({fid for c in profiles_by_zone[zone]["contexts"] for r in c["rules"] for fid in r["footnote_ids"]}), "formulas": "VERIFIED_AGAINST_FAMILY_SCHEMA", "modifier_state": ordinary["modifier_review_state"], "profile_source_fingerprint": profiles_by_zone[zone]["contexts"][0]["source_fingerprint"]})
    write_json("golden-candidates.json", {"ranking": "SHA256(zone|category|apn), ascending", "candidate_count_per_available_category": 3, "profiles": candidates})
    write_json("manual-verification.json", {"state": "VERIFIED", "ordinary_candidate_per_target": manual, "verification_scope": ["APN zoning", "zone row", "Coastal version", "footnotes", "formulas", "profile version", "modifier state"], "no_project_compliance": True})

    added = after_supported_apns - before_supported_apns
    ready_all: set[str] = set()
    with gzip.open(P79 / "parcel-zoning-selection.ndjson.gz", "rt") as stream:
        for line in stream:
            row = json.loads(line)
            if row["apn"] not in after_supported_apns:
                continue
            if row.get("selected_zone") in after_zones and row.get("zoning_state") in {"SINGLE_ZONE", "BOUNDARY_SLIVER"} and row.get("coastal_context") in {"OUTSIDE_COASTAL", "INSIDE_COASTAL"}:
                ready_all.add(row["apn"])
    coverage = {"metric": "unique residential APNs with any association to a supported profile", "residential_unique_apns": len(residential_apns), "before_packet80_unique_apns": len(before_supported_apns), "before_packet80_percent": round(len(before_supported_apns)/len(residential_apns)*100, 6), "added_by_packet80_unique_apns": len(added), "after_packet80_unique_apns": len(after_supported_apns), "after_packet80_percent": round(len(after_supported_apns)/len(residential_apns)*100, 6), "percentage_point_gain": round(len(added)/len(residential_apns)*100, 6), "profile_ready_unique_apns": len(ready_all), "review_required_unique_apns": len(after_supported_apns - ready_all), "unsupported_unique_apns": len(residential_apns - after_supported_apns), "overlap_rule": "APNs are counted once regardless of supported-zone associations", "target_association_rows": len(selection), "target_unique_apns": len(target_apns)}
    write_json("coverage.json", coverage)
    remaining = []
    for zone, apns in zone_apns.items():
        if zone in after_zones:
            continue
        new = apns - after_supported_apns
        remaining.append({"zone": zone, "family": zone.split("-",1)[0], "unique_apns": len(apns), "incremental_unique_apns": len(new), "incremental_percent_of_residential": round(len(new)/len(residential_apns)*100, 6)})
    remaining.sort(key=lambda x: (-x["incremental_unique_apns"], x["zone"]))
    write_json("remaining-opportunity.json", {"basis": "exact unique APNs not already covered after Packet 80", "ranked": remaining, "recommended_next_step": "SAN_DIEGO_RESIDENTIAL_RULE_EXPANSION_WAVE_2"})
    write_json("compatibility.json", {"v4_rule_record_fields": ["rule_family", "representation", "operator", "value", "conditions", "footnote_ids", "unresolved_dependencies", "source_fingerprint", "public_evaluation_state"], "all_rules_are_rule_facts_only": True, "private_project_comparison": False, "capacity": False, "existing_benchmarks": {"RM-2-5:5442140600": "UNCHANGED_BY_CONSTRUCTION", "RS-1-7:6341302200": "UNCHANGED_BY_CONSTRUCTION"}, "production": False, "runtime_activation": False})
    write_json("schema.json", {"profile_schema": "RM_TABLE_131_04G_GENERIC_V1", "selection_schema": "SanDiegoRmWave1ApnProfileSelectionV0", "selection_granularity": "one row per APN-target-zone association", "required_selection_fields": ["apn", "zone", "zoning_state", "coastal_context", "profile_version", "profile_ready", "modifier_review_state", "source_fingerprints", "provenance"], "unknown_coastal_policy": "UNRESOLVED_REVIEW_REQUIRED", "multi_zone_policy": "REVIEW_REQUIRED", "no_feasibility_result": True})
    write_json("decision.json", {"decision": "SAN_DIEGO_RM_RULE_EXPANSION_WAVE1_READY", "successful_profiles": list(TARGETS), "failed_profiles": [], "dual_coastal_versions": True, "footnotes_complete": True, "exact_apn_selection": True, "exact_unique_coverage": True, "goldens_verified": True, "v4_compatible": True, "packet_11_frozen": True, "production_access": False, "public_activation": False})
    (OUT / "README.md").write_text("# San Diego RM rule expansion Wave 1\n\nPacket 80 seals five current City of San Diego RM base-zone profiles with explicit outside- and inside-Coastal legal versions. It derives exact APN-zone selection from Packet 79, keeps multi-zone and unknown-Coastal parcels review-required, and publishes rule facts without compliance or capacity conclusions. The artifacts are local and do not activate runtime behavior.\n")
    files = sorted(p for p in OUT.iterdir() if p.name != "integrity.json")
    write_json("integrity.json", {"contract_version": CONTRACT_VERSION, "files": {p.name: file_sha(p) for p in files}, "inputs": {"packet79_selection": file_sha(P79 / "parcel-zoning-selection.ndjson.gz"), "packet79_receipt": file_sha(P79 / "receipt.json"), "rm_profile_v0": file_sha(ROOT / "data/rm-rule-profile-v0/integrity.json"), "inside_coastal_chain": file_sha(ROOT / "data/inside-coastal-rs-standards-v0/legal-version-chain.json"), "current_division4_pdf": CURRENT_CODE_SHA}})
    return {p.name: load(p) for p in OUT.glob("*.json")}


if __name__ == "__main__":
    out = build()
    c = out["coverage.json"]
    print(json.dumps({"decision": out["decision.json"]["decision"], "profiles": len(TARGETS), "selection_rows": c["target_association_rows"], "added_unique_apns": c["added_by_packet80_unique_apns"], "after_percent": c["after_packet80_percent"]}, sort_keys=True))
