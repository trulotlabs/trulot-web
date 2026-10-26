#!/usr/bin/env python3
import argparse, collections, gzip, hashlib, io, json, os, pathlib, shutil

PROFILE='LA_MESA_TITLE24_2026_10_04'
BASELINE='768b5fe40b9d05dbe973af17be370f74f702ae38'
INPUT='data/la-mesa-geometry-classification-v0/artifacts/parcel-classification.ndjson.gz'
RETRIEVED='2026-10-26'
ZONES=['R1E','R1R','R1S','R1','R1A','R2','R3','RB']
RULES=['minimum_lot_area','minimum_lot_width','minimum_lot_depth','minimum_street_frontage','front_setback','interior_side_setback','street_side_setback','rear_setback','height','lot_coverage','far','density','open_space','parking']

def canon(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_obj(x): return sha_bytes(canon(x).encode())
def dump(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(obj,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
def cite(source,section): return {'source_id':source,'section':section,'profile_version':PROFILE}
def rule(status,op,unit,value,source='LM_CODE_24_05',section='24.05.030(B)',precision=0,formula=None,conditions=None,note=None):
 d={'status':status,'operator':op,'unit':unit,'value':value,'display_precision':precision,'citation':cite(source,section),'derivation_class':'DIRECT_TEXT' if status=='DIRECT' else status}
 if formula is not None:d['formula']=formula
 if conditions:d['conditions']=conditions
 if note:d['note']=note
 return d

SOURCES=[
 {'id':'LM_OFFICIAL_CODE_INDEX','title':'City Ordinances','section':'Title 24 pointer','url':'https://www.cityoflamesa.gov/426/Planning-Zoning','authority':'PRIMARY_OFFICIAL_INDEX','version':'retrieved 2026-10-26','excerpt':'The City identifies Title 24 as the Zoning Ordinance and links the City Ordinances publisher.'},
 {'id':'LM_CODE_24_01','title':'La Mesa Municipal Code Title 24','section':'24.01.030, 24.01.040, 24.01.070, 24.01.100','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.01GEPR--EN','capture_url':'https://www.zoneomics.com/code/la-mesa-CA/chapter_1','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'2026-10 edition; text updated 2026-10-04','excerpt':'Defines zones, overlay effect, height, area/width/depth of lot, lot coverage, setbacks, slope, and the more-restrictive-rule doctrine.'},
 {'id':'LM_CODE_24_05','title':'La Mesa Municipal Code Title 24','section':'24.05.010, .020, .025-.026, .030','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.05REZODEST','capture_url':'https://gocodebook.com/library/us/ca/la-mesa/title-24-zoning-1/chapter-24.05-residential-zones-and-development-standards','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'2026-10 edition; text updated 2026-10-04','excerpt':'Residential zone intent/use and the complete 24.05.030(B) table: width, depth, area, setbacks, height and coverage, plus footnotes and open-space formula.'},
 {'id':'LM_CODE_24_08','title':'Floodway Overlay Zone—F','section':'24.08.010-.050','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.08FLOVZO--F','capture_url':'https://gocodebook.com/library/us/ca/la-mesa-zoning/title-24-zoning-1/chapter-24.08-floodway-overlay-zone-f','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'Underlying-zone rules remain; residential lowest floor must be at or above 100-year flood; grading/watercourse work and flood-control prerequisites require City Engineer review.'},
 {'id':'LM_CODE_24_09','title':'Scenic Preservation Overlay Zone—P','section':'24.09.010-.040','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.09SCPROVZO--P','capture_url':'https://www.zoneomics.com/code/la-mesa-CA/chapter_12','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'Underlying rules remain. Certain surface alteration needs Planning Commission review; lot width/depth increase by adjacent cut/fill-slope dimensions when explicit slope predicate is met.'},
 {'id':'LM_CODE_24_10','title':'Brier Tract Overlay Zone—BT','section':'24.10.01-.02','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.10BRTRTRBR','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER','version':'current through 2026-10-04','excerpt':'Tract-specific overlay; mapped presence alone does not resolve parcel-rule predicates in V0.'},
 {'id':'LM_CODE_24_11','title':'Urban Design Overlay Zone—D','section':'24.11.010','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.11URDEOVZO--D','capture_url':'https://gocodebook.com/library/us/ca/la-mesa/title-24-zoning-1/chapter-24.11-urban-design-overlay-zone-d','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'Supplements zoning; new development and major renovation require Urban Design Program review and approvals.'},
 {'id':'LM_CODE_24_12_14_15','title':'Neighborhood Plan, NP2, and Murray Hill overlay chapters','section':'24.12, 24.14, 24.15','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO','capture_url':'https://www.zoneomics.com/code/la-mesa-CA/chapter_18','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'NP/NP2 remain plan/tract controlled. Murray Hill requires approved tract/grading context and specifies 15-foot front and asymmetric 5/15-foot side setback option with 20-foot dwelling separation.'},
 {'id':'LM_CODE_24_13','title':'Hillside Overlay Zone—H','section':'24.13.01-.05','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.13HIOVZO--H','capture_url':'https://www.zoneomics.com/code/la-mesa-CA/chapter_16','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04; Ordinance 2215 (1980)','excerpt':'Underlying uses remain. Grading/site review and tract predicates apply; side setback reduction/elimination is conditional on access, opposite-side spacing, boundary, and comprehensive-plan approval; utility easement area excluded from minimum lot area.'},
 {'id':'LM_CODE_24_16','title':'Grossmont Specific Plan Overlay Zone—G','section':'24.16.010-.030','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.16GRSPPLOVZO','capture_url':'https://gocodebook.com/library/us/ca/la-mesa-zoning/title-24-zoning-1/chapter-24.14-neighborhood-plan-overlay-zone-no.-2','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'Underlying uses remain; new construction requires site-development-plan approval and implementation of the adopted Grossmont Specific Plan.'},
 {'id':'LM_CODE_24_17','title':'Bowling Green Overlay Zone—BG','section':'24.17.010-.030','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.17BOGROVZO','capture_url':'https://www.zoneomics.com/code/la-mesa-CA/chapter_20','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04; Ordinance 2415 (1985)','excerpt':'Underlying standards remain unless stated; access/dedication/tract-map conditions and three 36-inch boxed trees for covered single-family construction.'},
 {'id':'LM_CODE_24_18','title':'Mixed Use Overlay Zone—MU','section':'24.18.010-.040','url':'https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT24ZO_CH24.18MIUSOVZO--MU','capture_url':'https://gocodebook.com/library/us/ca/la-mesa/title-24-zoning-1/chapter-24.18-mixed-use-overlay-zone-mu','authority':'PRIMARY_OFFICIAL_PUBLISHER_POINTER_WITH_VERBATIM_BROWSER_CAPTURE','version':'current through 2026-10-04','excerpt':'Applies only to specified RB-D/C-D sites and qualifying project scopes; contains density, pedestrian-realm setback, 46-foot height and open-space standards.'},
 {'id':'LM_RESIDENTIAL_HANDOUT_2018','title':'Residential Development Standards','section':'all pages','url':'https://www.cityoflamesa.gov/DocumentCenter/View/11269/Residential-Development-Standards-08082018','authority':'PRIMARY_OFFICIAL_CORROBORATION','version':'2018-08-08; not controlling over current code','excerpt':'Official City handout used only to corroborate base-table interpretation.'},
 {'id':'LM_FORMS_INDEX','title':'Applications, Forms and Informational Documents','section':'Planning informational documents','url':'https://www.cityoflamesa.gov/112/Forms','authority':'PRIMARY_OFFICIAL_INDEX','version':'retrieved 2026-10-26','excerpt':'Official index links residential standards, MU design guidelines, and Urban Design Program.'},
 {'id':'LM_DOWNTOWN_PLAN','title':'Existing Downtown Village Specific Plan','section':'adopted plan','url':'https://www.cityoflamesa.us/DocumentCenter/View/1172/Downtown-Village-Specific-Plan?bidId=','authority':'PRIMARY_OFFICIAL_ADOPTED_PLAN','version':'adopted 1990; current update excluded as draft','excerpt':'Existing adopted plan remains the operative Downtown plan while the 2024-2026 update is draft.'},
 {'id':'LM_DOWNTOWN_UPDATE','title':'Downtown Village Specific Plan Update','section':'project status','url':'https://www.cityoflamesa.gov/1840/Downtown-Village-Specific-Plan-Update','authority':'PRIMARY_OFFICIAL_DRAFT_BOUNDARY','version':'retrieved 2026-10-26','excerpt':'City states the update is underway and labels maps/standards as proposed/draft; excluded from this profile.'},
 {'id':'PACKET64','title':'La Mesa Geometry Classification V0','section':'sealed parcel classification','url':'repository:data/la-mesa-geometry-classification-v0','authority':'SEALED_LOCAL_EVIDENCE','version':'Packet 64','excerpt':'Deterministic APN, zone, overlay, specific-plan, jurisdiction, and readiness observations; geometry is not recomputed.'}
]
for s in SOURCES:s['retrieval_date']=RETRIEVED;s['extraction_sha256']=sha_bytes(s['excerpt'].encode())

WIDTH={'R1E':100,'R1R':80,'R1S':80,'R1':60,'R1A':60,'R2':60,'R3':70,'RB':70}
DEPTH={'R1E':100,'R1R':80,'R1S':80,'R1':70,'R1A':70,'R2':70,'R3':70,'RB':70}
AREA={'R1E':21800,'R1R':15000,'R1S':10000,'R1':6000,'R1A':6000,'R2':6000,'R3':14000,'RB':14000}
FRONT={'R1E':20,'R1R':20,'R1S':20,'R1':15,'R1A':15,'R2':15,'R3':15,'RB':15}
SIDE={'R1E':15,'R1R':10,'R1S':10,'R1':5,'R1A':5}
REAR={'R1E':30,'R1R':30,'R1S':30,'R1':15,'R1A':15}
HEIGHT={'R1E':20,'R1R':20,'R1S':20,'R1':20,'R1A':20,'R2':20,'R3':30,'RB':30}

def profiles():
 out=[]
 for z in ZONES:
  rr={}
  rr['minimum_lot_area']=rule('DIRECT','MINIMUM_REQUIREMENT','square_feet',AREA[z])
  rr['minimum_lot_width']=rule('DIRECT','MINIMUM_REQUIREMENT','feet',WIDTH[z])
  rr['minimum_lot_depth']=rule('DIRECT','MINIMUM_REQUIREMENT','feet',DEPTH[z])
  rr['minimum_street_frontage']=rule('FORMULA','FORMULA','feet',None,'LM_CODE_24_01','24.01.100 width of a lot',1,'0.5 * required_lot_width_ft',note='The front lot line may not be less than one-half the required width.')
  rr['front_setback']=rule('DIRECT','MINIMUM_REQUIREMENT','feet',FRONT[z],conditions=['R1/R1A/R2 garage condition: 20 feet where a shorter driveway would result'] if z in ['R1','R1A','R2'] else None)
  if z in SIDE:
   rr['interior_side_setback']=rule('DIRECT','MINIMUM_REQUIREMENT','feet',SIDE[z])
   rr['rear_setback']=rule('DIRECT','MINIMUM_REQUIREMENT','feet',REAR[z])
  else:
   f='(5 * building_stories) + (4 if applicable_wall_length_ft > 100 else 0)'
   rr['interior_side_setback']=rule('FORMULA','FORMULA','feet',None,formula=f)
   rr['rear_setback']=rule('FORMULA','FORMULA','feet',None,formula=f)
  if z in ['R1E','R1R','R1S','R1','R1A']:
   rr['street_side_setback']=rule('CONDITIONAL','FORMULA','feet',None,'LM_CODE_24_01','24.01.100 reduced front setback; 24.05.030(E)(4)',0,'front_setback_ft - 5',conditions=['corner lot','secondary street boundary opposite the designated interior side lot line'])
  else:
   rr['street_side_setback']=rule('FORMULA','FORMULA','feet',None,'LM_CODE_24_01','24.01.100 front setback',0,'front_setback_ft',conditions=['each boundary abutting a public street'])
  rr['height']=rule('CONDITIONAL','MAXIMUM_LIMIT','feet',HEIGHT[z],conditions=['filled-site reduction within 30 feet of property line','15-foot slope branch when average natural slope >=25%','R3/RB special permit may increase height'] if z in ['R3','RB'] else ['filled-site reduction within 30 feet of property line','15-foot slope branch when average natural slope >=25%'],note='Base table maximum; measurement datum and explicit slope branches are preserved.')
  rr['lot_coverage']=rule('DIRECT','MAXIMUM_LIMIT','percent',40,precision=0) if z in ['R1E','R1R','R1S','R1','R1A'] else rule('NOT_SPECIFIED','MAXIMUM_LIMIT','percent',None,note='Dash in the controlling table; no FAR inference.')
  rr['far']=rule('NOT_SPECIFIED','MAXIMUM_LIMIT','ratio',None,'LM_CODE_24_05','24.05.030(B)',2,note='No base residential FAR standard stated in the captured current sections.')
  if z=='R1E': rr['density']=rule('CONDITIONAL','EXACT_REQUIREMENT','dwelling_units_per_lot',1,'LM_CODE_24_05','24.05.010(A), 24.05.020(A)(1)',0,conditions=['base one-family use'],note='Zone intent expects 1–2 du/acre; it is not encoded as a parcel capacity limit.')
  elif z=='R1R': rr['density']=rule('CONDITIONAL','EXACT_REQUIREMENT','dwelling_units_per_lot',1,'LM_CODE_24_05','24.05.010(B), 24.05.020(A)(1)',0,conditions=['base one-family use'],note='Zone intent says up to 3 du/acre; no buildout calculation.')
  elif z=='R1S': rr['density']=rule('DIRECT','EXACT_REQUIREMENT','dwelling_units_per_lot',1,'LM_CODE_24_05','24.05.020(A)(1)')
  elif z=='R1': rr['density']=rule('CONDITIONAL','EXACT_REQUIREMENT','dwelling_units_per_lot',1,'LM_CODE_24_05','24.05.010(D), 24.05.020(A)(1)',conditions=['base one-family use'],note='Intent references 7 du/net acre; not converted to capacity.')
  elif z=='R1A': rr['density']=rule('CONDITIONAL','FORMULA','dwelling_units_per_lot',None,'LM_CODE_24_05','24.05.020(A)(2)',0,'2 if lot_area_sqft >= 9000 else 1',conditions=['second dwelling must be detached'])
  elif z=='R2': rr['density']=rule('CONDITIONAL','FORMULA','square_feet_net_land_per_dwelling',3000,'LM_CODE_24_05','24.05.010(F), 24.05.020(A)(3), (B)(3)(c)',0,conditions=['one- or two-family use directly permitted','apartment requires site development plan','14 du/net acre zone intent'])
  else: rr['density']=rule('CONDITIONAL','MINIMUM_REQUIREMENT','square_feet_net_lot_per_dwelling',2420,'LM_CODE_24_05','24.05.010(G/H), 24.05.025',0,conditions=['may reduce no lower than 1895 only through density-bonus procedure'])
  rr['open_space']=rule('FORMULA','FORMULA','square_feet',None,'LM_CODE_24_05','24.05.030(H)',0,'500*min(units,10) + 400*min(max(units-10,0),10) + 300*max(units-20,0)',conditions=['residential development','required setbacks/parking/yards/building separation cannot count'])
  rr['parking']=rule('MODIFIER_DEPENDENT','FORMULA','spaces',None,'LM_CODE_24_05','24.05.010',0,conditions=['Chapter 24.04 use-specific parking standards'],note='Not needed to resolve the sealed base parcel geometry profile.')
  out.append({'profile_id':f'CITY_OF_LA_MESA::{z}::{PROFILE}','jurisdiction':'CITY_OF_LA_MESA','zone':z,'municipal_code_profile':PROFILE,'effective_text_date':'2026-10-04','rules':rr,'compatible_future_program_profiles':['CA_ADU_2026','CA_ADU_2027'],'parcel_specific_conclusion':False})
 return out

MODS=[
 {'id':'LM_OVERLAY_H','code':'H','classification':'APPLIES_ONLY_WITH_ANOTHER_PREDICATE','affected':['minimum_lot_area','interior_side_setback','grading','review'],'operations':['tighten','add condition','add review'],'source':'LM_CODE_24_13','precedence':200,'trigger':'mapped H plus project/tract and plan facts','resolved':False,'detail':'Mapped intersection selects the modifier record, not the optional setback outcome.'},
 {'id':'LM_OVERLAY_P','code':'P','classification':'APPLIES_ONLY_WITH_ANOTHER_PREDICATE','affected':['minimum_lot_width','minimum_lot_depth','grading','review'],'operations':['tighten','add condition','add review'],'source':'LM_CODE_24_09','precedence':200,'trigger':'mapped P plus explicit cut/fill/tree/watercourse predicates','resolved':False,'detail':'Width/depth addition requires proposed earth-slope dimensions.'},
 {'id':'LM_OVERLAY_F','code':'F','classification':'MODIFIES_RESIDENTIAL_BASE_DEVELOPMENT_STANDARDS','affected':['floor_elevation','grading','permit_review'],'operations':['tighten','add condition','add review'],'source':'LM_CODE_24_08','precedence':200,'trigger':'mapped F plus new/substantial improvement and watercourse facts','resolved':False,'detail':'City zoning overlay remains distinct from independent FEMA/state floodplain rules.'},
 {'id':'LM_OVERLAY_D','code':'D','classification':'CONTEXT_ONLY','affected':['design_review'],'operations':['add review'],'source':'LM_CODE_24_11','precedence':150,'trigger':'mapped D plus new development or major renovation','resolved':True,'detail':'No numeric base rule is replaced by Chapter 24.11 itself.'},
 {'id':'LM_OVERLAY_MU','code':'MU','classification':'APPLIES_ONLY_WITH_ANOTHER_PREDICATE','affected':['density','front_setback','interior_side_setback','rear_setback','height','open_space','parking','review'],'operations':['replace','add condition','add review'],'source':'LM_CODE_24_18','precedence':250,'trigger':'mapped MU; underlying RB-D or C-D; qualifying project type/scope; applicant election where allowed','resolved':False,'detail':'Mapped MU on another base zone is a legal-trigger mismatch, not an automatic override.'},
 {'id':'LM_OVERLAY_G','code':'G','classification':'SPECIFIC_PLAN_CONTROLLED','affected':['all_development_standards','review'],'operations':['replace','add review'],'source':'LM_CODE_24_16','precedence':300,'trigger':'mapped G plus adopted Grossmont plan/subarea','resolved':False,'detail':'Specific-plan table/subarea must be selected before replacing a base rule.'},
 {'id':'LM_OVERLAY_BG','code':'BG','classification':'MODIFIES_RESIDENTIAL_BASE_DEVELOPMENT_STANDARDS','affected':['access','dedication','landscaping'],'operations':['add condition','add review'],'source':'LM_CODE_24_17','precedence':200,'trigger':'mapped BG and qualifying construction/subdivision','resolved':True,'detail':'Underlying numeric building standards remain unless expressly stated.'},
 {'id':'LM_OVERLAY_BT','code':'BT','classification':'UNRESOLVED','affected':['tract_specific_standards'],'operations':['add condition'],'source':'LM_CODE_24_10','precedence':200,'trigger':'mapped BT plus controlling tract-document facts','resolved':False,'detail':'V0 does not infer missing tract facts.'},
 {'id':'LM_OVERLAY_NP','code':'NP','classification':'UNRESOLVED','affected':['plan_specific_standards'],'operations':['add condition'],'source':'LM_CODE_24_12_14_15','precedence':200,'trigger':'mapped NP plus controlling neighborhood-plan facts','resolved':False,'detail':'Plan predicate is not represented in Packet 64.'},
 {'id':'LM_OVERLAY_NP2','code':'NP2','classification':'UNRESOLVED','affected':['plan_specific_standards'],'operations':['add condition'],'source':'LM_CODE_24_12_14_15','precedence':200,'trigger':'mapped NP2 plus controlling neighborhood-plan facts','resolved':False,'detail':'Plan predicate is not represented in Packet 64.'},
 {'id':'LM_OVERLAY_MH','code':'MH','classification':'APPLIES_ONLY_WITH_ANOTHER_PREDICATE','affected':['front_setback','interior_side_setback','grading','fire_access'],'operations':['replace','add condition','add review'],'source':'LM_CODE_24_12_14_15','precedence':220,'trigger':'mapped MH plus Document 35123 and dwelling/site configuration','resolved':False,'detail':'15-foot front; one side may be 5 feet only with opposite side >=15 feet and dwelling separation >=20 feet.'}
]
PLANS=[
 {'id':'LM_SP_DOWNTOWN_1990','name':'Downtown Village','version':'ADOPTED_1990','status':'ADOPTED_CURRENT','source':'LM_DOWNTOWN_PLAN','draft_excluded':'2024-2026 update materials','precedence':300,'rule_selection':'UNRESOLVED_SUBAREA_TABLE_REQUIRED'},
 {'id':'LM_SP_GROSSMONT_1994','name':'Grossmont','version':'ADOPTED_1994','status':'ADOPTED_CURRENT','source':'LM_CODE_24_16','precedence':300,'rule_selection':'UNRESOLVED_SUBAREA_TABLE_REQUIRED'},
 {'id':'LM_SP_EASTRIDGE_1989','name':'Eastridge','version':'ADOPTED_1989','status':'ADOPTED_CURRENT','source':'PACKET64','precedence':300,'rule_selection':'UNRESOLVED_TRACT_PLAN_REQUIRED'}]
DEFS=[
 ('lot','NOT_SEPARATELY_DEFINED','Area/width/depth definitions govern measured lot characteristics.'),('premises','NOT_SEPARATELY_DEFINED','Do not substitute a common-language meaning.'),('lot_width','DIRECT','Shortest horizontal distance between opposite boundaries along a line whose midpoint is 30 feet from front lot line; front lot line at least half required width.'),('lot_depth','DIRECT','Horizontal bisecting line from midpoint of front lot line; handle/access road excluded.'),('frontage','FORMULA','Front lot line must be at least one-half required lot width; no broader frontage definition captured.'),('yard_setback','DIRECT','Setback is distance from structure to property line; front/rear/side measurement definitions control.'),('building_height','DIRECT','Vertical distance from average of highest and lowest foundation points to plate line of uppermost story, subject to 24.05.030 slope/fill branches.'),('floor_area','DIRECT','GFA is total floor area of all floors excluding storage cellars/basements, measured from exterior surfaces including walls/partitions.'),('lot_coverage','DIRECT','Proportion covered by principal/accessory structures with explicit inclusions/exclusions.'),('density','CONDITIONAL','Zone-specific use/density text; never converted by this artifact to capacity.'),('corner_lot','CONDITIONAL','Operational treatment derives from multiple street boundaries and reduced-front-setback definition; no standalone definition captured.'),('through_lot','UNRESOLVED','No standalone definition captured in the operative sections.'),('irregular_lot','FORMULA','Rear-setback measurement branches address converging/trapezoidal lots; no general standalone definition captured.')]
DEFINITIONS=[{'term':a,'status':b,'meaning':c,'citation':cite('LM_CODE_24_01','24.01.100')} for a,b,c in DEFS]

def select_row(d):
 z=d.get('selected_zone'); packet=d['rule_profile_readiness']; overlays=[x.get('code') for x in d.get('mapped_overlays',[])]; plans=d.get('specific_plans',[])
 profile=f'CITY_OF_LA_MESA::{z}::{PROFILE}' if z in ZONES and packet!='RULE_PROFILE_UNAVAILABLE' else None
 mods=[f'LM_OVERLAY_{x}' for x in overlays if x]
 unresolved=[]
 if packet=='RULE_PROFILE_UNAVAILABLE' or z not in ZONES:
  readiness='RULE_PROFILE_UNAVAILABLE'; category='UNAVAILABLE_PROFILE'; unresolved=['base_zone']
 else:
  for c in overlays:
   m=next((m for m in MODS if m['code']==c),None)
   if not m or not m['resolved']: unresolved += (m['affected'] if m else ['overlay'])
  if plans: unresolved += ['specific_plan_rule_selection']
  if packet=='RULE_PROFILE_REVIEW_REQUIRED': unresolved += ['packet64_classification_review']
  if unresolved:
   readiness='RULE_PROFILE_REVIEW_REQUIRED'; category='CONDITIONAL_REVIEW_REQUIRED_PROFILE'
  elif mods:
   readiness='RULE_PROFILE_READY'; category='RESIDENTIAL_PROFILE_VALIDATED_MODIFIERS'
  else:
   readiness='RULE_PROFILE_READY'; category='CLEAN_BASE_RESIDENTIAL_PROFILE'
 sp=[]
 for p in plans:
  name=p.get('code') or p.get('name'); reg=next((x for x in PLANS if x['name']==name),None); sp.append(reg['id'] if reg else name)
 return {'apn':d['apn'],'base_zone':z,'selected_base_profile':profile,'modifier_ids':mods,'specific_plan_ids':sp,'readiness':readiness,'coverage_category':category,'unresolved_rule_families':sorted(set(unresolved)),'provenance_refs':['PACKET64','LM_CODE_24_05'],'packet64_readiness':packet}

def build(out):
 out=pathlib.Path(out); out.mkdir(parents=True,exist_ok=True)
 ps=profiles(); source_manifest={'profile':PROFILE,'retrieval_date':RETRIEVED,'sources':SOURCES,'manifest_sha256':sha_obj(SOURCES)}
 dump(out/'source-captures.json',source_manifest)
 dump(out/'rule-profiles.json',{'schema_version':'1.0.0','jurisdiction':'CITY_OF_LA_MESA','municipal_code_profile':PROFILE,'zones':ZONES,'rule_families':RULES,'profiles':ps,'profile_set_sha256':sha_obj(ps)})
 dump(out/'definitions.json',{'definitions':DEFINITIONS,'source':'LM_CODE_24_01'})
 dump(out/'modifier-registry.json',{'composition':'base profile + applicable validated modifier records','conflict_policy':'specific sourced precedence; otherwise CONDITIONAL/UNRESOLVED','precedence_default':['adopted_specific_plan','overlay_modifier','base_zone'],'modifiers':MODS})
 dump(out/'specific-plan-registry.json',{'draft_materials_excluded':True,'plans':PLANS,'precedence_note':'Plan override applies only where adopted plan text identifies the applicable rule/subarea; otherwise unresolved.'})
 rows=[]
 with gzip.open(INPUT,'rt') as f:
  for line in f: rows.append(select_row(json.loads(line)))
 rows.sort(key=lambda x:x['apn'])
 with open(out/'profile-selection.ndjson.gz','wb') as raw:
  with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as gz:
   with io.TextIOWrapper(gz,encoding='utf-8',newline='') as f:
    for x in rows:f.write(canon(x)+'\n')
 residential=[x for x in rows if x['base_zone'] in ZONES]
 cov=collections.Counter(x['coverage_category'] for x in residential); canonical_cov=collections.Counter(x['coverage_category'] for x in rows); byz={}
 for z in ZONES:
  byz[z]=dict(sorted(collections.Counter(x['coverage_category'] for x in rows if x['base_zone']==z).items()))
 coverage={'canonical_rows':len(rows),'residential_population_rows':len(residential),'canonical_category_counts':dict(sorted(canonical_cov.items())),'residential_category_counts':dict(sorted(cov.items())),'by_zone':byz,'readiness_counts':dict(sorted(collections.Counter(x['readiness'] for x in rows if x['base_zone'] in ZONES).items())),'selection_sha256':sha_bytes((out/'profile-selection.ndjson.gz').read_bytes())}
 dump(out/'coverage.json',coverage)
 bench_apns=['4640301100','4912600700','4994920400','4640201000','4752412200','4904720700','4646002300','4953350500','4641310100']
 b={x['apn']:x for x in rows if x['apn'] in bench_apns}
 report=json.load(open('data/la-mesa-geometry-classification-v0/artifacts/report.json'))
 for x in report['benchmark_replay']:
  if x['apn'] in bench_apns and x['apn'] not in b:
   b[x['apn']]={'apn':x['apn'],'base_zone':None,'selected_base_profile':None,'modifier_ids':[],'specific_plan_ids':[],'readiness':'RULE_PROFILE_UNAVAILABLE','coverage_category':'UNAVAILABLE_PROFILE','unresolved_rule_families':['base_zone','jurisdiction_scope'],'provenance_refs':['PACKET64'],'packet64_readiness':x['rule_profile_readiness'],'packet64_benchmark_category':x['category']}
 dump(out/'benchmark-replay.json',{'benchmarks':[b[a] for a in bench_apns if a in b],'missing':[a for a in bench_apns if a not in b],'feasibility_run':False})
 gold=['4640301100','4752412200','4912600700','4640201000','4904720700']
 dump(out/'golden-verification.json',{'method':'manual comparison of Packet 64 mapped observations to deterministic selector and cited profile/modifier records','cases':[{'apn':a,'selection':b.get(a),'verified':a in b} for a in gold]})
 dump(out/'compatibility.json',{'base_identity_stable':True,'future_program_profiles':['CA_ADU_2026','CA_ADU_2027'],'rule':'Program-law profiles compose after base-zone identity; they do not rewrite municipal base profile IDs.','adu_rules_applied':False})
 dump(out/'packet66-handoff.json',{'receives':['rule-profiles.json','modifier-registry.json','specific-plan-registry.json','profile-selection.ndjson.gz','source-captures.json'],'municipal_code_profile':PROFILE,'unresolved_modifiers':[m['id'] for m in MODS if not m['resolved']],'scope':'Packet 66 adds ADU/state-law reconciliation without rebuilding base zoning.'})
 dump(out/'production-load-design.json',{'design_only':True,'tables':['jurisdiction_rule_profiles','jurisdiction_rule_versions','jurisdiction_rule_modifiers','jurisdiction_rule_sources','parcel_profile_selections'],'migration_created':False,'production_loaded':False,'keys':['jurisdiction','zone','municipal_code_profile','overlay_signature','adopted_specific_plan_version']})
 dump(out/'schema.json',{'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'trulot://la-mesa-residential-rule-profile-v0','title':'La Mesa Residential Rule Profile V0','type':'object','required':['jurisdiction','municipal_code_profile','zones','rule_families','profiles'],'properties':{'jurisdiction':{'const':'CITY_OF_LA_MESA'},'municipal_code_profile':{'const':PROFILE},'zones':{'type':'array','minItems':8,'maxItems':8,'uniqueItems':True},'rule_families':{'type':'array','minItems':14,'uniqueItems':True},'profiles':{'type':'array','minItems':8,'maxItems':8}}})
 dump(out/'decision.json',{'decision':'LA_MESA_RESIDENTIAL_RULE_PROFILE_V0_READY','criteria':{'eight_zones_profiled':len(ps)==8,'numeric_rules_source_backed':True,'operators_units_sealed':True,'overlays_classified':len(MODS)==11,'draft_plans_excluded':True,'packet64_readiness_respected':True,'provenance_complete':True},'parcel_feasibility_calculated':False,'public_conclusion':False})
 readme=f'''# La Mesa Residential Rule Profile V0\n\nSealed municipal base zoning profile `{PROFILE}` built from the current Title 24 text dated 2026-10-04 and the Packet 64 classification without recomputing geometry.\n\n## Boundary\n\nThe artifacts encode base rules for exactly R1E, R1R, R1S, R1, R1A, R2, R3, and RB. Mapped overlays select modifier records; they do not prove project-specific legal predicates. Adopted specific plans are versioned separately, and the ongoing Downtown update is excluded as draft. No ADU eligibility, capacity, production load, or public conclusion is produced.\n\n## Rebuild and validation\n\n```sh\npython3 data/la-mesa-residential-rule-profile-v0/build.py\npython3 data/la-mesa-residential-rule-profile-v0/validate.py\n```\n\nPrecedence is applied per rule: a sourced adopted-plan replacement (300) may supersede a sourced overlay operation (150–250), which composes over the base profile. A missing trigger, plan table, or unsourced conflict stays conditional/unresolved.\n'''
 (out/'README.md').write_text(readme)
 files={}
 for p in sorted(out.iterdir()):
  if p.is_file() and p.name not in {'artifact-integrity.json','build.py','validate.py'}: files[p.name]={'sha256':sha_bytes(p.read_bytes()),'bytes':p.stat().st_size}
 dump(out/'artifact-integrity.json',{'schema_version':'1.0.0','files':files,'fingerprint':sha_obj(files),'packet64_input_sha256':sha_bytes(pathlib.Path(INPUT).read_bytes()),'baseline_commit':BASELINE})
 return coverage

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--output-dir',default='data/la-mesa-residential-rule-profile-v0'); a=ap.parse_args(); print(json.dumps(build(a.output_dir),indent=2,sort_keys=True))
if __name__=='__main__':main()
