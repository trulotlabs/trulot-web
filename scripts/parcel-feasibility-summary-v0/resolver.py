"""Packet 38 bounded ParcelFeasibilitySummaryV0 composition."""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Any
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dimensional_rule_evaluator_v0 import fingerprint,integrity_artifact,provenance_graph
CONTRACT_VERSION='parcel-feasibility-summary-v0-2026-10-01-p38'
EXPECTED_APN='6341302200'
EXPECTED_RULES={
 'minimum_lot_area':('minimum-lot-area-evaluation-v0-2026-09-30-p27','RULE_REQUIREMENT_SATISFIED','22096.320','5000.0','sq_ft'),
 'minimum_lot_depth':('minimum-lot-depth-evaluation-v0-2026-09-30-p28','RULE_REQUIREMENT_SATISFIED','235.02','95.0','ft'),
 'minimum_lot_width':('minimum-lot-width-evaluation-v0-2026-09-30-p29','RULE_REQUIREMENT_SATISFIED','94.00','50.0','ft'),
 'minimum_frontage':('minimum-frontage-evaluation-v0-2026-10-01-p30','RULE_REQUIREMENT_SATISFIED','94.00','50.0','ft'),
}
EXPECTED_SETBACKS={
 'front_setback':('front-setback-evaluator-v0-2026-10-01-p32','SETBACK_REQUIREMENT_CONDITIONAL','SETBACK_COMPLIANCE_NOT_EVALUATED'),
 'rear_setback':('rear-setback-evaluator-v0-2026-10-01-p34','SETBACK_REQUIREMENT_CONDITIONAL','SETBACK_COMPLIANCE_NOT_EVALUATED'),
 'interior_side_setback':('interior-side-setback-evaluator-v0-2026-10-01-p36','SETBACK_REQUIREMENT_CONDITIONAL','SETBACK_COMPLIANCE_NOT_EVALUATED'),
}
FORBIDDEN_CONCLUSIONS=['ZONING_COMPLIANT','CONFORMING_LOT','BUILDABLE_LOT','DEVELOPMENT_CAPACITY_AVAILABLE','PROJECT_FEASIBLE','PERMIT_READY','OVERALL_COMPLIANCE','STRUCTURE_COMPLIANCE']

def _seal_failures(inputs:dict[str,Any])->list[str]:
 failures=[]
 for key,expected in EXPECTED_RULES.items():
  x=inputs[key]; comparison=x.get('comparison',{})
  actual=(x.get('contract_version'),x.get('state'),comparison.get('left'),comparison.get('right'),comparison.get('unit'))
  if actual!=expected:failures.append(key)
 for key,expected in EXPECTED_SETBACKS.items():
  x=inputs[key];actual=(x.get('contract_version'),x.get('state'),x.get('compliance_state'))
  if actual!=expected:failures.append(key)
 street=inputs['street_side_setback']
 if (street.get('contract_version'),street.get('state'),street.get('truth_state'),street.get('numeric_comparison_performed'))!=('street-side-setback-applicability-v0-2026-10-01-p37','STREET_SIDE_SETBACK_NOT_APPLICABLE','NOT_APPLICABLE',False):failures.append('street_side_setback')
 legal=inputs['legal_lot'];parcel=inputs['parcel']
 if legal.get('legal_status_state')!='LEGAL_LOT_ESTABLISHED' or legal.get('apn_recorded_entity_reconciliation',{}).get('state')!='EXACT_RECORDED_LOT_MATCH':failures.append('legal_lot')
 if parcel.get('identity',{}).get('apn')!=EXPECTED_APN or parcel.get('zoning',{}).get('mapping_state')!='SINGLE_ZONE' or parcel.get('coastal_context',{}).get('evidence_state')!='OUTSIDE_COASTAL':failures.append('parcel')
 return failures

