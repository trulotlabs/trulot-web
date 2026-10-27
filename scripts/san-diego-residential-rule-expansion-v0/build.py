#!/usr/bin/env python3
"""Build Packet 78's bounded, local San Diego residential profile expansion."""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/san-diego-residential-rule-expansion-v0"
SELECTED = ("RS-1-14", "RS-1-4", "RS-1-13", "RS-1-1", "RS-1-2", "RS-1-6")
EXISTING = ("RS-1-7", "RM-2-5")
RESIDENTIAL_PREFIXES = ("RS-", "RM-", "RT-", "RX-")
MATERIAL_KEYS = {
    "density_basis", "lot_area_min", "lot_width_min", "street_frontage_min",
    "corner_lot_width_min", "lot_depth_min", "front_setback_min",
    "interior_side_setback_min", "street_side_setback_min", "rear_setback_min",
    "structure_height_max", "floor_area_ratio_max", "lot_coverage_max",
}


def load(name: str):
    return json.loads((ROOT / name).read_text())


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def write_json(name: str, value) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def family(zone: str) -> str:
    return zone.split("-", 1)[0]


def representation(row: dict) -> str:
    if row["fact_state"] == "UNKNOWN":
        return "UNRESOLVED"
    if row["value"]["kind"] == "unknown":
        return "NOT_SPECIFIED"
    if row["operator"] in {"FORMULA"}:
        return "FORMULA"
    if row["condition"] or row["exceptions"] or row["fact_state"] == "CONDITIONAL":
        return "CONDITIONAL"
    if row["operator"] in {"REFERENCE", "BASIS"}:
        return "CONDITIONAL"
    return "DIRECT"


