#!/usr/bin/env python3
"""Offline verification of freshly acquired source files and reviewed metadata."""
import argparse
import json
from pathlib import Path
from resolver import load, sha, check_source_version, verify_integrity

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source_dir', type=Path)
parser.add_argument('--observation', type=Path, required=True,
                    help='Explicitly reviewed acquisition/effective-date/Coastal metadata')
args = parser.parse_args()
bundle = load()
errors = verify_integrity() + check_source_version(bundle, json.loads(args.observation.read_text()))
for sid, source in bundle['sources']['sources'].items():
    path = args.source_dir / source['artifact']
    if not path.is_file() or sha(path.read_bytes()) != source['sha256']:
        errors.append(f'{sid}: SOURCE_ARTIFACT_DRIFT_OR_MISSING')
print(json.dumps({'state': 'REVIEW_REQUIRED' if errors else 'PINNED_ACQUISITION_VERIFIED',
                  'verified_as_of': bundle['versions']['verified_as_of'], 'errors': errors,
                  'limitations': 'No live network check; later law and unresolved Coastal composite are not approved.'}, indent=2))
raise SystemExit(1 if errors else 0)
