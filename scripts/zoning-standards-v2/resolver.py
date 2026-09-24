#!/usr/bin/env python3
"""Offline, fail-closed residential base-table evidence resolver. No capacity API."""
import argparse
import hashlib
import json
import math
import re
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / 'data/zoning-standards-v2'


def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def canonical_sha(value):
    return sha(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')))


def load(data_dir=DATA):
    return {p.stem: json.loads(p.read_text()) for p in data_dir.glob('*.json')}


def note_numbers(text):
    text = re.sub(r'\b\d{3}\.\d{4}(?:\([a-z0-9]+\))*', '', text)
    return sorted({int(n) for group in re.findall(r'\((\d+(?:,\s*\d+)*)\)', text)
                   for n in group.split(',')})


def validate(bundle):
    """Structural/evidence checks do not promote review state."""
    errors = []
    # Exported API has the same integrity boundary as the CLI, including tables,
    # dependency text, source records, and independent review evidence.
    lock_path = DATA / 'integrity.json'
    if not lock_path.is_file():
        return ['MISSING_INTEGRITY_RECORD']
    for name, expected in json.loads(lock_path.read_text()).items():
        key = Path(name).stem
        if key not in bundle or canonical_sha(bundle[key]) != expected['canonical_sha256']:
            errors.append(f'{name}: bundle integrity drift')
    rules = bundle['rules']
    ids, coordinates = set(), set()
    for rule in rules:
        rid = rule.get('rule_id', '<missing>')
        try:
            if rid in ids: raise ValueError('duplicate rule/version')
            ids.add(rid)
            if rule['source_section'] != '131.0431': raise ValueError('wrong section')
            if rule['source_id'] != 'residential': raise ValueError('wrong source')
            if rule['applicability'] != {'version_profile': 'outside-current-snapshot', 'project_applicability_evaluated': False}:
                raise ValueError('unsupported applicability claim')
            e = rule['source_evidence']
            p, row, col = rule['source_page'], e['row'], e['column']
            cell = bundle['source-tables'][str(p)]['rows'][row][col]
            meta = bundle['row-catalogue'][f'{p}:{row}']
            if e['cell_text'] != cell or e['row_label'] != meta['row_label']:
                raise ValueError('wrong source row/cell')
            if e['bbox'] != bundle['source-tables'][str(p)]['boxes'][row][col]:
                raise ValueError('wrong cell coordinates')
            if col < 2 or rule['zone_code'] != meta['zones'][col - 2] or e['zone_header'] != rule['zone_code']:
                raise ValueError('wrong zone column')
            if rule['source_table'] != meta['table'] or e['table'] != meta['table']:
                raise ValueError('wrong table')
            if rule['unit'] != meta['unit'] or rule['operator'] != meta['operator'] or rule['standard_type'] != meta['standard_type']:
                raise ValueError('wrong unit/operator/standard')
            if rule['conditions'] != meta['conditions']: raise ValueError('missing condition')
            page = bundle['source-pages'][e['page_evidence']]
            if e['page_evidence'] != f'residential:{p}' or sha(page['text']) != page['text_sha256']:
                raise ValueError('page evidence drift')
            if page['artifact_sha256'] != bundle['sources']['sources']['residential']['sha256']:
                raise ValueError('artifact identity mismatch')
            if rule['source_text_hash'] != sha(json.dumps(e, sort_keys=True, ensure_ascii=False)):
                raise ValueError('cell hash mismatch')
            expected_notes = [f"{meta['table']}:{n}" for n in note_numbers(meta['row_label'] + ' ' + (cell or ''))]
            if rule['exceptions'] != expected_notes: raise ValueError('missing or extra footnote')
            references = set(meta['row_references'])
            for key in expected_notes:
                note = bundle['footnotes'][key]
                references.update(note['references'])
                if note['text'] is None:
                    if note['state'] != 'MISSING_IN_SOURCE' or rule['review_state'] != 'INTERPRETATION_REQUIRED':
                        raise ValueError('missing source footnote not quarantined')
                else:
                    if sha(note['text']) != note['source_text_hash']: raise ValueError('footnote drift')
                    page_text = ' '.join(bundle['source-pages'][note['page_evidence']]['text'].split())
                    if note['text'] not in page_text: raise ValueError('footnote not in cited page')
            required = references | {'131.0430', 'Chapter 11 Article 3', 'Chapter 13 Article 2', 'Chapter 14'}
            if not required.issubset(rule['unresolved_dependencies']): raise ValueError('missing cross-reference')
            clean = ' '.join(re.sub(r'\(\d+(?:,\s*\d+)*\)', '', cell or '').split())
            value = rule['value']
            if re.fullmatch(r'\d+(?:,\d{3})*(?:\.\d+)?', clean): expected_kind = 'number'
            elif clean in ['-', '--', '']: expected_kind = 'not_specified_in_table'
            elif clean.replace(' ', '') in ['applies', 'varies', 'Permitted']: expected_kind = 'reference'
            else: expected_kind = 'source_expression'
            if value['kind'] != expected_kind: raise ValueError('wrong value kind')
            if value['kind'] == 'number':
                n = value['number']
                if isinstance(n, bool) or not isinstance(n, (float, int)) or not math.isfinite(n):
                    raise ValueError('malformed numeric value')
                if not re.fullmatch(r'\d+(?:,\d{3})*(?:\.\d+)?', clean) or n != float(clean.replace(',', '')):
                    raise ValueError('numeric transcription mismatch')
            elif value['kind'] == 'not_specified_in_table':
                if clean not in ['-', '--', ''] or value['number'] is not None or value['source_symbol'] != clean:
                    raise ValueError('absence changed to an assertion')
            elif value['kind'] in ['reference', 'source_expression']:
                if value['text'] != clean: raise ValueError('expression changed')
                if value['kind'] == 'source_expression' and value['evaluated'] is not False:
                    raise ValueError('expression evaluated without interpretation')
                if value['kind'] == 'reference' and set(value['targets']) != references:
                    raise ValueError('reference targets changed')
            else:
                raise ValueError('unknown value type')
            if rule['review_state'] not in ['EXTRACTED', 'SOURCE_VERIFIED', 'INTERPRETATION_REQUIRED']:
                raise ValueError('unsupported review promotion')
            if rule['review_state'] == 'SOURCE_VERIFIED' and rid not in bundle.get('review', {}).get('source_verified_rule_ids', []):
                raise ValueError('missing independent review evidence')
            if rule['legal_review'] or rule['derivation_class'] != 'DETERMINISTIC_TRANSCRIPTION':
                raise ValueError('unsupported legal/derivation claim')
            coordinate = (rule['rule_set_version'], rule['zone_code'], p, row)
            if coordinate in coordinates: raise ValueError('conflicting/overlapping version')
            coordinates.add(coordinate)
            if rule['rule_set_version'] != bundle['versions']['rule_set_version']:
                raise ValueError('unregistered version')
            if rule['effective_date'] is not None: raise ValueError('snapshot incorrectly used as enactment date')
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            errors.append(f'{rid}: {exc}')
    expected = sum(len(v['zones']) for v in bundle['row-catalogue'].values())
    if len(rules) != expected: errors.append('rule coverage differs from source catalogue')
    profiles = bundle['versions']['profiles']
    observed = bundle['source-version-observation']
    if profiles != observed['profiles'] or bundle['versions']['ordinances'] != observed['ordinances']:
        errors.append('version metadata differs from verified observation')
    if bundle['versions']['verified_as_of'] != observed['verified_as_of']:
        errors.append('verification date drift')
    for sid, s in bundle['sources']['sources'].items():
        if observed['sources'].get(sid) != {k: s[k] for k in ['sha256', 'url', 'acquired_at']}:
            errors.append(f'{sid}: source metadata drift')
    for i, a in enumerate(profiles):
        for b in profiles[i + 1:]:
            if a['coastal_context'] == b['coastal_context'] and set(a['supported_as_of_dates']) & set(b['supported_as_of_dates']):
                errors.append('overlapping applicability profiles')
    return errors


def verify_integrity(data_dir=DATA):
    lock = json.loads((data_dir / 'integrity.json').read_text())
    return [f'{name}: artifact drift' for name, expected in lock.items()
            if not (data_dir / name).is_file() or sha((data_dir / name).read_bytes()) != expected['file_sha256']]


def check_source_version(bundle, observation):
    """Compare a newly acquired, caller-supplied observation to the pinned contract.

    This never fetches the network. Reusing the pinned observation proves only the
    recorded acquisition, not present/future law. Dates beyond it are refused.
    """
    expected = bundle['source-version-observation']
    if observation != expected:
        return ['SOURCE_VERSION_DRIFT_OR_UNVERIFIED_OBSERVATION']
    return []


def resolve(bundle, zone_codes, as_of, coastal_context, rule_set_version,
            observation, application_context='unknown', airport_context='unknown'):
    errors = validate(bundle) + check_source_version(bundle, observation)
    if errors: return {'state': 'INVALID_OR_DRIFTED', 'errors': errors, 'zones': []}
    try:
        if date.fromisoformat(as_of).isoformat() != as_of: raise ValueError()
    except (TypeError, ValueError):
        return {'state': 'INVALID_DATE', 'zones': []}
    if coastal_context not in ['inside', 'outside', 'unknown']:
        return {'state': 'INVALID_CONTEXT', 'zones': []}
    if rule_set_version != bundle['versions']['rule_set_version']:
        return {'state': 'UNKNOWN_RULE_SET', 'zones': []}
    if not isinstance(zone_codes, list) or not zone_codes or any(not isinstance(z, str) for z in zone_codes):
        return {'state': 'INVALID_ZONE_INPUT', 'zones': []}
    profiles = [p for p in bundle['versions']['profiles'] if
                p['coastal_context'] == coastal_context and as_of in p['supported_as_of_dates']]
    if len(profiles) != 1:
        return {'state': 'APPLICABILITY_UNRESOLVED', 'zones': [],
                'reasons': ['No uniquely verified composite for requested date and Coastal context'],
                'version_evidence': bundle['versions']['ordinances']}
    if application_context != 'new_application' or airport_context != 'outside_miramar_transition':
        return {'state': 'PROJECT_APPLICABILITY_UNRESOLVED', 'zones': [],
                'reasons': ['Grandfathering and airport exception must be resolved; no parcel membership inferred']}
    results = []
    for code in zone_codes:  # exact match: preserve raw spelling and separate split zones
        selected = [r for r in bundle['rules'] if r['zone_code'] == code]
        if not selected:
            results.append({'zone_code': code, 'state': 'UNSUPPORTED_ZONE', 'rules': []})
            continue
        results.append({'zone_code': code, 'state': 'CONDITIONAL_BASE_TABLE_EVIDENCE',
                        'rules': selected,
                        'footnotes': {key: bundle['footnotes'][key] for r in selected for key in r['exceptions']},
                        'supplemental_tables': bundle['supplemental-tables'],
                        'unresolved_dependencies': sorted({d for r in selected for d in r['unresolved_dependencies']}),
                        'section_evidence': bundle['dependencies'],
                        'legal_review': False, 'project_feasibility_determined': False})
    return {'state': 'SEPARATE_ZONE_RESULTS', 'as_of': as_of, 'zones': results,
            'rule_set_version': rule_set_version, 'coastal_context': coastal_context,
            'scope': 'Base table evidence only; conditions and dependencies are not evaluated'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zones', nargs='+')
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--coastal-context', choices=['inside', 'outside', 'unknown'], required=True)
    parser.add_argument('--rule-set', required=True)
    parser.add_argument('--observation', type=Path, required=True)
    parser.add_argument('--application-context', default='unknown')
    parser.add_argument('--airport-context', default='unknown')
    args = parser.parse_args()
    integrity_errors = verify_integrity()
    if integrity_errors:
        print(json.dumps({'state': 'INVALID_OR_DRIFTED', 'errors': integrity_errors}))
        raise SystemExit(1)
    result = resolve(load(), args.zones, args.as_of, args.coastal_context, args.rule_set,
                     json.loads(args.observation.read_text()), args.application_context, args.airport_context)
    print(json.dumps(result, indent=2))
