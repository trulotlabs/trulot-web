#!/usr/bin/env python3
import gzip, hashlib, importlib.util, json, pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parent

def load(p): return json.loads(p.read_text())
def fail(msg): raise AssertionError(msg)
def main():
 spec=importlib.util.spec_from_file_location('p65build',ROOT/'build.py'); b=importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
 checks=[]
 def check(name,cond):
  if not cond: fail(name)
  checks.append(name)
 integ=load(ROOT/'artifact-integrity.json')
 for name,rec in integ['files'].items():
  p=ROOT/name; check('integrity:'+name,p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==rec['sha256'])
 schema=load(ROOT/'schema.json'); prof=load(ROOT/'rule-profiles.json'); profiles=prof['profiles']; check('json-schema-required',all(k in prof for k in schema['required']) and prof['jurisdiction']==schema['properties']['jurisdiction']['const'] and prof['municipal_code_profile']==schema['properties']['municipal_code_profile']['const'])
 check('exact-zone-domain',[p['zone'] for p in profiles]==b.ZONES)
 check('matrix-completeness',all(set(p['rules'])==set(b.RULES) for p in profiles))
 valid_status={'DIRECT','FORMULA','CONDITIONAL','NOT_SPECIFIED','MODIFIER_DEPENDENT','UNRESOLVED'}
 valid_ops={'MINIMUM_REQUIREMENT','MAXIMUM_LIMIT','EXACT_REQUIREMENT','FORMULA'}
 for p in profiles:
  for fam,r in p['rules'].items():
   check(f'rule-shape:{p["zone"]}:{fam}',r['status'] in valid_status and r['operator'] in valid_ops and bool(r['unit']) and bool(r['citation']['source_id']))
   if r['value'] is not None: check(f'numeric-source:{p["zone"]}:{fam}',isinstance(r['value'],(int,float)) and bool(r['citation']['section']))
 check('profile-version',all(p['municipal_code_profile']==b.PROFILE for p in profiles))
 mods=load(ROOT/'modifier-registry.json')['modifiers']; check('overlay-domain',{m['code'] for m in mods}=={'H','P','F','D','MU','G','BG','BT','NP','NP2','MH'})
 check('modifier-contract',all(m['operations'] and m['source'] and isinstance(m['precedence'],int) and m['trigger'] for m in mods))
 plans=load(ROOT/'specific-plan-registry.json'); check('specific-plan-versions',{p['version'] for p in plans['plans']}=={'ADOPTED_1990','ADOPTED_1994','ADOPTED_1989'} and plans['draft_materials_excluded'])
 src=load(ROOT/'source-captures.json'); ids={x['id'] for x in src['sources']}; check('source-fingerprints',all(hashlib.sha256(x['excerpt'].encode()).hexdigest()==x['extraction_sha256'] for x in src['sources']))
 check('source-citations',all(r['citation']['source_id'] in ids for p in profiles for r in p['rules'].values()) and all(m['source'] in ids for m in mods))
 defs=load(ROOT/'definitions.json')['definitions']; check('definitions-domain',{x['term'] for x in defs}=={'lot','premises','lot_width','lot_depth','frontage','yard_setback','building_height','floor_area','lot_coverage','density','corner_lot','through_lot','irregular_lot'})
 rows=[]
 with gzip.open(ROOT/'profile-selection.ndjson.gz','rt') as f:
  for line in f: rows.append(json.loads(line))
 check('selection-row-count',len(rows)==17391)
 check('selection-order',[x['apn'] for x in rows]==sorted(x['apn'] for x in rows))
 check('reject-TBD',all(x['selected_base_profile'] is None and x['readiness']=='RULE_PROFILE_UNAVAILABLE' for x in rows if x['base_zone']=='TBD'))
 check('reject-unsupported',all(x['selected_base_profile'] is None for x in rows if x['base_zone'] not in b.ZONES))
 check('no-readiness-upgrade',all(not(x['packet64_readiness']=='RULE_PROFILE_UNAVAILABLE' and x['readiness']!='RULE_PROFILE_UNAVAILABLE') for x in rows))
 p64={y['apn']:y for y in _packet64()}
 check('overlay-needs-intersection',all(set(x['modifier_ids'])=={f'LM_OVERLAY_{c}' for c in p64[x['apn']].get('mapped_overlay_signature','').split('+') if c} for x in rows))
 check('unresolved-trigger',all(x['readiness']=='RULE_PROFILE_REVIEW_REQUIRED' for x in rows if any(i in x['modifier_ids'] for i in ['LM_OVERLAY_H','LM_OVERLAY_P','LM_OVERLAY_F','LM_OVERLAY_MU','LM_OVERLAY_G','LM_OVERLAY_BT','LM_OVERLAY_NP','LM_OVERLAY_NP2','LM_OVERLAY_MH']) and x['selected_base_profile']))
 check('draft-specific-plan-rejected',all('DRAFT' not in p['version'] for p in plans['plans']))
 check('future-effective-rejected',all(p['effective_text_date']<='2026-10-26' for p in profiles))
 check('source-less-rule-rejected',all(r['citation']['source_id'] for p in profiles for r in p['rules'].values()))
 check('conflict-policy',load(ROOT/'modifier-registry.json')['conflict_policy'].endswith('CONDITIONAL/UNRESOLVED'))
 check('benchmark-replay',not load(ROOT/'benchmark-replay.json')['missing'])
 check('golden-verification',all(x['verified'] for x in load(ROOT/'golden-verification.json')['cases']))
 check('no-feasibility',not load(ROOT/'decision.json')['parcel_feasibility_calculated'])
 with tempfile.TemporaryDirectory() as td:
  b.build(td); expected={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.iterdir() if p.is_file() and p.name not in {'build.py','validate.py'}}; actual={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path(td).iterdir() if p.is_file()}
  check('deterministic-rebuild',expected==actual)
 print(json.dumps({'status':'PASS','checks':checks,'check_count':len(checks)},indent=2))

def _packet64():
 with gzip.open('data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz','rt') as f:
  for line in f: yield json.loads(line)
if __name__=='__main__':main()
