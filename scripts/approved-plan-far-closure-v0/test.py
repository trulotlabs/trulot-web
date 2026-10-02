#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from decimal import Decimal

from build import OUTPUT, build_outputs


class Packet52ATests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_packet52_ledger_is_reused(self):
        ref = self.outputs["component-resolution.json"]["packet52_ledger"]
        self.assertFalse(ref["rebuilt"])
        self.assertEqual(ref["sha256"], "5ec41b63ce8788b2695cbc2ed0b16d83e8b9ba15f95b7ee6f2b89a0d4d360b80")

    def test_map_seals_identity_but_not_area(self):
        evidence = self.outputs["map-1063-evidence.json"]
        self.assertEqual(evidence["record"]["title"], "MAP 01063")
        self.assertTrue(evidence["lot_4_block_7"]["shown"])
        self.assertIsNone(evidence["lot_4_block_7"]["explicit_area_sq_ft"])
        self.assertFalse(evidence["area_reconstruction"]["possible_from_map_alone"])

    def test_legal_premises_remains_partial(self):
        decision = self.outputs["legal-premises-decision.json"]
        self.assertTrue(decision["decision"].startswith("LEGAL_PREMISES_AREA_PARTIAL:"))
        self.assertIsNone(decision["supported_area_sq_ft"])

    def test_ten_square_foot_conflict_remains_explicit(self):
        conflict = self.outputs["numerator-conflict.json"]
        self.assertEqual(conflict["state"], "NUMERATOR_CONFLICT_UNRESOLVED")
        self.assertEqual(conflict["difference_sq_ft"], "10.0")
        self.assertTrue(all(value is None for value in conflict["bounded_search_results"].values()))

    def test_garages_remain_historically_conditional(self):
        garages = self.outputs["component-resolution.json"]["garages"]
        self.assertEqual(len(garages), 10)
        self.assertTrue(all(row["state"] == "CONDITIONAL_GFA" for row in garages))

    def test_each_deck_is_excluded_by_direct_unroofed_evidence(self):
        decks = self.outputs["component-resolution.json"]["decks"]
        self.assertEqual(len(decks), 6)
        self.assertTrue(all(row["state"] == "EXCLUDED_FROM_CODE_GFA" for row in decks))
        self.assertEqual(self.outputs["component-resolution.json"]["deck_schedule_conflict"]["difference_sq_ft"], "44.4")

    def test_trash_enclosure_stays_unresolved(self):
        trash = self.outputs["component-resolution.json"]["trash_enclosure"]
        self.assertEqual(trash["state"], "UNRESOLVED_GFA")

    def test_code_numerator_bounds(self):
        numerator = self.outputs["code-compatible-numerator.json"]
        self.assertEqual(numerator["minimum_possible_sq_ft"], "17089.6")
        self.assertEqual(numerator["maximum_possible_sq_ft"], "22529.6")
        self.assertIsNone(numerator["exact_sq_ft"])

    def test_numeric_candidates_are_invariant(self):
        invariant = self.outputs["outcome-invariance.json"]
        self.assertTrue(invariant["all_enumerated_candidates_same"])
        self.assertEqual(invariant["numeric_branch_state"], "FAR_RULE_REQUIREMENT_SATISFIED")
        self.assertLess(Decimal(invariant["candidate_far_max"]), Decimal("1.35"))

    def test_existing_doctrine_blocks_formal_invariant_result(self):
        invariant = self.outputs["outcome-invariance.json"]
        self.assertFalse(invariant["legal_denominator_interval_supported"])
        self.assertFalse(invariant["existing_evaluator_allows_branch_invariant_result"])
        self.assertEqual(self.outputs["rm-2-5-comparison.json"]["state"], "FAR_RULE_EVALUATION_UNRESOLVED")

    def test_no_legal_far_or_margin_is_fabricated(self):
        self.assertIsNone(self.outputs["far-computation.json"]["legal_far"])
        self.assertIsNone(self.outputs["far-computation.json"]["legal_far_interval"])
        self.assertIsNone(self.outputs["rm-2-5-comparison.json"]["margin"])

    def test_irreducible_decision_and_next_step(self):
        decision = self.outputs["decision.json"]
        self.assertTrue(decision["benchmark"].startswith("FAR_GOLDEN_BENCHMARK_UNRESOLVED:"))
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: close Packet 50 height evidence")
        self.assertTrue(self.outputs["remaining-external-evidence.json"]["broad_research_loop_closed"])

    def test_containment_and_determinism(self):
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
