#!/usr/bin/env python3
import copy,gzip,hashlib,json,unittest
from build import OUT,P79,P80,P81,TARGETS,RS_TARGETS,RM_TARGETS,RT_TARGETS,build,validate_selection_record

EXPECTED={
'RS-1-5':(1486,1007,964,503,2,17,879,586,21,959),'RS-1-12':(995,851,733,251,5,6,0,995,0,738),'RS-1-9':(866,835,826,36,0,4,9,856,1,826),'RM-4-11':(393,347,342,50,0,1,0,393,0,342),'RS-1-3':(889,305,223,657,0,9,60,823,6,223),'RT-1-4':(214,213,205,2,0,7,214,0,0,205),'RS-1-10':(59,51,32,7,0,20,44,0,15,29),'RT-1-5':(46,33,31,15,0,0,33,13,0,31)}

class Packet82Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.o=build();cls.profiles={p['zone_code']:p for p in cls.o['rule-profiles.json']['profiles']};cls.notes=cls.o['footnotes.json']['footnotes']

 def test_01_prior_integrity(self):
  r=json.loads((P79/'receipt.json').read_text());self.assertEqual((r['rows'],r['distinct_apns']),(393733,393733));self.assertEqual(self.o['coverage.json']['residential_unique_apns'],326532);self.assertEqual(json.loads((P80/'coverage.json').read_text())['after_packet80_unique_apns'],305526);self.assertEqual(json.loads((P81/'coverage.json').read_text())['after_packet81_unique_apns'],322891)
  for directory in (P80,P81):
   integ=json.loads((directory/'integrity.json').read_text())
   for n,h in integ['files'].items():self.assertEqual(hashlib.sha256((directory/n).read_bytes()).hexdigest(),h)

 def test_02_exact_remaining_populations(self):
  for z,e in EXPECTED.items():
   p=self.o['target-populations.json']['zones'][z];actual=tuple(p[k] for k in ('unique_apns','incremental_unique_apns','single_zone','multi_zone','sliver','indeterminate','inside_coastal','outside_coastal','boundary_ambiguous','profile_ready'));self.assertEqual(actual,e,z)

 def test_03_existing_family_schemas_only(self):
  expected={'RS':'RS_TABLE_131_04D_GENERIC_V1','RM':'RM_TABLE_131_04G_GENERIC_V1','RT':'RT_TABLE_131_04F_GENERIC_V1'}
  self.assertEqual(set(self.profiles),set(TARGETS));self.assertFalse(self.o['family-schemas.json']['new_family_models'])
  for z,p in self.profiles.items():self.assertEqual(p['family_schema'],expected[z.split('-')[0]])

 def test_04_rs_complete_rows(self):
  for z in RS_TARGETS:
   expected=24 if z in {'RS-1-5','RS-1-3'} else 25
   for c in self.profiles[z]['contexts']:self.assertEqual(len(c['rules']),expected)

 def test_05_rm_4_11_modifier_heavy(self):
  rules={r['rule_family']:r for r in self.profiles['RM-4-11']['contexts'][0]['rules']};self.assertEqual(rules['DENSITY']['value']['value'],200);self.assertEqual(rules['FLOOR_AREA_RATIO_MAXIMUM']['value']['value'],7.2);self.assertEqual(rules['STRUCTURE_HEIGHT_MAXIMUM']['representation'],'CONDITIONAL');self.assertIn('FN37',rules['STRUCTURE_HEIGHT_MAXIMUM']['footnote_ids']);self.assertIn('FN25',rules['PRIVATE_EXTERIOR_OPEN_SPACE']['footnote_ids']);self.assertEqual(rules['FRONT_SETBACK_MINIMUM']['representation'],'FORMULA')

 def test_06_rt_values_and_same_schema(self):
  for z in RT_TARGETS:self.assertEqual(self.profiles[z]['family_schema'],'RT_TABLE_131_04F_GENERIC_V1')
  def rules(z):return {r['rule_family']:r for r in self.profiles[z]['contexts'][0]['rules']}
  self.assertEqual(rules('RT-1-4')['MINIMUM_LOT_AREA']['value']['value'],2200);self.assertEqual(rules('RT-1-4')['LOT_COVERAGE_MAXIMUM']['value']['value'],75);self.assertEqual(rules('RT-1-4')['FLOOR_AREA_RATIO_MAXIMUM']['value']['value'],{'1_TO_2_STORY':1.1,'3_STORY':1.5});self.assertEqual(rules('RT-1-5')['MINIMUM_LOT_WIDTH']['value']['value'],18);self.assertEqual(rules('RT-1-5')['FRONT_SETBACK_MAXIMUM']['value']['value'],10);self.assertEqual(rules('RT-1-5')['FLOOR_AREA_RATIO_MAXIMUM']['value']['value'],{'1_TO_2_STORY':1.2,'3_STORY':1.6})

 def test_07_versions_and_fingerprints(self):
  for p in self.profiles.values():
   self.assertEqual({c['coastal_context'] for c in p['contexts']},{'OUTSIDE_COASTAL','INSIDE_COASTAL'})
   d={c['coastal_context']:c for c in p['contexts']};self.assertIn('O-22109',d['OUTSIDE_COASTAL']['ordinance_components']);self.assertNotIn('O-22109',d['INSIDE_COASTAL']['ordinance_components'])
   for c in p['contexts']:self.assertEqual(len(c['source_fingerprint']),64);self.assertEqual(len(c['extraction_fingerprint']),64);self.assertTrue(c['effective_from'])

 def test_08_footnotes_explicit(self):
  used={f for p in self.profiles.values() for c in p['contexts'] for r in c['rules'] for f in r['footnote_ids']};self.assertEqual(used,set(self.notes));self.assertEqual(self.o['footnotes.json']['missing_reference_policy'],'FAIL_VALIDATION');self.assertEqual(self.notes['131-04D:8']['state'],'MISSING_IN_SOURCE')

 def test_09_formula_vocabulary(self):
  allowed={'DIRECT','FORMULA','CONDITIONAL','NOT_SPECIFIED','MODIFIER_DEPENDENT','UNRESOLVED'}
  for p in self.profiles.values():
   for c in p['contexts']:
    for r in c['rules']:self.assertIn(r['representation'],allowed);self.assertFalse(r['project_comparison'])
  self.assertFalse(self.o['family-schemas.json']['capacity_calculation'])

 def test_10_target_selection_and_fail_closed(self):
  rows=[];counts={z:0 for z in TARGETS}
  with gzip.open(OUT/'apn-profile-selection.ndjson.gz','rt') as f:
   for line in f:r=json.loads(line);rows.append(r);counts[r['zone']]+=1
  self.assertEqual(counts,{z:EXPECTED[z][0] for z in TARGETS});self.assertEqual(len(rows),len({(r['apn'],r['zone']) for r in rows}));self.assertTrue(all(not r['profile_ready'] for r in rows if r['zoning_state']=='MULTI_ZONE'));self.assertTrue(all(r['profile_version']=='UNRESOLVED_COASTAL_VERSION' for r in rows if r['coastal_context']=='BOUNDARY_AMBIGUOUS'));self.assertTrue(all(r['feasibility_result'] is None for r in rows))

 def test_11_citywide_support_artifact(self):
  rows=[]
  with gzip.open(OUT/'citywide-residential-support.ndjson.gz','rt') as f:
   for line in f:rows.append(json.loads(line))
  self.assertEqual(len(rows),326532);self.assertEqual(len({r['apn'] for r in rows}),326532);self.assertTrue(all(r['supported_profiles'] for r in rows));self.assertTrue(all(r['unsupported_reason'] is None for r in rows));self.assertTrue(all(r['feasibility_result'] is None for r in rows))

 def test_12_golden_and_manual(self):
  g=self.o['golden-candidates.json'];
  for z in TARGETS:
   for cat in ('ordinary','inside_coastal','edge'):self.assertEqual(len(g['profiles'][z][cat]),min(3,g['available_counts'][z][cat]))
  m=self.o['manual-verification.json']['one_candidate_per_profile'];self.assertEqual({x['zone'] for x in m},set(TARGETS));self.assertTrue(all(x['no_project_compliance'] for x in m))

 def test_13_final_coverage_and_thresholds(self):
  c=self.o['coverage.json'];self.assertEqual(c['before_packet82_unique_apns'],322891);self.assertEqual(c['packet82_incremental_unique_apns'],3641);self.assertEqual(c['after_packet82_unique_apns'],326532);self.assertEqual(c['after_packet82_percent'],100.0);self.assertEqual(c['unsupported_unique_apns'],0);self.assertEqual(c['profile_ready_unique_apns']+c['review_required_unique_apns'],326532);self.assertEqual(c['thresholds'],{'99_percent':True,'99_5_percent':True,'99_9_percent':True})

 def test_14_remaining_audit_and_stop_rule(self):
  a=self.o['remaining-unsupported-audit.json'];self.assertEqual(a['unsupported_apns'],0);self.assertEqual(a['unsupported_reason_counts'],{});self.assertTrue(a['supported_but_review_required_counts']);self.assertEqual(self.o['decision.json']['stop_broad_expansion'],'STOP_BROAD_RESIDENTIAL_RULE_EXPANSION')

 def test_15_registry_all_observed_profiles(self):
  r=self.o['final-profile-registry.json'];self.assertEqual(r['profile_count'],31);self.assertEqual(r['families'],{'RM':12,'RS':14,'RT':3,'RX':2});self.assertTrue(r['all_observed_residential_zones_registered']);self.assertEqual(len({x['zone'] for x in r['profiles']}),31);self.assertTrue(all(len(x['profile_fingerprint'])==64 for x in r['profiles']))

 def test_16_accuracy_and_production_boundaries(self):
  a=self.o['accuracy-bottlenecks.json'];self.assertEqual(a['largest_accuracy_gap'],'permit_currentness_source');p=self.o['production-readiness.json'];self.assertFalse(p['production_ready']);self.assertTrue(p['packet_11_frozen']);self.assertFalse(p['selected_snapshot_change']);self.assertEqual(set(p['blockers']),{'production_zoning_selection','public_activation','citywide_currentness','program_eligibility'})

 def test_17_existing_regressions_and_v4(self):
  c=self.o['compatibility.json'];self.assertEqual(set(c['existing_benchmarks']),{'RS-1-7:6341302200','RM-2-5:5442140600'});self.assertEqual(c['packet78'],'UNCHANGED');self.assertEqual(c['packet80'],'UNCHANGED');self.assertEqual(c['packet81'],'UNCHANGED');self.assertEqual(c['rx_family'],'UNCHANGED');self.assertFalse(c['runtime_activation']);self.assertFalse(c['capacity']);self.assertEqual(c['la_mesa'],'UNCHANGED')

 def test_18_negative_validation(self):
  with gzip.open(OUT/'apn-profile-selection.ndjson.gz','rt') as f:base=json.loads(next(f))
  cases=[]
  x=copy.deepcopy(base);x['zone']='RX-9-9';cases.append((x,self.notes))
  x=copy.deepcopy(base);x['family_schema']='RS_TABLE_131_04D_GENERIC_V1' if not x['zone'].startswith('RS-') else 'RM_TABLE_131_04G_GENERIC_V1';cases.append((x,self.notes))
  x=copy.deepcopy(base);x['coastal_context']='UNKNOWN';cases.append((x,self.notes))
  x=copy.deepcopy(base);x['profile_version']='DRAFT_FUTURE';cases.append((x,self.notes))
  x=copy.deepcopy(base);x['source_fingerprints']={};cases.append((x,self.notes))
  x=copy.deepcopy(base);x['modifier_review_state']='RESOLVED_UNCONDITIONAL';cases.append((x,self.notes))
  x=copy.deepcopy(base);x['zoning_state']='MULTI_ZONE';x['profile_ready']=True;cases.append((x,self.notes))
  x=copy.deepcopy(base);x['referenced_footnote_ids']=['MISSING'];cases.append((x,self.notes))
  for row,notes in cases:
   with self.assertRaises(ValueError):validate_selection_record(row,notes)

 def test_19_deterministic_rebuild_and_integrity(self):
  first={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()};build();second={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()};self.assertEqual(first,second);integ=self.o['integrity.json']
  for n,h in integ['files'].items():self.assertEqual(hashlib.sha256((OUT/n).read_bytes()).hexdigest(),h)

 def test_20_sensitive_and_decision(self):
  forbidden=('postgresql://','SUPABASE_ACCESS_TOKEN','BEGIN PRIVATE KEY','Bearer ey')
  for p in OUT.iterdir():
   text=gzip.open(p,'rt',errors='ignore').read() if p.suffix=='.gz' else p.read_text(errors='ignore');self.assertFalse(any(x in text for x in forbidden),p.name)
  d=self.o['decision.json'];self.assertEqual(d['decision'],'SAN_DIEGO_RESIDENTIAL_RULE_COVERAGE_FINALIZED');self.assertEqual(d['next_step'],'SAN_DIEGO_PERMIT_CURRENTNESS_SOURCE');self.assertTrue(d['packet_11_frozen']);self.assertFalse(d['production_access']);self.assertFalse(d['deployment'])

if __name__=='__main__':unittest.main(verbosity=2)
