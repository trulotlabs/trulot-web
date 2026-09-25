#!/usr/bin/env python3
"""Offline exhaustive containment for the expanded sealed consumer."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('residential_bridge', ROOT / 'scripts/rs17-parameter-rehearsal/gate.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def main():
    started = time.monotonic()
    paths = json.loads(Path(sys.argv[1]).read_text())
    high = bridge.high.load()
    prior = bridge.review.load()['residential_standards_v2_integration_safe']
    new = high['proposed-safe-subset']['new_display_safe_records']
    approved = {r['rule_id']: r for r in prior + new}
    assert len(prior) == 97 and len(new) == 116 and len(approved) == 213
    counts = {}
    for record in new:
        counts[record['family']] = counts.get(record['family'], 0) + 1
    assert counts == {'density': 33, 'lot_area': 33, 'front_setback': 14,
                      'interior_side_setback': 14, 'height': 7, 'far': 8, 'lot_coverage': 7}
    assert high['proposed-safe-subset']['preserved_baseline_ids'] == [r['rule_id'] for r in prior]
    assert not bridge.high.validate(high, paths)
    context = dict(evaluation_date='2026-09-24', coastal_context='outside',
                   application_context='new_application', airport_context='outside_miramar_transition',
                   lot_context='unknown')

    def request(zone, **selection):
        return dict(mode='expanded_residential', context=dict(context, zone_code=zone),
                    observation=high['authority-observation'], source_paths=paths, **selection)

    seen = set()
    zones = sorted({r['zone_code'] for r in approved.values()})
    for zone in zones:
        result = bridge.resolve(request(zone))
        assert result['state'] == 'supported', (zone, result)
        for record in result['parameters']:
            rule_id = record['rule_id']
            assert rule_id not in seen and rule_id in approved
            seen.add(rule_id)
            assert record['sealed_record'] == approved[rule_id]
            assert record['display_safe'] is True
            assert record['parcel_application_safe'] is False
            assert record['project_applicability_determined'] is False
            assert record['compliance_determined'] is False
            assert record['capacity_determined'] is False
            assert record['required_predicates']
            assert all(p == {'id': p['id'], 'state': 'UNRESOLVED', 'value': None}
                       for p in record['required_predicates'])
    assert seen == set(approved)

    decisions = high['decision']['candidate_decisions']
    remaining = [r for r in decisions if r['rule_id'] not in approved]
    assert len(remaining) == 201
    remaining_by_zone = {}
    for record in remaining:
        remaining_by_zone.setdefault(record['zone_code'], []).append(record['rule_id'])
    for zone, rule_ids in remaining_by_zone.items():
        result = bridge.resolve(request(zone, requested_rule_ids=rule_ids))
        assert result['state'] != 'supported' and not result['parameters'], zone

    raw = json.loads((ROOT / 'data/zoning-standards-v2/rules.json').read_text())
    other_excluded = [r for r in raw if r['rule_id'] not in approved]
    assert len(other_excluded) == 601
    other_by_zone = {}
    for record in other_excluded:
        other_by_zone.setdefault(record['zone_code'], []).append(record['rule_id'])
    for zone, rule_ids in other_by_zone.items():
        result = bridge.resolve(request(zone, requested_rule_ids=rule_ids))
        assert result['state'] != 'supported' and not result['parameters'], zone

    for selection in [None, {}, [None], ['fake'], []]:
        result = bridge.resolve(request('RS-1-7', requested_rule_ids=selection))
        assert result['state'] != 'supported' and not result['parameters']
    for coastal in ['unknown', 'inside']:
        changed = request('RS-1-7')
        changed['context']['coastal_context'] = coastal
        result = bridge.resolve(changed)
        assert result['state'] != 'supported' and not result['parameters']
    drift = request('RS-1-7')
    drift['observation'] = copy.deepcopy(drift['observation'])
    drift['observation']['sources']['residential']['sha256'] = 'drift'
    assert bridge.resolve(drift)['state'] == 'unavailable'

    missing_predicate = copy.deepcopy(high)
    missing_predicate['proposed-safe-subset']['new_display_safe_records'][0]['required_predicates'] = []
    assert bridge.high.validate(missing_predicate, paths)
    promoted_as_application_safe = copy.deepcopy(high)
    promoted_as_application_safe['proposed-safe-subset']['new_display_safe_records'][0]['parcel_application_safe'] = True
    assert bridge.high.validate(promoted_as_application_safe, paths)
    print(json.dumps(dict(result='PASS', sealed_records=len(seen), prior_records=len(prior),
                          new_records=len(new), families=counts, zones=len(zones),
                          rejected_remaining_candidates=len(remaining),
                          rejected_other_corpus_records=len(other_excluded),
                          display_safe_not_application_safe=True,
                          elapsed_seconds=round(time.monotonic() - started, 2))))


if __name__ == '__main__':
    main()
