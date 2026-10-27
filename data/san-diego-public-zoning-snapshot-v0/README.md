# San Diego public zoning snapshot v0

Deterministic, public-safe, APN-prefix shards derived from sealed Packet 79 zoning/Coastal evidence and the sealed 31-profile Packet 82 registry. The snapshot contains no feasibility result, private property intelligence, permit currentness, geometry, internal paths, or production database state.

The runtime gate is `TRULOT_SD_PUBLIC_ZONING_SNAPSHOT=1`; it is off by default and independent from `TRULOT_SD_INDEXING`. The Packet 84 code kill switch and both sitemap activation flags remain closed. Turning this snapshot gate off is the complete rollback and restores the prior Parcel Page zoning source without database, canonical, or sitemap changes.

The 208 gzip shards total about 4.45 MB and are keyed by the first three APN digits. The manifest and every shard have immutable SHA-256 receipts; runtime requests validate the manifest, population, version, shard receipt, row count, schema, APN identity, and source receipt before returning data. `architecture.json` records the serving choice and Packet 11 disposition. `benchmark.json` records the deterministic browser/parity cohort.