def compose_summary(inputs:dict[str,Any])->dict[str,Any]:
 failures=_seal_failures(inputs)
 if failures:return {'contract_version':CONTRACT_VERSION,'apn':EXPECTED_APN,'state':'SUMMARY_COMPOSITION_SOURCE_MISMATCH','failed_input_seals':failures,'capacity_calculated':False,'overall_compliance_conclusion':False,'other_rule_families_evaluated':[]}
 parcel,legal=inputs['parcel'],inputs['legal_lot']
 satisfied=[]
 labels={'minimum_lot_area':'Minimum lot area','minimum_lot_depth':'Minimum lot depth','minimum_lot_width':'Minimum lot width','minimum_frontage':'Minimum frontage'}
 for key in EXPECTED_RULES:
  x=inputs[key];c=x['comparison']
  satisfied.append({'rule_family':key,'label':labels[key],'state':x['state'],'supported_value':{'value':c['left'],'unit':c['unit']},'required_value':{'value':c['right'],'unit':c['unit']},'operator':c['operator'],'bounded_conclusion':x['bounded_conclusion'],'origin':{'contract_version':x['contract_version'],'evaluation_fingerprint_sha256':x['fingerprint_sha256']}})
 conditional=[
  {'rule_family':'front_setback','state':'SETBACK_REQUIREMENT_CONDITIONAL','ordinary_base':{'value':'15','unit':'ft'},'structure_compliance':'SETBACK_COMPLIANCE_NOT_EVALUATED','unresolved_groups':['front slope predicate and permission','project-specific Fire Official buffer','document/program conditions','current/proposed structure geometry and element classification'],'origin':{'contract_version':inputs['front_setback']['contract_version'],'evaluation_fingerprint_sha256':inputs['front_setback']['fingerprint_sha256']}},
  {'rule_family':'rear_setback','state':'SETBACK_REQUIREMENT_CONDITIONAL','ordinary_base':{'value':'23.5020','unit':'ft','derivation':'depth-adjusted'},'structure_compliance':'SETBACK_COMPLIANCE_NOT_EVALUATED','unresolved_groups':['project-specific Fire Official buffer','document/program modification','current structure geometry and element classification'],'origin':{'contract_version':inputs['rear_setback']['contract_version'],'evaluation_fingerprint_sha256':inputs['rear_setback']['fingerprint_sha256']}},
  {'rule_family':'interior_side_setback','state':'SETBACK_REQUIREMENT_CONDITIONAL','ordinary_base':{'value':'4','unit':'ft','applies_to':'each north and south interior side'},'structure_compliance':'SETBACK_COMPLIANCE_NOT_EVALUATED','unresolved_groups':['reallocation/addition history','projection or encroachment classification','project-specific Fire Official buffer','document/program conditions','current structure geometry'],'origin':{'contract_version':inputs['interior_side_setback']['contract_version'],'evaluation_fingerprint_sha256':inputs['interior_side_setback']['fingerprint_sha256']}},
 ]
 not_applicable=[{'rule_family':'street_side_setback','state':'NOT_APPLICABLE','reason':'No side property line adjoins a street.','numeric_requirement_selected':False,'origin':{'contract_version':inputs['street_side_setback']['contract_version'],'evaluation_fingerprint_sha256':inputs['street_side_setback']['fingerprint_sha256']}}]
 not_evaluated=[
  {'rule_family':'height','state':'NOT_EVALUATED','reason':'No height evaluator was run in this packet.'},
  {'rule_family':'far','state':'NOT_EVALUATED','reason':'Code-defined gross floor area and a FAR evaluation are not available.'},
  {'rule_family':'lot_coverage','state':'NOT_EVALUATED','reason':'Current authoritative footprint and complete coverage predicates are not available.'},
  {'rule_family':'structure_compliance','state':'NOT_EVALUATED','reason':'Current authoritative structure geometry and final setback branches are unresolved.'},
 ]
 summary={
  'schema':'ParcelFeasibilitySummaryV0','contract_version':CONTRACT_VERSION,'apn':EXPECTED_APN,'state':'PARTIAL_BASE_RULE_FEASIBILITY_ESTABLISHED',
  'parcel_identity':{'situs_address':parcel['identity'].get('situs_address'),'recorded_entity':'PM 17383 PARCEL 1','parcel_intelligence_fingerprint_sha256':parcel['fingerprint_sha256']},
  'legal_lot':{'state':'LEGAL_LOT_ESTABLISHED','reconciliation_state':'EXACT_RECORDED_LOT_MATCH','fingerprint_sha256':legal['fingerprint_sha256']},
  'zoning':{'mapping_state':'SINGLE_ZONE','zone_code':'RS-1-7','coastal_context':'OUTSIDE_COASTAL','standards_version':parcel['base_standards']['rule_set_version'],'standards_verified_as_of':parcel['base_standards']['provenance']['verified_as_of']},
  'rule_results':{'satisfied':satisfied,'not_satisfied':[],'conditional':conditional,'not_applicable':not_applicable,'not_evaluated':not_evaluated},
  'result_counts':{'satisfied':4,'not_satisfied':0,'conditional':3,'not_applicable':1,'not_evaluated':4},
  'human_summary':'TruLot has verified the parcel’s legal lot identity and evaluated four base dimensional requirements. Minimum lot area, depth, width, and frontage satisfy the applicable RS-1-7 base standards. Setback requirements remain conditional and structure compliance has not been evaluated.',
  'what_trulot_knows':['Legal lot established','Base zoning is RS-1-7','Parcel is outside Coastal','Minimum lot area rule satisfied','Minimum lot depth rule satisfied','Minimum lot width rule satisfied','Minimum frontage rule satisfied'],
  'unresolved_evidence':['Front setback final branch, including the front slope predicate','Rear setback final branch','Interior-side final branch','Project-specific Fire Code Official buffer','Current authoritative structure geometry','Height','FAR and Code-defined gross floor area','Lot coverage','Project-specific proposal facts'],
  'next_investigation_order':[{'rank':1,'target':'current structure geometry'},{'rank':2,'target':'height and FAR inputs'},{'rank':3,'target':'project-specific Fire review'},{'rank':4,'target':'front slope methodology if needed'},{'rank':5,'target':'project proposal facts'}],
  'next_feasibility_source_target':'current structure geometry',
  'product_bridge':{'level_1_cta':'See what’s needed to evaluate this property','evaluated_so_far':'4 base dimensional rules satisfied.','still_needed':'Setbacks, height, FAR, structure geometry, and project-specific Fire review.','capacity':'Not evaluated.','ui_wired':False},
  'expert_detail_bridge':{'fields':['rule family','required value','supported parcel value','bounded result','source/provenance'],'conditional_display':'Conditional rules must retain their conditional state, unresolved evidence groups, and unevaluated structure-compliance state.','source_chain_mode':'REFERENCE_ORIGINATING_SEALED_BUNDLE','ui_wired':False},
  'forbidden_aggregation':{'forbidden_conclusions':FORBIDDEN_CONCLUSIONS,'satisfied_rule_count_does_not_imply':['zoning compliant','conforming lot','buildable lot','development capacity available','project feasible','permit-ready']},
  'capacity':{'state':'NOT_EVALUATED','calculated':False},'overall_compliance':{'state':'NOT_EVALUATED','conclusion_emitted':False},'new_rule_families_evaluated':[],
  'provenance':[{'conclusion':item['rule_family'],'contract_version':item['origin']['contract_version'],'evaluation_fingerprint_sha256':item['origin']['evaluation_fingerprint_sha256']} for item in satisfied+conditional+not_applicable],
 }
 summary['fingerprint_sha256']=fingerprint(summary)
 return summary
