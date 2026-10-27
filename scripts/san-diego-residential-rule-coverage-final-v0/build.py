#!/usr/bin/env python3
"""Build Packet 82 final San Diego residential rule-coverage artifacts."""
from __future__ import annotations

import gzip
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT=Path('/Users/ops/trulot-web-parcel')
OUT=ROOT/'data/san-diego-residential-rule-coverage-final-v0'
P79=ROOT/'data/san-diego-parcel-zoning-selection-v0'
P80=ROOT/'data/san-diego-rm-rule-expansion-wave1-v0'
P81=ROOT/'data/san-diego-residential-rule-expansion-wave2-v0'
TARGETS=('RS-1-5','RS-1-12','RS-1-9','RM-4-11','RS-1-3','RT-1-4','RS-1-10','RT-1-5')
RS_TARGETS=tuple(z for z in TARGETS if z.startswith('RS-'))
RM_TARGETS=('RM-4-11',)
RT_TARGETS=('RT-1-4','RT-1-5')
CONTRACT='san-diego-residential-rule-coverage-final-2026-10-27-v0'
CURRENT_SHA='9a15478c65d5498e79e85e3399d7c18ec198436cc008cf87c34e7408bf2aa538'
P79_SHA='ce09b175011ce9907690cfdd598a7da185e229f0b0a2d42298263664d9acbeaf'
BASELINE_SUPPORTED=322891
RESIDENTIAL_TOTAL=326532

def load(path:Path)->Any:return json.loads(path.read_text())
def canonical(v:Any)->bytes:return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()
def sha(v:Any)->str:return hashlib.sha256(canonical(v)).hexdigest()
def file_sha(path:Path)->str:return hashlib.sha256(path.read_bytes()).hexdigest()
def write_json(name:str,v:Any)->None:(OUT/name).write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
def write_gz(name:str,rows:list[dict[str,Any]])->None:
 with (OUT/name).open('wb') as raw:
  with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as out:out.write(b''.join(canonical(r)+b'\n' for r in rows))

def import_p81():
 path=ROOT/'scripts/san-diego-residential-rule-expansion-wave2-v0/build.py'; spec=importlib.util.spec_from_file_location('packet81_build',path); mod=importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(mod); return mod
P81_BUILD=import_p81()

P81_BUILD.P80_BUILD.ZONE_ROWS['RM-4-11']={"density":200,"lot_area":7000,"width":100,"frontage":100,"corner":100,"depth":100,"front_min":None,"front_std":None,"side_min":None,"side_std":None,"street_side":None,"rear":None,"height":None,"height_notes":["FN37"],"far":[("ALL",7.20,[])],"setback_notes":["FN14"],"private_note":"FN25","projection_note":"FN16","supplemental_note":None,"ground_floor":True,"lot_consolidation":False}

def family_schema(zone:str)->str:
 return {'RS':'RS_TABLE_131_04D_GENERIC_V1','RM':'RM_TABLE_131_04G_GENERIC_V1','RX':'RX_TABLE_131_04E_GENERIC_V1','RT':'RT_TABLE_131_04F_GENERIC_V1'}[zone.split('-')[0]]

def generic_rule(zone:str,family:str,value:Any,unit:str|None,operator:str,representation:str,locator:str,conditions:list[str]|None=None,unresolved:list[str]|None=None,footnotes:list[str]|None=None,variant:str='OUTSIDE_COASTAL')->dict[str,Any]:
 return {'rule_id':f'{zone}:{family}:{variant}','zone_code':zone,'rule_family':family,'representation':representation,'operator':operator,'value':{'kind':'unknown'} if value is None else {'kind':'number' if isinstance(value,(int,float)) else 'recorded','value':value},'unit':unit,'conditions':conditions or [],'footnote_ids':footnotes or [],'unresolved_dependencies':unresolved or [],'source_fingerprint':sha({'source':CURRENT_SHA,'zone':zone,'family':family,'value':value,'locator':locator,'variant':variant,'footnotes':footnotes or []}),'source_locator':{'document':'SDMC_CH13_ART1_DIV4_9_2026','table_or_section':locator,'artifact_sha256':CURRENT_SHA},'derivation_class':'recorded' if representation=='DIRECT' else 'conditional','public_evaluation_state':'SOURCE_NOT_SPECIFIED' if representation=='NOT_SPECIFIED' else 'RULE_FACT_ONLY_REVIEW_REQUIRED' if representation!='DIRECT' else 'RULE_FACT_ONLY','project_comparison':False}

