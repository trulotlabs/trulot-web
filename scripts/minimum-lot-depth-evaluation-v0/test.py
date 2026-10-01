#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import unittest

from build import OUTPUT, _inputs, build_outputs
from resolver import FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_lot_depth


class MinimumLotDepthEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.evaluation = cls.outputs["evaluation.json"]
        cls.parcel, cls.legal_lot, cls.rule, cls.measurement = _inputs()

    def test_01_exact_scope(self):
        self.assertEqual(self.outputs["contract.json"]["scope"], {"apns": ["6341302200"], "rule_families": ["minimum_lot_depth"]})
        self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_02_legal_lot_and_map_gates(self):
        self.assertEqual(self.evaluation["legal_lot"]["recorded_entity"], "PM 17383 PARCEL 1")
        self.assertEqual(self.evaluation["legal_lot"]["state"], "LEGAL_LOT_ESTABLISHED")
        self.assertEqual(self.evaluation["legal_lot"]["reconciliation_state"], "EXACT_RECORDED_LOT_MATCH")

    def test_03_depth_definition(self):
        doctrine = self.evaluation["measurement_doctrine"]
        self.assertEqual(doctrine["lot_depth"]["section"], "SDMC §113.0243(a)")
        self.assertIn("midpoint of the front property line", doctrine["lot_depth"]["definition"])
        self.assertEqual(doctrine["lot_depth"]["edition"], "7-2026")

    def test_04_front_and_rear_lines_are_deterministic(self):
        doctrine = self.evaluation["measurement_doctrine"]
        self.assertEqual(doctrine["front_property_line"]["state"], "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY")
        self.assertEqual(doctrine["rear_property_line"]["state"], "RESOLVED_OPPOSITE_MOST_DISTANT_WEST_LINE")
        self.assertFalse(doctrine["configuration"]["corner_lot"])
        self.assertFalse(doctrine["configuration"]["double_fronted_lot"])

    def test_05_public_right_of_way_is_outside_depth_geometry(self):
        doctrine = self.evaluation["measurement_doctrine"]
        self.assertEqual(doctrine["right_of_way_treatment"]["state"], "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY")
        self.assertEqual(doctrine["recorded_geometry"]["excluded_dedicated_street_portion"], {"width_ft": 30, "frontage_length_ft": 94})

    def test_06_recorded_dimensions_remain_distinct(self):
        distinctions = self.evaluation["dimension_distinctions"]
        self.assertIn("none is relabeled as lot depth", distinctions["recorded_boundary_lengths"])
        self.assertIn("midpoint", distinctions["code_defined_lot_depth"])

    def test_07_geometry_reconstruction(self):
        geometry = self.evaluation["geometry_reconstruction"]
        self.assertEqual(geometry["reported_code_defined_lot_depth_ft"], "235.02")
        self.assertEqual(geometry["assumptions"], [])
        self.assertFalse(geometry["parcel_v2_geometry_used"])
        self.assertIn("recorded to 0.01 ft", geometry["source_precision"])

    def test_08_rule_is_supported_and_unconditional(self):
        rule = self.evaluation["rule"]
        self.assertEqual(rule["numeric_value"], 95)
        self.assertEqual(rule["operator"], "MIN")
        self.assertEqual(rule["fact_state"], "RECORDED")
        self.assertEqual(rule["condition"], [])
        self.assertEqual(rule["source_table"], "131-04D")
        self.assertIn("NOT_APPLICABLE", rule["dependency_disposition"]["131.0442"])

    def test_09_only_one_comparison(self):
        self.assertEqual(self.evaluation["comparison"], {"expression": "code_defined_lot_depth_ft >= minimum_lot_depth_ft", "left": "235.02", "operator": ">=", "right": "95.0", "unit": "ft"})
        self.assertEqual(self.evaluation["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_10_bounded_wording(self):
        self.assertEqual(self.evaluation["bounded_conclusion"], "The supported Code-defined lot depth satisfies the RS-1-7 minimum lot depth standard.")
        self.assertIn("only the minimum-lot-depth rule", self.evaluation["mandatory_qualifier"])

    def test_11_forbidden_conclusions_closed(self):
        self.assertEqual(tuple(self.evaluation["forbidden_conclusions"]), FORBIDDEN_CONCLUSIONS)
        self.assertFalse(self.evaluation["parcel_compliance_evaluated"])
        self.assertFalse(self.evaluation["development_capacity_calculated"])
        encoded = canonical_json(self.outputs)
        for forbidden in ("maximum_units", "width_result", "frontage_result", "setback_result", "far_result", "subdivision_eligible"):
            self.assertNotIn(f'"{forbidden}"', encoded)

    def test_12_wrong_apn_refused(self):
        parcel = copy.deepcopy(self.parcel)
        parcel["identity"]["apn"] = "0000000000"
        self.assertIn("apn", evaluate_minimum_lot_depth(parcel, self.legal_lot, self.rule, self.measurement)["failed_gates"])

    def test_13_unresolved_front_or_rear_refused(self):
        for key in ("front_property_line", "rear_property_line"):
            measurement = copy.deepcopy(self.measurement)
            measurement[key]["state"] = "UNRESOLVED"
            result = evaluate_minimum_lot_depth(self.parcel, self.legal_lot, self.rule, measurement)
            self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")

    def test_14_conditional_rule_refused(self):
        rule = copy.deepcopy(self.rule)
        rule["condition"] = ["unresolved condition"]
        result = evaluate_minimum_lot_depth(self.parcel, self.legal_lot, rule, self.measurement)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")
        self.assertIn("rule_state", result["failed_gates"])

    def test_15_product_example_is_not_ui(self):
        product = self.outputs["product-example.json"]
        self.assertEqual(product["supported_measured_depth"], "235.02 ft")
        self.assertEqual(product["result"], "RULE_REQUIREMENT_SATISFIED")
        self.assertFalse(product["ui_wired"])

    def test_16_complete_provenance_chain(self):
        hops = [item["hop"] for item in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops, ["APN_TO_PARCEL_V2", "PARCEL_V2_TO_RECORDED_DEED", "DEED_TO_RECORDED_MAP", "RECORDED_MAP_TO_LEGAL_LOT", "MAP_TO_FRONT_REAR_LINES", "LINES_TO_CODE_DEPTH", "PARCEL_TO_BASE_ZONING", "PARCEL_TO_COASTAL_CONTEXT", "CONTEXT_TO_STANDARDS_VERSION", "STANDARDS_TO_RULE", "RULE_TO_COMPARISON"])

    def test_17_deterministic_rebuild(self):
        self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_18_committed_artifacts_match(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
