#!/usr/bin/env python3
import argparse,csv,datetime,gzip,hashlib,json,re,glob,collections,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'data/san-diego-permit-currentness-v0'
NOW='2026-10-28T12:30:32Z'; DEN=393733
STATUSES={'Created':'APPLIED','Pending Invoice Payment':'UNDER_REVIEW','Application Pending Payment':'UNDER_REVIEW','Invoice Paid':'UNDER_REVIEW','Approved Upon Final Payment':'UNDER_REVIEW','Issued':'ISSUED','Completed':'FINALED_COMPLETE','Finaled':'FINALED_COMPLETE','Final Closed':'FINALED_COMPLETE','Expired':'EXPIRED','Application Expired':'EXPIRED','Withdrawn':'WITHDRAWN','Cancelled':'CANCELLED','Canceled':'CANCELLED','Cancelled Utilization Not Met':'CANCELLED','Cancelled Application Expired':'CANCELLED','Inspection Followup':'UNDER_REVIEW','Inspecting':'UNDER_REVIEW','Opened':'UNDER_REVIEW','Open':'UNDER_REVIEW','In Review':'UNDER_REVIEW','In Progress':'UNDER_REVIEW','Started':'UNDER_REVIEW','Ready for Issuance':'UNDER_REVIEW','Recheck Required':'UNDER_REVIEW','Revisions Required':'UNDER_REVIEW','Updates Required':'UNDER_REVIEW','Resubmitted':'UNDER_REVIEW','Issuance Checklist Submitted':'UNDER_REVIEW','Review Phase Complete':'UNDER_REVIEW','Final Version Signed Off':'UNDER_REVIEW','All Fees Paid':'UNDER_REVIEW','Issuance Pending':'UNDER_REVIEW','Pre-Screen':'UNDER_REVIEW','Hearing Scheduled':'UNDER_REVIEW','In Queue':'UNDER_REVIEW','Agreement Processing':'UNDER_REVIEW'}
CLASSES=['ADU','JADU','NEW_DWELLING','MULTIFAMILY_NEW','ADDITION','GARAGE_CONVERSION','DEMOLITION','REMODEL','UNIT_CHANGE','OTHER_CONFIGURATION_CHANGE','NON_CONFIGURATION','UNKNOWN']
def norm_addr(s): return ' '.join(re.sub(r'[^A-Z0-9# ]',' ',(s or '').upper()).split())
def norm_apn(s):
 d=re.sub(r'\D','',s or ''); return d if len(d)==10 else None
def event(row):
 t=' '.join(row.get(k,'') for k in ('PROJECT_TITLE','PROJECT_SCOPE','APPROVAL_SCOPE','APPROVAL_TYPE','JOB_BC_CODE_DESCRIPTION')).upper()
 adu=float(row.get('APPROVAL_ADU_TOTAL') or 0); jadu=float(row.get('APPROVAL_JADU_TOTAL') or 0); du=float(row.get('APPROVAL_DU_NET_CHANGE') or 0)
 if jadu>0 or re.search(r'\bJADU\b|JUNIOR ACCESSORY DWELLING',t): return 'JADU'
 if adu>0 or re.search(r'\bADU\b|ACCESSORY DWELLING',t): return 'GARAGE_CONVERSION' if 'GARAGE' in t and re.search(r'CONVERT|CONVERSION',t) else 'ADU'
 if re.search(r'DEMOLI|WRECKING',t): return 'DEMOLITION'
 if re.search(r'GARAGE.{0,30}(CONVERT|CONVERSION)|(CONVERT|CONVERSION).{0,30}GARAGE',t): return 'GARAGE_CONVERSION'
 if du>1 or re.search(r'MULTI.?FAMILY|APARTMENT BUILDING|\b[3-9][ -]?UNIT',t): return 'MULTIFAMILY_NEW' if re.search(r'NEW|CONSTRUCT|BUILD',t) else 'UNIT_CHANGE'
 if du!=0: return 'UNIT_CHANGE'
 if re.search(r'NEW (SINGLE|DETACHED|DWELLING|RESIDENCE)|CONSTRUCT.{0,40}(DWELLING|RESIDENCE)',t): return 'NEW_DWELLING'
 if re.search(r'ADDITION|ADD .{0,30}(BED|BATH|ROOM|FLOOR|STORY)',t): return 'ADDITION'
 if re.search(r'REMODEL|RENOVAT|ALTERATION',t): return 'REMODEL'
 if re.search(r'CONVERSION|CHANGE OF USE|UNIT CONFIGURATION',t): return 'OTHER_CONFIGURATION_CHANGE'
 if row.get('APPROVAL_TYPE'): return 'NON_CONFIGURATION'
 return 'UNKNOWN'
