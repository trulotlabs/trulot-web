#!/usr/bin/env python3
"""Offline mapping-to-RS-standards contract. It does not calculate capacity."""
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'data/rs-base-standards-v0'

def load(name): return json.loads((DATA/name).read_text())

def resolve(mapping_state,zone_codes,coastal_context='outside',as_of='2026-09-30'):
    versions=load('versions.json'); rules=load('standards.json')
    profile=next((p for p in versions['profiles'] if p['coastal_context']==coastal_context and p['as_of']==as_of),None)
    result={'mapping_state':mapping_state,'zone_codes':zone_codes,'coastal_context':coastal_context,'as_of':as_of,'capacity_calculated':False,'blended':False}
    if profile is None or profile['state']!='SUPPORTED':
        return {**result,'state':'APPLICABILITY_UNRESOLVED','standards':[]}
    by_zone={z:[r for r in rules if r['zone_code']==z] for z in {r['zone_code'] for r in rules}}
    if mapping_state=='UNMAPPED': return {**result,'state':'NO_ZONE_STANDARDS','standards':[]}
    if mapping_state in {'AMBIGUOUS','INDETERMINATE'}: return {**result,'state':'NO_DEFINITIVE_STANDARD_SET','standards':[]}
    if mapping_state=='SINGLE_ZONE': selected=zone_codes[:1]
    elif mapping_state=='BOUNDARY_SLIVER': selected=zone_codes[:1]; result['secondary_zoning_evidence']=zone_codes[1:]
    elif mapping_state=='SPLIT_ZONE': selected=zone_codes
    else: return {**result,'state':'UNSUPPORTED_MAPPING_STATE','standards':[]}
    output=[]
    for zone in selected:
        output.append({'zone_code':zone,'state':'SUPPORTED','rules':by_zone[zone]} if zone in by_zone else {'zone_code':zone,'state':'UNSUPPORTED_BY_RS_V0','rules':[]})
    return {**result,'state':'SEPARATE_ZONE_RESULTS','standards':output}

def main():
    p=argparse.ArgumentParser(); p.add_argument('mapping_state'); p.add_argument('zone_codes',nargs='*'); p.add_argument('--coastal-context',default='outside'); p.add_argument('--as-of',default='2026-09-30')
    a=p.parse_args(); print(json.dumps(resolve(a.mapping_state,a.zone_codes,a.coastal_context,a.as_of),indent=2,sort_keys=True))
if __name__=='__main__': main()
