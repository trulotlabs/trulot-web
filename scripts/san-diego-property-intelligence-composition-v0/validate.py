#!/usr/bin/env python3
import gzip,hashlib,json,re
from pathlib import Path
D=Path(__file__).resolve().parents[2]/'data/san-diego-property-intelligence-composition-v0';j=lambda n:json.loads((D/n).read_text())
for n,x in j('artifact-integrity.json')['files'].items():
 b=(D/n).read_bytes();assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256'],n
m=j('population-metrics.json');assert sum(m['currentnessStates'].values())==393733;assert sum(m['dwellingStates'].values())==393733;assert m['plainClosedRecords']==171455
assert j('benchmark-cohort.json')['count']>=100
seen={};n=0
with gzip.open(D/'parcel-property-intelligence.ndjson.gz','rt') as f:
 for l in f:
  x=json.loads(l);n+=1
  if x['apn'] in {'6341302200','5442140600'}:seen[x['apn']]=x
  if x['permitEvidence']['plainClosedRecords']:assert x['permitEvidence']['plainClosedCompletionSemantics']=='UNKNOWN'
  assert not ('permitHolder' in x or 'rawPermit' in x)
assert n==393733 and len(seen)==2
assert seen['6341302200']['recordedProperty']['assessedImprovementValue']==113000
assert seen['5442140600']['recordedProperty']['assessedImprovementValue']==68814
assert seen['5442140600']['privateRuntimeOnly'] and 'PRJ-1111087' not in json.dumps(seen)
text='\n'.join(p.read_text(errors='ignore') for p in D.iterdir() if p.suffix in {'.json','.md'})
assert not re.search(r'Bearer\s+|SUPABASE_ACCESS_TOKEN|BEGIN .*PRIVATE KEY|password\s*[:=]|PRJ-1111087',text,re.I)
assert j('decision.json')['publicActivation'] is False
print('Packet 99 composition, conflicts, Closed safety, questions, V4, privacy, containment, and population validation: PASS')
