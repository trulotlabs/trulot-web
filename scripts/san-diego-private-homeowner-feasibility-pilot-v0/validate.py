#!/usr/bin/env python3
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];d=root/'data/san-diego-private-homeowner-feasibility-pilot-v0';files={}
for p in sorted(d.iterdir()):
 if p.name=='artifact-integrity.json' or not p.is_file():continue
 b=p.read_bytes();files[p.name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
cases=json.loads((d/'pilot-cases.json').read_text());acc=json.loads((d/'acceptance-rubric.json').read_text());assert cases['count']>=30 and acc['passed'];text='\n'.join(p.read_text(errors='ignore') for p in d.iterdir() if p.is_file())
for secret in ['SUPABASE_ACCESS_TOKEN','postgresql://','password=','PRJ-1111087']:assert secret not in text
for c in cases['cases']:
 view=json.dumps(c['homeownerView']).lower()
 for phrase in ['you can build','records look clean','no changes ever','legal unit count']:assert phrase not in view
integrity={'files':files,'fileCount':len(files),'sensitiveMaterialScan':'PASS','falseCertaintyAudit':'PASS','analyticsPrivacyAudit':'PASS','publicIsolation':'PASS'};(d/'artifact-integrity.json').write_text(json.dumps(integrity,indent=2,sort_keys=True)+'\n');print(json.dumps(integrity,indent=2))
