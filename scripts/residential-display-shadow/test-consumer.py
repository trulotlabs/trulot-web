#!/usr/bin/env python3
"""Offline exhaustive consumer containment; never writes evidence or contacts a service."""
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
    bundle = bridge.review.load()
    safe = bundle['residential_standards_v2_integration_safe']
    approved = {r['rule_id']: r for r in safe}
    assert len(safe) == len(approved) == 97
    assert all(r['review_state'] == 'SOURCE_VERIFIED' for r in safe)
    raw = json.loads((ROOT / 'data/zoning-standards-v2/rules.json').read_text())
    excluded = [r for r in raw if r['rule_id'] not in approved]
    assert len(raw) == 814 and len(excluded) == 717
    context = dict(evaluation_date='2026-09-24', coastal_context='outside',
                   application_context='new_application', airport_context='outside_miramar_transition',
                   lot_context='unknown')

    def request(zone, **selection):
        return dict(mode='residential', context=dict(context, zone_code=zone),
                    observation=bundle['source-observation'], source_paths=paths, **selection)

    seen = set()
    zones = sorted({r['zone_code'] for r in safe})
    for zone in zones:
        result = bridge.resolve(request(zone))
        assert result['state'] == 'supported', (zone, result)
        for record in result['parameters']:
            rule_id = record['rule_id']
            assert rule_id not in seen, rule_id
            seen.add(rule_id)
            assert all(record[key] == value for key, value in approved[rule_id].items()), rule_id
            assert record['project_applicability_determined'] is False
            assert record['branch_is_parcel_fact'] is False
            assert record['actual_lot_context'] == 'unknown'
            assert record['source'] and record['source_evidence'] and record['dependency_evidence']
            assert record['authority_metadata'] == bundle['source-observation']
    assert seen == set(approved)
    for record in excluded:
        result = bridge.resolve(request(record['zone_code'], requested_rule_ids=[record['rule_id']]))
        assert not result['parameters'] and result['state'] != 'supported', record['rule_id']
    invalid_selections = [None, {}, [None], ['fake'], []]
    for selection in invalid_selections:
        result = bridge.resolve(request('RS-1-7', requested_rule_ids=selection))
        assert not result['parameters'] and result['state'] != 'supported', selection
    states = ['INTERPRETATION_REQUIRED', 'APPLICABILITY_UNRESOLVED', 'SOURCE_INCOMPLETE',
              'CONFLICTING_AUTHORITY', 'MALFORMED', None]
    for state in states:
        changed = copy.deepcopy(bundle)
        changed['residential_standards_v2_integration_safe'][0]['review_state'] = state
        assert bridge.review.validate(changed), state
    print(json.dumps(dict(result='PASS', safe_records=len(seen), residential_zones=len(zones),
                          individually_rejected_excluded_records=len(excluded),
                          invalid_selections=len(invalid_selections), seal_state_mutations=len(states),
                          metadata_preserved=True, elapsed_seconds=round(time.monotonic() - started, 2))))


if __name__ == '__main__':
    main()
