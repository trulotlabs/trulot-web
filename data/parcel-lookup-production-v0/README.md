# Parcel Lookup Production V0 evidence

`rehearsal.json` is regenerated from the sealed local Parcel V2 acquisition by
`node scripts/parcel-lookup-production-v0/rehearse.mjs`. The script builds and
deletes a disposable SQLite FTS5 index containing all 393,733 accepted City of
San Diego identities. It does not connect to Supabase or any production system.

SQLite measurements demonstrate full-corpus indexed behavior locally. They do
not substitute for PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` or production-like
network latency, which remain gates for the bounded implementation packet.
