#!/usr/bin/env python3
import gzip,json,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];SRC=ROOT/'data/san-diego-property-intelligence-composition-v0/parcel-property-intelligence.ndjson.gz';OUT=ROOT/'data/san-diego-property-intelligence-runtime-v0';SH=OUT/'shards';VERSION='sd-property-intelligence-runtime-2026-10-28-v0'
def canonical(x):return (json.dumps(x,separators=(',',':'),sort_keys=True)+'\n').encode()
if SH.exists():shutil.rmtree(SH)
SH.mkdir(parents=True);manifest=[];apnh=hashlib.sha256();artifact=hashlib.sha256();count=0;last='';prefix=None;raw=None;gz=None;rows=0;first=''
def close():
 global raw,gz,rows,first
 if gz is None:return
 gz.close();raw.close();p=SH/f'{prefix}.ndjson.gz';b=p.read_bytes();sha=hashlib.sha256(b).hexdigest();artifact.update(prefix.encode()+b'\0'+sha.encode()+b'\n');manifest.append({'prefix':prefix,'path':f'shards/{prefix}.ndjson.gz','rows':rows,'firstApn':first,'lastApn':last,'bytes':len(b),'sha256':sha})
with gzip.open(SRC,'rt') as f:
 for line in f:
  x=json.loads(line);apn=x['apn'];pre=apn[:3]
  if apn<=last:raise SystemExit('source not uniquely sorted')
  if pre!=prefix:
   close();prefix=pre;rows=0;first=apn;raw=open(SH/f'{pre}.ndjson.gz','wb');gz=gzip.GzipFile(fileobj=raw,mode='wb',mtime=0)
  dto={'apn':apn,'preliminaryDwellingState':x['preliminaryDwellingState'],'currentnessState':x['currentnessState'],'provenanceClass':'COMPOSED_PROPERTY_INTELLIGENCE','activeChange':x['currentnessState']=='ACTIVE_CHANGE_IN_PROGRESS','laterChange':x['currentnessState']=='LATER_CHANGE_OBSERVED','boundedAduEvidence':x['permitEvidence']['explicitAduEvidence'],'accessoryStructureCandidate':x['structureObservation']['accessoryStructureCandidate'],'conflictTypes':x['v4']['unresolvedConflictTypes'],'questionClass':x['questionKind'],'publicUseClassification':x['publicUseClassification'],'sourceVersionReceipt':{'assessor':'SANGIS_ARCC_PARCEL_BASE_20260924','permit':'CITY_SD_APPROVALS_20261028_SHA256_5b687cc9','structure':'CITY_SANDAG_BUILDING_OUTLINES_2017','composition':'san-diego-property-intelligence-composition-v0'}}
  gz.write(canonical(dto));rows+=1;count+=1;last=apn;apnh.update(apn.encode()+b'\n')
close()
if count!=393733:raise SystemExit(f'population {count}')
m={'schemaVersion':'private-property-intelligence-runtime-v0','runtimeVersion':VERSION,'buildVersion':'packet-100-v0','compositionVersion':'san-diego-property-intelligence-composition-v0','assessorVersion':'SANGIS_ARCC_PARCEL_BASE_20260924','permitVersion':'CITY_SD_APPROVALS_20261028_SHA256_5b687cc9','structureVersion':'CITY_SANDAG_BUILDING_OUTLINES_2017','rowCount':count,'uniqueApns':count,'apnFingerprint':apnh.hexdigest(),'shardCount':len(manifest),'artifactFingerprint':artifact.hexdigest(),'shards':manifest,'privateOnly':True}
(OUT/'manifest.json').write_text(json.dumps(m,indent=2,sort_keys=True)+'\n')
print(json.dumps({k:m[k] for k in ['rowCount','shardCount','apnFingerprint','artifactFingerprint']},indent=2))
