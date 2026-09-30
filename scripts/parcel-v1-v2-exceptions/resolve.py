#!/usr/bin/env python3
"""Resolve Parcel V1/V2 identity exceptions from local sealed evidence.

The command has no database or network client. It reads local evidence only and
writes one JSON report. It never mutates either parcel corpus.
"""
from __future__ import annotations
import argparse, collections, csv, gzip, hashlib, json, math, re, sys
from pathlib import Path
from typing import Any

APN_RE=re.compile(r'^\d{10}$')
SAFE_ADDRESS_CLASSES={'SUFFIX_STANDARDIZATION','DIRECTIONAL_FORMATTING','PUNCTUATION_OR_SPACING','STREET_NAME_ABBREVIATION','UNIT_DISPLAY_OMISSION_CONFIRMED_BY_CURRENT_COMPONENT'}
SUFFIX={'STREET':'ST','ST':'ST','ROAD':'RD','RD':'RD','AVENUE':'AVE','AVE':'AVE','DRIVE':'DR','DR':'DR','LANE':'LN','LN':'LN','COURT':'CT','CT':'CT','BOULEVARD':'BLVD','BLVD':'BLVD','PLACE':'PL','PL':'PL','TERRACE':'TER','TER':'TER','TRAIL':'TRL','TRL':'TRL','HIGHWAY':'HWY','HWY':'HWY','PARKWAY':'PKWY','PKWY':'PKWY','CIRCLE':'CIR','CIR':'CIR','CR':'CIR','WAY':'WAY','HILL':'HL','HL':'HL','HILLS':'HLS','HLS':'HLS','SQUARE':'SQ','SQ':'SQ','PLAZA':'PLZ','PLZ':'PLZ','COVE':'CV','CV':'CV','CRESCENT':'CRES','CRES':'CRES','VIEW':'VW','VW':'VW','VISTA':'VIS','VIS':'VIS','ROW':'ROW','WALK':'WALK','PASS':'PASS','RUN':'RUN','POINT':'PT','PT':'PT'}
DIRECTION={'NORTH':'N','N':'N','SOUTH':'S','S':'S','EAST':'E','E':'E','WEST':'W','W':'W','NORTHEAST':'NE','NE':'NE','NORTHWEST':'NW','NW':'NW','SOUTHEAST':'SE','SE':'SE','SOUTHWEST':'SW','SW':'SW'}
ABBREVIATION_PAIRS={frozenset(p) for p in [('MOUNT','MT'),('SAINT','ST'),('GREEN','GRN'),('VILLE','VL'),('KNOLLS','KNLS'),('GATE','GT'),('LIGHTS','LGTS'),('BEND','BND'),('MEADOWS','MDWS'),('INLET','INLT'),('CLIFF','CLF'),('BLUFF','BLF'),('RIDGE','RDG'),('FIFTH','5TH'),('TRAIL','TRL'),('RANCH','RNCH'),('GLEN','GLN')]}
UNIT_MARKERS={'UNIT','APT','APARTMENT','STE','SUITE','SPC','SPACE'}

def value(v:Any)->str|None:
 s='' if v is None else str(v).strip();return s or None

def canonical_apn(v:Any)->str|None:
 s=value(v);d=re.sub(r'\D','',s) if s else ''
 return d if APN_RE.fullmatch(d) else None

def sha256(path:Path)->str:
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def tokens(s:Any)->list[str]:return re.findall(r'[A-Z0-9]+(?:-[A-Z0-9]+)?',str(s or '').upper().replace('#',' UNIT '))

def normalize_address(s:Any)->str|None:
 t=value(s)
 if not t:return None
 t=re.sub(r'(?<=[A-Z])\.(?=\s|$)','',t.upper());t=re.sub(r',(?=\s|$)',' ',t)
 return re.sub(r'\s+',' ',t).strip() or None

