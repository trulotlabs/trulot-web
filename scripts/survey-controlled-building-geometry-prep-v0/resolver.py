from __future__ import annotations

CONTRACT_VERSION = "survey-controlled-building-geometry-prep-v0-2026-10-01-p40"
EXPECTED_APN = "6341302200"
EXPECTED_ADDRESS = "1456 27TH ST"

HIGH_VALUE_TYPES = {
    "APPROVED_SITE_PLAN",
    "APPROVED_PLOT_PLAN",
    "BOUNDARY_OR_SURVEY_PLAN",
    "GRADING_OR_CIVIL_PLAN",
    "FOUNDATION_PLAN_WITH_PROPERTY_LINE_DIMENSIONS",
    "APPROVED_ARCHITECTURAL_SITE_SHEET",
}
MEDIUM_VALUE_TYPES = {"FLOOR_PLAN_WITHOUT_SITE_CONTROL", "INSPECTION_RECORD", "PERMIT_CARD"}
LOW_VALUE_TYPES = {"NO_PLAN_MEP", "VALUATION_ONLY"}


def classify_document(document_type: str) -> str:
    if document_type in HIGH_VALUE_TYPES:
        return "HIGH_VALUE"
    if document_type in MEDIUM_VALUE_TYPES:
        return "MEDIUM_VALUE"
    if document_type in LOW_VALUE_TYPES:
        return "LOW_VALUE"
    return "UNCLASSIFIED"


def assess_compliance_geometry(*, legal_boundary_tie: bool, building_frame_location: bool,
                               offsets_sufficient: bool, authoritative_identity: bool,
                               approval_status: bool, dimensional_semantics: bool) -> str:
    ready = all((legal_boundary_tie, building_frame_location, offsets_sufficient,
                 authoritative_identity, approval_status, dimensional_semantics))
    return "COMPLIANCE_GEOMETRY_READY" if ready else "COMPLIANCE_GEOMETRY_NOT_READY"


def public_record_findings() -> list[dict]:
    return [
        {
            "record_id": "NOT EXPOSED — RECORDS STAFF CROSS-INDEX REQUIRED",
            "acquisition_target_id": "CITY_ARCHIVE_LOOKUP_1456_27TH_2008_2012",
            "identity_state": "PUBLIC_RECORD_ID_NOT_EXPOSED",
            "title": "Initial residence/site-development permit and approved plan set",
            "date_window": "2008-01-01/2012-12-31",
            "source": "City DSD Records archive cross-index by address/APN",
            "classification": "HIGH_VALUE_POTENTIAL",
            "relevance": "Plausible initial-construction file based on assessor-reported 2010 year built; existence and contents require Records staff confirmation.",
            "target_document_types": sorted(HIGH_VALUE_TYPES),
            "key_dimensions": "Pending in-person review",
            "property_line_map_reference": "Seek explicit PM 17383 Parcel 1 or surveyed-boundary tie",
            "copy_view_status": "VIEW_PENDING; COPY_REQUIRES_CITY_PROCESS",
        },
        {
            "record_id": "PMT-3276742",
            "identity_state": "PUBLICLY_IDENTIFIED",
            "title": "No-Plan - Nonresidential/Multifamily - Plumbing",
            "date_window": "2024-02-26/2024-02-29",
            "source": "City Accela / DSD Permit Finder",
            "classification": "LOW_VALUE",
            "relevance": "Address/APN matched gas-pipe repair record; no site or building plan and no stated footprint effect.",
            "target_document_types": ["NO_PLAN_MEP"],
            "key_dimensions": "None",
            "property_line_map_reference": "None exposed",
            "copy_view_status": "PUBLIC METADATA REVIEWED; NO PLAN RECORD",
        },
        {
            "record_id": "PM 17383 / FILE NO. 1994-414843",
            "identity_state": "AUTHORITATIVE_SUPPORTING_CONTROL",
            "title": "Parcel Map 17383, Parcel 1",
            "date_window": "1994-06-30",
            "source": "San Diego County Survey Records / City-approved parcel map",
            "classification": "HIGH_VALUE_BOUNDARY_ONLY",
            "relevance": "Establishes the legal-lot boundary and dimensions but does not locate current structures.",
            "target_document_types": ["BOUNDARY_OR_SURVEY_PLAN"],
            "key_dimensions": "Recorded Parcel 1 boundary dimensions already sealed",
            "property_line_map_reference": "PM 17383 Parcel 1",
            "copy_view_status": "ALREADY ACQUIRED; USE AS REGISTRATION CONTROL",
        },
    ]


