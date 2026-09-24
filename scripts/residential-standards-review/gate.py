#!/usr/bin/env python3
"""Offline review-rehearsal gate, intentionally not imported by any product code."""
import hashlib
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/residential-standards-review'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def load():
    return {p.stem: json.loads(p.read_text()) for p in DATA.glob('*.json')}


def validate(bundle):
    """Compare caller data with the separately reviewed local seal; never self-seal."""
    try:
        seal = json.loads((DATA / 'integrity.json').read_text())
        errors = [f'REVIEW_ARTIFACT_DRIFT:{name}' for name, expected in seal['review'].items()
                  if name not in bundle or digest(bundle[name]) != expected]
        for name, expected in seal['packet12'].items():
            path = ROOT / 'data/zoning-standards-v2' / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                errors.append('PACKET12_DRIFT:' + name)
        return errors
    except (OSError, ValueError, KeyError, TypeError):
        return ['MISSING_OR_INVALID_REVIEW_SEAL']


def select(bundle, *, zone, standard, as_of, coastal_context, application_context,
           airport_context, scope, observation, lot_context, source_paths):
    # Selection cannot bypass source-file rehashing. Authority metadata remains
    # an explicit dated review observation, not a claim of live legal monitoring.
    errors = verify_source_files(bundle, source_paths)
    if errors:
        return {'state': 'INVALIDATED', 'rules': [], 'reasons': errors}
    if observation != bundle['source-observation']:
        return {'state': 'INVALIDATED', 'rules': [], 'reasons': ['SOURCE_OR_AUTHORITY_DRIFT_OR_INCOMPLETE_OBSERVATION']}
    if (as_of != '2026-09-24' or coastal_context != 'outside' or
            application_context != 'new_application' or airport_context != 'outside_miramar_transition' or
            scope != 'BASE_TABLE_PARAMETERS_ONLY' or lot_context not in {'corner', 'non_corner'}):
        return {'state': 'APPLICABILITY_UNRESOLVED', 'rules': []}
    if standard == 'corner_lot_width_min' and lot_context != 'corner':
        return {'state': 'NOT_APPLICABLE', 'rules': []}
    rules = [r for r in bundle['residential_standards_v2_integration_safe']
             if r['zone_code'] == zone and r['standard_type'] == standard]
    return {'state': 'BASE_TABLE_PARAMETER' if rules else 'EXCLUDED', 'rules': rules,
            'scope': 'BASE_TABLE_PARAMETERS_ONLY', 'project_applicability_determined': False}


def verify_source_files(bundle, paths):
    """Rehash every pinned public artifact. Missing files invalidate; no network or fallback."""
    errors = validate(bundle)
    if errors:
        return errors
    for name, source in bundle['source-observation']['sources'].items():
        try:
            if hashlib.sha256(Path(paths[name]).read_bytes()).hexdigest() != source['sha256']:
                errors.append('SOURCE_HASH_DRIFT:' + name)
        except (KeyError, OSError, TypeError):
            errors.append('SOURCE_UNAVAILABLE:' + name)
    return errors


def timeline_version(bundle, family, context, as_of):
    """Documentary interval lookup; never returns standards or applicability."""
    if validate(bundle):
        return {'state': 'INVALIDATED'}
    try:
        value = date.fromisoformat(as_of)
        if value > date(2026, 9, 24):
            return {'state': 'UNREVIEWED_DATE'}
        intervals = [interval for row in bundle['timeline']['family_intervals']
                     if row['family'] == family and row['context'] == context
                     for interval in row['intervals']
                     if date.fromisoformat(interval['from']) <= value
                     and (interval['to'] is None or value < date.fromisoformat(interval['to']))]
        if len(intervals) != 1:
            return {'state': 'UNRESOLVED'}
        return {'state': 'DOCUMENTARY_VERSION_ONLY', 'interval': intervals[0], 'rules': []}
    except (ValueError, TypeError, KeyError):
        return {'state': 'UNRESOLVED'}
