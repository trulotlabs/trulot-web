#!/usr/bin/env python3
from __future__ import annotations
import hashlib, importlib.util, json, subprocess, sys, tempfile, unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
DATA=ROOT/'data/coastal-context-v0'

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
resolver=module('coastal_resolver',HERE/'resolver.py')
builder=module('coastal_builder',HERE/'build.py')
def load(name):return json.loads((DATA/name).read_text())

class CoastalContextV0Tests(unittest.TestCase):
    def test_authoritative_source_receipt(self):
        s=load('source.json');a=s['acquisition']
        self.assertEqual(a['service_item_id'],'16524cd4e8394b338cfc5a028b2584f4')
        self.assertEqual(a['source_layer_id'],2);self.assertEqual(a['feature_count'],9)
        self.assertEqual(a['native_crs']['latest_wkid'],2230)
        self.assertEqual(a['source_reported']['update_cadence'],'NOT_PUBLISHED')
        self.assertEqual([x['map'] for x in s['legal_basis']['governing_maps']],['C-730.1','C-908','C-1028'])

    def test_normalization_and_geometry(self):
        inv=load('inventory.json');q=load('quarantine.json')
        self.assertEqual(inv['feature_count'],9);self.assertEqual(inv['geometry_states'],{'MAKE_VALID':1,'RAW_VALID':8})
        self.assertEqual(sum(inv['labels'].values()),9);self.assertEqual(q['count'],0)
        self.assertTrue(all(len(x['raw_geometry_sha256'])==64 and len(x['normalized_geometry_sha256'])==64 for x in inv['features']))

    def test_full_mapping_reconciles(self):
        r=load('mapping-report.json')
        self.assertEqual(r['city_parcels'],393733);self.assertEqual(r['unique_apns'],393733)
        self.assertEqual(r['duplicate_apns'],0);self.assertEqual(r['orphan_parcel_references'],0)
        self.assertEqual(r['states'],{'OUTSIDE_COASTAL':345748,'INSIDE_COASTAL':46455,'BOUNDARY_AMBIGUOUS':1530,'APPLICABILITY_UNRESOLVED':0,'SOURCE_UNAVAILABLE':0})

    def test_boundary_doctrine_does_not_use_centroid_or_majority(self):
        self.assertEqual(resolver.classify_areas(100,0),'OUTSIDE_COASTAL')
        self.assertEqual(resolver.classify_areas(100,100),'INSIDE_COASTAL')
        self.assertEqual(resolver.classify_areas(100,0.000002),'BOUNDARY_AMBIGUOUS')
        self.assertEqual(resolver.classify_areas(100,99.999998),'BOUNDARY_AMBIGUOUS')
        b=load('boundary-analysis.json');self.assertEqual(b['count'],1530)
        self.assertFalse(b['centroid_only_classification_used']);self.assertFalse(b['majority_area_classification_used'])
        self.assertEqual(b['representative_cases']['tiny_positive_area']['apn'],'3527702600')

    def test_explicit_truth_states_and_no_false_coercion(self):
        results=load('fixture-results.json')['results']
        by={x['result']['coastal_context']['evidence_state']:x['result']['coastal_context'] for x in results}
        self.assertEqual(by['OUTSIDE_COASTAL']['value'],'outside_coastal')
        self.assertEqual(by['INSIDE_COASTAL']['value'],'inside_coastal')
        self.assertIsNone(by['BOUNDARY_AMBIGUOUS']['value']);self.assertEqual(by['BOUNDARY_AMBIGUOUS']['state'],'partial')
        self.assertIsNone(by['SOURCE_UNAVAILABLE']['value']);self.assertEqual(by['SOURCE_UNAVAILABLE']['state'],'unavailable')
        self.assertNotIn(False,[x['result']['coastal_context']['value'] for x in results])

    def test_fixture_suite_and_lineage(self):
        f=load('fixtures.json');self.assertEqual(f['fixture_count'],30);self.assertEqual(len({x['apn'] for x in f['fixtures']}),30)
        tags={t for x in f['fixtures'] for t in x['coverage_tags']}
        required={'outside','inside','boundary_crossing','tiny_boundary_contact','multipolygon','split_zone','rs_parcel','rs_1_7','ambiguous_zoning','unmapped','missing_geometry','packet8_identity_exception'}
        # inside coverage is demonstrated by exact states, while the Packet 14 tag vocabulary did not name it.
        self.assertTrue(required-{'inside'} <= tags)
        results=load('fixture-results.json')['results']
        self.assertTrue(any(x['result']['coastal_context']['evidence_state']=='INSIDE_COASTAL' for x in results))
        for item in results:
            r=item['result'];self.assertEqual(r['coastal_context']['mapping_method'],resolver.MAPPING_METHOD)
            if r['coastal_context']['state'] in {'supported','partial'}:
                self.assertIsNotNone(r['parcel']['source_object_id']);self.assertIsNotNone(r['parcel']['geometry_sha256'])

    def test_packet13_bridge_fails_closed(self):
        bridge=load('rs-runtime-bridge.json')
        self.assertEqual(bridge['mapping']['OUTSIDE_COASTAL']['coastal_context'],'outside_coastal')
        self.assertEqual(bridge['mapping']['INSIDE_COASTAL']['standards_resolution'],'APPLICABILITY_UNRESOLVED')
        self.assertEqual(bridge['mapping']['BOUNDARY_AMBIGUOUS']['coastal_context'],'unknown')
        self.assertEqual(bridge['mapping']['SOURCE_UNAVAILABLE']['source_state'],'source_unavailable')
        self.assertEqual(bridge['examples']['outside_rs_1_7']['zone_code'],'RS-1-7');self.assertEqual(bridge['examples']['outside_rs_1_7']['zoning_state'],'SINGLE_ZONE')
        self.assertFalse(bridge['inside_coastal_rules_unlocked']);self.assertFalse(bridge['parcel_compliance_evaluated']);self.assertFalse(bridge['development_capacity_calculated'])
        packet13=module('packet13_resolver',ROOT/'scripts/parcel-rs-standards-runtime-v0/resolver.py')
        base=load_json(ROOT/'data/parcel-rs-standards-runtime-v0/fixtures.json')['cases'][0]['input']
        inside={**base,'coastal_context':'inside_coastal'};out=packet13.resolve(inside)
        self.assertEqual(out['standards']['resolution_state'],'APPLICABILITY_UNRESOLVED')
        outside={**base,'coastal_context':'outside_coastal'};out=packet13.resolve(outside)
        self.assertEqual(out['standards']['resolution_state'],'RESOLVED')
        unknown={**base,'coastal_context':'unknown'};out=packet13.resolve(unknown)
        self.assertEqual(out['standards']['resolution_state'],'APPLICABILITY_UNRESOLVED')

    def test_packet12_version_regression(self):
        v=load_json(ROOT/'data/rs-base-standards-v0/versions.json');profiles={x['coastal_context']:x for x in v['profiles']}
        self.assertEqual(profiles['outside']['state'],'SUPPORTED');self.assertEqual(profiles['inside']['state'],'APPLICABILITY_UNRESOLVED');self.assertEqual(profiles['unknown']['state'],'APPLICABILITY_UNRESOLVED')
        self.assertEqual(v['effective_dates'][1]['ordinance'],'O-21934');self.assertEqual(v['effective_dates'][2]['ordinance'],'O-22109')

    def test_packet9_mapping_compatibility(self):
        packet9=load_json(ROOT/'data/base-zoning-v2-lineage/mapping-analysis.json');coast=load('mapping-report.json')
        self.assertEqual(sum(packet9['canonicalStateCounts'].values()),coast['city_parcels'])
        self.assertEqual(packet9['duplicateMappingRows'],0);self.assertEqual(packet9['orphanParcelReferences'],0)

    def test_v1_comparison_is_bounded(self):
        v=load('v1-comparison.json');self.assertEqual(v['v2_matches'],576);self.assertEqual(sum(v['v2_state_counts'].values()),576)
        self.assertEqual(v['v1_coastal_signal'],'MISSING');self.assertFalse(v['v1_authority'])

    def test_fingerprints_are_sealed(self):
        f=load('fingerprints.json')
        self.assertEqual(f['normalized_coastal_source_sha256'],'b0ef9fd459e2acffe4aa1f7ae34df4c5ad40ce232a5002bc283a4f2fd6af1e88')
        self.assertEqual(f['quarantine_sha256'],'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945')
        self.assertEqual(f['parcel_coastal_mapping_sha256'],'f27abb9fe4b64990f9fe422102ce319144218be3770df471fa328cbbfbd403d6')
        self.assertEqual(f['state_distribution_sha256'],'85ac12ae5c1f8cd5a6b27dd2d41e12cfcbe7b9828d0fc1746a1265b064af3e80')

    def test_deterministic_rebuild(self):
        with tempfile.TemporaryDirectory() as td:
            out=Path(td);builder.build(DATA,out)
            for name in builder.GENERATED:self.assertEqual((DATA/name).read_bytes(),(out/name).read_bytes(),name)

    def test_decision_is_bounded(self):
        d=load('decision.json');self.assertEqual(d['decision'],'COASTAL_CONTEXT_V0_READY');self.assertTrue(d['packet13_feed_ready'])
        for key in ['inside_coastal_rs_supported','parcel_compliance_evaluated','development_capacity_calculated','runtime_production_wiring','parcel_v1_modified','production_access']:
            self.assertFalse(d[key],key)

def load_json(path):return json.loads(Path(path).read_text())
if __name__=='__main__':unittest.main(verbosity=2)