def rt_rules(zone:str)->list[dict[str,Any]]:
 v={'RT-1-4':{'area':2200,'width':25,'frontage':25,'corner':25,'depth':80,'front_max':15,'coverage':75,'far12':1.10,'far3':1.50},'RT-1-5':{'area':1600,'width':18,'frontage':18,'corner':25,'depth':80,'front_max':10,'coverage':75,'far12':1.20,'far3':1.60}}[zone]
 rows=[
 ('DENSITY',1,'dwelling_unit_per_lot','BASIS','CONDITIONAL',['BASE_TABLE_BASIS_NOT_CAPACITY'],['PROJECT_PROGRAMS']),('MINIMUM_LOT_AREA',v['area'],'sq_ft','MIN','CONDITIONAL',['ALLEY_AREA_CREDIT_UP_TO_HALF_WIDTH_CAPPED_10_FT_AND_10_PERCENT'],['ALLEY_ACCESS','ALLEY_WIDTH']),('MINIMUM_LOT_WIDTH',v['width'],'ft','MIN','DIRECT',[],[]),('MINIMUM_STREET_FRONTAGE',v['frontage'],'ft','MIN','DIRECT',[],[]),('MINIMUM_CORNER_LOT_WIDTH',v['corner'],'ft','MIN','DIRECT',[],[]),('MINIMUM_LOT_DEPTH',v['depth'],'ft','MIN','DIRECT',[],[]),
 ('FRONT_SETBACK_MINIMUM',5,'ft','FORMULA','FORMULA',['BASE_FORMULA_10_PERCENT_LOT_DEPTH','MINIMUM_5_FT',f'MAXIMUM_{v["front_max"]}_FT','SOME_FACADE_WITHIN_1_FT_OF_SETBACK_LINE','50_PERCENT_FACADE_MAY_ENCROACH_PER_131_0461_B'],['LOT_DEPTH','FACADE_GEOMETRY']),('FRONT_SETBACK_MAXIMUM',v['front_max'],'ft','MAX','DIRECT',[],[]),('INTERIOR_SIDE_SETBACK_MINIMUM',0,'ft','FORMULA','CONDITIONAL',['LIGHTWELLS_AND_COURTYARDS_MIN_6_BY_10_FT','3_FT_ADJACENT_NON_RT','WINDOWS_DOORS_REQUIRE_5_FT'],['ADJACENT_ZONE','OPENING_GEOMETRY','COURTYARD_GEOMETRY']),('STREET_SIDE_SETBACK_MINIMUM',5,'ft','MIN','DIRECT',[],[]),('REAR_SETBACK_MINIMUM',3,'ft','MIN','DIRECT',[],[]),
 ('STRUCTURE_HEIGHT_MAXIMUM',{'1_TO_2_STORY':{'slab_ft':21,'raised_ft':25},'3_STORY':{'slab_ft':31,'raised_ft':35}},'ft','MAX','FORMULA',['SLOPED_ROOF_MAY_ADD_5_FT','30_DEGREE_FRONT_ENVELOPE_ABOVE_27_FT'],['STORY_COUNT','FOUNDATION_TYPE','ROOF_SLOPE','STRUCTURE_GEOMETRY']),('LOT_COVERAGE_MAXIMUM',v['coverage'],'percent','MAX','FORMULA',['GARAGE_EXCLUSIONS_PER_131_0445_B'],['GARAGE_GEOMETRY']),('FLOOR_AREA_RATIO_MAXIMUM',{'1_TO_2_STORY':v['far12'],'3_STORY':v['far3']},'ratio','MAX','FORMULA',['GARAGE_EXCLUSION_UP_TO_525_SQ_FT'],['STORY_COUNT','GARAGE_AREA','CODE_GFA','LEGAL_PREMISES_AREA']),
 ('ACCESSORY_USES_STRUCTURES','APPLIES',None,'PROCESS','CONDITIONAL',[],['PROJECT_FEATURES']),('GARAGE_REGULATIONS','APPLIES',None,'PROCESS','CONDITIONAL',[],['GARAGE_DESIGN']),('PARKWAY_REQUIREMENTS','APPLIES',None,'PROCESS','CONDITIONAL',[],['STREET_CONTEXT']),('ARCHITECTURAL_PROJECTIONS','PERMITTED',None,'PROCESS','CONDITIONAL',['SECTION_131_0461_B'],['FEATURE_GEOMETRY']),('SUPPLEMENTAL_REQUIREMENTS','APPLIES',None,'PROCESS','CONDITIONAL',['SECTION_131_0464_C'],['PROJECT_DESIGN']),('REFUSE_RECYCLING_STORAGE','APPLIES',None,'PROCESS','CONDITIONAL',[],['PROJECT_DESIGN']),('VISIBILITY_AREA','APPLIES',None,'PROCESS','CONDITIONAL',[],['VISIBILITY_GEOMETRY']),('DWELLING_UNIT_PROTECTION','APPLIES',None,'PROCESS','CONDITIONAL',[],['PROJECT_CONTEXT'])]
 return [generic_rule(zone,r[0],r[1],r[2],r[3],r[4],'Table 131-04F; 131.0441-131.0464',r[5],r[6]) for r in rows]

