#!/usr/bin/env python3
from __future__ import annotations
import copy, json, unittest
from decimal import Decimal
from build import OUTPUT, _inputs, build_outputs
from resolver import PREDICATE_STATES, canonical_json, evaluate_interior_side_setback, evaluate_structure_compliance, validate_contract

class InteriorSideSetbackEvaluatorV0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.outputs, cls.inputs = build_outputs(), _inputs(); cls.evaluation = cls.outputs["evaluation.json"]
    def test_01_scope_and_shared_contract(self):
        self.assertEqual(self.outputs["contract.json"]["scope"]["apns"], ["6341302200"]); self.assertEqual(self.outputs["contract.json"]["scope"]["rule_families"], ["interior_side_setback"]); validate_contract(self.outputs["framework-contract.json"])
    def test_02_rule_identity(self):
        r=self.evaluation["applicable_rule"]; self.assertEqual(r["base_value_ft_each_interior_side"],4); self.assertEqual(r["source_edition"],"9-2026"); self.assertEqual(r["source_table"],"131-04D")
    def test_03_predicate_states(self):
        for p in self.evaluation["predicates"].values():
            self.assertIn(p["state"],PREDICATE_STATES)
            if p["state"] in {"UNKNOWN","SOURCE_UNAVAILABLE"}: self.assertIsNone(p["value"])
    def test_04_side_lines_resolved_without_street_side(self):
        p=self.evaluation["predicates"]; self.assertEqual(p["interior_side_property_lines"]["value"],["NORTH_BOUNDARY","SOUTH_BOUNDARY"]); self.assertEqual(p["lot_is_non_corner"]["state"],"TRUE"); self.assertEqual(self.evaluation["other_rule_families_evaluated"],[])
    def test_05_width_branches(self):
        w=self.evaluation["width_analysis"]; self.assertEqual(w["code_defined_lot_width_ft"],"94.00"); self.assertFalse(w["narrow_lot_threshold_met"]); self.assertTrue(w["reallocation_threshold_met"]); self.assertEqual(self.evaluation["predicates"]["lot_width_less_than_zone_minimum"]["state"],"FALSE")
    def test_06_narrow_branch_excluded(self):
        b=next(x for x in self.evaluation["conditional_branches"] if x["branch_id"]=="NARROW_LOT_EIGHT_PERCENT_EACH_SIDE"); self.assertEqual(b["value_ft"],"7.520"); self.assertEqual(b["parcel_disposition"],"EXCLUDED_PREDICATE_FALSE")
    def test_07_reallocation_cannot_reduce_base(self):
        b=next(x for x in self.evaluation["conditional_branches"] if x["branch_id"]=="OPTIONAL_SIDE_REALLOCATION"); self.assertIn("NO_REDUCTION_BELOW_BASE",b["parcel_disposition"]); self.assertEqual(self.evaluation["predicates"]["combined_table_side_setback_total"]["value"],"8_FT_FOR_TWO_INTERIOR_SIDES"); self.assertEqual(self.evaluation["predicates"]["reallocated_interior_side_floor"]["value"],"4_FT_EACH")
    def test_08_addition_continuation_stays_unknown(self):
        self.assertEqual(self.evaluation["predicates"]["existing_primary_structure_addition"]["state"],"UNKNOWN"); self.assertEqual(self.evaluation["predicates"]["established_side_setback_dimension"]["state"],"UNKNOWN")
    def test_09_accessory_and_projection_bounded(self):
        self.assertEqual(self.evaluation["predicates"]["small_lot_accessory_building_encroachment"]["state"],"FALSE"); self.assertEqual(self.evaluation["predicates"]["permitted_projection_or_encroachment"]["state"],"UNKNOWN"); self.assertEqual(self.evaluation["predicates"]["garage_within_embankment_rule"]["state"],"NOT_APPLICABLE")
    def test_10_packet35_fire_doctrine_integrated(self):
        f=self.evaluation["fire_integration"]; self.assertEqual(f["state"],"FIRE_BUFFER_PROJECT_REVIEW_REQUIRED"); self.assertIsNone(f["greater_buffer_ft"]); self.assertFalse(f["geography_determines_greater_buffer"])
    def test_11_requirement_conditional(self):
        self.assertEqual(self.evaluation["state"],"SETBACK_REQUIREMENT_CONDITIONAL"); self.assertIn("fire_official_defensible_space_buffer",self.evaluation["unresolved_requirement_predicates"]); self.assertIn("existing_primary_structure_addition",self.evaluation["unresolved_requirement_predicates"])
    def test_12_measurement_is_side_specific(self):
        d=self.evaluation["measurement_doctrine"]; self.assertIn("north",d["interior_side_property_lines"]); self.assertIn("south",d["interior_side_property_lines"]); self.assertIn("perpendicular",d["direction"]); self.assertIn("outer edge of the building frame",d["structure_edge"]); self.assertTrue(d["living_area_excluded"])
    def test_13_structure_compliance_not_evaluated(self):
        self.assertFalse(self.evaluation["structure_evidence"]["authoritative_current_structure_geometry"]); self.assertEqual(self.evaluation["compliance_state"],"SETBACK_COMPLIANCE_NOT_EVALUATED"); self.assertIsNone(self.evaluation["compliance"]["comparison"])
    def test_14_historical_diagnostic_not_forced(self):
        h=self.evaluation["historical_diagnostic"]; self.assertEqual(h["classification"],"HISTORICAL_DIAGNOSTIC_INTERIOR_SIDE_SETBACK"); self.assertEqual(h["state"],"NOT_MEASURED"); self.assertEqual(h["source_vintage"],"SPRING_2017_IMAGERY_BASELINE"); self.assertEqual(len(h["source_record_ids"]),2)
    def test_15_comparator_guard(self):
        blocked=evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_CONDITIONAL",measured_ft=Decimal("5"),required_ft=Decimal("4"),current_structure_geometry=True,structure_classification=True,measurement_semantics=True,projection_scope_resolved=True); self.assertEqual(blocked["state"],"SETBACK_COMPLIANCE_NOT_EVALUATED")
        passed=evaluate_structure_compliance(requirement_state="SETBACK_REQUIREMENT_RESOLVED",measured_ft=Decimal("5"),required_ft=Decimal("4"),current_structure_geometry=True,structure_classification=True,measurement_semantics=True,projection_scope_resolved=True); self.assertEqual(passed["state"],"RULE_REQUIREMENT_SATISFIED")
    def test_16_wrong_inputs_fail_closed(self):
        args=list(copy.deepcopy(self.inputs)); args[3]["geometry_reconstruction"]["reported_code_defined_lot_width_ft"]="49.00"; result=evaluate_interior_side_setback(*args); self.assertIn("resolved_width",result["failed_gates"])
        args=list(copy.deepcopy(self.inputs)); args[6]["state"]="FIRE_BUFFER_NOT_REQUIRED_BY_PUBLISHED_DETERMINISTIC_RULE"; result=evaluate_interior_side_setback(*args); self.assertIn("fire_doctrine",result["failed_gates"])
    def test_17_forbidden_conclusions_closed(self):
        for f in ("parcel_compliance_evaluated","development_capacity_calculated","capacity_calculated","current_structure_compliance_evaluated"): self.assertFalse(self.evaluation[f])
        self.assertIn("LEGAL_NONCONFORMITY",self.evaluation["forbidden_conclusions"])
    def test_18_product_sections(self):
        p=self.outputs["product-example.json"]; self.assertIn("applicable_interior_side_setback",p); self.assertIn("existing_structure",p); self.assertFalse(p["existing_structure"]["current_compliance_evaluated"]); self.assertFalse(p["ui_wired"])
    def test_19_provenance_complete(self):
        h=[x["hop"] for x in self.outputs["provenance.json"]["chain"]]; self.assertIn("WIDTH_TO_SIDE_BRANCHES",h); self.assertIn("PACKET_35_TO_FIRE_BRANCH",h); self.assertEqual(h[-2:],["PREDICATES_TO_REQUIREMENT_STATE","REQUIREMENT_TO_COMPLIANCE_GATE"])
    def test_20_pattern_next_decision(self):
        self.assertEqual(self.evaluation["setback_family_assessment"]["state"],"SETBACK_FAMILY_PATTERN_STABLE"); self.assertEqual(self.evaluation["next_rule_evaluation_target"],"street-side setback"); self.assertEqual(self.outputs["decision.json"]["decision"],"INTERIOR_SIDE_SETBACK_EVALUATOR_V0_READY")
    def test_21_deterministic_rebuild(self): self.assertEqual(canonical_json(build_outputs()),canonical_json(build_outputs()))
    def test_22_committed_artifacts_match(self):
        for name,value in self.outputs.items(): self.assertEqual(json.loads((OUTPUT/name).read_text()),value,name)
if __name__ == "__main__": unittest.main(verbosity=2)
