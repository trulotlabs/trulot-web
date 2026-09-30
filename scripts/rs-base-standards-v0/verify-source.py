#!/usr/bin/env python3
"""Verify a local official Division 4 PDF against the sealed RS V0 source."""
import argparse,hashlib,json
from pathlib import Path
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'data/rs-base-standards-v0'
def canonical(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(b): return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(); p.add_argument('pdf',type=Path); a=p.parse_args()
 sources=json.loads((DATA/'sources.json').read_text()); sealed=json.loads((DATA/'source-table.json').read_text())
 expected=sources['sources']['residential_division_4']
 actual=digest(a.pdf.read_bytes())
 if actual!=expected['sha256']: raise SystemExit(f'SOURCE_DRIFT: expected {expected["sha256"]}, observed {actual}')
 with pdfplumber.open(a.pdf) as pdf:
  if len(pdf.pages)!=expected['pages']: raise SystemExit('SOURCE_DRIFT: page count')
  rows={str(n):pdf.pages[n-1].find_tables()[0].extract() for n in [33,34,35]}
 semantic=digest(canonical(rows).encode())
 if semantic!=sealed['semantic_sha256']: raise SystemExit('SOURCE_DRIFT: RS table semantics')
 print(json.dumps({'state':'CURRENT_RS_SOURCE_MATCH','edition':expected['edition'],'sha256':actual,'table_semantic_sha256':semantic},sort_keys=True))
if __name__=='__main__': main()
