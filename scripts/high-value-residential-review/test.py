#!/usr/bin/env python3
"""Offline source-boundary and semantic regression tests; no parcel calculations."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

import assemble
import consumer
import density_lot_area

PATHS = json.loads(Path(sys.argv.pop(1)).read_text())
BUNDLE = consumer.load()
ROWS = BUNDLE['proposed-safe-subset']['new_display_safe_records']


def row(zone, family):
    return next(r for r in ROWS if r['zone_code'] == zone and r['family'] == family)


def select(bundle=None, zone='RS-1-7', profile=None, paths=None, observation=None):
    return consumer.select(BUNDLE if bundle is None else bundle, zone=zone,
                           profile=consumer.PROFILE if profile is None else profile,
                           observation=BUNDLE['authority-observation'] if observation is None else observation,
                           source_paths=PATHS if paths is None else paths)


class ReviewTests(unittest.TestCase):
    def test_valid_source_bound_contract(self):
        self.assertEqual(consumer.validate(BUNDLE, PATHS), [])
        self.assertEqual(select()['state'], 'DISPLAY_SAFE_PARAMETER')

    def test_prior_97_unchanged_and_new_partition_exact(self):
        prior = consumer.prior.load()
        self.assertEqual(consumer.prior.validate(prior), [])
        old = {r['rule_id'] for r in prior['residential_standards_v2_integration_safe']}
        new = {r['rule_id'] for r in ROWS}
        self.assertEqual((len(old), len(new), len(old & new)), (97, 116, 0))
        ds = BUNDLE['decision']['candidate_decisions']
        self.assertEqual(len(ds), 317)
        self.assertEqual({d['rule_id'] for d in ds if d['decision'] == 'DISPLAY_SAFE_PARAMETER'}, new)
        self.assertEqual(sum(d['decision'] == 'REMAINS_EXCLUDED' for d in ds), 201)

    def test_deterministic_assembly(self):
        for name, artifact in assemble.assemble().items():
            self.assertEqual(BUNDLE[name], artifact, name)

    def test_no_digit_derived_density_or_fallback(self):
        for zone in ['RS-1-99', 'RM-9-7', 'RM-1-7', 'RS17', '', None, 'RM-1-1 ']:
            self.assertEqual(select(zone=zone)['records'], [])
        density = [r for r in ROWS if r['family'] == 'density']
        self.assertEqual(len(density), 33)
        self.assertEqual(row('RM-1-1', 'density')['expression']['denominator']['value'], 3000)
        self.assertEqual(row('RM-4-11', 'density')['expression']['denominator']['value'], 200)
        self.assertTrue(all(r['expression']['value'] == 1 for r in density if not r['zone_code'].startswith('RM-')))

    def test_density_formula_exact_semantics(self):
        r = row('RM-1-1', 'density')['expression']
        self.assertEqual(r['kind'], 'formula')
        self.assertEqual(r['denominator']['unit'], 'sq_ft_per_dwelling_unit')
        self.assertEqual(r['rounding']['upward_fraction_threshold'], 0.5)
        self.assertEqual(r['rounding']['times_permitted'], 1)
        self.assertFalse(r['multi_zone']['evaluated'])
        self.assertEqual(set(r['definition_excludes']), {'ADU', 'JADU', 'employee_housing'})

    def test_rm512_community_plan_and_guest_room_condition(self):
        r = row('RM-5-12', 'density')['expression']
        self.assertEqual(r['selection'], 'UNRESOLVED')
        a, b = r['alternatives']
        self.assertEqual(a['expression']['denominator']['value'], 1000)
        self.assertEqual(b['expression']['lot_area_denominator_sq_ft'], 1500)
        self.assertEqual(b['expression']['alternatives'], [{'dwelling_units': 1}, {'guest_rooms': 2}])
        self.assertEqual(len(b['when']['in']), 3)
        self.assertFalse(b['expression']['use_selected'])

    def test_lot_area_not_legal_lot_or_density_test(self):
        r = row('RM-1-1', 'lot_area')
        self.assertEqual(r['expression']['value'], 6000)
        self.assertIn('Not a universal', r['expression']['semantics'])
        c = r['reviewed_proposal']['conditions'][0]
        self.assertEqual(c['reference'], '113.0237(a)-(c)')
        self.assertFalse(c['selected'])
        self.assertIn('below minimum', c['effect'])

    def test_alley_credit_caps_and_purpose(self):
        p = row('RX-1-1', 'lot_area')['reviewed_proposal']
        c = p['conditions'][-1]
        self.assertTrue(c['permission_not_automatic'])
        self.assertEqual(c['credit']['width_cap_ft'], 10)
        self.assertEqual(c['credit']['area_cap_fraction_of_minimum_requirement'], 0.10)
        self.assertIn('not a change to legal lot area', c['credit']['purpose'])

    def test_density_pre_dedication_dependency_preserved(self):
        for r in ROWS:
            if r['family'] == 'density':
                self.assertIn('REQUIRED_DEDICATION', [p['id'] for p in r['required_predicates']])
                c = next(c for c in r['reviewed_proposal']['conditions'] if 'pre-dedication' in c.get('reference', '') or 'opening density' in c.get('reference', ''))
                self.assertIn('prior to required', c['effect'])
                self.assertFalse(c['selected'])

    def test_setback_conditions_are_not_flattened(self):
        front = row('RS-1-7', 'front_setback')['expression']['domain_expression']
        self.assertEqual(front['base']['value'], 15)
        self.assertEqual([c['modality'] for c in front['clauses']], ['MAY', 'MAY'])
        self.assertIsNone(front['selection']['combined_permission_result'])
        side = row('RS-1-7', 'interior_side_setback')['expression']['domain_expression']
        self.assertEqual(side['base']['value'], 4)
        self.assertEqual(side['clauses'][0]['when']['lt'], 50)
        self.assertIsNone(side['clauses'][0]['minimum_floor'])
        self.assertEqual(side['clauses'][0]['required_dimension']['operands'][0]['value'], 0.08)
        self.assertEqual(side['clauses'][1]['modality'], 'MAY')
        self.assertIn('fire_official_defensible_space_buffer', [p['id'] for p in row('RS-1-7', 'front_setback')['required_predicates']])

    def test_height_pair_and_angle_boundaries_remain_conditional(self):
        h = row('RS-1-7', 'height')['expression']['domain_expression']
        self.assertEqual(h['base_zone_maximum_structure_height_ft'], 30)
        self.assertEqual(h['angled_envelope_origin_at_applicable_setback_ft'], 24)
        self.assertEqual(h['planes']['angle_reference'], 'vertical_axis_inward')
        a = h['planes']['lot_width_alternatives']
        self.assertEqual(a[1]['when'], {'input': 'MEASURED_RESIDENTIAL_LOT_WIDTH_FT', 'operator': 'BETWEEN_INCLUSIVE', 'min': 75, 'max': 150})
        self.assertIsNone(h['selected_alternative'])
        self.assertFalse(h['measurement']['evaluated'])

    def test_coverage_strict_threshold_and_definition(self):
        c = row('RS-1-7', 'lot_coverage')['expression']['domain_expression']
        self.assertEqual(c['when']['operator'], 'GT')
        self.assertEqual(c['when']['value'], 0.5)
        self.assertEqual(c['then']['value'], 50)
        self.assertTrue(c['else']['not_equivalent_to_unrestricted'])
        self.assertEqual(len(c['steep_hillsides_definition']['any_of']), 2)
        self.assertTrue(all(len(x['all_of']) == 2 for x in c['steep_hillsides_definition']['any_of']))

    def test_far_defects_not_corrected_or_promoted(self):
        far = [r for r in ROWS if r['family'] == 'far']
        self.assertEqual({r['zone_code'] for r in far}, {'RS-1-1', *[f'RS-1-{n}' for n in range(8, 15)]})
        for zone in [f'RS-1-{n}' for n in range(2, 8)]:
            d = next(d for d in BUNDLE['decision']['candidate_decisions'] if d['zone_code'] == zone and d['family'] == 'far')
            self.assertEqual(d['decision'], 'REMAINS_EXCLUDED')
            self.assertIn('INTERVAL', d['reason_code'])
        self.assertFalse(BUNDLE['height-far-coverage-proposals']['source_correction_found'])

    def test_unreviewed_correction_cannot_self_authorize(self):
        b = copy.deepcopy(BUNDLE)
        b['height-far-coverage-proposals']['source_correction_found'] = True
        b['decision']['approved_new_rule_ids'].append('sd-residential-2026-09-24-research-v1:RS-1-7:35:5')
        self.assertEqual(select(bundle=b)['state'], 'INVALIDATED')

    def test_coastal_and_version_fail_closed(self):
        for field, values in {'coastal_context': ['inside', 'unknown', None], 'as_of': ['2026-09-23', '2026-09-25'],
                              'application_context': ['unknown', 'grandfathered'], 'airport_context': ['unknown', 'miramar_transition'],
                              'scope': ['ALL_STANDARDS']}.items():
            for value in values:
                profile = {**consumer.PROFILE, field: value}
                self.assertEqual(select(profile=profile)['records'], [])
        obs = copy.deepcopy(BUNDLE['authority-observation'])
        obs['authority_inventory_reviewed_as_of'] = '2026-09-25'
        self.assertEqual(select(observation=obs)['state'], 'INVALIDATED')

    def test_display_safe_never_implies_application_safe(self):
        result = select()
        self.assertFalse(result['parcel_application_safe'])
        self.assertFalse(result['compliance_determined'])
        self.assertFalse(result['capacity_determined'])
        for r in ROWS:
            self.assertFalse(r['parcel_application_safe'])
            self.assertTrue(all(p['state'] == 'UNRESOLVED' and p['value'] is None for p in r['required_predicates']))
        b = copy.deepcopy(BUNDLE)
        b['proposed-safe-subset']['new_display_safe_records'][0]['parcel_application_safe'] = True
        self.assertEqual(select(bundle=b)['state'], 'INVALIDATED')

    def test_missing_or_changed_source_bytes_invalidate(self):
        paths = {**PATHS, 'residential': '/does/not/exist'}
        self.assertEqual(select(paths=paths)['state'], 'INVALIDATED')
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / 'altered-public-source.pdf'
            bad.write_bytes(Path(PATHS['residential']).read_bytes() + b'\nchanged')
            self.assertEqual(select(paths={**PATHS, 'residential': str(bad)})['state'], 'INVALIDATED')

    def test_excluded_record_injection_and_lost_qualifier_fail(self):
        b = copy.deepcopy(BUNDLE)
        r = copy.deepcopy(row('RS-1-7', 'front_setback'))
        r['rule_id'] = 'sd-residential-2026-09-24-research-v1:RS-1-7:34:15'
        b['proposed-safe-subset']['new_display_safe_records'].append(r)
        self.assertEqual(select(bundle=b)['state'], 'INVALIDATED')
        for key in ['qualifier', 'required_predicates', 'footnote_ids', 'authority_evidence', 'scope_details']:
            b = copy.deepcopy(BUNDLE)
            del b['proposed-safe-subset']['new_display_safe_records'][0][key]
            self.assertEqual(select(bundle=b)['state'], 'INVALIDATED')

    def test_missing_or_truncated_seal_fails(self):
        seal = json.loads((consumer.DATA / 'integrity.json').read_text())
        self.assertEqual(consumer.seal_errors(seal, BUNDLE), [])
        for name in consumer.SEALED_ARTIFACTS:
            s = copy.deepcopy(seal)
            del s['artifacts'][name]
            self.assertEqual(consumer.seal_errors(s, BUNDLE), ['INCOMPLETE_REVIEW_SEAL'])

    def test_rs17_exact_closure_reproducible(self):
        result = select()
        self.assertEqual(result, select())
        self.assertEqual({r['family'] for r in result['records']},
                         {'density', 'lot_area', 'front_setback', 'interior_side_setback', 'height', 'lot_coverage'})
        excluded = [r['family'] for r in BUNDLE['decision']['rs17_closure'] if r['decision'] == 'REMAINS_EXCLUDED']
        self.assertEqual(set(excluded), {'street_side_setback', 'rear_setback', 'far'})

    def test_lossless_contract_retains_all_expression_shapes(self):
        result = select()
        self.assertEqual(json.loads(consumer.export_contract(result)), result)
        # Range and reference carriers are proved without adding synthetic standards.
        for kind in consumer.EXPRESSION_KINDS:
            fixture = {'state': 'DISPLAY_SAFE_PARAMETER', 'records': [{'expression': {'kind': kind, 'unresolved_inputs': ['TEST_ONLY']}}]}
            self.assertEqual(json.loads(consumer.export_contract(fixture)), fixture)


if __name__ == '__main__':
    unittest.main(verbosity=2)
