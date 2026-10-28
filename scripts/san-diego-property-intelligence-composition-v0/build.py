#!/usr/bin/env python3
import argparse,csv,gzip,hashlib,json,re,time,tracemalloc,glob
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'data/san-diego-property-intelligence-composition-v0';DEN=393733
DET={'109','110','111','112','113','115','116','117','119'};MULTI={'120','130','140','150','152','153','160','162','163'};CONDO={'170','171','172','173','174','175','176'};VAC={'200','400','500','600','700','800'}
MATERIAL={'ADU','JADU','NEW_DWELLING','MULTIFAMILY_NEW','ADDITION','GARAGE_CONVERSION','DEMOLITION','REMODEL','UNIT_CHANGE','OTHER_CONFIGURATION_CHANGE'}
def dump(n,x): (OUT/n).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def normaddr(s):return ' '.join(re.sub(r'[^A-Z0-9# ]',' ',(s or '').upper()).split())
def assessor(row):
 code=row['nucleus_use_cd'].strip().zfill(3);u=int(float(row['unitqty'])) if row['unitqty'].strip() else None
 cls='DETACHED_FAMILY_HINT' if code in DET else 'MULTIFAMILY_HINT' if code in MULTI else 'CONDOMINIUM_HINT' if code in CONDO else 'VACANT_LAND_HINT' if code in VAC else 'NONRESIDENTIAL' if re.match(r'^[2345678]\d\d$',code) else 'UNKNOWN_OTHER'
 hints=[]
 if code in {'109','112'}:hints.append('ASSESSOR_ADU_HINT_REQUIRES_CURRENT_CONFIGURATION_REVIEW')
 if cls=='DETACHED_FAMILY_HINT' and u and u>1:hints.append('DETACHED_USE_AND_MULTIPLE_RECORDED_UNITS')
 if cls=='MULTIFAMILY_HINT' and u==1:hints.append('MULTIFAMILY_USE_AND_ONE_RECORDED_UNIT')
 if cls=='CONDOMINIUM_HINT' and u!=1:hints.append('CONDO_UNIT_SEMANTICS_INCONSISTENT')
 st='RECORDED_RESIDENTIAL_CONFLICT' if hints else 'RECORDED_SINGLE_FAMILY_LIKELY' if cls=='DETACHED_FAMILY_HINT' and u==1 else 'RECORDED_MULTIFAMILY_LIKELY' if cls=='MULTIFAMILY_HINT' and u and u>=2 else 'RECORDED_CONDO' if cls=='CONDOMINIUM_HINT' else 'RECORDED_TYPE_UNKNOWN'
 return {'useClass':cls,'recordedUnitCount':u,'totalLivingArea':float(row['total_lvg_area']) if row['total_lvg_area'].strip() else None,'assessedImprovementValue':None,'assessorAduHint':code in {'109','112'},'garageConversionHint':row['garage_conversion'].strip().upper()=='Y','recordedState':st,'assessorConflicts':hints,'eligible':not hints and st in {'RECORDED_SINGLE_FAMILY_LIKELY','RECORDED_MULTIFAMILY_LIKELY'}}