def parse_address(s:Any)->dict[str,Any]:
 raw=tokens(s);number=raw[0] if raw and re.match(r'^\d',raw[0]) else None;rest=raw[1:] if number else raw[:]
 ui=next((i for i,x in enumerate(rest) if x in UNIT_MARKERS),None)
 main=rest if ui is None else rest[:ui];unit=[] if ui is None else rest[ui+1:]
 pre=DIRECTION.get(main[0]) if main else None
 if pre:main=main[1:]
 post=DIRECTION.get(main[-1]) if main else None
 if post:main=main[:-1]
 suffix=SUFFIX.get(main[-1]) if main else None
 core=main[:-1] if suffix else main
 return {'number':number,'pre':pre,'core':core,'suffix':suffix,'post':post,'unit':unit,'raw':raw}

def normalized_unit(v:Any)->str:
 s=re.sub(r'\W','',str(v or '').upper())
 return str(int(s)) if s.isdigit() else s

def address_difference(v1:Any,v2:Any,v2_suite:Any=None)->str:
 a,b=parse_address(v1),parse_address(v2)
 if a['number']!=b['number']:return 'COMPLETELY_DIFFERENT_SITUS' if a['core']!=b['core'] else 'HOUSE_NUMBER_CHANGE'
 if a['core']!=b['core']:
  dif=[]
  if len(a['core'])==len(b['core']):dif=[(x,y) for x,y in zip(a['core'],b['core']) if x!=y]
  if len(dif)==1 and frozenset(dif[0]) in ABBREVIATION_PAIRS:return 'STREET_NAME_ABBREVIATION'
  return 'STREET_NAME_CHANGE'
 if a['pre']!=b['pre'] or a['post']!=b['post']:return 'DIRECTIONAL_CHANGE'
 if a['suffix']!=b['suffix']:return 'SUFFIX_CHANGE'
 if a['unit']!=b['unit']:
  historical=''.join(a['unit']);current=value(v2_suite)
  if historical and current and normalized_unit(historical)==normalized_unit(current):return 'UNIT_DISPLAY_OMISSION_CONFIRMED_BY_CURRENT_COMPONENT'
  if historical and not current:return 'HISTORICAL_UNIT_ONLY'
  return 'UNIT_COMPONENT_CONFLICT'
 ma=[DIRECTION.get(x,SUFFIX.get(x,x)) for x in a['raw']];mb=[DIRECTION.get(x,SUFFIX.get(x,x)) for x in b['raw']]
 if ma==mb:
  if a['raw']!=b['raw']:
   if any(DIRECTION.get(x,x)!=x for x in a['raw']+b['raw']):return 'DIRECTIONAL_FORMATTING'
   if any(SUFFIX.get(x,x)!=x for x in a['raw']+b['raw']):return 'SUFFIX_STANDARDIZATION'
  return 'PUNCTUATION_OR_SPACING'
 return 'STREET_NAME_NORMALIZATION'

def fallback_address_class(address:Any,current_components:dict[str,Any]|None=None)->str:
 t=tokens(address);number=t[0] if t and t[0].isdigit() else None
 if current_components is not None:
  current=' '.join(str(current_components.get(k) or '') for k in ('situs_pre_dir','situs_street','situs_suffix','situs_post_dir'))
  if t==tokens(current):return 'STREET_ONLY_ALIAS_NOT_PRESENTATION_ADDRESS'
 if number and int(number)>0:return 'ELIGIBLE_HISTORICAL_ADDRESS'
 if number=='0':return 'STREET_ONLY_ALIAS_NOT_PRESENTATION_ADDRESS'
 return 'INVALID_OR_UNPARSEABLE_HISTORICAL_ADDRESS'

def deterministic_sample(rows:list[dict[str,Any]],n:int)->list[dict[str,Any]]:
 by=collections.defaultdict(list)
 for r in rows:by[r['class']].append(r)
 chosen=[];seen=set()
 for k in sorted(by):
  for r in sorted(by[k],key=lambda x:hashlib.sha256(x['apn'].encode()).hexdigest())[:min(3,len(by[k]))]:chosen.append(r);seen.add(r['apn'])
 remaining=sorted((r for r in rows if r['apn'] not in seen),key=lambda x:hashlib.sha256((x['class']+x['apn']).encode()).hexdigest())
 return (chosen+remaining)[:n]

