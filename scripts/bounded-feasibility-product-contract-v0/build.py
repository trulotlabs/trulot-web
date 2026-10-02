#!/usr/bin/env python3
"""Build the semantically enforced V2 feasibility presentation contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, INTERNAL_TO_PRODUCT, PRODUCT_STATES, sha256

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "bounded-feasibility-product-contract-v0"

ITEM_KINDS = ["FACT", "RULE", "CONTEXT", "COMPARISON"]
SECTIONS = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"]
SUMMARY_GROUPS = ["MEETS_BASE_RULE", "DOES_NOT_MEET_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_EVALUATED", "MAPPED_CONTEXT", "NOT_APPLICABLE", "SOURCE_UNAVAILABLE", "OUTSIDE_CURRENT_SCOPE"]
COMPARISON_SCOPES = ["PARCEL_RULE", "THIS_DIMENSION_ONLY", "PROJECT_SPECIFIC", "EXISTING_STRUCTURE"]
CONTEXT_STATES = ["MAPPED_VERIFICATION_PENDING", "MAPPED_VERIFIED", "NO_MAPPED_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"]
VERIFICATION_STATES = ["PENDING", "VERIFIED", "NO_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"]
ELIGIBILITY_STATES = ["NOT_EVALUATED", "ELIGIBLE", "NOT_ELIGIBLE", "SOURCE_UNAVAILABLE"]
REGULATORY_USE_STATES = ["NOT_USED_PENDING_VERIFICATION", "CONTEXT_ONLY", "APPLIES", "DOES_NOT_APPLY", "NOT_EVALUATED", "SOURCE_UNAVAILABLE"]
PROJECT_STATUS_CODES = ["SUBMITTAL_ISSUANCE_NOT_PROVEN", "CITY_ISSUED", "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED", "EVIDENCE_REVIEW"]
PROJECT_TOPICS = ["HEIGHT", "FAR", "DEVELOPMENT_CAPACITY", "WHOLE_PROJECT_COMPLIANCE"]
EVIDENCE_TYPES = ["PUBLIC_AUTHORITY", "PUBLIC_MAPPING", "PUBLIC_CODE", "PUBLIC_PARCEL_FACT", "RULE_VERSION", "COMPARISON_INPUT", "MAPPING_OBSERVATION", "BLOCKER_EVIDENCE", "PRIVATE_PLAN_STATUS", "PRIVATE_AUTHORIZED_EVIDENCE", "PRIVATE_PLAN_FACT", "PRIVATE_SURVEY", "PRIVATE_PROJECT_REVIEW", "PRIVACY_NOTICE"]
MEASUREMENT_KINDS = ["EXACT", "DISPLAY", "REQUIREMENT", "FACT"]

TEMPLATES = {
    "FACT_IDENTIFIED": "{name}: {fact}.",
    "MINIMUM_COMPARISON_MEETS": "Meets the {requirement} {name} rule.",
    "MINIMUM_COMPARISON_DOES_NOT_MEET": "Does not meet the {requirement} {name} rule.",
    "CONDITIONAL_CURRENT_RULE": "Current {name}: {requirement}. Additional conditions may still modify this requirement.",
    "CONDITIONAL_BASE_RULE": "Base {name}: {requirement}.",
    "NOT_APPLICABLE": "This rule does not apply to this parcel.",
    "NEEDS_EVIDENCE": "The {name} cannot be evaluated yet because {blocker}.",
    "NOT_EVALUATED": "{name}: not evaluated.",
    "MAPPED_CONTEXT_PENDING": "{name} geometry was detected. Verification is pending.",
    "MAPPED_CONTEXT": "Mapped {name} context is identified.",
    "NO_MAPPED_CONTEXT": "No mapped {name} intersection was identified by the recorded source.",
    "SOURCE_UNAVAILABLE": "{name} cannot be evaluated because its authoritative source is unavailable.",
    "OUTSIDE_CURRENT_SCOPE": "{name} is outside the current evaluation scope.",
    "PROJECT_COMPARISON_MEETS": "The proposed {fact} meets the selected {requirement}. This comparison applies only to this dimension.",
}

BLOCKERS = {
    "CURRENT_SURVEY_STRUCTURE_GEOMETRY": {"missing": "an existing-building setback check needs a current survey tying the building frame to the property lines", "why": "A setback rule by itself does not establish where an existing building sits."},
    "CODE_HEIGHT_ANALYSIS": {"missing": "a project-height check needs a dimensioned height analysis using the City’s required grade and roof measurement rules", "why": "A plan label cannot be compared until its grade, highest point, roof treatment, and angled-plane measurements use the City’s method."},
    "CODE_GFA_AND_PREMISES_AREA": {"missing": "a project FAR check needs a floor-area worksheet showing what counts toward FAR and a verified legal premises area", "why": "The counted floor area and legal premises area must both use the applicable City definitions."},
}

RESIDENTIAL_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf"
MEASUREMENT_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf"
ORDINANCE_21618 = "https://docs.sandiego.gov/council_reso_ordinance/rao2023/O-21618.pdf"


def source(ref: str, privacy: str = "PUBLIC_AUTHORITY") -> dict[str, str]:
    return {"artifact": ref, "privacy": privacy}


def measurement(kind: str, value: float, unit: str) -> dict[str, Any]:
    return {"kind": kind, "value": value, "unit": unit}


def evidence(kind: str, label: str, value: str, *, url: str | None = None,
             privacy: str = "PUBLIC_AUTHORITY", source_date: str | None = None,
             measurements: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"type": kind, "label": label, "value": value, "privacy": privacy,
                              "source_date": source_date, "measurements": measurements or []}
    if url:
        result["url"] = url
    return result


def render_template(key: str, values: dict[str, str]) -> str:
    template = TEMPLATES[key]
    required = [part.split("}")[0] for part in template.split("{")[1:]]
    if sorted(values) != sorted(required):
        raise ValueError(f"template values mismatch for {key}")
    return template.format(**values)


def item(item_id: str, *, kind: str, name: str, family: str, section: str,
         template_key: str, template_values: dict[str, str], explanation: str,
         evidence_entries: list[dict[str, Any]], privacy: str = "PUBLIC",
         result_state: str | None = None, comparison_scope: str | None = None,
         display_requirement: str | None = None, display_fact: str | None = None,
         base_requirement: str | None = None, derived_requirement: str | None = None,
         exact_calculation: str | None = None, precision: dict[str, Any] | None = None,
         blocker_code: str | None = None, context_type: str | None = None,
         context_state: str | None = None, mapped_observation: bool | None = None,
         verification_state: str | None = None, eligibility_state: str | None = None,
         regulatory_use_state: str | None = None,
         actions: list[dict[str, str | None]] | None = None) -> dict[str, Any]:
    blocker = {"code": blocker_code, **BLOCKERS[blocker_code]} if blocker_code else None
    return {
        "item_id": item_id, "item_kind": kind, "name": name, "rule_family": family,
        "section": section, "result_state": result_state, "comparison_scope": comparison_scope,
        "template_key": template_key, "template_values": template_values,
        "answer": render_template(template_key, template_values), "explanation": explanation,
        "display_requirement": display_requirement, "display_fact": display_fact,
        "base_requirement": base_requirement, "derived_requirement": derived_requirement,
        "exact_calculation": exact_calculation, "precision": precision,
        "context_type": context_type, "context_state": context_state,
        "mapped_observation": mapped_observation, "verification_state": verification_state,
        "eligibility_state": eligibility_state, "regulatory_use_state": regulatory_use_state,
        "evidence_entries": evidence_entries, "blocker": blocker, "privacy": privacy,
        "actions": actions or [],
    }


def payload(scope: str, privacy: str, subject: dict[str, str], base_facts: list[dict[str, str]],
            project_context: dict[str, Any] | None, overall_state: str,
            items: list[dict[str, Any]], provenance: list[dict[str, str]]) -> dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "scope": scope, "privacy": privacy,
            "subject": subject, "base_facts": base_facts, "project_context": project_context,
            "overall_state": overall_state, "items": items, "actions": [], "provenance": provenance}


def rs_replay() -> dict[str, Any]:
    refs = [source("data/rs-rule-profile-v0/rs-1-7-base-rules.json"), source("data/rs-rule-profile-v0/apn-6341302200-replay.json")]
    common = [
        evidence("PUBLIC_CODE", "Authoritative rule", "San Diego Municipal Code Table 131-04D", url=RESIDENTIAL_CODE, source_date="Effective April 24, 2025"),
        evidence("RULE_VERSION", "Rule profile", "RS-1-7", source_date="Effective April 24, 2025"),
        evidence("PUBLIC_PARCEL_FACT", "Parcel facts", "Recorded public parcel evaluation", source_date="Recorded September 24, 2026"),
    ]

    def compared(i: str, name: str, family: str, req: str, fact: str, explanation: str,
                 inputs: str, values: list[dict[str, Any]]) -> dict[str, Any]:
        return item(i, kind="COMPARISON", name=name, family=family, section="PARCEL_DIMENSIONS",
                    result_state="MEETS_BASE_RULE", comparison_scope="PARCEL_RULE",
                    template_key="MINIMUM_COMPARISON_MEETS", template_values={"requirement": req, "name": name.lower()},
                    explanation=explanation, display_requirement=req, display_fact=fact,
                    evidence_entries=common + [evidence("COMPARISON_INPUT", "Comparison inputs", inputs, source_date="Evaluated October 2, 2026", measurements=values)])

    items = [
        compared("RS17_AREA", "Lot Area", "MINIMUM_LOT_AREA", "5,000 sq ft minimum", "22,096 sq ft Code-defined area", "The supported Code-defined lot area is at least the RS-1-7 base minimum.", "5,000 sq ft minimum; exact Code-defined area 22,096.320 sq ft", [measurement("REQUIREMENT", 5000, "sq ft"), measurement("FACT", 22096.320, "sq ft")]),
        compared("RS17_WIDTH", "Lot Width", "MINIMUM_LOT_WIDTH", "50 ft minimum", "94 ft Code-defined width", "The supported Code-defined lot width is at least the RS-1-7 base minimum.", "50 ft minimum; exact Code-defined width 94.00 ft", [measurement("REQUIREMENT", 50, "ft"), measurement("FACT", 94, "ft")]),
        compared("RS17_DEPTH", "Lot Depth", "MINIMUM_LOT_DEPTH", "95 ft minimum", "235 ft Code-defined depth", "The supported Code-defined lot depth is at least the RS-1-7 base minimum.", "95 ft minimum; exact Code-defined depth 235.02 ft", [measurement("REQUIREMENT", 95, "ft"), measurement("FACT", 235.02, "ft")]),
        compared("RS17_FRONTAGE", "Frontage", "MINIMUM_STREET_FRONTAGE", "50 ft minimum", "94 ft supported frontage", "The supported frontage is at least the selected RS-1-7 base requirement.", "50 ft minimum; exact supported frontage 94.00 ft", [measurement("REQUIREMENT", 50, "ft"), measurement("FACT", 94, "ft")]),
        item("RS17_FRONT", kind="RULE", name="Front setback", family="FRONT_SETBACK", section="SETBACKS", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "front-setback rule", "requirement": "15 ft starting point"}, explanation="Lot slope, cul-de-sac geometry, and project-specific Fire conditions may change the requirement.", display_requirement="15 ft starting point", base_requirement="15 ft table base", evidence_entries=common + [evidence("COMPARISON_INPUT", "Rule input", "15 ft starting point", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 15, "ft")])]),
        item("RS17_REAR", kind="RULE", name="Rear setback", family="REAR_SETBACK", section="SETBACKS", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "calculated rear setback rule", "requirement": "23.5 ft"}, explanation="The RS-1-7 table base is 13 ft, but this lot’s depth triggers the long-lot formula. Additional unresolved conditions may still increase or modify the requirement.", display_requirement="23.5 ft current calculated rule; 13 ft table base", display_fact="235 ft Code-defined lot depth", base_requirement="13 ft", derived_requirement="23.5 ft", exact_calculation="235.02 ft lot depth × 10% = 23.502 ft", precision={"exact_value": 23.502, "display_value": 23.5, "decimal_places": 1, "unit": "ft"}, evidence_entries=common + [evidence("COMPARISON_INPUT", "Selected calculation", "235.02 ft lot depth × 10% = 23.502 ft; displayed as 23.5 ft; 13 ft is the table base", source_date="Evaluated October 2, 2026", measurements=[measurement("FACT", 235.02, "ft"), measurement("EXACT", 23.502, "ft"), measurement("DISPLAY", 23.5, "ft"), measurement("REQUIREMENT", 13, "ft")])]),
        item("RS17_SIDE", kind="RULE", name="Interior-Side setback", family="INTERIOR_SIDE_SETBACK", section="SETBACKS", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "interior-side setback rule", "requirement": "4 ft per side starting point"}, explanation="Additions, side-yard reallocation, projections, and project-specific Fire conditions remain separate.", display_requirement="4 ft ordinary base per side", display_fact="94 ft Code-defined lot width", base_requirement="4 ft", evidence_entries=common + [evidence("COMPARISON_INPUT", "Rule input", "4 ft ordinary base per side; 94 ft Code-defined lot width", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 4, "ft"), measurement("FACT", 94, "ft")])]),
        item("RS17_STREET_SIDE", kind="RULE", name="Street-Side setback", family="STREET_SIDE_SETBACK", section="SETBACKS", result_state="NOT_APPLICABLE", comparison_scope="PARCEL_RULE", template_key="NOT_APPLICABLE", template_values={}, explanation="Recorded line roles establish a single-frontage, non-corner lot without a street-side property line.", display_requirement="5 ft when a street-side property line exists", display_fact="No street-side property line", evidence_entries=common + [evidence("COMPARISON_INPUT", "Parcel condition", "5 ft rule; recorded line roles show no street-side property line", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 5, "ft")])]),
        item("RS17_EXISTING", kind="COMPARISON", name="Existing-Building setbacks", family="EXISTING_STRUCTURE_SETBACKS", section="SETBACKS", result_state="NEEDS_EVIDENCE", comparison_scope="EXISTING_STRUCTURE", template_key="NEEDS_EVIDENCE", template_values={"name": "existing-building setback check", "blocker": BLOCKERS["CURRENT_SURVEY_STRUCTURE_GEOMETRY"]["missing"]}, explanation="A base setback requirement is not an existing-structure compliance result.", blocker_code="CURRENT_SURVEY_STRUCTURE_GEOMETRY", evidence_entries=common + [evidence("BLOCKER_EVIDENCE", "Evidence needed", "Current survey-controlled building-frame geometry", source_date=None)]),
        item("RS17_HEIGHT_PROFILE", kind="RULE", name="Height profile", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "24 ft at applicable setback lines and 30 ft overall"}, explanation="The inward angled plane depends on Code-defined lot width. Project height has not been evaluated.", display_requirement="24 ft at applicable setback lines; 30 ft overall", evidence_entries=common + [evidence("COMPARISON_INPUT", "Rule values", "24 ft at applicable setback lines; 30 ft overall", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 24, "ft"), measurement("REQUIREMENT", 30, "ft")])]),
        item("RS17_FAR_PROFILE", kind="RULE", name="FAR profile", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "the applicable RS lot-area band and any steep-hillside rule"}, explanation="An exact numeric FAR branch cannot be selected from the current parcel evidence.", display_requirement="FAR depends on the applicable RS lot-area band and any steep-hillside rule", evidence_entries=common + [evidence("PUBLIC_CODE", "FAR rule location", "San Diego Municipal Code Table 131-04J", url=RESIDENTIAL_CODE, source_date="Effective April 24, 2025")]),
    ]
    return payload("PUBLIC_PARCEL", "PUBLIC", {"eyebrow": "Public parcel feasibility", "title": "1456 27th St", "detail": "APN 6341302200 · RS-1-7 · Outside Coastal"}, [{"fact_id": "zone", "label": "Base zone identified", "value": "RS-1-7"}, {"fact_id": "coastal", "label": "Coastal context", "value": "Outside Coastal"}, {"fact_id": "scope", "label": "Evidence scope", "value": "Public parcel sources only"}], None, "PARTIAL_EVALUATION", items, refs)


def rm_replay() -> dict[str, Any]:
    refs = [source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json"), source("data/rm-rule-profile-v0/rm-2-5-base-rules.json")]
    rule_source = [evidence("PUBLIC_CODE", "Authoritative rule", "San Diego Municipal Code Table 131-04G", url=RESIDENTIAL_CODE, source_date="Effective May 6, 2023"), evidence("RULE_VERSION", "Rule profile", "RM-2-5", source_date="Effective May 6, 2023"), evidence("PUBLIC_CODE", "Measurement rules", "SDMC Chapter 11, Article 3, Division 2", url=MEASUREMENT_CODE, source_date="Effective May 6, 2023")]
    items = [
        item("RM25_ZONE", kind="FACT", name="Base zone", family="BASE_ZONING", section="BASE_FACTS", template_key="FACT_IDENTIFIED", template_values={"name": "Base zone", "fact": "RM-2-5"}, explanation="The principal public mapped zoning feature is RM-2-5.", display_fact="RM-2-5 mapped zone", evidence_entries=[evidence("PUBLIC_MAPPING", "Mapping source", "SanGIS public zoning mapping", source_date="Acquired September 30, 2026"), evidence("MAPPING_OBSERVATION", "Mapped result", "RM-2-5 principal zone", source_date="Observed September 30, 2026")]),
        item("RM25_BASE_HEIGHT", kind="RULE", name="Height rule", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "40 ft with angled-plane and other applicable conditions"}, explanation="The base profile remains conditional on the identified envelope and overlay conditions.", display_requirement="40 ft maximum with angled-plane and overlay conditions", evidence_entries=rule_source + [evidence("COMPARISON_INPUT", "Rule value", "40 ft maximum with angled-plane and overlay conditions", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 40, "ft")])]),
        item("RM25_PROJECT_HEIGHT", kind="COMPARISON", name="Project height", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="NOT_EVALUATED", comparison_scope="PROJECT_SPECIFIC", template_key="NOT_EVALUATED", template_values={"name": "Project height"}, explanation="A project-specific comparison would require dimensions using the City’s grade, roof, and angled-plane measurement rules.", evidence_entries=rule_source + [evidence("BLOCKER_EVIDENCE", "A comparison would require", "Dimensions using the City’s grade, roof, and angled-plane measurement rules", source_date=None)]),
        item("RM25_BASE_FAR", kind="RULE", name="FAR rule", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "1.35 across the recorded RM-2-5 dwelling-count ranges"}, explanation="The recorded RM-2-5 profile uses the same 1.35 maximum across its listed dwelling-count ranges.", display_requirement="1.35 maximum across recorded dwelling-count ranges", evidence_entries=rule_source + [evidence("COMPARISON_INPUT", "Rule value", "1.35 maximum across recorded dwelling-count ranges", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 1.35, "ratio")])]),
        item("RM25_PROJECT_FAR", kind="COMPARISON", name="Project FAR", family="FAR", section="HEIGHT_FAR", result_state="NOT_EVALUATED", comparison_scope="PROJECT_SPECIFIC", template_key="NOT_EVALUATED", template_values={"name": "Project FAR"}, explanation="A project-specific comparison would require a floor-area worksheet and verified legal premises area.", evidence_entries=rule_source + [evidence("BLOCKER_EVIDENCE", "A comparison would require", "A floor-area worksheet and verified legal premises area", source_date=None)]),
        item("RM25_SDA", kind="CONTEXT", name="Sustainable Development Area (SDA)", family="SDA", section="MAPPED_CONTEXT", template_key="MAPPED_CONTEXT_PENDING", template_values={"name": "Sustainable Development Area (SDA)"}, explanation="A City planning-map intersection was recorded, but the SDA source is still being reconciled. It is not used for a regulatory or eligibility conclusion.", display_fact="Mapped geometry intersects the parcel", context_type="SDA", context_state="MAPPED_VERIFICATION_PENDING", mapped_observation=True, verification_state="PENDING", eligibility_state="NOT_EVALUATED", regulatory_use_state="NOT_USED_PENDING_VERIFICATION", evidence_entries=[evidence("PUBLIC_MAPPING", "Mapped source", "City of San Diego Sustainable Development Area mapping", source_date="Acquired September 30, 2026"), evidence("MAPPING_OBSERVATION", "Mapped geometry", "The recorded source intersects the parcel", source_date="Observed September 30, 2026")]),
        item("RM25_FIRE", kind="CONTEXT", name="Very High Fire Hazard Severity Zone (VHFHSZ)", family="FIRE", section="MAPPED_CONTEXT", template_key="MAPPED_CONTEXT", template_values={"name": "Very High Fire Hazard Severity Zone (VHFHSZ)"}, explanation="The mapped area is context only. Project-specific Fire requirements have not been evaluated.", display_fact="Parcel intersects mapped VHFHSZ geography", context_type="FIRE", context_state="MAPPED_VERIFIED", mapped_observation=True, verification_state="VERIFIED", eligibility_state="NOT_EVALUATED", regulatory_use_state="CONTEXT_ONLY", evidence_entries=[evidence("PUBLIC_MAPPING", "Mapped source", "City of San Diego Fire Hazard Severity Zone Map 2025", source_date="Effective August 30, 2025"), evidence("MAPPING_OBSERVATION", "Mapped result", "Parcel intersects the mapped Very High Fire Hazard Severity Zone", source_date="Observed September 30, 2026")]),
    ]
    return payload("PUBLIC_PARCEL", "PUBLIC", {"eyebrow": "Public parcel feasibility", "title": "639 N 67th St", "detail": "APN 5442140600 · RM-2-5 · Outside Coastal"}, [{"fact_id": "zone", "label": "Base zone identified", "value": "RM-2-5"}, {"fact_id": "coastal", "label": "Coastal context", "value": "Outside Coastal"}, {"fact_id": "scope", "label": "Evidence scope", "value": "Public parcel sources only"}], None, "PARTIAL_EVALUATION", items, refs)


def private_replay() -> dict[str, Any]:
    privacy = "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"
    refs = [source("data/approved-plan-setback-benchmark-v0/benchmark-result.json", "PRIVATE_AUTHORIZED_EVIDENCE"), source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json")]
    project = {"target_id": "private-scope-status", "project_id": "PRJ-1111087", "status_code": "SUBMITTAL_ISSUANCE_NOT_PROVEN", "application_date": "2024-01-29", "code_profile": "Outside Coastal · Ordinance O-21618 · effective May 6, 2023", "privacy_label": "Not for public indexing · no public cache", "not_evaluated": ["HEIGHT", "FAR", "DEVELOPMENT_CAPACITY", "WHOLE_PROJECT_COMPLIANCE"]}
    result = item("PRJ1111087_SIDE", kind="COMPARISON", name="Proposed interior-side setback", family="INTERIOR_SIDE_SETBACK", section="SETBACKS", result_state="MEETS_BASE_RULE", comparison_scope="THIS_DIMENSION_ONLY", template_key="PROJECT_COMPARISON_MEETS", template_values={"fact": "5 ft 11-1/2 in enclosed-ADU frame setback", "requirement": "4 ft interior-side setback rule"}, explanation="This dimension only: Building 1’s north enclosed-ADU frame is compared with the identified rule. This does not establish project compliance, approval, or issuance.", display_requirement="4 ft selected application-date minimum", display_fact="5 ft 11-1/2 in proposed enclosed-ADU frame setback", evidence_entries=[evidence("PRIVATE_PLAN_STATUS", "Plan status", "Fourth construction-document submittal; issuance not proven", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date="Application recorded January 29, 2024"), evidence("PRIVATE_PLAN_FACT", "Private plan fact", "Architectural Site Plan A0.1, page 15", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date="Application recorded January 29, 2024"), evidence("PUBLIC_CODE", "Applicable rule", "Outside Coastal · Ordinance O-21618", url=ORDINANCE_21618, source_date="Effective May 6, 2023"), evidence("COMPARISON_INPUT", "Comparison inputs", "5 ft 11-1/2 in proposed enclosed-ADU frame setback; 4 ft selected minimum", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date="Evaluated October 2, 2026", measurements=[measurement("FACT", 5, "ft plus 11-1/2 in"), measurement("REQUIREMENT", 4, "ft")]), evidence("PRIVACY_NOTICE", "Privacy", "Private authorized evidence · excluded from public caching and indexing", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None)], privacy=privacy)
    return payload("PRIVATE_PROJECT", privacy, {"eyebrow": "Private project analysis", "title": "PRJ-1111087", "detail": "APN 5442140600 · Not for public indexing"}, [], project, "PARTIAL_EVALUATION", [result], refs)


def blocked_replay() -> dict[str, Any]:
    privacy = "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"
    refs = [source("data/rm-rule-profile-v0/packet-50-replay.json", "PRIVATE_AUTHORIZED_EVIDENCE")]
    public_rule = [evidence("PUBLIC_CODE", "Authoritative rule", "San Diego Municipal Code Table 131-04G", url=RESIDENTIAL_CODE, source_date="Effective May 6, 2023"), evidence("RULE_VERSION", "Rule profile", "RM-2-5 application profile", source_date="Effective May 6, 2023")]
    height_private = public_rule + [evidence("PRIVATE_PROJECT_REVIEW", "Project review status", "Height evidence remains under review", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None), evidence("PRIVATE_PLAN_FACT", "Private plan fact", "The plan labels 40 ft, but its measurement method has not been reconciled to the City’s rules", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None), evidence("COMPARISON_INPUT", "Unverified comparison input", "Plan label: 40 ft; City measurement reconciliation pending", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None, measurements=[measurement("FACT", 40, "ft")]), evidence("BLOCKER_EVIDENCE", "Evidence needed", "Dimensioned grade, highest-point, roof-treatment, and angled-plane analysis", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None)]
    far_private = public_rule + [evidence("PRIVATE_PROJECT_REVIEW", "Project review status", "FAR evidence remains under review", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None), evidence("PRIVATE_PLAN_FACT", "Private plan fact", "The plan labels FAR 1.10, but the counted floor area and premises area are not independently verified", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None), evidence("COMPARISON_INPUT", "Unverified comparison input", "Plan label: FAR 1.10; counted floor area and premises area pending", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None, measurements=[measurement("FACT", 1.10, "ratio")]), evidence("BLOCKER_EVIDENCE", "Evidence needed", "Code-compatible floor-area worksheet and verified legal premises area", privacy="PRIVATE_AUTHORIZED_EVIDENCE", source_date=None)]
    items = [
        item("P50_BASE_HEIGHT", kind="RULE", name="Height rule", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "40 ft plus angled-plane conditions"}, explanation="The same conditional RM-2-5 base profile used in the public view applies here.", display_requirement="40 ft plus angled-plane conditions", evidence_entries=public_rule + [evidence("COMPARISON_INPUT", "Rule value", "40 ft plus angled-plane conditions", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 40, "ft")])], privacy=privacy),
        item("P50_PROJECT_HEIGHT", kind="COMPARISON", name="Project height", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="NEEDS_EVIDENCE", comparison_scope="PROJECT_SPECIFIC", template_key="NEEDS_EVIDENCE", template_values={"name": "project-height check", "blocker": BLOCKERS["CODE_HEIGHT_ANALYSIS"]["missing"]}, explanation="The plan’s labelled height cannot be compared yet because its measurement method has not been reconciled to the City’s height rules.", display_fact="Needs evidence", blocker_code="CODE_HEIGHT_ANALYSIS", evidence_entries=height_private, privacy=privacy),
        item("P50_BASE_FAR", kind="RULE", name="FAR rule", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "1.35 selected maximum"}, explanation="The same conditional RM-2-5 base profile used in the public view applies here.", display_requirement="1.35 selected maximum", evidence_entries=public_rule + [evidence("COMPARISON_INPUT", "Rule value", "1.35 selected maximum", source_date="Evaluated October 2, 2026", measurements=[measurement("REQUIREMENT", 1.35, "ratio")])], privacy=privacy),
        item("P50_PROJECT_FAR", kind="COMPARISON", name="Project FAR", family="FAR", section="HEIGHT_FAR", result_state="NEEDS_EVIDENCE", comparison_scope="PROJECT_SPECIFIC", template_key="NEEDS_EVIDENCE", template_values={"name": "project FAR check", "blocker": BLOCKERS["CODE_GFA_AND_PREMISES_AREA"]["missing"]}, explanation="The plan’s counted floor area and legal premises area have not yet been independently verified.", display_fact="Needs evidence", blocker_code="CODE_GFA_AND_PREMISES_AREA", evidence_entries=far_private, privacy=privacy),
    ]
    project = {"target_id": "private-evidence-status", "project_id": "PRJ-1111087", "status_code": "EVIDENCE_REVIEW", "application_date": None, "code_profile": "RM-2-5 application profile", "privacy_label": "Not for public indexing · no public cache", "not_evaluated": ["WHOLE_PROJECT_COMPLIANCE"]}
    return payload("PRIVATE_PROJECT", privacy, {"eyebrow": "Evidence review", "title": "PRJ-1111087", "detail": "Private project comparison · Not for public indexing"}, [], project, "MORE_EVIDENCE_NEEDED", items, refs)


def schema() -> dict[str, Any]:
    nullable_string = {"type": ["string", "null"]}
    return {
        "$schema": "http://json-schema.org/draft-07/schema#", "$id": "trulot://schemas/bounded-feasibility-product-contract-v2",
        "title": "Bounded Feasibility Product Contract V2", "type": "object", "additionalProperties": False,
        "required": ["contract_version", "scope", "privacy", "subject", "base_facts", "project_context", "overall_state", "items", "actions", "provenance"],
        "properties": {
            "contract_version": {"const": CONTRACT_VERSION}, "scope": {"enum": ["PUBLIC_PARCEL", "PRIVATE_PROJECT", "EXISTING_STRUCTURE"]}, "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]},
            "subject": {"$ref": "#/definitions/subject"}, "base_facts": {"type": "array", "items": {"$ref": "#/definitions/baseFact"}}, "project_context": {"anyOf": [{"type": "null"}, {"$ref": "#/definitions/projectContext"}]},
            "overall_state": {"enum": ["BASE_PARCEL_RULES_EVALUATED", "PARTIAL_EVALUATION", "MORE_EVIDENCE_NEEDED", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"]}, "items": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/item"}}, "actions": {"type": "array", "items": {"$ref": "#/definitions/action"}}, "provenance": {"type": "array", "items": {"$ref": "#/definitions/source"}},
        },
        "definitions": {
            "subject": {"type": "object", "additionalProperties": False, "required": ["eyebrow", "title", "detail"], "properties": {"eyebrow": {"type": "string", "minLength": 1}, "title": {"type": "string", "minLength": 1}, "detail": {"type": "string", "minLength": 1}}},
            "baseFact": {"type": "object", "additionalProperties": False, "required": ["fact_id", "label", "value"], "properties": {"fact_id": {"type": "string", "minLength": 1}, "label": {"type": "string", "minLength": 1}, "value": {"type": "string", "minLength": 1}}},
            "source": {"type": "object", "additionalProperties": False, "required": ["artifact", "privacy"], "properties": {"artifact": {"type": "string", "minLength": 1}, "privacy": {"enum": ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"]}}},
            "measurement": {"type": "object", "additionalProperties": False, "required": ["kind", "value", "unit"], "properties": {"kind": {"enum": MEASUREMENT_KINDS}, "value": {"type": "number"}, "unit": {"type": "string", "minLength": 1}}},
            "evidenceEntry": {"type": "object", "additionalProperties": False, "required": ["type", "label", "value", "privacy", "source_date", "measurements"], "properties": {"type": {"enum": EVIDENCE_TYPES}, "label": {"type": "string", "minLength": 1}, "value": {"type": "string", "minLength": 1}, "url": {"type": "string", "minLength": 1}, "privacy": {"enum": ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"]}, "source_date": nullable_string, "measurements": {"type": "array", "items": {"$ref": "#/definitions/measurement"}}}},
            "blocker": {"type": "object", "additionalProperties": False, "required": ["code", "missing", "why"], "properties": {"code": {"type": "string", "minLength": 1}, "missing": {"type": "string", "minLength": 1}, "why": {"type": "string", "minLength": 1}}},
            "precision": {"type": "object", "additionalProperties": False, "required": ["exact_value", "display_value", "decimal_places", "unit"], "properties": {"exact_value": {"type": "number"}, "display_value": {"type": "number"}, "decimal_places": {"type": "integer", "minimum": 0, "maximum": 6}, "unit": {"type": "string", "minLength": 1}}},
            "action": {"type": "object", "additionalProperties": False, "required": ["type", "label", "destination"], "properties": {"type": {"enum": ["LINK", "INSTRUCTION"]}, "label": {"type": "string", "minLength": 1}, "destination": nullable_string}},
            "projectContext": {"type": "object", "additionalProperties": False, "required": ["target_id", "project_id", "status_code", "application_date", "code_profile", "privacy_label", "not_evaluated"], "properties": {"target_id": {"type": "string", "minLength": 1}, "project_id": {"type": "string", "minLength": 1}, "status_code": {"enum": PROJECT_STATUS_CODES}, "application_date": nullable_string, "code_profile": {"type": "string", "minLength": 1}, "privacy_label": {"type": "string", "minLength": 1}, "not_evaluated": {"type": "array", "items": {"enum": PROJECT_TOPICS}, "uniqueItems": True}}},
            "item": {"type": "object", "additionalProperties": False, "required": ["item_id", "item_kind", "name", "rule_family", "section", "result_state", "comparison_scope", "template_key", "template_values", "answer", "explanation", "display_requirement", "display_fact", "base_requirement", "derived_requirement", "exact_calculation", "precision", "context_type", "context_state", "mapped_observation", "verification_state", "eligibility_state", "regulatory_use_state", "evidence_entries", "blocker", "privacy", "actions"], "properties": {
                "item_id": {"type": "string", "minLength": 1}, "item_kind": {"enum": ITEM_KINDS}, "name": {"type": "string", "minLength": 1}, "rule_family": {"type": "string", "minLength": 1}, "section": {"enum": SECTIONS}, "result_state": {"type": ["string", "null"], "enum": sorted(PRODUCT_STATES) + [None]}, "comparison_scope": {"type": ["string", "null"], "enum": COMPARISON_SCOPES + [None]}, "template_key": {"enum": sorted(TEMPLATES)}, "template_values": {"type": "object", "additionalProperties": {"type": "string"}}, "answer": {"type": "string", "minLength": 1}, "explanation": {"type": "string", "minLength": 1},
                "display_requirement": nullable_string, "display_fact": nullable_string, "base_requirement": nullable_string, "derived_requirement": nullable_string, "exact_calculation": nullable_string, "precision": {"anyOf": [{"type": "null"}, {"$ref": "#/definitions/precision"}]}, "context_type": nullable_string, "context_state": {"type": ["string", "null"], "enum": CONTEXT_STATES + [None]}, "mapped_observation": {"type": ["boolean", "null"]}, "verification_state": {"type": ["string", "null"], "enum": VERIFICATION_STATES + [None]}, "eligibility_state": {"type": ["string", "null"], "enum": ELIGIBILITY_STATES + [None]}, "regulatory_use_state": {"type": ["string", "null"], "enum": REGULATORY_USE_STATES + [None]}, "evidence_entries": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/evidenceEntry"}}, "blocker": {"anyOf": [{"type": "null"}, {"$ref": "#/definitions/blocker"}]}, "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]}, "actions": {"type": "array", "items": {"$ref": "#/definitions/action"}},
            }},
        },
        "validation_order": ["STRUCTURAL_SCHEMA", "SEMANTIC_INVARIANTS", "PRIVACY", "DETERMINISTIC_TEMPLATE", "EVIDENCE_CONSISTENCY"],
    }


def doctrinal_outputs() -> dict[str, Any]:
    return {
        "scope.json": {"contract_version": CONTRACT_VERSION, "matrix": {"PUBLIC_PARCEL": "PUBLIC only; no project context or private evidence", "PRIVATE_PROJECT": "PRIVATE only; project context required", "EXISTING_STRUCTURE": "PRIVATE only; project context required"}, "outside_scope": ["development capacity", "whole-project compliance"]},
        "states.json": {"contract_version": CONTRACT_VERSION, "product_states": sorted(PRODUCT_STATES), "context_states": CONTEXT_STATES, "verification_states": VERIFICATION_STATES, "eligibility_states": ELIGIBILITY_STATES, "regulatory_use_states": REGULATORY_USE_STATES, "internal_mapping": INTERNAL_TO_PRODUCT},
        "overall-state.json": {"contract_version": CONTRACT_VERSION, "rule": "Overall state is derived from validated item, context, blocker, and project-topic states."},
        "rule-card-contract.json": {"contract_version": CONTRACT_VERSION, "item_kinds": ITEM_KINDS, "sections": SECTIONS, "comparison_scopes": COMPARISON_SCOPES, "producer_authored_badges": False},
        "evidence-blockers.json": {"contract_version": CONTRACT_VERSION, "blockers": [{"code": code, **copy} for code, copy in BLOCKERS.items()]},
        "explainability.json": {"contract_version": CONTRACT_VERSION, "levels": ["ANSWER", "EXPLANATION", "EVIDENCE"], "rule": "Every conclusion retains typed, privacy-checked evidence."},
        "language-doctrine.json": {"contract_version": CONTRACT_VERSION, "avoid_in_product_copy": ["replay", "Packet", "raw acquisition identifier", "internal MapServer language", "unexplained unit band"], "no_numeric_confidence": True},
        "program-overlay-states.json": {"contract_version": CONTRACT_VERSION, "context_matrix": {"MAPPED_VERIFICATION_PENDING": [True, "PENDING", "NOT_EVALUATED", "NOT_USED_PENDING_VERIFICATION"], "MAPPED_VERIFIED": [True, "VERIFIED", "NOT_EVALUATED|ELIGIBLE|NOT_ELIGIBLE", "CONTEXT_ONLY|APPLIES|DOES_NOT_APPLY"], "NO_MAPPED_INTERSECTION": [False, "NO_INTERSECTION", "NOT_EVALUATED", "CONTEXT_ONLY"], "SOURCE_UNAVAILABLE": [None, "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE", "SOURCE_UNAVAILABLE"], "NOT_EVALUATED": [None, "NOT_EVALUATED", "NOT_EVALUATED", "NOT_EVALUATED"]}},
        "rule-family-contracts.json": {"contract_version": CONTRACT_VERSION, "height_far": "Base rules and project comparisons are separate items.", "setbacks": "Derived requirements include structured precision evidence."},
        "summary-contract.json": {"contract_version": CONTRACT_VERSION, "groups": SUMMARY_GROUPS, "source": "Derived from validated item and project semantics; no producer-authored group or label."},
        "actions.json": {"contract_version": CONTRACT_VERSION, "types": ["LINK", "INSTRUCTION"]},
        "indexing-doctrine.json": {"contract_version": CONTRACT_VERSION, "cache_rule": "Private scopes never enter public generation, indexing, metadata, or shared caches."},
        "public-private-boundary.json": {"contract_version": CONTRACT_VERSION, "hard_invariant": "Evidence type and scope determine privacy; a producer privacy tag cannot downgrade private evidence."},
        "prohibited-statements.json": {"contract_version": CONTRACT_VERSION, "denylist": ["This property is buildable", "You can build X units", "This project complies with zoning", "The existing structure is legal", "The property qualifies for ADU bonus", "Height complies", "FAR complies"]},
        "renderer-contract.json": {"contract_version": CONTRACT_VERSION, "templates": TEMPLATES, "free_form_conclusion_generation": False, "unknown_template_behavior": "REJECT", "project_status_labels": {"SUBMITTAL_ISSUANCE_NOT_PROVEN": "Fourth construction-document submittal — issuance not proven", "CITY_ISSUED": "City-issued record", "REFERENCE_SHEETS_APPROVAL_NOT_VERIFIED": "Reference-sheet approval not verified", "EVIDENCE_REVIEW": "Private height and FAR evidence review"}, "copy_versioned": True},
    }


def build_outputs() -> dict[str, Any]:
    outputs = doctrinal_outputs()
    outputs.update({"schema.json": schema(), "public-rs-replay.json": rs_replay(), "public-rm-replay.json": rm_replay(), "private-project-replay.json": private_replay(), "blocked-project-replay.json": blocked_replay(), "examples.json": {"contract_version": CONTRACT_VERSION, "examples": [{"view": "rs", "artifact": "public-rs-replay.json"}, {"view": "rm", "artifact": "public-rm-replay.json"}, {"view": "private", "artifact": "private-project-replay.json"}, {"view": "blocked", "artifact": "blocked-project-replay.json"}]}, "provenance.json": {"contract_version": CONTRACT_VERSION, "production_access": False, "public_private_separation_preserved": True}, "decision.json": {"contract_version": CONTRACT_VERSION, "readiness": "FEASIBILITY_CONTRACT_SEMANTICALLY_ENFORCED_AND_INTEGRATION_SAFE", "next": "NEXT_FEASIBILITY_STEP: final external verification", "production_wired": False, "capacity_calculated": False}})
    outputs["integrity.json"] = {"contract_version": CONTRACT_VERSION, "algorithm": "SHA-256 of canonical JSON with final newline", "files": {name: sha256(value) for name, value in sorted(outputs.items())}}
    return outputs


def write_outputs() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = build_outputs()
    for path in OUTPUT.glob("*.json"):
        if path.name not in outputs:
            path.unlink()
    for name, value in outputs.items():
        (OUTPUT / name).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    write_outputs()
