#!/usr/bin/env python3
from __future__ import annotations
import copy, json, unittest
from build import OUTPUT, _inputs, build_outputs
from resolver import FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_lot_width


class MinimumLotWidthEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs(); cls.evaluation = cls.outputs["evaluation.json"]
        cls.parcel, cls.legal_lot, cls.standard_rule, cls.corner_rule, cls.authority = _inputs()

    def test_01_exact_scope(self):
        self.assertEqual(self.outputs["contract.json"]["scope"], {"apns": ["6341302200"], "rule_families": ["minimum_lot_width"]}); self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_02_legal_lot_and_map_gates(self):
        self.assertEqual(self.evaluation["legal_lot"]["recorded_entity"], "PM 17383 PARCEL 1"); self.assertEqual(self.evaluation["legal_lot"]["state"], "LEGAL_LOT_ESTABLISHED"); self.assertEqual(self.evaluation["legal_lot"]["reconciliation_state"], "EXACT_RECORDED_LOT_MATCH")

    def test_03_width_definition(self):
        d = self.evaluation["measurement_doctrine"]["lot_width"]
        self.assertEqual(d["section"], "SDMC §113.0243(b)"); self.assertIn("right angles", d["definition"]); self.assertIn("point midway", d["definition"]); self.assertEqual(d["edition"], "7-2026")

    def test_04_lot_classification(self):
        c = self.evaluation["lot_classification"]
        self.assertEqual(c["state"], "SINGLE_FRONTAGE_INTERIOR_NON_CORNER"); self.assertFalse(c["corner_lot"]); self.assertFalse(c["double_fronted_lot"]); self.assertFalse(c["through_lot"])

    def test_05_corner_rule_excluded_and_standard_selected(self):
        r = self.evaluation["applicable_rule"]
        self.assertEqual(r["selection"], "STANDARD_MINIMUM_WIDTH"); self.assertEqual(r["numeric_value"], 50); self.assertEqual(r["excluded_rule"], {"standard_key": "corner_lot_width_min", "numeric_value": 55, "reason": "Parcel is not a corner lot."})

    def test_06_public_right_of_way_boundary(self):
        d = self.evaluation["measurement_doctrine"]
        self.assertEqual(d["right_of_way_treatment"]["state"], "RESOLVED_USE_BOUNDARY_SEPARATING_LOT_FROM_PUBLIC_RIGHT_OF_WAY"); self.assertEqual(d["property_lines"]["front"], "east boundary at west edge of 27th Street right-of-way")

    def test_07_width_geometry(self):
        g = self.evaluation["geometry_reconstruction"]
        self.assertEqual(g["reported_code_defined_lot_width_ft"], "94.00"); self.assertEqual(g["assumptions"], []); self.assertFalse(g["parcel_v2_geometry_used"]); self.assertIn("0.01 ft", g["source_precision"])

    def test_08_recorded_dimensions_remain_distinct(self):
        d = self.evaluation["dimension_distinctions"]
        self.assertIn("not relabeled", d["recorded_boundary_lengths"]); self.assertIn("not evaluated", d["frontage"]); self.assertIn("Perpendicular", d["code_defined_lot_width"])

    def test_09_only_one_comparison(self):
        self.assertEqual(self.evaluation["comparison"], {"expression": "code_defined_lot_width_ft >= applicable_minimum_width_ft", "left": "94.00", "operator": ">=", "right": "50.0", "unit": "ft"}); self.assertEqual(self.evaluation["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_10_bounded_wording(self):
        self.assertEqual(self.evaluation["bounded_conclusion"], "The supported Code-defined lot width satisfies the RS-1-7 minimum lot width standard."); self.assertIn("only the minimum-lot-width rule", self.evaluation["mandatory_qualifier"])

    def test_11_forbidden_conclusions_closed(self):
        self.assertEqual(tuple(self.evaluation["forbidden_conclusions"]), FORBIDDEN_CONCLUSIONS); self.assertFalse(self.evaluation["parcel_compliance_evaluated"]); self.assertFalse(self.evaluation["development_capacity_calculated"])
        encoded = canonical_json(self.outputs)
        for key in ("frontage_result", "setback_result", "far_result", "maximum_units", "subdivision_eligible"): self.assertNotIn(f'"{key}"', encoded)

    def test_12_wrong_apn_refused(self):
        p = copy.deepcopy(self.parcel); p["identity"]["apn"] = "0000000000"
        self.assertIn("apn", evaluate_minimum_lot_width(p, self.legal_lot, self.standard_rule, self.corner_rule, self.authority)["failed_gates"])

    def test_13_unresolved_corner_status_refused(self):
        a = copy.deepcopy(self.authority); a["lot_classification"]["state"] = "UNRESOLVED"; a["lot_classification"]["corner_lot"] = None
        result = evaluate_minimum_lot_width(self.parcel, self.legal_lot, self.standard_rule, self.corner_rule, a)
        self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED"); self.assertIn("lot_classification", result["failed_gates"]); self.assertIn("corner_rule_excluded", result["failed_gates"])

    def test_14_conditional_standard_rule_refused(self):
        r = copy.deepcopy(self.standard_rule); r["condition"] = ["unresolved condition"]
        self.assertIn("rule_state", evaluate_minimum_lot_width(self.parcel, self.legal_lot, r, self.corner_rule, self.authority)["failed_gates"])

    def test_15_unresolved_width_semantics_refused(self):
        a = copy.deepcopy(self.authority); a["width_definition_state"] = "UNRESOLVED"
        self.assertIn("width_definition", evaluate_minimum_lot_width(self.parcel, self.legal_lot, self.standard_rule, self.corner_rule, a)["failed_gates"])

    def test_16_unresolved_irregularity_refused(self):
        a = copy.deepcopy(self.authority); a["irregular_lot_disposition"]["state"] = "UNRESOLVED"
        self.assertIn("irregularity", evaluate_minimum_lot_width(self.parcel, self.legal_lot, self.standard_rule, self.corner_rule, a)["failed_gates"])

    def test_17_product_example_is_not_ui(self):
        p = self.outputs["product-example.json"]; self.assertEqual(p["required"], "50 ft"); self.assertEqual(p["supported_measured_width"], "94.00 ft"); self.assertEqual(p["lot_type"], "interior (single-frontage, non-corner)"); self.assertFalse(p["ui_wired"])

    def test_18_complete_provenance_chain(self):
        hops = [x["hop"] for x in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops, ["APN_TO_PARCEL_V2", "PARCEL_V2_TO_RECORDED_DEED", "DEED_TO_RECORDED_MAP", "MAP_TO_LOT_CLASSIFICATION", "MAP_TO_PROPERTY_LINES", "LINES_TO_CODE_WIDTH", "PARCEL_TO_BASE_ZONING", "PARCEL_TO_COASTAL_CONTEXT", "CONTEXT_TO_STANDARDS_VERSION", "CLASSIFICATION_TO_APPLICABLE_RULE", "RULE_TO_COMPARISON"])

    def test_19_deterministic_rebuild(self): self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_20_committed_artifacts_match(self):
        for name, value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__": unittest.main(verbosity=2)
