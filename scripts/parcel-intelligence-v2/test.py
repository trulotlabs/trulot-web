#!/usr/bin/env python3
from __future__ import annotations
import copy,importlib.util,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/parcel-intelligence-v2'))
from resolver import CONTRACT_VERSION,canonical,compose,fingerprint
DATA=ROOT/'data/parcel-intelligence-v2'
class CompositionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.inputs=json.loads((DATA/'fixtures.json').read_text())
  cls.corpus=json.loads((DATA/'fixture-results.json').read_text())
  cls.input_by_apn={x['identity']['apn']:x for x in cls.inputs['fixtures']}
  cls.by_apn={x['result']['identity']['apn']:x['result'] for x in cls.corpus['results']}
 def test_01_contract_and_real_corpus(self):
  self.assertEqual(self.corpus['contract_version'],CONTRACT_VERSION);self.assertEqual(self.corpus['fixture_count'],30);self.assertEqual(len(self.by_apn),30)
 def test_02_canonical_examples_present(self): self.assertTrue({'6341302200','3506320400','4304211000'}<=self.by_apn.keys())
 def test_03_top_states_are_closed(self): self.assertLessEqual({x['state'] for x in self.by_apn.values()},{'SUPPORTED','PARTIAL','SOURCE_UNAVAILABLE','IDENTITY_UNRESOLVED'})
 def test_04_outside_coastal_version(self):
  r=self.by_apn['6341302200'];self.assertEqual(r['coastal_context']['evidence_state'],'OUTSIDE_COASTAL');self.assertEqual(r['base_standards']['resolution_state'],'RESOLVED');self.assertEqual(r['base_standards']['provenance']['version_profile'],'outside-coastal-2026-09-30')
 def test_05_inside_coastal_version(self):
  r=self.by_apn['3506320400'];self.assertEqual(r['coastal_context']['evidence_state'],'INSIDE_COASTAL');self.assertEqual(r['base_standards']['resolution_state'],'RESOLVED');self.assertIn('inside-coastal',r['base_standards']['provenance']['version_profile'])
 def test_06_boundary_refuses_version(self):
  r=self.by_apn['3082980200'];self.assertEqual(r['coastal_context']['evidence_state'],'BOUNDARY_AMBIGUOUS');self.assertEqual(r['base_standards']['resolution_state'],'APPLICABILITY_UNRESOLVED');self.assertEqual(r['base_standards']['zone_results'],[])
 def test_07_split_preserves_every_zone_without_blending(self):
  r=self.by_apn['4304211000'];self.assertEqual([z['zone_code'] for z in r['zoning']['zone_evidence']],['RS-1-7','OR-1-1']);self.assertEqual([z['zone_code'] for z in r['base_standards']['zone_results']],['RS-1-7','OR-1-1']);self.assertFalse(r['standards_blended'])
 def test_08_split_rs_rs_keeps_separate_rule_sets(self):
  r=self.by_apn['3013101500'];self.assertEqual(r['zoning']['mapping_state'],'SPLIT_ZONE');self.assertEqual(len(r['base_standards']['zone_results']),2);self.assertTrue(all(z['resolution_state']=='RESOLVED' for z in r['base_standards']['zone_results']))
 def test_09_non_rs_visible_and_unsupported(self):
  r=self.by_apn['6782511200'];self.assertEqual(r['zoning']['zone_evidence'][0]['zone_code'],'IP-2-1');self.assertEqual(r['base_standards']['resolution_state'],'NOT_APPLICABLE');self.assertEqual(r['base_standards']['zone_results'][0]['rules'],[])
 def test_10_mapping_fail_closed(self):
  self.assertEqual(self.by_apn['7600360300']['base_standards']['resolution_state'],'MAPPING_UNRESOLVED');self.assertEqual(self.by_apn['2392600700']['zoning']['mapping_state'],'AMBIGUOUS')
 def test_11_source_zero_is_unknown(self):
  fact=self.by_apn['7600360300']['property_facts']['structure']['existing_dwelling_units'];self.assertEqual(fact['fact_state'],'unknown');self.assertIsNone(fact['value']);self.assertEqual(fact['state_reason'],'SOURCE_ZERO_UNRESOLVED')
 def test_12_historical_footprints_remain_historical(self):
  facts=self.by_apn['6341302200']['property_facts']['structure']['historical_footprints'];self.assertTrue(facts);self.assertTrue(all(any('Historical 2017' in x for x in f['limitations']) for f in facts));self.assertTrue(all('current' not in f['fact_key'] for f in facts))
 def test_13_stacked_identity_is_preserved(self): self.assertIn('STACK',self.by_apn['5891700512']['property_facts']['structure']['footprint_linkage']['state'])
 def test_14_missing_address_is_explicit(self):
  r=self.by_apn['3031701800'];self.assertIsNone(r['identity']['situs_address']);self.assertIn('SITUS_ADDRESS_UNAVAILABLE',{x['code'] for x in r['unresolved']})
 def test_15_packet8_exception_preserves_identity(self):
  r=self.by_apn['7600300100'];self.assertEqual(r['identity']['source_state'],'available');self.assertEqual(r['state'],'SOURCE_UNAVAILABLE');self.assertEqual(r['zoning']['source_state'],'source_unavailable')
 def test_16_condition_diagnostics_never_become_legal_facts(self):
  for r in self.by_apn.values():
   facts={x['fact_key']:x for x in r['property_facts']['parcel_conditions']}
   for key in ['legal_lot_width_ft','legal_lot_depth_ft','corner_lot_status','gross_floor_area_sqft']:
    self.assertEqual(facts[key]['state'],'unknown');self.assertIsNone(facts[key]['value'])
 def test_17_next_investigation_is_deterministic_and_bounded(self):
  r=self.by_apn['4304211000'];actions=[x['action'] for x in r['next_investigation']];self.assertEqual(actions,sorted(actions));self.assertIn('REVIEW_SPLIT_ZONE_GEOMETRY',actions);self.assertTrue(all(set(x)=={'action','reason','blocked_conclusion','required_evidence'} for x in r['next_investigation']))
 def test_18_provenance_closure(self):
  for r in self.by_apn.values():
   self.assertEqual(len(r['source_layers']),6)
   for source in r['source_layers']:
    if source['layer'] in {'Parcel V2','Base Zoning V2','Coastal Context V0'} and r['identity']['source_state']=='available': self.assertTrue(source['artifact_sha256'])
   for z in r['base_standards'].get('zone_results',[]):
    for rule in z.get('rules',[]): self.assertTrue(rule['source_evidence']['source_sha256']);self.assertTrue(rule['provenance_sha256']);self.assertTrue(rule['rule_id'])
 def test_19_secondary_source_failure_preserves_identity(self):
  b=copy.deepcopy(self.input_by_apn['6341302200']);b['structure_facts']=None;r=compose(b);self.assertEqual(r['identity']['state'],'supported');self.assertEqual(r['property_facts']['structure']['source_state'],'source_unavailable');self.assertNotEqual(r['state'],'IDENTITY_UNRESOLVED')
 def test_20_zoning_failure_preserves_identity(self):
  b=copy.deepcopy(self.input_by_apn['6341302200']);b['zoning'].update({'source_state':'source_unavailable','state':'unavailable','mapping_state':'UNAVAILABLE','mapping_evidence_state':None,'zone_evidence':[]});r=compose(b);self.assertEqual(r['identity']['state'],'supported');self.assertEqual(r['base_standards']['resolution_state'],'IDENTITY_OR_ZONING_UNAVAILABLE')
 def test_21_coastal_failure_preserves_zoning_and_refuses_version(self):
  b=copy.deepcopy(self.input_by_apn['6341302200']);b['coastal_context'].update({'source_state':'source_unavailable','state':'unavailable','value':'unknown','evidence_state':'SOURCE_UNAVAILABLE'});r=compose(b);self.assertEqual(r['zoning']['state'],'supported');self.assertEqual(r['base_standards']['resolution_state'],'SOURCE_UNAVAILABLE')
 def test_22_identity_failure(self):
  b=copy.deepcopy(self.input_by_apn['6341302200']);b['identity'].update({'source_state':'source_unavailable','state':'unavailable'});r=compose(b);self.assertEqual(r['state'],'IDENTITY_UNRESOLVED');self.assertEqual(r['answers']['what_property']['state'],'unavailable')
 def test_23_unsupported_standards_do_not_hide_zoning(self):
  r=self.by_apn['6782511200'];self.assertEqual(r['zoning']['state'],'supported');self.assertEqual(r['base_standards']['state'],'not_applicable')
 def test_24_product_answer_contract_excludes_capacity(self):
  for r in self.by_apn.values(): self.assertEqual(r['answers']['what_can_i_build']['state'],'not_evaluated');self.assertFalse(r['parcel_compliance_evaluated']);self.assertFalse(r['development_capacity_calculated'])
 def test_25_structured_truth_wording(self):
  r=self.by_apn['6341302200'];self.assertEqual(r['presentation']['base_zoning'],'Base zoning: RS-1-7');self.assertIn('Minimum lot width standard: 50 ft',[x['text'] for x in r['presentation']['rules']]);self.assertEqual(r['presentation']['development_capacity'],'Development capacity: not evaluated')
 def test_26_no_numeric_confidence_score(self):
  def walk(v):
   if isinstance(v,dict):
    for k,x in v.items(): self.assertNotIn(k,{'confidence_score','confidence_percent'});walk(x)
   elif isinstance(v,list):
    for x in v: walk(x)
  walk(self.corpus)
 def test_27_result_fingerprints(self):
  for r in self.by_apn.values():
   expected=r['fingerprint_sha256'];body={k:v for k,v in r.items() if k!='fingerprint_sha256'};self.assertEqual(expected,fingerprint(body))
 def test_28_corpus_fingerprint(self):
  expected=self.corpus['canonical_output_sha256'];body={k:v for k,v in self.corpus.items() if k!='canonical_output_sha256'};self.assertEqual(expected,fingerprint(body))
 def test_29_byte_identical_recomposition(self):
  rebuilt=[]
  for f in self.inputs['fixtures']: rebuilt.append({'fixture_id':f['fixture_id'],'coverage_tags':f['coverage_tags'],'result':compose(f)})
  body={'contract_version':CONTRACT_VERSION,'fixture_count':len(rebuilt),'results':rebuilt};body['canonical_output_sha256']=fingerprint(body)
  self.assertEqual(canonical(body),canonical(self.corpus))
 def test_30_required_examples_have_supported_facts_rules_unknowns_and_actions(self):
  for apn in ['6341302200','3506320400','4304211000']:
   r=self.by_apn[apn];self.assertTrue(r['identity']['apn']);self.assertTrue(r['base_standards']['zone_results']);self.assertTrue(r['unresolved']);self.assertTrue(r['next_investigation'])
 def test_31_unsupported_standards_version_fails_closed(self):
  b=copy.deepcopy(self.input_by_apn['6341302200']);b['as_of']='2027-01-01';r=compose(b);self.assertEqual(r['base_standards']['resolution_state'],'APPLICABILITY_UNRESOLVED');self.assertEqual(r['base_standards']['zone_results'],[])
if __name__=='__main__': unittest.main(verbosity=2)
