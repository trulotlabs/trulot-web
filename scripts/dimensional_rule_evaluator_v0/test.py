#!/usr/bin/env python3
from __future__ import annotations
import json, unittest
from decimal import Decimal
from build import OUTPUT, ROOT, RULES, build_outputs
from framework import CORE_FORBIDDEN_CONCLUSIONS, canonical_json, compare_values, conclusion_guard_fields, evaluate_evidence_gates, provenance_graph, resolve_rule_applicability, validate_contract


class DimensionalRuleEvaluatorV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.outputs = build_outputs()

    def test_01_contract_fields_are_complete(self):
        for contract in self.outputs["normalized-results.json"]["results"]: validate_contract(contract)

    def test_02_literal_true_evidence_gate(self):
        result = evaluate_evidence_gates({"true": True, "false": False, "null": None, "one": 1, "text": "true"})
        self.assertFalse(result.passed); self.assertEqual(result.failed, ("false", "null", "one", "text"))

    def test_03_min_comparator(self):
        passed = compare_values(measured=Decimal("94.00"), required=Decimal("50.0"), unit="ft", operator="MIN", expression="x >= y")
        failed = compare_values(measured=Decimal("49.99"), required=Decimal("50.0"), unit="ft", operator="MIN", expression="x >= y")
        self.assertEqual(passed.state, "RULE_REQUIREMENT_SATISFIED"); self.assertEqual(failed.state, "RULE_REQUIREMENT_NOT_SATISFIED")

    def test_04_future_safe_comparator(self):
        self.assertEqual(compare_values(measured=Decimal("4"), required=Decimal("5"), unit="ft", operator="MAX", expression="x <= y").state, "RULE_REQUIREMENT_SATISFIED")
        self.assertEqual(compare_values(measured=Decimal("5"), required=Decimal("5"), unit="ft", operator="EXACT", expression="x == y").state, "RULE_REQUIREMENT_SATISFIED")
        with self.assertRaises(ValueError): compare_values(measured=Decimal("1"), required=Decimal("1"), unit="ft", operator="OTHER", expression="x ? y")

    def test_05_conclusion_guard(self):
        fields = conclusion_guard_fields(CORE_FORBIDDEN_CONCLUSIONS, ("parcel_compliance_evaluated", "development_capacity_calculated"))
        self.assertFalse(fields["parcel_compliance_evaluated"]); self.assertFalse(fields["development_capacity_calculated"]); self.assertEqual(fields["other_rule_families_evaluated"], [])

    def test_06_provenance_requires_named_hops(self):
        self.assertEqual(provenance_graph("v", [{"hop": "A"}]), {"contract_version": "v", "chain": [{"hop": "A"}]})
        with self.assertRaises(ValueError): provenance_graph("v", [{"source": "missing-hop"}])

    def test_07_all_four_canonical_bundles_are_identical(self):
        report = self.outputs["parity-report.json"]
        self.assertTrue(report["all_rules_identical"]); self.assertEqual(set(report["rules"]), set(RULES))
        for rule in report["rules"].values(): self.assertTrue(rule["canonical_bundle_identical"])

    def test_08_golden_values_and_states(self):
        for result in self.outputs["normalized-results.json"]["results"]:
            expected = RULES[result["rule_family"]]
            self.assertEqual(result["measurement_result"], expected["measured"]); self.assertEqual(result["applicable_requirement"], expected["required"]); self.assertEqual(result["comparison_result"], "RULE_REQUIREMENT_SATISFIED")

    def test_09_failure_mode_parity_is_retained_by_source_tests(self):
        expected = {
            "minimum_lot_area": ("scripts/minimum-lot-area-evaluation-v0/test.py", "test_11_unresolved_denominator_refused"),
            "minimum_lot_depth": ("scripts/minimum-lot-depth-evaluation-v0/test.py", "test_13_unresolved_front_or_rear_refused"),
            "minimum_lot_width": ("scripts/minimum-lot-width-evaluation-v0/test.py", "test_13_unresolved_corner_status_refused"),
            "minimum_frontage": ("scripts/minimum-frontage-evaluation-v0/test.py", "test_15_unresolved_exception_refused"),
        }
        for path, marker in expected.values(): self.assertIn(marker, (ROOT / path).read_text())
        self.assertTrue(self.outputs["parity-report.json"]["all_rules_identical"])

    def test_10_extension_interface(self):
        extension = self.outputs["extension-interface.json"]
        self.assertIn("condition_resolver", extension["required_extension_fields"]); self.assertFalse(extension["condition_contract"]["null_or_zero_coercion"])

    def test_11_front_setback_is_representable_but_not_implemented(self):
        readiness = self.outputs["front-setback-readiness.json"]
        self.assertEqual(readiness["state"], "FRAMEWORK_SUFFICIENT_RULE_SPECIFIC_PREDICATE_MODEL_REQUIRED"); self.assertFalse(readiness["framework_change_required"]); self.assertFalse(readiness["implementation_started"])

    def test_12_not_applicable_requires_resolved_prerequisites(self):
        self.assertEqual(resolve_rule_applicability(prerequisite_gates={"geometry": True, "classification": True}, applies=False)["state"], "NOT_APPLICABLE")
        self.assertEqual(resolve_rule_applicability(prerequisite_gates={"geometry": True, "classification": True}, applies=True)["state"], "APPLICABLE")
        self.assertEqual(resolve_rule_applicability(prerequisite_gates={"geometry": None, "classification": True}, applies=False)["state"], "RULE_EVALUATION_UNRESOLVED")

    def test_12_combined_fingerprint_is_deterministic(self):
        self.assertEqual(build_outputs()["decision.json"]["combined_dimensional_evaluator_fingerprint_sha256"], build_outputs()["decision.json"]["combined_dimensional_evaluator_fingerprint_sha256"])

    def test_13_deterministic_rebuild(self): self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_14_committed_artifacts_match(self):
        for name, value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__": unittest.main(verbosity=2)
