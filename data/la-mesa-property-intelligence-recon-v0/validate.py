#!/usr/bin/env python3
import gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
def j(n): return json.loads((ROOT/n).read_text())
with gzip.open(REPO/'data/la-mesa-parcel-lookup-serving-v0/serving-rows.ndjson.gz','rt') as f: apns=[json.loads(x)['apnNormalized'] for x in f]
assert len(apns)==17391 and len(set(apns))==17391
assert hashlib.sha256(('\n'.join(sorted(apns))+'\n').encode()).hexdigest()=='11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467'
c=j('assessor-coverage.json'); assert c['denominator']==17391 and c['fields']['reliable_year_built']['count']==0
p=j('permit-sample.json'); assert p['sampleSize']>=25 and len(p['rows'])==p['sampleSize'] and p['withRecords']==23
f=j('footprint-recon.json')['join']; assert f['canonical_parcels']==17391 and sum(f['counts'][x] for x in ['no_footprint','one_footprint','multiple_footprints'])==17391
s=j('assessor-sample.json'); assert len(s['rows'])>=25 and any(x['apn']=='4685100900' for x in s['rows'])
u=j('coverage-uplift.json'); assert u['bounds']['conservative']['count']==11993 and u['bounds']['optimistic']['count']==15289
assert j('decision.json')['decision']=='LA_MESA_PROPERTY_INTELLIGENCE_RECON_READY_FOR_IMPLEMENTATION'
assert j('fact-model.json')['schemaVersion']=='jurisdiction-neutral-property-fact-v0'
manifest=j('integrity.json')['files']
for rel,meta in manifest.items():
 data=(ROOT/rel).read_bytes()
 assert len(data)==meta['bytes'] and hashlib.sha256(data).hexdigest()==meta['sha256'], rel
print('Packet 72 validation: PASS')
