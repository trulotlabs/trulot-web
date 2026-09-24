#!/usr/bin/env python3
"""Offline golden and adversarial tests; no credentials, network or database."""
import copy
import json
import unittest
from pathlib import Path
from resolver import load, validate, resolve, check_source_version

B = load()
V = B['versions']['rule_set_version']


def rule(zone, standard, bundle=B):
    return next(r for r in bundle['rules'] if r['zone_code'] == zone and r['standard_type'] == standard)


def query(zones=None, bundle=None, **kw):
    b = B if bundle is None else bundle
    args = {'as_of': '2026-09-24', 'coastal_context': 'outside', 'rule_set_version': V,
            'observation': b['source-version-observation'], 'application_context': 'new_application',
            'airport_context': 'outside_miramar_transition'}
    args.update(kw)
    return resolve(b, zones or ['RS-1-7'], **args)


class Standards(unittest.TestCase):
    def test_full_corpus_valid(self): self.assertEqual(validate(B), [])

    def test_declared_schema_fields_present(self):
        required = set(B['rule-schema']['items']['required'])
        self.assertTrue(all(required.issubset(r) for r in B['rules']))

    def test_exact_inventory(self):
        inv = B['zone-inventory']
        self.assertEqual(inv['raw_code_count'], 183)
        self.assertEqual(len(inv['observed_residential_codes']), 31)
        self.assertEqual(len(inv['codified_residential_codes']), 33)
        self.assertEqual(next(x for x in inv['codes'] if x['raw_zone_code'] == 'UNZONED')['family'], 'UNKNOWN')
        self.assertNotIn('RMX-1', inv['codified_residential_codes'])

    def test_golden_numbers_units_pages(self):
        for z, s, n, u, p in B['fixtures']['numeric']:
            with self.subTest(zone=z, standard=s):
                r = rule(z, s)
                self.assertEqual((r['value'], r['unit'], r['source_page']), ({'kind': 'number', 'number': n}, u, p))

    def test_compounds_remain_unevaluated(self):
        for z, s, text in B['fixtures']['expressions']:
            r = rule(z, s)
            self.assertEqual(r['value']['kind'], 'source_expression')
            self.assertEqual(r['value']['text'], text)
            self.assertFalse(r['value']['evaluated'])

    def test_far_conditions(self):
        self.assertIn('3 to 7 dwelling units', rule('RM-1-1', 'far_3_7_dwellings')['conditions'])
        self.assertIn('131-04G:39', rule('RM-1-1', 'far_3_7_dwellings')['exceptions'])
        self.assertEqual(rule('RS-1-7', 'floor_area_ratio_max')['value']['kind'], 'reference')

    def test_rs_height_is_not_flat_30(self):
        self.assertNotIn('number', rule('RS-1-7', 'structure_height_max')['value'])
        self.assertIn('131.0444', rule('RS-1-7', 'structure_height_max')['unresolved_dependencies'])

    def test_absence_is_not_zero(self):
        r = rule('RM-4-11', 'structure_height_max')
        self.assertEqual(r['value']['kind'], 'not_specified_in_table')
        self.assertIsNone(r['value']['number'])
        self.assertIn('131-04G:37', r['exceptions'])

    def test_footnote_geography(self):
        z, s, note = B['fixtures']['footnote_case']
        self.assertIn(note, rule(z, s)['exceptions'])
        self.assertIn('1,500', B['footnotes'][note]['text'])
        self.assertIn('La Jolla', B['footnotes'][note]['text'])

    def test_missing_source_footnote_quarantined(self):
        affected = [r for r in B['rules'] if '131-04D:8' in r['exceptions']]
        self.assertEqual(len(affected), 7)
        self.assertTrue(all(r['review_state'] == 'INTERPRETATION_REQUIRED' for r in affected))

    def test_whole_sections_retained(self):
        r = rule('RS-1-7', 'front_setback')
        self.assertIn('131.0443', r['unresolved_dependencies'])
        self.assertIn('Fire Code Official', '\n'.join(B['dependencies']['131.0443']['text_lines']))
        self.assertIn('131.0442', rule('RX-1-2', 'lot_width_min')['unresolved_dependencies'])

    def test_chapter_reference_preserved(self):
        rows = [r for r in B['rules'] if 'dwelling_unit_protection' in r['standard_type']]
        self.assertEqual(len(rows), 33)
        self.assertTrue(all('Chapter 14, Article 3, Division 12' in r['value']['targets'] for r in rows))

    def test_unknown_zone_and_no_prefix_fallback(self):
        for z in B['fixtures']['unknown']:
            self.assertEqual(query([z])['zones'][0]['state'], 'UNSUPPORTED_ZONE')

    def test_split_separate(self):
        result = query(B['fixtures']['split'])['zones']
        self.assertEqual([r['zone_code'] for r in result], B['fixtures']['split'])
        self.assertTrue(all(all(r['zone_code'] == z['zone_code'] for r in z['rules']) for z in result))

    def test_outside_snapshot(self): self.assertEqual(query()['state'], 'SEPARATE_ZONE_RESULTS')
    def test_inside_refused(self): self.assertEqual(query(coastal_context='inside')['state'], 'APPLICABILITY_UNRESOLVED')
    def test_unknown_coastal_refused(self): self.assertEqual(query(coastal_context='unknown')['state'], 'APPLICABILITY_UNRESOLVED')
    def test_old_version_refused(self): self.assertEqual(query(rule_set_version='2024')['state'], 'UNKNOWN_RULE_SET')
    def test_historical_date_not_guessed(self): self.assertEqual(query(as_of='2025-01-01')['state'], 'APPLICABILITY_UNRESOLVED')
    def test_future_date_stale(self): self.assertEqual(query(as_of='2026-09-25')['state'], 'APPLICABILITY_UNRESOLVED')
    def test_invalid_date(self): self.assertEqual(query(as_of='2026-99-01')['state'], 'INVALID_DATE')
    def test_grandfathering_not_guessed(self): self.assertEqual(query(application_context='unknown')['state'], 'PROJECT_APPLICABILITY_UNRESOLVED')
    def test_airport_not_guessed(self): self.assertEqual(query(airport_context='unknown')['state'], 'PROJECT_APPLICABILITY_UNRESOLVED')

    def test_version_sources(self):
        o = {o['ordinance']: o for o in B['versions']['ordinances']}
        self.assertEqual(o['O-21836']['coastal_effective_date'], '2026-09-10')
        self.assertIsNone(o['O-21934']['coastal_effective_date'])
        self.assertEqual(o['O-22109']['coastal_state'], 'PENDING_COASTAL_CERTIFICATION')
        self.assertNotIn('131.0431', o['O-22109']['sections'])
        self.assertNotIn('131-04D:7', rule('RS-1-2', 'lot_area_min')['exceptions'])

    def test_drift_hash_dates_ordinance_coastal(self):
        for change in ['hash', 'date', 'ordinance', 'coastal']:
            o = copy.deepcopy(B['source-version-observation'])
            if change == 'hash': o['sources']['residential']['sha256'] = '0' * 64
            elif change == 'date': o['ordinances'][0]['outside_effective_date'] = '2024-01-01'
            elif change == 'ordinance': o['ordinances'][0]['ordinance'] = 'O-99999'
            else: o['ordinances'][2]['coastal_state'] = 'EFFECTIVE_IN_COASTAL'
            self.assertTrue(check_source_version(B, o))

    def test_adversarial_rule_mutations(self):
        mutations = {
            'section': lambda r: r.update(source_section=''),
            'number': lambda r: r['value'].update(number=7000),
            'nonfinite': lambda r: r['value'].update(number=float('nan')),
            'unit': lambda r: r.update(unit='acres'),
            'row': lambda r: r['source_evidence'].update(row=999),
            'zone': lambda r: r.update(zone_code='RS-1-1'),
            'source': lambda r: r.update(source_id='invented'),
            'review': lambda r: r.update(review_state='REVIEWED'),
            'promotion': lambda r: r.update(review_state='SOURCE_VERIFIED'),
            'applicability': lambda r: r.update(applicability={'version_profile': 'inside'}),
            'evidence': lambda r: r.pop('source_evidence'),
            'kind': lambda r: r.update(value={'kind': 'source_expression', 'text': '5,000', 'evaluated': False}),
        }
        for name, mutation in mutations.items():
            with self.subTest(mutation=name):
                b = copy.deepcopy(B)
                b.pop('review', None)
                mutation(rule('RS-1-7', 'lot_area_min', b))
                self.assertTrue(validate(b))

    def test_missing_conditions_or_notes(self):
        for field in ['conditions', 'exceptions', 'unresolved_dependencies']:
            b = copy.deepcopy(B)
            rule('RM-1-1', 'far_3_7_dwellings', b)[field] = []
            self.assertTrue(validate(b))

    def test_conflicting_versions(self):
        b = copy.deepcopy(B)
        b['rules'].append(copy.deepcopy(b['rules'][0]))
        self.assertEqual(query(bundle=b)['state'], 'INVALID_OR_DRIFTED')

    def test_overlapping_applicability(self):
        b = copy.deepcopy(B)
        b['versions']['profiles'].append(copy.deepcopy(b['versions']['profiles'][0]))
        self.assertEqual(query(bundle=b)['state'], 'INVALID_OR_DRIFTED')

    def test_coastal_profile_tampering(self):
        b = copy.deepcopy(B)
        b['versions']['profiles'][0]['coastal_context'] = 'inside'
        self.assertEqual(query(bundle=b, coastal_context='inside')['state'], 'INVALID_OR_DRIFTED')

    def test_source_registry_tampering(self):
        b = copy.deepcopy(B)
        b['sources']['sources']['residential']['sha256'] = '0' * 64
        self.assertTrue(validate(b))

    def test_supplemental_and_dependency_tampering(self):
        b = copy.deepcopy(B)
        b['supplemental-tables']['131-04J']['rows'][1][1] = '99'
        self.assertEqual(query(bundle=b)['state'], 'INVALID_OR_DRIFTED')
        b = copy.deepcopy(B)
        b['dependencies']['131.0443']['text_lines'] = ['invented law']
        self.assertEqual(query(bundle=b)['state'], 'INVALID_OR_DRIFTED')

    def test_angle_axis_and_ambiguous_intervals(self):
        self.assertEqual(B['supplemental-tables']['131-04H']['exceptions'], ['131-04H:1'])
        self.assertIn('vertical axis inward', B['footnotes']['131-04H:1']['text'])
        for name in ['131-04I', '131-04J', '131-04K']:
            self.assertEqual(B['supplemental-tables'][name]['review_state'], 'INTERPRETATION_REQUIRED')
            self.assertFalse(B['supplemental-tables'][name]['evaluated'])

    def test_no_capacity_api(self):
        with self.assertRaises(TypeError): query(lot_area_sqft=5000)
        text = json.dumps(query())
        for forbidden in ['baselineUnits', 'max_buildable_units', 'adu_capacity', 'buildable_units']:
            self.assertNotIn(forbidden, text)

    def test_no_digit_density_in_resolver(self):
        text = (Path(__file__).parent / 'resolver.py').read_text()
        self.assertNotIn('math.floor', text)
        self.assertNotIn('zone_code.split', text)
        self.assertEqual(rule('RS-1-7', 'density_basis')['unit'], 'dwelling_unit_per_lot')
        self.assertEqual(rule('RM-1-1', 'density_basis')['value']['number'], 3000)


if __name__ == '__main__': unittest.main(verbosity=2)
