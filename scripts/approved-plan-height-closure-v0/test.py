#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from decimal import Decimal

from build import OUTPUT, build_outputs
from resolver import compare_max, feet


class Packet53Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_footnote_37_predicates_are_independently_false(self):
        rows = {row["predicate"]: row for row in self.outputs["footnote-37-predicates.json"]["predicates"]}
        self.assertEqual(rows["IN_COASTAL_HEIGHT_LIMIT_OVERLAY"]["state"], "SUPPORTED_FALSE")
        self.assertEqual(rows["IN_PENINSULA_COMMUNITY_PLAN"]["state"], "SUPPORTED_FALSE")
        self.assertEqual(rows["IN_PENINSULA_COMMUNITY_PLAN"]["query_result"]["CPNAME"], "ENCANTO NEIGHBORHOODS")

    def test_base_branch_is_40(self):
        branch = self.outputs["height-limit-branch.json"]
        self.assertFalse(branch["footnote_37_applies"])
        self.assertEqual(branch["numeric_maximum_ft"], "40")

    def test_all_seven_buildings_are_inventoried(self):
        buildings = self.outputs["building-height-inventory.json"]["buildings"]
        self.assertEqual([row["building_id"] for row in buildings], [f"BUILDING_{n}" for n in range(1, 8)])
        self.assertEqual([row["stories"] for row in buildings], [2, 2, 2, 2, 3, 3, 3])

    def test_height_label_semantics_fail_closed(self):
        labels = self.outputs["height-label-semantics.json"]["labels"]
        self.assertEqual(labels[0]["classification"], "NONCOMPARABLE_HEIGHT_LABEL")
        self.assertTrue(all(row["classification"] != "CODE_COMPARABLE_HEIGHT_LABEL" for row in labels))

    def test_grade_datum_is_unresolved(self):
        datum = self.outputs["code-datum-reconstruction.json"]
        self.assertFalse(datum["code_compatible_reconstruction"])
        self.assertEqual(datum["plumb_line_lower_existing_or_proposed_grade"], "UNRESOLVED")
        self.assertEqual(datum["overall_lowest_applicable_grade"], "UNRESOLVED")

    def test_roof_and_parapet_are_direct_but_top_elevation_is_not(self):
        rows = self.outputs["roof-parapet-classification.json"]["buildings"]
        self.assertEqual(len(rows), 7)
        self.assertTrue(all(row["parapet"].startswith("present") for row in rows))
        self.assertTrue(all(row["code_exclusion"] == "NONE_PROVEN" for row in rows))

    def test_decimal_architectural_dimensions_are_exact_and_not_code_heights(self):
        rows = self.outputs["per-structure-calculations.json"]["architectural_dimensions"]
        self.assertEqual(rows[0]["decimal_ft"], feet("30", "0.5"))
        self.assertEqual(rows[2]["decimal_ft"], feet("37", "3.25"))
        self.assertTrue(all(not row["code_height"] for row in rows))
        self.assertEqual(Decimal(rows[2]["decimal_ft"]), Decimal("37") + Decimal("3.25") / Decimal("12"))

    def test_per_structure_code_heights_are_not_fabricated(self):
        rows = self.outputs["per-structure-calculations.json"]["per_structure"]
        self.assertTrue(all(row["plumb_line_height_ft"] is None and row["overall_height_ft"] is None for row in rows))

    def test_footnote_18_remains_separate_and_unresolved(self):
        self.assertEqual(self.outputs["footnote-18-evidence.json"]["state"], "HEIGHT_ANGLED_PLANE_UNRESOLVED")
        self.assertEqual(self.outputs["angled-plane-result.json"]["state"], "HEIGHT_ANGLED_PLANE_UNRESOLVED")

    def test_base_comparison_is_not_invoked(self):
        result = self.outputs["base-height-result.json"]
        self.assertEqual(result["state"], "HEIGHT_RULE_EVALUATION_UNRESOLVED")
        self.assertFalse(result["shared_decimal_max_comparator_invoked"])
        self.assertEqual(compare_max("40", "40"), "HEIGHT_RULE_REQUIREMENT_SATISFIED")

    def test_outcome_invariance_does_not_create_doctrine(self):
        outcome = self.outputs["outcome-invariance.json"]
        self.assertTrue(outcome["legal_branch_invariant"])
        self.assertFalse(outcome["project_height_outcome_invariant"])
        self.assertFalse(outcome["existing_doctrine_authorizes_result"])

    def test_city_silence_is_not_approval(self):
        city = self.outputs["city-review-corroboration.json"]
        self.assertEqual(city["state"], "NO_RELEVANT_HEIGHT_EVIDENCE")
        self.assertFalse(city["silence_treated_as_approval"])

    def test_final_decision_and_next_move(self):
        decision = self.outputs["decision.json"]
        self.assertTrue(decision["benchmark"].startswith("HEIGHT_GOLDEN_BENCHMARK_UNRESOLVED:"))
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: lot coverage golden evaluation")
        self.assertTrue(self.outputs["remaining-external-evidence.json"]["broad_research_loop_closed"])

    def test_reusable_schema_contains_no_project_constants(self):
        model = self.outputs["reusable-height-evidence-model.json"]
        self.assertTrue(model["project_independent"])
        self.assertEqual(model["project_constants"], [])
        self.assertNotIn("PRJ-1111087", json.dumps(model))

    def test_containment_and_determinism(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["contract.json"]["private_source_published"])
        self.assertFalse(self.outputs["contract.json"]["whole_project_compliance"])
        self.assertFalse(self.outputs["contract.json"]["capacity"])
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
