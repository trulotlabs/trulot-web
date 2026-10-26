#!/usr/bin/env python3
import hashlib, importlib.util, json, pathlib, re, tempfile
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parents[1]
def load(n): return json.loads((ROOT/n).read_text())
def main():
 checks=[]
 def ck(n,c):
  if not c: raise AssertionError(n)
  checks.append(n)
 integ=load('artifact-integrity.json')
 for n,v in integ['files'].items(): ck('integrity:'+n,hashlib.sha256((ROOT/n).read_bytes()).hexdigest()==v['sha256'])
 # Packet 65 remains sealed and validates independently.
 p65=REPO/'data/la-mesa-residential-rule-profile-v0'
 p65i=json.loads((p65/'artifact-integrity.json').read_text())
 for n,v in p65i['files'].items(): ck('packet65:'+n,hashlib.sha256((p65/n).read_bytes()).hexdigest()==v['sha256'])
 profiles=load('profiles.json')['profiles']; by={p['profile_id']:p for p in profiles}
 ck('profile-ids',set(by)=={'CA_ADU_2026','LA_MESA_ADU_2026','CA_ADU_2027'})
 ck('2026-active',by['CA_ADU_2026']['status']=='ACTIVE' and by['LA_MESA_ADU_2026']['status']=='ACTIVE')
 ck('2027-inactive',by['CA_ADU_2027']['status']=='INACTIVE_FUTURE' and by['CA_ADU_2027']['effective_from']=='2027-01-01')
 ck('2026-end',by['CA_ADU_2026']['effective_through']=='2026-12-31')
 src=load('source-captures.json')['sources']; sids={s['id'] for s in src}
 ck('source-fingerprints',all(hashlib.sha256(s['excerpt'].encode()).hexdigest()==s['extraction_sha256'] for s in src))
 ck('statutes-current',all(s['url'].startswith('https://leginfo.legislature.ca.gov/') for s in src if s['authority'] in {'OPERATIVE_STATUTE','CHAPTERED_FUTURE_STATUTE'}))
 ck('hcd-guidance-class',next(s for s in src if s['id']=='HCD_ADU_HANDBOOK_2026')['authority']=='AUTHORITATIVE_STATE_GUIDANCE')
 ck('local-sources',{'LM_ADU_WEB_2026','LM_ADU_MATRIX_2026','LM_TITLE24_2026','LM_BUILDING_2026'}<=sids)
 ck('historical-only',next(s for s in src if s['id']=='LM_GUIDE_2023')['authority']=='HISTORICAL_SUPPORT_ONLY')
 p=load('pathways.json'); pathids=p['closed_pathway_ids']; ck('path-count',len(pathids)==7 and len(set(pathids))==7)
 required={'SF_LOCAL_66314_ADU','SF_CONVERSION_66323_ADU','SF_DETACHED_66323_ADU','SF_JADU_66323','MF_CONVERSION_66323_ADU','MF_DETACHED_EXISTING_66323_ADU','MF_DETACHED_PROPOSED_66323_ADU'}
 ck('path-completeness',set(pathids)==required and {x['pathway_id'] for x in p['pathways']}==required)
 art=load('adu-rule-profile.json'); rules=art['rules']; rid={r['rule_id']:r for r in rules}
 ck('schema-core',art['profile_id']=='LA_MESA_ADU_2026' and art['no_parcel_eligibility'] and art['no_capacity_calculation'])
 ck('all-paths-closed',all(set(r['pathway_ids'])<=required for r in rules))
 ck('all-rules-sourced',all(r['source_ids'] and set(r['source_ids'])<=sids and r['statutory_section'] for r in rules))
 ck('no-parcel-conclusions',all(r['parcel_conclusion'] is False for r in rules))
 ck('2026-detached-one',rid['R_UNIT_SF_DETACHED']['value']==1)
 ck('conversion-one',rid['R_UNIT_SF_CONVERSION']['value']==1)
 ck('jadu-one',rid['R_UNIT_JADU']['value']==1)
 ck('mf-eight-cap','min(8' in rid['R_UNIT_MF_EXISTING']['value'])
 ck('mf-proposed-two',rid['R_UNIT_MF_PROPOSED']['value']==2)
 ck('mf-quarter','25%' in rid['R_UNIT_MF_CONV']['value'])
 ck('detached-800',rid['R_SIZE_66323_DET']['value']['sq_ft']==800)
 ck('size-floors',rid['R_SIZE_LOCAL']['value']['one_bedroom_floor_sq_ft']==850 and rid['R_SIZE_LOCAL']['value']['multi_bedroom_floor_sq_ft']==1000)
 ck('conversion-150',rid['R_CONVERSION_EXPANSION']['value']['sq_ft']==150)
 ck('setback-four',rid['R_SETBACK_NEW']['value']['max_feet']==4)
 ck('front-floor','800' in rid['R_SETBACK_FRONT']['value'])
 ck('66323-no-front','no local front setback' in rid['R_SETBACK_66323_FRONT']['value'])
 h=rid['R_HEIGHT_DETACHED']['value']; ck('height-floors',h=={'base_feet':16,'transit_feet':18,'multistory_multifamily_feet':18,'transit_roof_pitch_extra_feet':2})
 ck('attached-height','25 feet' in rid['R_HEIGHT_ATTACHED']['value'])
 ck('coverage-floor',rid['R_COVERAGE_LOCAL']['value']['cannot_preclude_sq_ft']==800)
 ck('66323-coverage-waived',rid['R_COVERAGE_66323']['status']=='WAIVED')
 ck('local-zero-parking',rid['R_PARKING_LOCAL']['value']==0)
 ck('parking-state-exemptions','§66322' in rid['R_PARKING_STATE']['value'])
 ck('replacement-zero',rid['R_REPLACEMENT_PARKING']['value']==0)
 ck('fire-primary-link','primary residence' in rid['R_FIRE_SPRINKLERS']['value'])
 ck('fire-150-unresolved',rid['R_FIRE_150']['status']=='UNRESOLVED')
 ck('adu-owner-prohibited',rid['R_OWNER_ADU']['status']=='PROHIBITED_GENERAL_REQUIREMENT' and rid['R_OWNER_ADU']['value'] is False)
 ck('jadu-owner-versioned','sanitation shared' in rid['R_OWNER_JADU']['value'])
 ck('rental-longer-30','longer than 30 days'==rid['R_RENT_ADU']['value'])
 ck('ministerial',rid['R_MINISTERIAL']['value']=='ministerial; no discretionary hearing')
 ck('60-days',rid['R_TIMING']['value']['days']==60)
 auth=load('authority-matrix.json'); allowed=set(auth['allowed_classes']); ck('authority-vocabulary',allowed=={'STATE_CONTROLS','LOCAL_CONTROLS','STATE_FLOOR_LOCAL_MODIFIER','LOCAL_TEXT_SUPERSEDED','UNRESOLVED'})
 entries=auth['entries']; ck('authority-complete',set(rid)<={e['rule_id'] for e in entries})
 ck('superseded-explicit',{'A_STALE_ADU_OWNER_OCCUPANCY','A_DISCRETIONARY_DESIGN_REVIEW'}<={e['rule_id'] for e in entries if e['classification']=='LOCAL_TEXT_SUPERSEDED'})
 ov=load('overlay-reconciliation.json'); ck('overlay-domain',{x['modifier_id'] for x in ov['overlays']}=={'LM_OVERLAY_H','LM_OVERLAY_P','LM_OVERLAY_F'})
 ck('overlay-not-denial',ov['mapped_overlay_is_automatic_denial'] is False and all(x['required_facts'] for x in ov['overlays']))
 sp=load('specific-plan-reconciliation.json'); ck('plans-three',len(sp['plans'])==3)
 ck('draft-rejected',sp['draft_downtown_update']['included'] is False)
 facts=load('required-property-facts.json'); fids={x['fact_id'] for x in facts['facts']}; ck('facts-required',{'evaluation_date','primary_dwelling_type','overlay_intersections','specific_plan_version','fire_sprinkler_primary_requirement','public_transit_walking_distance','sanitation_shared'}<=fids)
 ck('unknown-dwelling-no-default',facts['unknown_dwelling_type_default'] is None and facts['zoning_never_implies_dwelling_type'])
 comp=load('composition-contract.json'); ck('composition-order',comp['inputs'][2].endswith('specific-plan-registry.json') and comp['state_fallback']=='LOCAL_TEXT_SUPERSEDED_BY_STATE_LAW')
 ck('no-capacity-output','development capacity' in comp['not_outputs'])
 hier=load('evidence-hierarchy.json'); ck('hierarchy-six',[x['rank'] for x in hier['default_priority']]==[1,2,3,4,5,6] and not hier['historical_can_control'])
 d=load('ca-adu-2027-delta.json'); ck('ab956-inactive',d['status']=='INACTIVE_FUTURE' and d['effective_date']=='2027-01-01' and not d['current_profile_mutated'])
 ck('ab956-two',next(x for x in d['changes'] if x['change_id']=='AB956_TWO_DETACHED_SF')['2027_rule'].startswith('two detached'))
 ck('ab956-jadu',any(x['change_id']=='AB956_JADU_COMBINATION' for x in d['changes']))
 c=load('conflicts.json'); ck('conflicts-explicit',len(c['conflicts'])>=7 and not c['automatic_more_permissive_selection'])
 ck('unresolved-fire',any(x['id']=='C_FIRE_150' and x['classification']=='UNRESOLVED' for x in c['conflicts']))
 b=load('benchmarks.json'); ck('nine-benchmarks',len(b['scenarios'])==9 and all(x['final_parcel_eligibility'] is None for x in b['scenarios']))
 ck('future-benchmark',next(x for x in b['scenarios'] if x['id']=='B9')['controlling_source_ids']==['AB956_CH791_2026'])
 t=load('test-cases.json'); ck('conflict-tests',len(t['conflict_tests'])==7)
 ck('negative-tests',len(t['negative_tests'])==8 and {x['expected'] for x in t['negative_tests']}=={'REJECT_FUTURE_EFFECTIVE_RULE','REJECT_HISTORICAL_OVERRIDE','REJECT_MAP_AS_DENIAL','REJECT_ELIGIBILITY_FROM_ZONING','REJECT_GUESSED_DWELLING_TYPE','REJECT_SUPERSEDED_RULE','REJECT_UNADOPTED_PLAN','REJECT_UNSOURCED_RULE'})
 hand=load('packet67-handoff.json'); ck('packet67-bounded',hand['not_performed_here'] and len(hand['inputs'])==6)
 tax=load('product-taxonomy.json'); ck('taxonomy',len(tax['allowed'])==6 and {'Approved','Buildable','Guaranteed'}<=set(tax['prohibited']) and not tax['ui_implemented'])
 dec=load('decision.json'); ck('decision',dec['decision']=='LA_MESA_ADU_2026_RULE_PROFILE_READY' and not dec['future_2027_applied'] and not dec['parcel_eligibility_published'])
 # JSON schema bounded structural validation without third-party dependency.
 sch=load('schema.json'); ck('schema-required',all(k in art for k in sch['required']) and art['profile_id']==sch['properties']['profile_id']['const'] and len(rules)>=sch['properties']['rules']['minItems'])
 # Sensitive material scan.
 secret=re.compile(r'(postgres(?:ql)?://[^\s]+:[^\s]+@|SUPABASE_ACCESS_TOKEN\s*=|eyJ[A-Za-z0-9_-]{20,}\.)')
 for q in ROOT.iterdir():
  if q.is_file(): ck('sensitive:'+q.name,not secret.search(q.read_text(errors='ignore')))
 # Deterministic rebuild.
 spec=importlib.util.spec_from_file_location('p66build',ROOT/'build.py'); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
 with tempfile.TemporaryDirectory() as td:
  mod.build(td)
  exp={q.name:hashlib.sha256(q.read_bytes()).hexdigest() for q in ROOT.iterdir() if q.is_file() and q.name not in {'build.py','validate.py'}}
  got={q.name:hashlib.sha256(q.read_bytes()).hexdigest() for q in pathlib.Path(td).iterdir() if q.is_file()}
  ck('deterministic-rebuild',exp==got)
 print(json.dumps({'status':'PASS','check_count':len(checks),'checks':checks},indent=2))
if __name__=='__main__': main()