def relationship_record(*,identifier:str,current_apn:str|None,alternate_apn:str|None,address:str|None,relationship:str,reason:str,confidence:str,provenance:str,observed_at:str|None,geometry_status:str)->dict[str,Any]:
 if relationship in {'historical_alias','possible_replacement'} and not alternate_apn:raise ValueError('alternate APN required')
 return {'id':identifier,'currentApn':current_apn,'alternateApn':alternate_apn,'fallbackAddress':address,'relationshipType':relationship,'reason':reason,'confidence':confidence,'provenance':provenance,'observedAt':observed_at,'geometryStatus':geometry_status,'legalRelationshipAsserted':False}

def missing_cause(row:dict[str,Any],siblings:list[str],v2:dict[str,dict[str,Any]])->str:
 c=row['situsComponents'];n=c.get('situs_address');street=value(c.get('situs_street'))
 addressed=[a for a in siblings if a!=row['apnNorm'] and value(v2[a]['row'].get('address'))]
 if n not in (None,0,'0','') and street:return 'COMPONENT_MAPPING_OMISSION'
 if addressed:return 'STACK_SIBLING_HAS_CURRENT_ADDRESS'
 if street:return 'CURRENT_SOURCE_STREET_WITHOUT_NUMBER'
 if len(siblings)>1:return 'STACK_GROUP_ALL_CURRENT_ADDRESSES_MISSING'
 return 'CURRENT_SOURCE_NO_USABLE_SITUS_COMPONENTS'

