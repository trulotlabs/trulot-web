#!/usr/bin/env python3
"""Build compact deterministic Coastal Context V0 evidence from sealed inputs."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, shutil, tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
DEFAULT_DATA=ROOT/'data/coastal-context-v0'
STATIC=['source.json','concepts.json','repository-inventory.json','inventory.json','quarantine.json','mapping-report.json','boundary-analysis.json','v1-comparison.json','fixtures.json','provenance.json','validation.json','preservation.json']
GENERATED=['fixture-results.json','rs-runtime-bridge.json','fingerprints.json','decision.json','integrity.json']

def module(path):
    spec=importlib.util.spec_from_file_location('coastal_resolver',path); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
resolver=module(HERE/'resolver.py')
def load(p): return json.loads(Path(p).read_text())
def dump(p,v): Path(p).write_text(json.dumps(v,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def build(source_dir=DEFAULT_DATA, output_dir=DEFAULT_DATA):
    source_dir,output_dir=Path(source_dir),Path(output_dir); output_dir.mkdir(parents=True,exist_ok=True)
    if source_dir.resolve()!=output_dir.resolve():
        for name in STATIC: shutil.copyfile(source_dir/name,output_dir/name)
    fixtures=load(source_dir/'fixtures.json')['fixtures']
    results=[]
    for spec in fixtures:
        result=resolver.resolve_evidence(spec['mapping_evidence'])
        results.append({'id':spec['id'],'coverage_tags':spec['coverage_tags'],'result':result})
    fixture_payload={'contract_version':resolver.CONTRACT_VERSION,'fixture_count':len(results),'canonical_output_sha256':resolver.fingerprint(results),'results':results}
    dump(output_dir/'fixture-results.json',fixture_payload)
    by_apn={x['result']['parcel']['apn']:x['result'] for x in results}
    bridge={
      'contract_version':resolver.CONTRACT_VERSION,
      'mapping':{s:resolver.packet13_projection(s) for s in sorted(resolver.STATES)},
      'examples':{
       'inside_rs_1_7':{'apn':'3506320400','zoning_state':'SINGLE_ZONE','zone_code':'RS-1-7','coastal_state':by_apn['3506320400']['coastal_context']['evidence_state'],'packet13':by_apn['3506320400']['packet13_bridge'],'outcome':'FAIL_CLOSED_NO_COASTAL_RS_STANDARD_SELECTED'},
       'outside_rs_1_7':{'apn':'6341302200','zoning_state':'SINGLE_ZONE','zone_code':'RS-1-7','coastal_state':by_apn['6341302200']['coastal_context']['evidence_state'],'packet13':by_apn['6341302200']['packet13_bridge'],'outcome':'OUTSIDE_COASTAL_RS_V0_MAY_BE_SELECTED; NO_COMPLIANCE'},
       'boundary':{'apn':'3082980200','coastal_state':by_apn['3082980200']['coastal_context']['evidence_state'],'packet13':by_apn['3082980200']['packet13_bridge'],'outcome':'FAIL_CLOSED'}},
      'inside_coastal_rules_unlocked':False,'parcel_compliance_evaluated':False,'development_capacity_calculated':False}
    dump(output_dir/'rs-runtime-bridge.json',bridge)
    source=load(source_dir/'source.json'); mapping=load(source_dir/'mapping-report.json'); quarantine=load(source_dir/'quarantine.json')
    fingerprints={
      'canonical_rendering':'UTF-8 JSON, keys sorted, separators comma/colon, ensure_ascii=false, allow_nan=false. Full mapping hashes each canonical row plus LF in APN/source stream order.',
      'normalized_coastal_source_sha256':'b0ef9fd459e2acffe4aa1f7ae34df4c5ad40ce232a5002bc283a4f2fd6af1e88',
      'quarantine_sha256':quarantine['fingerprint_sha256'],
      'parcel_coastal_mapping_sha256':mapping['parcel_mapping_sha256'],
      'state_distribution_sha256':mapping['state_distribution_sha256'],
      'fixture_results_sha256':fixture_payload['canonical_output_sha256'],
      'raw_source_artifact_sha256':source['acquisition']['artifacts']['coastal-overlay.geojson']['sha256']}
    dump(output_dir/'fingerprints.json',fingerprints)
    states=mapping['states']
    decision={'decision':'COASTAL_CONTEXT_V0_READY','contract_version':resolver.CONTRACT_VERSION,'city_parcel_count':mapping['city_parcels'],'state_counts':states,'unique_apns':mapping['unique_apns'],'duplicate_apns':mapping['duplicate_apns'],'orphan_parcel_references':mapping['orphan_parcel_references'],'fixture_count':len(results),'inside_coastal_rs_supported':False,'packet13_feed_ready':True,'parcel_compliance_evaluated':False,'development_capacity_calculated':False,'runtime_production_wiring':False,'parcel_v1_modified':False,'production_access':False}
    dump(output_dir/'decision.json',decision)
    names=STATIC+GENERATED[:-1]
    dump(output_dir/'integrity.json',{'algorithm':'sha256','files':{n:sha(output_dir/n) for n in names}})

def check():
    with tempfile.TemporaryDirectory() as td:
        out=Path(td); build(DEFAULT_DATA,out)
        mismatches=[n for n in GENERATED if (DEFAULT_DATA/n).read_bytes()!=(out/n).read_bytes()]
        if mismatches: raise SystemExit('deterministic rebuild mismatch: '+', '.join(mismatches))
        print('PASS deterministic compact evidence rebuild')

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--output-dir',type=Path); p.add_argument('--check',action='store_true'); a=p.parse_args()
    if a.check: check()
    else: build(DEFAULT_DATA,a.output_dir or DEFAULT_DATA)
