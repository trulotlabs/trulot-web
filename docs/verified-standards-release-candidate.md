# Verified base-zone standards release candidate

This release candidate serves only the sealed 213-record display-safe subset.
It does not determine parcel applicability, compliance, entitlement, feasibility,
unit count, or development capacity.

## Gate

Production is denied before any enablement check when `VERCEL_ENV=production`
or `TRULOT_DEPLOYMENT_ENV=production`. An approved staging preview requires all
of the following server-only values:

- `VERCEL=1`
- `VERCEL_ENV=preview`
- `TRULOT_VERIFIED_STANDARDS_RELEASE=1`
- `TRULOT_VERIFIED_STANDARDS_RELEASE_ENV=staging`
- `TRULOT_VERIFIED_STANDARDS_STAGING_APPROVED=1`
- `TRULOT_VERIFIED_STANDARDS_INPUT` set to an absolute server-side input path

The input contains verified parcel/zoning context and source-path evidence. Its
path and contents are never rendered. Local development and tests retain the
existing `TRULOT_RS17_STANDARDS_SHADOW=1` opt-in and separate local input.

## Rendering and indexing

The section is rendered by the existing Parcel Page server component on the
canonical parcel URL. It creates no alternate route or canonical URL and adds
no client component or client-side regulatory payload. Production indexing is
unchanged while the production gate is closed. If a later packet authorizes
production enablement, the server-rendered text would be present in the page
HTML and therefore crawlable under the existing parcel canonical URL.

## Rollback

Remove or set `TRULOT_VERIFIED_STANDARDS_RELEASE=0` in the approved staging
environment. The section disappears on the next render without a code revert;
the Parcel Page route, metadata, zoning, permits, and overlays continue through
their existing paths.

## Controlled review

Generate the deterministic fixture set in an external temporary directory, then
run `node scripts/rs17-local-review.mjs <input.json> staging`. This starts only
loopback fixture services and exercises the canonical Parcel Page route with the
same staging gate. Use `off` to prove rollback and baseline parity.
