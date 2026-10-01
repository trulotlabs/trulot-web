#!/usr/bin/env python3
"""Build deterministic, non-sensitive Packet 41 corpus artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import (
    CONTRACT_VERSION,
    build_integrity,
    classify_extraction,
    fingerprint,
    geometry_readiness,
    validate_candidate,
    validate_fact,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "approved-plan-golden-corpus-v0"
ADU_SOURCE = "/Users/ops/Google Drive/My Drive/TruLot/Projects/639 67th St/Submittal - 051926/BUILDING_CONSTRUCTION_PLANS_051826 Red1.pdf"
WALL_SOURCE = "/Users/ops/Google Drive/My Drive/TruLot/Projects/639 67th St/639 67th Site Walls Issued Plans - 112525.PDF"
INSPECTION_SOURCE = "/Users/ops/Google Drive/My Drive/TruLot/Projects/639 67th St/639 67th Site Walls Inspection Plan - 112525.pdf"
UTAH_SOURCE = "/Users/ops/Google Drive/My Drive/TruLot/Codex/TruLot Mail - 3927 Utah Street ROW Construction Proposal.pdf"
MEADE_SOURCE = "/Users/ops/Google Drive/My Drive/TruLot/Codex/TruLot Mail - 4324 Meade off-site ROW Proposal.pdf"


def candidate_inventory() -> list[dict[str, Any]]:
    common = {
        "city_jurisdiction": "City of San Diego",
        "coastal_context": "UNKNOWN_NOT_ESTABLISHED_BY_CORPUS",
        "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED",
    }
    candidates = [
        {
            **common,
            "project_id": "PRJ-1111087",
            "project_name": "67th Street ADUs",
            "address": "639-659 N 67th Street, San Diego, CA 92114",
            "apn": "5442140600",
            "plan_set_status": "FOURTH_CD_SUBMITTAL",
            "approval_permit_status": "PERMIT_SUBMITTED_NOT_PROVEN_ISSUED",
            "plan_date": "2026-05-09_PRINTED_LATEST_ISSUE; filename revision 2026-05-18",
            "project_type": "26 proposed ADUs in seven buildings with tuck-under parking",
            "zoning_if_known": "RM-2-5_PLAN_PROVIDED",
            "site_plan_present": True,
            "boundary_dimensions_present": True,
            "setback_dimensions_present": True,
            "building_footprint_present": True,
            "height_present": True,
            "floor_area_data_present": True,
            "grading_topography_present": True,
            "plan_set_present": True,
            "selected": True,
            "source_location": ADU_SOURCE,
        },
        {
            **common,
            "project_id": "PRJ-1140985",
            "project_name": "67th Street Site Walls",
            "address": "639 N 67th Street, San Diego, CA 92114",
            "apn": "5442140600",
            "plan_set_status": "CITY_ISSUED_PLAN_SET",
            "approval_permit_status": "ISSUED_2025-11-25",
            "plan_date": "2025-10-30_PRINTED_LATEST_ISSUE; City stamp 2025-11-25",
            "project_type": "Site and retaining walls",
            "zoning_if_known": "RM-2-5_PLAN_PROVIDED",
            "site_plan_present": True,
            "boundary_dimensions_present": True,
            "setback_dimensions_present": False,
            "building_footprint_present": False,
            "height_present": True,
            "floor_area_data_present": False,
            "grading_topography_present": True,
            "plan_set_present": True,
            "selected": True,
            "source_location": WALL_SOURCE,
        },
        {
            **common,
            "project_id": "PRJ-1110168",
            "project_name": "67th Street Grading and Right-of-Way",
            "address": "639-659 N 67th Street, San Diego, CA 92114",
            "apn": "5442140600",
            "plan_set_status": "REFERENCE_SHEETS_EMBEDDED_IN_PRJ-1111087",
            "approval_permit_status": "REFERENCED_AS_APPROVALS_ADDRESSED; DIRECT_STATUS_NOT_INDEPENDENTLY_VERIFIED",
            "plan_date": "REFERENCE_SHEETS_IN_2026_SUBMITTAL",
            "project_type": "Grading and public improvements",
            "zoning_if_known": "RM-2-5_PLAN_PROVIDED_BY_PARENT_SET",
            "site_plan_present": True,
            "boundary_dimensions_present": True,
            "setback_dimensions_present": False,
            "building_footprint_present": False,
            "height_present": False,
            "floor_area_data_present": False,
            "grading_topography_present": True,
            "plan_set_present": True,
            "selected": True,
            "source_location": ADU_SOURCE,
        },
        {
            **common,
            "project_id": "3927-UTAH-ROW-PROPOSAL",
            "project_name": "3927 Utah Street ROW proposal correspondence",
            "address": "3927 Utah Street, San Diego, CA",
            "apn": None,
            "plan_set_status": "NO_PLAN_SET",
            "approval_permit_status": "UNKNOWN",
            "plan_date": None,
            "project_type": "ROW proposal correspondence only",
            "zoning_if_known": None,
            "site_plan_present": False,
            "boundary_dimensions_present": False,
            "setback_dimensions_present": False,
            "building_footprint_present": False,
            "height_present": False,
            "floor_area_data_present": False,
            "grading_topography_present": False,
            "plan_set_present": False,
            "selected": False,
            "exclusion_reason": "NO_PLAN_SET_AND_CONTAINS_UNRELATED_CONTACT_CORRESPONDENCE",
            "source_location": UTAH_SOURCE,
        },
        {
            **common,
            "project_id": "4324-MEADE-ROW-PROPOSAL",
            "project_name": "4324 Meade Avenue ROW proposal correspondence",
            "address": "4324 Meade Avenue, San Diego, CA",
            "apn": None,
            "plan_set_status": "NO_PLAN_SET",
            "approval_permit_status": "UNKNOWN",
            "plan_date": None,
            "project_type": "ROW proposal correspondence only",
            "zoning_if_known": None,
            "site_plan_present": False,
            "boundary_dimensions_present": False,
            "setback_dimensions_present": False,
            "building_footprint_present": False,
            "height_present": False,
            "floor_area_data_present": False,
            "grading_topography_present": False,
            "plan_set_present": False,
            "selected": False,
            "exclusion_reason": "NO_PLAN_SET_AND_CONTAINS_UNRELATED_CONTACT_CORRESPONDENCE",
            "source_location": MEADE_SOURCE,
        },
    ]
    for candidate in candidates:
        validate_candidate(candidate)
    return candidates


def fact(*, fact_id: str, project_id: str, subject: str, value: Any, unit: str | None, sheet_number: str, sheet_title: str, pdf_page: int, callout: str, method: str, source_state: str, source_path: str, source_sha256: str, project_scope: str = "PROPOSED_WORK") -> dict[str, Any]:
    result = {
        "fact_id": fact_id,
        "project_id": project_id,
        "subject": subject,
        "project_scope": project_scope,
        "value": value,
        "unit": unit,
        "sheet_number": sheet_number,
        "sheet_title": sheet_title,
        "pdf_page": pdf_page,
        "exact_callout_or_dimension": callout,
        "method": method,
        "evidence_class": classify_extraction(method),
        "reproduction_integrity_validated": False,
        "source_state": source_state,
        "provenance": {
            "source_path": source_path,
            "source_sha256": source_sha256,
            "sheet_number": sheet_number,
            "pdf_page": pdf_page,
        },
    }
    validate_fact(result)
    return result


def pilots() -> list[dict[str, Any]]:
    adu_sha = "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12"
    wall_sha = "7b682112c7495bd01569071059c7ea61f381f13a65862f37d0aab083715faf17"
    return [
        {
            "project_id": "PRJ-1111087",
            "address_apn": {"address": "639-659 N 67th Street, San Diego, CA 92114", "apn": "5442140600"},
            "plan_set_identifier": "PRJ-1111087 / 67th STREET ADUs",
            "plan_status": "FOURTH_CD_SUBMITTAL_NOT_PROVEN_ISSUED",
            "plan_date": "2026-05-09_PRINTED_LATEST_ISSUE",
            "author_design_professional": "Stosh Thomas Architects PC",
            "scale": {"A0.1": "3/32 inch = 1 foot", "C-1": "1 inch = 10 feet"},
            "legal_boundary_reference": "Lot 4, Block 7, Encanto Heights, Map 1063",
            "survey_map_reference": "Topographic Survey C-1; Map 1063; calculated boundary; survey expressly is not a precise boundary survey",
            "property_lines": "Directly labeled on C-1 and A0.1; long sides 199.59 ft and 202.60 ft on A0.1",
            "building_frame_geometry": "Seven proposed building frames labeled on A0.1",
            "setback_dimensions": "A0.1 labels 4'-0\" ADU setback and 10'-0\" standard side-yard setback lines",
            "structure_footprint": "Proposed footprints shown; no plan area is promoted to an existing-parcel footprint",
            "gross_floor_area": "Proposed 22,219.6 sq ft FAR numerator",
            "height": "40'-0\" maximum building height in project data",
            "story_count": "Buildings 1-4 described as two story; Buildings 5-7 described as three story",
            "grading_topography": "Topographic survey and referenced grading/civil sheets present",
            "project_use": "Accessory dwelling units with tuck-under parking",
            "proposed_units": 26,
            "notes_conditions": ["Project facts are proposed, not as-built facts.", "Plan status is submitted; issuance is not established.", "Survey boundary is calculated and carries a not-precise-boundary-survey disclaimer."],
            "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED",
            "geometry_gate": {
                "property_line_tie": True,
                "building_frame_location": True,
                "setback_dimensions": True,
                "plan_status_recorded": True,
                "project_semantics_clear": True,
                "state": "COMPLIANCE_GEOMETRY_READY",
                "scope": "PROPOSED_PROJECT_GEOMETRY_ONLY",
            },
            "facts": [
                fact(fact_id="p41-adu-units", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value=26, unit="dwelling_units", sheet_number="T-1", sheet_title="Title Sheet", pdf_page=1, callout="Scope states construction of 26 ADU units within seven buildings", method="DIRECT_LABELED_PLAN_ANNOTATION", source_state="SUBMITTED_PLAN_ANNOTATION", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-adu-height", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value="40'-0\"", unit="ft-in", sheet_number="T-1", sheet_title="Title Sheet", pdf_page=1, callout="MAX. BUILDING HEIGHT: 40'-0\"", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="SUBMITTED_PLAN_PROJECT_DATA", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-adu-far", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value={"gross_floor_area_sq_ft": 22219.6, "lot_area_sq_ft": 20084.0, "far": 1.10}, unit="ratio", sheet_number="T-1", sheet_title="Title Sheet", pdf_page=1, callout="F.A.R. - PROPOSED: 22,219.6 S.F. / 20,084 = 1.10 FAR", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="SUBMITTED_PLAN_PROJECT_DATA", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-adu-side-setback", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value=4.0, unit="ft", sheet_number="A0.1", sheet_title="Architectural Site Plan", pdf_page=15, callout="4'-0\" ADU SETBACK", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="SUBMITTED_ARCHITECTURAL_SITE_PLAN", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-adu-north-boundary", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value=199.59, unit="ft", sheet_number="A0.1", sheet_title="Architectural Site Plan", pdf_page=15, callout="PROPERTY LINE - 199.59'", method="DIRECT_RECORDED_DIMENSION", source_state="SUBMITTED_SITE_PLAN_TIED_TO_SURVEY", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-adu-south-boundary", project_id="PRJ-1111087", subject="PROPOSED_PROJECT_FACT", value=202.60, unit="ft", sheet_number="A0.1", sheet_title="Architectural Site Plan", pdf_page=15, callout="PROPERTY LINE - 202.60'", method="DIRECT_RECORDED_DIMENSION", source_state="SUBMITTED_SITE_PLAN_TIED_TO_SURVEY", source_path=ADU_SOURCE, source_sha256=adu_sha),
            ],
        },
        {
            "project_id": "PRJ-1140985",
            "address_apn": {"address": "639 N 67th Street, San Diego, CA 92114", "apn": "5442140600"},
            "plan_set_identifier": "PRJ-1140985 / PMT-3368931",
            "plan_status": "CITY_ISSUED_2025-11-25",
            "plan_date": "2025-10-30_PRINTED_LATEST_ISSUE",
            "author_design_professional": "Stosh Thomas Architects PC; civil/survey references retained on sheets",
            "scale": {"T-1": "3/32 inch = 1 foot", "C-1": "1 inch = 10 feet"},
            "legal_boundary_reference": "Lot 4, Block 7, Encanto Heights, Map 1063",
            "survey_map_reference": "C-1 Topographic Survey tied to Map 1063; calculated boundary disclaimer retained",
            "property_lines": "Directly labeled on T-1 and C-1",
            "building_frame_geometry": "Separate future building project appears only as reference/background and is excluded from this project geometry",
            "setback_dimensions": None,
            "structure_footprint": "Site-wall alignments only",
            "gross_floor_area": None,
            "height": "Site walls range from 1'-2\" to 9'-3\"",
            "story_count": None,
            "grading_topography": "C-1 survey and grading sheet for reference",
            "project_use": "Site and retaining walls",
            "proposed_units": None,
            "notes_conditions": ["Issued status applies to site walls only.", "No right-of-way work is proposed.", "Separate building footprints are not approved by this plan set."],
            "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED",
            "geometry_gate": {
                "property_line_tie": True,
                "building_frame_location": False,
                "setback_dimensions": False,
                "plan_status_recorded": True,
                "project_semantics_clear": True,
                "state": "COMPLIANCE_GEOMETRY_NOT_READY",
                "scope": "SITE_WALL_GEOMETRY_READY; BUILDING_SETBACK_GEOMETRY_NOT_READY",
            },
            "facts": [
                fact(fact_id="p41-wall-linear-feet", project_id="PRJ-1140985", subject="PROPOSED_PROJECT_FACT", value=557, unit="linear_ft", sheet_number="T-1", sheet_title="Title Sheet / Architectural Site Plan - Site Wall Locations", pdf_page=1, callout="construction approximately 557 linear feet of site walls", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="CITY_ISSUED_PLAN", source_path=WALL_SOURCE, source_sha256=wall_sha),
                fact(fact_id="p41-wall-height-range", project_id="PRJ-1140985", subject="PROPOSED_PROJECT_FACT", value={"min": "1'-2\"", "max": "9'-3\""}, unit="ft-in", sheet_number="T-1", sheet_title="Title Sheet / Architectural Site Plan - Site Wall Locations", pdf_page=1, callout="walls ranging in heights of 1'-2\" to 9'-3\"", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="CITY_ISSUED_PLAN", source_path=WALL_SOURCE, source_sha256=wall_sha),
                fact(fact_id="p41-wall-area", project_id="PRJ-1140985", subject="PROPOSED_PROJECT_FACT", value=2619.6, unit="sq_ft_projected_wall_area", sheet_number="T-1", sheet_title="Title Sheet / Architectural Site Plan - Site Wall Locations", pdf_page=1, callout="TOTAL AREA OF WALL PROPOSE ... EQUAL 2,619.6 S.F.", method="DIRECT_LABELED_PLAN_DIMENSION", source_state="CITY_ISSUED_PLAN", source_path=WALL_SOURCE, source_sha256=wall_sha),
            ],
        },
        {
            "project_id": "PRJ-1110168",
            "address_apn": {"address": "639-659 N 67th Street, San Diego, CA 92114", "apn": "5442140600"},
            "plan_set_identifier": "PRJ-1110168 / PMT-3269275",
            "plan_status": "REFERENCE_SHEETS_EMBEDDED; DIRECT_APPROVAL_STATUS_NOT_INDEPENDENTLY_VERIFIED",
            "plan_date": "REFERENCE_SHEETS_IN_2026_SUBMITTAL",
            "author_design_professional": "Civil Landworks; Rancho Coastal Surveying",
            "scale": {"C-1": "1 inch = 10 feet", "other_civil_sheets": "sheet-specific scales retained"},
            "legal_boundary_reference": "Lot 4, Block 7, Encanto Heights, Map 1063",
            "survey_map_reference": "C-1 topographic survey, Map 1063 and found monuments; not a precise boundary survey",
            "property_lines": "Survey-tied calculated boundary present",
            "building_frame_geometry": None,
            "setback_dimensions": None,
            "structure_footprint": None,
            "gross_floor_area": None,
            "height": None,
            "story_count": None,
            "grading_topography": "Direct topographic contours/spot elevations and grading/civil reference sheets",
            "project_use": "Grading, utilities, erosion control, and public improvements",
            "proposed_units": None,
            "notes_conditions": ["The parent plan says grading/public-improvement approvals were addressed.", "A direct City approval record was not independently reviewed.", "No building compliance conclusion may use these reference sheets alone."],
            "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED",
            "geometry_gate": {
                "property_line_tie": True,
                "building_frame_location": False,
                "setback_dimensions": False,
                "plan_status_recorded": True,
                "project_semantics_clear": True,
                "state": "COMPLIANCE_GEOMETRY_NOT_READY",
                "scope": "GRADING_TOPOGRAPHY_GOLDEN_INPUTS_ONLY",
            },
            "facts": [
                fact(fact_id="p41-grading-legal-description", project_id="PRJ-1110168", subject="PROPOSED_PROJECT_FACT", value="Lot 4, Block 7, Encanto Heights, Map 1063", unit=None, sheet_number="C-1", sheet_title="Topographic Survey", pdf_page=6, callout="LEGAL DESCRIPTION: LOT 4 BLOCK 7 ENCANTO HEIGHTS MAP 1063", method="DIRECT_RECORDED_FACT", source_state="REFERENCE_SURVEY_IN_SUBMITTED_PLAN", source_path=ADU_SOURCE, source_sha256=adu_sha),
                fact(fact_id="p41-grading-reference", project_id="PRJ-1110168", subject="PROPOSED_PROJECT_FACT", value={"project": "PRJ-1110168", "permit": "PMT-3269275"}, unit=None, sheet_number="T-1", sheet_title="Title Sheet", pdf_page=1, callout="GRADING AND R.O.W.: PRJ-1110168 - PMT-3269275", method="DIRECT_LABELED_PLAN_ANNOTATION", source_state="PROJECT_REFERENCE_NOT_DIRECT_STATUS_PROOF", source_path=ADU_SOURCE, source_sha256=adu_sha),
            ],
        },
    ]


def build_outputs() -> dict[str, Any]:
    candidates = candidate_inventory()
    pilot_projects = pilots()
    for project in pilot_projects:
        assert geometry_readiness(project["geometry_gate"]) == project["geometry_gate"]["state"]
    outputs: dict[str, Any] = {
        "contract.json": {
            "schema": "ApprovedPlanGoldenCorpusV0",
            "contract_version": CONTRACT_VERSION,
            "purpose": "Internal deterministic validation of plan extraction and rule-application logic",
            "evidence_doctrine": "PRIVATE_VALIDATION_EVIDENCE",
            "public_truth_replacement": False,
            "scope": {"candidate_count": 5, "selected_project_count": 3, "distinct_properties": 1, "citywide_generalization": False},
            "authorization_classes": ["PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED", "PUBLIC_RECORD", "RESTRICTED_COPY", "UNAUTHORIZED_OR_UNCLEAR"],
            "sheet_priority": {
                "tier_1": ["site plan", "plot plan", "civil site sheet", "grading plan", "boundary/survey plan"],
                "tier_2": ["foundation plan", "architectural site sheet", "roof plan when needed for footprint understanding"],
                "tier_3": ["floor plans", "elevations", "sections", "project data/code analysis sheets"],
            },
            "geometry_semantics": ["legal property line", "surveyed property line", "setback line", "building-frame edge", "roof edge", "wall face", "foundation edge", "eave/projection", "accessory structure", "driveway/hardscape", "lot coverage footprint"],
            "extraction_hierarchy": [
                {"rank": 1, "method": "DIRECT_RECORDED_DIMENSION", "classification": "GOLDEN_EVIDENCE"},
                {"rank": 2, "method": "DIRECT_LABELED_PLAN_DIMENSION", "classification": "GOLDEN_EVIDENCE_IF_CLEAR_AND_GEOMETRY_TIED"},
                {"rank": 3, "method": "SCALE_DERIVED_MEASUREMENT", "classification": "DIAGNOSTIC_ONLY_EVEN_AFTER_REPRODUCTION_VALIDATION"},
                {"rank": 4, "method": "IMAGE_PIXEL_ESTIMATE", "classification": "DIAGNOSTIC_ONLY"},
            ],
            "non_dimensional_fact_methods": ["DIRECT_RECORDED_FACT", "DIRECT_LABELED_PLAN_ANNOTATION"],
            "fact_subjects": ["PROPOSED_PROJECT_FACT", "EXISTING_PARCEL_FACT"],
            "forbidden": ["PUBLISH_PRIVATE_PLAN_CONTENT", "REPLACE_PUBLIC_TRUTH", "PROMOTE_PROPOSED_TO_EXISTING", "CITYWIDE_GENERALIZATION", "PRODUCTION_WIRING", "CAPACITY_CALCULATION"],
        },
        "candidate-inventory.json": {"contract_version": CONTRACT_VERSION, "candidates": candidates},
        "manifest.json": {
            "contract_version": CONTRACT_VERSION,
            "storage": {
                "source_root": "/Users/ops/Google Drive/My Drive/TruLot",
                "bounded_external_manifest": "/Users/ops/trulot-data/golden-plan-corpus-v0/source-manifest.json",
                "private_files_in_git": False,
                "repository_content": ["manifests", "hashes", "bounded extracted facts", "tests", "non-sensitive documentation"],
            },
            "selected_projects": [
                {"project_id": "PRJ-1111087", "source_path": ADU_SOURCE, "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12", "included_sheets": ["T-1", "C-1", "A0.1"], "excluded_sheets": "All sheets not necessary for bounded title/survey/site-plan facts", "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED", "evidence_families": ["parcel identity", "boundary", "setback geometry", "footprint", "height", "FAR inputs", "units", "project scope"]},
                {"project_id": "PRJ-1140985", "source_path": WALL_SOURCE, "source_sha256": "7b682112c7495bd01569071059c7ea61f381f13a65862f37d0aab083715faf17", "included_sheets": ["T-1", "C-1", "SW-0"], "excluded_sheets": "Structural details and unrelated administrative fields", "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED", "evidence_families": ["parcel identity", "boundary", "site-wall geometry", "height", "grading reference", "project scope"]},
                {"project_id": "PRJ-1110168", "source_path": ADU_SOURCE, "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12", "included_sheets": ["T-1 project reference", "C-1", "G001-C005 reference sheets as needed"], "excluded_sheets": "Building sheets and all unneeded pages", "privacy_classification": "PRIVATE_OPERATOR_OWNED_OR_AUTHORIZED", "evidence_families": ["legal description", "boundary/survey", "grading/topography", "civil project linkage"]},
            ],
            "excluded_sources": [
                {"source_path": INSPECTION_SOURCE, "source_sha256": "84708d9a62343b8fc43b6373084eadec2039878c31f3b9398fa598dfe74bd30a", "reason": "Administrative inspection evidence contains personal contact fields; issuance is established by the stamped plan set."},
                {"source_path": UTAH_SOURCE, "source_sha256": "18e386da9876ba9c354478ece8c3c300518f2e523fdffc36bb27a57caa78f97e", "reason": "Correspondence only; no plan set."},
                {"source_path": MEADE_SOURCE, "source_sha256": "9cd23d05d5b01a722b751c53d560811244ad3f0b016b134d741478938d929fdc", "reason": "Correspondence only; no plan set."},
            ],
            "expected_outputs": ["bounded project facts", "sheet provenance", "geometry readiness", "public-intelligence comparison", "evaluator compatibility"],
        },
        "pilot-extractions.json": {"contract_version": CONTRACT_VERSION, "projects": pilot_projects},
        "public-intelligence-comparison.json": {
            "contract_version": CONTRACT_VERSION,
            "apn": "5442140600",
            "repository_public_record_found": False,
            "comparison_scope": "Repository-local public-intelligence artifacts only; no production access",
            "dimensions": [
                {"dimension": "parcel identity", "classification": "PUBLIC_SOURCE_INCOMPLETE", "public_state": "No repository fixture for APN", "plan_state": "Address/APN directly labeled", "truth_action": "Do not overwrite public identity; queue independent reconciliation"},
                {"dimension": "zoning", "classification": "PLAN_ADDS_PROJECT_SPECIFIC_FACT", "public_state": "No repository comparator", "plan_state": "RM-2-5 labeled", "truth_action": "Keep as plan-provided until authoritative zoning lookup"},
                {"dimension": "Coastal state", "classification": "UNRESOLVED", "public_state": "No repository comparator", "plan_state": "No bounded Coastal determination", "truth_action": "Remain unknown"},
                {"dimension": "legal-lot evidence", "classification": "PLAN_ADDS_PROJECT_SPECIFIC_FACT", "public_state": "No repository comparator", "plan_state": "Lot 4 Block 7 Encanto Heights Map 1063", "truth_action": "Treat as plan evidence pending recorded-map reconciliation"},
                {"dimension": "lot dimensions", "classification": "PLAN_ADDS_PROJECT_SPECIFIC_FACT", "public_state": "No repository comparator", "plan_state": "Survey/site-plan dimensions present with calculated-boundary disclaimer", "truth_action": "Use for project validation with disclaimer; do not promote to legal-lot truth"},
                {"dimension": "setback rule requirements", "classification": "SEMANTIC_MISMATCH", "public_state": "Existing sealed evaluators cover RS-1-7 APN 6341302200", "plan_state": "Plan notes/dimensions concern RM-2-5/ADU project", "truth_action": "Require independent RM-2-5 rule contract before compliance"},
                {"dimension": "structure facts", "classification": "PLAN_ADDS_PROJECT_SPECIFIC_FACT", "public_state": "No repository comparator", "plan_state": "Proposed project geometry, areas, height, units", "truth_action": "Keep proposed facts separate from existing parcel facts"},
                {"dimension": "feasibility summary", "classification": "UNRESOLVED", "public_state": "No corpus-parcel summary", "plan_state": "No overall compliance or capacity conclusion", "truth_action": "Do not compose until rules and gates are independently sealed"},
            ],
        },
        "validation-cases.json": {
            "contract_version": CONTRACT_VERSION,
            "cases": [
                {"rule_family": "minimum lot area", "project_id": "PRJ-1111087", "input": "20,084.0 sq ft plan-provided lot area", "expected": "PLAN_INPUT_CAPTURED_RULE_EVALUATION_DEFERRED"},
                {"rule_family": "lot width", "project_id": "PRJ-1111087", "input": "survey/site-plan boundary dimensions with disclaimer", "expected": "PLAN_INPUT_CAPTURED_LEGAL_MEASUREMENT_UNRESOLVED"},
                {"rule_family": "lot depth", "project_id": "PRJ-1111087", "input": "199.59 ft and 202.60 ft long property lines", "expected": "PLAN_INPUT_CAPTURED_LINE_ROLE_CONFIRMATION_REQUIRED"},
                {"rule_family": "frontage", "project_id": "PRJ-1111087", "input": "property line/street tie shown", "expected": "PLAN_INPUT_CAPTURED_CODE_FRONTAGE_MEASUREMENT_UNRESOLVED"},
                {"rule_family": "front setback", "project_id": "PRJ-1111087", "input": "proposed site plan geometry", "expected": "GEOMETRY_READY_RULE_REQUIREMENT_UNRESOLVED"},
                {"rule_family": "rear setback", "project_id": "PRJ-1111087", "input": "proposed rear-yard line and building frames", "expected": "GEOMETRY_READY_RULE_REQUIREMENT_UNRESOLVED"},
                {"rule_family": "interior side setback", "project_id": "PRJ-1111087", "input": "direct 4 ft ADU setback label", "expected": "GOLDEN_DIMENSION_READY_RULE_REQUIREMENT_UNRESOLVED"},
                {"rule_family": "street-side applicability", "project_id": "PRJ-1111087", "input": "survey/property-line/street geometry", "expected": "LINE_ROLE_ADAPTER_REQUIRED"},
                {"rule_family": "height", "project_id": "PRJ-1111087", "input": "40 ft plan project-data maximum", "expected": "PROPOSED_PROJECT_FACT_READY_RULE_COMPARISON_DEFERRED"},
                {"rule_family": "FAR", "project_id": "PRJ-1111087", "input": "22,219.6 / 20,084 = 1.10", "expected": "PROPOSED_PROJECT_FACT_READY_RULE_COMPARISON_DEFERRED"},
                {"rule_family": "lot coverage", "project_id": "PRJ-1111087", "input": "building frames present but coverage denominator/semantics not extracted", "expected": "NOT_READY_MISSING_COVERAGE_SEMANTICS"},
            ],
        },
        "evaluator-compatibility.json": {
            "contract_version": CONTRACT_VERSION,
            "overall": "SHARED_FRAMEWORK_REUSABLE_PACKET_SPECIFIC_ADAPTER_REQUIRED",
            "architectural_change_to_shared_framework_required": False,
            "missing_abstraction": "PlanFactEnvelope / ProjectEvidenceAdapter carrying APN, zone/rule profile, proposed-vs-existing subject, approval status, legal line role, geometry semantic, direct dimension, and sheet provenance",
            "assessments": [
                {"evaluator": "front setback", "shared_numeric_gate_compatible": True, "current_adapter_compatible": False, "reason": "Resolver is sealed to APN 6341302200, RS-1-7, outside-Coastal sources, and current-structure geometry; corpus is APN 5442140600, RM-2-5, unknown Coastal, proposed geometry."},
                {"evaluator": "rear setback", "shared_numeric_gate_compatible": True, "current_adapter_compatible": False, "reason": "Parcel/rule/depth inputs are fixture-sealed and project facts need an explicit proposed-plan adapter."},
                {"evaluator": "interior side setback", "shared_numeric_gate_compatible": True, "current_adapter_compatible": False, "reason": "Direct dimension is usable, but RM/ADU rule selection and line-role mapping are not sealed."},
                {"evaluator": "street-side applicability", "shared_numeric_gate_compatible": True, "current_adapter_compatible": False, "reason": "Current line-fact helper hard-codes PM 17383 and 27th Street; corpus requires sheet-provenanced line-role facts."},
                {"evaluator": "structure geometry gate", "shared_numeric_gate_compatible": True, "current_adapter_compatible": False, "reason": "Existing gates require current structure geometry; corpus deliberately supplies proposed project geometry."},
            ],
            "containment": {"compliance_calculated": False, "capacity_calculated": False, "production_wired": False},
        },
        "decision.json": {
            "contract_version": CONTRACT_VERSION,
            "decision": "APPROVED_PLAN_GOLDEN_CORPUS_V0_READY",
            "next_move": "NEXT_FEASIBILITY_STEP: validate setback compliance against approved plans",
            "basis": ["All selected sources are operator-owned or authorized", "Three bounded pilot projects have deterministic sheet provenance", "Direct dimensions and diagnostic measurements are separated", "Proposed project facts remain separate from existing parcel facts", "Evaluator compatibility and the missing adapter are explicit"],
            "limits": ["Single property only", "No simple RS parcel was available in the bounded operator-held source set", "No Coastal determination", "No RM-2-5 compliance conclusion", "No production or public-product integration"],
        },
    }
    outputs["integrity.json"] = build_integrity(outputs)
    return outputs


def write_outputs() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, value in build_outputs().items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


if __name__ == "__main__":
    write_outputs()
