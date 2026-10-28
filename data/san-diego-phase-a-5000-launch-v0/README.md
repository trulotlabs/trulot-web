# San Diego Phase A 5,000 launch authority

`launch-receipt.json` is the immutable publication authority for the first San Diego indexing cohort. Its 5,000 entries come byte-for-byte from the sealed identity-v2 initial cohort and are bound to `sd-public-zoning-2026-10-27-v0`.

Every entry records the APN, production canonical URL, identity version, zoning snapshot version, cohort version, controlling `lastmod`, and the complete inclusion reason. `integrity.json` records the receipt SHA-256 plus independent APN and canonical-URL fingerprints.

Runtime indexing requires all of the following:

- the code authorization for San Diego Phase A;
- `TRULOT_SD_INDEXING=1`;
- `TRULOT_SD_PUBLIC_ZONING_SNAPSHOT=1`;
- membership in this exact receipt;
- a readable immutable snapshot row that remains `SINGLE_ZONE` with unambiguous Coastal state.

La Mesa remains disabled. Removing `TRULOT_SD_INDEXING` or setting it to `0` is the one-step indexing rollback: cohort pages return to `noindex` and all 5,000 parcel entries disappear from the sitemap while parcel routes and the zoning snapshot may remain available.

Launch pages retain `noarchive` as a conservative cache control. This does not change their `index,follow` status.