def main()->None:
 p=argparse.ArgumentParser(description=__doc__)
 for name in ['v1','v1_lineage','v1_addresses','v2','quarantine','packet7','schema','output']:p.add_argument('--'+name.replace('_','-'),type=Path,required=True)
 a=p.parse_args();csv.field_size_limit(sys.maxsize)
 v1={}
 with a.v1.open() as f:
  for line in f:
   r=json.loads(line);v1[r['apn_norm']]=r
 v2={};allv2={};by_pid=collections.defaultdict(list)
 with gzip.open(a.v2,'rt') as f:
  for line in f:
   e=json.loads(line);r=e['row']
   if e['accepted']:
    allv2[r['apnNorm']]=e
    if r['jurisdiction']=='SD':v2[r['apnNorm']]=e;by_pid[str(r['parcelId'])].append(r['apnNorm'])
 with gzip.open(a.quarantine,'rt') as f:q=[json.loads(line) for line in f]
 packet7=json.loads(a.packet7.read_text());shared=set(v1)&set(v2);v1only=set(packet7['sets']['v1OnlyApns']);v2only=set(packet7['sets']['v2OnlyApns'])
 # Addresses and missing-current causes.
 cause_count=collections.Counter();fallback_count=collections.Counter();missing_rows=[];addr_count=collections.Counter();conflicts=[];locality=collections.Counter()
 for apn in sorted(shared):
  l=value(v1[apn].get('address'));r=value(v2[apn]['row'].get('address'))
  locality['SAN_DIEGO' if value(v1[apn].get('city'))=='San Diego' else 'NON_CANONICAL_OR_OUTSIDE_LABEL']+=1
  if l and not r:
   row=v2[apn]['row'];cause=missing_cause(row,by_pid[str(row['parcelId'])],v2);fc=fallback_address_class(l,row['situsComponents']);cause_count[cause]+=1;fallback_count[fc]+=1
   missing_rows.append({'apn':apn,'cause':cause,'fallbackClass':fc,'v1Address':l,'parcelId':row['parcelId'],'currentStreet':value(row['situsComponents'].get('situs_street')),'provenance':'REGRID_CA_SAN_DIEGO_2026_HISTORICAL_PRESENTATION'})
  if l and r and normalize_address(l)!=normalize_address(r):
   cl=address_difference(l,r,v2[apn]['row']['situsComponents'].get('situs_suite'));addr_count[cl]+=1
   item={'apn':apn,'class':cl,'v1Address':l,'v2Address':r}
   if cl not in SAFE_ADDRESS_CLASSES:conflicts.append(item)
 # Quarantine classifications.
 q_by=collections.defaultdict(list)
 for e in q:
  r=e['row'];apn=r.get('apnNorm')
  if r.get('jurisdiction')=='SD' and apn in v1only:q_by[apn].append(e)
 q_count=collections.Counter();q_rows=[]
 for apn,xs in sorted(q_by.items()):
  reasons=sorted({z for e in xs for z in e['reasons']});r=xs[0]['row'];pid=str(r['parcelId']);components=r['situsComponents'];accepted=by_pid.get(pid,[]);usable=bool(value(r.get('address')) or value(components.get('situs_street')))
  if 'DUPLICATE_APN_OR_OBJECTID' in reasons:cl='B_DUPLICATE_SOURCE_CONFLICT'
  elif accepted:cl='C_REPLACEMENT_REPRESENTED_ELSEWHERE'
  elif usable:cl='A_IDENTITY_RECOVERABLE_WITHOUT_GEOMETRY'
  else:cl='D_CANNOT_SAFELY_SERVE'
  q_count[cl]+=1;q_rows.append({'apn':apn,'class':cl,'reasons':reasons,'sourceObjectIds':[e['row']['sourceObjectId'] for e in xs],'parcelId':r['parcelId'],'currentAddress':r.get('address'),'situsComponents':components,'acceptedSameParcelId':accepted,'v1Address':v1[apn].get('address')})
 # Historical lineage and parcel-ID geometry.
 lineage={};old_by_pid=collections.defaultdict(list)
 with a.v1_lineage.open(newline='') as f:
  for z in csv.DictReader(f):
   apn=z['apn_norm'];pid=z['parcelid'];old_by_pid[pid].append(apn)
   if apn in shared or apn in v1only:lineage[apn]=z
 try:
  from shapely import from_wkb
  from pyproj import Transformer
 except ImportError as e:raise SystemExit('full-corpus geometry analysis requires shapely and pyproj') from e
 trans=Transformer.from_crs(2230,4326,always_xy=True)
 def hav(p1:tuple[float,float],p2:tuple[float,float])->float:
  lon1,lat1=p1;lon2,lat2=p2;radius=20902231.0;q1,q2=math.radians(lat1),math.radians(lat2);dp=math.radians(lat2-lat1);dl=math.radians(lon2-lon1);qv=math.sin(dp/2)**2+math.cos(q1)*math.cos(q2)*math.sin(dl/2)**2;return 2*radius*math.asin(math.sqrt(qv))
 pid_count=collections.Counter();pid_rows=[];centroid_rows=[];centroid_strata={k:collections.Counter() for k in ['geometryType','stack','areaBucket','geometryAreaDifference','parcelId','address']}
 for apn in sorted(shared):
  z=lineage[apn];old=str(z['parcelid']);new=str(v2[apn]['row']['parcelId']);geom=None;dist=None;area_diff=None
  if old!=new:
   geom=from_wkb(bytes.fromhex(z['geom']));oldpoint=trans.transform(geom.centroid.x,geom.centroid.y);dist=hav(oldpoint,tuple(v2[apn]['geometry']['centroid']));newarea=v2[apn]['geometry']['approxGeometryAreaSqFt'];area_diff=abs(geom.area-newarea)/abs(geom.area)*100
   old_other=[x for x in by_pid.get(old,[]) if x!=apn];new_old=[x for x in old_by_pid.get(new,[]) if x!=apn]
   if old_other or new_old:cl='POSSIBLE_SPLIT_CONSOLIDATION_PATTERN'
   elif len(old_by_pid[old])>1 or len(by_pid[new])>1:cl='STACK_MEMBERSHIP_CHANGE'
   elif dist<=10 and area_diff<=1:cl='SOURCE_ID_REKEY_GEOMETRY_STABLE'
   elif dist>250 and area_diff>10:cl='SOURCE_ID_REKEY_GEOMETRY_MATERIALLY_CHANGED'
   else:cl='SOURCE_ID_REKEY_GEOMETRY_DIAGNOSTIC_DIFFERENCE'
   pid_count[cl]+=1;pid_rows.append({'apn':apn,'class':cl,'oldParcelId':old,'newParcelId':new,'centroidFeet':round(dist,3),'geometryAreaDifferencePercent':round(area_diff,4),'oldStackSize':len(old_by_pid[old]),'newStackSize':len(by_pid[new]),'oldOtherCurrent':old_other,'newOtherHistorical':new_old})
  # Recompute like-for-like historical/current geometry centroids, independent of live V1 stored lat/lng.
  if geom is None:geom=from_wkb(bytes.fromhex(z['geom']))
  if dist is None:dist=hav(trans.transform(geom.centroid.x,geom.centroid.y),tuple(v2[apn]['geometry']['centroid']))
  if dist>250:
   newarea=v2[apn]['geometry']['approxGeometryAreaSqFt'];area_diff=abs(geom.area-newarea)/abs(geom.area)*100;pd=old!=new;ac=apn in {x['apn'] for x in conflicts};gt=v2[apn]['geometryStats']['type'];stack=len(by_pid[new])>1
   bucket='LT_10000' if newarea<10000 else '10000_TO_100000' if newarea<100000 else '100000_TO_1000000' if newarea<1000000 else 'GE_1000000'
   item={'apn':apn,'centroidFeet':round(dist,3),'geometryType':gt,'stack':stack,'areaSqFt':round(newarea,3),'geometryAreaDifferencePercent':round(area_diff,4),'parcelIdDifferent':pd,'addressMaterialConflict':ac,'v1Address':v1[apn].get('address'),'v2Address':v2[apn]['row'].get('address')};centroid_rows.append(item)
   centroid_strata['geometryType'][gt]+=1;centroid_strata['stack']['REPEATED_STACK' if stack else 'SINGLE']+=1;centroid_strata['areaBucket'][bucket]+=1;centroid_strata['geometryAreaDifference']['GT_10_PERCENT' if area_diff>10 else 'LE_10_PERCENT']+=1;centroid_strata['parcelId']['DIFFERENT' if pd else 'SAME']+=1;centroid_strata['address']['CONSERVATIVE_CONFLICT' if ac else 'NO_CONSERVATIVE_CONFLICT']+=1
 # Presence refinements.
 regrid={}
 with a.v1_addresses.open(newline='') as f:
  for z in csv.DictReader(f):regrid[z['apn_norm']]=z
 baseline_replacements={x['apn'] for x in packet7['v1Only'] if x['category']=='SAME_PARCEL_ID_APN_REPLACEMENT_PATTERN'}
 base97=sorted(v1only-set(q_by)-baseline_replacements);v1_97=collections.Counter();v1_rows=[]
 for apn in base97:
  old=lineage[apn]['parcelid'];same=by_pid.get(old,[])
  if apn in allv2 and allv2[apn]['row']['jurisdiction']!='SD':cl='LIKELY_JURISDICTION_FILTER_DIFFERENCE'
  elif same:cl='POSSIBLE_REPLACEMENT_RELATIONSHIP'
  elif apn in regrid:cl='CURRENT_SOURCE_OMISSION'
  else:cl='LIKELY_HISTORICAL_SOURCE_ARTIFACT'
  v1_97[cl]+=1;v1_rows.append({'apn':apn,'class':cl,'historicalParcelId':old,'currentSameParcelId':same,'v1Address':v1[apn].get('address'),'historicalAddressEvidence':apn in regrid,'currentJurisdiction':allv2.get(apn,{}).get('row',{}).get('jurisdiction')})
 v2_base=[x['apn'] for x in packet7['v2Only'] if x['category']=='CURRENT_SOURCE_ADDITION_OR_HISTORICAL_V1_OMISSION_UNRESOLVED'];v2_87=collections.Counter();v2_rows=[]
 for apn in sorted(v2_base):
  pid=str(v2[apn]['row']['parcelId']);old=old_by_pid.get(pid,[])
  if old:cl='POSSIBLE_REPLACEMENT_RELATIONSHIP'
  elif apn in regrid:cl='LIKELY_HISTORICAL_V1_OMISSION'
  else:cl='LIKELY_CURRENT_SOURCE_ADDITION'
  v2_87[cl]+=1;v2_rows.append({'apn':apn,'class':cl,'parcelId':pid,'historicalSameParcelId':old,'historicalAddressEvidence':apn in regrid,'currentAddress':v2[apn]['row'].get('address')})
 # Full presence tables preserve Packet 7 categories while adding bounded subcategories.
 full_v1=collections.Counter({'QUARANTINE_A_IDENTITY_RECOVERABLE':q_count['A_IDENTITY_RECOVERABLE_WITHOUT_GEOMETRY'],'QUARANTINE_B_DUPLICATE_SOURCE_CONFLICT':q_count['B_DUPLICATE_SOURCE_CONFLICT'],'QUARANTINE_C_REPLACEMENT_REPRESENTED_ELSEWHERE':q_count['C_REPLACEMENT_REPRESENTED_ELSEWHERE'],'QUARANTINE_D_CANNOT_SAFELY_SERVE':q_count['D_CANNOT_SAFELY_SERVE'],'POSSIBLE_REPLACEMENT_RELATIONSHIP':len(baseline_replacements)+v1_97['POSSIBLE_REPLACEMENT_RELATIONSHIP'],'CURRENT_SOURCE_OMISSION':v1_97['CURRENT_SOURCE_OMISSION'],'LIKELY_JURISDICTION_FILTER_DIFFERENCE':v1_97['LIKELY_JURISDICTION_FILTER_DIFFERENCE'],'LIKELY_HISTORICAL_SOURCE_ARTIFACT':v1_97['LIKELY_HISTORICAL_SOURCE_ARTIFACT']})
 full_v2=collections.Counter({'STACKED_OR_REPEATED_PARCEL_ID':packet7['v2OnlyCategories']['STACKED_OR_REPEATED_PARCEL_ID'],**v2_87})
 safe_address=sum(addr_count[c] for c in SAFE_ADDRESS_CLASSES);true_conflicts=len(conflicts)
 impact={'NO_MATERIAL_USER_IMPACT':285983+safe_address,'IMPROVED_IDENTITY':286+sum(full_v2.values()),'SAFELY_RECOVERABLE_BY_BOUNDED_FALLBACK':10175+q_count['A_IDENTITY_RECOVERABLE_WITHOUT_GEOMETRY']+full_v1['POSSIBLE_REPLACEMENT_RELATIONSHIP']+full_v1['CURRENT_SOURCE_OMISSION'],'GENUINE_POTENTIAL_REGRESSION':q_count['D_CANNOT_SAFELY_SERVE']+addr_count['HISTORICAL_UNIT_ONLY'],'UNRESOLVED_NEEDS_REVIEW':true_conflicts-addr_count['HISTORICAL_UNIT_ONLY']+q_count['B_DUPLICATE_SOURCE_CONFLICT']+full_v1['LIKELY_HISTORICAL_SOURCE_ARTIFACT']}
 assert sum(impact.values())==packet7['sets']['v1Distinct']+packet7['sets']['v2Only']==393908
 high=[x for x in centroid_rows if x['geometryAreaDifferencePercent']>10 and (x['parcelIdDifferent'] or x['addressMaterialConflict'])]
 assert len(shared)==393189 and sum(cause_count.values())==10175 and sum(addr_count.values())==96745 and sum(q_count.values())==72 and sum(pid_count.values())==334 and sum(full_v1.values())==175 and sum(full_v2.values())==544 and len(conflicts)==10166 and len(centroid_rows)==2 and len(high)==2
 report={'schemaVersion':1,'decision':'PARCEL_V2_IDENTITY_EXCEPTIONS_NOT_BOUNDED','packet7Baseline':{'v1Distinct':393364,'v2Distinct':393733,'intersection':393189,'v1Only':175,'v2Only':544,'v2MissingAddress':10175,'materialAddressDifference':96745,'parcelIdDifference':334,'liveStoredCentroidOver250Feet':3889},'evidence':{'sources':[{'name':a.v1.name,'sha256':sha256(a.v1),'role':'live V1 presentation export'},{'name':a.v1_lineage.name,'sha256':sha256(a.v1_lineage),'role':'historical V1 parcel lineage and geometry'},{'name':a.v1_addresses.name,'sha256':sha256(a.v1_addresses),'role':'historical Regrid address evidence'},{'name':a.v2.name,'sha256':sha256(a.v2),'role':'sealed accepted V2 source rows'},{'name':a.quarantine.name,'sha256':sha256(a.quarantine),'role':'sealed V2 quarantine rows'},{'name':a.packet7.name,'sha256':sha256(a.packet7),'role':'Packet 7 canonical baseline'}],'boundary':'Local sealed/read-only evidence only; two attempted read-only production centroid aggregate queries timed out and produced no evidence or mutation.'},'quarantine':{'counts':dict(sorted(q_count.items())),'rows':q_rows},'missingAddress':{'causeCounts':dict(sorted(cause_count.items())),'causeSharesPercent':{k:round(v/10175*100,4) for k,v in sorted(cause_count.items())},'v1Provenance':{'REGRID_CA_SAN_DIEGO_2026_HISTORICAL_PRESENTATION':10175},'fallbackCounts':dict(sorted(fallback_count.items())),'eligibleHistoricalFallbackRows':[x for x in missing_rows if x['fallbackClass']=='ELIGIBLE_HISTORICAL_ADDRESS'],'streetOnlyRowsCount':fallback_count['STREET_ONLY_ALIAS_NOT_PRESENTATION_ADDRESS'],'doctrine':'Prefer current V2 address; otherwise retain current SanGIS street as a number-unavailable locator. Use a positive-number V1 address only as explicitly historical Regrid fallback with provenance. Never present a leading-zero historical address as a current situs.'},'addressDifference':{'counts':dict(sorted(addr_count.items())),'localityDiagnostic':dict(sorted(locality.items())),'safeFormattingOrCurrentComponentCount':safe_address,'trueConflictCount':true_conflicts,'trueConflictSample':deterministic_sample(conflicts,50),'sampleMethod':'Three deterministic SHA-ranked examples per conflict class, then SHA-ranked fill to 50.'},'parcelIdDifference':{'counts':dict(sorted(pid_count.items())),'rows':pid_rows},'centroid':{'packet7LiveStoredCoordinateOver250Feet':3889,'likeForLikeHistoricalGeometryCentroidOver250Feet':len(centroid_rows),'interpretation':'The 3,889 Packet 7 live stored-coordinate flags primarily measure a V1 coordinate-method/lineage difference. Recomputing historical V1 and current V2 geometry centroids consistently leaves two parcels over 250 feet.','strata':{k:dict(sorted(v.items())) for k,v in centroid_strata.items()},'combinedHighRiskDefinition':'like-for-like centroid shift >250 ft AND historical/current geometry area difference >10% AND (parcel ID differs OR conservative address conflict)','combinedHighRiskCount':len(high),'combinedHighRiskRows':high},'v1OnlyResolution':{'counts':dict(sorted(full_v1.items())),'packet7Unresolved97Refinement':dict(sorted(v1_97.items())),'rows':v1_rows,'baselineReplacementApns':sorted(baseline_replacements)},'v2OnlyResolution':{'counts':dict(sorted(full_v2.items())),'packet7Unresolved87Refinement':dict(sorted(v2_87.items())),'rows':v2_rows},'exceptionModel':{'schema':a.schema.name,'principles':['Current SanGIS rows remain unchanged.','Historical evidence remains separately provenance-labelled.','No exception record fabricates geometry.','possible_replacement never asserts a legal successor or redirects automatically.','unresolved records never silently redirect.'],'relationshipTypes':['historical_alias','possible_replacement','fallback_presentation','quarantine_identity','unresolved'],'fixtures':[relationship_record(identifier='fallback-address-4237240700',current_apn='4237240700',alternate_apn=None,address='2751 Ocean Front Walk',relationship='fallback_presentation',reason='current_address_unavailable',confidence='high',provenance='REGRID_CA_SAN_DIEGO_2026',observed_at='2026-04-19',geometry_status='current_available'),relationship_record(identifier='quarantine-2748821301',current_apn='2748821301',alternate_apn=None,address=None,relationship='quarantine_identity',reason='invalid_geometry_identity_recoverable',confidence='medium',provenance='SANGIS_2026-09-24',observed_at='2026-09-24',geometry_status='unavailable'),relationship_record(identifier='possible-replacement-4480333200',current_apn='4480332704',alternate_apn='4480333200',address='5151 Long Branch Ave',relationship='possible_replacement',reason='shared_historical_parcel_id',confidence='medium',provenance='V1_LINEAGE_PLUS_SANGIS_2026-09-24',observed_at='2026-09-24',geometry_status='current_available'),relationship_record(identifier='unresolved-7600300100',current_apn='7600300100',alternate_apn=None,address=None,relationship='unresolved',reason='duplicate_current_source_apn',confidence='low',provenance='SANGIS_2026-09-24',observed_at='2026-09-24',geometry_status='conflicting')]},'searchBehavior':{'historicalApnWithSuccessorEvidence':'Show a provenance-labelled possible relationship; do not automatically redirect.','quarantinedValidIdentity':'Allow an identity-only result with geometry unavailable and quarantine reason.','missingCurrentSitus':'Search/display current street with number unavailable; use one of 14 validated historical addresses only with fallback label and provenance.','unresolvedIdentity':'Do not silently redirect or promote.'},'userVisibleImpact':impact,'remainingGenuinePotentialRegressions':{'count':impact['GENUINE_POTENTIAL_REGRESSION'],'components':{'quarantineCannotSafelyServe':q_count['D_CANNOT_SAFELY_SERVE'],'historicalUnitAbsentFromCurrentComponents':addr_count['HISTORICAL_UNIT_ONLY']}},'readiness':'PARCEL_V2_IDENTITY_EXCEPTIONS_NOT_BOUNDED','nextRecommendation':'Base Zoning V2 may proceed in parallel only as isolated current-source work keyed to canonical V2 APNs. Identity-dependent shadow serving or cutover remains blocked by 10,172 unresolved cases and 18 genuine potential regressions.','preservation':{'productionMutation':False,'v2Selected':False,'zoningLoaded':False,'mappingCreated':False,'shadowReadsEnabled':False,'parcelV1Changed':False,'deployed':False,'pushed':False}}
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
 print(json.dumps({'decision':report['decision'],'quarantine':report['quarantine']['counts'],'missing':report['missingAddress']['causeCounts'],'address':report['addressDifference']['counts'],'trueConflicts':true_conflicts,'parcelId':report['parcelIdDifference']['counts'],'centroidHighRisk':len(high),'v1Only':report['v1OnlyResolution']['counts'],'v2Only':report['v2OnlyResolution']['counts'],'impact':impact},indent=2,sort_keys=True))
if __name__=='__main__':main()
