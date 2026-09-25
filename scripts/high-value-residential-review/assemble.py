#!/usr/bin/env python3
"""Deterministic offline review assembly. Does not grant or generate a seal.

Default is read-only comparison. --write updates only this packet's derived
artifacts; it never changes previous approvals, runtime code or authoritative PDFs.
"""
import argparse
import copy
import json
from collections import Counter

import consumer
import density_lot_area

DATA = consumer.DATA


def assemble():
    read = lambda name: json.loads((DATA / (name + '.json')).read_text())
    ledger = json.loads((consumer.ROOT / 'data/zoning-standards-v2/rules.json').read_text())
    by_id = {r['rule_id']: r for r in ledger}
    inventory = read('candidate-inventory')
    candidates = {r['rule_id']: r for r in inventory['records']}
    setback = read('setback-proposals')
    hfc = read('height-far-coverage-proposals')
    baseline = consumer.prior.load()['residential_standards_v2_integration_safe']
    taxonomy = copy.deepcopy(density_lot_area.PREDICATES)
    taxonomy.update(setback['predicate_taxonomy'])
    taxonomy.update(hfc['predicate_catalog'])
    records = []
    groups = [(density_lot_area.proposals(ledger), 'density_lot_area', {}),
              (setback['records'], 'setbacks', setback['profile']),
              (hfc['proposals'], 'height_far_coverage', hfc['scope'])]
    for proposals, group, scope in groups:
        for p in proposals:
            raw = by_id[p['rule_id']]
            assert p['rule_id'] in candidates
            pred_ids = p.get('required_predicate_ids', p.get('unresolved_predicate_ids'))
            expression = copy.deepcopy(p['expression'])
            if expression['kind'] not in consumer.EXPRESSION_KINDS:
                expression = {'kind': 'conditional', 'domain_expression': expression, 'selection': 'UNRESOLVED'}
            evidence = p.get('authority_evidence', p.get('evidence'))
            assert evidence and pred_ids
            records.append({
                'rule_id': raw['rule_id'], 'zone_code': raw['zone_code'],
                'standard_type': raw['standard_type'], 'family': candidates[raw['rule_id']]['family'],
                'review_state': 'SOURCE_VERIFIED', 'safety_level': 'DISPLAY_SAFE_PARAMETER',
                'parcel_application_safe': False, 'applicability_profile': consumer.PROFILE,
                'inside_coastal': 'NOT_APPROVED', 'unknown_coastal': 'BLOCKED',
                'source_defect': None, 'conflicting_authority': False,
                'qualifier': 'Conditional base-zone information for the dated outside-Coastal review profile only. '
                             'Property facts and scope match remain unresolved. This is not a parcel entitlement, '
                             'compliance finding, legal-lot determination, or capacity calculation. '
                             'Retain every condition, excluded context, footnote and measurement dependency.',
                'expression': expression,
                'required_predicates': [{'id': key, 'state': 'UNRESOLVED', 'value': None} for key in pred_ids],
                'authority_evidence': evidence, 'source_record': raw,
                'footnote_ids': candidates[raw['rule_id']]['footnote_ids'],
                'review_group': group, 'scope_details': scope,
                'reviewed_proposal': p,
            })
    records.sort(key=lambda r: r['rule_id'])
    approved = {r['rule_id'] for r in records}
    assert len(approved) == len(records)
    hfc_excluded = {r['rule_id']: r for r in hfc['other_records_reviewed']}
    setback_excluded = {r['rule_id']: r for r in setback.get('other_records_reviewed', [])}
    decisions = []
    for row in inventory['records']:
        rid, zone, family = row['rule_id'], row['zone_code'], row['family']
        if rid in approved:
            decision = {'decision': 'DISPLAY_SAFE_PARAMETER', 'reason': 'Reviewed conditional expression in proposed-safe-subset; parcel selection unresolved.'}
        elif rid in hfc_excluded:
            decision = {k: v for k, v in hfc_excluded[rid].items() if k not in {'rule_id', 'standard_type'}}
        elif rid in setback_excluded:
            decision = {k: v for k, v in setback_excluded[rid].items() if k not in {'rule_id', 'standard_type', 'zone_code', 'family'}}
        else:
            reason, category = 'Complete operative conditional contract not admitted in this bounded review; see setback research by family.', 'applicability'
            if family == 'rear_setback' and zone in density_lot_area.ZONES[:7]:
                reason, category = '131.0443(a)(2)(A) refers to Table141-04D in corrected adopted O21836 and current code; no operative correction established.', 'source-defect'
            elif family == 'street_side_setback' and zone.startswith('RS-'):
                reason, category = '131.0443(a)(4)(A) says each side setback; street-side reach of8% clause not resolved. No assumption permitted.', 'genuinely interpretive'
            elif family == 'front_setback' and zone == 'RT-1-5':
                reason, category = 'Table front maximum10ft versus131.0443(c)(1) maximum15ft not reconciled.', 'source-defect'
            decision = {'decision': 'REMAINS_EXCLUDED', 'reason': reason, 'blocker_category': category}
        decisions.append({'rule_id': rid, 'zone_code': zone, 'family': family, **decision})
    family_counts = dict(sorted(Counter(r['family'] for r in records).items()))
    zone_families = {z: sorted({r['family'] for r in records if r['zone_code'] == z}) for z in density_lot_area.ZONES}
    metrics = {
        'before_safe_records': len(baseline), 'after_proposed_safe_records': len(baseline) + len(records),
        'new_display_safe_records': len(records), 'candidate_records': len(candidates),
        'candidate_promoted_fraction': f'{len(records)}/{len(candidates)}',
        'candidate_promoted_percent': round(100 * len(records) / len(candidates), 2),
        'before_zones': 33, 'after_zones': 33,
        'before_record_families': {'lot_width_min': 32, 'corner_lot_width_min': 32, 'lot_depth_min': 33},
        'new_records_per_family': family_counts,
        'zone_families': zone_families,
        'zone_category_counts_nonexclusive': {
            'dimensions_only': sum(not f for f in zone_families.values()),
            'dimensions_plus_density': sum('density' in f for f in zone_families.values()),
            'dimensions_plus_setbacks': sum(any('setback' in x for x in f) for f in zone_families.values()),
            'dimensions_plus_height': sum('height' in f for f in zone_families.values()),
            'dimensions_plus_far': sum('far' in f for f in zone_families.values()),
            'broader_verified_set_density_lot_area_and_another_priority': sum('density' in f and 'lot_area' in f and len(f) > 2 for f in zone_families.values()),
        },
        'parcel_application_safe_records_new': 0,
    }
    observation = copy.deepcopy(consumer.prior.load()['source-observation'])
    observation['authority_inventory_scope'] = 'Packet17 exact approved IDs: conditional density/lot-area and bounded RS setbacks/height/FAR/coverage; not entire code or live legal monitoring.'
    observation['approved_new_rule_ids'] = sorted(approved)
    observation['prior_approval_unchanged'] = True
    observation['required_sections'] = sorted(set(observation['required_sections'] + ['113.0222', '113.0240', '113.0246', '113.0249', '113.0252', '113.0270', '131.0441', '131.0443', '131.0444', '131.0445', '131.0446', '131.0461']))
    return {
        'proposed-safe-subset': {'contract_version': 'packet17-conditional-display-v1',
                                 'runtime_integration_authorized': False,
                                 'preserved_baseline_ids': [r['rule_id'] for r in baseline],
                                 'new_display_safe_records': records},
        'predicate-taxonomy': {'selection_policy': 'Every property predicate remains UNRESOLVED; no inferred facts or application-safe output.',
                               'predicates': taxonomy},
        'authority-observation': observation,
        'decision': {'baseline_head': 'ea25454ffafafe40d3ab564e5b12c03ddd884ad2',
                     'scope': consumer.PROFILE, 'approved_new_rule_ids': sorted(approved),
                     'candidate_decisions': decisions, 'metrics': metrics,
                     'rs17_closure': [d for d in decisions if d['zone_code'] == 'RS-1-7'],
                     'runtime_and_public_display_change_authorized': False},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    for name, value in assemble().items():
        target = DATA / (name + '.json')
        if args.write:
            target.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
        else:
            assert json.loads(target.read_text()) == value, 'ASSEMBLY_DRIFT:' + name
    print('PASS: deterministic assembly; no seal generated')
