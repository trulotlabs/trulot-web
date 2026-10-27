#!/usr/bin/env python3
import gzip, hashlib, json, unittest
from pathlib import Path
from build import OUT, P79, P80, TARGETS, RM_TARGETS, RS_TARGETS, RX_TARGETS, RT_TARGETS, build

EXPECTED={
"RM-1-2":(3181,2206,923,52,0,74,3107,0,2206),"RM-2-4":(3175,2264,896,1,14,1796,1378,1,2265),"RM-2-6":(2137,764,1275,0,98,130,2007,0,764),"RM-3-8":(2313,1234,1076,1,2,141,2169,3,1235),"RM-5-12":(1239,185,1050,0,4,1225,13,1,185),"RS-1-11":(1386,895,448,24,19,3,1382,1,896),"RS-1-8":(2270,866,1373,16,15,2,2264,4,869),"RX-1-2":(2543,1894,534,8,107,182,2353,8,1894),"RX-1-1":(2208,1596,612,0,0,0,2208,0,1596),"RT-1-2":(1366,941,414,4,7,0,1365,1,943)}

class Packet81Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.o=build(); cls.profiles={p['zone_code']:p for p in cls.o['rule-profiles.json']['profiles']}

 def test_01_packet79_integrity(self):
  r=json.loads((P79/'receipt.json').read_text()); self.assertEqual((r['rows'],r['distinct_apns']),(393733,393733)); self.assertEqual(r['zoning_state_counts'],{'BOUNDARY_SLIVER':1097,'INDETERMINATE':1641,'MULTI_ZONE':73064,'SINGLE_ZONE':317604,'UNMAPPED':327}); self.assertEqual(r['coastal_state_counts'],{'BOUNDARY_AMBIGUOUS':1530,'INSIDE_COASTAL':46455,'OUTSIDE_COASTAL':345748})

 def test_02_packet80_integrity_and_baseline(self):
  c=json.loads((P80/'coverage.json').read_text()); self.assertEqual(c['after_packet80_unique_apns'],305526); integ=json.loads((P80/'integrity.json').read_text());
  for n,h in integ['files'].items(): self.assertEqual(hashlib.sha256((P80/n).read_bytes()).hexdigest(),h)

 def test_03_exact_target_populations(self):
  for z,e in EXPECTED.items():
   p=self.o['target-populations.json']['zones'][z]; self.assertEqual(tuple(p[k] for k in ('unique_apns','single_zone','multi_zone','sliver','indeterminate','inside_coastal','outside_coastal','boundary_ambiguous','profile_ready')),e,z)

 def test_04_family_boundaries(self):
  self.assertEqual(set(self.profiles),set(TARGETS)); expected={'RM':'RM_TABLE_131_04G_GENERIC_V1','RS':'RS_TABLE_131_04D_GENERIC_V1','RX':'RX_TABLE_131_04E_GENERIC_V1','RT':'RT_TABLE_131_04F_GENERIC_V1'}
  for z,p in self.profiles.items(): self.assertEqual(p['family_schema'],expected[z.split('-')[0]])
  self.assertTrue(all(not x['cross_family_reuse'] for x in self.o['family-schemas.json']['schemas'].values()))

 def test_05_rx_rt_own_family_assessment(self):
  a=self.o['family-assessment.json']; self.assertEqual(a['RX']['decision'],'SEALED_OWN_FAMILY'); self.assertEqual(a['RT']['decision'],'SEALED_OWN_FAMILY'); self.assertEqual(a['RX']['common_table'],'131-04E'); self.assertEqual(a['RT']['common_table'],'131-04F')

 def test_06_dual_coastal_versions(self):
  for p in self.profiles.values():
   self.assertEqual({c['coastal_context'] for c in p['contexts']},{'OUTSIDE_COASTAL','INSIDE_COASTAL'}); d={c['coastal_context']:c for c in p['contexts']}; self.assertIn('O-22109',d['OUTSIDE_COASTAL']['ordinance_components']); self.assertNotIn('O-22109',d['INSIDE_COASTAL']['ordinance_components']); self.assertNotEqual(d['OUTSIDE_COASTAL']['profile_version'],d['INSIDE_COASTAL']['profile_version'])

 def test_07_rs_profiles_use_25_sealed_rows(self):
  for z in RS_TARGETS:
   for c in self.profiles[z]['contexts']: self.assertEqual(len(c['rules']),25)

 def test_08_rm_material_values_and_formulas(self):
  def rules(z): return {r['rule_family']:r for r in self.profiles[z]['contexts'][0]['rules']}
  self.assertEqual(rules('RM-1-2')['DENSITY']['value']['value'],2500); self.assertEqual(rules('RM-3-8')['STRUCTURE_HEIGHT_MAXIMUM']['value']['value'],50); self.assertEqual(rules('RM-5-12')['LOT_COVERAGE_MAXIMUM']['representation'],'FORMULA'); self.assertEqual(rules('RM-5-12')['STRUCTURE_HEIGHT_MAXIMUM']['representation'],'MODIFIER_DEPENDENT')

 def test_09_rx_rt_semantics(self):
  def rules(z): return {r['rule_family']:r for r in self.profiles[z]['contexts'][0]['rules']}
  self.assertEqual(rules('RX-1-2')['FLOOR_AREA_RATIO_MAXIMUM']['value']['value'],.8); self.assertEqual(rules('RX-1-1')['LOT_COVERAGE_MAXIMUM']['representation'],'NOT_SPECIFIED'); self.assertIn('RX_FN1',rules('RX-1-2')['MINIMUM_LOT_WIDTH']['footnote_ids']); self.assertEqual(rules('RT-1-2')['LOT_COVERAGE_MAXIMUM']['value']['value'],65); self.assertEqual(rules('RT-1-2')['STRUCTURE_HEIGHT_MAXIMUM']['representation'],'FORMULA')

 def test_10_footnotes_complete(self):
  used={f for p in self.profiles.values() for c in p['contexts'] for r in c['rules'] for f in r['footnote_ids']}; self.assertEqual(used,set(self.o['footnotes.json']['used_footnotes'])); self.assertEqual(used,set(self.o['footnotes.json']['footnotes'])); self.assertEqual(self.o['footnotes.json']['missing_reference_policy'],'FAIL_VALIDATION')
  self.assertEqual(self.o['footnotes.json']['footnotes']['131-04D:8']['state'],'MISSING_IN_SOURCE')

 def test_11_selection_fails_closed(self):
  counts={z:0 for z in TARGETS}; seen=set(); rows=[]
  with gzip.open(OUT/'apn-profile-selection.ndjson.gz','rt') as f:
   for line in f:
    r=json.loads(line); rows.append(r); counts[r['zone']]+=1; seen.add((r['apn'],r['zone']))
  self.assertEqual(len(rows),len(seen)); self.assertEqual(counts,{z:EXPECTED[z][0] for z in TARGETS}); self.assertTrue(all(not r['profile_ready'] for r in rows if r['zoning_state']=='MULTI_ZONE')); self.assertTrue(all(r['profile_version']=='UNRESOLVED_COASTAL_VERSION' for r in rows if r['coastal_context']=='BOUNDARY_AMBIGUOUS')); self.assertTrue(all(r['feasibility_result'] is None for r in rows))

 def test_12_goldens_and_manual(self):
  g=self.o['golden-candidates.json']['profiles']; a=self.o['golden-candidates.json']['available_counts']
  for z in TARGETS:
   for cat in ('ordinary','inside_coastal','edge'): self.assertEqual(len(g[z][cat]),min(3,a[z][cat]))
  m=self.o['manual-verification.json']['ordinary_candidate_per_profile']; self.assertEqual({x['zone'] for x in m},set(TARGETS)); self.assertTrue(all(x['no_project_compliance'] for x in m))

 def test_13_exact_unique_coverage(self):
  c=self.o['coverage.json']; self.assertEqual(c['residential_unique_apns'],326532); self.assertEqual(c['before_packet81_unique_apns'],305526); self.assertEqual(c['after_packet81_unique_apns'],c['before_packet81_unique_apns']+c['added_by_packet81_unique_apns']); self.assertEqual(c['profile_ready_unique_apns']+c['review_required_unique_apns']+c['unsupported_unique_apns'],326532); self.assertIn('set unions',c['overlap_rule'])

 def test_14_thresholds_and_remaining(self):
  c=self.o['coverage.json']; self.assertEqual(c['thresholds'],{'95_percent':True,'97_percent':True,'98_percent':True}); r=self.o['remaining-opportunity.json']['ranked']; self.assertEqual(r,sorted(r,key=lambda x:(-x['incremental_unique_apns'],x['zone']))); self.assertTrue(all(x['zone'] not in TARGETS for x in r))

 def test_15_v4_and_regression_boundaries(self):
  c=self.o['compatibility.json']; self.assertEqual(set(c['existing_benchmarks']),{'RS-1-7:6341302200','RM-2-5:5442140600'}); self.assertEqual(c['packet78_profiles'],'UNCHANGED'); self.assertEqual(c['packet80_profiles'],'UNCHANGED'); self.assertEqual(c['la_mesa'],'UNCHANGED'); self.assertFalse(c['runtime_activation']); self.assertFalse(c['capacity'])

 def test_16_deterministic_integrity(self):
  first={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()}; build(); second={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()}; self.assertEqual(first,second); integ=self.o['integrity.json'];
  for n,h in integ['files'].items(): self.assertEqual(hashlib.sha256((OUT/n).read_bytes()).hexdigest(),h)

 def test_17_sensitive_material(self):
  forbidden=('postgresql://','SUPABASE_ACCESS_TOKEN','BEGIN PRIVATE KEY','Bearer ey')
  for p in OUT.iterdir():
   if p.suffix!='.gz': self.assertFalse(any(x in p.read_text(errors='ignore') for x in forbidden),p.name)

 def test_18_decision_and_preservation(self):
  d=self.o['decision.json']; self.assertEqual(d['decision'],'SAN_DIEGO_RESIDENTIAL_RULE_EXPANSION_WAVE2_READY'); self.assertEqual(d['successful_profiles'],list(TARGETS)); self.assertEqual(d['deferred_profiles'],[]); self.assertTrue(d['packet_11_frozen']); self.assertFalse(d['production_access']); self.assertFalse(d['public_activation']); self.assertFalse(d['deployment'])

if __name__=='__main__': unittest.main(verbosity=2)
