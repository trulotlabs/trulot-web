# Parcel Lookup V0 private installation runbook

This runbook is inert. Packet 45 did not execute any step against production.
Use it only after a separate authorization names the production project, exact
migration, operator, maintenance window, and rollback owner.

## Preconditions

1. Keep `TRULOT_PARCEL_LOOKUP_V0` unset or set to `0` in every production
   environment. Confirm `/parcel-lookup` and `/api/parcel-lookup` return 404.
2. Verify the repository commit and migration SHA reviewed for installation.
3. Verify Parcel V1 health and record counts for selected snapshots and both V2
   serving relations. The lookup installation must not change them.
4. Confirm Parcel Base V2 contains acquisition
   `SANGIS-20260924T183743Z` and validated parcel-only run
   `724ff836-eedc-594e-93c5-c80a63de65f7` with status `VALIDATED`, a non-null
   completion timestamp, no zoning acquisition, accepted count `1,088,430`, and
   normalized-row SHA-256
   `95c92f14bf4489946c6632f8032c2e08735b8fec11940cdace69db19c0625868`.

## Authorized installation sequence

1. Apply only `20261001203830_parcel_lookup_v0_bounded.sql` through the approved
   migration mechanism. Keep the application flag off.
2. Inspect ownership, `prosecdef`, fixed empty `search_path`, 1.5-second
   statement timeout, RLS, and grants. `public`, `anon`, `authenticated`, and
   `service_role` must have no direct table privilege. Only `service_role` may
   execute the fixed-shape search RPC.
3. Invoke `trulot_v2.build_parcel_lookup_v0()` once. It must fail closed on any
   source identity, seal, status, count, or non-empty-target mismatch.
4. Require exactly `393,733` rows and `393,733` distinct APNs, `14,846`
   missing-address identities retained, and APN-set SHA-256
   `93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25`.
5. Run the reviewed exact APN, APN prefix, exact address, unit address, and
   token-prefix `EXPLAIN (ANALYZE, BUFFERS)` probes. Stop if a normal lookup
   performs a full materialization sequential scan or exceeds the approved
   latency investigation bounds.
6. With a server-only service credential, smoke-test only the bounded RPC and
   private API. Confirm anonymous/authenticated RPC calls and all direct table
   reads fail. Confirm payloads contain no internal IDs, hashes, SQL, database
   errors, zoning, Coastal data, or unfinished intelligence.
7. Enable `TRULOT_PARCEL_LOOKUP_V0=1` only in the explicitly authorized private
   internal environment. Do not add navigation, sitemap, canonical, or public
   traffic exposure. Confirm `noindex`, private/no-store caching, bounded logs,
   timeout behavior, candidate ceilings, and the existing Parcel V1 destination.
8. Before any wider decision, add infrastructure rate limiting using the
   reviewed limit of 30 requests/minute per short-lived keyed client identity
   with burst 10. Packet 45 intentionally does not use an in-memory limiter.

## Rollback

1. Set `TRULOT_PARCEL_LOOKUP_V0=0` or remove it and verify both lookup routes
   fail closed.
2. Run [`docs/sql/parcel-lookup-v0-rollback.sql`](sql/parcel-lookup-v0-rollback.sql)
   through the approved migration mechanism.
3. Verify the RPC, builder, materialization, and lookup normalizer are absent.
4. Reconfirm Parcel Base V2, Parcel V1, zoning, snapshots, serving relations,
   canonical routes, and public behavior are unchanged.

Stop on any source, count, fingerprint, plan, grant, response-schema, Parcel V1,
or serving-state mismatch. Do not compensate by widening grants, changing the
pinned source, selecting a snapshot, or enabling public traffic.
