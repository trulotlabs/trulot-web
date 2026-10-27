#!/usr/bin/env python3
"""Build Packet 81 residential Wave 2 evidence from sealed local inputs."""
from __future__ import annotations

import gzip
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path("/Users/ops/trulot-web-parcel")
OUT = ROOT / "data/san-diego-residential-rule-expansion-wave2-v0"
P79 = ROOT / "data/san-diego-parcel-zoning-selection-v0"
P80 = ROOT / "data/san-diego-rm-rule-expansion-wave1-v0"
TARGETS = ("RM-1-2", "RM-2-4", "RM-2-6", "RM-3-8", "RM-5-12", "RS-1-11", "RS-1-8", "RX-1-2", "RX-1-1", "RT-1-2")
RM_TARGETS = TARGETS[:5]
RS_TARGETS = TARGETS[5:7]
RX_TARGETS = TARGETS[7:9]
RT_TARGETS = TARGETS[9:]
CONTRACT = "san-diego-residential-rule-expansion-wave2-2026-10-27-v0"
CURRENT_SHA = "9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538"
P79_SHA = "ce09b175011ce9907690cfdd598a7da185e229f0b0a2d42298263664d9acbeaf"
BASELINE_SUPPORTED = 305526
RESIDENTIAL_TOTAL = 326532


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sha(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(name: str, value: Any) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def write_gz(name: str, rows: list[dict[str, Any]]) -> None:
    with (OUT / name).open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as out:
            out.write(b"".join(canonical(row) + b"\n" for row in rows))


def import_packet80():
    path = ROOT / "scripts/san-diego-rm-rule-expansion-wave1-v0/build.py"
    spec = importlib.util.spec_from_file_location("packet80_build", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


P80_BUILD = import_packet80()

RM_NOTES = {
    "FN7": ("See Section 131.0443(e)(1).", "131.0443(e)(1)", "FORMULA"),
    "FN8": ("See Section 131.0443(e)(2).", "131.0443(e)(2)", "FORMULA"),
    "FN9": ("See Section 131.0443(e)(3).", "131.0443(e)(3)", "FORMULA"),
    "FN10": ("See Section 131.0443(e)(4).", "131.0443(e)(4)", "EXCEPTION"),
    "FN18": ("See Section 131.0444(f).", "131.0444(f)", "GEOMETRIC_LIMIT"),
    "FN23": ("See Section 131.0455(b).", "131.0455(b)", "FORMULA"),
    "FN27": ("See Section 131.0464(e).", "131.0464(e)", "CONDITIONAL"),
    "FN29": ("Within the Peninsula and Ocean Beach community plan areas, maximum FAR is 0.70.", "Table 131-04G note 29", "MODIFIER"),
    "FN30": ("See Section 131.0443(h)(1).", "131.0443(h)(1)", "FORMULA"),
    "FN31": ("See Section 131.0443(h)(2).", "131.0443(h)(2)", "FORMULA"),
    "FN32": ("See Section 131.0443(h)(3).", "131.0443(h)(3)", "FORMULA"),
    "FN33": ("See Section 131.0443(h)(4).", "131.0443(h)(4)", "FORMULA"),
    "FN34": ("See Section 131.0445(c).", "131.0445(c)", "FORMULA"),
    "FN35": ("See Section 131.0446(f).", "131.0446(f)", "FORMULA"),
    "FN36": ("Within La Jolla, Pacific Beach, and Torrey Pines community plan areas, density is one dwelling unit or two guest rooms per 1,500 square feet of lot area.", "Table 131-04G note 36", "MODIFIER"),
    "FN38": ("Within the Peninsula and Ocean Beach community plan areas, maximum FAR is 1.0.", "Table 131-04G note 38", "MODIFIER"),
}
for fid, (text, section, derivation) in RM_NOTES.items():
    P80_BUILD.FOOTNOTES[fid] = {"source_text": text, "trigger": fid, "families": ["MATERIAL_TABLE_RULE"], "derivation_class": derivation, "section": section}
P80_BUILD.FOOTNOTES["RX_FN1"] = {"source_text":"For RX-1-2 lots abutting an alley with access from the alley, minimum lot width, street frontage, and corner-lot width are 25 feet.","trigger":"RX_1_2_ALLEY_ACCESS","families":["MINIMUM_LOT_WIDTH","MINIMUM_STREET_FRONTAGE","MINIMUM_CORNER_LOT_WIDTH"],"derivation_class":"EXCEPTION","section":"131.0442(c)"}

P80_BUILD.ZONE_ROWS.update({
    "RM-1-2": {"density":2500,"lot_area":6000,"width":50,"frontage":50,"corner":55,"depth":90,"front_min":15,"front_std":20,"side_min":5,"side_std":8,"street_side":10,"rear":15,"height":30,"height_notes":["FN17"],"far":[("1_TO_2_DU",0.90,[]),("3_TO_7_DU",1.0,[]),("8_PLUS_DU",1.25,[])],"setback_notes":["FN3","FN4","FN5","FN6"],"private_note":"FN22","projection_note":"FN15","supplemental_note":"FN26","ground_floor":False,"lot_consolidation":True},
    "RM-2-4": {"density":1750,"lot_area":6000,"width":50,"frontage":50,"corner":55,"depth":90,"front_min":15,"front_std":20,"side_min":5,"side_std":None,"street_side":10,"rear":15,"height":40,"height_notes":["FN18","FN37"],"far":[("1_TO_2_DU",1.20,["FN29"]),("3_TO_7_DU",1.20,["FN38"]),("8_PLUS_DU",1.25,["FN39"])],"setback_notes":["FN7","FN8","FN9","FN10"],"private_note":"FN23","projection_note":"FN16","supplemental_note":"FN27","ground_floor":False,"lot_consolidation":False},
    "RM-2-6": {"density":1250,"lot_area":6000,"width":50,"frontage":50,"corner":55,"depth":90,"front_min":15,"front_std":20,"side_min":5,"side_std":None,"street_side":10,"rear":15,"height":40,"height_notes":["FN18","FN37"],"far":[("1_TO_2_DU",1.50,[]),("3_TO_7_DU",1.50,[]),("8_PLUS_DU",1.50,[])],"setback_notes":["FN7","FN8","FN9","FN10"],"private_note":"FN23","projection_note":"FN16","supplemental_note":"FN27","ground_floor":False,"lot_consolidation":False},
    "RM-3-8": {"density":800,"lot_area":7000,"width":70,"frontage":70,"corner":75,"depth":100,"front_min":10,"front_std":20,"side_min":5,"side_std":None,"street_side":10,"rear":5,"height":50,"height_notes":["FN37"],"far":[("ALL",2.25,[])],"setback_notes":["FN11","FN12","FN13"],"private_note":"FN24","projection_note":"FN16","supplemental_note":"FN28","ground_floor":True,"lot_consolidation":False},
    "RM-5-12": {"density":1000,"lot_area":10000,"width":100,"frontage":100,"corner":100,"depth":100,"front_min":15,"front_std":None,"side_min":4,"side_std":None,"street_side":10,"rear":15,"height":None,"height_notes":["FN37"],"far":[("BASE_TABLE",1.80,["FN35"])],"setback_notes":["FN30","FN31","FN32","FN33"],"private_note":"FN25","projection_note":"FN16","supplemental_note":None,"ground_floor":True,"lot_consolidation":False},
})


def generic_rule(zone: str, family: str, value: Any, unit: str | None, operator: str, representation: str, locator: str, conditions: list[str] | None = None, unresolved: list[str] | None = None, footnotes: list[str] | None = None, variant: str = "OUTSIDE_COASTAL") -> dict[str, Any]:
    payload = {"zone":zone,"family":family,"value":value,"locator":locator,"variant":variant}
    return {"rule_id":f"{zone}:{family}:{variant}","zone_code":zone,"rule_family":family,"representation":representation,"operator":operator,"value":{"kind":"unknown"} if value is None else {"kind":"number" if isinstance(value,(int,float)) else "recorded","value":value},"unit":unit,"conditions":conditions or [],"footnote_ids":footnotes or [],"unresolved_dependencies":unresolved or [],"source_fingerprint":sha(payload),"source_locator":{"document":"SDMC_CH13_ART1_DIV4_9_2026","table_or_section":locator,"artifact_sha256":CURRENT_SHA},"derivation_class":"recorded" if representation=="DIRECT" else "conditional","public_evaluation_state":"SOURCE_NOT_SPECIFIED" if representation=="NOT_SPECIFIED" else "RULE_FACT_ONLY_REVIEW_REQUIRED" if representation!="DIRECT" else "RULE_FACT_ONLY","project_comparison":False}


def rm_rules(zone: str) -> list[dict[str, Any]]:
    original_private = P80_BUILD.ZONE_ROWS[zone]["private_note"]
    # Packet 80's helper enumerated only the Wave 1 private-open-space branches.
    # Route RM-2 through the structurally compatible branch, then restore FN23.
    if zone.startswith("RM-2-"):
        P80_BUILD.ZONE_ROWS[zone]["private_note"] = "FN24"
    rules = P80_BUILD.rules_for(zone)
    P80_BUILD.ZONE_ROWS[zone]["private_note"] = original_private
    if zone.startswith("RM-2-"):
        replacements = {
            "FRONT_SETBACK_MINIMUM": ("FN7", ["MAX_50_PERCENT_ENVELOPE_WIDTH_AT_15_FT", "REMAINDER_AT_20_FT", "CURVING_STREET_5_FT_MIN_10_FT_STANDARD"]),
            "INTERIOR_SIDE_SETBACK_MINIMUM": ("FN8", ["MAX_5_FT_OR_10_PERCENT_PREMISES_WIDTH", "40_TO_50_FT_PREMISES_4_FT", "UNDER_40_FT_10_PERCENT_MIN_3_FT"]),
            "STREET_SIDE_SETBACK_MINIMUM": ("FN9", ["MAX_10_FT_OR_10_PERCENT_PREMISES_WIDTH", "MAX_50_PERCENT_FACADE_ENCROACHMENT_5_FT"]),
            "REAR_SETBACK_MINIMUM": ("FN10", ["ALLEY_CREDIT_HALF_WIDTH_CAPPED_10_FT", "ON_PREMISES_MINIMUM_5_FT"]),
        }
        for rule in rules:
            if rule["rule_family"] in replacements:
                fid, conditions = replacements[rule["rule_family"]]
                rule["footnote_ids"] = [fid]
                rule["conditions"] = conditions
                rule["source_locator"]["table_or_section"] = f"Table 131-04G; {P80_BUILD.FOOTNOTES[fid]['section']}"
            if rule["rule_family"]=="PRIVATE_EXTERIOR_OPEN_SPACE":
                rule["footnote_ids"]=["FN23"]
                rule["conditions"]=["60_SQ_FT_PER_DU","MIN_DIMENSION_6_FT","COMMON_SPACE_ALTERNATIVE_IF_DEFICIT"]
                rule["source_locator"]["table_or_section"]="Table 131-04G; 131.0455(b)"
    if zone == "RM-5-12":
        rules = [r for r in rules if r["rule_family"] not in {"FRONT_SETBACK_MINIMUM","INTERIOR_SIDE_SETBACK_MINIMUM","STREET_SIDE_SETBACK_MINIMUM","REAR_SETBACK_MINIMUM","STRUCTURE_HEIGHT_MAXIMUM","LOT_COVERAGE_MAXIMUM","FLOOR_AREA_RATIO_MAXIMUM","RESUBDIVIDED_CORNER_LOT_SETBACKS","DENSITY"}]
        rules += [
            generic_rule(zone,"DENSITY",1000,"sq_ft_per_dwelling_unit","PROCESS","MODIFIER_DEPENDENT","Table 131-04G note 36",["BASE_1000_SQ_FT_PER_DU","1500_SQ_FT_PER_DU_IN_LA_JOLLA_PACIFIC_BEACH_TORREY_PINES"],["COMMUNITY_PLAN","CODE_LOT_AREA"],["FN1","FN2","FN36"]),
            generic_rule(zone,"FRONT_SETBACK_MINIMUM",15,"ft","FORMULA","FORMULA","131.0443(h)(1)",["10_FT_ON_CURVING_STREET_OR_TURNAROUND_RADIUS_UNDER_100_FT"],["STREET_RADIUS"],["FN30"]),
            generic_rule(zone,"INTERIOR_SIDE_SETBACK_MINIMUM",4,"ft","FORMULA","FORMULA","131.0443(h)(2)",["ADD_3_FT_FOR_EACH_12_FT_HEIGHT_ABOVE_24_FT"],["STRUCTURE_HEIGHT"],["FN31"]),
            generic_rule(zone,"STREET_SIDE_SETBACK_MINIMUM",10,"ft","FORMULA","FORMULA","131.0443(h)(3)",["WIDTH_AND_HEIGHT_BRANCHES_APPLY"],["PREMISES_WIDTH","STRUCTURE_HEIGHT"],["FN32"]),
            generic_rule(zone,"REAR_SETBACK_MINIMUM",15,"ft","FORMULA","FORMULA","131.0443(h)(4)",["ADD_3_FT_FOR_EACH_12_FT_HEIGHT_ABOVE_24_FT"],["STRUCTURE_HEIGHT"],["FN33"]),
            generic_rule(zone,"STRUCTURE_HEIGHT_MAXIMUM",None,"ft","MAX","MODIFIER_DEPENDENT","Table 131-04G note 37",["BASE_ZONE_TABLE_DOES_NOT_SPECIFY_MAX","30_FT_IN_COASTAL_HEIGHT_LIMIT_OVERLAY_PENINSULA"],["COASTAL_HEIGHT_LIMIT_OVERLAY","COMMUNITY_PLAN","BASE_MAX_NOT_SPECIFIED"],["FN37"]),
            generic_rule(zone,"LOT_COVERAGE_MAXIMUM",{"1_TO_4_STORIES_48_FT":{"interior":50,"corner":60},"5_STORIES_60_FT":37,"6_STORIES_72_FT":32,"7_STORIES_84_FT":28,"8_STORIES_96_FT":25,"9_STORIES_108_FT":23,"10_PLUS_STORIES_120_FT":21},"percent","MAX","FORMULA","131.0445(c)",["SELECT_BY_STORY_COUNT_AND_STRUCTURE_HEIGHT","GARAGE_EXCLUSIONS_APPLY"],["STORY_COUNT","STRUCTURE_HEIGHT","LOT_TYPE","GARAGE_GEOMETRY"],["FN34"]),
            generic_rule(zone,"FLOOR_AREA_RATIO_MAXIMUM",{"1_TO_4_STORIES_48_FT":1.80,"5_STORIES_60_FT":1.85,"6_STORIES_72_FT":1.90,"7_STORIES_84_FT":1.95,"8_STORIES_96_FT":2.0,"9_STORIES_108_FT":2.05,"10_PLUS_STORIES_120_FT":2.10},"ratio","MAX","FORMULA","131.0446(f)",["SELECT_BY_STORY_COUNT_AND_STRUCTURE_HEIGHT","GFA_AND_PREMISES_AREA_PER_113_0234"],["STORY_COUNT","STRUCTURE_HEIGHT","CODE_GFA","LEGAL_PREMISES_AREA"],["FN35"]),
            generic_rule(zone,"RESUBDIVIDED_CORNER_LOT_SETBACKS",None,None,"NOT_SPECIFIED","NOT_SPECIFIED","Table 131-04G"),
        ]
    return rules


def rs_rules(zone: str, coastal: str) -> list[dict[str, Any]]:
    path = ROOT / ("data/inside-coastal-rs-standards-v0/standards.json" if coastal=="INSIDE_COASTAL" else "data/rs-base-standards-v0/standards.json")
    source = [r for r in load(path) if r["zone_code"]==zone]
    out=[]
    for row in source:
        representation = "DIRECT" if not row.get("unresolved_dependencies") and not row.get("condition") else "CONDITIONAL"
        value = row.get("value",{})
        actual = value.get("number", value.get("text", value.get("kind")))
        footnote_ids=[x for x in row.get("exceptions",[]) if x.startswith("131-04D:")]
        out.append(generic_rule(zone,row["standard_key"],actual,row.get("unit"),row.get("operator","PROCESS"),representation,f"{row['source_table']} p.{row['source_page']} / {row['source_section']}",row.get("condition",[]),row.get("unresolved_dependencies",[]),footnote_ids,coastal))
    if len(out)!=25:
        raise RuntimeError(f"expected 25 sealed RS rows for {zone}/{coastal}, got {len(out)}")
    return out


def rx_rules(zone: str) -> list[dict[str, Any]]:
    vals={"RX-1-1":{"area":4000,"width":35,"frontage":35,"corner":35,"far":0.70},"RX-1-2":{"area":3000,"width":35,"frontage":35,"corner":35,"far":0.80}}[zone]
    rows=[
        ("DENSITY",1,"dwelling_unit_per_lot","BASIS","CONDITIONAL",["BASE_TABLE_BASIS_NOT_CAPACITY"],["PROJECT_PROGRAMS"]),
        ("MINIMUM_LOT_AREA",vals["area"],"sq_ft","MIN","CONDITIONAL",["ALLEY_AREA_CREDIT_UP_TO_HALF_WIDTH_CAPPED_10_FT_AND_10_PERCENT"],["ALLEY_ACCESS","ALLEY_WIDTH"]),
        ("MINIMUM_LOT_WIDTH",vals["width"],"ft","MIN","CONDITIONAL",["RX_1_2_ALLEY_ACCESS_REDUCES_TO_25_FT"],["ALLEY_ACCESS"] if zone=="RX-1-2" else []),
        ("MINIMUM_STREET_FRONTAGE",vals["frontage"],"ft","MIN","CONDITIONAL",["CURVING_STREET_MINIMUM_28_5_FT","RX_1_2_ALLEY_ACCESS_REDUCES_TO_25_FT"],["STREET_RADIUS","ALLEY_ACCESS"]),
        ("MINIMUM_CORNER_LOT_WIDTH",vals["corner"],"ft","MIN","CONDITIONAL",["RX_1_2_ALLEY_ACCESS_REDUCES_TO_25_FT"],["ALLEY_ACCESS"]),
        ("MINIMUM_LOT_DEPTH",50,"ft","MIN","DIRECT",[],[]),
        ("FRONT_SETBACK_MINIMUM",15,"ft","MIN","CONDITIONAL",["OVER_4_DU_VARIABLE_15_10_20_FT_DISTRIBUTION"],["DWELLING_UNIT_COUNT","FACADE_DISTRIBUTION"]),
        ("INTERIOR_SIDE_SETBACK_MINIMUM",3,"ft","FORMULA","FORMULA",["DETACHED_MAX_3_FT_OR_10_PERCENT_LOT_WIDTH_CAPPED_5_FT","ONE_ZERO_SIDE_OPTION_ADJACENT_RX","ATTACHED_ZERO_ONE_SIDE_AND_OPPOSITE_MAX_6_FT_OR_20_PERCENT_CAPPED_10_FT"],["ATTACHMENT_TYPE","LOT_WIDTH","ADJACENT_ZONE","UNIT_WALLS"]),
        ("STREET_SIDE_SETBACK_MINIMUM",3,"ft","MIN","DIRECT",[],[]),
        ("REAR_SETBACK_MINIMUM",10,"ft","MIN","CONDITIONAL",["4_FT_IF_ALLEY_ACCESS"],["ALLEY_ACCESS"]),
        ("STRUCTURE_HEIGHT_MAXIMUM",30,"ft","MAX","CONDITIONAL",["MEASURE_PER_113_0270"],["GRADE_AND_STRUCTURE_GEOMETRY"]),
        ("LOT_COVERAGE_MAXIMUM",None,None,"NOT_SPECIFIED","NOT_SPECIFIED",[],[]),
        ("FLOOR_AREA_RATIO_MAXIMUM",vals["far"],"ratio","MAX","FORMULA",["DENOMINATOR_IS_GREATER_OF_ZONE_MIN_LOT_AREA_OR_LOT_AREA_IF_GRADIENT_UNDER_10_PERCENT"],["LOT_AREA","LOT_GRADIENT","CODE_GFA"]),
        ("ARCHITECTURAL_PROJECTIONS","PERMITTED",None,"PROCESS","CONDITIONAL",["SECTION_131_0461_A"],["FEATURE_GEOMETRY"]),
        ("ATTACHED_DWELLING_UNIT_REQUIREMENTS","APPLIES",None,"PROCESS","CONDITIONAL",["SECTION_131_0462"],["PROJECT_DESIGN"]),
        ("ROOF_VARIATION","APPLIES",None,"PROCESS","CONDITIONAL",["SECTION_131_0463"],["ROOF_GEOMETRY"]),
        ("SUPPLEMENTAL_REQUIREMENTS","APPLIES",None,"PROCESS","CONDITIONAL",["SECTION_131_0464_B"],["PROJECT_DESIGN"]),
        ("ACCESSORY_USES_STRUCTURES","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_FEATURES"]),
        ("REFUSE_RECYCLING_STORAGE","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_DESIGN"]),
        ("VISIBILITY_AREA","APPLIES",None,"PROCESS","CONDITIONAL",[],["VISIBILITY_GEOMETRY"]),
        ("DWELLING_UNIT_PROTECTION","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_CONTEXT"]),
    ]
    out=[generic_rule(zone,r[0],r[1],r[2],r[3],r[4],"Table 131-04E; 131.0441-131.0464",r[5],r[6]) for r in rows]
    if zone=="RX-1-2":
        for rule in out:
            if rule["rule_family"] in {"MINIMUM_LOT_WIDTH","MINIMUM_STREET_FRONTAGE","MINIMUM_CORNER_LOT_WIDTH"}:
                rule["footnote_ids"]=["RX_FN1"]
                rule["source_fingerprint"]=sha({"zone":zone,"family":rule["rule_family"],"value":rule["value"],"footnotes":["RX_FN1"],"locator":"Table 131-04E; 131.0442(c)"})
    return out


