#!/usr/bin/env python3
import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('resolver',ROOT/'scripts/parcel-v1-v2-exceptions/resolve.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)
REPORT=json.loads((ROOT/'data/parcel-v1-v2-identity-exceptions/report.json').read_text())
SCHEMA=json.loads((ROOT/'data/parcel-v1-v2-identity-exceptions/identity-exception.schema.json').read_text())
class ResolverTests(unittest.TestCase):
 def test_address_categories_are_bounded(self):
  self.assertEqual(M.address_difference('123 Main Street','123 MAIN ST'),'SUFFIX_STANDARDIZATION')
  self.assertEqual(M.address_difference('10 Mount Abbey Rd','10 MT ABBEY RD'),'STREET_NAME_ABBREVIATION')
  self.assertEqual(M.address_difference('14690 Via Fiesta Unit 1','14690 VIA FIESTA','01'),'UNIT_DISPLAY_OMISSION_CONFIRMED_BY_CURRENT_COMPONENT')
  self.assertEqual(M.address_difference('1023 Outer Rd Spc 51','1023 OUTER RD','51'),'UNIT_DISPLAY_OMISSION_CONFIRMED_BY_CURRENT_COMPONENT')
  self.assertEqual(M.address_difference('1605 Hotel Cir S # 111','1605 HOTEL CIR S','111'),'UNIT_DISPLAY_OMISSION_CONFIRMED_BY_CURRENT_COMPONENT')
  self.assertEqual(M.address_difference('1 Main St','2 MAIN ST'),'HOUSE_NUMBER_CHANGE')
  self.assertEqual(M.address_difference('1 Main St','1 Other St'),'STREET_NAME_CHANGE')
 def test_fallback_eligibility_rejects_placeholder_number(self):
  self.assertEqual(M.fallback_address_class('2751 Ocean Front Walk'),'ELIGIBLE_HISTORICAL_ADDRESS')
  self.assertEqual(M.fallback_address_class('0 Rockwood Rd'),'STREET_ONLY_ALIAS_NOT_PRESENTATION_ADDRESS')
  self.assertEqual(M.fallback_address_class('Rockwood Rd'),'INVALID_OR_UNPARSEABLE_HISTORICAL_ADDRESS')
  numbered_street={'situs_pre_dir':'','situs_street':'45 TH','situs_suffix':'ST','situs_post_dir':''}
  self.assertEqual(M.fallback_address_class('45 Th St',numbered_street),'STREET_ONLY_ALIAS_NOT_PRESENTATION_ADDRESS')
 def test_missing_cause_priority(self):
  row={'apnNorm':'1','situsComponents':{'situs_address':None,'situs_street':'MAIN'}}
  v2={'1':{'row':{'address':None}},'2':{'row':{'address':'2 MAIN ST'}}}
  self.assertEqual(M.missing_cause(row,['1','2'],v2),'STACK_SIBLING_HAS_CURRENT_ADDRESS')
  self.assertEqual(M.missing_cause(row,['1'],v2),'CURRENT_SOURCE_STREET_WITHOUT_NUMBER')
 def test_relationship_model_never_promotes_legal_inference(self):
  r=M.relationship_record(identifier='x',current_apn='0000000001',alternate_apn='0000000002',address=None,relationship='possible_replacement',reason='shared_id',confidence='medium',provenance='fixture',observed_at=None,geometry_status='current_available')
  self.assertFalse(r['legalRelationshipAsserted'])
  with self.assertRaises(ValueError):M.relationship_record(identifier='x',current_apn='0000000001',alternate_apn=None,address=None,relationship='possible_replacement',reason='shared_id',confidence='medium',provenance='fixture',observed_at=None,geometry_status='current_available')
 def test_full_corpus_accounting_evidence(self):
  self.assertEqual(sum(REPORT['quarantine']['counts'].values()),72)
  self.assertEqual(sum(REPORT['missingAddress']['causeCounts'].values()),10175)
  self.assertEqual(sum(REPORT['addressDifference']['counts'].values()),96745)
  self.assertEqual(REPORT['addressDifference']['trueConflictCount'],10166)
  self.assertEqual(sum(REPORT['parcelIdDifference']['counts'].values()),334)
  self.assertEqual(sum(REPORT['v1OnlyResolution']['counts'].values()),175)
  self.assertEqual(sum(REPORT['v2OnlyResolution']['counts'].values()),544)
  self.assertEqual(sum(REPORT['userVisibleImpact'].values()),393908)
  self.assertEqual(REPORT['centroid']['combinedHighRiskCount'],2)
 def test_conflict_sample_spans_every_conflict_type(self):
  sample=REPORT['addressDifference']['trueConflictSample'];self.assertEqual(len(sample),50)
  present={x['class'] for x in sample}
  expected=set(REPORT['addressDifference']['counts'])-M.SAFE_ADDRESS_CLASSES
  self.assertEqual(present,expected)
 def test_fixture_contract_matches_schema_enums_and_required_fields(self):
  required=set(SCHEMA['required']);props=SCHEMA['properties']
  for row in REPORT['exceptionModel']['fixtures']:
   self.assertEqual(set(row),required)
   self.assertIn(row['relationshipType'],props['relationshipType']['enum'])
   self.assertIn(row['confidence'],props['confidence']['enum'])
   self.assertIn(row['geometryStatus'],props['geometryStatus']['enum'])
   self.assertFalse(row['legalRelationshipAsserted'])
   for key in ('currentApn','alternateApn'):
    if row[key] is not None:self.assertRegex(row[key],r'^\d{10}$')
if __name__=='__main__':unittest.main()