def resolve() -> dict:
    contract_result = assess_compliance_geometry(
        legal_boundary_tie=False,
        building_frame_location=False,
        offsets_sufficient=False,
        authoritative_identity=False,
        approval_status=False,
        dimensional_semantics=False,
    )
    return {
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "address": EXPECTED_ADDRESS,
        "public_search": {
            "coverage": "OpenDSD and public approvals data begin in 2003; archived activity reports were searched around the assessor-reported construction year.",
            "opendsd_apn": {
                "parcel_found": True,
                "project_result": "NO_SUBSTANTIVE_PTS_PROJECT; GENERAL_INFORMATION_ROW_ONLY",
                "bpis_result": "NO_BPIS_ASSOCIATED_WITH_PARCEL",
            },
            "opendsd_address": "NO_EXACT_TARGET_APPROVAL",
            "permit_finder_apn": "NO_PTS_RECORDS_FOUND; PMT-3276742 ONLY",
            "accela_address": "PMT-3276742 ONLY",
            "accela_apn": "NO_ADDITIONAL_RESULT",
            "open_data": "CURRENT DATASET CATALOG REVIEWED; NO ADDITIONAL TARGET RECORD EXPOSED THROUGH PERMIT FINDER",
            "archived_activity_reports": {
                "years": [2008, 2009, 2010, 2011, 2012],
                "pdf_count": 782,
                "result": "NO_EXACT_ADDRESS_OR_APN MATCH",
            },
            "subdivision_index_cards": "NO TIBBETTS TRACT, PM 17383, OR TARGET-ADDRESS CARD IDENTIFIED; THROUGH-1990S LAND-ACTION INDEX IS NOT A 2010 BUILDING-PLAN SUBSTITUTE",
        },
        "records": public_record_findings(),
        "likely_construction_record": {
            "state": "PLAUSIBLE_UNINDEXED_ARCHIVE_TARGET",
            "record_id": None,
            "date_window": "2008-01-01/2012-12-31",
            "basis": "Assessor reports year built 2010. City DSD retains post-1955 building plans, accepts address or APN for Records lookup, and the public indexes expose no initial-construction project ID.",
            "request": "Ask Records staff to cross-index the initial residence, grading/site-development, foundation, and approved plan files by 1456 27TH ST, APN 634-130-22-00, PM 17383 Parcel 1, and the 2008-2012 window.",
            "not_proven": ["that the file exists", "that plans are retained", "that the plans show survey control", "that the approved design matches current construction"],
        },
        "acceptance_contract": {
            "result_before_acquisition": contract_result,
            "required": [
                "legal property lines or explicit tie to PM 17383 / surveyed boundary",
                "current or approved outer edge of building-frame location",
                "dimensions or offsets sufficient to locate the building relative to property lines",
                "authoritative plan and project identity",
                "approved or issued record status",
                "adequate scale and unambiguous dimensional semantics",
            ],
            "insufficient": ["aerial imagery", "conceptual sketch", "floor plan without site control", "permit card alone", "no-plan MEP record"],
        },
        "access": {
            "office": "City of San Diego Development Services Department Records Counter",
            "location": "7650 Mission Valley Road, San Diego, CA 92108",
            "appointment": "Records Review (30-minute in-person appointment)",
            "appointment_url": "https://www.sandiego.gov/development-services/virtual-appointments",
            "identifiers_to_bring": [EXPECTED_ADDRESS, "APN 634-130-22-00", "PM 17383 Parcel 1", "assessor year built 2010", "target window 2008-2012", "PMT-3276742 as later address/APN control"],
            "viewing": "Anyone may view building plans by appointment. Viewing alone is sufficient to identify and classify candidate sheets, but not to seal exact dimensions unless Records staff permits written numerical notes or an authorized copy is obtained.",
            "restrictions": "No copying, tracing, sketching, photography, or video during viewing. Copies require the City duplication process and written permissions from the current owner and, when applicable, the signing design professional.",
        },
        "capture_protocol": [
            "Record project/permit number.",
            "Record plan title and sheet number.",
            "Record approval/issue date and status.",
            "Record plan author/design professional.",
            "Record survey, map, benchmark, and PM 17383 references.",
            "Ask Records staff whether written numerical notes are permitted; if yes, record relevant property-line offsets without tracing or reproducing layout; if no, record only that relevant dimensions exist and use the authorized duplication process.",
            "Record whether the sheet distinguishes wall/frame, roof, support, foundation, and accessory structures.",
            "Record whether copy permission is required, requested, and obtained.",
        ],
        "visit_decision": "DSD_RECORDS_VISIT_JUSTIFIED",
        "visit_reason": "The bounded target is the unindexed circa-2008-2012 initial-construction/site-development file. If retained, its approved site, grading, civil, foundation, or architectural site sheets could tie building-frame geometry to PM 17383 property lines.",
        "alternate_source_assessment": {
            "state": "SECONDARY_IF_BUILDING_FILE_UNAVAILABLE",
            "priority": ["grading/as-built or civil plans indexed to the same address/APN", "survey/engineering records tied to PM 17383", "City inspection/site records identifying drawing or job numbers", "public-improvement plans only if they include parcel-specific building control"],
            "switch_now": False,
        },
        "next_step": "NEXT_FEASIBILITY_STEP: DSD records review for survey-controlled building geometry",
        "decision": "SURVEY_CONTROLLED_BUILDING_GEOMETRY_PREP_READY",
        "forbidden": ["setback compliance", "lot coverage", "development capacity", "imagery promotion", "unauthorized plan copying"],
    }


def records_index_text(evaluation: dict) -> str:
    lines = [
        "TRULOT PACKET 40 — DSD RECORDS INDEX",
        "APN: 6341302200",
        "Address: 1456 27TH ST",
        "",
    ]
    fields = ["record_id", "title", "date_window", "source", "classification", "relevance", "key_dimensions", "property_line_map_reference", "copy_view_status"]
    labels = {
        "record_id": "Project/permit ID", "title": "Document title", "date_window": "Date", "source": "Source",
        "classification": "Relevance class", "relevance": "Relevance", "key_dimensions": "Key dimensions",
        "property_line_map_reference": "Property-line/map reference", "copy_view_status": "Copy/view status",
    }
    for i, record in enumerate(evaluation["records"], 1):
        lines.append(f"RECORD {i}")
        for field in fields:
            lines.append(f"{labels[field]}: {record[field]}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
