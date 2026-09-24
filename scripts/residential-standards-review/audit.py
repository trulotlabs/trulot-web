#!/usr/bin/env python3
"""Offline second-engine source audit. Does not edit Packet 12 or approve law.

PyMuPDF reads glyphs independently of Packet 12's pdfplumber/pdftotext pipeline.
Only an explicit reviewed allowlist can become an integration candidate.
"""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'data/zoning-standards-v2'
DATA = ROOT / 'data/residential-standards-review'


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(value).hexdigest()


def compact(text):
    return re.sub(r'\s+', '', text or '')


def parts(text):
    """Keep ordered content, separating superscript note placement only."""
    notes = sorted(re.findall(r'\(\d+(?:,\s*\d+)*\)', text))
    return compact(re.sub(r'\(\d+(?:,\s*\d+)*\)', '', text)), [compact(n) for n in notes]


class Source:
    def __init__(self, path):
        import fitz
        self.document = fitz.open(path)
        self.sha256 = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        self.cache = {}

    def glyphs(self, page, box):
        if page not in self.cache:
            self.cache[page] = [c for b in self.document[page - 1].get_text('rawdict')['blocks']
                                if 'lines' in b for line in b['lines']
                                for span in line['spans'] for c in span['chars']]
        x0, y0, x1, y1 = box
        return [c for c in self.cache[page]
                if x0 <= (c['bbox'][0] + c['bbox'][2]) / 2 < x1
                and y0 <= (c['bbox'][1] + c['bbox'][3]) / 2 < y1]

    def text(self, page, box):
        return ''.join(c['c'] for c in self.glyphs(page, box))


def verify_cell(rule, tables, source):
    e = rule['source_evidence']
    page, row, col = rule['source_page'], e['row'], e['column']
    table = tables[str(page)]
    glyphs = source.glyphs(page, e['bbox'])
    raw = ''.join(c['c'] for c in glyphs)
    header = lambda r, c: compact(source.text(page, table['boxes'][r][c]))
    zone = header(1, 2).rstrip('-') + '-' + header(2, col).rstrip('-') + '-' + header(3, col)
    label = source.text(page, table['boxes'][row][0])
    content, markers = parts(raw)
    kind, value = rule['value']['kind'], rule['value']
    normalized = False
    try:
        if kind == 'number':
            normalized = Decimal(content.replace(',', '')) == Decimal(str(value['number']))
        elif kind == 'not_specified_in_table':
            normalized = content == compact(value['source_symbol']) and value['number'] is None
        else:
            normalized = content == compact(value['text'])
    except InvalidOperation:
        pass
    unit = rule['unit']
    lower = compact(label).lower()
    # FAR subordinate rows inherit the visible FAR group heading, including continuation.
    unit_ok = (unit is None or
               (unit == 'ft' and '(ft)' in lower) or
               (unit == 'sq_ft' and '(sf)' in lower) or
               (unit == 'dwelling_unit_per_lot' and '(duperlot)' in lower) or
               (unit == 'sq_ft_per_dwelling_unit' and '(sfperdu)' in lower) or
               (unit == 'percent' and '(%)' in lower) or
               (unit == 'ratio' and ('floorarearatio' in lower or
                (page, row) in {(40, 11), (40, 12), (41, 20), (41, 21), (42, 4)})))
    checks = {
        'ordered_cell_and_markers': parts(raw) == parts(e['cell_text']),
        'row_label': compact(label) == compact(e['row_label']),
        'column_zone': zone == rule['zone_code'],
        'normalized_value': normalized,
        'unit_evidence': unit_ok,
        # Continuation pages omit the caption; verify their column header plus
        # the explicit first page of that same table, never infer from zone digits.
        'table_caption': rule['source_table'] in source.document[
            {'131-04D': 34, '131-04E': 37, '131-04F': 39, '131-04G': 41}[rule['source_table']] - 1].get_text(),
    }
    return {'checks': checks, 'independent_cell_text': raw.strip(),
            'independent_zone_header': zone, 'independent_row_label': label.strip(),
            'glyph_evidence_sha256': digest(glyphs), 'glyph_count': len(glyphs)}