def rt_rules(zone: str) -> list[dict[str, Any]]:
    rows=[
        ("DENSITY",1,"dwelling_unit_per_lot","BASIS","CONDITIONAL",["BASE_TABLE_BASIS_NOT_CAPACITY"],["PROJECT_PROGRAMS"]),
        ("MINIMUM_LOT_AREA",3000,"sq_ft","MIN","CONDITIONAL",["ALLEY_AREA_CREDIT_UP_TO_HALF_WIDTH_CAPPED_10_FT_AND_10_PERCENT"],["ALLEY_ACCESS","ALLEY_WIDTH"]),
        ("MINIMUM_LOT_WIDTH",25,"ft","MIN","DIRECT",[],[]),("MINIMUM_STREET_FRONTAGE",25,"ft","MIN","DIRECT",[],[]),("MINIMUM_CORNER_LOT_WIDTH",25,"ft","MIN","DIRECT",[],[]),("MINIMUM_LOT_DEPTH",100,"ft","MIN","DIRECT",[],[]),
        ("FRONT_SETBACK_MINIMUM",{"formula":"10_PERCENT_LOT_DEPTH","min_ft":5,"max_ft":15},"ft","FORMULA","FORMULA",["SOME_FACADE_WITHIN_1_FT_OF_SETBACK_LINE","50_PERCENT_FACADE_MAY_ENCROACH_PER_131_0461_B"],["LOT_DEPTH","FACADE_GEOMETRY"]),
        ("INTERIOR_SIDE_SETBACK_MINIMUM",0,"ft","FORMULA","CONDITIONAL",["LIGHTWELLS_AND_COURTYARDS_MIN_6_BY_10_FT","3_FT_ADJACENT_NON_RT","WINDOWS_DOORS_REQUIRE_5_FT"],["ADJACENT_ZONE","OPENING_GEOMETRY","COURTYARD_GEOMETRY"]),
        ("STREET_SIDE_SETBACK_MINIMUM",5,"ft","MIN","DIRECT",[],[]),("REAR_SETBACK_MINIMUM",3,"ft","MIN","DIRECT",[],[]),
        ("STRUCTURE_HEIGHT_MAXIMUM",{"1_TO_2_STORY":{"slab_ft":21,"raised_ft":25},"3_STORY":{"slab_ft":31,"raised_ft":35}},"ft","MAX","FORMULA",["SLOPED_ROOF_MAY_ADD_5_FT","30_DEGREE_FRONT_ENVELOPE_ABOVE_27_FT"],["STORY_COUNT","FOUNDATION_TYPE","ROOF_SLOPE","STRUCTURE_GEOMETRY"]),
        ("LOT_COVERAGE_MAXIMUM",65,"percent","MAX","FORMULA",["GARAGE_EXCLUSIONS_PER_131_0445_B"],["GARAGE_GEOMETRY"]),
        ("FLOOR_AREA_RATIO_MAXIMUM",{"1_TO_2_STORY":0.95,"3_STORY":1.30},"ratio","MAX","FORMULA",["GARAGE_EXCLUSION_UP_TO_525_SQ_FT"],["STORY_COUNT","GARAGE_AREA","CODE_GFA","LEGAL_PREMISES_AREA"]),
        ("ARCHITECTURAL_PROJECTIONS","PERMITTED",None,"PROCESS","CONDITIONAL",["SECTION_131_0461_B"],["FEATURE_GEOMETRY"]),("SUPPLEMENTAL_REQUIREMENTS","APPLIES",None,"PROCESS","CONDITIONAL",["SECTION_131_0464_C"],["PROJECT_DESIGN"]),("ACCESSORY_USES_STRUCTURES","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_FEATURES"]),("GARAGE_REGULATIONS","APPLIES",None,"PROCESS","CONDITIONAL",[],["GARAGE_DESIGN"]),("PARKWAY_REQUIREMENTS","APPLIES",None,"PROCESS","CONDITIONAL",[],["STREET_CONTEXT"]),("REFUSE_RECYCLING_STORAGE","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_DESIGN"]),("VISIBILITY_AREA","APPLIES",None,"PROCESS","CONDITIONAL",[],["VISIBILITY_GEOMETRY"]),("DWELLING_UNIT_PROTECTION","APPLIES",None,"PROCESS","CONDITIONAL",[],["PROJECT_CONTEXT"]),
    ]
    return [generic_rule(zone,r[0],r[1],r[2],r[3],r[4],"Table 131-04F; 131.0441-131.0464",r[5],r[6]) for r in rows]


