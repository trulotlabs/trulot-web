# RS base standards V0 tools

These tools are offline and standard-library-only except `verify-source.py`, which uses the repository's existing `pdfplumber` dependency to inspect a supplied local official PDF.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/rs-base-standards-v0/build.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/rs-base-standards-v0/test.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/rs-base-standards-v0/verify-source.py /path/to/Ch13Art01Division04.pdf
```

The resolver consumes exact zone codes and mapping states. It returns separate source records and never accepts parcel area, calculates compliance, blends split zones, or calculates development capacity.
