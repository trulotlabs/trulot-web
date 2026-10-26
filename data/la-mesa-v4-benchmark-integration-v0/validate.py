#!/usr/bin/env python3
import hashlib, json, pathlib, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path.cwd()
checks=0
def check(value,message):
 global checks
 checks+=1
 if not value: raise AssertionError(message)
def load(name): return json.loads((ROOT/name).read_text())
integ=load('artifact-integrity.json')
for name,meta in integ['files'].items():
 p=ROOT/name; check(p.is_file(),f'missing {name}'); check(hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256'],f'hash mismatch {name}'); check(p.stat().st_size==meta['bytes'],f'size mismatch {name}')
for key,path in {'packet64':'data/la-mesa-geometry-classification-v0/artifacts/artifact-integrity.json','packet65':'data/la-mesa-residential-rule-profile-v0/artifact-integrity.json','packet66':'data/la-mesa-adu-rule-profile-2026/artifact-integrity.json'}.items():
 check(hashlib.sha256((REPO/path).read_bytes()).hexdigest()==integ['input_seals'][key],f'{key} seal mismatch')
reg=load('jurisdiction-registry.json'); results=load('benchmark-results.json'); facts=load('benchmark-facts.json')
check(reg['jurisdiction']['id']=='CITY_OF_LA_MESA','jurisdiction')
check(reg['jurisdiction']['futureProfileActiveByDefault'] is False,'future profile active')
check(len(reg['profiles'])==8,'profile count')
check({p['zoneCode'] for p in reg['profiles']}=={'R1E','R1R','R1S','R1','R1A','R2','R3','RB'},'profile membership')
check(len(results['results'])==9 and len(facts['benchmarks'])==9,'benchmark count')
check(results['current_detached_single_family_count']==1,'2026 detached count')
check(results['future_2027_rule_applied'] is False,'2027 leak')
allowed=set(reg['publicAnswerTaxonomy'])
for row in results['results']:
 check(row['answer_category'] in allowed,f"taxonomy {row['apn']}")
 check(row['private_evidence'] is False,f"private evidence {row['apn']}")
 check(row['permit_approval_conclusion'] is None,f"permit conclusion {row['apn']}")
 check(row['final_parcel_eligibility'] is None,f"eligibility {row['apn']}")
 check(row['pathway_results']==[],f"unearned pathway {row['apn']}")
for row in facts['benchmarks']:
 check(row['evaluation_date'].startswith('2026-'),'evaluation date')
 check(row['private_evidence_used'] is False,'private facts')
 check('primary_dwelling_type' in row['missing_property_facts'],'dwelling type inferred')
by={r['apn']:r for r in results['results']}
for apn in ['4640301100','4912600700','4994920400','4640201000','4752412200','4904720700']:
 check(by[apn]['v4_state']=='NEEDS_EVIDENCE',f'supported state {apn}')
check(by['4646002300']['v4_state']=='OUTSIDE_CURRENT_SCOPE','specific plan fail close')
check(by['4953350500']['v4_state']=='SOURCE_UNAVAILABLE','jurisdiction fail close')
check(by['4641310100']['v4_state']=='OUTSIDE_CURRENT_SCOPE','unsupported fail close')
check(load('route-design.json')['implemented'] is False,'route unexpectedly implemented')
check(load('parcel-lookup-design.json')['production_changed'] is False,'lookup unexpectedly changed')
check(load('decision.json')['decision']=='LA_MESA_V4_BENCHMARK_INTEGRATION_READY','decision')
with tempfile.TemporaryDirectory() as tmp:
 subprocess.run([sys.executable,str(ROOT/'build.py'),tmp],check=True,cwd=REPO)
 for path in sorted(p for p in ROOT.iterdir() if p.is_file() and p.name not in {'build.py','validate.py'}):
  rebuilt=pathlib.Path(tmp)/path.name
  check(rebuilt.is_file(),f'rebuild missing {path.name}')
  check(path.read_bytes()==rebuilt.read_bytes(),f'non-deterministic {path.name}')
print(f'Packet 67 validation PASS ({checks} checks)')
