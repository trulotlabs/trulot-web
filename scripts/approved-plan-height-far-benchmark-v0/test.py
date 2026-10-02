#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from decimal import Decimal, localcontext
from pathlib import Path

from build import OUTPUT, ROOT, build_outputs
from resolver import recompute_far

sys.path.insert(0, str(ROOT / "scripts"))
from dimensional_rule_evaluator_v0 import compare_values  # noqa: E402


class Packet50Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()

    def test_height_is_independently_fail_closed(self):
        result = self.outputs["height-comparison.json"]
        self.assertEqual(result["state"], "HEIGHT_RULE_EVALUATION_UNRESOLVED")
        self.assertIsNone(result["comparison"])
        self.assertFalse(result["shared_comparator_invoked"])
        self.assertIn("plan_measurement_datum_not_established", result["failed_gates"])

    def test_height_rule_and_plan_are_separate(self):
        rule = self.outputs["height-public-rule-profile.json"]
        fact = self.outputs["height-private-plan-fact.json"]
        self.assertEqual(rule["maximum_ft"], "40")
        self.assertEqual(fact["value_ft"], "40.00")
        self.assertIsNone(fact["measurement_datum"])
        self.assertIsNone(rule["footnote_37_selected"])
        self.assertIn("coastal_height_limit_peninsula_predicate_not_in_bounded_profile", self.outputs["height-comparison.json"]["failed_gates"])

    def test_far_arithmetic_and_rounding(self):
        with localcontext() as context:
            context.prec = 40
            arithmetic = recompute_far(Decimal("22219.6"), Decimal("20084"))
        self.assertEqual(arithmetic["decimal_40_digit_context"], "1.106333399721171081457876916948814977096")
        self.assertEqual(arithmetic["nearest_hundredth_half_up"], "1.11")
        self.assertFalse(arithmetic["plan_display_matches_nearest_hundredth"])
        self.assertTrue(arithmetic["plan_display_matches_one_decimal_value_with_trailing_zero"])

    def test_far_is_independently_fail_closed(self):
        result = self.outputs["far-comparison.json"]
        self.assertEqual(result["state"], "FAR_RULE_EVALUATION_UNRESOLVED")
        self.assertIsNone(result["comparison"])
        self.assertFalse(result["shared_comparator_invoked"])
        self.assertIn("plan_denominator_not_proven_total_premises_area", result["failed_gates"])

    def test_rm_2_5_branches_are_reconstructed(self):
        self.assertEqual(self.outputs["height-selected-branch.json"]["numeric_maximum_ft"], "40")
        self.assertEqual(self.outputs["far-selected-branch.json"]["numeric_maximum_ratio"], "1.35")
        self.assertEqual(self.outputs["far-public-rule-profile.json"]["base_branch_predicates"]["project_units"], 26)

    def test_shared_comparator_needs_no_fork(self):
        h = compare_values(measured=Decimal("40.00"), required=Decimal("40"), unit="ft", operator="MAX", expression="candidate only")
        f = compare_values(measured=Decimal("1.10"), required=Decimal("1.35"), unit="ratio", operator="MAX", expression="candidate only")
        self.assertEqual(h.state, "RULE_REQUIREMENT_SATISFIED")
        self.assertEqual(f.state, "RULE_REQUIREMENT_SATISFIED")
        self.assertFalse(self.outputs["evaluator-compatibility.json"]["architectural_fork_required"])

    def test_provenance_privacy_and_status_scope(self):
        serialized = json.dumps(self.outputs)
        self.assertNotIn("/Users/", serialized)
        self.assertNotRegex(serialized, r"(?i)\.pdf|\.tiff?|\.dwg")
        for name in ("height-private-plan-fact.json", "far-private-plan-fact.json"):
            self.assertEqual(self.outputs[name]["subject"], "PROPOSED_PROJECT_FACT")
            self.assertEqual(self.outputs[name]["privacy_classification"], "PRIVATE_VALIDATION_EVIDENCE")
        self.assertFalse(self.outputs["height-result.json"]["whole_project_compliance"])
        self.assertFalse(self.outputs["far-result.json"]["whole_project_compliance"])

    def test_no_cross_contamination(self):
        self.assertNotIn("FAR", self.outputs["height-result.json"]["classification"])
        self.assertNotIn("HEIGHT", self.outputs["far-result.json"]["classification"])
        self.assertFalse(self.outputs["contract.json"]["cross_family_inference"])

    def test_decisions_and_next_move(self):
        decision = self.outputs["decision.json"]
        self.assertTrue(decision["height"].startswith("HEIGHT_GOLDEN_BENCHMARK_UNRESOLVED:"))
        self.assertTrue(decision["far"].startswith("FAR_GOLDEN_BENCHMARK_UNRESOLVED:"))
        self.assertEqual(decision["next"], "NEXT_FEASIBILITY_STEP: broader RM rule profile")
        self.assertTrue(decision["artifacts_useful"])

    def test_deterministic_rebuild_and_committed_artifacts(self):
        self.assertEqual(build_outputs(), build_outputs())
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)

    def test_no_private_plan_binary_is_tracked(self):
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
        prohibited = {".pdf", ".tif", ".tiff", ".dwg"}
        self.assertFalse([name for name in tracked if Path(name).suffix.lower() in prohibited and "docs/" not in name])


if __name__ == "__main__":
    unittest.main(verbosity=2)
