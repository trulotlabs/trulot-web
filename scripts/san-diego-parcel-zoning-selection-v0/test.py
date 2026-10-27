#!/usr/bin/env python3
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/san-diego-parcel-zoning-selection-v0"

def check(name, condition):
    if not condition: raise AssertionError(name)
    print("PASS", name)

receipt=json.loads((OUT/'receipt.json').read_text())
check('decision rebuilt',receipt['decision']=='SAN_DIEGO_PARCEL_ZONING_SELECTION_ARTIFACT_REBUILT')
check('canonical rows and identity',receipt['rows']==receipt['distinct_apns']==393733 and receipt['duplicate_apns']==0)
check('canonical APN fingerprint',receipt['apn_fingerprint']=='93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25')
check('canonical states',receipt['zoning_state_counts']=={'SINGLE_ZONE':317604,'MULTI_ZONE':73064,'BOUNDARY_SLIVER':1097,'UNMAPPED':327,'INDETERMINATE':1641})
check('canonical Coastal join',receipt['coastal_state_counts']=={'OUTSIDE_COASTAL':345748,'INSIDE_COASTAL':46455,'BOUNDARY_AMBIGUOUS':1530})
check('original map identity',receipt['inputs']['mapping_sha256']=='e90e223b3b06017b95e191aee8ec1de918dbb45abf836c4f209ae1c345cbf088')
coverage=json.loads((OUT/'packet78-exact-coverage.json').read_text())
check('coverage reconciles',0<coverage['before_unique_apns']<coverage['after_unique_apns']<=coverage['residential_unique_apns'])
support=json.loads((OUT/'residential-support-map.json').read_text())['supported_profiles']
check('eight supported profiles',len(support)==8 and {x['zone'] for x in support}=={'RS-1-7','RM-2-5','RS-1-14','RS-1-4','RS-1-13','RS-1-1','RS-1-2','RS-1-6'})
candidates=json.loads((OUT/'benchmark-candidates.json').read_text())['profiles']
check('three ordinary candidates each',all(len(x['ordinary'])==3 for x in candidates.values()))
check('new RS profiles have Coastal candidates',all(len(candidates[z]['coastal'])>=1 for z in {'RS-1-14','RS-1-4','RS-1-13','RS-1-1','RS-1-2','RS-1-6'}))
bench=json.loads((OUT/'benchmark-regression.json').read_text())['benchmarks']
check('RS benchmark unchanged',bench['6341302200']['dominant_zone']=='RS-1-7' and bench['6341302200']['coastal_context']=='OUTSIDE_COASTAL')
check('RM benchmark unchanged',bench['5442140600']['dominant_zone']=='RM-2-5' and bench['5442140600']['coastal_context']=='OUTSIDE_COASTAL')
rm=json.loads((OUT/'rm-wave-preparation.json').read_text())['zones']
check('RM wave five zones',len(rm)==5 and all(x['unique_apns']>0 for x in rm))
rebuild=json.loads((OUT/'rebuild-receipt.json').read_text())
check('double rebuild exact',rebuild['classification_byte_identical'] and rebuild['selection_build_byte_identical'] and rebuild['source_reacquisition'] is False)
integrity=json.loads((OUT/'integrity.json').read_text())['files']
check('artifact integrity',all(hashlib.sha256((OUT/name).read_bytes()).hexdigest()==digest for name,digest in integrity.items()))
with gzip.open(OUT/'parcel-zoning-selection.ndjson.gz','rt') as stream:
    first=json.loads(next(stream))
check('row schema',set(json.loads((OUT/'schema.json').read_text())['required'])<=set(first))
serialized=json.dumps(receipt)+json.dumps(coverage)
check('containment',not any(x in serialized.lower() for x in ('postgresql://','service_role','password')) and receipt['production'] is False and receipt['capacity'] is False)
print('17 Packet 79 checks passed.')
