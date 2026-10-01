#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Any
from resolver import CONTRACT_VERSION, EXPECTED_APN, FORBIDDEN_CONCLUSIONS, evaluate_street_side_applicability, integrity_artifact, provenance_graph, validate_contract
ROOT=Path(__file__).resolve().parents[2]
OUTPUT=ROOT/'data'/'street-side-setback-applicability-v0'
def _json(path:str)->Any:return json.loads((ROOT/path).read_text())
def _inputs()->tuple[dict[str,Any],...]:
 parcels=_json('data/parcel-intelligence-v2/fixture-results.json')['results']; parcel=next(x['result'] for x in parcels if x['result'].get('identity',{}).get('apn')==EXPECTED_APN)
 legal=next(x for x in _json('data/legal-lot-evidence-v0/fixture-results.json')['results'] if x.get('apn')==EXPECTED_APN)
 width=_json('data/minimum-lot-width-evaluation-v0/evaluation.json')
 rule=next(r for z in parcel['base_standards']['zone_results'] for r in z['rules'] if r.get('standard_key')=='street_side_setback_min')
 sources=_json('data/rs-base-standards-v0/sources.json'); pages=_json('data/high-value-residential-review/authority-excerpts.json')['pages']['measurement']
 authority={'measurement_source':sources['sources']['measurement_rules'],'measurement_pages_sha256':hashlib.sha256((pages['26']+pages['28']+pages['29']+pages['31']).encode()).hexdigest()}
 return parcel,legal,rule,width,authority
def build_outputs()->dict[str,object]:
 parcel,legal,rule,width,authority=_inputs(); evaluation=evaluate_street_side_applicability(parcel,legal,rule,width,authority)
 provenance=provenance_graph(CONTRACT_VERSION,[
  {'hop':'APN_TO_PARCEL_V2','apn':EXPECTED_APN,'fingerprint_sha256':parcel['fingerprint_sha256']},
  {'hop':'PARCEL_TO_RECORDED_LOT','entity':'PM 17383 Parcel 1','fingerprint_sha256':legal['fingerprint_sha256']},
  {'hop':'RECORDED_MAP_TO_LINE_ROLES','state':'SINGLE_FRONTAGE_INTERIOR_NON_CORNER','artifact_sha256':next(x['artifact_sha256'] for x in legal['recorded_map_artifacts'] if x['sheet']==2)},
  {'hop':'LINE_ROLES_TO_STREET_ADJACENCY','front':'EAST_27TH_STREET','north':'INTERIOR_SIDE','south':'INTERIOR_SIDE','west':'REAR'},
  {'hop':'CODE_TO_STREET_SIDE_DEFINITION','section':'113.0246(d)','source_sha256':authority['measurement_source']['sha256']},
  {'hop':'CODE_TO_UNUSUAL_CONDITIONS','sections':['113.0246(b)','113.0246(e)(2)','113.0246(f)'],'pages_sha256':authority['measurement_pages_sha256']},
  {'hop':'TABLE_TO_RULE_AVAILABILITY','rule_id':rule['rule_id'],'source_sha256':rule['source_evidence']['source_sha256']},
  {'hop':'APPLICABILITY_GATE','state':evaluation['truth_state'],'numeric_comparison_performed':False},
 ])
 framework={'parcel_identity':evaluation['parcel_identity'],'legal_lot_state':evaluation['legal_lot'],'rule_family':'street_side_setback','rule_id':rule['rule_id'],'rule_source':{'source_section':rule['source_section'],'source_table':rule['source_table'],'source_page':rule['source_page'],'source_url':rule['source_url'],'source_sha256':rule['source_evidence']['source_sha256']},'measurement_doctrine':evaluation['applicability_doctrine'],'required_semantic_inputs':['resolved lot classification','resolved front/rear/side line roles','complete street adjacency','corner-lot status','double-fronted status','resubdivided-corner status'],'resolved_inputs':['parcel identity','legal lot','RS-1-7 rule availability','single street adjacency at east/front line','north and south interior-side roles','non-corner classification'],'measurement_result':None,'unit':'ft','applicable_requirement':None,'operator':None,'condition_state':'NOT_APPLICABLE','comparison_result':'NOT_APPLICABLE','bounded_conclusion':evaluation['bounded_conclusion'],'forbidden_conclusions':list(FORBIDDEN_CONCLUSIONS),'provenance':provenance['chain']}
 validate_contract(framework)
 product={'contract_version':CONTRACT_VERSION,'apn':EXPECTED_APN,'street_side_setback':{'state':'NOT_APPLICABLE','display':'Street-side setback: Not applicable to this parcel because no side property line adjoins a street.','rule_available_for_qualifying_parcels':True,'numeric_value_selected':False,'compliance_evaluated':False},'setback_family_summary':evaluation['setback_family_summary'],'ui_wired':False}
 contract={'contract_version':CONTRACT_VERSION,'scope':{'apns':[EXPECTED_APN],'rule_families':['street_side_setback_applicability']},'truth_states':['APPLICABLE','CONDITIONAL','NOT_APPLICABLE','RULE_EVALUATION_UNRESOLVED'],'not_applicable_semantics':'Affirmatively excluded by supported geometry and classification; never zero, false, unknown, waived, or compliant.','shared_framework':'dimensional-rule-evaluator-v0-2026-10-01-p37','forbidden_conclusions':list(FORBIDDEN_CONCLUSIONS)}
 decision={'contract_version':CONTRACT_VERSION,'decision':'STREET_SIDE_SETBACK_APPLICABILITY_V0_READY','applicability_result':'STREET_SIDE_SETBACK_NOT_APPLICABLE','truth_state':'NOT_APPLICABLE','numeric_comparison_performed':False,'next_feasibility_step':'parcel feasibility summary V0','development_capacity_calculated':False,'structure_compliance_evaluated':False,'overall_compliance_conclusion':False}
 outputs={'contract.json':contract,'evaluation.json':evaluation,'framework-contract.json':framework,'provenance.json':provenance,'product-example.json':product,'decision.json':decision}; outputs['integrity.json']=integrity_artifact(CONTRACT_VERSION,outputs); return outputs
def main()->None:
 outputs=build_outputs(); OUTPUT.mkdir(parents=True,exist_ok=True)
 for name,value in outputs.items():(OUTPUT/name).write_text(json.dumps(value,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
 print(f'wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}')
if __name__=='__main__':main()
