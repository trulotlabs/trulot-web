#!/usr/bin/env python3
"""Build deterministic Packet 25 Legal Lot Evidence V0 artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from resolver import CHAIN_STATES, CONTRACT_VERSION, DIMENSION_SEMANTICS, LEGAL_STATES, RECONCILIATION_STATES, canonical_json, parse_recorded_references, resolve_fixture

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

PACKET25 = {
    "3506320400": {
        "recorded_map_artifacts": [{
            "exact_filename": "MAP 00915-1.TIF", "record_type": "Subdivision Map", "record_number": "MAP 00915", "map_number": "00915",
            "filing_or_recording_date": "1904-08-04T16:30:00", "sheet": 1, "page_count": 1, "byte_size": 191043,
            "artifact_sha256": "b17fa5436951059f76381dfa7f04a5215cdd9e5c79f51249b9b0fb11c12121bc",
            "acquired_at": "2026-09-30T18:32:37-07:00", "artifact_state": "ACQUIRED_AUTHORITATIVE_TIFF",
            "source": "San Diego County Survey Records System", "source_url": "https://srs.sandiegocounty.gov/",
            "receipt": {"order_id": "db8edaa3-8df8-4bf7-9293-2db8407fa2cf", "ordered_at": "2026-09-30T17:21:58.228-07:00", "delivery_sender": "SRSCoordinator@ptfs.com", "delivery_subject": "Purchase Confirmation for SDSRS", "delivered_at": "2026-09-30T18:24:00-07:00", "private_payment_data_excluded": True},
            "relation_to_target_apn": "Official assessor description cites TR 915, Block 4, Lots 7 through 9.",
        }],
        "map_lot_or_parcel_identifier": [{"type": "BLOCK", "normalized": "BLOCK 4"}, {"type": "LOT", "normalized": "LOTS 7-9"}],
        "dimensions": [],
        "frontage_evidence": {"street_adjacency": "MIRAMAR ST", "dedicated_right_of_way": True, "frontage_length": None, "code_frontage_semantics": None, "authoritative_artifact_sha256": "b17fa5436951059f76381dfa7f04a5215cdd9e5c79f51249b9b0fb11c12121bc", "finding": "The plat depicts Lots 7, 8, and 9 adjoining Miramar Street, but does not designate a Code front lot line or a supported frontage length."},
        "areas": [],
        "reconciliation": {"state": "MULTIPLE_RECORDED_LOTS_ONE_APN", "reason": "The assessor description and plat identify three separately drawn subdivision lots under one APN; no merger, lot tie, or later configuration instrument was found remotely."},
        "recorded_findings": {"subdivision_name": "CENTER ADDITION TO LA JOLLA PARK", "block": "4", "lots": ["7", "8", "9"], "recorded_entity_count": 3, "map_scale": "1 inch = 200 feet", "area_shown": False, "dimension_finding": "No numeric boundary dimension could be attributed to Lots 7, 8, or 9 with sufficient confidence from the retained sheet.", "street_relationships": ["Lots 7, 8, and 9 are depicted adjoining Miramar Street.", "The City acceptance text includes Miramar Street and unnamed alleys among accepted public ways."], "map_notes": ["The map is a subdivision of a portion of Pueblo Lot 1283.", "The City adopted the subdivision as Center Addition to La Jolla Park."], "easements_or_dedications": ["Named streets and unnamed alleys shown on the map were accepted for public use."]},
        "legal_status_evidence": {"establishes_legal_lot": False, "artifact_sha256": "b17fa5436951059f76381dfa7f04a5215cdd9e5c79f51249b9b0fb11c12121bc", "basis": "The recorded subdivision map establishes three historic platted lots, not one current legal lot matching the tax APN."},
    },
    "6341302200": {
        "recorded_map_artifacts": [
            {"exact_filename": "PM 17383-1.TIF", "record_type": "Parcel Map", "record_number": "PM 17383", "map_number": "17383", "filing_or_recording_date": "1994-06-30T11:51:00-07:00", "sheet": 1, "page_count": 2, "byte_size": 135273, "artifact_sha256": "4f3c57bf6dce29044532109abb1bb4bcc0c1740a506fb1ec36787f1b1ff821da", "acquired_at": "2026-09-30T18:32:37-07:00", "artifact_state": "ACQUIRED_AUTHORITATIVE_TIFF", "source": "San Diego County Survey Records System", "source_url": "https://srs.sandiegocounty.gov/", "receipt": {"order_id": "db8edaa3-8df8-4bf7-9293-2db8407fa2cf", "ordered_at": "2026-09-30T17:21:58.228-07:00", "delivery_sender": "SRSCoordinator@ptfs.com", "delivery_subject": "Purchase Confirmation for SDSRS", "delivered_at": "2026-09-30T18:24:00-07:00", "private_payment_data_excluded": True}, "relation_to_target_apn": "The recorded 2001 deed identifies the current APN as Parcel 1 of PM 17383."},
            {"exact_filename": "PM 17383-2.TIF", "record_type": "Parcel Map", "record_number": "PM 17383", "map_number": "17383", "filing_or_recording_date": "1994-06-30T11:51:00-07:00", "sheet": 2, "page_count": 2, "byte_size": 100497, "artifact_sha256": "6912324c0a4d54dce4f02a019ebae38485ac7a7fffde5e05d8166e3257afbb00", "acquired_at": "2026-09-30T18:32:37-07:00", "artifact_state": "ACQUIRED_AUTHORITATIVE_TIFF", "source": "San Diego County Survey Records System", "source_url": "https://srs.sandiegocounty.gov/", "receipt": {"order_id": "db8edaa3-8df8-4bf7-9293-2db8407fa2cf", "ordered_at": "2026-09-30T17:21:58.228-07:00", "delivery_sender": "SRSCoordinator@ptfs.com", "delivery_subject": "Purchase Confirmation for SDSRS", "delivered_at": "2026-09-30T18:24:00-07:00", "private_payment_data_excluded": True}, "relation_to_target_apn": "Sheet 2 contains Parcel 1 boundary and area evidence."},
        ],
        "recorded_deed_artifacts": [{"exact_filename": "B52044301.pdf", "record_type": "Grant Deed", "document_number": "2001-0706032", "recording_date": "2001-10-01T08:00:00-07:00", "deed_date": "2001-09-26", "apn_raw": "634-130-22-00", "apn_normalized": "6341302200", "legal_description_text": "PARCEL 1 PARCEL MAP NO. 17383, IN THE CITY SAN DIEGO, COUNTY OF SAN DIEGO, STATE OF CALIFORNIA, FILED IN THE OFFICE OF THE COUNTY RECORDER OF SAN DIEGO, JUNE 30, 1944.", "source_note": "Operator-supplied local scan of the recorded instrument; no title-company summary substituted.", "byte_size": 46254, "artifact_sha256": "1b778cb6a06dc60e75dd1184d22681f672e453f16002e5fb0214cfc9406131fd", "acquired_at": "2026-09-30T21:24:37-07:00", "artifact_state": "ACQUIRED_AUTHORITATIVE_RECORDED_DEED_SCAN", "internal_discrepancy": "The deed text says PM 17383 was filed June 30, 1944; the authoritative parcel map's Recorder certificate says June 30, 1994. The discrepancy is retained as written and does not alter the exact map and parcel identifiers."}],
        "map_lot_or_parcel_identifier": [{"type": "PARCEL", "normalized": "PARCEL 1"}],
        "dimensions": [
            {"raw_label": "94.00'", "value": 94.00, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "west"},
            {"raw_label": "N 89°55'05\" E 265.04'", "value": 265.04, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "north including 30-foot dedicated street portion"},
            {"raw_label": "235.04'", "value": 235.04, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "north west of 27th Street"},
            {"raw_label": "94.00'", "value": 94.00, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "east"},
            {"raw_label": "S 89°54'59\" W 265.00'", "value": 265.00, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "south including 30-foot dedicated street portion"},
            {"raw_label": "235.00'", "value": 235.00, "unit": "ft", "semantic": "RECORDED_BOUNDARY_LENGTH", "boundary_segment": "south west of 27th Street"},
        ],
        "frontage_evidence": {"street_adjacency": "27TH STREET", "dedicated_right_of_way": True, "frontage_length": 94.0, "code_frontage_semantics": None, "authoritative_artifact_sha256": "6912324c0a4d54dce4f02a019ebae38485ac7a7fffde5e05d8166e3257afbb00", "finding": "Parcel 1 has a recorded 94.00-foot boundary at 27th Street; the map does not designate the Code front lot line or establish Code frontage semantics."},
        "areas": [{"source_semantic": "RECORDED_MAP_AREA", "value": 0.572, "unit": "acre", "classification": "LEGAL_LOT_AREA_CANDIDATE", "artifact_sha256": "6912324c0a4d54dce4f02a019ebae38485ac7a7fffde5e05d8166e3257afbb00", "provenance": {"record": "PM 17383", "sheet": 2, "label": "PARCEL 1 0.572 ACRES", "gross_square_feet": 24916.32, "dedicated_street_portion_note": "The mapped Parcel 1 outline includes a 30-foot by 94-foot portion of 27th Street; the recorded 0.572-acre value is preserved as the authoritative recorded area without converting current geometry into legal area."}}],
        "reconciliation": {"state": "EXACT_RECORDED_LOT_MATCH", "reason": "Recorded deed DOC # 2001-0706032 identifies APN 634-130-22-00 as Parcel 1 of PM 17383; the map and current rectangular geometry west of 27th Street correspond to that same recorded entity. The assessor-derived Parcel 2 summary is retained as conflicting secondary evidence."},
        "recorded_findings": {"map_purpose": "LOT LINE ADJUSTMENT", "parcel": "1", "recorded_area_acres": 0.572, "recorded_area_square_feet": 24916.32, "total_map_area_acres": 0.887, "file_number": "1994-414843", "creation_sources": ["portion of Lot 13 of Tibbetts Tract, amended Licensed Survey Map No. 24", "Parcel 1 of PM 4547", "portion of 27th Street dedicated to public use"], "bearings": ["north N 89°55'05\" E", "west N 00°04'59\" W", "south S 89°54'59\" W", "east/street line N 00°03'42\" W"], "street_relationships": ["Parcel 1 is depicted adjoining 27th Street along a 94.00-foot recorded boundary.", "The Parcel 1 map outline includes a 30-foot-wide portion of 27th Street dedicated for public use."], "map_notes": ["Field survey requested by Juan Andrade on 1993-12-01.", "City Engineer approval dated 1994-06-28.", "Filed 1994-06-30 at 11:51 AM as File No. 1994-414843."], "easements_or_dedications": ["A 4.0-foot water easement to Juanita A. Valverde is shown within Parcel 1 under a deed recorded 1953-04-23, Book 4832, Page 310 O.R.", "The map includes a portion of 27th Street dedicated by Old Road Survey 172 on 1890-01-20."]},
        "legal_status_evidence": {"establishes_legal_lot": True, "artifact_sha256": "1b778cb6a06dc60e75dd1184d22681f672e453f16002e5fb0214cfc9406131fd", "basis": "The 2001 recorded deed identifies the current APN as Parcel 1 of PM 17383; the authoritative map creates and describes Parcel 1, and bounded later evidence shows no configuration change."},
    },
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
            if apn not in PACKET25:
                limitations.append("SRS verified record metadata, but the full authoritative document requires a paid cart transaction that was not authorized.")
        geometry_area = _fact(result, "approximate_geometry_area_sqft")
        assessor_sqft = obs and obs["assessor_sqft"]
        if geometry_area is None or assessor_sqft is None:
            comparison = "UNRESOLVED"
        else:
            delta = abs(geometry_area-assessor_sqft)/assessor_sqft
            comparison = "CONSISTENT_BUT_SEMANTICS_DIFFER" if delta <= .03 else "MATERIAL_DISCREPANCY_REQUIRES_REVIEW"
        zone_intersection_area = sum(float(z.get("intersected_area_sqft") or 0) for z in zoning.get("zone_evidence", [])) or None
        row = {
            "fixture_id": item["fixture_id"], "apn": apn,
            "parcel_v2_source_identity": {"contract_version": source["contract_version"], "fingerprint_sha256": result["fingerprint_sha256"], "situs_address": identity.get("situs_address"), "geometry_type": _fact(result, "geometry_type"), "geometry_area_sqft": geometry_area, "taxable_acreage": _fact(result, "taxable_acreage"), "single_zone_intersection_area_sqft": zone_intersection_area if zoning.get("mapping_state") == "SINGLE_ZONE" else None},
            "coverage_tags": {"zone_mapping_state": zoning.get("mapping_state"), "zones": [z.get("zone_code") for z in zoning.get("zone_evidence", [])], "coastal_state": coastal.get("evidence_state"), "stacked_or_condo": stacked, "identity_exception": item["fixture_id"] == "packet8-identity-exception"},
            "assessor_map_identifier": map_identifier, "assessor_evidence": assessor, "recorded_map_references": refs, "recorded_map_artifacts": artifacts,
            "map_lot_or_parcel_identifier": [ref for ref in (assessor or {}).get("reference_parse", {}).get("references", []) if ref["type"] in {"LOT", "PARCEL", "BLOCK"}],
            "dimensions": [], "areas": areas, "frontage_evidence": None, "lot_line_evidence": None, "subsequent_modifying_records": [],
            "modification_chain": {"state": "UNRESOLVED", "searched_sources": ["SRS record metadata" if obs else "assessor lookup route"], "limitation": "Recorder APN search is available only at in-person kiosks; the SRS Certificate of Correction list is partial from 1982."},
            "apn_recorded_entity_reconciliation": {"state": "UNRESOLVED", "reason": "No full recorded entity reconciliation was completed."},
            "recorder_chain_state": "RECORDER_CHECK_REQUIRED",
            "legal_status_evidence": None, "source_unavailable": source_unavailable, "stacked_or_condo": stacked, "underlying_land_parcel_evidence": None,
            "provenance": [{"source": "Parcel Intelligence V2 fixture", "fingerprint_sha256": result["fingerprint_sha256"]}, {"source": "County Assessor Mapping Services / ParcelQuest", "observed_at": "2026-09-30"}, {"source": "County Survey Records System", "observed_at": "2026-09-30"}],
            "limitations": limitations, "parcel_v2_comparison": comparison,
        }
        if apn in PACKET25:
            target = PACKET25[apn]
            row.update({
                "recorded_map_artifacts": target["recorded_map_artifacts"],
                "map_lot_or_parcel_identifier": target["map_lot_or_parcel_identifier"],
                "dimensions": target["dimensions"],
                "areas": areas + target["areas"],
                "frontage_evidence": target["frontage_evidence"],
                "lot_line_evidence": {"state": "NOT_EXPLICITLY_DESIGNATED", "explicit_roles": [], "authoritative_artifact_sha256": target["recorded_map_artifacts"][-1]["artifact_sha256"]},
                "apn_recorded_entity_reconciliation": target["reconciliation"],
                "recorder_chain_state": "REMOTE_CHAIN_SUFFICIENT" if apn == "6341302200" else "RECORDER_CHECK_REQUIRED",
                "recorded_findings": target["recorded_findings"],
                "legal_status_evidence": target["legal_status_evidence"],
                "source_unavailable": None,
                "subsequent_modifying_records": [],
                "modification_chain": {
                    "state": "COMPLETE_TO_CURRENT" if apn == "6341302200" else "UNRESOLVED",
                    "searched_sources": ["OpenDSD exact-address approval search", "City official-domain APN/address/legal-description search", "SRS APN/address/map-number search", "County partial Certificate of Correction index (1982-current list)"],
                    "limitation": "No directly related later modifying record was found remotely. For this bounded identity decision, the 2001 recorded deed, PM 17383, unchanged APN/address, and corresponding current geometry close the chain sufficiently; this is not an ownership or title-insurance conclusion." if apn == "6341302200" else "No directly related later modifying record was found remotely. OpenDSD is limited to its indexed 2003-current approvals, the County correction list is expressly partial from 1982, and Recorder APN search requires an in-person kiosk/title search.",
                },
                "city_modification_search": {
                    "searched_at": "2026-09-30", "system": "OpenDSD Approval Search and official City web index", "search_terms": [obs["address"], apn, "PARCEL 1 PARCEL MAP NO. 17383" if apn == "6341302200" else obs["legal_description"]],
                    "records_found": [], "result": "NO_DIRECTLY_RELATED_RECORD_FOUND", "scope_limitation": "OpenDSD address search covers indexed DSD permit information from 2003-current; absence does not prove no Certificate of Compliance, lot-line adjustment, lot tie, merger, map correction, later map, or right-of-way instrument exists.",
                },
                "srs_modification_search": {
                    "searched_at": "2026-09-30", "system": "San Diego County Survey Records System", "search_terms": [apn, obs["address"], obs["srs"]["title"]],
                    "records_found": [], "result": "ORIGINATING_MAP_ONLY", "same_number_collisions_excluded": ["CR 00915 cross-references MAP 8737 and is not MAP 00915" if apn == "3506320400" else "PM 12057 cross-references TM 17383 and is not PM 17383"],
                    "certificate_of_correction_index": "No MAP 00915 or PM 17383 entry found in the County's expressly partial 1982-current list.", "scope_limitation": "SRS supplements the Survey Records Counter and its correction list is partial. For 27th Street, the negative search is used only with the recorded deed/map and matching current geometry, not as standalone proof." if apn == "6341302200" else "SRS supplements the Survey Records Counter and its correction list is partial; absence is not a complete later-instrument chain.",
                },
                "recorded_entity_comparison": "MULTIPLE_HISTORIC_LOTS_CURRENT_ENTITY_UNRESOLVED" if apn == "3506320400" else "PARCEL_1_RECORDED_AREA_AND_CURRENT_PRIVATE_GEOMETRY_CONSISTENT_WITH_DIFFERENT_BOUNDARY_SEMANTICS",
            })
            row["limitations"] = limitations + ["Authoritative recorded-map sheets and deed are retained by SHA-256 outside the repository; source bytes were not modified or committed.", "The bounded chain conclusion supports parcel identity and legal-lot evidence only; it is not an ownership, encumbrance, or title-insurance conclusion."] if apn == "6341302200" else limitations + ["Authoritative recorded-map sheets are retained by SHA-256 outside the repository; source TIFF bytes were not modified or committed.", "Remote search did not close the legally operative Recorder/title chain."]
            if apn == "6341302200":
                row.update({
                    "recorded_deed_artifacts": target["recorded_deed_artifacts"],
                    "authority_resolution": {"governing_evidence": "DOC # 2001-0706032", "secondary_conflict_retained": "PM17383 PAR 2", "rule": "When a derived title or assessor summary conflicts with an actual recorded deed or recorded map, the authoritative recorded instrument governs legal-description reconciliation."},
                    "recorded_chain_chronology": [
                        {"date": "1994", "record": "DOC # 1994-0198203", "role": "PREDECESSOR_CONFIGURATION", "apn": "634-130-16-00", "description": "Metes-and-bounds portion of Lot 13, Tibbetts Tract, Map 24; retained prior acquired evidence."},
                        {"date": "1994-06-30", "record": "PM 17383 / File No. 1994-414843", "role": "PARCEL_CREATION_AND_LOT_LINE_ADJUSTMENT", "description": "Creates and depicts Parcel 1 and Parcel 2."},
                        {"date": "2001-10-01", "record": "DOC # 2001-0706032", "role": "CURRENT_APN_RECORDED_DEED", "apn": "634-130-22-00", "description": "Legal description states Parcel 1, Parcel Map No. 17383."},
                        {"date": "2026-09-30", "record": "Current assessor and Parcel V2 evidence", "role": "CURRENT_CORROBORATION", "apn": "6341302200", "description": "Same situs and APN; current geometry corresponds to Parcel 1 west of 27th Street."},
                    ],
                    "current_area_comparison": {"classification": "CONSISTENT_WITHIN_SOURCE_AND_MEASUREMENT_SEMANTICS", "recorded_gross_area_acres": 0.572, "recorded_gross_area_sqft": 24916.32, "mapped_dedicated_street_portion_sqft": 2820.0, "recorded_private_portion_estimate_sqft": 22096.32, "assessor_sqft": 22215, "assessor_delta_from_private_portion_sqft": 118.68, "assessor_delta_percent": 0.54, "parcel_v2_geometry_sqft": geometry_area, "parcel_v2_delta_from_private_portion_sqft": round(geometry_area - 22096.32, 2), "parcel_v2_delta_percent": round(abs(geometry_area - 22096.32) / 22096.32 * 100, 2), "semantic_note": "The recorded 0.572-acre gross parcel includes a 30-foot by 94-foot dedicated street portion; assessor and Parcel V2 figures correspond closely to the land west of the street. Approximate current geometry is not promoted to legal area."},
                    "current_geometry_comparison": {"classification": "BROAD_BOUNDARY_CORRESPONDENCE", "shape": "Near rectangle approximately 235 feet east-west by 94 feet north-south west of 27th Street", "street_adjacency": "East edge at 27th Street", "recognizable_geometry": True, "obvious_added_or_removed_land": False, "scope": "Reconciliation check only; not a survey."},
                    "superseded_evidence": [{"packet": "Packet 25", "prior_conclusion": "IDENTITY_MISMATCH", "prior_basis": "Derived assessor/title summary PM17383 PAR 2 and comparison to Parcel 2's 0.315-acre area", "new_authoritative_evidence": "Recorded Grant Deed DOC # 2001-0706032 identifies APN 634-130-22-00 as Parcel 1 of PM 17383", "reason_for_supersession": "The actual recorded deed controls legal-description reconciliation over the conflicting derived summary", "corrected_state": "EXACT_RECORDED_LOT_MATCH"}],
                })
        rows.append(row)
    return rows

def source_systems():
    return {"contract_version": CONTRACT_VERSION, "systems": [
        {"name": "County Assessor Mapping Services", "official_url": "https://www.sdarcc.gov/content/arcc/home/divisions/assessor/mapping-services.html", "online_search": "https://assr.parcelquest.com/", "query": "County=San Diego; By APN; formatted APN", "provides": ["tax parcel/APN identity", "assessor map book/page lookup", "recorded dimensions and acreage where displayed", "recorded-map references"], "limitations": ["assessment/tax purpose only", "not survey accuracy or legal-rights proof", "map download is session-bound and did not yield a retained file in bounded browser review", "usage limits apply"]},
        {"name": "County Survey Records System", "official_url": "https://srs.sandiegocounty.gov/", "query": "keyword/record number, APN, address, intersection, geography", "provides": ["subdivision/final maps", "parcel maps", "records of survey", "corner records", "metadata and preview thumbnails"], "packet25_observation": "The operator acquired MAP 00915 and both sheets of PM 17383. APN/address searches found no result; map-number searches found the originating maps only after unrelated same-number collisions were excluded.", "limitations": ["full authoritative page/document downloads require paid cart transactions", "parcel and aerial overlays are not fully registered", "system supplements the Survey Records Counter", "Certificate of Correction list is partial from 1982"]},
        {"name": "City Development Services records", "official_url": "https://www.sandiego.gov/development-services/permits-inspections/mapping-land-title-review", "records_url": "https://www.sandiego.gov/development-services/forms-publications/information-bulletin/110", "query": "address, plan/approval/permit number, legal description/APN through listed City tools or records request", "provides": ["parcel/final maps", "Certificates of Compliance", "lot-line adjustments", "mergers", "corrections/amended maps", "mapping approvals"], "limitations": ["records are distributed among OpenDSD, Accela, Permit Finder, open data, subdivision cards, and records requests", "absence in a single endpoint is not proof of no record"]},
        {"name": "County Recorder", "official_url": "https://www.sdarcc.gov/content/arcc/home/divisions/recorder-clerk/recording.html", "query": "document/title/name online; APN only at five in-person kiosks effective 2024-12-09", "provides": ["recorded legal instruments needed for modification-chain reconciliation"], "limitations": ["online APN search removed by law", "bounded remote APN-to-modification-chain proof is unavailable"]},
    ]}

def contract():
    return {"contract_version": CONTRACT_VERSION, "evidence_classes": {"assessor_parcel_map": "Tax identity and map-reference evidence; never legal-lot proof by itself.", "recorded_map_or_survey": "May support recorded geometry and identifiers when the full authoritative artifact is retained.", "legal_lot_status": "Requires legally operative evidence plus a current modification chain."}, "legal_states": list(LEGAL_STATES), "reconciliation_states": list(RECONCILIATION_STATES), "recorder_chain_states": list(CHAIN_STATES), "dimension_semantics": list(DIMENSION_SEMANTICS), "area_semantics": ["ASSESSOR_DISPLAYED_ACREAGE", "RECORDED_MAP_AREA", "CALCULATED_RECORDED_BOUNDARY_AREA", "PARCEL_V2_GEOMETRY_AREA", "LEGAL_LOT_AREA"], "doctrine": ["APN is not a legal-lot conclusion.", "Multiple recorded lots under one APN are not collapsed into one legal lot.", "When a derived title or assessor summary conflicts with an actual recorded deed or recorded map, the authoritative recorded instrument governs legal-description reconciliation; the secondary summary remains in the audit trail.", "Recorded area is promoted only after exact entity match and a complete current legal-status chain.", "Assessor map dimensions are not automatically Code-defined width or depth.", "Street adjacency, dedicated right-of-way, frontage length, and Code-defined frontage are distinct.", "Historic recorded maps require a later-modification search.", "Condominium/stack APN dimensions belong to no unit unless explicit underlying-land semantics support that attribution."], "containment": {"parcel_compliance_calculated": False, "development_capacity_calculated": False, "production_wired": False, "citywide_imported": False}}

def build_outputs():
    fs = fixtures(); results = [resolve_fixture(x) | {"coverage_tags": x["coverage_tags"], "parcel_v2_comparison": x["parcel_v2_comparison"]} for x in fs]
    counts = {"assessor_map_found": sum(x["assessor_evidence"] is not None for x in fs), "recorded_map_reference_found": sum(bool(x["recorded_map_references"]) for x in fs), "recorded_map_acquired": sum(any(a.get("artifact_sha256") for a in x["recorded_map_artifacts"]) for x in fs), "dimensions_present": sum(bool(x["dimensions"]) for x in fs), "area_present": sum(any(a["source_semantic"].startswith("ASSESSOR_DISPLAYED") for a in x["areas"]) for x in fs), "frontage_evidence_present": sum(bool(x["frontage_evidence"]) for x in fs), "subsequent_modifying_record_found": sum(bool(x["subsequent_modifying_records"]) for x in fs)}
    for state in LEGAL_STATES: counts[state] = sum(x["legal_status_state"] == state for x in results)
    comparison_counts = {k: sum(x["parcel_v2_comparison"] == k for x in results) for k in ("CONSISTENT_BUT_SEMANTICS_DIFFER", "MATERIAL_DISCREPANCY_REQUIRES_REVIEW", "UNRESOLVED")}
    reconciliation_counts = {state: sum(x.get("apn_recorded_entity_reconciliation", {}).get("state") == state for x in results) for state in RECONCILIATION_STATES}
    recorder_counts = {state: sum(x.get("recorder_chain_state") == state for x in results) for state in CHAIN_STATES}
    target_decisions = {x["apn"]: {"legal_lot_state": x["legal_status_state"], "reconciliation_state": x["apn_recorded_entity_reconciliation"]["state"], "recorder_chain_state": x["recorder_chain_state"], "legal_area_supported": any(a.get("state") == "LEGAL_LOT_AREA_SUPPORTED" for a in x["legal_area_findings"]), "minimum_lot_area_readiness": x["minimum_lot_area_evaluation_state"]} for x in results if x["apn"] in PACKET25}
    decision = {"contract_version": CONTRACT_VERSION, "decision": "27TH_STREET_LEGAL_LOT_RECONCILIATION_READY", "reason": "Recorded deed DOC # 2001-0706032 identifies current APN 6341302200 as Parcel 1 of PM 17383; the recorded map, bounded later-chain search, and current geometry support the same entity. Cabrillo remains unchanged and unresolved.", "parcel_decisions": target_decisions, "first_rule_unlock": {"minimum_lot_area": "READY_FOR_DETERMINISTIC_EVALUATION", "ready_fixture_count": 1}, "next_feasibility_step": "minimum lot area rule evaluator"}
    outputs = {"contract.json": contract(), "source-systems.json": source_systems(), "fixtures.json": {"contract_version": CONTRACT_VERSION, "fixture_count": len(fs), "fixtures": fs}, "fixture-results.json": {"contract_version": CONTRACT_VERSION, "fixture_count": len(results), "results": results}, "reconciliation.json": {"contract_version": CONTRACT_VERSION, "counts": counts, "parcel_v2_comparison_counts": comparison_counts, "apn_recorded_entity_reconciliation_counts": reconciliation_counts, "recorder_chain_counts": recorder_counts}, "decision.json": decision}
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "artifacts": {name: hashlib.sha256(canonical_json(value).encode()).hexdigest() for name,value in outputs.items()}, "bundle_sha256": hashlib.sha256(canonical_json(outputs).encode()).hexdigest()}
    return outputs

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name,value in build_outputs().items(): (OUTPUT/name).write_text(json.dumps(value,indent=2,sort_keys=True)+"\n")

if __name__ == "__main__": main()