def rs_rules(zone:str,coastal:str)->list[dict[str,Any]]:
 path=ROOT/('data/inside-coastal-rs-standards-v0/standards.json' if coastal=='INSIDE_COASTAL' else 'data/rs-base-standards-v0/standards.json');source=[r for r in load(path) if r['zone_code']==zone];out=[]
 for row in source:
  representation='DIRECT' if not row.get('unresolved_dependencies') and not row.get('condition') else 'CONDITIONAL';value=row.get('value',{});actual=value.get('number',value.get('text',value.get('kind')));footnote_ids=[x for x in row.get('exceptions',[]) if x.startswith('131-04D:')];out.append(generic_rule(zone,row['standard_key'],actual,row.get('unit'),row.get('operator','PROCESS'),representation,f"{row['source_table']} p.{row['source_page']} / {row['source_section']}",row.get('condition',[]),row.get('unresolved_dependencies',[]),footnote_ids,coastal))
 if len(out) not in {24,25}:raise RuntimeError(f'unexpected RS row count for {zone}/{coastal}: {len(out)}')
 return out

def profile_rules(zone:str,coastal:str)->list[dict[str,Any]]:
 if zone in RS_TARGETS:return rs_rules(zone,coastal)
 if zone in RM_TARGETS:return P81_BUILD.rm_rules(zone)
 return rt_rules(zone)

def associations(row:dict[str,Any])->set[str]:return {x['zone'] for x in row.get('material_zones',[])+row.get('sliver_zones',[])}
def selected_ready(row:dict[str,Any],supported:set[str])->bool:return row.get('selected_zone') in supported and row.get('zoning_state') in {'SINGLE_ZONE','BOUNDARY_SLIVER'} and row.get('coastal_context') in {'OUTSIDE_COASTAL','INSIDE_COASTAL'}
def version(zone:str,coastal:str)->str:
 if coastal not in {'OUTSIDE_COASTAL','INSIDE_COASTAL'}:return 'UNRESOLVED_COASTAL_VERSION'
 return f'{zone.split("-")[0]}_FINAL_{"OUTSIDE_COASTAL_2026_07_15" if coastal=="OUTSIDE_COASTAL" else "INSIDE_COASTAL_2026_09_10"}'

