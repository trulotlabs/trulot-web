#!/usr/bin/env python3
from __future__ import annotations
import copy, json, unittest
from build import OUTPUT, _inputs, build_outputs
from resolver import FORBIDDEN_CONCLUSIONS, canonical_json, evaluate_minimum_frontage


class MinimumFrontageEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs = build_outputs(); cls.evaluation = cls.outputs["evaluation.json"]
        cls.parcel, cls.legal_lot, cls.rule, cls.authority = _inputs()

    def test_01_exact_scope(self):
        self.assertEqual(self.outputs["contract.json"]["scope"], {"apns": ["6341302200"], "rule_families": ["minimum_frontage"]}); self.assertEqual(self.evaluation["other_rule_families_evaluated"], [])

    def test_02_legal_lot_and_map_gates(self):
        self.assertEqual(self.evaluation["legal_lot"]["recorded_entity"], "PM 17383 PARCEL 1"); self.assertEqual(self.evaluation["legal_lot"]["state"], "LEGAL_LOT_ESTABLISHED"); self.assertEqual(self.evaluation["legal_lot"]["reconciliation_state"], "EXACT_RECORDED_LOT_MATCH")

    def test_03_frontage_definition(self):
        d = self.evaluation["measurement_doctrine"]["street_frontage"]
        self.assertEqual(d["definition"], "Street frontage means the length of one premises’ property line along the street it borders."); self.assertEqual(d["edition"], "7-2026")

    def test_04_row_boundary_is_frontage_line(self):
        d = self.evaluation["measurement_doctrine"]
        self.assertEqual(d["front_property_line"]["state"], "RESOLVED_27TH_STREET_RIGHT_OF_WAY_BOUNDARY"); self.assertEqual(d["right_of_way_treatment"]["state"], "RESOLVED_PROPERTY_LINE_ALONG_STREET")

    def test_05_recorded_straight_geometry(self):
        d = self.evaluation["measurement_doctrine"]
        self.assertEqual(d["street_geometry"]["state"], "STRAIGHT_NOT_TURNAROUND"); self.assertEqual(d["recorded_geometry"]["street_adjoining_property_line"], {"street": "27th Street", "role": "front development-regulation property line", "bearing": "N 00°03′42″ W", "length_ft": 94.0, "geometry": "straight line"})

    def test_06_conditional_rule_resolved(self):
        r = self.evaluation["applicable_rule"]
        self.assertEqual(r["numeric_value"], 50); self.assertEqual(r["fact_state"], "CONDITIONAL"); self.assertTrue(r["condition_resolved"]); self.assertEqual(r["exception_disposition"], "SECTION_131_0442_A_NOT_APPLICABLE")

    def test_07_frontage_measurement(self):
        m = self.evaluation["frontage_measurement"]
        self.assertEqual(m["code_defined_frontage_ft"], "94.00"); self.assertEqual(m["street"], "27th Street"); self.assertEqual(m["assumptions"], []); self.assertFalse(m["parcel_v2_geometry_used"])

    def test_08_only_one_comparison(self):
        self.assertEqual(self.evaluation["comparison"], {"expression": "code_defined_frontage_ft >= applicable_minimum_frontage_ft", "left": "94.00", "operator": ">=", "right": "50.0", "unit": "ft"}); self.assertEqual(self.evaluation["state"], "RULE_REQUIREMENT_SATISFIED")

    def test_09_bounded_wording(self):
        self.assertEqual(self.evaluation["bounded_conclusion"], "The supported Code-defined lot frontage satisfies the RS-1-7 minimum frontage standard."); self.assertIn("only the minimum-frontage rule", self.evaluation["mandatory_qualifier"])

    def test_10_frontage_is_not_access(self):
        d = self.evaluation["frontage_access_distinctions"]
        self.assertIn("evaluated", d["frontage"]); self.assertIn("not evaluated", d["legal_access"]); self.assertIn("not evaluated", d["driveway_access"]); self.assertIn("not evaluated", d["curb_cut_or_access_point"])

    def test_11_forbidden_conclusions_closed(self):
        self.assertEqual(tuple(self.evaluation["forbidden_conclusions"]), FORBIDDEN_CONCLUSIONS); self.assertFalse(self.evaluation["legal_access_evaluated"]); self.assertFalse(self.evaluation["driveway_access_evaluated"]); self.assertFalse(self.evaluation["parcel_compliance_evaluated"]); self.assertFalse(self.evaluation["development_capacity_calculated"])

    def test_12_wrong_apn_refused(self):
        p = copy.deepcopy(self.parcel); p["identity"]["apn"] = "0000000000"
        self.assertIn("apn", evaluate_minimum_frontage(p, self.legal_lot, self.rule, self.authority)["failed_gates"])

    def test_13_unresolved_definition_refused(self):
        a = copy.deepcopy(self.authority); a["frontage_definition_state"] = "UNRESOLVED"
        self.assertIn("frontage_definition", evaluate_minimum_frontage(self.parcel, self.legal_lot, self.rule, a)["failed_gates"])

    def test_14_unresolved_street_geometry_refused(self):
        a = copy.deepcopy(self.authority); a["street_geometry"]["state"] = "UNRESOLVED"
        result = evaluate_minimum_frontage(self.parcel, self.legal_lot, self.rule, a); self.assertEqual(result["state"], "RULE_EVALUATION_UNRESOLVED"); self.assertIn("street_geometry", result["failed_gates"])

    def test_15_unresolved_exception_refused(self):
        a = copy.deepcopy(self.authority); a["frontage_exception"]["state"] = "UNRESOLVED"
        self.assertIn("exception", evaluate_minimum_frontage(self.parcel, self.legal_lot, self.rule, a)["failed_gates"])

    def test_16_altered_rule_condition_refused(self):
        r = copy.deepcopy(self.rule); r["condition"] = ["unknown condition"]
        self.assertIn("rule_condition", evaluate_minimum_frontage(self.parcel, self.legal_lot, r, self.authority)["failed_gates"])

    def test_17_product_example_is_not_ui(self):
        p = self.outputs["product-example.json"]; self.assertEqual(p["required"], "50 ft"); self.assertEqual(p["supported_frontage"], "94.00 ft"); self.assertEqual(p["street"], "27th Street"); self.assertFalse(p["ui_wired"])

    def test_18_dimensional_pattern_ready_without_refactor(self):
        a = self.outputs["dimensional-evaluator-assessment.json"]; self.assertEqual(a["state"], "DIMENSIONAL_EVALUATOR_PATTERN_READY"); self.assertEqual(len(a["completed_rule_families"]), 4); self.assertFalse(a["refactor_performed"])

    def test_19_complete_provenance_chain(self):
        hops = [x["hop"] for x in self.outputs["provenance.json"]["chain"]]
        self.assertEqual(hops, ["APN_TO_PARCEL_V2", "PARCEL_V2_TO_RECORDED_DEED", "DEED_TO_RECORDED_MAP", "MAP_TO_STREET_PROPERTY_LINE", "PROPERTY_LINE_TO_CODE_FRONTAGE", "MAP_TO_EXCEPTION_PREDICATE", "PARCEL_TO_BASE_ZONING", "PARCEL_TO_COASTAL_CONTEXT", "CONTEXT_TO_STANDARDS_VERSION", "CONDITION_TO_APPLICABLE_RULE", "RULE_TO_COMPARISON"])

    def test_20_deterministic_rebuild(self): self.assertEqual(canonical_json(build_outputs()), canonical_json(build_outputs()))

    def test_21_committed_artifacts_match(self):
        for name, value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT / name).read_text()), value, name)


if __name__ == "__main__": unittest.main(verbosity=2)
