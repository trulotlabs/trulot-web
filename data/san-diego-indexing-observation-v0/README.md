# San Diego indexing observation v0

Packet 97 observed production deployment `dpl_DcoZSpiiCt2wAZGGnrniKEymTJJi` at commit `b5d444b41e790672079f62bc7f28817ea3cce504` without changing production state.

`SEARCH_CONSOLE_UNAVAILABLE`. No Google discovery, crawl, index, canonical-selection, query, impression, click, CTR, or position count is inferred. The available Vercel runtime source retained only a short recent window and did not expose crawler identity, so ordinary request changes are not attributed to crawlers.

The exact 5,000-row live sitemap matched the immutable launch receipt. A deterministic live sample of 50 launch pages passed index/canonical/privacy/content checks, and 50 controls (10 each: eligible outside cohort, multi-zone, indeterminate, unmapped, APN-only) remained noindex. La Mesa and private/search routes remained noindex.

The eight-request parallel health probe measured median 1269 ms, p95 4329 ms, maximum 9614 ms, 12 above 3 seconds, and 1 above 5 seconds. This probe intentionally generated concurrent initial and secondary work and is not directly comparable to Packet 96's serial warm round 2 (median 608 ms, p95 1,769 ms, maximum 2,057 ms, none above 3 seconds). No runtime error cluster, snapshot failure, privacy-filter failure, or serializer exclusion was found. Two alternate-slug requests emitted canonical-mismatch metrics and redirected; neither path was in the completed 100-page sample, which ended with exact canonical parity. The available logs cannot attribute those two requests to a crawler, user, or monitor.

`next-45000-candidates.ndjson.gz` prepares deterministic offline expansion membership only. It is not imported by runtime code, is not activated, and changes no sitemap or robots behavior. Option A totals 10,000, Option B totals 25,000, and Option C totals 50,000. Option C requires two 25,000-URL parcel shards plus a sitemap index before activation.

Decision: `SAN_DIEGO_INDEXING_OBSERVATION_HEALTHY_HOLD_5000`.

Next move: `NEXT_TRULOT_STEP: CONTINUE_INDEXING_OBSERVATION`.
