#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from decimal import Decimal

from build import OUTPUT, build_outputs
from resolver import compare_max, recompute_far


class Packet52Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_component_ledger_is_complete_and_direct(self):
        rows = self.outputs["gfa-component-ledger.json"]["components"]
        self.assertEqual(len([r for r in rows if r["use_category"] == "HABITABLE_DWELLING_UNIT"]), 26)
        self.assertEqual(len([r for r in rows if r["use_category"] == "GARAGE_PARKING"]), 10)
        self.assertEqual(len(rows), 39)
        self.assertTrue(all(r["direct_provenance"]["sheet"] for r in rows))

    def test_direct_plan_components_conflict_by_ten_square_feet(self):
        n = self.outputs["numerator-reconciliation.json"]
        self.assertEqual(n["checks"]["adu_sum_sq_ft"], "16370.6")
        self.assertEqual(n["checks"]["garage_sum_sq_ft"], "5140.0")
        self.assertEqual(n["checks"]["new_construction_sum_sq_ft"], "21510.6")
        self.assertEqual(n["direct_component_sum_sq_ft"], "22229.6")
        self.assertEqual(n["difference_component_sum_minus_stated_sq_ft"], "10.0")
        self.assertEqual(n["state"], "CONFLICT")

    def test_historical_gfa_classification_is_fail_closed(self):
        c = self.outputs["historical-gfa-classification.json"]
        self.assertEqual(c["selected_profile"], "RM25_2023_05_06_OUTSIDE_COASTAL")
        self.assertEqual(c["counts"]["INCLUDED_IN_CODE_GFA"], 27)
        self.assertEqual(c["counts"]["CONDITIONAL_GFA"], 11)
        self.assertEqual(c["counts"]["UNRESOLVED_GFA"], 1)
        self.assertIn("not back-applied", c["historical_boundary"])

    def test_code_numerator_is_interval_not_false_exactness(self):
        n = self.outputs["code-compatible-numerator.json"]
        self.assertEqual(n["state"], "CODE_COMPATIBLE_GFA_UNRESOLVED")
        self.assertIsNone(n["exact_total_sq_ft"])
        self.assertEqual(n["definitely_included_lower_bound_sq_ft"], "17089.6")
        self.assertEqual(n["all_catalogued_components_upper_bound_sq_ft"], "22857.2")
        self.assertFalse(n["unresolved_components_could_change_1_35_comparison_if_denominator_20084"])

    def test_legal_premises_remains_partial(self):
        p = self.outputs["legal-premises-evidence.json"]
        self.assertEqual(p["legal_identity"]["description"], "Lot 4, Block 7, Encanto Heights, Map 1063")
        self.assertEqual(p["boundary"]["derived_traverse_area_sq_ft"], "20084.272422")
        self.assertLess(Decimal(p["boundary"]["closure_ft"]), Decimal("0.01"))
        self.assertIn("NOT A PRECISE", p["boundary"]["disclaimer"])
        self.assertTrue(self.outputs["legal-premises-decision.json"]["decision"].startswith("LEGAL_PREMISES_AREA_PARTIAL:"))

    def test_dedication_branch_is_bounded(self):
        d = self.outputs["dedication-analysis.json"]
        self.assertEqual(d["classification"], "NO_REQUIRED_DEDICATION_EVIDENCE")
        self.assertIsNone(d["selected_area_sq_ft"])
        self.assertIn("not affirmative proof", d["limitation"])

    def test_decimal_far_and_rounding(self):
        stated = recompute_far("22219.6", "20084")
        self.assertEqual(stated["exact"], "1.106333399721171081457876916948814977096")
        self.assertEqual(stated["one_decimal_half_up"], "1.1")
        self.assertEqual(stated["two_decimal_half_up"], "1.11")
        r = self.outputs["rounding-analysis.json"]
        self.assertFalse(r["explicit_plan_rounding_rule_found"])
        self.assertTrue(r["classification"].startswith("UNEXPLAINED"))

    def test_comparison_cannot_run_without_semantic_gates(self):
        result = self.outputs["rm-2-5-comparison.json"]
        self.assertEqual(result["state"], "FAR_RULE_EVALUATION_UNRESOLVED")
        self.assertIsNone(result["comparison"])
        self.assertIsNone(result["margin"])
        self.assertEqual(compare_max(measured="1.10", maximum="1.35", gates_pass=False)["state"], "FAR_RULE_EVALUATION_UNRESOLVED")

    def test_city_review_silence_is_not_approval(self):
        city = self.outputs["city-review-corroboration.json"]
        self.assertEqual(city["state"], "NO_RELEVANT_FAR_EVIDENCE")
        self.assertFalse(city["silence_treated_as_approval"])

    def test_reusable_schema_has_no_project_identity(self):
        serialized = json.dumps(self.outputs["reusable-schema.json"])
        self.assertNotIn("PRJ-1111087", serialized)
        self.assertNotIn("5442140600", serialized)
        self.assertEqual(len(self.outputs["reusable-schema.json"]["contracts"]), 5)

    def test_public_private_provenance_and_containment(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)password|service_role|postgresql://")
        self.assertFalse(self.outputs["contract.json"]["private_plan_publication"])
        self.assertFalse(self.outputs["contract.json"]["whole_project_compliance"])
        self.assertFalse(self.outputs["contract.json"]["capacity"])
        provenance = self.outputs["provenance-chain.json"]
        self.assertEqual(len(provenance["source_artifacts"]), 5)
        self.assertTrue(all(link.get("locator") or link.get("reason") or link.get("comparator") or link.get("rule_authority") for link in provenance["links"]))

    def test_decision_and_next_move(self):
        decision = self.outputs["decision.json"]
        self.assertTrue(decision["benchmark"].startswith("FAR_GOLDEN_BENCHMARK_UNRESOLVED:"))
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: close Packet 50 height evidence")
        self.assertTrue(decision["useful_artifacts"])

    def test_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