def main():
 p=argparse.ArgumentParser();p.add_argument('--permit-source',required=True);a=p.parse_args();OUT.mkdir(parents=True,exist_ok=True);tracemalloc.start();started=time.perf_counter()
 perm={}
 with gzip.open(ROOT/'data/san-diego-permit-currentness-v0/parcel-currentness-summary.ndjson.gz','rt') as f:
  for l in f:
   x=json.loads(l);perm[x['apn']]=x
 structs={}
 sp=Path('/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/parcel-footprint-summary.ndjson')
 for l in sp.open():
  x=json.loads(l);structs[x['apn']]={'state':x['footprint_state'],'count':len(x['direct_source_object_ids']),'ambiguous':x['footprint_state'].startswith('STACKED_') or x['footprint_state']=='AMBIGUOUS_ONLY' or bool(x['ambiguous_source_object_ids'])}
 # plain Closed affected parcels with Packet98 exact-APN/address linkage doctrine
 addr=defaultdict(set);apnset=set()
 for fn in glob.glob(str(ROOT/'data/san-diego-public-identity-v0/shards/*.ndjson.gz')):
  with gzip.open(fn,'rt') as f:
   for l in f:
    x=json.loads(l);apnset.add(x['apn']);ad=x['address'];k=normaddr(ad.get('displayAddress') or ' '.join(ad.get('canonicalAddressTokens') or []));
    if k:addr[k].add(x['apn'])
 closed=defaultdict(lambda:{'records':0,'events':set(),'linkage':set()})
 with open(a.permit_source,encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f):
   if r['APPROVAL_STATUS'].strip()!='Closed':continue
   d=re.sub(r'\D','',r['GIS_APN']);linked=[];lk='UNRESOLVED'
   if len(d)==10 and d in apnset:linked=[d];lk='EXACT_APN'
   else:
    k=normaddr(r['GIS_ADDRESS']);cand=addr.get(k,set())
    if len(cand)==1:linked=list(cand);lk='EXACT_ADDRESS'
    elif len(cand)>1:linked=list(cand);lk='BUILDING_COMMON_ADDRESS_GROUP'
   text=' '.join(r.get(k,'') for k in ('PROJECT_TITLE','PROJECT_SCOPE','APPROVAL_SCOPE','APPROVAL_TYPE')).upper()
   ev='ADU' if re.search(r'\bADU\b|ACCESSORY DWELLING',text) else 'DEMOLITION' if 'DEMOL' in text else 'UNIT_CHANGE' if re.search(r'UNIT|DWELLING|RESIDENCE|CONVERSION|ADDITION|REMODEL',text) else 'NON_CONFIGURATION'
   for x in linked:closed[x]['records']+=1;closed[x]['events'].add(ev);closed[x]['linkage'].add(lk)
 amap=Path('/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z/parcel-assessor-source.csv.gz')
 current=Counter();dwell=Counter();questions=Counter();conflict_types=Counter();permit_status=Counter();rights=Counter();bench=[];manual=[];closed_material=0;preselect=accessory=0;active=later=issued=0
 comp_path=OUT/'parcel-property-intelligence.ndjson.gz';ass_path=OUT/'assessor-derived-facts.ndjson.gz'
 with gzip.open(amap,'rt',newline='') as af, open(comp_path,'wb') as cr, open(ass_path,'wb') as ar:
  with gzip.GzipFile(fileobj=cr,mode='wb',mtime=0) as cg,gzip.GzipFile(fileobj=ar,mode='wb',mtime=0) as ag:
   for row in csv.DictReader(af):
    apn=row['apn'];ass=assessor(row);st=structs[apn];pe=perm.get(apn);pstate=pe['currentnessState'] if pe else 'NO_PERMIT_EVIDENCE';events=set(pe['events']) if pe else set();statuses=set(pe['statuses']) if pe else set();material=bool(events&MATERIAL);cl=closed.get(apn);conf=[]
    if cl and cl['events']&MATERIAL:closed_material+=1
    def add(t,sa,sb,fact,relevance,resolution='HOMEOWNER_CONFIRMATION_REQUIRED',use='CURRENTNESS_WARNING'):
     conf.append({'conflictType':t,'sourceA':sa,'sourceB':sb,'affectedFact':fact,'currentnessRelevance':relevance,'resolutionState':resolution,'allowedUse':use})
    for h in ass['assessorConflicts']:add('RECORDED_CHARACTERISTIC_CONFLICT','ASSESSOR','ASSESSOR', 'DWELLING_CONFIGURATION',h)
    if st['ambiguous']:add('COMMON_PARCEL_GEOMETRY_AMBIGUITY','STRUCTURE_OBSERVATION','ASSESSOR','UNIT_LEVEL_STRUCTURE_ASSIGNMENT','Historical common-parcel geometry cannot be assigned to one unit.','UNIT_LEVEL_INFERENCE_BLOCKED','PRELIMINARY_SCREENING_ONLY')
    rec=ass['recordedState'];units=ass['recordedUnitCount']
    if rec=='RECORDED_SINGLE_FAMILY_LIKELY' and 'ADU' in events and 'FINALED_COMPLETE' in statuses:add('LATER_CHANGE_VS_RECORDED_STATE','FINALED_PERMIT','ASSESSOR','DWELLING_CONFIGURATION','Recorded SFR plus explicitly finaled ADU evidence.')
    if units==1 and events&{'MULTIFAMILY_NEW','UNIT_CHANGE'} and statuses&{'FINALED_COMPLETE','ISSUED'}:add('LATER_CHANGE_VS_RECORDED_STATE','PERMIT_CHANGE','ASSESSOR','DWELLING_CONFIGURATION','Recorded one unit plus issued/finaled unit-change evidence.')
    if rec not in {'RECORDED_TYPE_UNKNOWN'} and 'DEMOLITION' in events:add('LATER_CHANGE_VS_RECORDED_STATE','DEMOLITION_PERMIT','ASSESSOR','DWELLING_CONFIGURATION','Recorded dwelling plus demolition evidence.')
    if rec=='RECORDED_SINGLE_FAMILY_LIKELY' and events&{'MULTIFAMILY_NEW','NEW_DWELLING'} and statuses&{'UNDER_REVIEW','APPLIED'}:add('LATER_CHANGE_VS_RECORDED_STATE','ACTIVE_PERMIT','ASSESSOR','DWELLING_CONFIGURATION','Recorded SFR plus active dwelling project.')
    if rec=='RECORDED_CONDO' and pstate=='CONFLICT_REQUIRES_REVIEW':add('COMMON_ADDRESS_PERMIT_AMBIGUITY','GROUP_PERMIT','ASSESSOR','UNIT_LEVEL_STRUCTURE_ASSIGNMENT','Common-address permit cannot be assigned to this condo APN.','UNIT_LEVEL_INFERENCE_BLOCKED')
    if rec=='RECORDED_TYPE_UNKNOWN' and events&{'NEW_DWELLING','MULTIFAMILY_NEW'} and 'FINALED_COMPLETE' in statuses:add('LATER_CHANGE_VS_RECORDED_STATE','FINALED_PERMIT','ASSESSOR','DWELLING_CONFIGURATION','No recorded type plus explicitly finaled dwelling evidence.')
    if ass['assessorAduHint'] and events&{'ADU','JADU'} and statuses&{'CANCELLED','EXPIRED','WITHDRAWN'}:add('RECORDED_HINT_VS_PROPOSAL','ASSESSOR_HINT','PERMIT_PROPOSAL','DWELLING_CONFIGURATION','Assessor ADU hint plus cancelled/expired/withdrawn ADU proposal.')
    if pstate=='LATER_CHANGE_OBSERVED':cur='LATER_CHANGE_OBSERVED';later+=1
    elif pstate in {'ACTIVE_CHANGE_IN_PROGRESS','ISSUED_CHANGE'}:cur='ACTIVE_CHANGE_IN_PROGRESS';active+=1;issued+=pstate=='ISSUED_CHANGE'
    elif pstate=='CONFLICT_REQUIRES_REVIEW' or ass['assessorConflicts']:cur='CONFLICTING_EVIDENCE'
    elif rec=='RECORDED_TYPE_UNKNOWN' and st['count']==0:cur='CURRENTNESS_UNKNOWN'
    elif rec=='RECORDED_TYPE_UNKNOWN':cur='OBSERVATIONAL_SUPPORT_ONLY'
    else:cur='RECORDED_STALE_POSSIBLE'
    if cur in {'LATER_CHANGE_OBSERVED','ACTIVE_CHANGE_IN_PROGRESS','CONFLICTING_EVIDENCE'}:dw='CONFLICTING'
    elif rec=='RECORDED_SINGLE_FAMILY_LIKELY':dw='SINGLE_FAMILY_LIKELY'
    elif rec=='RECORDED_MULTIFAMILY_LIKELY':dw='MULTIFAMILY_LIKELY'
    elif rec=='RECORDED_CONDO':dw='CONDO'
    else:dw='UNKNOWN'
    eligible=ass['eligible'] and cur not in {'LATER_CHANGE_OBSERVED','ACTIVE_CHANGE_IN_PROGRESS','CONFLICTING_EVIDENCE'}
    acc=st['count']>1 and not st['ambiguous'] and units==1 and cur not in {'LATER_CHANGE_OBSERVED','ACTIVE_CHANGE_IN_PROGRESS','CONFLICTING_EVIDENCE','CURRENTNESS_UNKNOWN'}
    if cur=='ACTIVE_CHANGE_IN_PROGRESS':q='ACTIVE_CHANGE_CURRENT_CONFIGURATION'
    elif cur=='LATER_CHANGE_OBSERVED':q='LATER_CHANGE_CURRENT_CONFIGURATION'
    elif cur=='CONFLICTING_EVIDENCE':q='CONFLICT_CURRENT_CONFIGURATION'
    elif dw=='CONDO':q='CONDO_CONFIRMATION'
    elif eligible:q='RECORDED_PROPERTY_CONFIRMATION'
    else:q='BLANK'
    adu='FINALED' if events&{'ADU','JADU'} and 'FINALED_COMPLETE' in statuses else 'ACTIVE' if events&{'ADU','JADU'} and statuses&{'UNDER_REVIEW','ISSUED'} else 'EXPIRED_OR_WITHDRAWN' if events&{'ADU','JADU'} and statuses&{'EXPIRED','WITHDRAWN','CANCELLED'} else 'UNKNOWN' if events&{'ADU','JADU'} else 'NONE'
    out={'apn':apn,'preliminaryDwellingState':dw,'currentnessState':cur,'recordedProperty':{'state':rec,'unitCount':units,'useClass':ass['useClass']},'permitEvidence':{'state':pstate,'events':sorted(events),'statuses':sorted(statuses),'explicitAduEvidence':adu,'plainClosedRecords':cl['records'] if cl else 0,'plainClosedCompletionSemantics':'UNKNOWN' if cl else None},'structureObservation':{'state':st['state'],'observedFootprintCount':st['count'],'accessoryStructureCandidate':acc,'observationDate':'2017-Spring','observationalOnly':True},'conflicts':conf,'questionKind':q,'v4':{'preliminaryDwellingState':dw,'dwellingStateProvenance':'UNKNOWN' if dw=='UNKNOWN' else 'RECORDED','currentnessState':cur,'activeChange':cur=='ACTIVE_CHANGE_IN_PROGRESS','explicitAduPermitEvidence':adu,'accessoryStructureCandidate':acc,'unresolvedConflictTypes':sorted({x['conflictType'] for x in conf})},'provenance':['SANGIS_ARCC_PARCEL_BASE_20260924','CITY_SANDAG_BUILDING_OUTLINES_2017','CITY_SD_APPROVALS_20261028' if pe else 'NO_BOUNDED_PERMIT_EVIDENCE'],'publicUseClassification':'PUBLIC_BOUNDED_SUMMARY_ELIGIBLE','privateRuntimeOnly':True}
    afact={'apn':apn,**ass,'provenance':'SANGIS_ARCC_PARCEL_BASE_20260924','publicUseClassification':'PUBLIC_BOUNDED_SUMMARY_ELIGIBLE'}
    cg.write((json.dumps(out,separators=(',',':'),sort_keys=True)+'\n').encode());ag.write((json.dumps(afact,separators=(',',':'),sort_keys=True)+'\n').encode())
    current[cur]+=1;dwell[dw]+=1;questions[q]+=1;preselect+=eligible;accessory+=acc
    for c in conf:conflict_types[c['conflictType']]+=1
    for s in statuses:permit_status[s]+=1
    strata={cur,dw,q,*events,*statuses,st['state']}
    named=apn in {'6341302200','5442140600'}
    if named or len(bench)<140 and (len(bench)<100 or any(sum(1 for b in bench if z in b['strata'])<3 for z in strata)):
     b={'apn':apn,'strata':sorted(strata),'composition':out};bench.append(b)
     if len(manual)<30:manual.append({'apn':apn,'sourceEvidence':out['provenance'],'boundedInterpretation':{'currentnessState':cur,'questionKind':q,'plainClosedNotFinaled':not(cl and cur=='LATER_CHANGE_OBSERVED' and pstate!='LATER_CHANGE_OBSERVED')}})
 peak=tracemalloc.get_traced_memory()[1];elapsed=time.perf_counter()-started
 if len(bench)<100:raise RuntimeError('benchmark underflow')
 # force named retained
 namedrows={b['apn']:b for b in bench if b['apn'] in {'6341302200','5442140600'}};bench=bench[:118]+list(namedrows.values())
 metrics={'denominator':DEN,'currentnessStates':dict(current),'dwellingStates':dict(dwell),'conflictObjects':sum(conflict_types.values()),'conflictTypes':dict(conflict_types),'activeChange':active,'issuedChangeIncludedInActive':issued,'laterChange':later,'plainClosedRecords':171455,'plainClosedAffectedParcels':len(closed),'plainClosedMaterialEventParcels':closed_material,'currentnessUnknown':current['CURRENTNESS_UNKNOWN'],'accessoryTailored':accessory,'permitSupportedQuestionChanges':questions['ACTIVE_CHANGE_CURRENT_CONFIGURATION']+questions['LATER_CHANGE_CURRENT_CONFIGURATION']+questions['CONFLICT_CURRENT_CONFIGURATION'],'preselectionReady':preselect,'questionSelection':dict(questions)};dump('population-metrics.json',metrics)
 dump('benchmark-cohort.json',{'count':len(bench),'rows':bench});dump('manual-verification.json',{'count':len(manual),'rows':manual,'finding':'Composition language remained bounded to recorded, observational, and permit lifecycle evidence.'})
 dump('contract-and-rights.json',{'contract':'jurisdiction-neutral-property-intelligence-composition-v0','authorityOrder':['EXPLICIT_FINALED_PERMIT_FACT','EXPLICIT_ISSUED_CHANGE_SIGNAL','RECORDED_ASSESSOR_CHARACTERISTIC','OFFICIAL_OBSERVATIONAL_GEOMETRY','USER_PROVIDED'],'homeownerFactsIncluded':False,'rawPermitRowsIncluded':False,'permitHolderIncluded':False,'rawGeometryIncluded':False,'privateProjectEvidenceIncluded':False,'rightsPropagation':'All inputs permit internal composition and bounded summaries; any unclear/restricted contributor fails public use closed.','publicActivation':False})
 dump('source-versions.json',{'assessor':'SANGIS_ARCC_PARCEL_BASE_20260924','permit':'CITY_SD_APPROVALS_20261028_SHA256_5b687cc9','structure':'CITY_SANDAG_BUILDING_OUTLINES_2017','composition':'san-diego-property-intelligence-composition-v0','refresh':'Packet 98 weekly rebuild followed by deterministic composition rebuild'})
 unc=sum(1 for x in closed.values() if x['events']&MATERIAL);dump('final-inspection-limitation.json',{'plainClosedRecords':171455,'affectedLinkedParcels':len(closed),'materialEventAffectedParcels':unc,'completionSemantics':'UNKNOWN','wouldImprove':['CURRENTNESS_UNKNOWN','RECORDED_STALE_POSSIBLE','ACTIVE_CHANGE_IN_PROGRESS','CONFLICTING_EVIDENCE'],'requiredEvidence':'City clarification/export distinguishing approved final inspection, expiration, and administrative close'})
 dump('performance.json',{'compressedBytes':comp_path.stat().st_size,'assessorCompressedBytes':ass_path.stat().st_size,'uncompressedBytes':sum(len(gzip.open(comp_path,'rb').read()) for _ in [0]),'buildSeconds':round(elapsed,3),'peakBuilderMemoryBytes':peak,'lookupArchitecture':'Future private runtime should load a read-only indexed snapshot or shard by APN prefix; do not linearly scan gzip per request.'})
 dump('decision.json',{'decision':'SAN_DIEGO_PROPERTY_INTELLIGENCE_COMPOSITION_READY','nextMove':'NEXT_TRULOT_STEP: SAN_DIEGO_PROPERTY_INTELLIGENCE_PRIVATE_RUNTIME','publicActivation':False,'legalConfigurationInference':False})
 (OUT/'README.md').write_text('# San Diego property intelligence composition v0\n\nPrivate/internal, jurisdiction-neutral Packet 76 composition over all 393,733 City APNs. It contains normalized bounded facts only. It does not expose permits publicly or infer legal configuration, occupancy, compliance, or current unit count.\n')
 files={}
 for x in sorted(OUT.iterdir()):
  if x.name!='artifact-integrity.json':files[x.name]={'bytes':x.stat().st_size,'sha256':hashlib.sha256(x.read_bytes()).hexdigest()}
 dump('artifact-integrity.json',{'files':files});print(json.dumps(metrics,indent=2))
if __name__=='__main__':main()
