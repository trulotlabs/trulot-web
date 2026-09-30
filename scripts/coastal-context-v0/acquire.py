#!/usr/bin/env python3
"""Verify an immutable Coastal Context V0 acquisition without network access."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

DEFAULT = Path('/Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z')

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def verify(root: Path) -> int:
    receipt=json.loads((root/'acquisition.json').read_text())
    errors=[]
    for name,expected in receipt['artifacts'].items():
        p=root/name
        if not p.is_file(): errors.append(f'missing {name}'); continue
        if p.stat().st_size != expected['byte_size']: errors.append(f'byte size {name}')
        if sha(p) != expected['sha256']: errors.append(f'sha256 {name}')
    count=json.loads((root/'feature-count.json').read_text())['count']
    features=len(json.loads((root/'coastal-overlay.geojson').read_text())['features'])
    if count != receipt['feature_count'] or features != receipt['feature_count']: errors.append('feature count')
    if errors: raise SystemExit('Acquisition verification failed: '+', '.join(errors))
    print(f"PASS acquisition {receipt['acquisition_id']}: {features} features, {len(receipt['artifacts'])} artifacts")
    return 0

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--verify-dir',type=Path,default=DEFAULT); a=p.parse_args(); raise SystemExit(verify(a.verify_dir))
