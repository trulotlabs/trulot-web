# Parcel Page V2 bounded preview

Packet 21 mounts the sealed Packet 18 Parcel Intelligence V2 corpus and the Packet 20 presentation inside the Next.js App Router at:

`/parcel-v2-preview/[apn]`

The route is a dynamic Node.js Server Component. It has no client data fetch, Supabase dependency, external API call, legacy parcel fallback, redirect, canonical URL, sitemap entry, or navigation entry. It renders the Packet 20 presentation fragment server-side and uses native `details` elements for disclosures.

## Gate

The route is enabled only when both conditions hold:

- `TRULOT_PARCEL_V2_PREVIEW=1`
- `NODE_ENV` is exactly `development` or `test`

It is off when the variable is absent or has any other value. It is always off under `NODE_ENV=production`, even if the variable is `1`. A disabled request returns the application's 404 response.

For bounded local review:

```sh
TRULOT_PARCEL_V2_PREVIEW=1 npm run dev
```

This command is for local review only. Packet 21 does not add the variable to any environment or deployment configuration.

## Sealed data source

The loader reads only `data/parcel-intelligence-v2/fixture-results.json`. Before lookup it requires:

- exact file SHA-256 `ee8f8aa742e6dc60d57303fd388c870c1bdbc32f097a87f807d962da23b7a85d`;
- exact canonical output SHA-256 `597645ff258e4c03760ade98cc9f6aecb1033eae5138b89006955089895b7d22`;
- contract `parcel-intelligence-v2-2026-09-30-v1`;
- exactly 30 unique, ten-digit APNs;
- the four sealed safeguards set to `false` for every result.

The file is 2,065,332 bytes and remains server-side. It is loaded once per server process and indexed by exact APN. No zoning, Coastal, standards, compliance, or capacity calculation runs in the preview.

The corpus includes the three canonical review APNs plus ambiguous zoning, unmapped zoning, Coastal boundary, missing-address, source-unavailable, and single-zone non-RS cases. All 30 sealed results are addressable. An APN outside that corpus renders `Preview data not available for this parcel` and does not fall back to Parcel V1. A corrupt or changed corpus fails its seal and renders a closed unavailable state.

## Presentation and metadata

The route calls the Packet 20 `adaptParcelIntelligenceV2` adapter and `renderParcelPageV2Fragment` renderer. The standalone Packet 20 renderer delegates to the same fragment. The integrated page therefore keeps the same section order, wording, evidence state, zone separation, percentages, unknowns, investigation list, disclosures, and `Not evaluated yet` capacity message.

The root layout supplies the application font. Route metadata identifies a non-production review preview and sets `noindex`, `nofollow`, `noarchive`, and `nosnippet`. It makes no production or legal conclusion.

## Containment

Packet 21 leaves `/parcel/[apn]`, `/parcel/san-diego/[slug]`, Parcel V1 loaders, the root layout, navigation, robots, and sitemap unchanged. It does not require a Supabase URL or key at runtime, select a V2 snapshot, read production data, alter database state, calculate compliance/capacity, or deploy anything.

Browser and validation evidence is under `data/parcel-page-v2-preview/`. The six application-shell screenshots are:

- `data/parcel-page-v2-preview/screenshots/6341302200-mobile.png`
- `data/parcel-page-v2-preview/screenshots/6341302200-desktop.png`
- `data/parcel-page-v2-preview/screenshots/3506320400-mobile.png`
- `data/parcel-page-v2-preview/screenshots/3506320400-desktop.png`
- `data/parcel-page-v2-preview/screenshots/4304211000-mobile.png`
- `data/parcel-page-v2-preview/screenshots/4304211000-desktop.png`