def main(pdf, output):
    bundle = {p.stem: json.loads(p.read_text()) for p in BASE.glob('*.json')}
    spec = importlib.util.spec_from_file_location('packet12_resolver', ROOT / 'scripts/zoning-standards-v2/resolver.py')
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    errors = validator.validate(bundle)
    if errors:
        raise ValueError(errors)
    source = Source(pdf)
    assert source.sha256 == bundle['sources']['sources']['residential']['sha256'], 'Source hash mismatch'
    review = json.loads((DATA / 'authority-review.json').read_text())
    allow = set(review['approved_rule_ids'])
    assert review['scope'] == 'BASE_TABLE_PARAMETERS_ONLY'
    assert review['applicability']['coastal_context'] == 'outside'
    assert review['applicability']['as_of'] == '2026-09-24'
    expected = {r['rule_id'] for r in bundle['rules']
                if r['standard_type'] in {'lot_width_min', 'corner_lot_width_min', 'lot_depth_min'}
                and not (r['zone_code'] == 'RX-1-2' and r['standard_type'] != 'lot_depth_min')}
    assert allow == expected and len(allow) == 97, 'Approval list exceeds independently reviewed scope'
    ledger, safe = [], []
    for rule in bundle['rules']:
        proof = verify_cell(rule, bundle['source-tables'], source)
        missing = [n for n in rule['exceptions'] if bundle['footnotes'][n]['text'] is None]
        proof['checks']['section_exists'] = '131.0431' in source.document[32].get_text()
        proof['attached_footnote_checks'] = {}
        for key in rule['exceptions']:
            note = bundle['footnotes'][key]
            if note['text'] is None:
                proof['attached_footnote_checks'][key] = 'MISSING_IN_SOURCE'
            else:
                p = int(note['page_evidence'].split(':')[1])
                matched = compact(note['text']) in compact(source.document[p - 1].get_text())
                proof['attached_footnote_checks'][key] = 'INDEPENDENT_TEXT_MATCH' if matched else 'MISMATCH'
                proof['checks']['footnote_text:' + key] = matched
        selected = rule['rule_id'] in allow
        state = ('SOURCE_INCOMPLETE' if not all(proof['checks'].values()) else
                 'INTERPRETATION_REQUIRED' if missing or rule['value']['kind'] == 'source_expression' else
                 'SOURCE_VERIFIED' if selected else 'APPLICABILITY_UNRESOLVED')
        entry = {'rule_id': rule['rule_id'], 'prior_state': rule['review_state'],
                 'final_state': state, 'source_document_sha256': source.sha256,
                 'source_section': rule['source_section'], 'source_table': rule['source_table'],
                 'source_page': rule['source_page'], 'row': rule['source_evidence']['row'],
                 'column': rule['source_evidence']['column'], **proof,
                 'packet12_evidence_integrity_and_reference_attachment': True,
                 'missing_footnotes': missing, 'version_resolved_for_scope': selected,
                 'applicability_resolved_for_scope': selected,
                 'conflicting_authority_review': 'CLEARED_FOR_BOUNDED_SCOPE' if selected else 'NOT_CLEARED',
                 'reason': ('Explicit authority review permits this base-table parameter only.' if selected else
                            'Orphan marker; historical deletion does not repair current table.' if missing else
                            'Ordered source expression retained; no scalar interpretation.' if rule['value']['kind'] == 'source_expression' else
                            'Source transcription is evidence, not closure of all governing exceptions and operative dependencies.')}
        ledger.append(entry)
        if selected:
            assert state == 'SOURCE_VERIFIED', (rule['rule_id'], proof)
            assert rule['value']['kind'] == 'number' and not rule['exceptions']
            safe.append({'rule_id': rule['rule_id'], 'zone_code': rule['zone_code'],
                         'standard_type': rule['standard_type'], 'value': rule['value']['number'],
                         'unit': rule['unit'], 'operator': rule['operator'], 'conditions': rule['conditions'],
                         'scope': 'BASE_TABLE_PARAMETERS_ONLY', 'review_state': state,
                         'version_profile': 'outside-2026-09-24-reviewed-dimensions',
                         'source_evidence': rule['source_evidence'],
                         'source_sha256': source.sha256,
                         'dependency_record': 'dimension-dependencies.json',
                         'authority_review': 'authority-review.json'})
    assert set(x['rule_id'] for x in safe) == allow
    coordinates = [(x['source_page'], x['row'], x['column']) for x in ledger]
    audit = {'rule_count': len(ledger), 'zone_count': len({r['zone_code'] for r in bundle['rules']}),
             'duplicate_coordinates': len(coordinates) - len(set(coordinates)),
             'cell_check_failures': [x['rule_id'] for x in ledger if not all(x['checks'].values())],
             'final_states_all': dict(Counter(x['final_state'] for x in ledger)),
             'final_states_previously_extracted': dict(Counter(x['final_state'] for x in ledger if x['prior_state'] == 'EXTRACTED')),
             'safe_count': len(safe), 'safe_zones': sorted({x['zone_code'] for x in safe}),
             'source_engine': 'PyMuPDF glyph centers; ordered content and separately checked superscript markers',
             'superscript_order_differences': sum(compact(x['independent_cell_text']) != compact(r['source_evidence']['cell_text']) for x, r in zip(ledger, bundle['rules']))}
    output.mkdir(parents=True, exist_ok=True)
    for name, value in [('cell-review.json', ledger), ('residential_standards_v2_integration_safe.json', safe), ('audit-results.json', audit)]:
        (output / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='Explicit output; audit never silently refreshes review approval or seals')
    args = parser.parse_args()
    main(args.pdf, args.output)