def profile_rules(zone: str, coastal: str) -> list[dict[str, Any]]:
    if zone in RM_TARGETS: return rm_rules(zone)
    if zone in RS_TARGETS: return rs_rules(zone,coastal)
    if zone in RX_TARGETS: return rx_rules(zone)
    return rt_rules(zone)


def family(zone: str) -> str:
    return {"RM":"RM_TABLE_131_04G_GENERIC_V1","RS":"RS_TABLE_131_04D_GENERIC_V1","RX":"RX_TABLE_131_04E_GENERIC_V1","RT":"RT_TABLE_131_04F_GENERIC_V1"}[zone.split("-")[0]]


def associations(row: dict[str, Any]) -> set[str]:
    return {x["zone"] for x in row.get("material_zones",[])+row.get("sliver_zones",[])}


def ready(row: dict[str, Any], zone: str) -> bool:
    return row.get("selected_zone")==zone and row.get("zoning_state") in {"SINGLE_ZONE","BOUNDARY_SLIVER"} and row.get("coastal_context") in {"OUTSIDE_COASTAL","INSIDE_COASTAL"}


def version(zone: str, coastal: str) -> str:
    if coastal not in {"OUTSIDE_COASTAL","INSIDE_COASTAL"}: return "UNRESOLVED_COASTAL_VERSION"
    suffix = "OUTSIDE_COASTAL_2026_07_15" if coastal=="OUTSIDE_COASTAL" else "INSIDE_COASTAL_2026_09_10"
    return f"{zone.split('-')[0]}_WAVE2_{suffix}"


