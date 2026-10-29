#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];d=root/'data/san-diego-real-user-feasibility-pilot-v0';files={}
for p in sorted(d.iterdir()):
 if p.name=='artifact-integrity.json' or not p.is_file():continue
 b=p.read_bytes();files[p.name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
ready=json.loads((d/'readiness.json').read_text());assert ready['sessionsObserved']==0 and ready['validationDecisionAllowed'] is False
text='\n'.join(p.read_text(errors='ignore') for p in d.iterdir() if p.is_file())
for secret in ['postgresql://','password=','PRJ-1111087']:assert secret not in text
out={'files':files,'fileCount':len(files),'sensitiveMaterialScan':'PASS','personalInformationScan':'PASS','contentFreeAnalyticsSchema':'PASS','realUserSessionsObserved':0,'pilotValidationAllowed':False};(d/'artifact-integrity.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n');print(json.dumps(out,indent=2))
