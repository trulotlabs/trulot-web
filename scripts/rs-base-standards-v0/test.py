#!/usr/bin/env python3
import copy,hashlib,importlib.util,json,shutil,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
DATA=ROOT/'data/rs-base-standards-v0'
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
build=module('rs_v0_build',HERE/'build.py'); resolver=module('rs_v0_resolver',HERE/'resolver.py')
def load(name): return json.loads((DATA/name).read_text())
def canonical(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
RULES=load('standards.json'); BY={(r['zone_code'],r['standard_key']):r for r in RULES}
class RSBaseStandardsV0Tests(unittest.TestCase):
 def test_complete_rs_domain(self):
  expected={f'RS-1-{n}' for n in range(1,15)}
  self.assertEqual({z['zone_code'] for z in load('zone-domain.json')['zones']},expected)
  self.assertTrue(all(z['present_in_base_zoning_v2'] and z['support_state']=='SUPPORTED' for z in load('zone-domain.json')['zones']))
 def test_base_zoning_v2_compatibility(self):
  prior=ROOT/'data/zoning-standards-v2/zone-inventory.json'
  if prior.exists():
   d=json.loads(prior.read_text()); observed=set(d['observed_residential_codes'])
   self.assertTrue({f'RS-1-{n}' for n in range(1,15)} <= observed)
 def test_record_count_and_schema(self):
  self.assertEqual(len(RULES),343)
  required=set(load('rule-schema.json')['items']['required'])
  for r in RULES: self.assertFalse(required-set(r))
 def test_provenance_all_records(self):
  for r in RULES:
   body={k:v for k,v in r.items() if k!='provenance_sha256'}
   self.assertEqual(r['provenance_sha256'],hashlib.sha256(canonical(body).encode()).hexdigest())
   self.assertTrue(r['source_url'].startswith('https://docs.sandiego.gov/'))
   self.assertEqual(r['source_section'],'131.0431(a)'); self.assertEqual(r['source_table'],'131-04D'); self.assertIn(r['source_page'],{33,34,35})
 def test_rs_1_7_regression(self):
  for key,value in [('lot_width_min',50),('corner_lot_width_min',55),('lot_depth_min',95),('lot_area_min',5000),('density_basis',1)]:
   self.assertEqual(BY['RS-1-7',key]['value']['number'],value)
 def test_rs_1_7_conditions_not_flattened(self):
  self.assertEqual(BY['RS-1-7','front_setback_min']['fact_state'],'CONDITIONAL')
  self.assertIn('131-04D:1',BY['RS-1-7','front_setback_min']['exceptions'])
  self.assertEqual(BY['RS-1-7','structure_height_max']['value']['text'],'24/30')
  self.assertFalse(BY['RS-1-7','structure_height_max']['value']['evaluated'])
  self.assertEqual(BY['RS-1-7','floor_area_ratio_max']['value']['text'],'varies')
 def test_corner_and_setback_conditions(self):
  self.assertTrue(any('corner lot' in x for x in BY['RS-1-7','corner_lot_width_min']['condition']))
  for key in ['front_setback_min','interior_side_setback_min','street_side_setback_min','rear_setback_min']:
   self.assertEqual(BY['RS-1-7',key]['fact_state'],'CONDITIONAL')
 def test_orphan_footnote_quarantined(self):
  affected=[r for r in RULES if '131-04D:8' in r['exceptions']]
  self.assertEqual(len(affected),7)
  self.assertTrue(all(r['fact_state']=='UNKNOWN' for r in affected))
 def test_version_gates(self):
  self.assertEqual(resolver.resolve('SINGLE_ZONE',['RS-1-7'])['state'],'SEPARATE_ZONE_RESULTS')
  self.assertEqual(resolver.resolve('SINGLE_ZONE',['RS-1-7'],'inside')['state'],'APPLICABILITY_UNRESOLVED')
  self.assertEqual(resolver.resolve('SINGLE_ZONE',['RS-1-7'],'unknown')['state'],'APPLICABILITY_UNRESOLVED')
  self.assertEqual(resolver.resolve('SINGLE_ZONE',['RS-1-7'],'outside','2026-10-01')['state'],'APPLICABILITY_UNRESOLVED')
 def test_mapping_contract(self):
  self.assertEqual(len(resolver.resolve('SINGLE_ZONE',['RS-1-7'])['standards']),1)
  b=resolver.resolve('BOUNDARY_SLIVER',['RS-1-7','RM-1-1']); self.assertEqual(b['secondary_zoning_evidence'],['RM-1-1']); self.assertFalse(b['blended'])
  s=resolver.resolve('SPLIT_ZONE',['RS-1-7','RM-1-1']); self.assertEqual([x['state'] for x in s['standards']],['SUPPORTED','UNSUPPORTED_BY_RS_V0']); self.assertFalse(s['blended'])
  self.assertEqual(resolver.resolve('AMBIGUOUS',['RS-1-7'])['standards'],[])
  self.assertEqual(resolver.resolve('INDETERMINATE',['RS-1-7'])['standards'],[])
  self.assertEqual(resolver.resolve('UNMAPPED',[])['standards'],[])
 def test_every_zone_has_fixture(self):
  f=load('fixtures.json')['zones']; self.assertEqual(len(f),14)
  self.assertEqual({x['zone_code'] for x in f},{f'RS-1-{n}' for n in range(1,15)})
  for x in f:
   selected={k:{'value':BY[(x['zone_code'],k)]['value'],'fact_state':BY[(x['zone_code'],k)]['fact_state'],'condition':BY[(x['zone_code'],k)]['condition']} for k in build.CORE_KEYS}
   self.assertEqual(x['core_values_sha256'],hashlib.sha256(canonical(selected).encode()).hexdigest())
 def test_matrix_complete_no_ambiguous_blank(self):
  m=load('matrix.json'); self.assertEqual(len(m),14)
  self.assertTrue(all(set(row['cells'])==set(build.CORE_KEYS) for row in m))
  self.assertEqual(sum(len(row['cells']) for row in m),182)
  self.assertTrue(all(cell['fact_state'] in {'RECORDED','CONDITIONAL','UNKNOWN','NOT_APPLICABLE'} for row in m for cell in row['cells'].values()))
 def test_source_and_excerpt_integrity(self):
  st=load('source-table.json')
  self.assertEqual(hashlib.sha256(canonical({k:v['rows'] for k,v in st['pages'].items()}).encode()).hexdigest(),st['semantic_sha256'])
  for x in load('source-excerpts.json').values(): self.assertEqual(hashlib.sha256(x['text'].encode()).hexdigest(),x['text_sha256'])
 def test_source_mutation_fails(self):
  with tempfile.TemporaryDirectory() as td:
   d=Path(td)/'data'; shutil.copytree(DATA,d)
   st=json.loads((d/'source-table.json').read_text()); st['pages']['33']['rows'][5][8]='9,999'; (d/'source-table.json').write_text(json.dumps(st))
   with self.assertRaisesRegex(ValueError,'semantic hash'): build.build(d,Path(td)/'out')
 def test_deterministic_rebuild(self):
  with tempfile.TemporaryDirectory() as td:
   out=Path(td); build.build(DATA,out)
   for name in build.GENERATED: self.assertEqual((DATA/name).read_bytes(),(out/name).read_bytes(),name)
 def test_decision_and_no_capacity(self):
  d=load('decision.json'); self.assertEqual(d['decision'],'RS_BASE_STANDARDS_V0_SOURCE_COMPLETE'); self.assertFalse(d['runtime_wiring']); self.assertFalse(d['capacity_logic'])
  self.assertNotIn('lot_area_sqft',resolver.resolve.__code__.co_varnames)
  self.assertTrue(all(r['value'].get('kind')!='derived_capacity' for r in RULES))
 def test_examples(self):
  names={x['name'] for x in load('examples.json')}
  self.assertEqual(names,{'ordinary RS-1-7','another RS zone','boundary sliver','split RS plus non-RS','ambiguous parcel','unmapped parcel','unknown Coastal context'})
if __name__=='__main__': unittest.main(verbosity=2)
