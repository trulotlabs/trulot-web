#!/usr/bin/env python3
"""Offline closure tests; explicit local public-source path manifest required."""
import copy
from collections import Counter
import json
from pathlib import Path
import sys
import tempfile
import unittest

import audit
import gate

PATHS = json.loads(Path(sys.argv.pop(1)).read_text())


class ClosureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = gate.load()
        cls.source = audit.Source(PATHS['residential'])
        cls.rules = json.loads((audit.BASE / 'rules.json').read_text())
        cls.tables = json.loads((audit.BASE / 'source-tables.json').read_text())

    def call(self, bundle=None, **changes):
        bundle = self.bundle if bundle is None else bundle
        args = dict(zone='RS-1-7', standard='lot_width_min', as_of='2026-09-24',
                    coastal_context='outside', application_context='new_application',
                    airport_context='outside_miramar_transition', scope='BASE_TABLE_PARAMETERS_ONLY',
                    observation=self.bundle['source-observation'], lot_context='non_corner', source_paths=PATHS)
        args.update(changes)
        return gate.select(bundle, **args)

    def test_seal_and_actual_public_artifacts(self):
        self.assertEqual([], gate.verify_source_files(self.bundle, PATHS))

    def test_all_814_independent_source_cells(self):
        for rule in self.rules:
            proof = audit.verify_cell(rule, self.tables, self.source)
            self.assertTrue(all(proof['checks'].values()), (rule['rule_id'], proof))

    def test_digit_reordering_is_not_character_bag_equality(self):
        r = copy.deepcopy(next(r for r in self.rules if r['zone_code'] == 'RS-1-7' and r['standard_type'] == 'lot_depth_min'))
        r['value']['number'] = 59
        self.assertFalse(audit.verify_cell(r, self.tables, self.source)['checks']['normalized_value'])

    def test_wrong_column_rejected(self):
        r = copy.deepcopy(next(r for r in self.rules if r['zone_code'] == 'RS-1-7'))
        r['source_evidence']['column'] -= 1
        self.assertFalse(audit.verify_cell(r, self.tables, self.source)['checks']['column_zone'])

    def test_wrong_unit_rejected(self):
        r = copy.deepcopy(next(r for r in self.rules if r['standard_type'] == 'lot_width_min'))
        r['unit'] = 'sq_ft'
        self.assertFalse(audit.verify_cell(r, self.tables, self.source)['checks']['unit_evidence'])

    def test_exact97_scope(self):
        safe = self.bundle['residential_standards_v2_integration_safe']
        self.assertEqual(97, len(safe))
        self.assertEqual(33, len({r['zone_code'] for r in safe}))
        self.assertEqual({'lot_width_min', 'corner_lot_width_min', 'lot_depth_min'}, {r['standard_type'] for r in safe})
        self.assertEqual(Counter({'RS':42, 'RX':4, 'RT':15, 'RM':36}), Counter(r['zone_code'][:2] for r in safe))

    def test_positive_parameter_not_project_decision(self):
        result = self.call()
        self.assertEqual('BASE_TABLE_PARAMETER', result['state'])
        self.assertEqual(50, result['rules'][0]['value'])
        self.assertIs(False, result['project_applicability_determined'])

    def test_corner_predicate(self):
        self.assertEqual('NOT_APPLICABLE', self.call(standard='corner_lot_width_min')['state'])
        self.assertEqual(55, self.call(standard='corner_lot_width_min', lot_context='corner')['rules'][0]['value'])
        self.assertEqual([], self.call(lot_context='unknown')['rules'])

    def test_coastal_and_unknown(self):
        for context in ['inside', 'unknown', None, 'OUTSIDE']:
            self.assertEqual('APPLICABILITY_UNRESOLVED', self.call(coastal_context=context)['state'])

    def test_no_project_scope(self):
        self.assertEqual([], self.call(scope='PROJECT_APPLICABLE')['rules'])

    def test_application_and_airport_unknown(self):
        self.assertEqual([], self.call(application_context='unknown')['rules'])
        self.assertEqual([], self.call(application_context='deemed_complete_before_effective')['rules'])
        self.assertEqual([], self.call(airport_context='unknown')['rules'])

    def test_no_zone_alias_or_union(self):
        for z in ['rs-1-7', 'RS-17', 'RS-1-7/RM-1-1', ['RS-1-7', 'RM-1-1']]:
            self.assertEqual([], self.call(zone=z)['rules'])

    def test_date_not_snapshot(self):
        for d in ['2026-09-23', '2026-09-25', None, 'bad']:
            self.assertEqual([], self.call(as_of=d)['rules'])

    def test_orphan_all7_excluded(self):
        rows = self.bundle['interpretation-review']['records']
        self.assertEqual(7, len(rows))
        safe = {r['rule_id'] for r in self.bundle['residential_standards_v2_integration_safe']}
        self.assertTrue(all(r['classification'] == 'REMAINS_INTERPRETIVE' and r['rule_id'] not in safe for r in rows))

    def test_interpretive_excluded(self):
        self.assertEqual([], self.call(standard='structure_height_max')['rules'])
        self.assertEqual([], self.call(standard='floor_area_ratio_max')['rules'])
        self.assertEqual([], self.call(zone='RX-1-2')['rules'])

    def test_changed_hash_metadata(self):
        obs = copy.deepcopy(self.bundle['source-observation'])
        obs['sources']['residential']['sha256'] = 'changed'
        self.assertEqual('INVALIDATED', self.call(observation=obs)['state'])

    def test_effective_metadata_changed(self):
        obs = copy.deepcopy(self.bundle['source-observation'])
        obs['effective_metadata'][0]['coastal_from'] = '2025-02-07'
        self.assertEqual('INVALIDATED', self.call(observation=obs)['state'])

    def test_coastal_certification_changed(self):
        obs = copy.deepcopy(self.bundle['source-observation'])
        obs['coastal_certification']['O22109'] = 'CERTIFIED'
        self.assertEqual('INVALIDATED', self.call(observation=obs)['state'])

    def test_sections_or_tables_disappeared(self):
        for key in ['required_sections', 'required_tables']:
            obs = copy.deepcopy(self.bundle['source-observation']); obs[key].pop()
            self.assertEqual('INVALIDATED', self.call(observation=obs)['state'])

    def test_conflicting_or_unreviewed_new_authority(self):
        for key in ['new_conflicting_authority', 'unreviewed_new_authority', 'unavailable_authority_sources']:
            obs = copy.deepcopy(self.bundle['source-observation']); obs[key] = ['new ordinance']
            self.assertEqual('INVALIDATED', self.call(observation=obs)['state'])

    def test_hash_only_observation_rejected(self):
        self.assertEqual('INVALIDATED', self.call(observation={'sources':self.bundle['source-observation']['sources']})['state'])

    def test_actual_source_file_drift_and_disappearance(self):
        paths = dict(PATHS)
        with tempfile.TemporaryDirectory() as tmp:
            changed = Path(tmp) / 'changed.pdf'; changed.write_bytes(b'changed source')
            paths['residential'] = str(changed)
            self.assertEqual('INVALIDATED', self.call(source_paths=paths)['state'])
            changed.unlink()
            self.assertEqual('INVALIDATED', self.call(source_paths=paths)['state'])
        self.assertEqual('INVALIDATED', self.call(source_paths=None)['state'])

    def test_unsafe_addition_or_corner_condition_deletion(self):
        for attack in ['add', 'corner']:
            b = copy.deepcopy(self.bundle)
            if attack == 'add':
                b['residential_standards_v2_integration_safe'].append(next(r for r in self.rules if r['zone_code']=='RX-1-2'))
            else:
                next(r for r in b['residential_standards_v2_integration_safe'] if r['standard_type']=='corner_lot_width_min')['conditions'] = []
            self.assertEqual('INVALIDATED', self.call(bundle=b)['state'])

    def test_dependency_deletion(self):
        b = copy.deepcopy(self.bundle); b['dimension-dependencies']['measurement_evidence'] = []
        self.assertEqual('INVALIDATED', self.call(bundle=b)['state'])

    def test_malformed_bundle_fails_closed_without_exception(self):
        b = copy.deepcopy(self.bundle); del b['source-observation']
        self.assertEqual('INVALIDATED', self.call(bundle=b)['state'])
        b = copy.deepcopy(self.bundle); b['source-observation']['sources'] = None
        self.assertEqual('INVALIDATED', self.call(bundle=b)['state'])

    def test_corrected_ordinance_not_flat_strikeout(self):
        corrections = self.bundle['authority-review']['corrections']
        self.assertEqual({'O21836-CORCOPY2','O21905-CORCOPY2','O22109-overlap'}, {r['id'] for r in corrections})
        b = copy.deepcopy(self.bundle); b['authority-review']['corrections'][0]['finding'] = 'Ignore corrected text'
        self.assertEqual('INVALIDATED', self.call(bundle=b)['state'])

    def test_half_open_version_boundaries(self):
        family = '1310431 base tables: amendments, not reconstructed historical rule data'
        before = gate.timeline_version(self.bundle, family, 'outside', '2024-10-04')
        after = gate.timeline_version(self.bundle, family, 'outside', '2024-10-05')
        self.assertIn('O21618', before['interval']['version'])
        self.assertIn('O21836', after['interval']['version'])
        self.assertEqual('2025-04-24', gate.timeline_version(self.bundle,family,'outside','2025-04-24')['interval']['from'])
        self.assertEqual('UNRESOLVED', gate.timeline_version(self.bundle,family,'unknown','2026-09-24')['state'])
        self.assertEqual('UNREVIEWED_DATE', gate.timeline_version(self.bundle,family,'outside','2026-09-25')['state'])

    def test_timeline_nonoverlap_and_pending(self):
        for family in self.bundle['timeline']['family_intervals']:
            for prev, current in zip(family['intervals'], family['intervals'][1:]):
                self.assertIsNotNone(prev['to'])
                self.assertLessEqual(prev['to'], current['from'])
        self.assertIsNone(self.bundle['timeline']['events'][-1]['coastal_from'])

    def test_rs17_replay_all24_and_subset3(self):
        rows = [r for r in self.rules if r['zone_code']=='RS-1-7']
        self.assertEqual(24,len(rows))
        for row in rows:
            self.assertTrue(all(audit.verify_cell(row,self.tables,self.source)['checks'].values()))
        for standard,value in [('lot_width_min',50),('corner_lot_width_min',55),('lot_depth_min',95)]:
            self.assertEqual(value,self.call(standard=standard,lot_context='corner')['rules'][0]['value'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
