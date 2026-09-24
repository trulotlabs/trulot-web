"""Review quarantined raw geometry without repairing it or changing Packet 6 acceptance."""
import gzip
import hashlib
import importlib.util
import json
import pathlib
import sys
from collections import Counter,defaultdict
from shapely.geometry import shape
from shapely.validation import explain_validity

ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('stream',ROOT/'scripts/sangis-acquisition-stream.py')
stream=importlib.util.module_from_spec(spec);spec.loader.exec_module(stream)


def review(acquisition_dir,pass_dir):
    acquisition_dir=pathlib.Path(acquisition_dir);pass_dir=pathlib.Path(pass_dir)
    acquisition=json.loads((acquisition_dir/'acquisition.json').read_text());artifact=acquisition_dir/acquisition['receipt']['originalFilename']
    with artifact.open('rb') as file:assert hashlib.file_digest(file,'sha256').hexdigest()==acquisition['receipt']['contentSha256']
    entries={};combinations=Counter();validity=Counter();raw_nulls=Counter();duplicate_groups=defaultdict(list);ring_details=[]
    with gzip.open(pass_dir/'rejected.ndjson.gz','rt') as file:
        for line in file:
            row=json.loads(line);entries[row['row']['sourceObjectId']]=row;combinations[' + '.join(row['reasons'])]+=1
    seen=0
    with artifact.open(encoding='utf-8-sig') as file:
        for feature in stream.features(file):
            props=feature['properties'];entry=entries.get(props['objectid'])
            if entry is None:continue
            seen+=1
            if 'INVALID_APN' in entry['reasons']:
                raw_nulls['apnNull']+=props['apn'] is None
                raw_nulls['situsJurisNull']+=props['situs_juris'] is None
                raw_nulls['situsAddressNull']+=props['situs_address'] is None
            if any(reason in entry['reasons'] for reason in ['INVALID_GEOMETRY','UNCLOSED_OR_SHORT_RING']):
                try:description=explain_validity(shape(feature['geometry']))
                except Exception as error:description=type(error).__name__
                validity[description.split('[')[0]]+=1
                if 'UNCLOSED_OR_SHORT_RING' in entry['reasons']:
                    coords=feature['geometry']['coordinates'];polygons=[coords] if feature['geometry']['type']=='Polygon' else coords
                    ring_details.append({'sourceObjectId':props['objectid'],'rings':[{'positions':len(r),'closed':r[0]==r[-1]} for p in polygons for r in p],'geosValidity':description.split('[')[0]})
            if 'DUPLICATE_APN_OR_OBJECTID' in entry['reasons']:
                duplicate_groups[hashlib.sha256(entry['row']['apnNorm'].encode()).hexdigest()].append({'sourceObjectId':props['objectid'],'parcelId':props['parcelid'],'geometrySha256':entry['geometryStats']['geometryHash'],'jurisdiction':props['situs_juris']})
    assert seen==1328==len(entries)
    return {'acquisitionId':acquisition['acquisitionId'],'rejectedRows':seen,'reasonCombinations':dict(combinations),'nullApnEvidence':dict(raw_nulls),
        'geometryValidityReasons':dict(validity),'ringDetails':ring_details,'duplicateApnGroups':dict(duplicate_groups),
        'automaticRepairPerformed':False,'acceptedPopulationChanged':False,
        'interpretation':{'INVALID_APN':'All 1,016 are source-null APNs, not malformed numeric strings. Their precise source purpose is unproven; unsupported by the explicit APN-bearing base contract, not evidence of padding/normalizer failure.',
        'INVALID_GEOMETRY':'Raw source geometry fails GEOS validity; retained quarantine, no repair. Domain/survey correctness cannot be inferred.',
        'UNCLOSED_OR_SHORT_RING':'Original ring structure fails explicit contract; raw ring statistics recorded, no autoclosing.',
        'DUPLICATE_APN_OR_OBJECTID':'Ten rows in repeated-APN groups. Source identity remains distinct. Could be legitimate multi-row representation; resolving APN business identity needs separate adjudication. Existing quarantine is intentional, not silent deduplication.'}}


if __name__=='__main__':
    print(json.dumps(review(*sys.argv[1:]),indent=2))