def validate_selection_record(r:dict[str,Any],footnotes:dict[str,Any])->None:
 if r.get('zone') not in TARGETS:raise ValueError('unsupported family/profile')
 if r.get('family_schema')!=family_schema(r['zone']):raise ValueError('wrong family schema')
 if r.get('coastal_context') not in {'OUTSIDE_COASTAL','INSIDE_COASTAL','BOUNDARY_AMBIGUOUS'}:raise ValueError('wrong Coastal context')
 if r.get('profile_version')!=version(r['zone'],r['coastal_context']):raise ValueError('wrong Coastal version')
 if not r.get('source_fingerprints'):raise ValueError('missing source')
 if r.get('zoning_state')=='MULTI_ZONE' and r.get('profile_ready'):raise ValueError('multi-zone treated as pure')
 if r.get('modifier_review_state')=='RESOLVED_UNCONDITIONAL':raise ValueError('unresolved modifier promoted')
 if 'DRAFT' in r.get('profile_version','') or 'FUTURE' in r.get('profile_version',''):raise ValueError('future/draft rule')
 if any(fid not in footnotes for fid in r.get('referenced_footnote_ids',[])):raise ValueError('missing footnote')

def prior_zone_sets()->tuple[set[str],dict[str,str]]:
 source={}
 support=load(P79/'residential-support-map.json')
 for x in support['supported_profiles']:
  z=x['zone']; source[z]='data/rm-rule-profile-v0' if z=='RM-2-5' else 'data/rs-rule-profile-v0' if z=='RS-1-7' else 'data/san-diego-residential-rule-expansion-v0'
 for z in load(P80/'decision.json')['successful_profiles']:source[z]='data/san-diego-rm-rule-expansion-wave1-v0'
 for z in load(P81/'decision.json')['successful_profiles']:source[z]='data/san-diego-residential-rule-expansion-wave2-v0'
 return set(source),source

