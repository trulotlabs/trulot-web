#!/usr/bin/env python3
import argparse, gzip, hashlib, json, re
from pathlib import Path
from shapely import from_geojson

def canonical(x): return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def sha(b): return hashlib.sha256(b).hexdigest()
def file_sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(8*1024*1024),b''): h.update(c)
 return h.hexdigest()
def rows(p):
 with gzip.open(p,'rt') as f:
  for l in f:
   if l.strip(): yield json.loads(l)

ap=argparse.ArgumentParser(); ap.add_argument('artifacts',type=Path); a=ap.parse_args(); root=a.artifacts
integrity=json.loads((root/'artifact-integrity.json').read_text())
for e in integrity['files']:
 p=root/e['path']; assert p.stat().st_size==e['bytes']; assert file_sha(p)==e['sha256']
report=json.loads((root/'report.json').read_text()); fp=json.loads((root/'fingerprints.json').read_text())
data=list(rows(root/'parcel-classification.ndjson.gz'))
assert len(data)==len({x['apn'] for x in data})==17391
assert sum(report['zoning_classification_counts'].values())==17391
assert sum(report['rule_profile_readiness_counts'].values())==17391
assert report['repair_summary']['unresolved_repairs']==[]
assert report['decision']=='LA_MESA_GEOMETRY_CLASSIFICATION_READY_FOR_RULE_PROFILES'
assert len(report['benchmark_replay'])==9
assert all(x['rule_profile_readiness']!='RULE_PROFILE_READY' for x in data if any(z['code']=='TBD' for z in x['all_zone_intersections']))
stream=b''.join(canonical(x) for x in data)
assert sha(stream)==fp['final_parcel_classification_table']
views={
 'parcel_zoning_classification': lambda x:{'apn':x['apn'],'state':x['base_zoning_state'],'selected':x['selected_zone'],'material':x['material_zones'],'slivers':x['sliver_zones']},
 'overlay_classification': lambda x:{'apn':x['apn'],'overlays':x['mapped_overlays'],'signature':x['mapped_overlay_signature']},
 'specific_plan_classification': lambda x:{'apn':x['apn'],'state':x['specific_plan_state'],'plans':x['specific_plans']},
 'planned_land_use_classification': lambda x:{'apn':x['apn'],'state':x['planned_land_use_state'],'land_use':x['planned_land_use']},
}
for name,fn in views.items(): assert sha(b''.join(canonical(fn(x)) for x in data))==fp[name]
geometry_keys={'zoning':'normalized_zoning_geometry','overlays':'normalized_overlay_geometry','specific-plans':'normalized_specific_plan_geometry','planned-land-use':'normalized_planned_land_use_geometry'}
for name in ['zoning','overlays','specific-plans','planned-land-use']:
 p=root/f'normalized-{name}.geojson.gz'; raw=gzip.decompress(p.read_bytes()); obj=json.loads(raw)
 assert sha(raw)==fp[geometry_keys[name]]
 for f in obj['features']:
  g=from_geojson(json.dumps(f['geometry'],separators=(',',':'))); assert g.is_valid and not g.is_empty
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'AKIA[0-9A-Z]{16}',rb'postgres(?:ql)?://[^\s:@/]+:[^\s@/]+@',rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}']
for p in root.iterdir():
 if not p.is_file(): continue
 b=p.read_bytes()
 try:
  if p.suffix=='.gz': b=gzip.decompress(b)
 except Exception: pass
 assert not any(re.search(q,b,re.I) for q in patterns),p
print('PACKET64_VALIDATION_PASS')
print(json.dumps({'rows':len(data),'zoning':report['zoning_classification_counts'],'readiness':report['rule_profile_readiness_counts']},sort_keys=True))
