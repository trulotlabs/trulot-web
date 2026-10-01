# Parcel V2 acquisition identity reconciliation

The canonical acquisition identifier is the exact, case-sensitive literal
`sangis-20260924T183743Z`.

The original acquisition manifest, immutable source metadata, import manifests,
validated import run `724ff836-eedc-594e-93c5-c80a63de65f7`, and production
metadata all use that literal. They agree on the normalized-row SHA-256
`95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868`,
1,088,430 accepted rows, 1,328 quarantined rows, 393,733 City rows and distinct
City APNs, and City APN fingerprint
`93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25`.

The later Packet 44/45 spelling `SANGIS-20260924T183743Z` referred to that same
sealed acquisition, as proven by those immutable values and the run UUID. It was
not the canonical stored identity. Packet 46A corrects the derived lookup
migration, rehearsal, tests, and current documentation to the original literal.

Acquisition identifiers are compared as exact case-sensitive values. Code must
not use `lower()`, `upper()`, a case-insensitive operator, or comparison-time
normalization. The repository and database store one canonical representation,
and builders fail closed for every other literal, including altered-case forms.

This reconciliation changes no production metadata and does not authorize the
lookup migration or builder to run in production.
