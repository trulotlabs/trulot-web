"""Reviewed documentary expressions, not a density/capacity calculator.

Independent numeric vectors are an audit cross-check against source coordinates.
This module has no write, network, or execution-of-expression behavior.
"""
import copy

ZONES = ([f'RS-1-{n}' for n in range(1, 15)] + ['RX-1-1', 'RX-1-2'] +
         [f'RT-1-{n}' for n in range(1, 6)] +
         ['RM-1-1', 'RM-1-2', 'RM-1-3', 'RM-2-4', 'RM-2-5', 'RM-2-6',
          'RM-3-7', 'RM-3-8', 'RM-3-9', 'RM-4-10', 'RM-4-11', 'RM-5-12'])
AREA = ([40000, 20000, 15000, 10000, 8000, 6000, 5000] * 2 +
        [4000, 3000, 3500, 3000, 2500, 2200, 1600] + [6000] * 6 + [7000] * 5 + [10000])
DENSITY = [1] * 21 + [3000, 2500, 2000, 1750, 1500, 1250, 1000, 800, 600, 400, 200, 1000]

PREDICATES = {
    'LEGAL_LOT_STATUS': 'Legal lot criteria and documentary determination under §113.0237(a); never inferred from parcel size.',
    'LOT_AREA': 'Legally relevant lot/premises area, not supplied or measured here.',
    'MULTI_ZONE_PREMISES': 'Whether premises spans zones and the legally relevant area in each zone.',
    'DEVELOPMENT_USE_CLASS': 'Single/multiple dwelling development or visitor accommodation; no use authorization inferred.',
    'COMMUNITY_PLAN_AREA': 'Whether La Jolla, Pacific Beach or Torrey Pines footnote36 applies.',
    'ALLEY_SERVICE_AND_GEOMETRY': 'Whether served by an abutting alley, width and credit area; no geometry inferred.',
    'SUBDIVISION_OR_EXISTING_LOT': 'Proposed subdivision versus existing legal lot; no subdivision permission inferred.',
    'OTHER_REGULATORY_CONTROLS': 'Overlays, supplemental rules, permits, grandfathering, and special programs not determined.',
    'REQUIRED_DEDICATION': 'Whether street/alley dedication is required under142.0610 and verified pre-dedication regulatory lines; no line or area is inferred.',
}


