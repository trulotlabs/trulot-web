from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CONTRACT_VERSION, records_index_text, resolve

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "survey-controlled-building-geometry-prep-v0"
HANDOFF = Path("/private/tmp/trulot-packet-40-input")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode() + b"\n"


def write_json(name, value):
    (OUT / name).write_bytes(canonical(value))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    HANDOFF.mkdir(parents=True, exist_ok=True)
    evaluation = resolve()
    contract = {
        "contract_version": CONTRACT_VERSION,
        "schema": "SurveyControlledBuildingGeometryPrepV0",
        "scope": {"apns": ["6341302200"], "preparation_only": True},
        "compliance_geometry_ready_requires": evaluation["acceptance_contract"]["required"],
        "insufficient_sources": evaluation["acceptance_contract"]["insufficient"],
    }
    sources = {
        "contract_version": CONTRACT_VERSION,
        "official_sources": [
            {"id": "city_dsd_records", "url": "https://www.sandiego.gov/development-services/records"},
            {"id": "city_dsd_ib110", "url": "https://www.sandiego.gov/development-services/forms-publications/information-bulletin/110"},
            {"id": "city_dsd_records_appointment", "url": "https://www.sandiego.gov/development-services/virtual-appointments"},
            {"id": "opendsd", "url": "https://opendsd.sandiego.gov/web/approvals/"},
            {"id": "permit_finder", "url": "https://sandiego.maps.arcgis.com/apps/instant/sidebar/index.html?appid=b9641fb06e8d4c6ab45d1c5ca8411840"},
            {"id": "accela", "url": "https://aca.accela.com/SANDIEGO/Default.aspx"},
            {"id": "city_open_data_approvals", "url": "https://data.sandiego.gov/datasets/development-permits/"},
            {"id": "permit_activity_reports", "url": "https://www.sandiego.gov/development-services/records/permit-activity-reports"},
            {"id": "subdivision_cards", "url": "https://www.sandiego.gov/development-services/records/subdivision-cards"},
        ],
        "searched_at": "2026-10-01",
    }
    decision = {
        "contract_version": CONTRACT_VERSION,
        "visit_decision": evaluation["visit_decision"],
        "next_step": evaluation["next_step"],
        "decision": evaluation["decision"],
        "compliance_geometry_state": evaluation["acceptance_contract"]["result_before_acquisition"],
        "setback_compliance_calculated": False,
        "lot_coverage_calculated": False,
        "capacity_calculated": False,
    }
    artifacts = {"contract.json": contract, "evaluation.json": evaluation, "source-inventory.json": sources, "decision.json": decision}
    for name, value in artifacts.items():
        write_json(name, value)
    hashes = {name: hashlib.sha256((OUT / name).read_bytes()).hexdigest() for name in sorted(artifacts)}
    integrity = {"contract_version": CONTRACT_VERSION, "artifacts": hashes, "bundle_sha256": hashlib.sha256(canonical(hashes)).hexdigest()}
    write_json("integrity.json", integrity)
    (HANDOFF / "records-index.txt").write_text(records_index_text(evaluation), encoding="utf-8")


if __name__ == "__main__":
    main()
