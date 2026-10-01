#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import unittest
from decimal import Decimal

from build import OUTPUT, _inputs, build_outputs
from resolver import PREDICATE_STATES, canonical_json, evaluate_rear_setback, evaluate_structure_compliance, validate_contract


class RearSetbackEvaluatorV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.evaluation = cls.outputs["evaluation.json"]
        cls.inputs = _inputs()

    def test_01_exact_scope_and_shared_contract(self):
        self.assertEqual(self.outputs["contract.json"]["scope"]["apns"], ["6341302200"])
        self.assertEqual(self.outputs["contract.json"]["scope"]["rule_families"], ["rear_setback"])
        validate_contract(self.outputs["framework-contract.json"])

    def test_02_current_rule_identity(self):
        rule = self.evaluation["applicable_rule"]
        self.assertEqual(rule["table_value_ft"], 13)
        self.assertEqual(rule["source_edition"], "9-2026")
        self.assertEqual(rule["source_table"], "131-04D")

    def test_03_all_predicates_use_explicit_states(self):
        for predicate in self.evaluation["predicates"].values():
            self.assertIn(predicate["state"], PREDICATE_STATES)
            if predicate["state"] in {"UNKNOWN", "SOURCE_UNAVAILABLE"}:
                self.assertIsNone(predicate["value"])

    def test_04_long_lot_formula_is_exact(self):
        depth = self.evaluation["depth_adjustment"]
        self.assertEqual(depth["lot_depth_ft"], "235.02")
        self.assertEqual(depth["ten_percent_ft"], "23.5020")
        self.assertEqual(depth["result_ft"], "23.5020")
        self.assertEqual(depth["branch"], "LONG_LOT_EXPLICIT_EXCEPTION")

    def test_05_malformed_general_reference_is_not_silently_repaired(self):
        self.assertEqual(self.evaluation["predicates"]["general_table_cross_reference_valid"]["state"], "FALSE")
        self.assertEqual(self.evaluation["predicates"]["long_lot_clause_table_cross_reference_valid"]["state"], "TRUE")
        self.assertIn("EXPLICIT_TABLE_131_04D", self.evaluation["applicable_rule"]["cross_reference_disposition"])

    def test_06_ordinary_depth_would_fail_closed_on_bad_reference(self):
        parcel, legal_lot, rule, depth, area, structure, authority = copy.deepcopy(self.inputs)
        depth["geometry_reconstruction"]["reported_code_defined_lot_depth_ft"] = "120.00"
        depth["state"] = "RULE_REQUIREMENT_SATISFIED"
        # The sealed-depth baseline gate must reject tampering before branch selection.
        result = evaluate_rear_setback(parcel, legal_lot, rule, depth, area, structure, authority)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")
        self.assertIn("resolved_depth", result["failed_gates"])

    def test_07_recorded_map_excludes_alley_branches(self):
        self.assertEqual(self.evaluation["predicates"]["rear_yard_abuts_alley"]["state"], "FALSE")
        branch = next(x for x in self.evaluation["conditional_branches"] if x["branch_id"] == "REAR_ALLEY_CREDIT")
        self.assertEqual(branch["parcel_disposition"], "EXCLUDED_PREDICATE_FALSE")
        self.assertEqual(self.evaluation["predicates"]["parking_access_taken_from_rear_alley"]["state"], "NOT_APPLICABLE")

    def test_08_accessory_and_garage_branches_are_bounded(self):
        self.assertEqual(self.evaluation["predicates"]["garage_within_embankment_rule"]["state"], "NOT_APPLICABLE")
        self.assertEqual(self.evaluation["predicates"]["small_lot_accessory_building_encroachment"]["state"], "FALSE")

    def test_09_fire_branch_is_greater_and_unquantified(self):
        branch = next(x for x in self.evaluation["conditional_branches"] if x["branch_id"] == "FIRE_OFFICIAL_BUFFER")
        self.assertIsNone(branch["value_ft"])
        self.assertEqual(branch["operator"], "GREATER_THAN_OTHERWISE_APPLICABLE")
        self.assertEqual(self.evaluation["predicates"]["fire_official_defensible_space_buffer"]["state"], "UNKNOWN")

    def test_10_requirement_is_conditional(self):
        self.assertEqual(self.evaluation["state"], "SETBACK_REQUIREMENT_CONDITIONAL")
        self.assertIn("fire_official_defensible_space_buffer", self.evaluation["unresolved_requirement_predicates"])
        self.assertEqual(self.evaluation["predicates"]["application_complete_date"]["state"], "NOT_APPLICABLE")

    def test_11_measurement_doctrine_is_rear_specific(self):
        doctrine = self.evaluation["measurement_doctrine"]
        self.assertIn("west rear property line", doctrine["direction"])
        self.assertIn("outer edge of the building frame", doctrine["structure_edge"])
        self.assertIn("no rear alley", doctrine["alley_treatment"])
        self.assertTrue(doctrine["living_area_excluded"])

    def test_12_structure_compliance_is_not_evaluated(self):
        self.assertFalse(self.evaluation["structure_evidence"]["authoritative_current_structure_geometry"])
        self.assertEqual(self.evaluation["compliance_state"], "SETBACK_COMPLIANCE_NOT_EVALUATED")
        self.assertIsNone(self.evaluation["compliance"]["comparison"])

    def test_13_historical_outlines_are_diagnostic_only(self):
        historical = self.evaluation["historical_diagnostic"]
        self.assertEqual(historical["classification"], "HISTORICAL_DIAGNOSTIC_REAR_SETBACK")
        self.assertEqual(historical["state"], "NOT_MEASURED")
        self.assertEqual(historical["source_vintage"], "SPRING_2017_IMAGERY_BASELINE")
        self.assertEqual(len(historical["source_record_ids"]), 2)

    def test_14_comparator_runs_only_after_all_gates(self):
        blocked = evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_CONDITIONAL", measured_ft=Decimal("30"), required_ft=Decimal("23.502"), current_structure_geometry=True, structure_classification=True, measurement_semantics=True, projection_scope_resolved=True)
        self.assertEqual(blocked["state"], "SETBACK_COMPLIANCE_NOT_EVALUATED")
        passed = evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_RESOLVED", measured_ft=Decimal("30"), required_ft=Decimal("23.502"), current_structure_geometry=True, structure_classification=True, measurement_semantics=True, projection_scope_resolved=True)
        self.assertEqual(passed["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_15_wrong_identity_and_dependencies_fail_closed(self):
        parcel, legal_lot, rule, depth, area, structure, authority = copy.deepcopy(self.inputs)
        parcel["identity"]["apn"] = "0000000000"
        result = evaluate_rear_setback(parcel, legal_lot, rule, depth, area, structure, authority)
        self.assertIn("apn", result["failed_gates"])
        parcel, legal_lot, rule, depth, area, structure, authority = copy.deepcopy(self.inputs)
        rule["unresolved_dependencies"] = []
        result = evaluate_rear_setback(parcel, legal_lot, rule, depth, area, structure, authority)
        self.assertIn("dependencies", result["failed_gates"])

    def test_16_forbidden_conclusions_are_closed(self):
        for field in ("parcel_compliance_evaluated", "development_capacity_calculated", "capacity_calculated", "current_structure_compliance_evaluated"):
            self.assertFalse(self.evaluation[field])
        self.assertIn("LEGAL_NONCONFORMITY", self.evaluation["forbidden_conclusions"])
        self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_17_product_sections_are_distinct(self):
        product = self.outputs["product-example.json"]
        self.assertIn("applicable_rear_setback", product)
        self.assertIn("existing_structure", product)
        self.assertFalse(product["existing_structure"]["current_compliance_evaluated"])
        self.assertFalse(product["ui_wired"])

    def test_18_provenance_is_complete(self):
        hops = [x["hop"] for x in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops[-2:], ["PREDICATES_TO_REQUIREMENT_STATE", "REQUIREMENT_TO_COMPLIANCE_GATE"])
        self.assertIn("LONG_LOT_CLAUSE_TO_DEPTH_ADJUSTED_BRANCH", hops)
        self.assertIn("SECTION_TO_ALLEY_AND_FIRE_BRANCHES", hops)

    def test_19_pattern_and_next_source_are_exact(self):
        self.assertEqual(self.evaluation["setback_family_assessment"]["state"], "SETBACK_FAMILY_PATTERN_READY")
        self.assertEqual(self.outputs["decision.json"]["next_feasibility_source_target"], "Fire Official / defensible-space applicability")

    def test_20_decision_ready_without_compliance(self):
        self.assertEqual(self.outputs["decision.json"]["decision"], "REAR_SETBACK_EVALUATOR_V0_READY")
        self.assertEqual(self.outputs["decision.json"]["compliance_result"], "SETBACK_COMPLIANCE_NOT_EVALUATED")

    def test_21_deterministic_rebuild(self):
        self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_22_committed_artifacts_match(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
