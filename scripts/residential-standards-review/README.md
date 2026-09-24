# Residential standards review closure

Offline review tooling only. No Parcel Serving or Parcel V1 imports, database calls,
capacity calculations, migrations, or credentials. Packet 12 is retained unchanged.

The approved artifact is
`data/residential-standards-review/residential_standards_v2_integration_safe.json`.
Its 97 entries are **base-table parameters**, not effective parcel minimums or
compliance decisions. The contract requires outside Coastal, a new application,
outside the Miramar transition exception, explicit lot context, and the reviewed
2026-09-24 snapshot. Inside/unknown Coastal and every other date fail closed.

The gate requires every pinned public source file on each selection. A source-path
manifest is a JSON object mapping each source ID in `source-observation.json` to a
local downloaded file. PDFs/HTML are external, URL/hash-pinned public evidence;
they are not bundled dependencies or silently downloaded by tests. Missing files
invalidate selection. No installation or package changes are needed in this packet.
Audit replay needs the existing Python PyMuPDF installation; the gate uses stdlib.

From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-standards-review/audit.py /path/to/residential.pdf --output /tmp/residential-review-replay
PYTHONDONTWRITEBYTECODE=1 python3 scripts/residential-standards-review/test.py /path/to/source-paths.json
PYTHONDONTWRITEBYTECODE=1 python3 scripts/zoning-standards-v2/test.py
```

`audit.py` independently reads glyphs with PyMuPDF instead of Packet 12's
pdfplumber/pdftotext pipeline. It checks ordered content, separate superscript
markers, exact row/column headers, units, normalized values, captions, sections,
and footnotes, after validating all Packet 12 evidence. It cannot approve a new
family, expand the fixed 97-ID authority decision, or refresh the integrity seal.

`gate.select` checks the review seal, Packet 12 hashes, actual source files, full
authority observation, scope, date, geography, application, airport, and corner
conditions. `timeline_version` is a documentary interval lookup, not a historical
standards API. Neither function is integrated into product code.

Authority observation is a dated review input, not an automatic legal monitor.
Hash identity alone cannot establish that no newer ordinance exists. New/conflicting
authority, missing authority, changed dates/certifications, missing tables/sections,
or a later use date invalidate the approved observation. Refresh requires public
source acquisition and another substantive review; there is no auto-reseal command.
The local integrity file is a review trust anchor, not a cryptographic signature
against an attacker who can replace both evidence and the trust anchor.

See `docs/residential-standards-review-closure.md` for the complete source chain,
remaining exclusions, independent review, and commands/results.
