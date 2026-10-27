# TruLot index safety foundation evidence

Packet 84 establishes production-domain canonical URLs, explicit index states,
rights-filtered public payloads, APN-only behavior, a noindex La Mesa parcel
route, and deterministic sitemap infrastructure with every activation gate off.

The browser review used a local Next.js development server with a loopback-only
dummy Supabase URL. It did not access production. The La Mesa route read only
sealed repository artifacts. The San Diego route therefore exercised its
documented source-unavailable state; source-backed San Diego states remain
covered by the existing fixture regressions and Packet 84 contract tests while
Packet 11 stays frozen.

`browser-results.json` records the reviewed route cases. `decision.json`
records the packet decision and preservation boundaries. `integrity.json`
records SHA-256 hashes for those two evidence files.

This evidence does not activate indexing or parcel sitemap entries and does not
represent deployment evidence.