def proposals(ledger):
    result = []
    for standard, vector in [('density_basis', DENSITY), ('lot_area_min', AREA)]:
        for zone, expected in zip(ZONES, vector, strict=True):
            matches = [r for r in ledger if r['zone_code'] == zone and r['standard_type'] == standard]
            assert len(matches) == 1
            r = matches[0]
            assert r['value'] == {'kind': 'number', 'number': expected}, r['rule_id']
            refs = [{'source': 'residential', 'pages': [33, r['source_page'], 44, 45, 47]},
                    {'source': 'measurement', 'pages': [6, 7, 23, 26]},
                    {'source': 'definitions', 'pages': [14, 16, 26]},
                    {'source': 'o21836', 'pages': [11, 14, 44, 45, 46]},
                    {'source': 'o21934', 'pages': [4, 5, 6]},
                    {'source': 'o22109', 'pages': [1, 15, 16, 193, 194, 195]}]
            predicates = ['LEGAL_LOT_STATUS', 'OTHER_REGULATORY_CONTROLS']
            if standard == 'density_basis':
                predicates += ['DEVELOPMENT_USE_CLASS', 'LOT_AREA', 'MULTI_ZONE_PREMISES', 'REQUIRED_DEDICATION']
                if r['unit'] == 'dwelling_unit_per_lot':
                    expr = {'kind': 'scalar', 'value': 1, 'unit': r['unit'],
                            'semantics': 'Base single-dwelling-unit limitation per legal lot; not total units including separately regulated uses.',
                            'definition_excludes': ['ADU', 'JADU']}
                else:
                    assert r['unit'] == 'sq_ft_per_dwelling_unit'
                    expr = {'kind': 'formula', 'expression': 'lot_area / base_zone_sq_ft_per_dwelling_unit',
                            'denominator': {'kind': 'scalar', 'value': expected, 'unit': r['unit']},
                            'semantics': 'Documentary unbonused multiple-dwelling density expression; never evaluated.',
                            'rounding': {'source': '113.0222(a)(1),(3)', 'upward_fraction_threshold': 0.5, 'times_permitted': 1},
                            'multi_zone': {'source': '113.0222(a)(2)', 'mechanism': 'Sum units permitted by zone-specific areas; dwelling placement may disregard zone boundaries.', 'evaluated': False},
                            'definition_excludes': ['ADU', 'JADU', 'employee_housing']}
                clauses = [{'kind': 'reference', 'section': '113.0222(b)',
                            'semantics': 'For single-dwelling subdivision: total site lot area divided by minimum lot area, rounded down. Documentary reference only; no lot count calculated.'},
                           {'kind': 'reference', 'section': '131.0430;131.0420',
                            'semantics': 'Base-zone parameter only. All applicable overlays, supplemental development/use regulations and separate programs still govern a project.'}]
                clauses.append({'kind': 'conditional', 'when': {'predicate': 'REQUIRED_DEDICATION', 'is': 'required_under_142.0610'},
                                'reference': '113.0246 opening density/GFA sentence only;measurement:26;o21836:14',
                                'effect': 'Use property lines prior to required street/alley dedication for density lot area. Does not determine ownership or import the following setback sentence.',
                                'selected': False})
                if zone.startswith('RM-'):
                    clauses.append({'kind': 'reference', 'section': '131-04G footnotes1,2;113.0222(c);Chapter14 Article3 Division7',
                                    'semantics': 'Affordable-housing density exceptions exist; no bonus entitlement or bonus rounding is selected or implemented.'})
                if zone == 'RM-5-12':
                    predicates.append('COMMUNITY_PLAN_AREA')
                    expr = {'kind': 'conditional', 'selection': 'UNRESOLVED', 'alternatives': [
                        {'when': {'predicate': 'COMMUNITY_PLAN_AREA', 'not_in': ['La Jolla', 'Pacific Beach', 'Torrey Pines']}, 'expression': expr},
                        {'when': {'predicate': 'COMMUNITY_PLAN_AREA', 'in': ['La Jolla', 'Pacific Beach', 'Torrey Pines']},
                         'expression': {'kind': 'formula', 'semantics': 'Table131-04G footnote36: one dwelling unit or two guest rooms for each1500 square feet of lot area.',
                                        'lot_area_denominator_sq_ft': 1500, 'alternatives': [{'dwelling_units': 1}, {'guest_rooms': 2}],
                                        'use_selected': False, 'measurement_reference': '113.0222', 'evaluated': False}}]}
            else:
                assert r['unit'] == 'sq_ft'
                predicates += ['SUBDIVISION_OR_EXISTING_LOT', 'LOT_AREA']
                expr = {'kind': 'scalar', 'value': expected, 'unit': 'sq_ft',
                        'semantics': 'Base-zone minimum lot-area development standard; also single-dwelling subdivision denominator where113.0222(b) applies. Not a universal minimum developable parcel or legal-lot test.'}
                clauses = [{'kind': 'conditional', 'when': {'predicate': 'LEGAL_LOT_STATUS', 'is': 'legal_under_113.0237(a)'},
                            'effect': 'A lot below minimum area or dimensions may nevertheless be used in compliance with its zone under113.0237(b).',
                            'reference': '113.0237(a)-(c)', 'selected': False},
                           {'kind': 'reference', 'section': '131.0430;113.0222(b)',
                            'semantics': 'Separate from RM density denominator, subdivision authorization and all other applicable regulations.'}]
                if zone.startswith(('RX-', 'RT-')):
                    predicates.append('ALLEY_SERVICE_AND_GEOMETRY')
                    clauses.append({'kind': 'conditional', 'when': {'predicate': 'ALLEY_SERVICE_AND_GEOMETRY', 'is': 'served_by_abutting_alley'},
                                    'reference': '131.0441', 'permission_not_automatic': True,
                                    'credit': {'kind': 'formula', 'expression': 'up_to_half_abutting_alley_width', 'width_cap_ft': 10,
                                               'area_cap_fraction_of_minimum_requirement': 0.10,
                                               'purpose': 'Credit toward minimum lot-area requirement only, not a change to legal lot area or density/FAR area.'},
                                    'selected': False})
            result.append({'rule_id': r['rule_id'], 'expression': expr, 'conditions': clauses,
                           'required_predicate_ids': predicates, 'authority_evidence': copy.deepcopy(refs),
                           'context_exclusions': ['inside_or_unknown_coastal', 'grandfathered_application', 'miramar_transition',
                                                  'special_program_entitlement', 'parcel_application_or_compliance'],
                           'source_defect': None})
    return result
