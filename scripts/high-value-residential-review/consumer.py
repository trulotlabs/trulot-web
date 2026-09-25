#!/usr/bin/env python3
"""Sealed, offline proposed display contract. Never evaluates a property or capacity.

No product import, network, environment flag, or database access exists here.
Every selection rehashes the authoritative bytes and the prior approval bundle.
The seal is a separately reviewed repository artifact, not caller supplied.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/high-value-residential-review'
spec = importlib.util.spec_from_file_location(
    'prior_review_gate', ROOT / 'scripts/residential-standards-review/gate.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)

PROFILE = {
    'as_of': '2026-09-24',
    'coastal_context': 'outside',
    'application_context': 'new_application',
    'airport_context': 'outside_miramar_transition',
    'scope': 'CONDITIONAL_BASE_ZONE_PARAMETERS_ONLY',
}
EXPRESSION_KINDS = {'scalar', 'formula', 'conditional', 'range', 'reference'}
SEALED_ARTIFACTS = {
    'candidate-inventory', 'proposed-safe-subset', 'predicate-taxonomy',
    'authority-observation', 'decision', 'setback-proposals',
    'height-far-coverage-proposals', 'authority-excerpts', 'adversarial-review',
}


def seal_errors(seal, bundle):
    try:
        if set(seal['artifacts']) != SEALED_ARTIFACTS:
            return ['INCOMPLETE_REVIEW_SEAL']
        return ['ARTIFACT_DRIFT:' + name for name, expected in seal['artifacts'].items()
                if name not in bundle or prior.digest(bundle[name]) != expected]
    except (KeyError, TypeError):
        return ['INVALID_REVIEW_SEAL']


def load():
    return {p.stem: json.loads(p.read_text()) for p in DATA.glob('*.json')
            if p.stem != 'integrity'}


def validate(bundle, source_paths):
    try:
        errors = prior.verify_source_files(prior.load(), source_paths)
        seal = json.loads((DATA / 'integrity.json').read_text())
        errors.extend(seal_errors(seal, bundle))
        if errors:
            return errors
        if bundle['adversarial-review']['verdict'] != 'PASS':
            return ['ADVERSARIAL_REVIEW_NOT_PASSED']
        rules = bundle['proposed-safe-subset']['new_display_safe_records']
        baseline = prior.load()['residential_standards_v2_integration_safe']
        if bundle['proposed-safe-subset']['preserved_baseline_ids'] != [r['rule_id'] for r in baseline]:
            errors.append('BASELINE_CHANGED')
        ids = [r['rule_id'] for r in rules]
        approved = bundle['decision']['approved_new_rule_ids']
        if len(set(ids)) != len(ids) or sorted(ids) != sorted(approved):
            errors.append('APPROVAL_SET_MISMATCH')
        taxonomy = bundle['predicate-taxonomy']['predicates']
        for rule in rules:
            if (rule['review_state'] != 'SOURCE_VERIFIED' or
                    rule['safety_level'] != 'DISPLAY_SAFE_PARAMETER' or
                    rule['parcel_application_safe'] is not False or
                    rule['applicability_profile'] != PROFILE or
                    rule['inside_coastal'] != 'NOT_APPROVED' or
                    rule['unknown_coastal'] != 'BLOCKED' or
                    rule['source_defect'] is not None or
                    rule['conflicting_authority'] is not False):
                errors.append('UNSAFE_RECORD:' + rule['rule_id'])
            if rule['expression']['kind'] not in EXPRESSION_KINDS:
                errors.append('UNSUPPORTED_EXPRESSION')
            if not rule['qualifier'] or not rule['authority_evidence'] or not rule['required_predicates']:
                errors.append('MISSING_QUALIFICATION')
            for predicate in rule['required_predicates']:
                if predicate['id'] not in taxonomy or predicate['state'] != 'UNRESOLVED':
                    errors.append('PREDICATE_GUESSED_OR_UNKNOWN')
        for source_id, source in bundle['authority-observation']['sources'].items():
            try:
                actual = hashlib.sha256(Path(source_paths[source_id]).read_bytes()).hexdigest()
                if actual != source['sha256']:
                    errors.append('SOURCE_DRIFT:' + source_id)
            except (KeyError, OSError, TypeError):
                errors.append('SOURCE_UNAVAILABLE:' + source_id)
        return errors
    except (KeyError, TypeError, ValueError, OSError):
        return ['MISSING_OR_INVALID_REVIEW_CONTRACT']


def select(bundle, *, zone, profile, observation, source_paths):
    """Return whole qualified records; there is deliberately no raw-value API.

The profile is a hypothetical review scope, not a determination about a parcel.
Unresolved predicates stay unresolved, including ones restricting this scope.
Existing dimensions retain their prior consumer and are not relabeled here.
"""
    errors = validate(bundle, source_paths)
    if errors:
        return {'state': 'INVALIDATED', 'records': [], 'reasons': errors}
    if observation != bundle['authority-observation']:
        return {'state': 'INVALIDATED', 'records': [], 'reasons': ['AUTHORITY_OBSERVATION_DRIFT']}
    if profile != PROFILE:
        return {'state': 'APPLICABILITY_UNRESOLVED', 'records': []}
    # Exact allowlisted zone identity only; no suffix parsing or density fallback.
    records = [copy.deepcopy(r) for r in bundle['proposed-safe-subset']['new_display_safe_records']
               if r['zone_code'] == zone]
    return {'state': 'DISPLAY_SAFE_PARAMETER' if records else 'EXCLUDED',
            'records': records, 'parcel_application_safe': False,
            'compliance_determined': False, 'capacity_determined': False,
            'runtime_integration_authorized': False}


def export_contract(result):
    """Lossless offline handoff proof; future UI must preserve this whole envelope."""
    if result.get('state') != 'DISPLAY_SAFE_PARAMETER':
        return json.dumps({'state': result.get('state'), 'records': []}, sort_keys=True)
    return json.dumps(result, sort_keys=True, ensure_ascii=False)
