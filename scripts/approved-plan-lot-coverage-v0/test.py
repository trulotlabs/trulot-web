#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import unittest

from build import OUTPUT, ROOT, build_outputs
from resolver import coverage_ratio, decimal_sum

sys.path.insert(0, str(ROOT / "scripts"))
from project_evidence_adapter_v0 import validate_project_evidence_envelope  # noqa: E402


class Packet54Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_historical_rm25_rule_is_not_specified(self):
        result = self.outputs["rule-existence.json"]
        self.assertEqual(result["decision"], "LOT_COVERAGE_RULE_NOT_SPECIFIED")
        self.assertEqual(result["cell"], "—")
        self.assertEqual(result["normalized_comparator"], "NOT_SPECIFIED")
        self.assertIsNone(result["numeric_maximum"])

    def test_component_classification_and_no_garage_double_count(self):
        rows = self.outputs["footprint-component-ledger.json"]["components"]
        buildings = [row for row in rows if row["footprint_type"] == "PROPOSED_BUILDING_PLAN_VIEW_OUTLINE"]
        garages = [row for row in rows if row["footprint_type"] == "INTEGRATED_TUCK_UNDER_GARAGE"]
        decks = [row for row in rows if row["footprint_type"] == "OPEN_EXTERIOR_DECK"]
        self.assertEqual(len(buildings), 10)
        self.assertEqual(len(garages), 10)
        self.assertEqual(len(decks), 6)
        self.assertTrue(all(row["coverage_inclusion_state"] == "INCLUDED_WITHIN_PARENT_BUILDING_FOOTPRINT_NOT_ADDITIVE" for row in garages))
        self.assertTrue(all(row["coverage_inclusion_state"] == "EXCLUDED_OPEN_UNROOFED_PROJECTION" for row in decks))

    def test_direct_plan_view_subtotal_uses_decimal(self):
        expected = decimal_sum(["1544.4", "1516.8", "1516.8", "1516.8", "1836.6", "1804.6", "1804.6", "1804.6", "1804.6", "1804.6"])
        self.assertEqual(expected, "16954.4")
        self.assertEqual(self.outputs["code-compatible-covered-area.json"]["proposed_building_plan_view_label_subtotal_sq_ft"], expected)
        self.assertEqual(coverage_ratio("16954.4", "20084"), "0.84417446723760207130053774148575980880302728540131")

    def test_numerator_and_denominator_fail_closed(self):
        numerator = self.outputs["code-compatible-covered-area.json"]
        denominator = self.outputs["denominator.json"]
        computation = self.outputs["lot-coverage-computation.json"]
        self.assertEqual(numerator["state"], "CODE_COMPATIBLE_COVERED_AREA_UNRESOLVED")
        self.assertIsNone(numerator["exact_sq_ft"])
        self.assertIsNone(numerator["defensible_range_sq_ft"])
        self.assertEqual(denominator["packet_52a_state"], "LEGAL_PREMISES_AREA_PARTIAL")
        self.assertIsNone(denominator["exact_sq_ft"])
        self.assertIsNone(computation["exact_ratio"])
        self.assertIsNone(computation["diagnostic_range"])

    def test_existing_house_garage_decks_and_trash_are_distinct(self):
        self.assertEqual(self.outputs["existing-house-treatment.json"]["house_state"], "RETAINED")
        self.assertEqual(self.outputs["existing-house-treatment.json"]["garage_state"], "DEMOLISHED")
        self.assertEqual(self.outputs["garage-treatment.json"]["coverage_state"], "INCLUDED_WITHIN_PARENT_BUILDING_FOOTPRINT_NOT_ADDITIVE")
        self.assertEqual(self.outputs["deck-projection-treatment.json"]["decks"]["coverage_state"], "EXCLUDED_OPEN_UNROOFED_PROJECTION")
        self.assertEqual(self.outputs["trash-enclosure-treatment.json"]["coverage_inclusion_state"], "UNRESOLVED_COMPONENT")

    def test_no_compliance_test_is_manufactured(self):
        comparison = self.outputs["rule-comparison.json"]
        self.assertEqual(comparison["state"], "LOT_COVERAGE_RULE_NOT_APPLICABLE_AS_NUMERIC_BASE_STANDARD")
        self.assertIsNone(comparison["comparison"])
        self.assertIsNone(comparison["maximum"])
        self.assertEqual(self.outputs["decision.json"]["benchmark"], "LOT_COVERAGE_GOLDEN_BENCHMARK_NOT_APPLICABLE: no RM-2-5 lot-coverage standard")

    def test_project_fact_stays_proposed_and_noncompliance(self):
        fact = self.outputs["project-fact-value.json"]
        self.assertEqual(fact["classification"], "PROPOSED_PROJECT_FACT")
        self.assertTrue(fact["useful"])
        self.assertTrue(fact["not_compliance_evidence"])
        self.assertEqual(fact["current_numeric_state"], "UNRESOLVED")

    def test_generic_project_evidence_adapter_accepts_bounded_envelope(self):
        envelope = {
            "project_id": "PRJ-1111087", "apn": "5442140600", "address": "639-659 N. 67th Street",
            "project_status": "FOURTH_CD_SUBMITTAL", "plan_set_version": "FOURTH_CD", "subject": "PROPOSED_PROJECT_FACT",
            "sheet_provenance": {"sheet": "A0.1", "source_ref": "PRIVATE_PLAN_PRJ-1111087_FOURTH_CD"},
            "legal_survey_line_roles": {}, "structure_id": "PROPOSED_BUILDINGS", "geometry_semantics": "PLAN_VIEW_BUILDING_AREA_LABELS",
            "direct_dimensions": {"ten_label_subtotal_sq_ft": "16954.4"}, "height": None,
            "floor_area": {"coverage_exact_sq_ft": None}, "proposed_use_units": 26,
            "project_specific_conditions": {"coverage_rule": "NOT_SPECIFIED"},
            "privacy_classification": "PRIVATE_VALIDATION_EVIDENCE", "source_sha256": "93d8bae01e2f1458f9a65ced9b06c7df55d2c593db8b7dd26ae68207b7d68b12",
        }
        validate_project_evidence_envelope(envelope, expected_project_id="PRJ-1111087", expected_apn="5442140600", allowed_project_statuses={"FOURTH_CD_SUBMITTAL"})

    def test_reusable_model_contains_no_project_constants(self):
        model = self.outputs["reusable-lot-coverage-model.json"]
        serialized = json.dumps(model)
        self.assertTrue(model["project_independent"])
        self.assertEqual(model["project_constants"], [])
        self.assertNotIn("PRJ-1111087", serialized)
        self.assertNotIn("5442140600", serialized)

    def test_review_silence_and_next_move(self):
        review = self.outputs["city-review-corroboration.json"]
        self.assertEqual(review["state"], "NO_RELEVANT_EVIDENCE")
        self.assertFalse(review["silence_treated_as_approval"])
        self.assertEqual(self.outputs["decision.json"]["next"], "NEXT_FEASIBILITY_STEP: third approved-plan benchmark")

    def test_containment_determinism_and_committed_artifacts(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["contract.json"]["private_sources_published"])
        self.assertFalse(self.outputs["contract.json"]["whole_project_compliance"])
        self.assertFalse(self.outputs["contract.json"]["capacity"])
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
