#!/usr/bin/env python3
"""Record Packet 12's completed independent review, not automatic parse approval.

This one-packet evidence assembly is deliberately separate from extract.py.
Only explicitly inspected source coordinates are promoted to SOURCE_VERIFIED.
"""
import json
from resolver import DATA

rules = json.loads((DATA / 'rules.json').read_text())
coordinates = {('RS-1-7', 34, row) for row in [4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]}
coordinates.add(('RM-1-1', 41, 4))
coordinates.update((z, 43, 4) for z in ['RM-3-7', 'RM-3-8', 'RM-3-9', 'RM-4-10', 'RM-4-11', 'RM-5-12'])
ids = []
for rule in rules:
    if (rule['zone_code'], rule['source_page'], rule['source_evidence']['row']) in coordinates:
        rule['review_state'] = 'SOURCE_VERIFIED'
        ids.append(rule['rule_id'])
assert len(ids) == 19
(DATA / 'rules.json').write_text(json.dumps(rules, indent=2, ensure_ascii=False) + '\n')
review = {
    'review_id': 'packet12-independent-adversarial-2026-09-24',
    'reviewer': 'Separate Astra reviewer /root/version_review; initial extractor /root',
    'legal_review': False,
    'scope': 'Independent legal-version chain, architecture, adversarial API mutations, RS-1-7 rendered table and RM density spot checks',
    'source_verified_rule_ids': ids,
    'unreviewed_rule_policy': 'All other cells remain EXTRACTED, except source-defective rows remain INTERPRETATION_REQUIRED. Tests never promote review state.',
    'findings': [
        {'id': 'R1', 'finding': 'Unmarked table cells lacked governing section dependencies', 'correction': 'Explicit section links for area/dimensions/setbacks/height/coverage/FAR; full section text retained', 'state': 'CORRECTED'},
        {'id': 'R2', 'finding': 'Chapter/Article/Division reference targets omitted', 'correction': 'Structured chapter references preserved, including dwelling-unit protection', 'state': 'CORRECTED'},
        {'id': 'R3', 'finding': 'Invented source/applicability and review promotion accepted', 'correction': 'Semantic invariants and independently recorded review IDs', 'state': 'CORRECTED'},
        {'id': 'R4', 'finding': 'Edited Coastal profile could select outside rules inside', 'correction': 'Version/source metadata reconciled with pinned observation; exported API integrity checked', 'state': 'CORRECTED'},
        {'id': 'R5', 'finding': 'Supplemental/dependency evidence mutable through exported API', 'correction': 'Canonical integrity verification of full bundle before resolution, same boundary as CLI', 'state': 'CORRECTED'},
        {'id': 'R6', 'finding': '131-04H angle-axis footnote not explicitly linked', 'correction': 'Footnote 1 captured and linked; angles are measured from vertical inward', 'state': 'CORRECTED'},
        {'id': 'R7', 'finding': 'Ambiguous printed lookup intervals only generically flagged', 'correction': 'Specific 4.001 typo/fractional interval and more-than-10-stories issues retained as interpretation required', 'state': 'UNRESOLVED_SOURCE_INTERPRETATION'},
        {'id': 'R8', 'finding': 'Strikeout plain text initially mistaken for current 2025 exception', 'correction': 'Rendered deletion and signed O-21934 recital F establish repeal; withdrawn interpretation was never emitted as a current rule', 'state': 'CORRECTED'},
        {'id': 'R9', 'finding': 'Coastal composite incomplete; 2025 certification unverified and 2026 pending', 'correction': 'Inside and unknown context fail closed; no inferred dates', 'state': 'UNRESOLVED_APPLICABILITY'},
        {'id': 'R10', 'finding': 'Orphan Table131-04D bedroom footnote8 marker', 'correction': 'Seven dash cells retained with missing-in-source evidence and interpretation-required state', 'state': 'UNRESOLVED_SOURCE_INTERPRETATION'}
    ],
    'assessment': 'Sourced unevaluated research representation acceptable after fixes and tests; no general development-standards integration readiness',
    'decision': 'RESIDENTIAL_ZONING_STANDARDS_V2_PASS',
    'readiness': 'ZONING_STANDARDS_REQUIRE_FURTHER_REVIEW'
}
(DATA / 'review.json').write_text(json.dumps(review, indent=2) + '\n')
print('Recorded independent review of 19 specified source coordinates')