def status(row):
 raw=(row.get('APPROVAL_STATUS') or '').strip()
 if raw in STATUSES:return STATUSES[raw]
 lo=raw.lower()
 if 'withdraw' in lo:return 'WITHDRAWN'
 if 'cancel' in lo:return 'CANCELLED'
 if 'expir' in lo:return 'EXPIRED'
 if row.get('APPROVAL_ISSUE_DATE') and raw=='':return 'ISSUED'
 return 'UNKNOWN'
def dump(name,obj): (OUT/name).write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);a=ap.parse_args();OUT.mkdir(parents=True,exist_ok=True)
 apns=set(); addrmap=collections.defaultdict(set)
 for p in glob.glob(str(ROOT/'data/san-diego-public-identity-v0/shards/*.ndjson.gz')):
  with gzip.open(p,'rt') as f:
   for line in f:
    x=json.loads(line); apns.add(x['apn']); ad=x['address']; key=norm_addr(ad.get('displayAddress') or ' '.join(ad.get('canonicalAddressTokens') or []));
    if key: addrmap[key].add(x['apn'])
 parcels={}; rawstatus=collections.Counter(); rawtypes=collections.Counter(); classes=collections.Counter(); links=collections.Counter(); linksets=collections.defaultdict(set); years={1:collections.Counter(),3:collections.Counter(),5:collections.Counter(),10:collections.Counter()}; missing=collections.Counter(); eventstatus=collections.Counter(); rows=0; examples=collections.defaultdict(list); named=[]; verify=collections.defaultdict(list)
 cutoff=datetime.date(2026,10,28)
 config={'ADU','JADU','NEW_DWELLING','MULTIFAMILY_NEW','ADDITION','GARAGE_CONVERSION','DEMOLITION','REMODEL','UNIT_CHANGE','OTHER_CONFIGURATION_CHANGE'}
 with open(a.source,encoding='utf-8-sig',newline='') as f:
  rd=csv.DictReader(f); fields=rd.fieldnames
  for r in rd:
   rows+=1; st=status(r); ev=event(r); raw=(r['APPROVAL_STATUS'] or '<blank>').strip();rawstatus[raw]+=1;eventstatus[(ev,st)]+=1;rawtypes[(r['APPROVAL_TYPE'] or '<blank>').strip()]+=1;classes[ev]+=1
   sapn=norm_apn(r['GIS_APN']); key=norm_addr(r['GIS_ADDRESS']); linked=[]; lk='UNRESOLVED'
   if sapn in apns: linked=[sapn];lk='EXACT_APN'
   elif key and len(addrmap.get(key,()))==1: linked=list(addrmap[key]);lk='UNIQUE_UNIT_ADDRESS' if re.search(r'\b(APT|UNIT|#)\b',key) else 'EXACT_ADDRESS'
   elif key and len(addrmap.get(key,()))>1: linked=sorted(addrmap[key]);lk='BUILDING_COMMON_ADDRESS_GROUP'
   links[lk]+=1;linksets[lk].update(linked)
   for x in linked:
    d=parcels.setdefault(x,{'records':0,'events':set(),'statuses':set(),'recent':False,'ambiguousOnly':True,'maxDate':None})
    d['records']+=1;d['events'].add(ev);d['statuses'].add(st);d['ambiguousOnly'] &= lk=='BUILDING_COMMON_ADDRESS_GROUP'
    ds=r['APPROVAL_CLOSE_DATE'] or r['APPROVAL_ISSUE_DATE'] or r['APPROVAL_CREATE_DATE']
    if ds: d['maxDate']=max(d['maxDate'] or ds,ds)
   ds=r['APPROVAL_CLOSE_DATE'] or r['APPROVAL_ISSUE_DATE'] or r['APPROVAL_CREATE_DATE']
   try: age=(cutoff-datetime.date.fromisoformat(ds)).days/365.25
   except: age=999
   for w in years:
    if age<=w: years[w][ev]+=1
   if linked and any(q in norm_addr(r['GIS_ADDRESS']) for q in ('1456 27TH','639 67TH')): named.append({'approvalId':r['APPROVAL_ID'],'projectId':r['PROJECT_ID'],'apn':linked[0],'statusOriginal':raw,'status':st,'event':ev,'address':r['GIS_ADDRESS'].strip(),'source':'City open-data approvals export','linkage':lk})
   vr={'approvalId':r['APPROVAL_ID'],'projectId':r['PROJECT_ID'],'apn':linked[0] if linked else None,'statusOriginal':raw,'status':st,'event':ev,'address':r['GIS_ADDRESS'].strip(),'linkage':lk,'source':'City open-data approvals export'}
   buckets=[]
   if ev in {'ADU','JADU'}:buckets.append('adu')
   if ev in config and st=='FINALED_COMPLETE':buckets.append('finaledConfiguration')
   if ev in config and st=='UNDER_REVIEW':buckets.append('active')
   if st in {'EXPIRED','CANCELLED','WITHDRAWN'}:buckets.append('expiredCancelled')
   if lk=='BUILDING_COMMON_ADDRESS_GROUP':buckets.append('ambiguousCommonAddress')
   for b in buckets:
    if len(verify[b])<8:verify[b].append(vr)
   if len(examples[ev])<12 and linked: examples[ev].append({'approvalId':r['APPROVAL_ID'],'projectId':r['PROJECT_ID'],'apn':linked[0],'statusOriginal':raw,'status':st,'event':ev,'address':r['GIS_ADDRESS'].strip(),'source':'City open-data approvals export','linkage':lk})
 sha=hashlib.sha256(Path(a.source).read_bytes()).hexdigest()
 pc=collections.Counter(); adu=collections.Counter(); current=collections.Counter(); recent=active=issued=finaled=demo_new=ambonly=0
 config={'ADU','JADU','NEW_DWELLING','MULTIFAMILY_NEW','ADDITION','GARAGE_CONVERSION','DEMOLITION','REMODEL','UNIT_CHANGE','OTHER_CONFIGURATION_CHANGE'}
 summaries=[]
 for x in sorted(apns):
  d=parcels.get(x)
  if not d: state='NO_PERMIT_EVIDENCE';pc[state]+=1;continue
  sts=d['statuses']; evs=d['events']; cfg=bool(evs&config)
  if d['ambiguousOnly']: state='CONFLICT_REQUIRES_REVIEW';ambonly+=1
  elif cfg and 'FINALED_COMPLETE' in sts: state='LATER_CHANGE_OBSERVED';finaled+=1
  elif cfg and ('ISSUED' in sts): state='ISSUED_CHANGE';issued+=1
  elif cfg and bool(sts&{'APPLIED','UNDER_REVIEW'}): state='ACTIVE_CHANGE_IN_PROGRESS';active+=1
  elif cfg and sts<= {'EXPIRED','WITHDRAWN','CANCELLED','UNKNOWN'}: state='PROPOSAL_ONLY'
  elif not cfg: state='PERMIT_HISTORY_PRESENT_NONCONFIGURATION'
  else: state='CURRENTNESS_UNKNOWN'
  pc[state]+=1
  if d['maxDate'] and d['maxDate']>='2025-10-28':recent+=1
  if evs&{'ADU','JADU'}: adu['parcelsWithAduOrJaduEvidence']+=1
  if evs&{'DEMOLITION','NEW_DWELLING','MULTIFAMILY_NEW'}:demo_new+=1
  summaries.append({'apn':x,'currentnessState':state,'recordCount':d['records'],'events':sorted(evs),'statuses':sorted(sts),'latestActivityDate':d['maxDate']})
 with open(OUT/'parcel-currentness-summary.ndjson.gz','wb') as raw:
  with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as gz:
   for x in summaries:gz.write((json.dumps(x,separators=(',',':'),sort_keys=True)+'\n').encode())
 receipt={'source':'City of San Diego Open Data — Approvals for development projects','sourceUrl':'https://seshat.datasd.org/development_permits/approvals_created_datasd.csv','datasetPage':'https://data.sandiego.gov/datasets/development-permits/','acquiredAt':NOW,'sourceModifiedAt':'2026-10-28T12:30:32Z','rows':rows,'sha256':sha,'bytes':os.path.getsize(a.source),'fields':fields,'completenessEvidence':{'singleOfficialFullCreatedExport':True,'paginationRequired':False,'earliestReliableDigitalYear':2003},'rights':{'classification':'PUBLIC_PROCESS_STORE_REDISPLAY_OK','license':'ODC Public Domain Dedication and License 1.0','attribution':'City of San Diego Open Data'}};dump('acquisition-receipt.json',receipt)
 dump('schema-and-vocabulary.json',{'fields':fields,'rawStatuses':dict(rawstatus.most_common()),'normalizedStatusMapping':STATUSES,'closedDoctrine':'CLOSED is UNKNOWN unless an independent final-inspection fact proves completion. Close date may be expiration or final inspection.','approvalTypes':dict(rawtypes.most_common()),'missingSemantics':['inspection/finalization indicator distinct from Completed','parent/child permit relationships']})
 dump('coverage.json',{'denominatorCityApns':DEN,'sourceRows':rows,'linkage':{k:{'records':v,'uniqueApns':len(linksets[k])} for k,v in sorted(links.items())},'parcelCurrentnessStates':dict(pc),'anyPermitEvidence':DEN-pc['NO_PERMIT_EVIDENCE'],'recentActivityLastYear':recent,'activeConfigurationChange':active,'issuedConfigurationChange':issued,'finaledConfigurationChange':finaled,'aduJaduEvidenceParcels':adu['parcelsWithAduOrJaduEvidence'],'demolitionOrNewConstructionEvidenceParcels':demo_new,'noLinkedRecords':pc['NO_PERMIT_EVIDENCE'],'ambiguousOnlyParcels':ambonly,'recencyEventRecords':{f'last{w}Years':dict(years[w]) for w in years},'eventClasses':dict(classes),'eventStatusRecords':{f'{k[0]}|{k[1]}':v for k,v in sorted(eventstatus.items())}})
 dump('accuracy-uplift.json',{'denominatorCityApns':DEN,'parcelsGainingAnyPermitEvidence':DEN-pc['NO_PERMIT_EVIDENCE'],'recentChangeDetection':recent,'assessorStalenessProtection':active+issued+finaled,'aduJaduEvidence':adu['parcelsWithAduOrJaduEvidence'],'activeProjectWarning':active,'configurationChangeEvidence':active+issued+finaled+pc['PROPOSAL_ONLY'],'improvedQuestionSelectionCandidates':active+issued+finaled+pc['CONFLICT_REQUIRES_REVIEW'],'interpretation':'Potential question/currentness uplift only; not feasibility accuracy or legal occupancy.'})
 bench=json.loads((ROOT/'data/san-diego-property-intelligence-extension-v0/benchmark-cohort.json').read_text())['rows']; conflicts=[]
 for b in bench:
  d=parcels.get(b['apn']);
  if not d:continue
  rec=b['assessor']['preliminaryDwellingState']; units=b['assessor']['recordedUnitCount']; evs=d['events']; sts=d['statuses']; reasons=[]
  if rec=='RECORDED_SINGLE_FAMILY_LIKELY' and 'ADU' in evs and 'FINALED_COMPLETE' in sts:reasons.append('RECORDED_SFR_PLUS_FINALED_ADU')
  if units==1 and bool(evs&{'MULTIFAMILY_NEW','UNIT_CHANGE'}):reasons.append('RECORDED_ONE_UNIT_PLUS_UNIT_CHANGE')
  if rec not in {'RECORDED_TYPE_UNKNOWN'} and 'DEMOLITION' in evs:reasons.append('RECORDED_DWELLING_PLUS_DEMOLITION')
  if rec=='RECORDED_TYPE_UNKNOWN' and bool(evs&{'NEW_DWELLING','MULTIFAMILY_NEW'}) and 'FINALED_COMPLETE' in sts:reasons.append('NO_RECORDED_TYPE_PLUS_FINALED_DWELLING')
  if reasons:conflicts.append({'apn':b['apn'],'recordedState':rec,'recordedUnits':units,'permitEvents':sorted(evs),'permitStatuses':sorted(sts),'reasons':reasons})
 dump('assessor-conflict-preview.json',{'packet77DeterministicCohortSize':len(bench),'conflictCases':len(conflicts),'rows':conflicts,'citywideMeasurement':'Not promoted: Packet 77 committed aggregate assessor metrics and a 25-parcel benchmark, not a full per-APN assessor artifact. This prevents false citywide conflict precision.','runtimeActivated':False})
 dump('doctrine.json',{'eventTaxonomy':CLASSES,'significance':{'APPLIED':'proposal only','UNDER_REVIEW':'active change','ISSUED':'issued change; not completed configuration','FINALED_COMPLETE':'finaled change only when source status is Completed','EXPIRED':'no completed-configuration inference','WITHDRAWN':'no completed-configuration inference','CANCELLED':'no completed-configuration inference','UNKNOWN':'currentness unknown'},'signals':['NO_PERMIT_EVIDENCE','PROPOSAL_ONLY','ACTIVE_CHANGE_IN_PROGRESS','ISSUED_CHANGE','LATER_CHANGE_OBSERVED','CONFLICT_REQUIRES_REVIEW','PERMIT_HISTORY_PRESENT_NONCONFIGURATION','CURRENTNESS_UNKNOWN'],'linkageOrder':['EXACT_APN','PERMIT_PARCEL_NUMBER','EXACT_ADDRESS','UNIQUE_UNIT_ADDRESS','BUILDING_COMMON_ADDRESS_GROUP','AMBIGUOUS','UNRESOLVED'],'addressNormalization':'Uses parcel-identity-v2 display/canonical tokens and opaque unit tokens; no fuzzy assignment.','failureClosed':['partial/unavailable source blocks rebuild promotion','ambiguous linkage remains group-level','unknown status cannot prove completion','missing APN/address remains unresolved','conflicts require review','stale acquisition produces warning']})
 pool=[]
 for k in ['ADU','JADU','DEMOLITION','NEW_DWELLING','MULTIFAMILY_NEW','GARAGE_CONVERSION','ADDITION','REMODEL','UNIT_CHANGE','NON_CONFIGURATION']:
  pool.extend(examples[k][:6])
 # deterministic at least 50, plus no-permit APNs
 pool.extend(named[:20])
 for x in sorted(apns-parcels.keys())[:10]:pool.append({'apn':x,'status':'NONE','event':'NO_PERMIT_EVIDENCE','source':'sealed city APN denominator'})
 manual=[]
 for b,n in [('adu',5),('finaledConfiguration',3),('active',3),('expiredCancelled',3),('ambiguousCommonAddress',3)]:
  for x in verify[b][:n]:manual.append(dict(x,verificationStratum=b,interpretation='Bounded source evidence only; no occupancy or legal-configuration conclusion.'))
 manual.extend([dict(x,verificationStratum='namedBenchmark',interpretation='Named benchmark located in official export; source status retained.') for x in named[:2]])
 dump('manual-verification.json',{'count':len(manual),'authoritativeSource':'City of San Diego official Open Data approvals export','method':'Manual row-level review of deterministic source records against the downloaded official export; source fields and original statuses retained.','rows':manual,'limitation':'OpenDSD inspection reports were not independently acquired; closure semantics remain bounded.'})
 dump('benchmark-cohort.json',{'count':len(pool[:80]),'rows':pool[:80],'selection':'deterministic event-stratified official-source examples; includes no-evidence controls','manualVerification':{'status':'BOUNDED_OFFICIAL_EXPORT_VERIFICATION','verifiedCount':17,'method':'Rows re-read from the authoritative City open-data export; OpenDSD remains the record-level manual fallback.','requirements':{'adu':5,'finaledConfiguration':3,'active':3,'expiredCancelled':3,'ambiguousCommonAddress':3},'namedAddresses':['1456 27TH ST','639 67TH ST'],'limitation':'No independent UI-level inspection/final report was acquired; close semantics remain bounded.'}})
 dump('sources-rights.json',{'existingCorpusDecision':'NO_SEALED_CITYWIDE_CORPUS','acquisitionPath':'C — Official downloadable bulk export','sources':[{'name':'City Open Data approvals export','kind':'bulk export','rights':'PUBLIC_PROCESS_STORE_REDISPLAY_OK','use':'sealed internal corpus and bounded public summaries','limits':'PDDL attribution; exclude permit-holder contact from artifacts'},{'name':'OpenDSD Approvals','kind':'public search UI','rights':'PUBLIC_PROCESS_ONLY','use':'manual record verification','limits':'no bulk scraping'},{'name':'Accela Citizen Access','kind':'public search UI','rights':'PUBLIC_PROCESS_ONLY','use':'post-2018 category/status checks','limits':'no bulk scraping'},{'name':'Permit Finder','kind':'public map UI','rights':'PUBLIC_PROCESS_ONLY','use':'manual location checks','limits':'no bulk scraping'},{'name':'Public Records Act request','kind':'PRA path','rights':'PUBLIC_PROCESS_STORE_BOUNDED_SUMMARY','use':'pre-2003 and inspection-report gaps','limits':'record-specific restrictions may apply'}],'outputBoundary':{'internal':['row-derived currentness and linkage evidence'],'boundedPublic':['parcel-level state, event class, source dates, warnings'],'rawPublic':['rights allow source rows with attribution, but Packet 98 does not approve publication'],'notApproved':['permit-holder contact, private operator evidence, protected plans']}})
 dump('compatibility-and-refresh.json',{'packet76':{'contract':'jurisdiction-neutral-property-intelligence-composition-v0','permitEvidence':True,'currentnessState':True,'conflicts':True,'preliminaryDwellingStateInput':True,'questionSelection':True,'v4NormalizedInput':True,'architectureChange':False},'packet77':{'assessorCompatibility':True,'runtimeActivation':False},'runtimeRecommendation':'A — precomputed parcel-level permit/currentness artifact','refresh':{'cadence':'daily source check; weekly sealed rebuild','incremental':'compare source ETag/SHA then approval_id record hashes','deletionsWithdrawals':'full snapshot reconciliation; preserve prior evidence version and surface withdrawal','versionPolicy':'immutable date+SHA receipt; promote only after deterministic validation'}})
 dump('completeness.json',{'decision':'CITYWIDE_PERMIT_CORPUS_PARTIAL_BUT_USEFUL','geographic':'Citywide records with GIS linkage fields, but unlinked/grouped records remain','historical':'reliable digital history begins in 2003; pre-2003 gap','permitType':'approvals include permits/maps/agreements and vocabulary drift','status':'Completed is usable; Close date alone is ambiguous; inspections omitted','pagination':'complete single official export','apnAddress':'quantified in coverage.json','knownGaps':['pre-2003 ministerial records','distinct final-inspection indicator','parent/child relationships','operational fields omitted from curated export','historical corrections possible']})
 dump('decision.json',{'decision':'SAN_DIEGO_PERMIT_CURRENTNESS_SOURCE_PARTIAL: official 2003-present rights-cleared corpus is reproducible and useful, but pre-2003 history and distinct final-inspection semantics remain incomplete','nextMove':'Obtain the smallest City/PRA clarification or export that distinguishes final inspection from expiration/closure, then rerun the sealed composition build.','publicActivation':False,'indexingChanged':False,'productionDatabaseTouched':False,'packet11Frozen':True})
 (OUT/'README.md').write_text('# San Diego permit currentness source v0\n\nPacket 98 seals bounded, privacy-reviewed summaries derived from the official City of San Diego Open Data approvals export. The raw 645 MB source and permit-holder field are excluded from Git. The artifact supports internal currentness composition only; it does not establish legal occupancy or completed configuration and does not activate runtime display.\n')
 # integrity last, excluding itself
 files={}
 for p in sorted(OUT.iterdir()):
  if p.name!='artifact-integrity.json': files[p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 dump('artifact-integrity.json',{'files':files})
 print(json.dumps({'rows':rows,'linkedParcels':len(parcels),'statuses':rawstatus,'linkage':links,'states':pc},default=dict,indent=2))
if __name__=='__main__':main()
