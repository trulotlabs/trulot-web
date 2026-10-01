# Parcel Lookup V0 data

This directory contains a bounded, public-authority subset of the sealed Parcel V2 acquisition for development and test preview use. `source-records.json` is sanitized to parcel identity, geometry, and already-approved orientation facts. `corpus.json` and `benchmark-cases.json` are deterministic outputs of `scripts/parcel-lookup-v0/build.mjs`.

No owner data, private workbook values, production credentials, or production database exports are present.

`synthetic-acceptance-fixtures.json` is isolated test-only evidence. Its records
are labeled `SYNTHETIC_RANKING_FIXTURE` and `SYNTHETIC_NORMALIZATION_FIXTURE`, do
not enter `corpus.json`, and must never be represented as public parcel evidence.
