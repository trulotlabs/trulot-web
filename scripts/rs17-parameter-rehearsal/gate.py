"""Offline bridge to the unchanged Packet 12.5 gate. JSON stdin/stdout only."""
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('review_gate', ROOT / 'scripts/residential-standards-review/gate.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
IDS = {'lot_width_min': 7, 'corner_lot_width_min': 9, 'lot_depth_min': 10}


def resolve(request):
    bundle = review.load()
    context = request['context']
    paths = request.get('source_paths')
    errors = review.verify_source_files(bundle, paths)
    if errors or request.get('observation') != bundle['source-observation']:
        return {'state': 'unavailable', 'reason': 'source_or_authority_invalidated', 'parameters': []}
    if context.get('lot_context', 'unknown') not in ['corner', 'non_corner', 'unknown']:
        return {'state': 'unknown', 'reason': 'invalid_lot_context', 'parameters': []}
    mode = request.get('mode', 'rs17')
    if mode not in ['rs17', 'residential']:
        return {'state': 'unknown', 'reason': 'unsupported_consumer_mode', 'parameters': []}
    if mode == 'rs17' and context.get('zone_code') != 'RS-1-7':
        return {'state': 'unknown', 'reason': 'zone_outside_rehearsal', 'parameters': []}
    sealed = bundle['residential_standards_v2_integration_safe']
    approved = {r['rule_id']: r for r in sealed if r['zone_code'] == context.get('zone_code')}
    if mode == 'residential':
        wanted_ids = request.get('requested_rule_ids', list(approved))
        if not isinstance(wanted_ids, list) or not wanted_ids or any(not isinstance(p, str) or p not in approved for p in wanted_ids):
            return {'state': 'unknown', 'reason': 'excluded_or_unreviewed_rule', 'parameters': []}
        selected = [approved[p] for p in sorted(set(wanted_ids))]
    else:
        wanted = request.get('requested_parameters', list(IDS))
        if not isinstance(wanted, list) or not wanted or any(p not in IDS for p in wanted):
            return {'state': 'unknown', 'reason': 'excluded_parameter', 'parameters': []}
        selected = [approved[f'sd-residential-2026-09-24-research-v1:RS-1-7:34:{IDS[name]}'] for name in dict.fromkeys(wanted)]
    raw = {r['rule_id']: r for r in json.loads((ROOT / 'data/zoning-standards-v2/rules.json').read_text())}
    source = json.loads((ROOT / 'data/zoning-standards-v2/sources.json').read_text())['sources']['residential']
    parameters = []
    for expected_record in selected:
        name = expected_record['standard_type']
        # Enumerate a source-rule condition, NOT an assertion about the parcel.
        # The user authorized conditional alternatives for unknown lot context.
        condition_branch = 'corner' if name == 'corner_lot_width_min' else 'non_corner'
        result = review.select(bundle, zone=context.get('zone_code'), standard=name,
            as_of=context.get('evaluation_date'), coastal_context=context.get('coastal_context'),
            application_context=context.get('application_context'), airport_context=context.get('airport_context'),
            scope='BASE_TABLE_PARAMETERS_ONLY', observation=request.get('observation'),
            lot_context=condition_branch, source_paths=paths)
        if result['state'] != 'BASE_TABLE_PARAMETER':
            return {'state': 'unknown', 'reason': 'operative_context_unresolved', 'parameters': []}
        matched = [r for r in result['rules'] if r == expected_record]
        if len(matched) != 1:
            return {'state': 'unavailable', 'reason': 'unexpected_approved_record', 'parameters': []}
        r = matched[0]
        expected = expected_record['rule_id']
        if r['unit'] != 'ft' or r['operator'] != 'MIN' or r['review_state'] != 'SOURCE_VERIFIED':
            return {'state': 'unavailable', 'reason': 'unexpected_approved_record', 'parameters': []}
        parameters.append({**r, 'rule_set_version': raw[expected]['rule_set_version'],
            'source_section': raw[expected]['source_section'], 'source': source,
            'applicability_state': 'CONDITIONAL_BASE_TABLE_PARAMETER',
            'actual_lot_context': context.get('lot_context', 'unknown'),
            'condition_branch_evaluated': condition_branch,
            'branch_is_parcel_fact': False,
            'project_applicability_determined': False,
            'unresolved_dependencies': raw[expected]['unresolved_dependencies'] + ['113.0237', '113.0243'],
            'authority_metadata': bundle['source-observation'],
            'approved_context': bundle['authority-review']['applicability'],
            'dependency_evidence': {
                'reference': 'data/residential-standards-review/dimension-dependencies.json',
                'canonical_sha256': review.digest(bundle['dimension-dependencies']),
                'sections': raw[expected]['unresolved_dependencies'] + ['113.0237', '113.0243'],
                'evaluated': False}})
    return {'state': 'supported', 'reason': 'conditional_parameter_catalogue', 'parameters': parameters}


if __name__ == '__main__':
    try:
        print(json.dumps(resolve(json.load(sys.stdin))))
    except (ValueError, KeyError, TypeError, OSError, IndexError):
        print(json.dumps({'state': 'unavailable', 'reason': 'invalid_evidence_or_input', 'parameters': []}))
