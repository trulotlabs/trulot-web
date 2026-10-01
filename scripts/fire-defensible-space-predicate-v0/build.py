#!/usr/bin/env python3
"""Build Packet 35 Fire predicate evidence and bridge artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION,
    EXPECTED_APN,
    FIRE_BUFFER_STATES,
    FORBIDDEN_CONCLUSIONS,
    PROJECT_EVIDENCE_TYPES,
    bridge_setback,
    evaluate_fire_buffer,
)

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import integrity_artifact, provenance_graph  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "fire-defensible-space-predicate-v0"


def _json(path: str) -> Any:
    return json.loads((ROOT / path).read_text())


def source_registry() -> dict[str, dict[str, Any]]:
    standards_sources = _json("data/rs-base-standards-v0/sources.json")["sources"]
    excerpts = _json("data/rs-base-standards-v0/source-excerpts.json")
    return {
        "sdmc_131_0443_i": {
            "state": "AVAILABLE", "authority_rank": 1,
            "title": standards_sources["residential_division_4"]["title"], "section": "131.0443(i)",
            "effective_date": "2026-07-15", "edition": "9-2026",
            "url": standards_sources["residential_division_4"]["url"],
            "sha256": standards_sources["residential_division_4"]["sha256"],
            "section_text_sha256": excerpts["131.0443"]["text_sha256"],
        },
        "o22109": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "Ordinance O-22109", "section": "Adds §131.0443(i)",
            "effective_date": "2026-07-15 outside Coastal", "url": standards_sources["o22109"]["url"], "sha256": standards_sources["o22109"]["sha256"],
        },
        "sd_fire_code_adoption": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "Ordinance O-22043 / San Diego Fire Code", "section": "SDMC §511.0001; 2025 California Fire Code adoption",
            "effective_date": "2026-02-28", "url": "https://docs.sandiego.gov/council_reso_ordinance/rao2026/O-22043.pdf", "sha256": "182446d7a423cbd678d9b8e70d5839e30471235dd2c6d25a8b073b79722876db",
        },
        "sd_wui_code": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "San Diego Wildland-Urban Interface Code", "section": "SDMC §§512.0202, 512.0302, 512.0603, 512.0604",
            "effective_date": "2026-02-28", "url": "https://docs.sandiego.gov/municode/MuniCodeChapter05/Ch05Art12Division06.pdf", "sha256": "7bb624fe38039077d1088e3479b4561928e42992cf964787fdb5b27e4ab24d21",
            "adopting_ordinance_url": "https://docs.sandiego.gov/council_reso_ordinance/rao2026/O-22042.pdf", "adopting_ordinance_sha256": "ba369e3c8dfe81c1eb35e77acd1ae4afa62f5c98b3b8f9a69e98b8fb4d6793c2",
        },
        "california_fire_code": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "2025 California Fire Code, Title 24, Part 9, January 2026 errata", "section": "§§102.9, 104.1, 104.3",
            "effective_date": "2026-01-01", "url": "https://codes.iccsafe.org/content/CAFC2025P2/chapter-1-administration", "acquired_html_sha256": "075ea026a23d212b219ed5ff26781efe96701ac7e7a67a9ba6f6457d0ac39381",
        },
        "city_defensible_space_guidance": {
            "state": "AVAILABLE", "authority_rank": 2, "title": "Guide to Defensible Space: Property Owners", "section": "Zones 0, 1, and 2",
            "effective_date": None, "accessed_at": "2026-10-01", "url": "https://www.sandiego.gov/fire/community-risk-reduction/defensible-space-property-owners", "acquired_html_sha256": "16d95767c3c7c8a481be77251ce7ae3b27846a6831cebdf9d33c5331b5952aef",
        },
        "city_zone0_standard": {
            "state": "AVAILABLE", "authority_rank": 2, "title": "SDFD Standard D-2: Zone 0 Requirements for New Structures", "section": "Scope and requirements",
            "effective_date": "2026-02-28", "url": "https://www.sandiego.gov/sites/default/files/2026-04/d-2_zone_0_new_structures.pdf", "sha256": "4a2e6c0194867014f7771c924e06706dabd03252e4c9d39aca1118bb841471f5",
        },
        "brush_management_code": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "SDMC Chapter 14, Article 2, Division 4", "section": "§142.0412 Brush Management",
            "effective_date": "Current composite acquired 2026-10-01", "url": "https://docs.sandiego.gov/municode/municodechapter14/ch14art02division04.pdf", "sha256": "5ae9b149f89eff0a798a3f11bc0368192af8963ebfd032b5c8e3ee669d98d5be",
        },
        "city_vhfhsz_map": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "City of San Diego Fire Hazard Severity Zone Map 2025", "section": "City-adopted VHFHSZ layer",
            "effective_date": "2025-08-30", "url": "https://webmaps.sandiego.gov/arcgis/rest/services/Hosted/COSD_FHSZ_LRA/FeatureServer/21",
            "adopting_ordinance_url": "https://www.sandiego.gov/sites/default/files/2025-08/o-21992.pdf", "adopting_ordinance_sha256": "01671a2b8c95ec4b2bad6ffa3907ba3c90cf2123d0cc06ecf4518294129a7c41",
            "exact_apn_query_evidence_sha256": "a626b25b8a072345ce995ac90b9ab54a42e634f6d10b3004ca2a311b9150bba4",
        },
        "state_recommended_fhsz": {
            "state": "AVAILABLE", "authority_rank": 1, "title": "2025 Recommended LRA Fire Hazard Severity Zones, Phase 4", "section": "San Diego County LRA",
            "effective_date": "Recommendation dated 2025-03-24", "url": "https://utility.arcgis.com/usrsvcs/servers/89aed69e4a144689b9cd67c1d80ef3bb/rest/services/FHSZLRA25_Phase4_v1/FeatureServer/0",
            "exact_apn_query_evidence_sha256": "b561e84768446d964696225a5de989a9b828b66aa9308bf54134937e25957c0c",
        },
        "fhsz_faq": {
            "state": "AVAILABLE", "authority_rank": 2, "title": "2025 LRA Fire Hazard Severity Zones FAQs", "section": "Questions 3, 17, 18, and 25",
            "effective_date": None, "url": "https://www.sandiego.gov/sites/default/files/2025-06/2025_lra_fhsz_faqs.pdf", "sha256": "3517924e87141efbd147a799027797b21b8e15f2adf8872ba697d208be7aacb2",
        },
    }


def build_outputs() -> dict[str, object]:
    sources = source_registry()
    geography = {
        "city_vhfhsz_intersects": True,
        "city_vhfhsz_relation": "EXACT_SAN_GIS_PARCEL_GEOMETRY_INTERSECTS_CITY_ADOPTED_VHFHSZ",
        "city_applicability_rule": "Any portion of the lot within the VHFHSZ map triggers mapped requirements (City FAQ Q25).",
        "state_recommended_class": "NonWildland",
        "state_responsibility_area": "LRA",
        "mapped_defensible_space_context": "APPLIES_BY_CITY_ADOPTED_VHFHSZ_INTERSECTION",
        "parcel_geometry_source": {"apn": EXPECTED_APN, "objectid": 654272, "parcelid": 716690, "geometry_sha256": "5913a41c6f4b131e7239c6d028ae95f2f76adc156d3792c8c02c600284c6e9d0"},
        "limitations": ["Map status is fire-hazard/defensible-space context, not a §131.0443(i) greater-setback determination.", "No citywide GIS data was downloaded; evidence is an exact APN query only."],
    }
    evaluation = evaluate_fire_buffer(apn=EXPECTED_APN, sources=sources, geography=geography)
    front = bridge_setback(rule_family="front_setback", base_value_ft=15.0, other_unresolved=["front_50_foot_slope_branch"], fire_result=evaluation)
    rear = bridge_setback(rule_family="rear_setback", base_value_ft=23.502, other_unresolved=["document_or_program_modification"], fire_result=evaluation)
    provenance = provenance_graph(CONTRACT_VERSION, [
        {"hop": "APN_TO_SEALED_PARCEL_GEOMETRY", "apn": EXPECTED_APN, "parcel_geometry_sha256": geography["parcel_geometry_source"]["geometry_sha256"]},
        {"hop": "PARCEL_TO_CITY_VHFHSZ", "state": geography["city_vhfhsz_relation"], "query_evidence_sha256": sources["city_vhfhsz_map"]["exact_apn_query_evidence_sha256"]},
        {"hop": "PARCEL_TO_STATE_RECOMMENDED_FHSZ", "state": "NonWildland", "query_evidence_sha256": sources["state_recommended_fhsz"]["exact_apn_query_evidence_sha256"]},
        {"hop": "SECTION_TO_FIRE_AUTHORITY", "section": "131.0443(i)", "section_text_sha256": sources["sdmc_131_0443_i"]["section_text_sha256"]},
        {"hop": "CITY_FIRE_AND_WUI_CODE_CONTEXT", "sections": ["511.0001", "512.0202", "512.0302", "512.0603", "512.0604"]},
        {"hop": "GEOGRAPHY_TO_SEPARATE_OBLIGATIONS", "state": "GEOGRAPHY_CONTEXT_ONLY_FOR_131_0443_I"},
        {"hop": "PROJECT_RECORD_TO_FIRE_BUFFER", "state": evaluation["state"], "required_buffer_ft": evaluation["greater_buffer_ft"]},
        {"hop": "FIRE_PREDICATE_TO_SETBACK_BRIDGES", "front_state": front["requirement_state"], "rear_state": rear["requirement_state"]},
    ])
    product = {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "fire_hazard_context": "The parcel intersects the City-adopted VHFHSZ map. This establishes mapped fire-hazard and defensible-space context, not an automatic greater zoning setback.",
        "front_setback": "Base front setback from zoning: 15 ft. The slope branch remains unresolved. A greater fire-safety buffer may be required for a specific project by the Fire Code Official.",
        "rear_setback": "Base rear setback derived from zoning and lot depth: 23.502 ft. A greater fire-safety buffer may be required for a specific project by the Fire Code Official.",
        "scope_note": "These are base zoning setback presentations with unresolved project-specific branches. They are not final project setbacks or fire-safety findings.",
        "ui_wired": False,
    }
    contract = {
        "contract_version": CONTRACT_VERSION,
        "scope": {"apns": [EXPECTED_APN], "predicate": "SDMC_131_0443_I_FIRE_CODE_OFFICIAL_GREATER_BUFFER"},
        "states": list(FIRE_BUFFER_STATES),
        "project_evidence_types": list(PROJECT_EVIDENCE_TYPES),
        "concepts": ["FIRE_HAZARD_GEOGRAPHY", "VEGETATION_BRUSH_MANAGEMENT_OBLIGATION", "DEVELOPMENT_SETBACK_OVERRIDE", "PROJECT_SPECIFIC_FIRE_DETERMINATION"],
        "forbidden_conclusions": list(FORBIDDEN_CONCLUSIONS),
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "decision": "FIRE_DEFENSIBLE_SPACE_PREDICATE_V0_READY",
        "parcel_state": evaluation["state"],
        "gis_lookup_determination": "FIRE_BUFFER_GIS_LOOKUP_NOT_DETERMINATIVE",
        "next_rule_evaluation_target": "interior side setback",
        "structure_compliance_evaluated": False,
        "capacity_calculated": False,
    }
    outputs: dict[str, object] = {
        "contract.json": contract,
        "sources.json": sources,
        "evaluation.json": evaluation,
        "front-bridge.json": front,
        "rear-bridge.json": rear,
        "product-example.json": product,
        "provenance.json": provenance,
        "decision.json": decision,
    }
    outputs["integrity.json"] = integrity_artifact(CONTRACT_VERSION, outputs)
    return outputs


def main() -> None:
    outputs = build_outputs()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(f"wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