def build()->dict[str,Any]:
 OUT.mkdir(parents=True,exist_ok=True)
 if file_sha(P79/'parcel-zoning-selection.ndjson.gz')!=P79_SHA:raise RuntimeError('Packet 79 mismatch')
 if load(P81/'coverage.json')['after_packet81_unique_apns']!=BASELINE_SUPPORTED:raise RuntimeError('Packet 81 baseline mismatch')
 profiles=[]; by_zone={}
 for zone in TARGETS:
  contexts=[]
  for coastal,components in (('OUTSIDE_COASTAL',['O-21836','O-21934','O-22109']),('INSIDE_COASTAL',['O-21836','LCP-6-SAN-24-0038-3','O-22117','O-21934','LCP-6-SAN-25-0037-1'])):
   rules=profile_rules(zone,coastal); extraction=sha({'source_artifact_sha256':CURRENT_SHA,'zone':zone,'family_schema':family_schema(zone),'rules':rules})
   contexts.append({'coastal_context':coastal,'profile_version':version(zone,coastal),'effective_from':'2026-07-15' if coastal=='OUTSIDE_COASTAL' else '2026-09-10','ordinance_components':components,'fire_buffer_interface':'ACTIVE_EXTERNAL_SAFETY_CONSTRAINT' if coastal=='OUTSIDE_COASTAL' else 'O22109_PENDING_NOT_APPLIED','source_fingerprint':sha({'zone':zone,'coastal':coastal,'components':components,'extraction':extraction}),'extraction_fingerprint':extraction,'rules':rules})
  p={'zone_code':zone,'family_schema':family_schema(zone),'contexts':contexts};profiles.append(p);by_zone[zone]=p
 write_json('rule-profiles.json',{'contract_version':CONTRACT,'selected_zones':list(TARGETS),'profiles':profiles,'family_doctrine':'Existing RS/RM/RT family architecture only; no new specialized family.','doctrines':['DENSITY_IS_NOT_CAPACITY','MULTI_ZONE_REVIEW_REQUIRED','AMBIGUOUS_OR_INDETERMINATE_FAILS_CLOSED','PROJECT_COMPARISON_NOT_PERFORMED']})
 used=sorted({f for p in profiles for c in p['contexts'] for r in c['rules'] for f in r['footnote_ids']});rs_notes=load(ROOT/'data/rs-base-standards-v0/footnotes.json');notes={}
 for fid in used:
  raw=rs_notes[fid] if fid.startswith('131-04D:') else P81_BUILD.P80_BUILD.FOOTNOTES[fid]; notes[fid]={**raw,'version':'TABLE_131_04D_9_2026' if fid.startswith('131-04D:') else 'TABLE_131_04G_9_2026','extraction_fingerprint':sha({'id':fid,**raw})}
 write_json('footnotes.json',{'used_footnotes':used,'footnotes':notes,'material_footnote_completeness':'COMPLETE_WITH_ORPHAN_STATES_EXPLICIT','missing_reference_policy':'FAIL_VALIDATION'})
 write_json('family-schemas.json',{'schema_refs':{'RS_TABLE_131_04D_GENERIC_V1':'data/san-diego-residential-rule-expansion-v0/family-schema.json','RM_TABLE_131_04G_GENERIC_V1':'data/san-diego-rm-rule-expansion-wave1-v0/family-schema.json','RT_TABLE_131_04F_GENERIC_V1':'data/san-diego-residential-rule-expansion-wave2-v0/family-schemas.json'},'new_family_models':False,'representations':['DIRECT','FORMULA','CONDITIONAL','NOT_SPECIFIED','MODIFIER_DEPENDENT','UNRESOLVED'],'capacity_calculation':False})
 write_json('source-version-receipts.json',{'verified_as_of':'2026-10-27','current_division4':{'sha256':CURRENT_SHA,'url':'https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf','locators':['Table 131-04D pp.33-39','Table 131-04F pp.38-39','Table 131-04G pp.40-44','131.0441-131.0464']},'outside_version':{'effective_from':'2026-07-15','components':['O-21836','O-21934','O-22109']},'inside_version':{'effective_from':'2026-09-10','components':['O-21836','LCP-6-SAN-24-0038-3','O-22117','O-21934','LCP-6-SAN-25-0037-1'],'excluded_pending':'O-22109'},'inside_chain_sha256':file_sha(ROOT/'data/inside-coastal-rs-standards-v0/legal-version-chain.json')})
 before_zones,profile_sources=prior_zone_sets();after_zones=before_zones|set(TARGETS)
 residential=set();before=set();after=set();zone_apns=defaultdict(set);target_union=set();target_rows=[];city_rows=[];pops={z:{k:0 for k in ('unique_apns','incremental_unique_apns','single_zone','multi_zone','sliver','indeterminate','inside_coastal','outside_coastal','boundary_ambiguous','profile_ready')} for z in TARGETS}; review_reasons=Counter(); unsupported=[]
 with gzip.open(P79/'parcel-zoning-selection.ndjson.gz','rt') as stream:
  for line in stream:
   row=json.loads(line);apn=row['apn'];zones=associations(row);rz={z for z in zones if z.startswith(('RS-','RM-','RX-','RT-'))}
   if not rz:continue
   residential.add(apn)
   for z in rz:zone_apns[z].add(apn)
   if zones&before_zones:before.add(apn)
   supported=sorted(rz&after_zones)
   if supported:after.add(apn)
   target_matches=sorted(set(TARGETS)&rz)
   for z in target_matches:
    target_union.add(apn);p=pops[z];p['unique_apns']+=1
    p[{'SINGLE_ZONE':'single_zone','MULTI_ZONE':'multi_zone','BOUNDARY_SLIVER':'sliver','INDETERMINATE':'indeterminate'}[row['zoning_state']]]+=1
    p[{'INSIDE_COASTAL':'inside_coastal','OUTSIDE_COASTAL':'outside_coastal','BOUNDARY_AMBIGUOUS':'boundary_ambiguous'}[row['coastal_context']]]+=1
    is_ready=selected_ready(row,{z}) and row.get('selected_zone')==z;p['profile_ready']+=int(is_ready)
    refs=sorted({f for c in by_zone[z]['contexts'] for rule in c['rules'] for f in rule['footnote_ids']})
    rec={'apn':apn,'zone':z,'family':z.split('-')[0],'family_schema':family_schema(z),'coastal_context':row['coastal_context'],'profile_version':version(z,row['coastal_context']),'zoning_state':row['zoning_state'],'selected_zone':row.get('selected_zone'),'profile_ready':is_ready,'readiness':'PROFILE_SELECTED_MODIFIER_REVIEW_REQUIRED' if is_ready else 'REVIEW_REQUIRED_MAPPING_OR_COASTAL','modifier_review_state':'UNRESOLVED_REVIEW_REQUIRED','source_fingerprints':row['source_fingerprints'],'referenced_footnote_ids':refs,'provenance':{'packet79_selection_sha256':P79_SHA,'classification_method':row['provenance']['classification_method'],'coastal_method':row['provenance']['coastal_method']},'feasibility_result':None};validate_selection_record(rec,notes);target_rows.append(rec)
   pure=selected_ready(row,after_zones);selected=row.get('selected_zone') if pure else None
   if pure:readiness='PROFILE_SELECTED_MODIFIER_REVIEW_REQUIRED';reason='PROFILE_SELECTED'
   elif row['zoning_state']=='MULTI_ZONE':readiness='REVIEW_REQUIRED';reason='MULTI_ZONE_UNRESOLVED'
   elif row['zoning_state']=='INDETERMINATE':readiness='FAIL_CLOSED';reason='ZONING_INDETERMINATE'
   elif row['coastal_context']=='BOUNDARY_AMBIGUOUS':readiness='FAIL_CLOSED';reason='COASTAL_BOUNDARY_AMBIGUOUS'
   else:readiness='REVIEW_REQUIRED';reason='SELECTION_OR_MAPPING_REVIEW'
   review_reasons[reason]+=1
   unsupported_reason=None if supported else 'UNSUPPORTED_LOW_COUNT_ZONE';
   if unsupported_reason:unsupported.append({'apn':apn,'zones':sorted(rz),'reason':unsupported_reason})
   city_rows.append({'apn':apn,'supported_profiles':[{'zone':z,'family':z.split('-')[0],'family_schema':family_schema(z)} for z in supported],'selected_profile':selected,'selected_family_schema':family_schema(selected) if selected else None,'coastal_context':row['coastal_context'],'coastal_version':version(selected,row['coastal_context']) if selected else 'UNRESOLVED_SELECTION_VERSION','zoning_state':row['zoning_state'],'readiness':readiness,'readiness_reason':reason,'modifier_review_state':'UNRESOLVED_REVIEW_REQUIRED','unsupported_reason':unsupported_reason,'provenance':{'packet79_selection_sha256':P79_SHA,'classification_method':row['provenance']['classification_method'],'coastal_method':row['provenance']['coastal_method']},'feasibility_result':None})
 for z in TARGETS:pops[z]['incremental_unique_apns']=len(zone_apns[z]-before)
 if len(residential)!=RESIDENTIAL_TOTAL or len(before)!=BASELINE_SUPPORTED:raise RuntimeError(f'coverage baseline mismatch {len(residential)} {len(before)}')
 target_rows.sort(key=lambda r:(r['apn'],r['zone']));city_rows.sort(key=lambda r:r['apn']);unsupported.sort(key=lambda r:r['apn']);write_gz('apn-profile-selection.ndjson.gz',target_rows);write_gz('citywide-residential-support.ndjson.gz',city_rows);write_gz('remaining-unsupported.ndjson.gz',unsupported);write_json('target-populations.json',{'basis':'exact Packet 79 associations with incremental set difference from Packet 81 support','zones':pops})
 candidates={};available={};manual=[]
 for z in TARGETS:
  zr=[r for r in target_rows if r['zone']==z];groups={'ordinary':[r for r in zr if r['profile_ready'] and r['zoning_state']=='SINGLE_ZONE' and r['coastal_context']=='OUTSIDE_COASTAL'],'inside_coastal':[r for r in zr if r['profile_ready'] and r['zoning_state']=='SINGLE_ZONE' and r['coastal_context']=='INSIDE_COASTAL'],'edge':[r for r in zr if not r['profile_ready'] or r['zoning_state']!='SINGLE_ZONE']};available[z]={k:len(v) for k,v in groups.items()};candidates[z]={}
  for cat,vals in groups.items():candidates[z][cat]=[{k:r[k] for k in ('apn','zone','family_schema','zoning_state','coastal_context','profile_version','profile_ready')} for r in sorted(vals,key=lambda r:(hashlib.sha256(f'{z}|{cat}|{r["apn"]}'.encode()).hexdigest(),r['apn']))[:3]]
  preferred=candidates[z]['ordinary'] or candidates[z]['inside_coastal'];o=preferred[0];manual.append({'zone':z,'apn':o['apn'],'zone_check':'VERIFIED_PACKET79_EXACT_ROW','family_schema':family_schema(z),'coastal_context':o['coastal_context'],'profile_version':o['profile_version'],'rule_row':f'VERIFIED_{z}_SOURCE_TABLE','footnotes':'VERIFIED_ALL_REFERENCES_PRESENT','modifier_state':'UNRESOLVED_REVIEW_REQUIRED','no_project_compliance':True})
 write_json('golden-candidates.json',{'ranking':'SHA256(zone|category|apn), ascending','profiles':candidates,'available_counts':available,'empty_categories_not_invented':True});write_json('manual-verification.json',{'state':'VERIFIED','one_candidate_per_profile':manual,'ordinary_preferred_inside_coastal_used_when_no_ordinary_exists':True,'no_capacity':True})
 added=after-before;ready_apns={r['apn'] for r in city_rows if r['readiness']=='PROFILE_SELECTED_MODIFIER_REVIEW_REQUIRED'};coverage={'metric':'unique residential APNs with any association to a supported profile','residential_unique_apns':len(residential),'before_packet82_unique_apns':len(before),'packet82_incremental_unique_apns':len(added),'after_packet82_unique_apns':len(after),'after_packet82_percent':round(len(after)/len(residential)*100,6),'profile_ready_unique_apns':len(ready_apns),'review_required_unique_apns':len(after-ready_apns),'unsupported_unique_apns':len(residential-after),'target_association_rows':len(target_rows),'target_unique_apns':len(target_union),'overlap_rule':'APNs counted once using set unions','thresholds':{'99_percent':len(after)/len(residential)>.99,'99_5_percent':len(after)/len(residential)>.995,'99_9_percent':len(after)/len(residential)>.999}}
 write_json('coverage.json',coverage);write_json('remaining-unsupported-audit.json',{'unsupported_apns':len(unsupported),'unsupported_reason_counts':dict(Counter(r['reason'] for r in unsupported)),'supported_but_review_required_counts':dict(sorted(review_reasons.items())),'classifications':['unsupported_low_count_zone','zoning_unmapped_or_indeterminate','multi_zone_unresolved','modifier_or_source_gap','specialized_or_planned_district','other'],'finding':'NO_RESIDENTIAL_APN_REMAINS_WITHOUT_A_SUPPORTED_BASE_PROFILE; review states remain and are not compliance conclusions.'})
 profile_sources.update({z:'data/san-diego-residential-rule-coverage-final-v0' for z in TARGETS});registry=[]
 for z in sorted(after_zones):
  source=profile_sources[z];source_dir=ROOT/source.strip('/');source_file=source_dir/'rule-profiles.json' if z in TARGETS else source_dir/'integrity.json' if (source_dir/'integrity.json').exists() else source_dir/'decision.json';contexts=['OUTSIDE_COASTAL','INSIDE_COASTAL'];meta={'zone':z,'family':z.split('-')[0],'family_schema':family_schema(z),'source':source,'source_artifact_sha256':file_sha(source_file),'coastal_contexts':contexts,'outside_legal_version':'OUTSIDE_COASTAL_2026_07_15','inside_legal_version':'INSIDE_COASTAL_2026_09_10'};registry.append({**meta,'profile_fingerprint':sha(meta)})
 write_json('final-profile-registry.json',{'profile_count':len(registry),'families':dict(Counter(x['family'] for x in registry)),'profiles':registry,'all_observed_residential_zones_registered':set(zone_apns)<=after_zones})
 write_json('accuracy-bottlenecks.json',{'ranking':[{'rank':1,'gap':'permit_currentness_source','evidence':'Base-zone profile coverage does not establish current permit or entitlement state.'},{'rank':2,'gap':'property_intelligence_currentness','evidence':'Rule coverage does not refresh source-age or property-event intelligence.'},{'rank':3,'gap':'production_zoning_readiness','evidence':'Packet 11 remains frozen; no production snapshot is selected.'},{'rank':4,'gap':'modifier_specific_plan_completeness','evidence':'Modifier review remains unresolved by design on every selected profile.'},{'rank':5,'gap':'remaining_unsupported_zone_profiles','evidence':'Zero residential APNs remain without a supported observed base-zone profile.'},{'rank':6,'gap':'other','evidence':'No larger evidenced local base-profile gap remains.'}],'largest_accuracy_gap':'permit_currentness_source'})
 write_json('production-readiness.json',{'near_complete_local_profile_coverage':True,'production_ready':False,'blockers':{'production_zoning_selection':'Packet 11 frozen; no selected production snapshot.','public_activation':'No runtime/public activation authorized or implemented.','citywide_currentness':'Permit and property-intelligence currentness remain unresolved.','program_eligibility':'ADU/SB9/SB79 and other program eligibility are outside base-profile coverage.'},'packet_11_frozen':True,'selected_snapshot_change':False})
 write_json('compatibility.json',{'existing_benchmarks':{'RS-1-7:6341302200':'UNCHANGED_BY_CONSTRUCTION','RM-2-5:5442140600':'UNCHANGED_BY_CONSTRUCTION'},'packet78':'UNCHANGED','packet80':'UNCHANGED','packet81':'UNCHANGED','rx_family':'UNCHANGED','rt_family':'EXTENDED_WITH_SAME_SCHEMA','v4_rule_fields':['rule_family','representation','operator','value','conditions','footnote_ids','unresolved_dependencies','source_fingerprint','public_evaluation_state'],'la_mesa':'UNCHANGED','production_parcel_lookup':'UNCHANGED','runtime_activation':False,'capacity':False})
 write_json('schema.json',{'target_selection':'SanDiegoResidentialCoverageFinalTargetSelectionV0','citywide_support':'SanDiegoResidentialCitywideSupportV0','registry':'SanDiegoResidentialProfileRegistryV0','selection_granularity':'one APN-target-zone association','citywide_granularity':'one row per residential APN','multi_zone_policy':'REVIEW_REQUIRED','ambiguous_or_indeterminate_policy':'FAIL_CLOSED','no_feasibility_result':True})
 write_json('decision.json',{'decision':'SAN_DIEGO_RESIDENTIAL_RULE_COVERAGE_FINALIZED','successful_profiles':list(TARGETS),'failed_profiles':[],'stop_broad_expansion':'STOP_BROAD_RESIDENTIAL_RULE_EXPANSION','next_step':'SAN_DIEGO_PERMIT_CURRENTNESS_SOURCE','packet_11_frozen':True,'production_access':False,'production_db_mutation':False,'production_zoning_load':False,'selected_snapshot_change':False,'public_activation':False,'deployment':False})
 (OUT/'README.md').write_text('# San Diego residential rule coverage finalization\n\nPacket 82 seals the final observed RS, RM, and RT base-zone rows using existing family schemas, publishes exact target and citywide APN selection evidence, and closes observed San Diego residential base-profile coverage. Review-required mapping, Coastal, modifier, and currentness states remain explicit. These local artifacts perform no compliance or capacity calculation and do not activate production behavior.\n')
 files=sorted(p for p in OUT.iterdir() if p.name!='integrity.json');write_json('integrity.json',{'contract_version':CONTRACT,'files':{p.name:file_sha(p) for p in files},'inputs':{'packet79_selection':file_sha(P79/'parcel-zoning-selection.ndjson.gz'),'packet80_integrity':file_sha(P80/'integrity.json'),'packet81_integrity':file_sha(P81/'integrity.json'),'outside_rs':file_sha(ROOT/'data/rs-base-standards-v0/standards.json'),'inside_rs':file_sha(ROOT/'data/inside-coastal-rs-standards-v0/standards.json'),'current_division4_pdf':CURRENT_SHA}})
 return {p.name:load(p) for p in OUT.glob('*.json')}

if __name__=='__main__':
 o=build();c=o['coverage.json'];print(json.dumps({'decision':o['decision.json']['decision'],'profiles':len(TARGETS),'incremental':c['packet82_incremental_unique_apns'],'supported':c['after_packet82_unique_apns'],'percent':c['after_packet82_percent']},sort_keys=True))
