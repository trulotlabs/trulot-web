import hashlib
import json

CONTRACT_VERSION = "current-structure-geometry-v0-2026-10-01-p39"
EXPECTED_APN = "6341302200"


def canonical_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def fingerprint(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def assess_compliance_geometry(geometry_semantic, boundary_registration, currentness, authoritative):
    ready = (
        geometry_semantic == "OUTER_EDGE_OF_BUILDING_FRAME"
        and boundary_registration == "SURVEY_CONTROLLED_LEGAL_BOUNDARY"
        and currentness in {"CURRENT_PROJECT_APPROVED_GEOMETRY", "CURRENT_FIELD_VERIFIED_GEOMETRY"}
        and authoritative is True
    )
    return "COMPLIANCE_GEOMETRY_READY" if ready else "COMPLIANCE_GEOMETRY_NOT_READY"


def classify_currentness(observation_vintage, through_date, permit_reviewed):
    if not observation_vintage:
        return "STRUCTURE_GEOMETRY_CURRENTNESS_UNRESOLVED"
    return {
        "state": "OBSERVATIONAL_STRUCTURE_GEOMETRY_SUPPORTED",
        "current_as_observed": observation_vintage,
        "current_through": None,
        "requested_through_date": through_date,
        "permit_chain_reviewed": bool(permit_reviewed),
        "limitation": "Permit-chain review cannot prove the absence of unpermitted physical change after the observation date.",
    }


def resolve():
    imagery = {
        "publisher": "SANDAG / SanGIS",
        "service": "Imagery/SD2023_9inch with official Hosted/SD2023 export endpoint",
        "service_url": "https://gis.sandag.org/sdgis/rest/services/Imagery/SD2023_9inch/ImageServer",
        "export_url": "https://geo.sandag.org/image/rest/services/Hosted/SD2023/ImageServer/exportImage",
        "source": "Nearmap; resampled regional public-access dataset",
        "source_tile": {"catalog_object_id": 965, "name": "SanGIS_Nearmap_Sp23_9in_29_02", "grid_tile": "29_02"},
        "acquisition_vintage": "SPRING_2023",
        "exact_acquisition_timestamp": None,
        "exact_timestamp_state": "NOT_PUBLISHED_IN_SERVICE_OR_TILE_METADATA",
        "pixel_resolution": {"value": "0.75", "unit": "US_survey_foot", "display": "9 inches"},
        "crs": "EPSG:2230",
        "bands": 3,
        "source_type": "ORTHOGONAL_ORTHOIMAGERY_SERVICE",
        "orthorectification_note": "The 2023 service identifies Nearmap imagery and a resampled regional dataset; the linked PDF is a 2020 order summary and does not establish parcel-specific 2023 rectification or shot time.",
        "public_access": "The 9-inch imagery is public domain under the SanGIS/Nearmap licensing agreement; 3-inch and oblique products are limited to project participants.",
        "bounded_extract": {
            "bbox_epsg_2230": ["6307015.78398855", "1788099.0010645539", "6307401.868162051", "1788342.9998923093"],
            "dimensions_pixels": [515, 325],
            "byte_size": 38562,
            "sha256": "85081333a7984dccc06870a9f35e56b63afac338bd25af4b53d954c9cc9bde51",
            "storage": "outside_git",
            "scope": "target parcel and immediate context only",
        },
        "suitability": "Adequate to detect obvious plan-view roof/visible-outline change at approximately 9-inch ground sampling; not survey, mensuration, building-frame, or compliance geometry.",
    }

    outlines = [
        {
            "object_id": 880632,
            "linkage": "DIRECT_POSITIVE_AREA_SINGLE_PHYSICAL_PARCEL",
            "historical_area_sq_ft": "1058.574119839",
            "change_class": "VISUALLY_UNCHANGED",
            "finding": "No obvious plan-view change is visible between the 2017 outline and Spring 2023 roof/visible structure evidence at 9-inch resolution.",
        },
        {
            "object_id": 987216,
            "linkage": "DIRECT_POSITIVE_AREA_SINGLE_PHYSICAL_PARCEL",
            "historical_area_sq_ft": "2352.326429209",
            "change_class": "VISUALLY_UNCHANGED",
            "finding": "No obvious plan-view change is visible between the 2017 outline and Spring 2023 roof/visible structure evidence at 9-inch resolution.",
        },
        {
            "object_id": 758904,
            "linkage": "BOUNDARY_TOUCHING_AMBIGUOUS",
            "historical_area_sq_ft": "2516.87948391",
            "change_class": "AMBIGUOUS",
            "finding": "The outline remains north of the parcel-control boundary in the comparison and is not promoted to a target-parcel structure.",
        },
    ]

    permit = {
        "record_id": "PMT-3276742",
        "job_id": None,
        "system": "City of San Diego Accela Citizen Access",
        "address": "1456 27TH (SB) ST, SAN DIEGO CA 92154",
        "apn": None,
        "coordinates_epsg_2230": [6307206, 1788220],
        "record_type": "No-Plan - Nonresidential/Multifamily - Plumbing",
        "scope": "As built installation of approximately 105 lineal feet of new iron gas pipe; gas system leak repair and two gas system/meters.",
        "status": "CLOSED",
        "opened": "2024-02-26",
        "issued": "2024-02-27",
        "finaled": "2024-02-29",
        "closed": "2024-02-29",
        "possible_footprint_effect": "NONE_STATED",
        "approved_plan_availability": "NO_PLAN_RECORD; NO PUBLIC SITE_OR_BUILDING_PLAN FOUND",
        "relevance": "Post-imagery address-matched record retained for completeness; stated scope does not establish or change structure footprint geometry.",
    }

    currentness = classify_currentness("SPRING_2023", "2026-10-01", True)
    compliance_gate = assess_compliance_geometry(
        "OBSERVED_ROOF_OR_VISIBLE_STRUCTURE_OUTLINE",
        "BROAD_PARCEL_CONTROL_ONLY_NOT_SURVEY_REGISTRATION",
        currentness["state"],
        True,
    )

    evaluation = {
        "schema": "CurrentStructureGeometryEvidenceV0",
        "contract_version": CONTRACT_VERSION,
        "apn": EXPECTED_APN,
        "address": "1456 27TH ST",
        "evidence_state": "OBSERVATIONAL_STRUCTURE_GEOMETRY_SUPPORTED",
        "historical_outline_state": "HISTORICAL_STRUCTURE_GEOMETRY_SUPPORTED",
        "imagery": imagery,
        "historical_outlines": outlines,
        "permit_search": {
            "opendsd_exact_address": {"records": [], "result": "NO_RESULTS", "coverage": "indexed DSD approvals 2003-current subject to OpenDSD exclusions"},
            "accela_exact_apn": {"records": [], "result": "NO_RESULTS"},
            "accela_exact_address": {"records": [permit], "result": "ONE_ADDRESS_MATCHED_RECORD"},
            "absence_doctrine": "Absence of a permit is not proof of absence of physical change.",
        },
        "approved_plans": {
            "state": "NO_RELEVANT_PUBLIC_APPROVED_PLAN_FOUND",
            "finding": "No footprint-changing approval was found. The sole post-2023 record is explicitly no-plan and exposes no public site/building plan establishing surveyed building-frame dimensions.",
        },
        "legal_lot_registration": {
            "legal_lot": "PM 17383 Parcel 1",
            "state": "AUTHORITATIVE_REGISTRATION_NOT_ACHIEVED",
            "control_used": "Exact-APN SanGIS parcel geometry in EPSG:2230, used only as broad diagnostic control.",
            "finding": "The sealed recorded map establishes legal identity and dimensions but has no surveyed coordinate registration to the 2023 image. Parcel V2/SanGIS geometry was not silently promoted to the legal boundary.",
        },
        "change_detection": {
            "from": "SPRING_2017",
            "to": "SPRING_2023",
            "method": "Visual overlay of official 2017 outlines on official 9-inch 2023 imagery using shared EPSG:2230 service coordinates.",
            "results": outlines,
            "legal_construction_status_inferred": False,
        },
        "currentness": currentness,
        "structure_count_reconciliation": {
            "assessor_dwelling_units": 1,
            "assessor_living_area_sq_ft": 988,
            "direct_2017_outline_count": 2,
            "ambiguous_2017_outline_count": 1,
            "observed_2023": "Two target-parcel roof/visible structure groupings remain visually consistent with the two directly linked historical outlines; one northern outline remains a linkage ambiguity.",
            "conclusion": "Structure count is not dwelling-unit count. Living area is not footprint, and the imagery does not establish legal units or complete current structure inventory.",
        },
        "semantics": {
            "roof_outline": "Visible roof edge in orthogonal imagery, affected by overhang, shadow, occlusion, and perspective/resampling.",
            "visible_structure_outline": "Observable plan-view edge without a guarantee that it is wall, frame, or support geometry.",
            "building_footprint": "Context-dependent plan-view footprint; must state whether it follows walls, supports, roof, or another convention.",
            "outer_edge_of_building_frame": "Code reference edge for new-development setback measurement under SDMC section 113.0252(c).",
            "permitted_structure_envelope": "Approved design geometry; not evidence that the approved work was built exactly as drawn.",
            "assessor_living_area": "Parcel-level assessed living-area fact; not footprint, gross floor area, or structure geometry.",
        },
        "setback_suitability": {
            "state": compliance_gate,
            "reason": "The observed image edge is not the Code-defined outer edge of the building frame, and PM 17383 is not survey-registered to the image. Current-through-2026 geometry is also unresolved.",
            "affected_evaluators": ["front_setback", "rear_setback", "interior_side_setback"],
        },
        "lot_coverage_suitability": {
            "state": "LOT_COVERAGE_GEOMETRY_NOT_READY",
            "reason": "SDMC section 113.0240 uses the structure footprint measured from exterior wall or support surfaces and contains inclusions/exclusions not resolved by a roofline. The appropriate legal-lot denominator and survey registration also remain unresolved for measurement.",
            "coverage_calculated": False,
        },
        "product_wording": "Official 2017 building outlines exist. Spring 2023 regional imagery shows no obvious plan-view change to the two directly linked outlines, but current compliance-grade structure geometry has not been established.",
        "cohorts": [
            "approved plan or site-plan geometry with adequate control",
            "recent imagery plus visually unchanged historical outline",
            "recent imagery showing possible change",
            "ambiguous multi-structure or stacked linkage",
            "no usable geometry",
        ],
        "decision": "CURRENT_STRUCTURE_GEOMETRY_V0_READY",
        "next_feasibility_source_target": "survey-controlled building footprint",
        "forbidden_conclusions": [
            "setback compliance",
            "lot coverage",
            "development capacity",
            "current through 2026 based on 2023 imagery",
            "no physical change based on permit absence",
            "structure count from dwelling-unit count",
        ],
    }
    payload = dict(evaluation)
    evaluation["fingerprint_sha256"] = fingerprint(payload)
    return evaluation
