#!/usr/bin/env python3
from __future__ import annotations
import copy,json,unittest
from build import OUTPUT,_inputs,build_outputs
from resolver import evaluate_street_side_applicability,parcel_line_facts
from dimensional_rule_evaluator_v0 import canonical_json,validate_contract
class StreetSideApplicabilityV0Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.outputs=build_outputs();cls.e=cls.outputs['evaluation.json'];cls.inputs=_inputs()
 def test_01_scope_and_contract(self):self.assertEqual(self.outputs['contract.json']['scope']['apns'],['6341302200']);validate_contract(self.outputs['framework-contract.json'])
 def test_02_rule_available_but_not_selected(self):self.assertEqual(self.e['rule_availability']['state'],'AVAILABLE_FOR_APPLICABLE_PARCELS');self.assertEqual(self.e['rule_availability']['table_value_ft_evidence_only'],5);self.assertFalse(self.e['rule_availability']['numeric_rule_selected_for_this_parcel'])
 def test_03_definition_and_special_cases(self):
  d=self.e['applicability_doctrine'];self.assertIn('abuts public right-of-way',d['street_side_property_line']);self.assertIn('front property lines',d['double_fronted_lot']);self.assertIn('not a street property line',d['alley']);self.assertIn('preserves original',d['resubdivided_corner_lot'])
 def test_04_current_geometry_is_noncorner_single_frontage(self):
  f=self.e['line_facts'];self.assertEqual(f['classification_state'],'SINGLE_FRONTAGE_INTERIOR_NON_CORNER');self.assertFalse(f['corner_lot']);self.assertEqual(f['street_adjacencies'],[{'line':'EAST_FRONT','role':'FRONT','street':'27TH_STREET'}]);self.assertFalse(f['north_side_abuts_public_right_of_way']);self.assertFalse(f['south_side_abuts_public_right_of_way'])
 def test_05_current_parcel_not_applicable(self):self.assertEqual(self.e['state'],'STREET_SIDE_SETBACK_NOT_APPLICABLE');self.assertEqual(self.e['truth_state'],'NOT_APPLICABLE');self.assertIsNone(self.e['applicable_requirement'])
 def test_06_no_numeric_or_compliance(self):self.assertFalse(self.e['numeric_comparison_performed']);self.assertFalse(self.e['compliance_evaluated']);self.assertFalse(self.e['structure_compliance_evaluated']);self.assertFalse(self.e['development_capacity_calculated'])
 def test_07_true_corner_not_not_applicable(self):
  args=self.inputs;facts=parcel_line_facts(args[3]);facts.update(corner_lot=True,classification_state='CORNER_LOT',north_side_abuts_public_right_of_way=True);r=evaluate_street_side_applicability(*args,line_facts=facts);self.assertEqual(r['state'],'STREET_SIDE_SETBACK_APPLICABLE_REQUIRES_RULE_EVALUATION');self.assertNotEqual(r['state'],'STREET_SIDE_SETBACK_NOT_APPLICABLE')
 def test_08_unresolved_corner_status_fails_closed(self):
  args=self.inputs;facts=parcel_line_facts(args[3]);facts['corner_lot']=None;r=evaluate_street_side_applicability(*args,line_facts=facts);self.assertEqual(r['state'],'RULE_EVALUATION_UNRESOLVED');self.assertNotEqual(r['state'],'STREET_SIDE_SETBACK_NOT_APPLICABLE')
 def test_09_missing_geometry_fails_closed(self):
  args=self.inputs;facts=parcel_line_facts(args[3]);facts['geometry_complete_for_line_roles']=False;r=evaluate_street_side_applicability(*args,line_facts=facts);self.assertEqual(r['state'],'RULE_EVALUATION_UNRESOLVED')
 def test_10_resubdivided_corner_not_not_applicable(self):
  args=self.inputs;facts=parcel_line_facts(args[3]);facts['resubdivided_corner_lot']=True;r=evaluate_street_side_applicability(*args,line_facts=facts);self.assertEqual(r['state'],'STREET_SIDE_SETBACK_APPLICABLE_REQUIRES_RULE_EVALUATION')
 def test_11_double_fronted_does_not_invent_street_side(self):self.assertFalse(self.e['line_facts']['double_fronted_lot']);self.assertEqual(self.e['predicate_states']['double_fronted_lot']['state'],'FALSE')
 def test_12_product_wording(self):
  w=self.outputs['product-example.json']['street_side_setback']['display'];self.assertIn('Not applicable',w);self.assertNotIn('compliant',w.lower());self.assertNotIn('zero',w.lower());self.assertNotIn('waived',w.lower())
 def test_13_truth_state_is_not_false_zero_or_unknown(self):self.assertEqual(self.e['predicate_states']['street_side_rule_applicability']['state'],'NOT_APPLICABLE');self.assertIsNone(self.e['predicate_states']['street_side_rule_applicability']['value'])
 def test_14_family_summary(self):self.assertEqual(self.e['setback_family_summary'],{'front':'CONDITIONAL','rear':'CONDITIONAL','interior_side':'CONDITIONAL','street_side':'NOT_APPLICABLE','overall_compliance_computed':False})
 def test_15_next_move_and_decision(self):self.assertEqual(self.e['next_feasibility_step'],'parcel feasibility summary V0');self.assertEqual(self.outputs['decision.json']['decision'],'STREET_SIDE_SETBACK_APPLICABILITY_V0_READY')
 def test_16_provenance(self):
  h=[x['hop'] for x in self.outputs['provenance.json']['chain']];self.assertIn('CODE_TO_STREET_SIDE_DEFINITION',h);self.assertEqual(h[-1],'APPLICABILITY_GATE')
 def test_17_wrong_rule_fails_closed(self):
  args=list(copy.deepcopy(self.inputs));args[2]['standard_key']='interior_side_setback_min';r=evaluate_street_side_applicability(*args);self.assertEqual(r['state'],'RULE_EVALUATION_UNRESOLVED')
 def test_18_deterministic(self):self.assertEqual(canonical_json(build_outputs()),canonical_json(build_outputs()))
 def test_19_artifacts_match(self):
  for n,v in self.outputs.items():self.assertEqual(json.loads((OUTPUT/n).read_text()),v,n)
if __name__=='__main__':unittest.main(verbosity=2)
