#!/usr/bin/env python3
from __future__ import annotations
import copy,json,unittest
from build import OUTPUT,_inputs,build_outputs
from resolver import FORBIDDEN_CONCLUSIONS,compose_summary
from dimensional_rule_evaluator_v0 import canonical_json
class ParcelFeasibilitySummaryV0Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.outputs=build_outputs();cls.s=cls.outputs['summary.json'];cls.inputs=_inputs()
 def test_01_contract_and_scope(self):self.assertEqual(self.outputs['contract.json']['schema'],'ParcelFeasibilitySummaryV0');self.assertEqual(self.outputs['contract.json']['scope']['apns'],['6341302200'])
 def test_02_identity_legal_zone_coastal(self):self.assertEqual(self.s['apn'],'6341302200');self.assertEqual(self.s['legal_lot']['state'],'LEGAL_LOT_ESTABLISHED');self.assertEqual(self.s['zoning']['zone_code'],'RS-1-7');self.assertEqual(self.s['zoning']['coastal_context'],'OUTSIDE_COASTAL')
 def test_03_exact_result_class_counts(self):self.assertEqual(self.s['result_counts'],{'satisfied':4,'not_satisfied':0,'conditional':3,'not_applicable':1,'not_evaluated':4})
 def test_04_satisfied_states_preserved(self):
  expected={'minimum_lot_area':('22096.320','5000.0','sq_ft'),'minimum_lot_depth':('235.02','95.0','ft'),'minimum_lot_width':('94.00','50.0','ft'),'minimum_frontage':('94.00','50.0','ft')}
  for item in self.s['rule_results']['satisfied']:
   self.assertEqual(item['state'],'RULE_REQUIREMENT_SATISFIED');self.assertEqual((item['supported_value']['value'],item['required_value']['value'],item['supported_value']['unit']),expected[item['rule_family']])
 def test_05_no_not_satisfied_results(self):self.assertEqual(self.s['rule_results']['not_satisfied'],[])
 def test_06_conditional_states_preserved(self):
  items={x['rule_family']:x for x in self.s['rule_results']['conditional']};self.assertEqual(set(items),{'front_setback','rear_setback','interior_side_setback'})
  for x in items.values():self.assertEqual(x['state'],'SETBACK_REQUIREMENT_CONDITIONAL');self.assertEqual(x['structure_compliance'],'SETBACK_COMPLIANCE_NOT_EVALUATED')
  self.assertEqual(items['front_setback']['ordinary_base']['value'],'15');self.assertEqual(items['rear_setback']['ordinary_base']['value'],'23.5020');self.assertEqual(items['interior_side_setback']['ordinary_base']['value'],'4')
 def test_07_street_side_not_applicable(self):
  x=self.s['rule_results']['not_applicable'];self.assertEqual(len(x),1);self.assertEqual(x[0]['rule_family'],'street_side_setback');self.assertEqual(x[0]['state'],'NOT_APPLICABLE');self.assertFalse(x[0]['numeric_requirement_selected'])
 def test_08_not_evaluated_families(self):self.assertEqual({x['rule_family'] for x in self.s['rule_results']['not_evaluated']},{'height','far','lot_coverage','structure_compliance'})
 def test_09_top_level_state_is_bounded(self):self.assertEqual(self.s['state'],'PARTIAL_BASE_RULE_FEASIBILITY_ESTABLISHED');self.assertNotIn(self.s['state'],{'FEASIBLE','BUILDABLE','COMPLIANT','DEVELOPMENT_READY'})
 def test_10_human_summary_is_exactly_bounded(self):
  h=self.s['human_summary'];self.assertIn('four base dimensional requirements',h);self.assertIn('Setback requirements remain conditional',h);self.assertNotIn('parcel meets zoning',h.lower());self.assertNotIn('buildable',h.lower())
 def test_11_knows_list(self):self.assertEqual(len(self.s['what_trulot_knows']),7);self.assertIn('Legal lot established',self.s['what_trulot_knows']);self.assertIn('Minimum frontage rule satisfied',self.s['what_trulot_knows'])
 def test_12_unresolved_compact_groups(self):
  u=' '.join(self.s['unresolved_evidence']).lower()
  for term in ['front setback','rear setback','interior-side','fire code official','structure geometry','height','far','lot coverage','proposal facts']:self.assertIn(term,u)
 def test_13_investigation_order(self):self.assertEqual([x['target'] for x in self.s['next_investigation_order']],['current structure geometry','height and FAR inputs','project-specific Fire review','front slope methodology if needed','project proposal facts'])
 def test_14_product_bridge(self):self.assertEqual(self.s['product_bridge']['evaluated_so_far'],'4 base dimensional rules satisfied.');self.assertEqual(self.s['product_bridge']['capacity'],'Not evaluated.');self.assertFalse(self.s['product_bridge']['ui_wired'])
 def test_15_expert_bridge(self):self.assertIn('source/provenance',self.s['expert_detail_bridge']['fields']);self.assertIn('Conditional',self.s['expert_detail_bridge']['conditional_display']);self.assertFalse(self.s['expert_detail_bridge']['ui_wired'])
 def test_16_forbidden_aggregation(self):
  self.assertEqual(self.s['forbidden_aggregation']['forbidden_conclusions'],FORBIDDEN_CONCLUSIONS);self.assertFalse(self.s['capacity']['calculated']);self.assertFalse(self.s['overall_compliance']['conclusion_emitted']);self.assertEqual(self.s['new_rule_families_evaluated'],[])
 def test_17_each_composed_rule_has_origin(self):
  composed=self.s['rule_results']['satisfied']+self.s['rule_results']['conditional']+self.s['rule_results']['not_applicable'];self.assertEqual(len(composed),len(self.s['provenance']));
  for x in composed:self.assertRegex(x['origin']['evaluation_fingerprint_sha256'],r'^[0-9a-f]{64}$')
 def test_18_semantic_mismatch_stops(self):
  inputs=copy.deepcopy(self.inputs);inputs['minimum_lot_area']['state']='RULE_REQUIREMENT_NOT_SATISFIED';r=compose_summary(inputs);self.assertEqual(r['state'],'SUMMARY_COMPOSITION_SOURCE_MISMATCH');self.assertIn('minimum_lot_area',r['failed_input_seals'])
 def test_19_no_recomputation_or_new_family(self):self.assertEqual(self.s['new_rule_families_evaluated'],[]);self.assertEqual(self.outputs['decision.json']['new_rule_family_evaluated'],False)
 def test_20_next_move_and_decision(self):self.assertEqual(self.s['next_feasibility_source_target'],'current structure geometry');self.assertEqual(self.outputs['decision.json']['decision'],'PARCEL_FEASIBILITY_SUMMARY_V0_READY')
 def test_21_fingerprint_recomputes(self):
  from dimensional_rule_evaluator_v0 import fingerprint
  copy_s=dict(self.s);actual=copy_s.pop('fingerprint_sha256');self.assertEqual(actual,fingerprint(copy_s))
 def test_22_deterministic(self):self.assertEqual(canonical_json(build_outputs()),canonical_json(build_outputs()))
 def test_23_artifacts_match(self):
  for n,v in self.outputs.items():self.assertEqual(json.loads((OUTPUT/n).read_text()),v,n)
if __name__=='__main__':unittest.main(verbosity=2)
