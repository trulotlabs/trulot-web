#!/usr/bin/env python3
"""Build the versioned, contract-driven feasibility presentation artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from resolver import CONTRACT_VERSION, INTERNAL_TO_PRODUCT, PRODUCT_STATES, sha256

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data" / "bounded-feasibility-product-contract-v0"

ITEM_KINDS = ["FACT", "RULE", "CONTEXT", "COMPARISON"]
SECTIONS = ["BASE_FACTS", "PARCEL_DIMENSIONS", "SETBACKS", "HEIGHT_FAR", "MAPPED_CONTEXT", "EVIDENCE_NEEDED"]
SUMMARY_GROUPS = ["MEETS_BASE_RULE", "CONDITIONAL", "NEEDS_EVIDENCE", "NOT_EVALUATED", "MAPPED_CONTEXT", "NOT_APPLICABLE"]
COMPARISON_SCOPES = ["PARCEL_RULE", "THIS_DIMENSION_ONLY", "PROJECT_SPECIFIC", "EXISTING_STRUCTURE"]
CONTEXT_STATES = ["MAPPED_VERIFICATION_PENDING", "MAPPED_VERIFIED", "NO_MAPPED_INTERSECTION", "SOURCE_UNAVAILABLE", "NOT_EVALUATED"]
EVIDENCE_TYPES = ["PUBLIC_SOURCE", "RULE_CITATION", "VERSION", "PARCEL_FACT", "COMPARISON_INPUT", "MAPPING_OBSERVATION", "MAPPING_RECEIPT", "BLOCKER_EVIDENCE", "PRIVATE_PLAN_STATUS", "PRIVACY"]

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
    "PROJECT_COMPARISON_MEETS": "The proposed {fact} meets the selected {requirement}. This comparison applies only to this dimension.",
}

BLOCKERS = {
    "CURRENT_SURVEY_STRUCTURE_GEOMETRY": {
        "missing": "an existing-building setback check needs a current survey tying the building frame to the property lines",
        "why": "A setback rule by itself does not establish where an existing building sits.",
    },
    "CODE_HEIGHT_ANALYSIS": {
        "missing": "a project-height check needs a dimensioned height analysis using the City’s required grade and roof measurement rules",
        "why": "A plan label cannot be compared until its grade, highest point, roof treatment, and angled-plane measurements use the City’s method.",
    },
    "CODE_GFA_AND_PREMISES_AREA": {
        "missing": "a project FAR check needs a floor-area worksheet showing what counts toward FAR and a verified legal premises area",
        "why": "The counted floor area and legal premises area must both use the applicable City definitions.",
    },
    "PROGRAM_ELIGIBILITY_EVIDENCE": {
        "missing": "TruLot has not evaluated this program’s eligibility requirements yet",
        "why": "Mapped geography does not establish program eligibility.",
    },
}

RESIDENTIAL_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf"
MEASUREMENT_CODE = "https://docs.sandiego.gov/municode/MuniCodeChapter11/Ch11Art03Division02.pdf"
ORDINANCE_21618 = "https://docs.sandiego.gov/council_reso_ordinance/rao2023/O-21618.pdf"


def source(ref: str, privacy: str = "PUBLIC_AUTHORITY") -> dict[str, str]:
    return {"artifact": ref, "privacy": privacy}


def evidence(kind: str, label: str, value: str, url: str | None = None,
             privacy: str = "PUBLIC_AUTHORITY") -> dict[str, Any]:
    result: dict[str, Any] = {"type": kind, "label": label, "value": value, "privacy": privacy}
    if url:
        result["url"] = url
    return result


def summary(group: str, label: str) -> dict[str, str]:
    return {"group": group, "label": label}


def render_template(key: str, values: dict[str, str]) -> str:
    template = TEMPLATES[key]
    required = [part.split("}")[0] for part in template.split("{")[1:]]
    if sorted(values) != sorted(required):
        raise ValueError(f"template values mismatch for {key}: {values.keys()} != {required}")
    return template.format(**values)


def item(item_id: str, *, kind: str, name: str, family: str, section: str,
         template_key: str, template_values: dict[str, str], explanation: str,
         evidence_entries: list[dict[str, Any]], privacy: str = "PUBLIC",
         result_state: str | None = None, state_label: str,
         summary_entries: list[dict[str, str]] | None = None,
         comparison_scope: str | None = None, display_requirement: str | None = None,
         display_fact: str | None = None, base_requirement: str | None = None,
         derived_requirement: str | None = None, exact_calculation: str | None = None,
         blocker_code: str | None = None, context_type: str | None = None,
         context_state: str | None = None, verification_state: str | None = None,
         eligibility_state: str | None = None, regulatory_use_state: str | None = None,
         actions: list[dict[str, str]] | None = None) -> dict[str, Any]:
    blocker = None
    if blocker_code:
        blocker = {"code": blocker_code, **BLOCKERS[blocker_code]}
    return {
        "item_id": item_id, "item_kind": kind, "name": name, "rule_family": family,
        "section": section, "result_state": result_state, "state_label": state_label,
        "summary_entries": summary_entries or [], "comparison_scope": comparison_scope,
        "template_key": template_key, "template_values": template_values,
        "answer": render_template(template_key, template_values), "explanation": explanation,
        "display_requirement": display_requirement, "display_fact": display_fact,
        "base_requirement": base_requirement, "derived_requirement": derived_requirement,
        "exact_calculation": exact_calculation, "context_type": context_type,
        "context_state": context_state, "verification_state": verification_state,
        "eligibility_state": eligibility_state, "regulatory_use_state": regulatory_use_state,
        "evidence_entries": evidence_entries, "blocker": blocker, "privacy": privacy,
        "actions": actions or [],
    }


def schema() -> dict[str, Any]:
    nullable_string = {"type": ["string", "null"]}
    return {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "trulot://schemas/bounded-feasibility-product-contract-v1",
        "title": "Bounded Feasibility Product Contract V1", "type": "object", "additionalProperties": False,
        "required": ["contract_version", "scope", "privacy", "subject", "base_facts", "project_context", "overall_state", "items", "actions", "provenance"],
        "properties": {
            "contract_version": {"const": CONTRACT_VERSION}, "scope": {"enum": ["PUBLIC_PARCEL", "PRIVATE_PROJECT", "EXISTING_STRUCTURE"]},
            "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]},
            "subject": {"$ref": "#/definitions/subject"}, "base_facts": {"type": "array", "items": {"$ref": "#/definitions/baseFact"}},
            "project_context": {"anyOf": [{"type": "null"}, {"$ref": "#/definitions/projectContext"}]},
            "overall_state": {"enum": ["BASE_PARCEL_RULES_EVALUATED", "PARTIAL_EVALUATION", "MORE_EVIDENCE_NEEDED", "OUTSIDE_CURRENT_SCOPE", "SOURCE_UNAVAILABLE"]},
            "items": {"type": "array", "items": {"$ref": "#/definitions/item"}},
            "actions": {"type": "array", "items": {"$ref": "#/definitions/action"}},
            "provenance": {"type": "array", "items": {"$ref": "#/definitions/source"}},
        },
        "definitions": {
            "subject": {"type": "object", "additionalProperties": False, "required": ["eyebrow", "title", "detail"], "properties": {"eyebrow": {"type": "string"}, "title": {"type": "string"}, "detail": {"type": "string"}}},
            "baseFact": {"type": "object", "additionalProperties": False, "required": ["fact_id", "label", "value"], "properties": {"fact_id": {"type": "string"}, "label": {"type": "string"}, "value": {"type": "string"}}},
            "summaryEntry": {"type": "object", "additionalProperties": False, "required": ["group", "label"], "properties": {"group": {"enum": SUMMARY_GROUPS}, "label": {"type": "string"}}},
            "evidenceEntry": {"type": "object", "additionalProperties": False, "required": ["type", "label", "value", "privacy"], "properties": {"type": {"enum": EVIDENCE_TYPES}, "label": {"type": "string"}, "value": {"type": "string"}, "url": {"type": "string"}, "privacy": {"enum": ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"]}}},
            "blocker": {"type": "object", "additionalProperties": False, "required": ["code", "missing", "why"], "properties": {"code": {"type": "string"}, "missing": {"type": "string"}, "why": {"type": "string"}}},
            "action": {"type": "object", "additionalProperties": False, "required": ["type", "label", "destination"], "properties": {"type": {"enum": ["LINK", "INSTRUCTION"]}, "label": {"type": "string"}, "destination": nullable_string}},
            "projectContext": {"type": "object", "additionalProperties": False, "required": ["target_id", "project_id", "status", "application_date", "code_profile", "privacy_label", "summary_entries", "not_evaluated"], "properties": {"target_id": {"type": "string"}, "project_id": {"type": "string"}, "status": {"type": "string"}, "application_date": {"type": "string"}, "code_profile": {"type": "string"}, "privacy_label": {"type": "string"}, "summary_entries": {"type": "array", "items": {"$ref": "#/definitions/summaryEntry"}}, "not_evaluated": {"type": "array", "items": {"type": "string"}}}},
            "source": {"type": "object", "additionalProperties": False, "required": ["artifact", "privacy"], "properties": {"artifact": {"type": "string"}, "privacy": {"enum": ["PUBLIC_AUTHORITY", "PRIVATE_AUTHORIZED_EVIDENCE"]}}},
            "item": {"type": "object", "additionalProperties": False, "required": ["item_id", "item_kind", "name", "rule_family", "section", "result_state", "state_label", "summary_entries", "comparison_scope", "template_key", "template_values", "answer", "explanation", "display_requirement", "display_fact", "base_requirement", "derived_requirement", "exact_calculation", "context_type", "context_state", "verification_state", "eligibility_state", "regulatory_use_state", "evidence_entries", "blocker", "privacy", "actions"], "properties": {
                "item_id": {"type": "string"}, "item_kind": {"enum": ITEM_KINDS}, "name": {"type": "string"}, "rule_family": {"type": "string"}, "section": {"enum": SECTIONS},
                "result_state": {"type": ["string", "null"], "enum": sorted(PRODUCT_STATES) + [None]}, "state_label": {"type": "string"},
                "summary_entries": {"type": "array", "items": {"$ref": "#/definitions/summaryEntry"}}, "comparison_scope": {"type": ["string", "null"], "enum": COMPARISON_SCOPES + [None]},
                "template_key": {"enum": sorted(TEMPLATES)}, "template_values": {"type": "object", "additionalProperties": {"type": "string"}}, "answer": {"type": "string"}, "explanation": {"type": "string"},
                "display_requirement": nullable_string, "display_fact": nullable_string, "base_requirement": nullable_string, "derived_requirement": nullable_string, "exact_calculation": nullable_string,
                "context_type": nullable_string, "context_state": {"type": ["string", "null"], "enum": CONTEXT_STATES + [None]}, "verification_state": nullable_string, "eligibility_state": nullable_string, "regulatory_use_state": nullable_string,
                "evidence_entries": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/evidenceEntry"}}, "blocker": {"anyOf": [{"type": "null"}, {"$ref": "#/definitions/blocker"}]},
                "privacy": {"enum": ["PUBLIC", "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"]}, "actions": {"type": "array", "items": {"$ref": "#/definitions/action"}},
            }},
        },
        "deterministic_mapping": "Validated item semantics and versioned templates drive every visible state, summary, fact, comparison, blocker, and evidence disclosure.",
    }


def rs_replay() -> dict[str, Any]:
    refs = [source("data/rs-rule-profile-v0/rs-1-7-base-rules.json"), source("data/rs-rule-profile-v0/apn-6341302200-replay.json")]
    common = [evidence("PUBLIC_SOURCE", "Authoritative rule", "San Diego Municipal Code Table 131-04D", RESIDENTIAL_CODE), evidence("VERSION", "Rule profile", "RS-1-7 · effective April 24, 2025"), evidence("PARCEL_FACT", "Parcel facts", "Recorded public parcel evaluation")]
    def compared(i: str, name: str, family: str, req: str, fact: str, explanation: str, inputs: str) -> dict[str, Any]:
        return item(i, kind="COMPARISON", name=name, family=family, section="PARCEL_DIMENSIONS", result_state="MEETS_BASE_RULE", state_label="Meets base rule", summary_entries=[summary("MEETS_BASE_RULE", f"Minimum {name.title()}")], comparison_scope="PARCEL_RULE", template_key="MINIMUM_COMPARISON_MEETS", template_values={"requirement": req, "name": name}, explanation=explanation, display_requirement=req, display_fact=fact, evidence_entries=common + [evidence("COMPARISON_INPUT", "Comparison inputs", inputs)])
    items = [
        compared("RS17_AREA", "lot area", "MINIMUM_LOT_AREA", "5,000 sq ft minimum", "22,096 sq ft Code-defined area", "The supported Code-defined lot area is at least the RS-1-7 base minimum.", "5,000 sq ft minimum; exact Code-defined area 22,096.320 sq ft"),
        compared("RS17_WIDTH", "lot width", "MINIMUM_LOT_WIDTH", "50 ft minimum", "94 ft Code-defined width", "The supported Code-defined lot width is at least the RS-1-7 base minimum.", "50 ft minimum; exact Code-defined width 94.00 ft"),
        compared("RS17_DEPTH", "lot depth", "MINIMUM_LOT_DEPTH", "95 ft minimum", "235 ft Code-defined depth", "The supported Code-defined lot depth is at least the RS-1-7 base minimum.", "95 ft minimum; exact Code-defined depth 235.02 ft"),
        compared("RS17_FRONTAGE", "frontage", "MINIMUM_STREET_FRONTAGE", "50 ft minimum", "94 ft supported frontage", "The supported frontage is at least the selected RS-1-7 base requirement.", "50 ft minimum; exact supported frontage 94.00 ft"),
        item("RS17_FRONT", kind="RULE", name="front-setback rule", family="FRONT_SETBACK", section="SETBACKS", result_state="CONDITIONAL", state_label="Conditional", summary_entries=[summary("CONDITIONAL", "Front setback")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "front-setback rule", "requirement": "15 ft starting point"}, explanation="Lot slope, cul-de-sac geometry, and project-specific Fire conditions may change the requirement.", display_requirement="15 ft starting point", display_fact=None, base_requirement="15 ft table base", evidence_entries=common + [evidence("RULE_CITATION", "Rule location", "Table 131-04D front setback; slope, cul-de-sac, and Fire conditions remain separate")]),
        item("RS17_REAR", kind="RULE", name="calculated rear setback rule", family="REAR_SETBACK", section="SETBACKS", result_state="CONDITIONAL", state_label="Conditional", summary_entries=[summary("CONDITIONAL", "Rear setback")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "calculated rear setback rule", "requirement": "23.5 ft"}, explanation="The RS-1-7 table base is 13 ft, but this lot’s depth triggers the long-lot formula. Additional unresolved conditions may still increase or modify the requirement.", display_requirement="23.5 ft current calculated rule; 13 ft table base", display_fact="235 ft Code-defined lot depth", base_requirement="13 ft", derived_requirement="23.5 ft", exact_calculation="235.02 ft lot depth × 10% = 23.502 ft", evidence_entries=common + [evidence("COMPARISON_INPUT", "Selected calculation", "235.02 ft lot depth × 10% = 23.502 ft; 13 ft is the table base")]),
        item("RS17_SIDE", kind="RULE", name="interior-side setback rule", family="INTERIOR_SIDE_SETBACK", section="SETBACKS", result_state="CONDITIONAL", state_label="Conditional", summary_entries=[summary("CONDITIONAL", "Interior-side setback")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_CURRENT_RULE", template_values={"name": "interior-side setback rule", "requirement": "4 ft per side starting point"}, explanation="Additions, side-yard reallocation, projections, and project-specific Fire conditions remain separate.", display_requirement="4 ft ordinary base per side", display_fact="94 ft Code-defined lot width", base_requirement="4 ft", evidence_entries=common + [evidence("RULE_CITATION", "Rule location", "Table 131-04D interior-side setback")]),
        item("RS17_STREET_SIDE", kind="RULE", name="street-side setback", family="STREET_SIDE_SETBACK", section="SETBACKS", result_state="NOT_APPLICABLE", state_label="Not applicable", summary_entries=[summary("NOT_APPLICABLE", "Street-side setback")], comparison_scope="PARCEL_RULE", template_key="NOT_APPLICABLE", template_values={}, explanation="Recorded line roles establish a single-frontage, non-corner lot without a street-side property line.", display_requirement="5 ft when a street-side property line exists", display_fact="No street-side property line", evidence_entries=common + [evidence("PARCEL_FACT", "Parcel condition", "Recorded line roles show no street-side property line")]),
        item("RS17_EXISTING", kind="COMPARISON", name="existing-building setback check", family="EXISTING_STRUCTURE_SETBACKS", section="SETBACKS", result_state="NEEDS_EVIDENCE", state_label="Needs evidence", summary_entries=[summary("NEEDS_EVIDENCE", "Existing-building setbacks")], comparison_scope="EXISTING_STRUCTURE", template_key="NEEDS_EVIDENCE", template_values={"name": "existing-building setback check", "blocker": BLOCKERS["CURRENT_SURVEY_STRUCTURE_GEOMETRY"]["missing"]}, explanation="A base setback requirement is not an existing-structure compliance result.", display_requirement=None, display_fact=None, blocker_code="CURRENT_SURVEY_STRUCTURE_GEOMETRY", evidence_entries=common + [evidence("BLOCKER_EVIDENCE", "Evidence needed", "Current survey-controlled building-frame geometry")]),
        item("RS17_HEIGHT_PROFILE", kind="RULE", name="height rule", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Conditional", summary_entries=[summary("CONDITIONAL", "Height profile")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "24 ft at applicable setback lines and 30 ft overall"}, explanation="The inward angled plane depends on Code-defined lot width. Project height has not been evaluated.", display_requirement="24 ft at applicable setback lines · 30 ft overall", display_fact=None, evidence_entries=common + [evidence("RULE_CITATION", "Rule location", "SDMC Table 131-04D structure height")]),
        item("RS17_FAR_PROFILE", kind="RULE", name="FAR rule", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Conditional", summary_entries=[summary("CONDITIONAL", "FAR profile")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "the applicable Table 131-04J lot-area rule"}, explanation="The applicable rule depends on Code-defined area and the separate steep-hillside formula. Project FAR has not been evaluated.", display_requirement="Table 131-04J lot-area rule", display_fact=None, evidence_entries=common + [evidence("RULE_CITATION", "Rule location", "SDMC residential development regulations")]),
    ]
    return payload("PUBLIC_PARCEL", "PUBLIC", "6341302200", {"eyebrow": "Public parcel feasibility", "title": "1456 27th St", "detail": "APN 6341302200 · RS-1-7 · Outside Coastal"}, [{"fact_id": "zone", "label": "Base zone identified", "value": "RS-1-7"}, {"fact_id": "coastal", "label": "Coastal context", "value": "Outside Coastal"}, {"fact_id": "scope", "label": "Evidence scope", "value": "Public parcel sources only"}], None, "PARTIAL_EVALUATION", items, refs)


def rm_replay() -> dict[str, Any]:
    refs = [source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json"), source("data/rm-rule-profile-v0/rm-2-5-base-rules.json")]
    rule_source = [evidence("PUBLIC_SOURCE", "Authoritative rule", "San Diego Municipal Code Table 131-04G", RESIDENTIAL_CODE), evidence("VERSION", "Rule profile", "RM-2-5 · effective May 6, 2023"), evidence("RULE_CITATION", "Measurement rules", "SDMC Chapter 11, Article 3, Division 2", MEASUREMENT_CODE)]
    items = [
        item("RM25_ZONE", kind="FACT", name="Base zone", family="BASE_ZONING", section="BASE_FACTS", result_state=None, state_label="Base zone identified", template_key="FACT_IDENTIFIED", template_values={"name": "Base zone", "fact": "RM-2-5"}, explanation="The principal public mapped zoning feature is RM-2-5.", display_requirement=None, display_fact="RM-2-5 mapped zone", evidence_entries=[evidence("PUBLIC_SOURCE", "Mapping source", "SanGIS public zoning mapping"), evidence("MAPPING_OBSERVATION", "Mapped result", "RM-2-5 principal zone")]),
        item("RM25_BASE_HEIGHT", kind="RULE", name="height rule", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Base rule · Conditional", summary_entries=[summary("CONDITIONAL", "Base height rule")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "40 ft with angled-plane and other applicable conditions"}, explanation="The base profile remains conditional on the identified envelope and overlay conditions.", display_requirement="40 ft maximum with angled-plane and overlay conditions", display_fact=None, evidence_entries=rule_source),
        item("RM25_PROJECT_HEIGHT", kind="COMPARISON", name="Project height", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="NOT_EVALUATED", state_label="Not evaluated", summary_entries=[summary("NOT_EVALUATED", "Project height comparison")], comparison_scope="PROJECT_SPECIFIC", template_key="NOT_EVALUATED", template_values={"name": "Project height"}, explanation="A project-specific comparison would require dimensions using the City’s grade, roof, and angled-plane measurement rules.", display_requirement=None, display_fact=None, evidence_entries=rule_source + [evidence("BLOCKER_EVIDENCE", "A comparison would require", "Dimensions using the City’s grade, roof, and angled-plane measurement rules")]),
        item("RM25_BASE_FAR", kind="RULE", name="FAR rule", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Base rule · Conditional", summary_entries=[summary("CONDITIONAL", "Base FAR rule")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "1.35 across the recorded RM-2-5 dwelling-count ranges"}, explanation="The recorded RM-2-5 profile uses the same 1.35 maximum across its listed dwelling-count ranges.", display_requirement="1.35 maximum across recorded dwelling-count ranges", display_fact=None, evidence_entries=rule_source),
        item("RM25_PROJECT_FAR", kind="COMPARISON", name="Project FAR", family="FAR", section="HEIGHT_FAR", result_state="NOT_EVALUATED", state_label="Not evaluated", summary_entries=[summary("NOT_EVALUATED", "Project FAR comparison")], comparison_scope="PROJECT_SPECIFIC", template_key="NOT_EVALUATED", template_values={"name": "Project FAR"}, explanation="A project-specific comparison would require a floor-area worksheet and verified legal premises area.", display_requirement=None, display_fact=None, evidence_entries=rule_source + [evidence("BLOCKER_EVIDENCE", "A comparison would require", "A floor-area worksheet and verified legal premises area")]),
        item("RM25_SDA", kind="CONTEXT", name="Sustainable Development Area (SDA)", family="SDA", section="MAPPED_CONTEXT", result_state="NOT_EVALUATED", state_label="Mapped context", summary_entries=[summary("MAPPED_CONTEXT", "SDA geometry detected; verification pending"), summary("NOT_EVALUATED", "SDA program eligibility")], template_key="MAPPED_CONTEXT_PENDING", template_values={"name": "Sustainable Development Area (SDA)"}, explanation="A City planning-map intersection was recorded, but the SDA source is still being reconciled. It is not used for a regulatory or eligibility conclusion.", display_requirement=None, display_fact="Mapped geometry intersects the parcel", context_type="SDA", context_state="MAPPED_VERIFICATION_PENDING", verification_state="Pending", eligibility_state="Not evaluated", regulatory_use_state="Not used pending verification", evidence_entries=[evidence("MAPPING_OBSERVATION", "Mapped geometry", "City planning data recorded an SDA intersection"), evidence("MAPPING_RECEIPT", "Mapping receipt", "Packet 42 public mapping evidence records the parcel intersection"), evidence("VERSION", "Product status", "SDA source reconciliation pending; not used for a regulatory or eligibility conclusion")]),
        item("RM25_FIRE", kind="CONTEXT", name="Very High Fire Hazard Severity Zone (VHFHSZ)", family="FIRE", section="MAPPED_CONTEXT", result_state="NOT_EVALUATED", state_label="Mapped context", summary_entries=[summary("MAPPED_CONTEXT", "Very High Fire Hazard Severity Zone mapped"), summary("NOT_EVALUATED", "Project-specific Fire requirements")], template_key="MAPPED_CONTEXT", template_values={"name": "Very High Fire Hazard Severity Zone (VHFHSZ)"}, explanation="The mapped area is context only. Project-specific Fire requirements have not been evaluated.", display_requirement=None, display_fact="Parcel intersects mapped VHFHSZ geography", context_type="FIRE", context_state="MAPPED_VERIFIED", verification_state="Verified", eligibility_state="Not evaluated", regulatory_use_state="Context only", evidence_entries=[evidence("PUBLIC_SOURCE", "Mapped source", "City of San Diego Fire Hazard Severity Zone Map 2025"), evidence("VERSION", "Effective date", "August 30, 2025"), evidence("MAPPING_OBSERVATION", "Mapped result", "Parcel intersects the mapped Very High Fire Hazard Severity Zone")]),
    ]
    result = payload("PUBLIC_PARCEL", "PUBLIC", "5442140600", {"eyebrow": "Public parcel feasibility", "title": "639 N 67th St", "detail": "APN 5442140600 · RM-2-5 · Outside Coastal"}, [{"fact_id": "zone", "label": "Base zone identified", "value": "RM-2-5"}, {"fact_id": "coastal", "label": "Coastal context", "value": "Outside Coastal"}, {"fact_id": "scope", "label": "Evidence scope", "value": "Public parcel sources only"}], None, "PARTIAL_EVALUATION", items, refs)
    return result


def private_replay() -> dict[str, Any]:
    refs = [source("data/approved-plan-setback-benchmark-v0/benchmark-result.json", "PRIVATE_AUTHORIZED_EVIDENCE"), source("data/approved-plan-setback-benchmark-v0/plan-fact-envelope.json", "PRIVATE_AUTHORIZED_EVIDENCE"), source("data/approved-plan-setback-benchmark-v0/public-rule-profile.json")]
    privacy = "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"
    project = {"target_id": "private-scope-status", "project_id": "PRJ-1111087", "status": "Fourth construction-document submittal — issuance not proven", "application_date": "January 29, 2024", "code_profile": "Outside Coastal · Ordinance O-21618 · effective May 6, 2023", "privacy_label": "Not for public indexing · no public cache", "summary_entries": [summary("NOT_EVALUATED", label) for label in ["Height", "FAR", "Development capacity", "Whole-project compliance"]], "not_evaluated": ["Height", "FAR", "development capacity", "whole-project compliance"]}
    item_result = item("PRJ1111087_SIDE", kind="COMPARISON", name="proposed interior-side setback", family="INTERIOR_SIDE_SETBACK", section="SETBACKS", result_state="MEETS_BASE_RULE", state_label="Meets setback rule", summary_entries=[summary("MEETS_BASE_RULE", "Building 1 north enclosed-ADU frame setback — this dimension only")], comparison_scope="THIS_DIMENSION_ONLY", template_key="PROJECT_COMPARISON_MEETS", template_values={"fact": "5 ft 11-1/2 in enclosed-ADU frame setback", "requirement": "4 ft interior-side setback rule"}, explanation="This dimension only: Building 1’s north enclosed-ADU frame is compared with the identified rule. This does not establish project compliance, approval, or issuance.", display_requirement="4 ft selected application-date minimum", display_fact="5 ft 11-1/2 in proposed enclosed-ADU frame setback", evidence_entries=[evidence("PRIVATE_PLAN_STATUS", "Private plan evidence", "Architectural Site Plan A0.1, page 15 · fourth construction-document submittal", privacy= "PRIVATE_AUTHORIZED_EVIDENCE"), evidence("PRIVATE_PLAN_STATUS", "Plan status", "Issuance has not been proven", privacy="PRIVATE_AUTHORIZED_EVIDENCE"), evidence("PRIVATE_PLAN_STATUS", "Application record", "January 29, 2024", privacy="PRIVATE_AUTHORIZED_EVIDENCE"), evidence("VERSION", "Applicable rule profile", "Outside Coastal · Ordinance O-21618 · effective May 6, 2023", ORDINANCE_21618), evidence("COMPARISON_INPUT", "Comparison inputs", "5 ft 11-1/2 in proposed enclosed-ADU frame setback; 4 ft selected minimum", privacy="PRIVATE_AUTHORIZED_EVIDENCE"), evidence("PRIVACY", "Privacy", "Private authorized evidence · excluded from public caching and indexing", privacy="PRIVATE_AUTHORIZED_EVIDENCE")], privacy=privacy)
    result = payload("PRIVATE_PROJECT", privacy, "5442140600", {"eyebrow": "Private project analysis", "title": "PRJ-1111087", "detail": "APN 5442140600 · Not for public indexing"}, [], project, "PARTIAL_EVALUATION", [item_result], refs)
    return result


def blocked_replay() -> dict[str, Any]:
    refs = [source("data/rm-rule-profile-v0/packet-50-replay.json", "PRIVATE_AUTHORIZED_EVIDENCE")]
    privacy = "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX"
    public_rule = [evidence("PUBLIC_SOURCE", "Authoritative rule", "San Diego Municipal Code Table 131-04G", RESIDENTIAL_CODE), evidence("VERSION", "Rule profile", "RM-2-5 application profile")]
    private_height = public_rule + [evidence("PRIVATE_PLAN_STATUS", "Private plan fact", "The plan labels 40 ft, but its measurement method has not been reconciled to the City’s rules", privacy="PRIVATE_AUTHORIZED_EVIDENCE"), evidence("BLOCKER_EVIDENCE", "Evidence needed", "Dimensioned grade, highest-point, roof-treatment, and angled-plane analysis", privacy="PRIVATE_AUTHORIZED_EVIDENCE")]
    private_far = public_rule + [evidence("PRIVATE_PLAN_STATUS", "Private plan fact", "The plan labels FAR 1.10, but the counted floor area and premises area are not independently verified", privacy="PRIVATE_AUTHORIZED_EVIDENCE"), evidence("BLOCKER_EVIDENCE", "Evidence needed", "Code-compatible floor-area worksheet and verified legal premises area", privacy="PRIVATE_AUTHORIZED_EVIDENCE")]
    items = [
        item("P50_BASE_HEIGHT", kind="RULE", name="height rule", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Base rule · Conditional", summary_entries=[summary("CONDITIONAL", "RM-2-5 base height rule")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "height rule", "requirement": "40 ft plus angled-plane conditions"}, explanation="The same conditional RM-2-5 base profile used in the public view applies here.", display_requirement="40 ft plus angled-plane conditions", display_fact=None, evidence_entries=public_rule, privacy=privacy),
        item("P50_PROJECT_HEIGHT", kind="COMPARISON", name="project-height check", family="STRUCTURE_HEIGHT", section="HEIGHT_FAR", result_state="NEEDS_EVIDENCE", state_label="Project comparison · Needs evidence", summary_entries=[summary("NEEDS_EVIDENCE", "Project height comparison")], comparison_scope="PROJECT_SPECIFIC", template_key="NEEDS_EVIDENCE", template_values={"name": "project-height check", "blocker": BLOCKERS["CODE_HEIGHT_ANALYSIS"]["missing"]}, explanation="The plan’s labelled height cannot be compared yet because its measurement method has not been reconciled to the City’s height rules.", display_requirement=None, display_fact="Project comparison needs evidence", blocker_code="CODE_HEIGHT_ANALYSIS", evidence_entries=private_height, privacy=privacy),
        item("P50_BASE_FAR", kind="RULE", name="FAR rule", family="FAR", section="HEIGHT_FAR", result_state="CONDITIONAL", state_label="Base rule · Conditional", summary_entries=[summary("CONDITIONAL", "RM-2-5 base FAR rule")], comparison_scope="PARCEL_RULE", template_key="CONDITIONAL_BASE_RULE", template_values={"name": "FAR rule", "requirement": "1.35 selected maximum"}, explanation="The same conditional RM-2-5 base profile used in the public view applies here.", display_requirement="1.35 selected maximum", display_fact=None, evidence_entries=public_rule, privacy=privacy),
        item("P50_PROJECT_FAR", kind="COMPARISON", name="project FAR check", family="FAR", section="HEIGHT_FAR", result_state="NEEDS_EVIDENCE", state_label="Project comparison · Needs evidence", summary_entries=[summary("NEEDS_EVIDENCE", "Project FAR comparison")], comparison_scope="PROJECT_SPECIFIC", template_key="NEEDS_EVIDENCE", template_values={"name": "project FAR check", "blocker": BLOCKERS["CODE_GFA_AND_PREMISES_AREA"]["missing"]}, explanation="The plan’s counted floor area and legal premises area have not yet been independently verified.", display_requirement=None, display_fact="Project comparison needs evidence", blocker_code="CODE_GFA_AND_PREMISES_AREA", evidence_entries=private_far, privacy=privacy),
    ]
    project = {"target_id": "private-evidence-status", "project_id": "PRJ-1111087", "status": "Private height and FAR evidence review", "application_date": "Not provided in this replay", "code_profile": "RM-2-5 application profile", "privacy_label": "Not for public indexing · no public cache", "summary_entries": [], "not_evaluated": ["whole-project compliance"]}
    result = payload("PRIVATE_PROJECT", privacy, None, {"eyebrow": "Evidence review", "title": "PRJ-1111087", "detail": "Private project comparison · Not for public indexing"}, [], project, "MORE_EVIDENCE_NEEDED", items, refs)
    return result


def payload(scope: str, privacy: str, apn: str | None, subject: dict[str, str], base_facts: list[dict[str, str]], project_context: dict[str, Any] | None, overall_state: str, items: list[dict[str, Any]], provenance: list[dict[str, str]]) -> dict[str, Any]:
    result: dict[str, Any] = {"contract_version": CONTRACT_VERSION, "scope": scope, "privacy": privacy, "subject": subject, "base_facts": base_facts, "project_context": project_context, "overall_state": overall_state, "items": items, "actions": [], "provenance": provenance}
    return result


def doctrinal_outputs() -> dict[str, Any]:
    return {
        "scope.json": {"contract_version": CONTRACT_VERSION, "classifications": {"PRODUCT_READY": ["parcel facts", "base-rule comparisons"], "PRODUCT_READY_CONDITIONAL": ["conditional parcel rules", "mapped context", "evidence blockers"], "OUTSIDE_V0_SCOPE": ["development capacity", "whole-project compliance"]}},
        "states.json": {"contract_version": CONTRACT_VERSION, "product_states": [{"state": state} for state in sorted(PRODUCT_STATES)], "internal_mapping": INTERNAL_TO_PRODUCT, "ambiguous_likely_state_allowed": False},
        "overall-state.json": {"contract_version": CONTRACT_VERSION, "prohibited_top_level_labels": ["Buildable", "Approved", "Development feasible"], "qualification": "Coverage only; never entitlement, capacity, approval, or whole-project compliance."},
        "rule-card-contract.json": {"contract_version": CONTRACT_VERSION, "item_kinds": ITEM_KINDS, "sections": SECTIONS, "comparison_scopes": COMPARISON_SCOPES, "internal_adapter_names_exposed": False},
        "evidence-blockers.json": {"contract_version": CONTRACT_VERSION, "blockers": [{"code": code, **copy} for code, copy in BLOCKERS.items()], "copy_is_allowlisted": True},
        "explainability.json": {"contract_version": CONTRACT_VERSION, "levels": ["ANSWER", "EXPLANATION", "EVIDENCE"], "rule": "Every conclusion retains meaningful structured evidence."},
        "language-doctrine.json": {"contract_version": CONTRACT_VERSION, "avoid_in_product_copy": ["branch", "predicate", "bounded", "sealed", "not accepted", "raw acquisition identifier", "internal MapServer language", "unexplained unit band"], "no_numeric_confidence": True},
        "program-overlay-states.json": {"contract_version": CONTRACT_VERSION, "context_states": CONTEXT_STATES, "doctrine": "Mapped geography is context, not eligibility or project compliance."},
        "rule-family-contracts.json": {"contract_version": CONTRACT_VERSION, "height_far": "Base rules and project comparisons are separate items with consistent semantics.", "setbacks": "Derived parcel requirements lead; exact arithmetic remains evidence."},
        "summary-contract.json": {"contract_version": CONTRACT_VERSION, "groups": SUMMARY_GROUPS, "source": "item.summary_entries and project_context.summary_entries", "silent_truncation": False, "numeric_score": False},
        "actions.json": {"contract_version": CONTRACT_VERSION, "types": ["LINK", "INSTRUCTION"], "rule": "LINK requires a destination; INSTRUCTION renders as plain text."},
        "indexing-doctrine.json": {"contract_version": CONTRACT_VERSION, "cache_rule": "PRIVATE_NO_PUBLIC_CACHE_OR_INDEX never enters public generation, indexing, metadata, or shared caches."},
        "public-private-boundary.json": {"contract_version": CONTRACT_VERSION, "hard_invariant": "No private fact may enter public parcel generation, indexing, metadata, cache keys, or public provenance."},
        "prohibited-statements.json": {"contract_version": CONTRACT_VERSION, "denylist": ["This property is buildable", "You can build X units", "This project complies with zoning", "The existing structure is legal", "The property qualifies for ADU bonus", "Height complies", "FAR complies"]},
        "renderer-contract.json": {"contract_version": CONTRACT_VERSION, "templates": TEMPLATES, "free_form_conclusion_generation": False, "unknown_template_behavior": "REJECT", "missing_template_value_behavior": "REJECT", "copy_versioned": True},
    }


def build_outputs() -> dict[str, Any]:
    outputs = doctrinal_outputs()
    outputs.update({
        "schema.json": schema(),
        "public-rs-replay.json": rs_replay(), "public-rm-replay.json": rm_replay(),
        "private-project-replay.json": private_replay(), "blocked-project-replay.json": blocked_replay(),
        "examples.json": {"contract_version": CONTRACT_VERSION, "examples": [{"view": "rs", "artifact": "public-rs-replay.json"}, {"view": "rm", "artifact": "public-rm-replay.json"}, {"view": "private", "artifact": "private-project-replay.json"}, {"view": "blocked", "artifact": "blocked-project-replay.json"}]},
        "provenance.json": {"contract_version": CONTRACT_VERSION, "production_access": False, "public_private_separation_preserved": True},
        "decision.json": {"contract_version": CONTRACT_VERSION, "readiness": "FEASIBILITY_RENDERER_GENERIC_AND_INTEGRATION_SAFE", "next": "NEXT_FEASIBILITY_STEP: final independent product verification", "production_wired": False, "capacity_calculated": False},
    })
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
