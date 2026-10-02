# Bounded Feasibility Preview V0

Run the deterministic acceptance test:

```sh
node scripts/bounded-feasibility-preview-v0/test.mjs
node scripts/bounded-feasibility-preview-v0/test-60b.mjs
```

Run the local preview:

```sh
TRULOT_FEASIBILITY_PREVIEW=1 npm run dev -- --hostname 127.0.0.1 --port 3016
```

Open `/feasibility-preview` and use the local-only example selector. The route returns 404 unless the explicit flag is set in development or test, and it always returns 404 in production.

With the local server running, capture and verify the responsive review evidence:

```sh
node scripts/bounded-feasibility-preview-v0/browser.mjs
```
