#!/usr/bin/env python3
import copy
import gzip
import hashlib
import json
import unittest
from pathlib import Path

from build import (CURRENT_CODE_SHA, FOOTNOTES, OUT, P79, REQUIRED_FAMILIES,
                   TARGETS, build, validate_selection_record)

ROOT = Path('/Users/ops/trulot-web-parcel')
EXPECTED_POPULATIONS = {
    'RM-1-1': (49370, 33237, 15729, 338, 7811, 41536, 23),
    'RM-3-7': (21629, 12795, 8664, 70, 2069, 19105, 455),
    'RM-3-9': (9255, 4805, 4428, 4, 493, 8761, 1),
    'RM-1-3': (5179, 2889, 2203, 87, 0, 5179, 0),
    'RM-4-10': (3799, 1046, 2660, 78, 117, 3682, 0),
}

class Packet80Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build()
        cls.profiles = {p['zone_code']: p for p in cls.out['rule-profiles.json']['profiles']}
        cls.footnotes = cls.out['footnotes.json']['footnotes']

    def test_01_packet79_integrity(self):
        r = json.loads((P79/'receipt.json').read_text())
        self.assertEqual(r['rows'],393733); self.assertEqual(r['distinct_apns'],393733)
        self.assertEqual(r['apn_fingerprint'],'93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25')
        self.assertEqual(r['zoning_state_counts'],{'BOUNDARY_SLIVER':1097,'INDETERMINATE':1641,'MULTI_ZONE':73064,'SINGLE_ZONE':317604,'UNMAPPED':327})
        self.assertEqual(r['coastal_state_counts'],{'BOUNDARY_AMBIGUOUS':1530,'INSIDE_COASTAL':46455,'OUTSIDE_COASTAL':345748})
        self.assertEqual(hashlib.sha256((P79/'parcel-zoning-selection.ndjson.gz').read_bytes()).hexdigest(),r['outputs']['parcel-zoning-selection.ndjson.gz']['sha256'])

    def test_02_five_profiles_reuse_generic_schema(self):
        self.assertEqual(tuple(self.out['rule-profiles.json']['selected_zones']),TARGETS)
        self.assertEqual(set(self.profiles),set(TARGETS))
        self.assertEqual({p['family_schema'] for p in self.profiles.values()},{'RM_TABLE_131_04G_GENERIC_V1'})
        self.assertFalse(self.out['family-schema.json']['bespoke_zone_evaluators'])

    def test_03_dual_coastal_versions_and_sources(self):
        for p in self.profiles.values():
            self.assertEqual({c['coastal_context'] for c in p['contexts']},{'OUTSIDE_COASTAL','INSIDE_COASTAL'})
            versions={c['coastal_context']:c for c in p['contexts']}
            self.assertIn('O-22109',versions['OUTSIDE_COASTAL']['ordinance_components'])
            self.assertNotIn('O-22109',versions['INSIDE_COASTAL']['ordinance_components'])
            self.assertEqual(versions['INSIDE_COASTAL']['fire_buffer_interface'],'O22109_PENDING_NOT_APPLIED')
            for c in p['contexts']:
                self.assertEqual(len(c['source_fingerprint']),64)
                self.assertTrue(c['ordinance_components'])
        self.assertEqual(self.out['source-version-receipts.json']['sources']['CURRENT_DIVISION_4']['sha256'],CURRENT_CODE_SHA)

    def test_04_material_families_and_footnotes_complete(self):
        used=set()
        for p in self.profiles.values():
            for c in p['contexts']:
                families={r['rule_family'] for r in c['rules']}
                self.assertFalse(REQUIRED_FAMILIES-families)
                for r in c['rules']:
                    self.assertEqual(len(r['source_fingerprint']),64)
                    used.update(r['footnote_ids'])
        self.assertEqual(used,set(self.out['footnotes.json']['used_footnotes']))
        self.assertEqual(used,set(self.footnotes))
        self.assertEqual(self.out['footnotes.json']['material_footnote_completeness'],'COMPLETE_FOR_ALL_FIVE_TARGET_ROWS')

    def test_05_formula_and_rule_values(self):
        rows={z:{r['rule_family']:r for r in self.profiles[z]['contexts'][0]['rules']} for z in TARGETS}
        self.assertEqual(rows['RM-1-1']['DENSITY']['value']['value'],3000)
        self.assertEqual(rows['RM-3-9']['STRUCTURE_HEIGHT_MAXIMUM']['value']['value'],60)
        self.assertEqual(rows['RM-4-10']['STRUCTURE_HEIGHT_MAXIMUM']['representation'],'CONDITIONAL')
        self.assertEqual(rows['RM-4-10']['LOT_COVERAGE_MAXIMUM']['representation'],'NOT_SPECIFIED')
        self.assertIn('RM4_SETBACK',self.out['family-schema.json']['formula_families'])
        self.assertFalse(self.out['family-schema.json']['capacity_calculation'])

    def test_06_exact_populations(self):
        pops=self.out['target-populations.json']['zones']
        for z, expected in EXPECTED_POPULATIONS.items():
            p=pops[z]
            actual=(p['unique_apns'],p['single_zone'],p['multi_zone'],p['sliver'],p['inside_coastal'],p['outside_coastal'],p['boundary_ambiguous'])
            self.assertEqual(actual,expected,z)

    def test_07_selection_is_exact_and_fails_closed(self):
        counts={z:0 for z in TARGETS}; seen=set(); rows=[]
        with gzip.open(OUT/'apn-profile-selection.ndjson.gz','rt') as s:
            for line in s:
                r=json.loads(line); rows.append(r); counts[r['zone']]+=1; seen.add((r['apn'],r['zone']))
        self.assertEqual(len(rows),len(seen))
        self.assertEqual(counts,{z:EXPECTED_POPULATIONS[z][0] for z in TARGETS})
        self.assertTrue(all(not r['profile_ready'] for r in rows if r['zoning_state']=='MULTI_ZONE'))
        self.assertTrue(all(r['profile_version']=='UNRESOLVED_COASTAL_VERSION' for r in rows if r['coastal_context']=='BOUNDARY_AMBIGUOUS'))
        self.assertTrue(all(r['feasibility_result'] is None for r in rows))

    def test_08_golden_candidates_and_manual_verification(self):
        g=self.out['golden-candidates.json']['profiles']
        for z in TARGETS:
            self.assertEqual(len(g[z]['ordinary']),3)
            self.assertEqual(len(g[z]['edge']),3)
            if EXPECTED_POPULATIONS[z][4]>0: self.assertEqual(len(g[z]['inside_coastal']),3)
            else: self.assertEqual(len(g[z]['inside_coastal']),0)
        manual=self.out['manual-verification.json']['ordinary_candidate_per_target']
        self.assertEqual({x['zone'] for x in manual},set(TARGETS))
        self.assertTrue(all(x['modifier_state']=='UNRESOLVED_REVIEW_REQUIRED' for x in manual))

    def test_09_unique_coverage_and_overlap(self):
        c=self.out['coverage.json']
        self.assertEqual(c['residential_unique_apns'],326532)
        self.assertEqual(c['before_packet80_unique_apns'],234029)
        self.assertEqual(c['after_packet80_unique_apns'],c['before_packet80_unique_apns']+c['added_by_packet80_unique_apns'])
        self.assertEqual(c['profile_ready_unique_apns']+c['review_required_unique_apns']+c['unsupported_unique_apns'],326532)
        self.assertLess(c['target_unique_apns'],sum(EXPECTED_POPULATIONS[z][0] for z in TARGETS))
        self.assertIn('counted once',c['overlap_rule'])

    def test_10_v4_contract_and_regression_boundaries(self):
        compat=self.out['compatibility.json']
        needed={'rule_family','representation','operator','value','conditions','footnote_ids','unresolved_dependencies','source_fingerprint','public_evaluation_state'}
        self.assertEqual(set(compat['v4_rule_record_fields']),needed)
        self.assertEqual(set(compat['existing_benchmarks']),{'RM-2-5:5442140600','RS-1-7:6341302200'})
        self.assertFalse(compat['production']); self.assertFalse(compat['runtime_activation']); self.assertFalse(compat['capacity'])

    def test_11_negative_validation(self):
        with gzip.open(OUT/'apn-profile-selection.ndjson.gz','rt') as s: base=json.loads(next(s))
        cases=[]
        x=copy.deepcopy(base); x['zone']='RM-9-9'; cases.append(x)
        x=copy.deepcopy(base); x['coastal_context']='UNKNOWN'; cases.append(x)
        x=copy.deepcopy(base); x['source_fingerprints']={}; cases.append(x)
        x=copy.deepcopy(base); x['zoning_state']='MULTI_ZONE'; x['profile_ready']=True; cases.append(x)
        x=copy.deepcopy(base); x['modifier_review_state']='RESOLVED_UNCONDITIONAL'; cases.append(x)
        x=copy.deepcopy(base); x['profile_version']='DRAFT_FUTURE'; cases.append(x)
        for x in cases:
            with self.assertRaises(ValueError): validate_selection_record(x,self.profiles,self.footnotes)
        missing=dict(self.footnotes); missing.pop(next(iter(missing)))
        # Construct a direct missing-footnote case against a profile whose referenced note is removed.
        note=next(iter({f for c in self.profiles[base['zone']]['contexts'] for r in c['rules'] for f in r['footnote_ids']}))
        missing=dict(self.footnotes); missing.pop(note)
        with self.assertRaises(ValueError): validate_selection_record(base,self.profiles,missing)

    def test_12_deterministic_rebuild_and_integrity(self):
        first={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()}
        build(); second={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir()}
        self.assertEqual(first,second)
        integrity=self.out['integrity.json']
        for name, expected in integrity['files'].items():
            self.assertEqual(hashlib.sha256((OUT/name).read_bytes()).hexdigest(),expected)

    def test_13_remaining_opportunity_is_exact_unique_gain(self):
        ranked=self.out['remaining-opportunity.json']['ranked']
        self.assertTrue(ranked)
        self.assertEqual(ranked,sorted(ranked,key=lambda x:(-x['incremental_unique_apns'],x['zone'])))
        self.assertTrue(all(x['zone'] not in TARGETS for x in ranked))

    def test_14_sensitive_material_scan(self):
        forbidden=('postgresql://','SUPABASE_ACCESS_TOKEN','BEGIN PRIVATE KEY','Bearer ey')
        for p in OUT.iterdir():
            if p.suffix=='.gz': continue
            text=p.read_text(errors='ignore')
            self.assertFalse(any(x in text for x in forbidden),p.name)

    def test_15_ready_decision(self):
        d=self.out['decision.json']
        self.assertEqual(d['decision'],'SAN_DIEGO_RM_RULE_EXPANSION_WAVE1_READY')
        self.assertEqual(d['successful_profiles'],list(TARGETS)); self.assertEqual(d['failed_profiles'],[])
        self.assertFalse(d['production_access']); self.assertFalse(d['public_activation']); self.assertTrue(d['packet_11_frozen'])

if __name__=='__main__': unittest.main(verbosity=2)
