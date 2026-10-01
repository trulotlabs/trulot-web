#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import unittest
from decimal import Decimal

from build import OUTPUT, _inputs, build_outputs
from resolver import PREDICATE_STATES, canonical_json, evaluate_front_setback, evaluate_structure_compliance, validate_contract


class FrontSetbackEvaluatorV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.evaluation = cls.outputs["evaluation.json"]
        cls.inputs = _inputs()

    def test_01_exact_scope_and_shared_contract(self):
        self.assertEqual(self.outputs["contract.json"]["scope"]["apns"], ["6341302200"])
        self.assertEqual(self.outputs["contract.json"]["scope"]["rule_families"], ["front_setback"])
        validate_contract(self.outputs["framework-contract.json"])

    def test_02_current_rule_identity(self):
        rule = self.evaluation["applicable_rule"]
        self.assertEqual(rule["base_value_ft"], 15)
        self.assertEqual(rule["source_edition"], "9-2026")
        self.assertEqual(rule["source_table"], "131-04D")

    def test_03_all_predicates_use_explicit_states(self):
        self.assertTrue(self.evaluation["predicates"])
        for predicate in self.evaluation["predicates"].values():
            self.assertIn(predicate["state"], PREDICATE_STATES)
            if predicate["state"] in {"UNKNOWN", "SOURCE_UNAVAILABLE"}:
                self.assertIsNone(predicate["value"])

    def test_04_recorded_map_excludes_cul_de_sac_branch(self):
        self.assertEqual(self.evaluation["predicates"]["cul_de_sac_frontage_portion"]["state"], "FALSE")
        branch = next(x for x in self.evaluation["conditional_branches"] if x["branch_id"] == "CUL_DE_SAC_PERMISSION")
        self.assertEqual(branch["value_ft"], 10)
        self.assertEqual(branch["parcel_disposition"], "EXCLUDED_PREDICATE_FALSE")

    def test_05_slope_branch_remains_unknown(self):
        self.assertEqual(self.evaluation["predicates"]["front_50ft_fraction_at_least_25pct_slope"]["state"], "UNKNOWN")
        self.assertEqual(self.evaluation["predicates"]["defined_steep_hillside_condition"]["state"], "NOT_APPLICABLE")
        branch = next(x for x in self.evaluation["conditional_branches"] if x["branch_id"] == "SLOPE_PERMISSION")
        self.assertEqual(branch["value_ft"], 6)
        self.assertIn("PREDICATES_UNRESOLVED", branch["parcel_disposition"])

    def test_06_fire_branch_is_greater_and_unquantified(self):
        branch = next(x for x in self.evaluation["conditional_branches"] if x["branch_id"] == "FIRE_OFFICIAL_BUFFER")
        self.assertIsNone(branch["value_ft"])
        self.assertEqual(branch["operator"], "GREATER_THAN_OTHERWISE_APPLICABLE")
        self.assertEqual(self.evaluation["predicates"]["fire_official_defensible_space_buffer"]["state"], "UNKNOWN")

    def test_07_permissions_are_not_combined(self):
        self.assertIn("must not be subtracted", self.evaluation["non_cumulative_rule"])
        self.assertEqual(self.evaluation["valid_possible_requirement_branches"], ["BASE_TABLE:15_FT", "SLOPE_PERMISSION:6_FT_IF_QUALIFIED_AND_ELECTED", "FIRE_OFFICIAL_BUFFER:GREATER_VALUE_IF_REQUIRED"])

    def test_08_requirement_is_conditional(self):
        self.assertEqual(self.evaluation["state"], "SETBACK_REQUIREMENT_CONDITIONAL")
        self.assertNotEqual(self.evaluation["state"], "SETBACK_REQUIREMENT_RESOLVED")
        self.assertIn("front_50ft_fraction_at_least_25pct_slope", self.evaluation["unresolved_requirement_predicates"])
        self.assertEqual(self.evaluation["predicates"]["application_complete_date"]["state"], "NOT_APPLICABLE")

    def test_09_measurement_doctrine(self):
        doctrine = self.evaluation["measurement_doctrine"]
        self.assertIn("perpendicular", doctrine["direction"])
        self.assertIn("outer edge of the building frame", doctrine["structure_edge"])
        self.assertTrue(doctrine["living_area_excluded"])

    def test_10_structure_compliance_is_not_evaluated(self):
        self.assertFalse(self.evaluation["structure_evidence"]["authoritative_current_structure_geometry"])
        self.assertEqual(self.evaluation["compliance_state"], "SETBACK_COMPLIANCE_NOT_EVALUATED")
        self.assertIsNone(self.evaluation["compliance"]["comparison"])

    def test_11_historical_outlines_are_diagnostic_only(self):
        historical = self.evaluation["historical_diagnostic"]
        self.assertEqual(historical["classification"], "HISTORICAL_DIAGNOSTIC_SETBACK")
        self.assertEqual(historical["state"], "NOT_MEASURED")
        self.assertEqual(historical["source_vintage"], "SPRING_2017_IMAGERY_BASELINE")
        self.assertEqual(len(historical["source_record_ids"]), 2)

    def test_12_comparator_runs_only_after_all_gates(self):
        blocked = evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_CONDITIONAL", measured_ft=Decimal("20"), required_ft=Decimal("15"), current_structure_geometry=True, measurement_semantics=True, projection_scope_resolved=True)
        self.assertEqual(blocked["state"], "SETBACK_COMPLIANCE_NOT_EVALUATED")
        passed = evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_RESOLVED", measured_ft=Decimal("20"), required_ft=Decimal("15"), current_structure_geometry=True, measurement_semantics=True, projection_scope_resolved=True)
        self.assertEqual(passed["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_13_wrong_identity_fails_closed(self):
        parcel, legal_lot, rule, proposal, structure, authority = copy.deepcopy(self.inputs)
        parcel["identity"]["apn"] = "0000000000"
        result = evaluate_front_setback(parcel, legal_lot, rule, proposal, structure, authority)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")
        self.assertIn("apn", result["failed_gates"])

    def test_14_altered_dependency_set_fails_closed(self):
        parcel, legal_lot, rule, proposal, structure, authority = copy.deepcopy(self.inputs)
        rule["unresolved_dependencies"] = []
        result = evaluate_front_setback(parcel, legal_lot, rule, proposal, structure, authority)
        self.assertIn("dependencies", result["failed_gates"])

    def test_15_forbidden_conclusions_are_closed(self):
        for field in ("parcel_compliance_evaluated", "development_capacity_calculated", "capacity_calculated", "current_structure_compliance_evaluated"):
            self.assertFalse(self.evaluation[field])
        self.assertIn("LEGAL_NONCONFORMITY", self.evaluation["forbidden_conclusions"])
        self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_16_product_sections_are_distinct(self):
        product = self.outputs["product-example.json"]
        self.assertIn("applicable_front_setback", product)
        self.assertIn("existing_structure", product)
        self.assertFalse(product["existing_structure"]["current_compliance_evaluated"])
        self.assertFalse(product["ui_wired"])

    def test_17_provenance_is_complete(self):
        hops = [x["hop"] for x in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops[-2:], ["PREDICATES_TO_REQUIREMENT_STATE", "REQUIREMENT_TO_COMPLIANCE_GATE"])
        self.assertIn("FOOTNOTE_TO_SLOPE_BRANCH", hops)
        self.assertIn("SECTION_TO_CUL_DE_SAC_AND_FIRE_BRANCHES", hops)

    def test_18_next_source_is_single_and_exact(self):
        self.assertEqual(self.outputs["decision.json"]["next_feasibility_source_target"], "authoritative slope/topography for the front 50 feet")

    def test_19_decision_ready_without_compliance(self):
        self.assertEqual(self.outputs["decision.json"]["decision"], "FRONT_SETBACK_EVALUATOR_V0_READY")
        self.assertEqual(self.outputs["decision.json"]["compliance_result"], "SETBACK_COMPLIANCE_NOT_EVALUATED")

    def test_20_deterministic_rebuild(self):
        self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_21_committed_artifacts_match(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
