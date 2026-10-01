#!/usr/bin/env python3
"""Build deterministic Packet 24 Legal Lot Evidence V0 artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CONTRACT_VERSION, DIMENSION_SEMANTICS, LEGAL_STATES, canonical_json, parse_recorded_references, resolve_fixture

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "legal-lot-evidence-v0"
CORPUS = ROOT / "data" / "parcel-intelligence-v2" / "fixture-results.json"

SELECTED = (
    "3506320400", "6341302200", "4304211000", "3031701800", "2421001000",
    "2392600700", "5891700512", "5891700513", "5333641301", "5333641302",
    "6782511200", "3013101500", "2748323700", "4303410600", "7600360300",
    "4236300300", "5810934600", "5490330700", "6271001600", "2725300831",
    "2748402401", "2673600300", "2723200100", "3527702600", "7600300100",
)
OBSERVED = {
    "3506320400": {"address": "7553 CABRILLO AVE LA JOLLA CA 92037-5206", "legal_description": "TR 915 BLK 4*LOTS 7 THRU 9*", "map_action_key": "350~35063", "assessor_acres": None, "assessor_sqft": None, "srs": {"title": "MAP 00915", "record_type": "Subdivision Map", "pages": 1, "subdivision_name": "MAP OF CENTER ADDITION", "cross_reference": None, "download_price_usd": 4}},
    "6341302200": {"address": "1456 27TH ST SAN DIEGO CA 92154-3238", "legal_description": "PM17383 PAR 2", "map_action_key": "634~63413", "assessor_acres": 0.510, "assessor_sqft": 22215, "srs": {"title": "PM 17383", "record_type": "Parcel Map", "pages": 2, "subdivision_name": None, "cross_reference": "FILE NO 1994-414843", "download_price_usd": 8}},
    "4304211000": {"address": "4927 WHITEHAVEN WAY SAN DIEGO CA 92110-1249", "legal_description": "TR 3225 LOT 85*", "map_action_key": "430~43042", "assessor_acres": 0.385, "assessor_sqft": 16800, "srs": {"title": "MAP 03225", "record_type": "Subdivision Map", "pages": 6, "subdivision_name": "WESTERN HILLS UNIT NO.1", "cross_reference": "FILE NO 57695", "download_price_usd": 24}},
}

def _fact(result, key):
    for item in result.get("property_facts", {}).get("parcel_conditions", []):
        if item.get("fact_key") == key:
            return item.get("value")
    return None

def _map_id(apn):
    return {"book": apn[:3], "page": apn[3:5], "parcel": apn[5:8], "sub_id": apn[8:10], "lookup_key": f"{apn[:3]}~{apn[:5]}", "status": "CONFIRMED_IN_OFFICIAL_SEARCH" if apn in OBSERVED else "DERIVED_LOOKUP_KEY_NOT_ARTIFACT_CONFIRMED"}

def fixtures():
    source = json.loads(CORPUS.read_text())
    by_apn = {item["result"].get("identity", {}).get("apn"): item for item in source["results"]}
    rows = []
    for apn in SELECTED:
        item = by_apn[apn]; result = item["result"]; identity = result["identity"]; zoning = result.get("zoning", {}); coastal = result.get("coastal_context", {})
        obs = OBSERVED.get(apn)
        stacked = apn in {"5891700512", "5891700513", "5333641301", "5333641302"}
        assessor = None
        refs = []
        artifacts = []
        areas = [{"source_semantic": "PARCEL_V2_GEOMETRY_AREA", "value": _fact(result, "approximate_geometry_area_sqft"), "unit": "sqft", "classification": "DIAGNOSTIC_ONLY"}, {"source_semantic": "PARCEL_V2_TAXABLE_ACREAGE", "value": _fact(result, "taxable_acreage"), "unit": "acre", "classification": "ASSESSOR_TAX_FACT_NOT_LEGAL_LOT_AREA"}]
        source_unavailable = "SESSION_BOUND_ASSESSOR_DOWNLOAD_DID_NOT_YIELD_RETAINABLE_ARTIFACT"
        map_identifier = _map_id(apn)
        limitations = ["APN existence and assessor parcel mapping do not prove a legal development lot.", "No dimension may be promoted to Code-defined width/depth without explicit legal semantics.", "No absence in a City endpoint is treated as proof that no modifying record exists."]
        if obs:
            parsed = parse_recorded_references(obs["legal_description"])
            refs = [ref for ref in parsed["references"] if ref["type"] in {"PARCEL_MAP", "SUBDIVISION_MAP"}]
            assessor = {"state": "FOUND", "address": obs["address"], "legal_description_raw": obs["legal_description"], "reference_parse": parsed, "map_action_key": obs["map_action_key"], "artifact_state": "DOWNLOAD_TRIGGERED_NO_FILE_RETAINED", "source_url": "https://assr.parcelquest.com/Statewide", "acquired_at": "2026-09-30T22:20:00-07:00", "artifact_sha256": None}
            srs = obs["srs"]
            artifacts = [{"record_type": srs["record_type"], "record_number": srs["title"], "pages": srs["pages"], "filing_or_recording_date": None, "subdivision_name": srs["subdivision_name"], "cross_reference": srs["cross_reference"], "source_url": f"https://srs.sandiegocounty.gov/#/s?v=G&a=c&q={srs['title'].replace(' ', '%20')}", "artifact_state": "FULL_DOCUMENT_PURCHASE_REQUIRED_NOT_AUTHORIZED", "download_price_usd": srs["download_price_usd"], "artifact_sha256": None, "relation_to_target_apn": "REFERENCE_FROM_OFFICIAL_ASSESSOR_LEGAL_DESCRIPTION"}]
            if obs["assessor_acres"] is not None:
                areas.append({"source_semantic": "ASSESSOR_DISPLAYED_ACREAGE", "value": obs["assessor_acres"], "unit": "acre", "classification": "ASSESSOR_TAX_FACT_NOT_LEGAL_LOT_AREA", "source_location": "ParcelQuest Property Characteristics / Lot Acres"})
            if obs["assessor_sqft"] is not None:
                areas.append({"source_semantic": "ASSESSOR_DISPLAYED_LOT_SQFT", "value": obs["assessor_sqft"], "unit": "sqft", "classification": "ASSESSOR_TAX_FACT_NOT_LEGAL_LOT_AREA", "source_location": "ParcelQuest Property Characteristics / Lot SqFt"})
            source_unavailable = None
            limitations.append("SRS verified record metadata, but the full authoritative document requires a paid cart transaction that was not authorized.")
        geometry_area = _fact(result, "approximate_geometry_area_sqft")
        assessor_sqft = obs and obs["assessor_sqft"]
        if geometry_area is None or assessor_sqft is None:
            comparison = "UNRESOLVED"
        else:
            delta = abs(geometry_area-assessor_sqft)/assessor_sqft
            comparison = "CONSISTENT_BUT_SEMANTICS_DIFFER" if delta <= .03 else "MATERIAL_DISCREPANCY_REQUIRES_REVIEW"
        rows.append({
            "fixture_id": item["fixture_id"], "apn": apn,
            "parcel_v2_source_identity": {"contract_version": source["contract_version"], "fingerprint_sha256": result["fingerprint_sha256"], "situs_address": identity.get("situs_address"), "geometry_type": _fact(result, "geometry_type"), "geometry_area_sqft": geometry_area, "taxable_acreage": _fact(result, "taxable_acreage")},
            "coverage_tags": {"zone_mapping_state": zoning.get("mapping_state"), "zones": [z.get("zone_code") for z in zoning.get("zone_evidence", [])], "coastal_state": coastal.get("evidence_state"), "stacked_or_condo": stacked, "identity_exception": item["fixture_id"] == "packet8-identity-exception"},
            "assessor_map_identifier": map_identifier, "assessor_evidence": assessor, "recorded_map_references": refs, "recorded_map_artifacts": artifacts,
            "map_lot_or_parcel_identifier": [ref for ref in (assessor or {}).get("reference_parse", {}).get("references", []) if ref["type"] in {"LOT", "PARCEL", "BLOCK"}],
            "dimensions": [], "areas": areas, "frontage_evidence": None, "lot_line_evidence": None, "subsequent_modifying_records": [],
            "modification_chain": {"state": "UNRESOLVED", "searched_sources": ["SRS record metadata" if obs else "assessor lookup route"], "limitation": "Recorder APN search is available only at in-person kiosks; the SRS Certificate of Correction list is partial from 1982."},
            "legal_status_evidence": None, "source_unavailable": source_unavailable, "stacked_or_condo": stacked, "underlying_land_parcel_evidence": None,
            "provenance": [{"source": "Parcel Intelligence V2 fixture", "fingerprint_sha256": result["fingerprint_sha256"]}, {"source": "County Assessor Mapping Services / ParcelQuest", "observed_at": "2026-09-30"}, {"source": "County Survey Records System", "observed_at": "2026-09-30"}],
            "limitations": limitations, "parcel_v2_comparison": comparison,
        })
    return rows

def source_systems():
    return {"contract_version": CONTRACT_VERSION, "systems": [
        {"name": "County Assessor Mapping Services", "official_url": "https://www.sdarcc.gov/content/arcc/home/divisions/assessor/mapping-services.html", "online_search": "https://assr.parcelquest.com/", "query": "County=San Diego; By APN; formatted APN", "provides": ["tax parcel/APN identity", "assessor map book/page lookup", "recorded dimensions and acreage where displayed", "recorded-map references"], "limitations": ["assessment/tax purpose only", "not survey accuracy or legal-rights proof", "map download is session-bound and did not yield a retained file in bounded browser review", "usage limits apply"]},
        {"name": "County Survey Records System", "official_url": "https://srs.sandiegocounty.gov/", "query": "keyword/record number, APN, address, intersection, geography", "provides": ["subdivision/final maps", "parcel maps", "records of survey", "corner records", "metadata and preview thumbnails"], "limitations": ["full authoritative page/document downloads require paid cart transactions", "parcel and aerial overlays are not fully registered", "system supplements the Survey Records Counter", "Certificate of Correction list is partial from 1982"]},
        {"name": "City Development Services records", "official_url": "https://www.sandiego.gov/development-services/permits-inspections/mapping-land-title-review", "records_url": "https://www.sandiego.gov/development-services/forms-publications/information-bulletin/110", "query": "address, plan/approval/permit number, legal description/APN through listed City tools or records request", "provides": ["parcel/final maps", "Certificates of Compliance", "lot-line adjustments", "mergers", "corrections/amended maps", "mapping approvals"], "limitations": ["records are distributed among OpenDSD, Accela, Permit Finder, open data, subdivision cards, and records requests", "absence in a single endpoint is not proof of no record"]},
        {"name": "County Recorder", "official_url": "https://www.sdarcc.gov/content/arcc/home/divisions/recorder-clerk/recording.html", "query": "document/title/name online; APN only at five in-person kiosks effective 2024-12-09", "provides": ["recorded legal instruments needed for modification-chain reconciliation"], "limitations": ["online APN search removed by law", "bounded remote APN-to-modification-chain proof is unavailable"]},
    ]}

def contract():
    return {"contract_version": CONTRACT_VERSION, "evidence_classes": {"assessor_parcel_map": "Tax identity and map-reference evidence; never legal-lot proof by itself.", "recorded_map_or_survey": "May support recorded geometry and identifiers when the full authoritative artifact is retained.", "legal_lot_status": "Requires legally operative evidence plus a current modification chain."}, "legal_states": list(LEGAL_STATES), "dimension_semantics": list(DIMENSION_SEMANTICS), "area_semantics": ["ASSESSOR_DISPLAYED_ACREAGE", "RECORDED_MAP_AREA", "CALCULATED_RECORDED_BOUNDARY_AREA", "PARCEL_V2_GEOMETRY_AREA", "LEGAL_LOT_AREA"], "doctrine": ["APN is not a legal-lot conclusion.", "Assessor map dimensions are not automatically Code-defined width or depth.", "Street adjacency, dedicated right-of-way, frontage length, and Code-defined frontage are distinct.", "Historic recorded maps require a later-modification search.", "Condominium/stack APN dimensions belong to no unit unless explicit underlying-land semantics support that attribution."], "containment": {"parcel_compliance_calculated": False, "development_capacity_calculated": False, "production_wired": False, "citywide_imported": False}}

def build_outputs():
    fs = fixtures(); results = [resolve_fixture(x) | {"coverage_tags": x["coverage_tags"], "parcel_v2_comparison": x["parcel_v2_comparison"]} for x in fs]
    counts = {"assessor_map_found": sum(x["assessor_evidence"] is not None for x in fs), "recorded_map_reference_found": sum(bool(x["recorded_map_references"]) for x in fs), "recorded_map_acquired": sum(any(a.get("artifact_sha256") for a in x["recorded_map_artifacts"]) for x in fs), "dimensions_present": sum(bool(x["dimensions"]) for x in fs), "area_present": sum(any(a["source_semantic"].startswith("ASSESSOR_DISPLAYED") for a in x["areas"]) for x in fs), "frontage_evidence_present": sum(bool(x["frontage_evidence"]) for x in fs), "subsequent_modifying_record_found": sum(bool(x["subsequent_modifying_records"]) for x in fs)}
    for state in LEGAL_STATES: counts[state] = sum(x["legal_status_state"] == state for x in results)
    comparison_counts = {k: sum(x["parcel_v2_comparison"] == k for x in results) for k in ("CONSISTENT_BUT_SEMANTICS_DIFFER", "MATERIAL_DISCREPANCY_REQUIRES_REVIEW", "UNRESOLVED")}
    decision = {"contract_version": CONTRACT_VERSION, "decision": "LEGAL_LOT_EVIDENCE_V0_NOT_READY", "reason": "Full authoritative recorded-map artifacts and a current modification chain were not obtainable without unapproved paid/in-person retrieval; no fixture establishes legal-lot area.", "first_rule_unlock": {"minimum_lot_area": "BLOCKED", "ready_fixture_count": 0}, "next_feasibility_source_target": "recorded map artifacts and current legal-lot modification-chain records"}
    outputs = {"contract.json": contract(), "source-systems.json": source_systems(), "fixtures.json": {"contract_version": CONTRACT_VERSION, "fixture_count": len(fs), "fixtures": fs}, "fixture-results.json": {"contract_version": CONTRACT_VERSION, "fixture_count": len(results), "results": results}, "reconciliation.json": {"contract_version": CONTRACT_VERSION, "counts": counts, "parcel_v2_comparison_counts": comparison_counts}, "decision.json": decision}
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "artifacts": {name: hashlib.sha256(canonical_json(value).encode()).hexdigest() for name,value in outputs.items()}, "bundle_sha256": hashlib.sha256(canonical_json(outputs).encode()).hexdigest()}
    return outputs

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name,value in build_outputs().items(): (OUTPUT/name).write_text(json.dumps(value,indent=2,sort_keys=True)+"\n")

if __name__ == "__main__": main()
