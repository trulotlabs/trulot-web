#!/usr/bin/env python3
"""Assemble reviewed source metadata and organizational inventory; no network."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/zoning-standards-v2'
VERSION = 'sd-residential-2026-09-24-research-v1'


def write(name, value):
    (DATA / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def main(source_dir):
    pages = json.loads((DATA / 'source-pages.json').read_text())
    rules = json.loads((DATA / 'rules.json').read_text())
    acquisition = json.loads((source_dir / 'acquisition.json').read_text()) + json.loads((source_dir / 'acquisition-extra.json').read_text())
    sources = {}
    titles = {'residential': 'SDMC Chapter 13 Article 1 Division 4: Residential Base Zones',
              'definitions': 'SDMC Chapter 11 Article 3 Division 1: Definitions',
              'measurement': 'SDMC Chapter 11 Article 3 Division 2: Rules for Calculation and Measurement',
              'updates': 'Adopted Land Development Code Updates', 'ccc2024': 'CCC September 2026 Executive Director report: certification review',
              'guide': 'Official Zoning Map Divisions: Residential Base Zones',
              'zoning-guide-chart': 'Official Zoning Map guide: historical designation/name crosswalk only',
              'portal': 'Searchable code portal: convenience copy disclaimer',
              'chapter13': 'City Clerk Chapter 13 document index', 'chapter15': 'City Clerk Chapter 15 document index',
              'update-list': '2026 LDC Update Citywide Master List'}
    families = {1: 'General Rules for Base Zones', 2: 'Open Space', 3: 'Agricultural', 5: 'Commercial', 6: 'Industrial', 7: 'Mixed-Use'}
    for s in acquisition:
        sid = s['source_id']
        rank = 1
        if sid.startswith('o') or sid == 'ccc2024': rank = 2
        if sid in ['guide', 'zoning-guide-chart', 'portal']: rank = 3
        if sid == 'update-list': rank = 4
        if sid == 'updates': rank = 2  # official effective-date material, not operative rule text
        if sid.startswith('div'):
            title = 'SDMC Chapter 13 Article 1 Division ' + sid[3:] + ': ' + families[int(sid[3:])]
        elif sid.startswith('pd'):
            title = 'SDMC Chapter 15 Article ' + sid[2:] + ': Planned District'
        else:
            title = titles.get(sid, sid.upper().replace('O2', 'O-2'))
        sources[sid] = {**s, 'title': title, 'publisher': 'California Coastal Commission' if sid == 'ccc2024' else 'City of San Diego',
                        'hierarchy_rank': rank, 'section_or_division': title,
                        'publication_date': None, 'adopted_date': None, 'effective_date': None,
                        'date_state': 'MULTIPLE_SECTION_HISTORIES_OR_NOT_STATED',
                        'applicability': 'See section-level version ledger; acquisition is not legal effect'}
    for sid, adopted, effective in [('o22109', '2026-06-15', '2026-07-15'), ('o22109-strikeout', '2026-06-15', '2026-07-15'),
                                     ('o21934', '2025-03-25', '2025-04-24'), ('o21934-strikeout', '2025-03-25', '2025-04-24'),
                                     ('o21836-strikeout', '2024-07-22', '2024-10-05')]:
        sources[sid].update(adopted_date=adopted, effective_date=effective,
                            date_state='OUTSIDE_COASTAL_DATE_ONLY', applicability='Geographic conditions in versions.json')
    write('sources.json', {'hierarchy': [
        {'rank': 1, 'authority': 'Official City Clerk Municipal Code'},
        {'rank': 2, 'authority': 'Adopted ordinances and official effective/certification materials'},
        {'rank': 3, 'authority': 'Official explanatory guides and convenience portal'},
        {'rank': 4, 'authority': 'Staff reports and update lists'},
        {'rank': 5, 'authority': 'TruLot deterministic transcription'},
        {'rank': 6, 'authority': 'TruLot derived calculations (none in this packet)'}],
        'conflict_policy': 'No silent lower-source override. Reconcile amendment/certification with codified text explicitly; unresolved conflicts block selection.',
        'raw_artifact_storage': str(source_dir), 'sources': sources})

    ordinances = [
        {'ordinance': 'O-21836', 'adopted_date': '2024-07-22', 'outside_effective_date': '2024-10-05',
         'coastal_effective_date': '2026-09-10', 'coastal_state': 'EFFECTIVE_IN_COASTAL',
         'source': ['o21836-strikeout', 'ccc2024', 'updates'],
         'certification': 'LCP-6-SAN-24-0038-3; CCC conditional 2026-02-05, City acceptance 2026-07-14, reported certification 2026-09-10',
         'acceptance_ordinance': 'O-22117; modifications to 143.0740/143.0743, outside this extraction',
         'sections': ['131.0420', '131.0422', '131.0431', '131.0443', '131.0445', '131.0446', '131.0464'],
         'superseded_by': {'131.0431': ['O-21934 outside Coastal'], '131.0422': ['O-22109 outside Coastal'],
                           '131.0443': ['O-22109 outside Coastal']},
         'note': 'July 2026 consolidated editor note is stale for 2024 certification; supersession is provision-specific.'},
        {'ordinance': 'O-21934', 'adopted_date': '2025-03-25', 'outside_effective_date': '2025-04-24',
         'coastal_effective_date': None, 'coastal_state': 'UNKNOWN', 'sections': ['131.0431(a)'],
         'source': ['o21934', 'o21934-strikeout', 'residential'], 'superseded_by': None,
         'change': 'REPEAL Table 131-04D footnote 7 and its RS-1-2 lot-area marker. It did not add an exception.',
         'historical_text_state': 'SUPERSEDED_OUTSIDE_COASTAL; do not apply as current exception',
         'note': 'Signed recital F and operative table govern; strikeout plain text alone is unsafe. No separate Coastal certification verified.'},
        {'ordinance': 'O-22109', 'adopted_date': '2026-06-15', 'outside_effective_date': '2026-07-15',
         'coastal_effective_date': None, 'coastal_state': 'PENDING_COASTAL_CERTIFICATION',
         'sections': ['131.0422', '131.0443(i)', '131.0448'], 'source': ['o22109', 'o22109-strikeout', 'residential', 'updates'],
         'superseded_by': None,
         'change': 'Fire Code Official may require a greater defensible-space buffer; accessory-building clarification and use-table changes. No amendment to 131.0431 tables.',
         'geographic_exception': 'Published MCAS Miramar Airport Influence Area Transition Zone exception; affected item not generalized to all parcels.',
         'grandfathering': 'Section 61: pre-effective applications deemed complete require separate applicability assessment; date alone is insufficient.'},
    ]
    versions = {'rule_set_version': VERSION, 'verified_as_of': '2026-09-24', 'snapshot_document_edition': '7-2026',
                'scope': 'Current outside-Coastal composite source snapshot only; not a historical-law database',
                'ordinances': ordinances,
                'profiles': [{'id': 'outside-current-snapshot', 'coastal_context': 'outside',
                              'state': 'EFFECTIVE_OUTSIDE_COASTAL', 'supported_as_of_dates': ['2026-09-24'],
                              'rule_set_version': VERSION, 'source_section': '131.0431 with dependent sections',
                              'components': ['Official 7-2026 codified text', 'O-21934 repeal', 'O-22109 dependent section changes'],
                              'effective_date': None, 'adopted_date': None, 'superseded_by': None,
                              'note': 'Composite has multiple enactment dates. It is not enacted wholesale by O-22109.'}],
                'unavailable_profiles': [
                    {'coastal_context': 'inside', 'state': 'UNKNOWN', 'reason': 'No fully verified Coastal composite; 2026 pending and 2025 certification unresolved'},
                    {'coastal_context': 'unknown', 'state': 'UNKNOWN', 'reason': 'Cannot choose outside law for unknown geography'}],
                'project_gates': ['new_application', 'outside_miramar_transition'],
                'freshness_policy': 'Only explicitly verified as-of date can resolve. Reacquisition, metadata review, and new review decision required for later dates.'}
    write('versions.json', versions)
    write('source-version-observation.json', {'verified_as_of': versions['verified_as_of'],
          'sources': {k: {'sha256': v['sha256'], 'url': v['url'], 'acquired_at': v['acquired_at']} for k, v in sources.items()},
          'ordinances': ordinances, 'profiles': versions['profiles']})

    # Keep every complete dependent section and its history. Do not evaluate text.
    dependencies = {}
    current = None
    for p in range(1, 100):
        text = pages[f'residential:{p}']['text']
        for line in text.splitlines():
            m = re.match(r'^\s*§?(131\.\d{4})\s+([A-Z].*)', line)
            if m:
                current = m[1]
                dependencies.setdefault(current, {'title': m[2], 'page_evidence': [], 'text_lines': [],
                                                 'evaluated': False, 'review_state': 'SOURCE_TEXT_ONLY'})
            if current:
                d = dependencies[current]
                if f'residential:{p}' not in d['page_evidence']: d['page_evidence'].append(f'residential:{p}')
                d['text_lines'].append(line)
    for d in dependencies.values():
        d['source_text_hash'] = hashlib.sha256('\n'.join(d['text_lines']).encode()).hexdigest()
    write('dependencies.json', dependencies)

    observed = json.loads((ROOT / 'data/base-zoning-v2/validation.json').read_text())['zoneInventory']
    residential = {r['zone_code'] for r in rules}
    rows = []
    direct_sources = [('div3', 'AGRICULTURAL'), ('div2', 'OPEN_SPACE'), ('div5', 'COMMERCIAL'),
                      ('div6', 'INDUSTRIAL'), ('pd16', 'PLANNED_DISTRICT')]
    explicit_headers = {'OC-1-1': ('div2', 'OPEN_SPACE', '131-02C'), 'OF-1-1': ('div2', 'OPEN_SPACE', '131-02C'),
                        'CP-1-1': ('div5', 'COMMERCIAL', '131-05C'), 'IS-1-1': ('div6', 'INDUSTRIAL', '131-06C'),
                        'OTOP-1-1': ('pd16', 'PLANNED_DISTRICT', '1516-01F'), 'OTOP-2-1': ('pd16', 'PLANNED_DISTRICT', '1516-01F')}
    for z in ['RMX-1', 'RMX-2', 'RMX-3', 'EMX-1', 'EMX-2', 'EMX-3']:
        explicit_headers[z] = ('div7', 'MIXED_USE', '131-07B')
    ccpd = {'CCPD-CORE': 'Core (C)', 'CCPD-BP': 'Ballpark Mixed-Use (BP)', 'CCPD-ER': 'Employment/Residential Mixed-Use (ER)',
            'CCPD-I': 'Industrial (I)', 'CCPD-MC': 'Mixed Commercial (MC)', 'CCPD-NC': 'Neighborhood Mixed-Use Center (NC)',
            'CCPD-OS': 'Open Space (OS)', 'CCPD-PC': 'Public/Civic (PC)', 'CCPD-RE': 'Residential Emphasis (RE)', 'CCPD-T': 'Transportation (T)'}
    chart_pages = {k: v for k, v in pages.items() if k.startswith('zoning-guide-chart:') and 15 <= v['page'] <= 19}
    for entry in observed:
        zone = entry['zoneCode']
        family, evidence, method = 'UNKNOWN', [], 'UNRESOLVED'
        if zone in residential:
            family, method = 'RESIDENTIAL', 'EXACT_CURRENT_TABLE_COLUMN'
            evidence = sorted({f"residential:{r['source_page']}" for r in rules if r['zone_code'] == zone})
        else:
            for sid, fam in direct_sources:
                matches = [k for k, p in pages.items() if p['source_id'] == sid and re.search(r'(?<![A-Z0-9-])' + re.escape(zone) + r'(?![A-Z0-9-])', p['text'])]
                if matches:
                    family, evidence, method = fam, matches[:2], 'EXACT_CODE_IN_OFFICIAL_DIVISION'
                    break
            if family == 'UNKNOWN' and zone in explicit_headers:
                sid, family, table = explicit_headers[zone]
                evidence = [k for k, p in pages.items() if p['source_id'] == sid and table in p['text']][:2]
                method = 'EXPLICIT_OFFICIAL_TABLE_HEADER_CROSSWALK'
            if family == 'UNKNOWN' and zone != 'UNZONED':
                matches = [k for k, p in chart_pages.items() if re.search(r'^\s*' + re.escape(zone) + r'\s', p['text'], re.M)]
                if matches: family, evidence, method = 'PLANNED_DISTRICT', matches, 'EXACT_OFFICIAL_HISTORICAL_NAME_CHART_ORGANIZATION_ONLY'
            if family == 'UNKNOWN' and zone in ccpd:
                matches = [k for k, p in pages.items() if p['source_id'] == 'pd6' and ccpd[zone] in ' '.join(p['text'].split())]
                if matches: family, evidence, method = 'PLANNED_DISTRICT', matches[:2], 'EXPLICIT_DISTRICT_NAME_ALIAS; NO_STANDARDS_INFERRED'
            if family == 'UNKNOWN' and zone == 'CVPD-MC':
                family, evidence, method = 'PLANNED_DISTRICT', [k for k, p in pages.items() if p['source_id'] == 'pd3' and '§153.0311' in p['text']], 'EXPLICIT_OFFICIAL_SECTION'
        rows.append({'raw_zone_code': zone, 'family': family, 'page_evidence': evidence, 'method': method,
                     'source_features': entry['sourceFeatures'], 'standards_supported': zone in residential,
                     'governing_residential_section': '131.0431' if zone in residential else None,
                     'note': 'Organizational classification only; no digit-derived standards; unknown is not unregulated'})
    write('zone-inventory.json', {'raw_code_count': len(rows), 'family_counts': dict(Counter(r['family'] for r in rows)),
                               'observed_residential_codes': [r['raw_zone_code'] for r in rows if r['family'] == 'RESIDENTIAL'],
                               'codified_residential_codes': sorted(residential), 'codes': rows})
    print(json.dumps({'families': dict(Counter(r['family'] for r in rows)), 'unknown': [r['raw_zone_code'] for r in rows if r['family'] == 'UNKNOWN'], 'dependencies': len(dependencies)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source_dir', type=Path)
    main(parser.parse_args().source_dir)