def tier(zone: str, count: int) -> str:
    if zone in SELECTED or zone in EXISTING:
        return "TIER_1_HIGH_COVERAGE_LOW_COMPLEXITY"
    if family(zone) in {"RS", "RM"} and count >= 3000:
        return "TIER_2_HIGH_VALUE_MODERATE_COMPLEXITY"
    if family(zone) in {"RT", "RX"} or count >= 1000:
        return "TIER_3_SPECIALIZED_OR_MODIFIER_HEAVY"
    return "DEFER"


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    zone_report = load("data/zoning-serving-v2/report.json")
    zone_inventory = load("data/zoning-standards-v2/zone-inventory.json")
    outside_rows = load("data/rs-base-standards-v0/standards.json")
    inside_rows = load("data/inside-coastal-rs-standards-v0/standards.json")
    outside_versions = load("data/rs-base-standards-v0/versions.json")
    inside_versions = load("data/inside-coastal-rs-standards-v0/versions.json")
    outside_footnotes = load("data/rs-base-standards-v0/footnotes.json")
    inside_footnotes = load("data/inside-coastal-rs-standards-v0/footnotes.json")
    counts = zone_report["zoneParcelCounts"]
    residential = sorted(zone_inventory["observed_residential_codes"])

    inventory = []
    for zone in residential:
        count = counts[zone]
        fam = family(zone)
        inventory.append({
            "zone_code": zone,
            "family": fam,
            "mapped_zone_association_count": count,
            "single_zone_count": None,
            "multi_zone_association_count": None,
            "coastal_noncoastal_split": None,
            "modifier_state": "PARCEL_LEVEL_MODIFIERS_NOT_RETAINED_IN_AGGREGATE_REPORT",
            "current_profile_support": "EXISTING_BENCHMARK" if zone in EXISTING else "PACKET_78_SELECTED" if zone in SELECTED else "UNSUPPORTED",
            "tier": tier(zone, count),
            "selection_metrics_state": "UNAVAILABLE_WITHOUT_SEALED_ROW_ARTIFACT",
        })
    inventory.sort(key=lambda x: (-x["mapped_zone_association_count"], x["zone_code"]))
    write_json("residential-zone-inventory.json", {
        "basis": "sealed zoning association counts; one parcel may associate with multiple zones",
        "residential_zone_count": len(inventory),
        "zones": inventory,
    })

    rankings = [{"rank": i + 1, **row} for i, row in enumerate(inventory)]
    write_json("coverage-ranking.json", {"ranking": rankings, "criteria": ["parcel association count", "family reuse", "source clarity", "modifier complexity", "feasibility value"]})

    profiles = []
    for zone in SELECTED:
        contexts = []
        for context, rows, versions in (("OUTSIDE_COASTAL", outside_rows, outside_versions), ("INSIDE_COASTAL", inside_rows, inside_versions)):
            selected_rows = [r for r in rows if r["zone_code"] == zone]
            rule_records = []
            for row in selected_rows:
                rule_records.append({
                    "zone_code": zone,
                    "family_schema": "RS_TABLE_131_04D_GENERIC_V1",
                    "coastal_context": context,
                    "rule_id": row["rule_id"],
                    "rule_family": row["standard_key"],
                    "representation": representation(row),
                    "operator": row["operator"],
                    "value": row["value"],
                    "unit": row["unit"],
                    "conditions": row["condition"],
                    "footnote_ids": row["exceptions"],
                    "unresolved_dependencies": row["unresolved_dependencies"],
                    "source_fingerprint": row["provenance_sha256"],
                    "source_locator": {"document": row["source_document"], "table": row["source_table"], "page": row["source_page"], "cell": row["source_evidence"]},
                    "public_evaluation_state": "RULE_FACT_ONLY_REVIEW_REQUIRED" if representation(row) in {"CONDITIONAL", "UNRESOLVED", "MODIFIER_DEPENDENT"} else "RULE_FACT_ONLY",
                })
            profile_id = f"{zone.lower()}-{context.lower().replace('_','-')}-2026-09-30-v0"
            contexts.append({
                "profile_id": profile_id,
                "coastal_context": context,
                "rule_set_version": versions["rule_set_version"],
                "effective_date": "2026-07-15" if context == "OUTSIDE_COASTAL" else "2026-09-10",
                "verified_as_of": versions["verified_as_of"],
                "ordinance_components": versions["profiles"][0]["components"],
                "source_fingerprint": canonical_sha(selected_rows),
                "rules": rule_records,
            })
        profiles.append({"zone_code": zone, "family_schema": "RS_TABLE_131_04D_GENERIC_V1", "contexts": contexts})
    write_json("rule-profiles.json", {
        "contract_version": "san-diego-residential-rule-expansion-2026-10-27-v0",
        "selected_zones": list(SELECTED),
        "family_schemas": {"RS_TABLE_131_04D_GENERIC_V1": {"zone_row_driven": True, "bespoke_evaluator_per_zone": False}},
        "profiles": profiles,
        "doctrines": ["UNKNOWN_IS_NOT_FALSE", "DENSITY_IS_NOT_CAPACITY", "MAPPED_CONTEXT_IS_NOT_COMPLIANCE", "COASTAL_VERSION_MUST_BE_EXPLICIT", "MODIFIERS_FAIL_CLOSED"],
    })

    used_footnotes = sorted({fid for p in profiles for c in p["contexts"] for r in c["rules"] for fid in r["footnote_ids"]})
    write_json("footnotes.json", {
        "used_footnotes": used_footnotes,
        "outside_coastal": {k: outside_footnotes[k] for k in used_footnotes},
        "inside_coastal": {k: inside_footnotes[k] for k in used_footnotes},
        "material_footnote_completeness": "COMPLETE_FOR_SELECTED_DIMENSIONAL_RULES",
        "known_nonmaterial_source_gap": {"131-04D:8": outside_footnotes["131-04D:8"]},
    })
    write_json("family-schema.json", {
        "schema_id": "RS_TABLE_131_04D_GENERIC_V1",
        "definitions_ref": "data/rs-rule-profile-v0/definitions.json",
        "formula_source_refs": ["data/rs-rule-profile-v0/setbacks.json", "data/rs-rule-profile-v0/height.json", "data/rs-rule-profile-v0/far.json", "data/rs-rule-profile-v0/lot-coverage.json"],
        "parameterization": "Every formula receives the selected zone row's table value; benchmark values are never embedded as universal constants.",
        "formulas": {
            "front_cul_de_sac": {"representation": "FORMULA", "expression": "max(5, table_front_setback_ft - 5)", "required_facts": ["FRONTS_CUL_DE_SAC", "REDUCTION_ELECTED"]},
            "front_slope": {"representation": "CONDITIONAL", "result_ft": 6, "required_facts": ["AT_LEAST_HALF_FRONT_50_FT_DEPTH_HAS_MIN_SLOPE_25_PERCENT", "SETBACK_IS_CLOSEST_TO_STREET", "REDUCTION_ELECTED"]},
            "interior_side_narrow_lot": {"representation": "FORMULA", "expression": "0.08 * code_lot_width_ft", "required_facts": ["LOT_WIDTH_LT_ZONE_MIN"]},
            "rear_shallow": {"representation": "FORMULA", "expression": "max(5, 0.10 * code_lot_depth_ft)", "required_facts": ["LOT_DEPTH_LT_100"]},
            "rear_deep": {"representation": "FORMULA", "expression": "max(table_rear_setback_ft, 0.10 * code_lot_depth_ft)", "required_facts": ["LOT_DEPTH_GT_150"]},
            "height_envelope": {"representation": "CONDITIONAL", "selector": "code_lot_width_ft", "branches": ["45_DEGREES_IF_LT_75", "30_DEGREES_IF_75_TO_150", "NOT_APPLICABLE_IF_GT_150"]},
            "far": {"representation": "CONDITIONAL", "ordinary": "table_or_section_131_0446_band", "hillside": "max(non_steep_hillside_area, minimum_zone_lot_area) + 0.25 * remaining_lot_area"},
            "lot_coverage": {"representation": "CONDITIONAL", "hillside_max_percent": 50, "otherwise": "NOT_SPECIFIED", "unknown": "UNRESOLVED"},
        },
        "modifier_interfaces": ["FIRE_OFFICIAL_BUFFER", "STEEP_HILLSIDE", "COASTAL", "COMMUNITY_PLAN_OR_SPECIFIC_PLAN", "PROGRAM_GEOGRAPHY"],
        "missing_fact_policy": "UNRESOLVED_REVIEW_REQUIRED",
    })

    residential_total = sum(counts[z] for z in residential)
    before = sum(counts[z] for z in EXISTING)
    gain = sum(counts[z] for z in SELECTED)
    write_json("coverage.json", {
        "metric_basis": "zone associations, not unique parcels; exact parcel selection requires the absent sealed row artifact",
        "residential_zone_associations": residential_total,
        "before_supported_associations": before,
        "packet_78_additional_supported_associations": gain,
        "after_supported_associations": before + gain,
        "before_supported_percent": round(before / residential_total * 100, 6),
        "after_supported_percent": round((before + gain) / residential_total * 100, 6),
        "percentage_point_increase": round(gain / residential_total * 100, 6),
        "supported_single_zone_residential_population": None,
        "conditional_review_required_population": None,
        "unsupported_residential_population": None,
        "reason_exact_populations_unavailable": "parcel-base-zoning-map.ndjson.gz and parcel-intelligence-serving-v2.ndjson.gz are not present locally; aggregate counts cannot reconstruct APNs, zoning state, Coastal state, or modifiers",
    })

    coastal_path = Path("/Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z/parcel-coastal-mapping.ndjson")
    golden = {
        "2748323700": {"zone": "RS-1-14", "source": "data/base-zoning-v2/golden-fixture.json"},
        "5810934600": {"zone": "RS-1-1", "source": "data/base-zoning-v2/golden-fixture.json"},
        "3013428200": {"zone": "RS-1-4", "source": "data/inside-coastal-rs-standards-v0/fixtures.json"},
    }
    if coastal_path.exists():
        with coastal_path.open() as stream:
            for line in stream:
                row = json.loads(line)
                apn = str(row.get("apn"))
                if apn in golden:
                    golden[apn]["coastal_state"] = row.get("coastal_context_state") or row.get("state")
                    golden[apn]["coastal_source"] = "coastal-context-v0/coastal-city-sd-20260930T143055Z/parcel-coastal-mapping.ndjson"
    selection = []
    for apn, item in sorted(golden.items()):
        selection.append({"apn": apn, "zone": item["zone"], "family": "RS", "profile_version": "2026-09-30-v0", "coastal_version": item.get("coastal_state", "UNKNOWN_REVIEW_REQUIRED"), "modifier_state": "UNRESOLVED", "readiness": "SUPPORTED_PROFILE_REVIEW_REQUIRED", "unresolved_families": ["PARCEL_MODIFIERS"], "provenance_refs": [item["source"], item.get("coastal_source")]})
    payload = "".join(json.dumps(x, sort_keys=True, separators=(",", ":")) + "\n" for x in selection)
    with (OUT / "profile-selection-sample.ndjson.gz").open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            zipped.write(payload.encode())
    write_json("golden-verification.json", {
        "samples": selection,
        "manual_verification": [
            {"apn": "2748323700", "zone": "RS-1-14", "zoning": "VERIFIED_SEALED_FIXTURE", "rule_row": "VERIFIED_BOTH_COASTAL_CONTEXTS", "modifiers": "REVIEW_REQUIRED"},
            {"apn": "5810934600", "zone": "RS-1-1", "zoning": "VERIFIED_SEALED_FIXTURE", "rule_row": "VERIFIED_BOTH_COASTAL_CONTEXTS", "modifiers": "REVIEW_REQUIRED"},
            {"apn": "3013428200", "zone": "RS-1-4", "zoning": "VERIFIED_SEALED_FIXTURE", "rule_row": "VERIFIED_INSIDE_COASTAL", "modifiers": "REVIEW_REQUIRED"},
        ],
        "unrepresented_selected_zones": sorted(set(SELECTED) - {x["zone"] for x in selection}),
        "state": "BOUNDED_SAMPLE_ONLY",
    })

    write_json("compatibility.json", {
        "definitions": "REUSED_FROM_RS_RULE_PROFILE_V0",
        "generic_family_schema": True,
        "v4_rule_record_fields": ["rule_family", "representation", "operator", "value", "conditions", "footnote_ids", "unresolved_dependencies", "public_evaluation_state"],
        "existing_benchmark_replay": {"6341302200": "UNCHANGED_BY_CONSTRUCTION", "5442140600": "UNCHANGED_BY_CONSTRUCTION"},
        "property_intelligence_dependency": False,
        "production": False,
        "ui": False,
        "capacity": False,
    })
    next_zones = [r for r in rankings if r["zone_code"] not in set(EXISTING + SELECTED)]
    write_json("next-zone-opportunity.json", {"ranked": next_zones[:12], "recommendation": "RM_FAMILY_WAVE_AFTER_ROW_LEVEL_SELECTION_ARTIFACT_RECOVERY"})
    write_json("decision.json", {
        "decision": "SAN_DIEGO_RESIDENTIAL_RULE_EXPANSION_PARTIAL",
        "reason": "Six additional RS dual-version profiles are sealed, but the missing sealed parcel-level zoning output prevents the required citywide APN selection artifact, per-zone single/multi and Coastal splits, exact unique-parcel coverage, and 2-3 goldens per zone.",
        "selected_additional_zones": list(SELECTED),
        "useful_sealed_work": True,
        "packet_11_frozen": True,
        "production_access": False,
        "public_activation": False,
    })
    (OUT / "README.md").write_text(
        "# San Diego residential rule expansion v0\n\n"
        "Packet 78 seals six additional RS profiles from the already-sealed outside- and inside-Coastal Table 131-04D sources. "
        "It uses one generic family schema plus zone rows and preserves conditional, modifier, version, and evidence boundaries. "
        "The result is intentionally PARTIAL because the repository no longer contains the sealed 393,733-row parcel zoning output needed to create a citywide APN selection artifact or unique-parcel coverage metrics. "
        "No production system, UI, Parcel Lookup route, or capacity calculation is involved.\n"
    )
    files = sorted(p for p in OUT.iterdir() if p.name != "integrity.json")
    write_json("integrity.json", {"files": {p.name: sha(p) for p in files}, "source_inputs": {
        "outside_standards": sha(ROOT / "data/rs-base-standards-v0/standards.json"),
        "inside_standards": sha(ROOT / "data/inside-coastal-rs-standards-v0/standards.json"),
        "zoning_report": sha(ROOT / "data/zoning-serving-v2/report.json"),
    }})
    return {p.name: json.loads(p.read_text()) for p in OUT.glob("*.json")}


if __name__ == "__main__":
    result = build()
    print(json.dumps({"decision": result["decision.json"]["decision"], "selected": len(SELECTED), "gain": result["coverage.json"]["packet_78_additional_supported_associations"]}, sort_keys=True))