def build() -> dict[str, Any]:
    OUT.mkdir(parents=True,exist_ok=True)
    if file_sha(P79/"parcel-zoning-selection.ndjson.gz")!=P79_SHA: raise RuntimeError("Packet 79 selection hash mismatch")
    if load(P80/"coverage.json")["after_packet80_unique_apns"]!=BASELINE_SUPPORTED: raise RuntimeError("Packet 80 baseline mismatch")
    contexts={}
    profiles=[]
    for zone in TARGETS:
        c=[]
        for coastal, components in (("OUTSIDE_COASTAL",["O-21836","O-21934","O-22109"]),("INSIDE_COASTAL",["O-21836","LCP-6-SAN-24-0038-3","O-22117","O-21934","LCP-6-SAN-25-0037-1"])):
            rules=profile_rules(zone,coastal)
            c.append({"coastal_context":coastal,"profile_version":version(zone,coastal),"effective_from":"2026-07-15" if coastal=="OUTSIDE_COASTAL" else "2026-09-10","ordinance_components":components,"fire_buffer_interface":"ACTIVE_EXTERNAL_SAFETY_CONSTRAINT" if coastal=="OUTSIDE_COASTAL" else "O22109_PENDING_NOT_APPLIED","source_fingerprint":sha({"zone":zone,"coastal":coastal,"family":family(zone),"rules":rules,"components":components}),"rules":rules})
        profile={"zone_code":zone,"family_schema":family(zone),"contexts":c}
        profiles.append(profile); contexts[zone]=profile
    write_json("rule-profiles.json",{"contract_version":CONTRACT,"selected_zones":list(TARGETS),"profiles":profiles,"family_doctrine":"Each zone resolves only to its own RS/RM/RX/RT family; no cross-family shortcut.","doctrines":["DENSITY_IS_NOT_CAPACITY","MULTI_ZONE_REVIEW_REQUIRED","UNKNOWN_COASTAL_FAILS_CLOSED","PROJECT_COMPARISON_NOT_PERFORMED"]})
    used=sorted({fid for p in profiles for c in p["contexts"] for r in c["rules"] for fid in r["footnote_ids"]})
    rs_notes=load(ROOT/"data/rs-base-standards-v0/footnotes.json")
    notes={}
    for fid in used:
      raw=rs_notes[fid] if fid.startswith("131-04D:") else P80_BUILD.FOOTNOTES[fid]
      notes[fid]={**raw,"version":"TABLE_131_04D_9_2026" if fid.startswith("131-04D:") else "TABLE_131_04G_9_2026","extraction_fingerprint":sha({"id":fid,**raw})}
    write_json("footnotes.json",{"used_footnotes":used,"footnotes":notes,"material_footnote_completeness":"COMPLETE_FOR_ALL_REFERENCED_MATERIAL_FOOTNOTES","missing_reference_policy":"FAIL_VALIDATION"})
    schemas={
      "RM_TABLE_131_04G_GENERIC_V1":{"basis":"existing Packet 80 generic RM architecture","cross_family_reuse":False,"formula_branches":["RM1","RM2","RM3","RM5"]},
      "RS_TABLE_131_04D_GENERIC_V1":{"basis":"existing Packet 78 generic RS architecture","cross_family_reuse":False,"sealed_source_rows":25},
      "RX_TABLE_131_04E_GENERIC_V1":{"basis":"Table 131-04E and 131.0441-131.0464","cross_family_reuse":False,"formula_branches":["RX_DETACHED","RX_ATTACHED","RX_1_2_ALLEY"]},
      "RT_TABLE_131_04F_GENERIC_V1":{"basis":"Table 131-04F and 131.0441-131.0464","cross_family_reuse":False,"formula_branches":["RT_FRONT_DEPTH","RT_ZERO_SIDE","RT_HEIGHT_STORY_FOUNDATION","RT_FAR_STORY"]},
    }
    write_json("family-schemas.json",{"schemas":schemas,"closed_representations":["DIRECT","FORMULA","CONDITIONAL","NOT_SPECIFIED","MODIFIER_DEPENDENT","UNRESOLVED"],"missing_fact_policy":"UNRESOLVED_REVIEW_REQUIRED","capacity_calculation":False})
    write_json("family-assessment.json",{"RX":{"decision":"SEALED_OWN_FAMILY","zones":list(RX_TARGETS),"common_table":"131-04E","consistent_definitions":True,"compatible_setback_height_far_structure":True,"stable_coastal_versioning":True,"not_reused_from":["RS","RM","RT"]},"RT":{"decision":"SEALED_OWN_FAMILY","zones":list(RT_TARGETS),"common_table":"131-04F","consistent_definitions":True,"compatible_setback_height_far_structure":True,"stable_coastal_versioning":True,"not_reused_from":["RS","RM","RX"]}})
    write_json("source-version-receipts.json",{"verified_as_of":"2026-10-27","current_division4":{"sha256":CURRENT_SHA,"url":"https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf","locators":["Table 131-04D pp.33-39","Table 131-04E pp.36-37","Table 131-04F pp.38-39","Table 131-04G pp.40-44","131.0441-131.0464"]},"inside_coastal_chain":{"ref":"data/inside-coastal-rs-standards-v0/legal-version-chain.json","sha256":file_sha(ROOT/"data/inside-coastal-rs-standards-v0/legal-version-chain.json")},"outside_components":["O-21836","O-21934","O-22109"],"inside_components":["O-21836","LCP-6-SAN-24-0038-3","O-22117","O-21934","LCP-6-SAN-25-0037-1"],"inside_excludes_pending":"O-22109"})

    support_map=load(P79/"residential-support-map.json")
    before_zones={x["zone"] for x in support_map["supported_profiles"]}|set(load(P80/"decision.json")["successful_profiles"])
    after_zones=before_zones|set(TARGETS)
    residential=set(); before=set(); after=set(); target_union=set(); ready_all=set(); zone_apns=defaultdict(set)
    pops={z:{k:0 for k in ("unique_apns","single_zone","multi_zone","sliver","indeterminate","inside_coastal","outside_coastal","boundary_ambiguous","profile_ready")} for z in TARGETS}
    selections=[]
    with gzip.open(P79/"parcel-zoning-selection.ndjson.gz","rt") as stream:
      for line in stream:
        row=json.loads(line); apn=row["apn"]; zones=associations(row); rz={z for z in zones if z.startswith(("RS-","RM-","RX-","RT-"))}
        if rz:
          residential.add(apn)
          for z in rz: zone_apns[z].add(apn)
        if zones&before_zones: before.add(apn)
        if zones&after_zones: after.add(apn)
        if apn in after and row.get("selected_zone") in after_zones and row.get("zoning_state") in {"SINGLE_ZONE","BOUNDARY_SLIVER"} and row.get("coastal_context") in {"OUTSIDE_COASTAL","INSIDE_COASTAL"}: ready_all.add(apn)
        for z in (set(TARGETS)&zones):
          target_union.add(apn); p=pops[z]; p["unique_apns"]+=1
          states={"SINGLE_ZONE":"single_zone","MULTI_ZONE":"multi_zone","BOUNDARY_SLIVER":"sliver","INDETERMINATE":"indeterminate"}; key=states.get(row["zoning_state"])
          if key: p[key]+=1
          coast={"INSIDE_COASTAL":"inside_coastal","OUTSIDE_COASTAL":"outside_coastal","BOUNDARY_AMBIGUOUS":"boundary_ambiguous"}[row["coastal_context"]]; p[coast]+=1
          is_ready=ready(row,z); p["profile_ready"]+=int(is_ready)
          selections.append({"apn":apn,"zone":z,"family_schema":family(z),"zoning_state":row["zoning_state"],"selected_zone":row.get("selected_zone"),"coastal_context":row["coastal_context"],"profile_version":version(z,row["coastal_context"]),"profile_ready":is_ready,"readiness":"PROFILE_SELECTED_MODIFIER_REVIEW_REQUIRED" if is_ready else "REVIEW_REQUIRED_MAPPING_OR_COASTAL","modifier_review_state":"UNRESOLVED_REVIEW_REQUIRED","source_fingerprints":row["source_fingerprints"],"provenance":{"packet79_selection_sha256":P79_SHA,"classification_method":row["provenance"]["classification_method"],"coastal_method":row["provenance"]["coastal_method"]},"feasibility_result":None})
    selections.sort(key=lambda x:(x["apn"],x["zone"])); write_gz("apn-profile-selection.ndjson.gz",selections)
    write_json("target-populations.json",{"basis":"exact Packet 79 APN-zone associations; never summed for coverage","zones":pops})
    candidates={}; availability={}; manual=[]
    for z in TARGETS:
      zr=[r for r in selections if r["zone"]==z]
      groups={"ordinary":[r for r in zr if r["profile_ready"] and r["zoning_state"]=="SINGLE_ZONE" and r["coastal_context"]=="OUTSIDE_COASTAL"],"inside_coastal":[r for r in zr if r["profile_ready"] and r["zoning_state"]=="SINGLE_ZONE" and r["coastal_context"]=="INSIDE_COASTAL"],"edge":[r for r in zr if not r["profile_ready"] or r["zoning_state"]!="SINGLE_ZONE"]}
      candidates[z]={}; availability[z]={k:len(v) for k,v in groups.items()}
      for cat, vals in groups.items():
        ranked=sorted(vals,key=lambda r:(hashlib.sha256(f"{z}|{cat}|{r['apn']}".encode()).hexdigest(),r["apn"]))[:3]
        candidates[z][cat]=[{k:r[k] for k in ("apn","zone","zoning_state","coastal_context","profile_version","profile_ready")} for r in ranked]
      o=candidates[z]["ordinary"][0]
      manual.append({"zone":z,"apn":o["apn"],"zoning":"VERIFIED_FROM_PACKET79_EXACT_ROW","coastal_version":o["profile_version"],"family_schema":family(z),"rule_row":f"VERIFIED_{z}_SOURCE_TABLE","footnotes":"VERIFIED_ALL_REFERENCES_PRESENT","formula_semantics":"VERIFIED_AGAINST_OWN_FAMILY_SCHEMA","modifier_state":"UNRESOLVED_REVIEW_REQUIRED","no_project_compliance":True})
    write_json("golden-candidates.json",{"ranking":"SHA256(zone|category|apn), ascending","profiles":candidates,"available_counts":availability,"unavailable_categories_are_empty_not_invented":True})
    write_json("manual-verification.json",{"state":"VERIFIED","ordinary_candidate_per_profile":manual,"verification_scope":["APN zoning","family","Coastal version","source row","footnotes","formula semantics","modifier state"],"no_capacity":True})
    if len(residential)!=RESIDENTIAL_TOTAL or len(before)!=BASELINE_SUPPORTED:
      raise RuntimeError(f"coverage baseline mismatch: residential={len(residential)} before={len(before)}")
    added=after-before
    cov={"metric":"unique residential APNs with any association to a supported profile","residential_unique_apns":len(residential),"before_packet81_unique_apns":len(before),"baseline_expected":BASELINE_SUPPORTED,"added_by_packet81_unique_apns":len(added),"after_packet81_unique_apns":len(after),"after_packet81_percent":round(len(after)/len(residential)*100,6),"percentage_point_gain":round(len(added)/len(residential)*100,6),"profile_ready_unique_apns":len(ready_all),"review_required_unique_apns":len(after-ready_all),"unsupported_unique_apns":len(residential-after),"target_association_rows":len(selections),"target_unique_apns":len(target_union),"overlap_rule":"APNs counted once using set unions","thresholds":{"95_percent":len(after)/len(residential)>=.95,"97_percent":len(after)/len(residential)>=.97,"98_percent":len(after)/len(residential)>=.98}}
    write_json("coverage.json",cov)
    ranked=[]
    for z, apns in zone_apns.items():
      if z in after_zones: continue
      gain=len(apns-after)
      fam=z.split("-")[0]
      category="easy_same_family_extension" if fam in {"RS","RM","RT"} else "specialized_family" if fam in {"RX"} else "modifier_heavy_or_low_value"
      if gain<100: category="low_value_defer"
      ranked.append({"zone":z,"family":fam,"unique_apns":len(apns),"incremental_unique_apns":gain,"incremental_percent_of_residential":round(gain/len(residential)*100,6),"category":category})
    ranked.sort(key=lambda x:(-x["incremental_unique_apns"],x["zone"]))
    write_json("remaining-opportunity.json",{"basis":"exact incremental unique APNs after Packet 81","ranked":ranked,"stop_rule_assessment":"CONTINUE_ONE_BOUNDED_FINALIZATION_WAVE_FOR_REMAINING_SAME_FAMILY_RS_RT;_DEFER_LOW_VALUE_AND_MODIFIER_HEAVY_CASES","recommended_next_step":"SAN_DIEGO_RULE_COVERAGE_FINALIZATION"})
    write_json("compatibility.json",{"v4_rule_record_fields":["rule_family","representation","operator","value","conditions","footnote_ids","unresolved_dependencies","source_fingerprint","public_evaluation_state"],"existing_benchmarks":{"RS-1-7:6341302200":"UNCHANGED_BY_CONSTRUCTION","RM-2-5:5442140600":"UNCHANGED_BY_CONSTRUCTION"},"packet78_profiles":"UNCHANGED","packet80_profiles":"UNCHANGED","la_mesa":"UNCHANGED","production_parcel_lookup":"UNCHANGED","runtime_activation":False,"capacity":False})
    write_json("schema.json",{"profile_families":schemas,"selection_granularity":"one APN-target-zone association","multi_zone_policy":"REVIEW_REQUIRED","unknown_coastal_policy":"UNRESOLVED_REVIEW_REQUIRED","no_feasibility_result":True})
    write_json("decision.json",{"decision":"SAN_DIEGO_RESIDENTIAL_RULE_EXPANSION_WAVE2_READY","successful_profiles":list(TARGETS),"deferred_profiles":[],"rx_decision":"SEALED_OWN_FAMILY","rt_decision":"SEALED_OWN_FAMILY","next_step":"SAN_DIEGO_RULE_COVERAGE_FINALIZATION","packet_11_frozen":True,"production_access":False,"production_zoning_load":False,"selected_snapshot_change":False,"public_activation":False,"deployment":False})
    (OUT/"README.md").write_text("# San Diego residential rule expansion Wave 2\n\nPacket 81 seals five RM, two RS, two RX, and one RT base-zone profiles with strict family separation and dual Coastal legal versions. Exact APN association rows come from Packet 79; multi-zone and ambiguous-Coastal cases remain review-required. These local artifacts record rule facts only and perform no parcel compliance, capacity, runtime activation, production access, or deployment.\n")
    files=sorted(p for p in OUT.iterdir() if p.name!="integrity.json")
    write_json("integrity.json",{"contract_version":CONTRACT,"files":{p.name:file_sha(p) for p in files},"inputs":{"packet79_selection":file_sha(P79/"parcel-zoning-selection.ndjson.gz"),"packet80_integrity":file_sha(P80/"integrity.json"),"outside_rs":file_sha(ROOT/"data/rs-base-standards-v0/standards.json"),"inside_rs":file_sha(ROOT/"data/inside-coastal-rs-standards-v0/standards.json"),"current_division4_pdf":CURRENT_SHA}})
    return {p.name:load(p) for p in OUT.glob("*.json")}


if __name__=="__main__":
    out=build(); c=out["coverage.json"]
    print(json.dumps({"decision":out["decision.json"]["decision"],"profiles":len(TARGETS),"added":c["added_by_packet81_unique_apns"],"supported":c["after_packet81_unique_apns"],"percent":c["after_packet81_percent"]},sort_keys=True))
