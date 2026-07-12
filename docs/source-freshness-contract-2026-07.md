# TruLot Source Freshness Contract — July 2026

Date: 2026-07-11

## Purpose

This contract prevents TruLot from reusing one timestamp as the freshness claim for unrelated datasets.

## Required timestamp meanings

### Source effective date

- Meaning: when the publisher says the dataset or rule set is effective or published.
- Example: zoning map vintage, assessor roll effective year, permit-system publication date.
- Current status in repo: usually `unknown` or `unverified`.

### Acquisition timestamp

- Meaning: when TruLot obtained a source extract or download.
- Current status in repo: missing for current foundational datasets.

### Import completion timestamp

- Meaning: when the ETL/import finished loading the source into TruLot-managed storage.
- Current status in repo: missing for current foundational datasets.

### Database object rebuild timestamp

- Meaning: when a derived database object or view-backed table was last rebuilt.
- Current evidence: `public.parcel_page_api_v2.generated_at` and `public.parcel_primary_project_v1.generated_at` can support this meaning for those derived parcel/project records only.
- Prohibition: this timestamp is not a permit-source freshness receipt and is not an overlay-source effective date.

### Page calculation timestamp

- Meaning: when the current Parcel Page request assembled its response.
- Current implementation: used in source-table wording for mapped zoning, permit, and overlay readouts when source-effective/import receipts are unavailable.

## Implementation decisions in this sprint

- The Parcel Page receipt table now distinguishes:
  - parcel-view rebuild time
  - page calculation time
  - source effective date state (`unknown` or `unverified`)
- The page header wording now says `Parcel view last rebuilt ...` instead of a generic `Data last refreshed ...`.
- Dataset manifests store explicit unknown states instead of blank values or guessed dates.

## Current known limits

- The repository still does not contain:
  - source acquisition receipts
  - import completion logs
  - row-count or checksum receipts for the live production imports
- Because that evidence is absent, this sprint does not upgrade any source-vintage claims beyond what the remote schema and repository can prove.
