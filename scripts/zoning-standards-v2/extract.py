#!/usr/bin/env python3
"""Reproduce the code-table transcription from pinned official PDFs, offline.

Requires pdfplumber only for extraction; resolver/tests use the standard library.
Does not infer values from zoning codes or interpret legislative strikeouts.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/zoning-standards-v2'
VERSION = 'sd-residential-2026-09-24-research-v1'


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def normalized(text):
    return ' '.join((text or '').split())


def notes(text):
    text = re.sub(r'\b\d{3}\.\d{4}(?:\([a-z0-9]+\))*', '', text)
    return sorted({int(n) for group in re.findall(r'\((\d+(?:,\s*\d+)*)\)', text)
                   for n in group.split(',')})


def references(text):
    result = re.findall(r'\b\d{3}\.\d{4}(?:\([a-z0-9]+\))*', text)
    result += [normalized(m) for m in re.findall(r'Chapter\s+\d+,?\s+Article\s+\d+,?\s+Division\s+\d+', text)]
    return sorted(set(result))


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def main(source_dir):
    OUT.mkdir(parents=True, exist_ok=True)
    acquisition = json.loads((source_dir / 'acquisition.json').read_text())
    acquisition += json.loads((source_dir / 'acquisition-extra.json').read_text())
    for source in acquisition:
        if 'error' in source:
            raise ValueError(source)
        assert digest((source_dir / source['artifact']).read_bytes()) == source['sha256']
    source_index = {s['source_id']: s for s in acquisition}
    pages = {}
    # Full official legislative text is retained as evidence, not interpreted law.
    for source in acquisition:
        if source['artifact'].endswith('.pdf'):
            texts = subprocess.check_output(['pdftotext', '-layout', str(source_dir / source['artifact']), '-']).decode().split('\f')
            if not texts[-1].strip(): texts.pop()
            for p, text in enumerate(texts, 1):
                pages[f"{source['source_id']}:{p}"] = {
                    'source_id': source['source_id'], 'page': p, 'text': text,
                    'text_sha256': digest(text), 'artifact_sha256': source['sha256'],
                }
    write('source-pages.json', pages)

    raw_tables = {}
    with pdfplumber.open(source_dir / 'residential.pdf') as pdf:
        for p in list(range(34, 45)) + [62, 65, 66, 68]:
            table = pdf.pages[p - 1].find_tables()[0]
            raw_tables[str(p)] = {
                'rows': table.extract(),
                'boxes': [[list(cell) if cell else None for cell in row.cells]
                          for row in table.rows],
                'page_evidence': f'residential:{p}',
            }
    write('source-tables.json', raw_tables)

    # Exact footnote text from the pinned pdftotext layout extraction.
    layout = [pages[f'residential:{p}']['text'] for p in range(1, 100)]
    footnotes = {}
    spans = {'131-04D': (37, 'Footnotes for Table 131-04D', '(b)      RX Zones'),
             '131-04E': (38, 'Footnote for Table 131-04E', 'Ch. Art.'),
             '131-04G': (44, 'Footnotes for Table 131-04G', None)}
    for table, (p, start, end) in spans.items():
        text = layout[p - 1].split(start, 1)[1]
        if end:
            text = text.split(end, 1)[0]
        else:
            text = text.split('Ch. Art.', 1)[0] + '\n' + layout[44].split('(7-2026)', 1)[1].split('Ch.', 1)[0]
        for m in re.finditer(r'^\s*(\d+)\s*\n(.*?)(?=^\s*\d+\s*\n|\Z)', text, re.M | re.S):
            number, body = int(m[1]), normalized(m[2])
            footnotes[f'{table}:{number}'] = {
                'number': number, 'table': table, 'text': body,
                'source_text_hash': digest(body),
                'page_evidence': f'residential:{45 if table == "131-04G" and number >= 11 else p}',
                'references': references(body), 'state': 'SOURCE_TEXT',
            }
    # The source contains this dangling marker: retain and block interpretation.
    footnotes['131-04D:8'] = {
        'number': 8, 'table': '131-04D', 'text': None,
        'source_text_hash': None, 'page_evidence': 'residential:36',
        'references': [], 'state': 'MISSING_IN_SOURCE',
    }
    angle_note = 'The angled planes are measured from the vertical axis inward.'
    assert angle_note in normalized(pages['residential:62']['text'])
    footnotes['131-04H:1'] = {'number': 1, 'table': '131-04H', 'text': angle_note,
                             'source_text_hash': digest(angle_note), 'page_evidence': 'residential:62',
                             'references': [], 'state': 'SOURCE_TEXT'}
    assert len([k for k in footnotes if k.startswith('131-04G:')]) == 36
    write('footnotes.json', footnotes)

    # Explicit source-row catalogue; row coordinates are zero-based PDF table rows.
    common = {4: ('density_basis', None, 'BASIS'), 5: ('lot_area_min', 'sq_ft', 'MIN'),
              7: ('lot_width_min', 'ft', 'MIN'), 8: ('street_frontage_min', 'ft', 'MIN'),
              9: ('corner_lot_width_min', 'ft', 'MIN'), 10: ('lot_depth_min', 'ft', 'MIN'),
              12: ('front_setback', 'ft', 'CONDITIONAL'),
              13: ('interior_side_setback', 'ft', 'CONDITIONAL'),
              14: ('street_side_setback_min', 'ft', 'MIN'), 15: ('rear_setback_min', 'ft', 'MIN'),
              17: ('structure_height_max', 'ft', 'MAX')}
    overrides = {
        35: {5: ('floor_area_ratio_max', 'ratio', 'MAX')},
        36: {19: ('floor_area_ratio_max', 'ratio', 'MAX')},
        38: {4: ('structure_height_max', 'ft', 'MAX'), 5: ('floor_area_ratio_max', 'ratio', 'MAX')},
        40: {4: ('street_side_setback_min', 'ft', 'MIN'), 5: ('rear_setback_min', 'ft', 'MIN'),
             7: ('height_1_2_stories', 'ft', 'CONDITIONAL'), 8: ('height_3_stories', 'ft', 'CONDITIONAL'),
             9: ('lot_coverage_max', 'percent', 'MAX'), 11: ('far_1_2_stories', 'ratio', 'MAX'),
             12: ('far_3_stories', 'ratio', 'MAX')},
        41: {20: ('far_1_2_dwellings', 'ratio', 'MAX'), 21: ('far_3_7_dwellings', 'ratio', 'MAX')},
        42: {4: ('far_8_plus_dwellings', 'ratio', 'MAX')},
        43: {19: ('floor_area_ratio_max', 'ratio', 'MAX')},
    }
    catalogue, rules = {}, []
    for p in range(34, 45):
        table = raw_tables[str(p)]
        rows = table['rows']
        family = normalized(rows[1][2]).rstrip('-')
        codes = [f'{family}-{rows[2][c].rstrip("-")}-{rows[3][c]}' for c in range(2, len(rows[3]))]
        table_id = {'RS': '131-04D', 'RX': '131-04E', 'RT': '131-04F', 'RM': '131-04G'}[family]
        for r, row in enumerate(rows[4:], 4):
            if not any(normalized(v) for v in row[2:]):
                continue  # group header, preserved in raw table
            label = row[0]
            spec = overrides.get(p, {}).get(r)
            if spec is None and p in [34, 36, 37, 39, 41, 43]:
                spec = common.get(r)
            if spec is None:
                spec = (re.sub('[^a-z0-9]+', '_', normalized(label).split('[')[0].lower()).strip('_'), None, 'REFERENCE')
            standard, unit, operator = spec
            if standard == 'density_basis':
                unit = 'sq_ft_per_dwelling_unit' if family == 'RM' else 'dwelling_unit_per_lot'
            refs = references(label)
            # Common section text applies even where the table omits a cell marker.
            if standard == 'lot_area_min': refs += ['131.0441']
            if any(k in standard for k in ['width_min', 'frontage_min', 'depth_min']): refs += ['131.0442']
            if 'setback' in standard: refs += ['131.0443']
            if 'height' in standard: refs += ['131.0444']
            if 'coverage' in standard: refs += ['131.0445']
            if 'floor_area_ratio' in standard or standard.startswith('far_'): refs += ['131.0446']
            # These headings apply to multiple merged rows.
            if p == 40 and r in [7, 8]: refs += ['131.0444(d)']
            if p == 40 and r in [11, 12]: refs += ['131.0446(d)']
            conditions = []
            if standard.startswith('far_'): conditions.append(normalized(label))
            if standard.startswith('height_'): conditions.append(normalized(label))
            if 'corner_lot' in standard: conditions.append('corner lot')
            if standard == 'front_setback' and family in ['RT', 'RM']:
                conditions.append('Merged minimum/maximum or minimum/standard row: preserve labeled sequence; do not select a scalar')
            catalogue[f'{p}:{r}'] = {'table': table_id, 'row_label': label,
                'standard_type': standard, 'unit': unit, 'operator': operator,
                'zones': codes, 'row_references': sorted(set(refs)), 'conditions': conditions}
            for c, zone in enumerate(codes, 2):
                raw = row[c]
                n = notes(label + ' ' + (raw or ''))
                evidence = {'page_evidence': f'residential:{p}', 'table': table_id,
                    'row': r, 'column': c, 'row_label': label, 'zone_header': zone,
                    'cell_text': raw, 'bbox': table['boxes'][r][c]}
                rule_refs = sorted(set(refs + [ref for number in n for ref in footnotes[f'{table_id}:{number}']['references']]))
                clean = normalized(re.sub(r'\(\d+(?:,\s*\d+)*\)', '', raw or ''))
                if re.fullmatch(r'\d+(?:,\d{3})*(?:\.\d+)?', clean):
                    value = {'kind': 'number', 'number': float(clean.replace(',', ''))}
                elif clean in ['-', '--', '']:
                    value = {'kind': 'not_specified_in_table', 'number': None, 'source_symbol': clean}
                elif clean.replace(' ', '') in ['applies', 'varies', 'Permitted']:
                    value = {'kind': 'reference', 'text': clean, 'targets': rule_refs}
                else:
                    value = {'kind': 'source_expression', 'text': clean,
                             'row_labels': normalized(label), 'evaluated': False}
                missing = any(footnotes[f'{table_id}:{number}']['state'] == 'MISSING_IN_SOURCE' for number in n)
                rules.append({'rule_id': f'{VERSION}:{zone}:{p}:{r}', 'rule_set_version': VERSION,
                    'zone_code': zone, 'standard_type': standard, 'value': value,
                    'unit': unit, 'operator': operator, 'conditions': conditions,
                    'exceptions': [f'{table_id}:{number}' for number in n],
                    'applicability': {'version_profile': 'outside-current-snapshot', 'project_applicability_evaluated': False},
                    'source_section': '131.0431', 'source_table': table_id, 'source_page': p,
                    'source_text_hash': digest(json.dumps(evidence, sort_keys=True, ensure_ascii=False)),
                    'source_id': 'residential', 'source_evidence': evidence,
                    'effective_date': None, 'effective_date_basis': 'section history and version profile; snapshot date is not enactment date',
                    'derivation_class': 'DETERMINISTIC_TRANSCRIPTION',
                    'review_state': 'INTERPRETATION_REQUIRED' if missing else 'EXTRACTED',
                    'unresolved_dependencies': sorted(set(['131.0430', 'Chapter 11 Article 3', 'Chapter 13 Article 2', 'Chapter 14'] + rule_refs)),
                    'legal_review': False})
    write('row-catalogue.json', catalogue)
    write('rules.json', rules)

    # Supplemental tables retain raw ranges and ambiguous typography, never eval().
    lookups = {}
    for p, name, section in [(62, '131-04H', '131.0444(b)'), (65, '131-04I', '131.0445(c)'),
                              (66, '131-04J', '131.0446(a)'), (68, '131-04K', '131.0446(f)')]:
        lookups[name] = {'source_section': section, 'page_evidence': f'residential:{p}',
                        'rows': raw_tables[str(p)]['rows'], 'evaluated': False,
                        'exceptions': ['131-04H:1'] if p == 62 else [],
                        'review_state': 'INTERPRETATION_REQUIRED' if p in [65, 66, 68] else 'EXTRACTED',
                        'issues': (['Source prints 4.001 - 5,000; no silent decimal-to-thousands correction.',
                                    'Discrete printed lot-area intervals leave fractional boundary interpretation unresolved.'] if p == 66 else
                                   ['Source prints More than 10 stories or 120 feet after 9 stories or 108 feet; exact 10-story and inconsistent story/height conditions are not inferred.'] if p in [65, 68] else [])}
    write('supplemental-tables.json', lookups)
    print(json.dumps({'rules': len(rules), 'zones': len({r['zone_code'] for r in rules}),
                      'footnotes': len(footnotes), 'source_pages': len(pages)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source_dir', type=Path)
    main(parser.parse_args().source_dir)
