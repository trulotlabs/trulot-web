from pathlib import Path
import hashlib
import json

from resolver import CONTRACT_VERSION, canonical_bytes, resolve

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "current-structure-geometry-v0"


def write(name, value):
    (OUT / name).write_bytes(canonical_bytes(value))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evaluation = resolve()
    contract = {
        "schema": "CurrentStructureGeometryEvidenceV0",
        "contract_version": CONTRACT_VERSION,
        "scope": {"apns": ["6341302200"], "new_rule_families_evaluated": []},
        "states": [
            "CURRENT_STRUCTURE_GEOMETRY_SUPPORTED",
            "OBSERVATIONAL_STRUCTURE_GEOMETRY_SUPPORTED",
            "HISTORICAL_STRUCTURE_GEOMETRY_SUPPORTED",
            "STRUCTURE_GEOMETRY_CURRENTNESS_UNRESOLVED",
            "STRUCTURE_GEOMETRY_SOURCE_UNAVAILABLE",
        ],
        "compliance_gate": {
            "requires": ["Code-defined building reference edge", "survey-controlled legal-boundary registration", "authoritative current or project-approved geometry"],
            "observational_geometry_may_pass": False,
        },
    }
    source_inventory = {
        "contract_version": CONTRACT_VERSION,
        "sources": [
            {"id": "city_sandag_building_outlines_2017", "classification": "authoritative_historical", "vintage": "SPRING_2017", "semantics": "EagleView/Pictometry ChangeFinder building outlines", "record_ids": [880632, 987216, 758904]},
            {"id": "sandag_2023_9inch", "classification": "authoritative_observational", "vintage": "SPRING_2023", "semantics": "Nearmap-sourced 9-inch orthogonal imagery; public resampled regional dataset", "tile": "29_02"},
            {"id": "city_dsd_opendsd", "classification": "authoritative_record_index", "search": "exact address", "result_count": 0},
            {"id": "city_dsd_accela", "classification": "authoritative_record_index", "searches": {"exact_apn": 0, "exact_address": 1}},
            {"id": "pm_17383_parcel_1", "classification": "authoritative_recorded_legal_lot", "registration": "not survey-registered to imagery"},
            {"id": "sangis_parcel_control", "classification": "authoritative_tax_parcel_diagnostic_control", "promotion_to_legal_boundary": False},
        ],
    }
    provenance = {
        "contract_version": CONTRACT_VERSION,
        "inputs": [
            {"path": "data/structure-facts-v0/fixture-results.json", "sha256": "9496932b1009a149d53c95decc3e3603f112d579b9df127af5bd3b26305d1666"},
            {"path": "data/legal-lot-evidence-v0/fixture-results.json", "sha256": "5d3a7e241ec4a93a910217e03646fb7d2c5ad668263bb83f5e1cca3fb528befc", "parcel_fingerprint": "45d578f06b0a17bc342c1d6504ca0db285db25bfa251cc22988d9f1ead97d3b5"},
            {"external_artifact": "sandag-hosted-2023-bounded.jpg", "byte_size": 38562, "sha256": "85081333a7984dccc06870a9f35e56b63afac338bd25af4b53d954c9cc9bde51", "storage": "outside_git"},
            {"external_artifact": "building-outlines-2017.geojson", "sha256": "4eda2993a2b72cc757f13c2a39e3da56be67cb71a5c87ad6fce35fc971efabf7", "storage": "outside_git"},
            {"external_artifact": "parcel-control.geojson", "sha256": "4a62c0456cf6fb9cdfd1be366f394228704ac0549a41221cb2fd204f1f6e0180", "storage": "outside_git"},
            {"external_artifact": "imagery-grid-query.json", "sha256": "fa3551b453e408c04f1f0e4e54a3dc59594156f10b0bb0d492e8968d23e5c379", "storage": "outside_git"},
        ],
        "official_urls": [
            "https://gis.sandag.org/sdgis/rest/services/Imagery/SD2023_9inch/ImageServer",
            "https://geo.sandag.org/image/rest/services/Hosted/SD2023/ImageServer",
            "https://webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer/1",
            "https://opendsd.sandiego.gov/web/approvals/",
            "https://aca.accela.com/SANDIEGO/Default.aspx",
            "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf",
        ],
        "evaluation_fingerprint_sha256": evaluation["fingerprint_sha256"],
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "decision": "CURRENT_STRUCTURE_GEOMETRY_V0_READY",
        "evidence_state": evaluation["evidence_state"],
        "setback_suitability": "COMPLIANCE_GEOMETRY_NOT_READY",
        "lot_coverage_suitability": "LOT_COVERAGE_GEOMETRY_NOT_READY",
        "next_feasibility_source_target": "survey-controlled building footprint",
        "setback_compliance_concluded": False,
        "lot_coverage_calculated": False,
        "capacity_calculated": False,
    }
    for name, value in [
        ("contract.json", contract),
        ("source-inventory.json", source_inventory),
        ("evaluation.json", evaluation),
        ("provenance.json", provenance),
        ("decision.json", decision),
    ]:
        write(name, value)
    artifacts = {}
    for path in sorted(OUT.glob("*.json")):
        if path.name != "integrity.json":
            artifacts[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    bundle = hashlib.sha256(canonical_bytes(artifacts)).hexdigest()
    write("integrity.json", {"contract_version": CONTRACT_VERSION, "artifacts": artifacts, "bundle_sha256": bundle})


if __name__ == "__main__":
    main()
