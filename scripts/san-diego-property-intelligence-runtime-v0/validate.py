#!/usr/bin/env python3
import gzip,json,hashlib,random,time,statistics,resource,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'data/san-diego-property-intelligence-runtime-v0';SRC=ROOT/'data/san-diego-property-intelligence-composition-v0/parcel-property-intelligence.ndjson.gz';m=json.loads((D/'manifest.json').read_text());assert m['rowCount']==m['uniqueApns']==393733 and m['privateOnly'] and m['shardCount']==len(m['shards'])
rows={};apns=[];question={};h=hashlib.sha256();artifact=hashlib.sha256()
for s in m['shards']:
 p=D/s['path'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==s['sha256'];artifact.update(s['prefix'].encode()+b'\0'+s['sha256'].encode()+b'\n');prev='';n=0
 with gzip.open(p,'rt') as f:
  for l in f:
   x=json.loads(l);assert x['apn']>prev and x['apn'][:3]==s['prefix'];prev=x['apn'];n+=1;apns.append(x['apn']);h.update(x['apn'].encode()+b'\n');rows[x['apn']]=x;question[x['apn']]=x['questionClass']
 assert n==s['rows'] and prev==s['lastApn']
assert len(rows)==393733 and h.hexdigest()==m['apnFingerprint'] and artifact.hexdigest()==m['artifactFingerprint']
# full semantic and question parity
n=0
with gzip.open(SRC,'rt') as f:
 for l in f:
  x=json.loads(l);d=rows[x['apn']];n+=1
  assert d['preliminaryDwellingState']==x['preliminaryDwellingState'] and d['currentnessState']==x['currentnessState'] and d['questionClass']==x['questionKind']
  assert d['activeChange']==(x['currentnessState']=='ACTIVE_CHANGE_IN_PROGRESS') and d['laterChange']==(x['currentnessState']=='LATER_CHANGE_OBSERVED')
  assert d['boundedAduEvidence']==x['permitEvidence']['explicitAduEvidence'] and d['conflictTypes']==x['v4']['unresolvedConflictTypes']
assert n==393733
# deterministic 10k cross-shard cached lookups
by={x['prefix']:[a for a in apns if a.startswith(x['prefix'])] for x in m['shards']}
sample=[]
for pre in sorted(by):
 vals=by[pre]
 for i in range(49):sample.append(vals[(i*37)%len(vals)])
sample=sample[:10000];cache={};order=[];lat=[];hits=0
for apn in sample:
 t=time.perf_counter_ns();pre=apn[:3]
 if pre in cache:hits+=1;sh=cache[pre]
 else:
  meta=next(x for x in m['shards'] if x['prefix']==pre)
  with gzip.open(D/meta['path'],'rt') as f:sh={x['apn']:x for x in map(json.loads,f)}
  cache[pre]=sh;order.append(pre)
  if len(order)>8:cache.pop(order.pop(0),None)
 assert apn in sh;lat.append((time.perf_counter_ns()-t)/1e6)
sl=sorted(lat);pct=lambda p:sl[min(len(sl)-1,int(len(sl)*p))]
perf={'lookups':len(lat),'crossShardPrefixes':len({x[:3] for x in sample}),'cacheHits':hits,'cacheHitRate':hits/len(lat),'p50Ms':statistics.median(lat),'p95Ms':pct(.95),'p99Ms':pct(.99),'maxMs':max(lat),'processMaxRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'compressedBytes':sum(x['bytes'] for x in m['shards']),'deploymentBytesIncludingManifest':sum(x['bytes'] for x in m['shards'])+(D/'manifest.json').stat().st_size}
(D/'performance.json').write_text(json.dumps(perf,indent=2,sort_keys=True)+'\n')
# demos and containment evidence
sel=['6341302200','5442140600']
for x in apns:
 d=rows[x]
 if len(sel)>=10:break
 if d['boundedAduEvidence'] in {'FINALED','ACTIVE','EXPIRED_OR_WITHDRAWN'} or d['currentnessState'] in {'CURRENTNESS_UNKNOWN','CONFLICTING_EVIDENCE'}:sel.append(x)
(D/'private-demo.json').write_text(json.dumps({'privateOnly':True,'rows':[rows[x] for x in dict.fromkeys(sel)]},indent=2,sort_keys=True)+'\n')
assert rows['6341302200']['preliminaryDwellingState']=='SINGLE_FAMILY_LIKELY' and rows['6341302200']['currentnessState']=='RECORDED_STALE_POSSIBLE'
assert rows['5442140600']['preliminaryDwellingState']=='CONFLICTING' and rows['5442140600']['boundedAduEvidence']=='FINALED' and rows['5442140600']['laterChange']
text='\n'.join(p.read_text(errors='ignore') for p in D.glob('*.json'));assert not any(x in text for x in ['PRJ-1111087','permitHolder','SUPABASE_ACCESS_TOKEN','password'])
print(json.dumps(perf,indent=2));print('Packet 100 manifest, full parity, question parity, benchmarks, containment, and 10k scale validation: PASS')
