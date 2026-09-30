# Parcel Page V2 UI adapter

Packet 19 is a repository-local presentation adapter over the sealed Packet 18 `ParcelIntelligenceV2` fixture results. It creates static, non-production review pages and has no database, network, production runtime, compliance, or capacity behavior.

```sh
node scripts/parcel-page-v2-ui/build.mjs
node scripts/parcel-page-v2-ui/test.mjs
node scripts/parcel-page-v2-ui/capture.mjs
```

The build emits ten representative static pages. The browser check opens those files directly in headless Chromium at 390 px, 820 px, and 1440 px widths and captures mobile and desktop screenshots for the three canonical parcels.
