#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from resolver import canonical,compose,fingerprint
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'data/parcel-intelligence-v2'
def write(name,value): (DATA/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
def build():
 inputs=json.loads((DATA/'fixtures.json').read_text())
 results=[]
 for fixture in inputs['fixtures']:
  results.append({'fixture_id':fixture['fixture_id'],'coverage_tags':fixture['coverage_tags'],'result':compose(fixture)})
 corpus={'contract_version':'parcel-intelligence-v2-2026-09-30-v1','fixture_count':len(results),'results':results}
 corpus['canonical_output_sha256']=fingerprint(corpus)
 write('fixture-results.json',corpus)
 required={apn:next(x['result'] for x in results if x['result']['identity']['apn']==apn) for apn in ['6341302200','3506320400','4304211000']}
 write('canonical-examples.json',required)
 fps={'canonical_input_sha256':inputs['canonical_input_sha256'],'canonical_output_sha256':corpus['canonical_output_sha256'],'required_example_fingerprints':{k:v['fingerprint_sha256'] for k,v in required.items()}}
 write('fingerprints.json',fps)
 return corpus
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
 before=(DATA/'fixture-results.json').read_bytes() if a.check and (DATA/'fixture-results.json').exists() else None
 x=build()
 if a.check and before!=(DATA/'fixture-results.json').read_bytes(): raise SystemExit('byte-identical rebuild failed')
 print(json.dumps({'fixtures':x['fixture_count'],'canonical_output_sha256':x['canonical_output_sha256']},sort_keys=True))
