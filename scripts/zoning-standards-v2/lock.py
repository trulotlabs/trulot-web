#!/usr/bin/env python3
"""Explicitly seal reviewed research artifacts; never called by the resolver.

Regenerating this record is a new review operation, not a source drift remedy.
Do not run it to make an unexpected source change pass validation.
"""
import json
from resolver import DATA, sha, canonical_sha

files = ['sources', 'source-pages', 'source-tables', 'footnotes', 'row-catalogue',
         'rules', 'supplemental-tables', 'versions', 'source-version-observation',
         'dependencies', 'zone-inventory', 'review', 'fixtures', 'rule-schema']
lock = {}
for stem in files:
    path = DATA / (stem + '.json')
    value = json.loads(path.read_text())
    lock[path.name] = {'file_sha256': sha(path.read_bytes()), 'canonical_sha256': canonical_sha(value)}
(DATA / 'integrity.json').write_text(json.dumps(lock, indent=2) + '\n')
print('Sealed', len(lock), 'review artifacts')
