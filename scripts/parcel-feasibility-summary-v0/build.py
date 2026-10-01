#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from resolver import CONTRACT_VERSION,EXPECTED_APN,FORBIDDEN_CONCLUSIONS,compose_summary,integrity_artifact,provenance_graph
ROOT=Path(__file__).resolve().parents[2];OUTPUT=ROOT/'data'/'parcel-feasibility-summary-v0'
def _json(p:str)->Any:return json.loads((ROOT/p).read_text())
def _inputs()->dict[str,Any]:
 parcels=_json('data/parcel-intelligence-v2/fixture-results.json')['results'];parcel=next(x['result'] for x in parcels if x['result'].get('identity',{}).get('apn')==EXPECTED_APN)
 legal=next(x for x in _json('data/legal-lot-evidence-v0/fixture-results.json')['results'] if x.get('apn')==EXPECTED_APN)
 return {'parcel':parcel,'legal_lot':legal,'minimum_lot_area':_json('data/minimum-lot-area-evaluation-v0/evaluation.json'),'minimum_lot_depth':_json('data/minimum-lot-depth-evaluation-v0/evaluation.json'),'minimum_lot_width':_json('data/minimum-lot-width-evaluation-v0/evaluation.json'),'minimum_frontage':_json('data/minimum-frontage-evaluation-v0/evaluation.json'),'front_setback':_json('data/front-setback-evaluator-v0/evaluation.json'),'rear_setback':_json('data/rear-setback-evaluator-v0/evaluation.json'),'interior_side_setback':_json('data/interior-side-setback-evaluator-v0/evaluation.json'),'street_side_setback':_json('data/street-side-setback-applicability-v0/evaluation.json')}
def build_outputs()->dict[str,object]:
 inputs=_inputs();summary=compose_summary(inputs)
 provenance=provenance_graph(CONTRACT_VERSION,[
  {'hop':'APN_TO_PARCEL_INTELLIGENCE','apn':EXPECTED_APN,'fingerprint_sha256':inputs['parcel']['fingerprint_sha256']},
  {'hop':'PARCEL_TO_LEGAL_LOT','state':'LEGAL_LOT_ESTABLISHED','fingerprint_sha256':inputs['legal_lot']['fingerprint_sha256']},
  *[{'hop':'SEALED_RULE_TO_SUMMARY_CLASS','rule_family':item['rule_family'],'summary_class':'SATISFIED','contract_version':item['origin']['contract_version'],'evaluation_fingerprint_sha256':item['origin']['evaluation_fingerprint_sha256']} for item in summary['rule_results']['satisfied']],
  *[{'hop':'SEALED_RULE_TO_SUMMARY_CLASS','rule_family':item['rule_family'],'summary_class':'CONDITIONAL','contract_version':item['origin']['contract_version'],'evaluation_fingerprint_sha256':item['origin']['evaluation_fingerprint_sha256']} for item in summary['rule_results']['conditional']],
  *[{'hop':'SEALED_RULE_TO_SUMMARY_CLASS','rule_family':item['rule_family'],'summary_class':'NOT_APPLICABLE','contract_version':item['origin']['contract_version'],'evaluation_fingerprint_sha256':item['origin']['evaluation_fingerprint_sha256']} for item in summary['rule_results']['not_applicable']],
  {'hop':'RULE_CLASSES_TO_PARTIAL_SUMMARY','state':summary['state'],'summary_fingerprint_sha256':summary['fingerprint_sha256']},
 ])
 contract={'schema':'ParcelFeasibilitySummaryV0','contract_version':CONTRACT_VERSION,'scope':{'apns':[EXPECTED_APN],'composition_only':True},'result_classes':['SATISFIED','NOT_SATISFIED','CONDITIONAL','NOT_APPLICABLE','NOT_EVALUATED'],'top_level_states':['PARTIAL_BASE_RULE_FEASIBILITY_ESTABLISHED','SUMMARY_COMPOSITION_SOURCE_MISMATCH'],'required_fields':['parcel_identity','legal_lot','zoning','rule_results','unresolved_evidence','forbidden_aggregation','next_investigation_order','provenance','fingerprint_sha256'],'forbidden_conclusions':FORBIDDEN_CONCLUSIONS}
 product={'contract_version':CONTRACT_VERSION,'apn':EXPECTED_APN,'state':summary['state'],'summary':summary['human_summary'],'what_trulot_knows':summary['what_trulot_knows'],'what_remains_unresolved':summary['unresolved_evidence'],'level_1':summary['product_bridge'],'level_2':summary['expert_detail_bridge'],'capacity':'Not evaluated.','ui_wired':False}
 decision={'contract_version':CONTRACT_VERSION,'decision':'PARCEL_FEASIBILITY_SUMMARY_V0_READY','state':summary['state'],'next_feasibility_source_target':'current structure geometry','summary_fingerprint_sha256':summary['fingerprint_sha256'],'capacity_calculated':False,'overall_compliance_conclusion':False,'new_rule_family_evaluated':False}
 outputs={'contract.json':contract,'summary.json':summary,'provenance.json':provenance,'product-example.json':product,'decision.json':decision};outputs['integrity.json']=integrity_artifact(CONTRACT_VERSION,outputs);return outputs
def main()->None:
 outputs=build_outputs();OUTPUT.mkdir(parents=True,exist_ok=True)
 for n,v in outputs.items():(OUTPUT/n).write_text(json.dumps(v,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
 print(f'wrote {len(outputs)} artifacts to {OUTPUT.relative_to(ROOT)}')
if __name__=='__main__':main()
