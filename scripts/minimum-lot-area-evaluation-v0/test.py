#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import unittest

from build import OUTPUT, _inputs, build_outputs
from resolver import FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_lot_area


class MinimumLotAreaEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs()
        cls.evaluation = cls.outputs["evaluation.json"]
        cls.parcel, cls.legal_lot, cls.rule, cls.denominator = _inputs()

    def test_01_exact_scope(self):
        self.assertEqual(self.outputs["contract.json"]["scope"], {"apns": ["6341302200"], "rule_families": ["minimum_lot_area"]})
        self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_02_legal_lot_gates(self):
        self.assertEqual(self.evaluation["legal_lot"]["recorded_entity"], "PM 17383 PARCEL 1")
        self.assertEqual(self.evaluation["legal_lot"]["state"], "LEGAL_LOT_ESTABLISHED")
        self.assertEqual(self.evaluation["legal_lot"]["reconciliation_state"], "EXACT_RECORDED_LOT_MATCH")
        self.assertEqual(self.evaluation["legal_lot"]["recorded_area"], {"value": .572, "unit": "acre"})
        self.assertEqual(self.evaluation["legal_lot"]["superseded_secondary_description"], "PM17383 PAR 2")

    def test_03_supported_zoning_and_context(self):
        self.assertEqual(self.evaluation["zoning"]["mapping_state"], "SINGLE_ZONE")
        self.assertEqual(self.evaluation["zoning"]["zone_code"], "RS-1-7")
        self.assertEqual(self.evaluation["zoning"]["coastal_state"], "OUTSIDE_COASTAL")
        self.assertEqual(self.evaluation["zoning"]["standards_version"], "sd-rs-base-standards-2026-09-30-v0")

    def test_04_rule_is_unconditional_recorded_minimum(self):
        rule = self.evaluation["rule"]
        self.assertEqual(rule["numeric_value"], 5000)
        self.assertEqual(rule["operator"], "MIN")
        self.assertEqual(rule["fact_state"], "RECORDED")
        self.assertEqual(rule["derivation_class"], "SOURCE_TRANSCRIPTION")
        self.assertEqual(rule["condition"], [])
        self.assertEqual(rule["jurisdiction_variant"], "OUTSIDE_COASTAL")
        self.assertEqual(rule["rule_set_version"], "sd-rs-base-standards-2026-09-30-v0")
        self.assertEqual(rule["source_table"], "131-04D")

    def test_05_exact_unit_conversion(self):
        normalization = self.evaluation["normalization"]
        self.assertEqual(normalization["original"], {"value": "0.572", "unit": "acre"})
        self.assertEqual(normalization["conversion"], "1 acre = 43,560 sq ft")
        self.assertEqual(normalization["gross_result_sqft"], "24916.320")
        self.assertIn("No rounding", normalization["rounding"])

    def test_06_public_right_of_way_is_excluded(self):
        area = self.evaluation["area_denominator"]
        self.assertEqual(area["state"], "RESOLVED_EXCLUDE_PUBLIC_RIGHT_OF_WAY")
        self.assertEqual(area["public_right_of_way_area"]["value"], "2820")
        self.assertEqual(area["code_lot_area_used"]["value"], "22096.320")
        self.assertEqual(area["pre_dedication_exception_scope"], "MAXIMUM_PERMITTED_DENSITY_AND_MAXIMUM_PERMITTED_GROSS_FLOOR_AREA_ONLY")

    def test_07_only_one_comparison(self):
        self.assertEqual(self.evaluation["comparison"], {"expression": "code_lot_area_sqft >= minimum_lot_area_sqft", "left": "22096.320", "operator": ">=", "right": "5000.0", "unit": "sq_ft"})
        self.assertEqual(self.evaluation["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_08_bounded_wording(self):
        self.assertEqual(self.evaluation["bounded_conclusion"], "The supported Code-defined lot area satisfies the RS-1-7 minimum lot area standard.")
        self.assertIn("only the minimum-lot-area rule", self.evaluation["mandatory_qualifier"])

    def test_09_forbidden_conclusions_closed(self):
        self.assertEqual(tuple(self.evaluation["forbidden_conclusions"]), FORBIDDEN_CONCLUSIONS)
        self.assertFalse(self.evaluation["parcel_compliance_evaluated"])
        self.assertFalse(self.evaluation["development_capacity_calculated"])
        encoded = canonical_json(self.outputs)
        for forbidden in ("maximum_units", "far_result", "setback_result", "subdivision_eligible", "permit_likelihood"):
            self.assertNotIn(f'"{forbidden}"', encoded)

    def test_10_wrong_apn_refused(self):
        parcel = copy.deepcopy(self.parcel)
        parcel["identity"]["apn"] = "0000000000"
        self.assertIn("apn", evaluate_minimum_lot_area(parcel, self.legal_lot, self.rule, self.denominator)["failed_gates"])

    def test_11_unresolved_denominator_refused(self):
        denominator = copy.deepcopy(self.denominator)
        denominator["state"] = "UNRESOLVED"
        result = evaluate_minimum_lot_area(self.parcel, self.legal_lot, self.rule, denominator)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")
        self.assertIn("denominator", result["failed_gates"])

    def test_12_conditional_rule_refused(self):
        rule = copy.deepcopy(self.rule)
        rule["condition"] = ["unresolved condition"]
        result = evaluate_minimum_lot_area(self.parcel, self.legal_lot, rule, self.denominator)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED")
        self.assertIn("rule_state", result["failed_gates"])

    def test_13_product_example_is_not_ui(self):
        product = self.outputs["product-example.json"]
        self.assertEqual(product["supported_parcel_area_used_for_rule"], "22,096.32 sq ft")
        self.assertFalse(product["ui_wired"])

    def test_14_complete_provenance_chain(self):
        hops = [item["hop"] for item in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops, ["APN_TO_PARCEL_V2", "PARCEL_V2_TO_RECORDED_DEED", "DEED_TO_RECORDED_MAP", "RECORDED_MAP_TO_LEGAL_LOT", "LEGAL_AREA_TO_CODE_DENOMINATOR", "PARCEL_TO_BASE_ZONING", "PARCEL_TO_COASTAL_CONTEXT", "CONTEXT_TO_STANDARDS_VERSION", "STANDARDS_TO_RULE", "RULE_TO_COMPARISON"])

    def test_15_deterministic_rebuild(self):
        self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_16_committed_artifacts_match(self):
        for name, value in self.outputs.items():
            self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
