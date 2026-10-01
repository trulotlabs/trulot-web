#!/usr/bin/env python3
"""Packet 23 contract tests."""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from build import CORPUS, OUTPUT, build_outputs
from resolver import (
    ALLOWED_CONCLUSIONS,
    PROHIBITED_CONCLUSIONS,
    RULE_STATES,
    TOP_LEVEL_STATES,
    canonical_json,
    resolve_feasibility_v0,
)


class FeasibilityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = json.loads(CORPUS.read_text())
        cls.by_id = {item["fixture_id"]: item["result"] for item in cls.corpus["results"]}
        cls.outputs = build_outputs()
        cls.results = {item["fixture_id"]: item["result"] for item in cls.outputs["fixture-results.json"]["results"]}

    def test_01_scope_eligibility(self) -> None:
        result = self.results["outside-coastal-rs"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE")
        self.assertEqual(result["zone"], "RS-1-7")
        self.assertIn(result["coastal_evidence_state"], {"INSIDE_COASTAL", "OUTSIDE_COASTAL"})
        self.assertIn(result["scope_state"], TOP_LEVEL_STATES)

    def test_02_split_zone_excluded(self) -> None:
        result = self.results["split-zone-outside-v0"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_OUTSIDE_V0_SCOPE")
        self.assertIn("SINGLE_ZONE_REQUIRED", result["scope_reasons"])

    def test_03_non_rs_excluded(self) -> None:
        result = self.results["non-rs-outside-v0"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_OUTSIDE_V0_SCOPE")

    def test_04_coastal_boundary_mapping_unresolved(self) -> None:
        result = self.results["coastal-boundary-unresolved"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_MAPPING_UNRESOLVED")
        self.assertIn("COASTAL_APPLICABILITY_UNRESOLVED", result["scope_reasons"])

    def test_05_source_unavailable(self) -> None:
        result = self.results["source-unavailable"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_SOURCE_UNAVAILABLE")

    def test_06_missing_evidence_state(self) -> None:
        result = self.results["in-scope-missing-legal-dimensions"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_BLOCKED_BY_MISSING_EVIDENCE")
        for key in ("legal_lot_area_sqft", "legal_lot_width_ft", "legal_lot_depth_ft"):
            self.assertIn(key, result["missing_evidence"])

    def test_07_legal_area_refuses_geometry_and_taxable_acreage(self) -> None:
        parcel = copy.deepcopy(self.by_id["outside-rs-1-7"])
        for evidence_class in ("approximate_geometry_area_sqft", "taxable_acreage"):
            result = resolve_feasibility_v0(parcel, fact_overrides={"legal_lot_area_sqft": {"state": "supported", "value": 22000, "evidence_class": evidence_class, "provenance": {"source": "fixture"}}})
            self.assertEqual(result["evidence_classification"]["legal_lot_area_sqft"]["state"], "unknown")
            self.assertEqual(result["evidence_classification"]["legal_lot_area_sqft"]["refusal"], "UNACCEPTABLE_LEGAL_EVIDENCE_CLASS")
        self.assertEqual(self.outputs["contract.json"]["far_evaluation_contract"]["current_numerator_state"], "FAR_NUMERATOR_NOT_YET_AVAILABLE")

    def test_08_width_depth_refuse_diagnostic_spans(self) -> None:
        parcel = copy.deepcopy(self.by_id["outside-rs-1-7"])
        overrides = {
            "legal_lot_width_ft": {"state": "supported", "value": 100, "evidence_class": "diagnostic_width_span", "provenance": {"source": "fixture"}},
            "legal_lot_depth_ft": {"state": "supported", "value": 180, "evidence_class": "diagnostic_depth_span", "provenance": {"source": "fixture"}},
        }
        result = resolve_feasibility_v0(parcel, fact_overrides=overrides)
        self.assertEqual(result["evidence_classification"]["legal_lot_width_ft"]["state"], "unknown")
        self.assertEqual(result["evidence_classification"]["legal_lot_depth_ft"]["state"], "unknown")

    def test_09_gfa_refuses_assessor_living_area(self) -> None:
        result = self.results["structure-facts-missing-gfa"]
        self.assertEqual(result["evidence_classification"]["assessor_living_area_sqft"]["classification"], "diagnostic_only")
        far = next(item for item in result["rule_family_readiness"] if item["family"] == "far")
        self.assertIn("code_gross_floor_area_sqft", far["missing_project_facts"])

    def test_10_historical_footprint_refused_for_coverage(self) -> None:
        result = self.results["structure-facts-missing-gfa"]
        self.assertEqual(result["evidence_classification"]["historical_2017_footprints"]["classification"], "diagnostic_only")
        coverage = next(item for item in result["rule_family_readiness"] if item["family"] == "lot_coverage")
        self.assertIn("current_structure_footprint", coverage["missing_parcel_facts"])

    def test_11_assessor_unit_semantics(self) -> None:
        positive = self.results["outside-coastal-rs"]["evidence_classification"]["assessor_dwelling_unit_count"]
        self.assertEqual(positive["state"], "supported")
        self.assertGreater(positive["value"], 0)
        non_rs = resolve_feasibility_v0(copy.deepcopy(self.by_id["p14-missing-situs-taxable"]))
        zero = non_rs["evidence_classification"]["assessor_dwelling_unit_count"]
        self.assertEqual(zero["state"], "unknown")
        self.assertIsNone(zero["value"])

    def test_12_hypothetical_ready_does_not_calculate(self) -> None:
        result = self.results["hypothetical-fully-evidenced-rule-family"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_READY_FOR_RULE_EVALUATION")
        self.assertTrue(any(item["state"] == "RULE_READY_FOR_EVALUATION" for item in result["rule_family_readiness"]))
        self.assertFalse(result["parcel_compliance_evaluated"])
        self.assertFalse(result["development_capacity_calculated"])

    def test_13_forbidden_max_unit_request(self) -> None:
        result = self.results["forbidden-maximum-units-request"]
        self.assertEqual(result["scope_state"], "FEASIBILITY_OUTSIDE_V0_SCOPE")
        self.assertEqual(result["requested_analysis"], "maximum_units")

    def test_14_allowed_and_forbidden_conclusions_are_closed(self) -> None:
        self.assertEqual(tuple(self.outputs["contract.json"]["allowed_conclusions"]), ALLOWED_CONCLUSIONS)
        self.assertEqual(tuple(self.outputs["contract.json"]["prohibited_conclusions"]), PROHIBITED_CONCLUSIONS)
        self.assertTrue(set(ALLOWED_CONCLUSIONS).isdisjoint(PROHIBITED_CONCLUSIONS))
        for result in self.results.values():
            self.assertEqual(result["allowed_conclusions"], list(ALLOWED_CONCLUSIONS))
            self.assertNotIn("MAXIMUM_LEGAL_UNITS", result["allowed_conclusions"])

    def test_15_rule_states_are_closed(self) -> None:
        for result in self.results.values():
            for rule in result["rule_family_readiness"]:
                self.assertIn(rule["state"], RULE_STATES)
                self.assertFalse(rule["compliance_evaluated"])

    def test_16_no_numeric_confidence_score(self) -> None:
        encoded = canonical_json(self.outputs)
        self.assertNotIn('"confidence_score"', encoded)
        self.assertNotIn('"readiness_percent"', encoded)

    def test_17_parcel_intelligence_compatibility(self) -> None:
        for fixture_id in ("p14-ordinary-rs-1-7", "outside-rs-1-7", "p14-split-rs-non-rs", "boundary-balanced", "packet8-identity-exception"):
            result = resolve_feasibility_v0(copy.deepcopy(self.by_id[fixture_id]))
            self.assertEqual(result["provenance"]["parcel_intelligence_contract"], "parcel-intelligence-v2-2026-09-30-v1")
            self.assertEqual(result["provenance"]["parcel_intelligence_fingerprint"], self.by_id[fixture_id]["fingerprint_sha256"])

    def test_18_input_with_capacity_or_compliance_is_rejected(self) -> None:
        for field in ("parcel_compliance_evaluated", "development_capacity_calculated"):
            parcel = copy.deepcopy(self.by_id["outside-rs-1-7"])
            parcel[field] = True
            with self.assertRaises(ValueError):
                resolve_feasibility_v0(parcel)

    def test_19_deterministic_rebuild(self) -> None:
        first = build_outputs()
        second = build_outputs()
        self.assertEqual(canonical_json(first), canonical_json(second))
        expected = hashlib.sha256(canonical_json(first["fixture-results.json"]).encode()).hexdigest()
        actual = hashlib.sha256(canonical_json(second["fixture-results.json"]).encode()).hexdigest()
        self.assertEqual(actual, expected)

    def test_20_committed_artifacts_match_builder(self) -> None:
        for name, value in self.outputs.items():
            path = OUTPUT / name
            self.assertTrue(path.exists(), name)
            self.assertEqual(json.loads(path.read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
