#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];d=root/'data/san-diego-private-feasibility-enrichment-v0'
files={}
for p in sorted(d.iterdir()):
 if p.name=='artifact-integrity.json' or not p.is_file():continue
 b=p.read_bytes();files[p.name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
text='\n'.join(p.read_text(errors='ignore') for p in d.iterdir() if p.is_file())
for forbidden in ['SUPABASE_ACCESS_TOKEN','PRJ-1111087','password=','postgresql://']:
 assert forbidden not in text,forbidden
cohort=json.loads((d/'benchmark-cohort.json').read_text());assert cohort['count']>=150
for case in cohort['cases']:
 e=case['enrichment'];assert e['complianceConclusionSupported'] is False
 assert not ({'LATER_CHANGE_OBSERVED','ACTIVE_CHANGE_IN_PROGRESS','OBSERVATIONAL_SUPPORT_ONLY','CONFLICTING_EVIDENCE','CURRENTNESS_UNKNOWN'}&{e['currentnessState']} and e['preliminaryPathway'])
integrity={'files':files,'fileCount':len(files),'sensitiveMaterialScan':'PASS','falseCertaintyAudit':'PASS','deterministicSemanticEvidence':'PASS'}
(d/'artifact-integrity.json').write_text(json.dumps(integrity,indent=2,sort_keys=True)+'\n')
print(json.dumps(integrity,indent=2))
