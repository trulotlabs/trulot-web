#!/usr/bin/env python3
import json,hashlib,gzip,re
from pathlib import Path
D=Path(__file__).resolve().parents[2]/'data/san-diego-permit-currentness-v0'
j=lambda n:json.loads((D/n).read_text())
i=j('artifact-integrity.json')
for n,x in i['files'].items():
 b=(D/n).read_bytes();assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256'],n
r=j('acquisition-receipt.json');assert r['rows']==1267028 and len(r['fields'])==54 and r['rights']['classification']=='PUBLIC_PROCESS_STORE_REDISPLAY_OK'
s=j('schema-and-vocabulary.json');assert s['normalizedStatusMapping']['Completed']=='FINALED_COMPLETE' and 'closed' in s['closedDoctrine'].lower()
c=j('coverage.json');assert c['denominatorCityApns']==393733 and sum(c['parcelCurrentnessStates'].values())==393733
assert set(j('doctrine.json')['signals'])=={'NO_PERMIT_EVIDENCE','PROPOSAL_ONLY','ACTIVE_CHANGE_IN_PROGRESS','ISSUED_CHANGE','LATER_CHANGE_OBSERVED','CONFLICT_REQUIRES_REVIEW','PERMIT_HISTORY_PRESENT_NONCONFIGURATION','CURRENTNESS_UNKNOWN'}
assert j('benchmark-cohort.json')['count']>=50
assert j('completeness.json')['decision']=='CITYWIDE_PERMIT_CORPUS_PARTIAL_BUT_USEFUL'
text='\n'.join(p.read_text(errors='ignore') for p in D.iterdir() if p.suffix in {'.json','.md'})
assert not re.search(r'Bearer\s+|SUPABASE_ACCESS_TOKEN|BEGIN .*PRIVATE KEY|password\s*[:=]|@.*\.com',text,re.I)
with gzip.open(D/'parcel-currentness-summary.ndjson.gz','rt') as f:
 prev='';n=0
 for line in f:
  x=json.loads(line);assert x['apn']>prev;prev=x['apn'];n+=1
assert n==c['anyPermitEvidence']
print('Packet 98 source receipt, rights, normalization, linkage, ambiguity, benchmarks, compatibility, privacy, and deterministic artifact validation: PASS')
