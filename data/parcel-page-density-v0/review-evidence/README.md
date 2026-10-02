# Packet 48 visual review evidence

This folder publishes static screenshot evidence for the Parcel Page density and hierarchy pass completed in Packet 48 at commit `f80add567e2f839105b7d02530f18a3a0c46dad6`.

The screenshots were captured from the credential-free, server-rendered Parcel V1 fixture used during Packet 48 validation. The fixture uses synthetic review data, including `123 Fixture St`; it is not a production parcel record.

## Viewports

- Desktop: `1440 × 1000`
- Mobile: `390 × 844`

The full-page images extend below the viewport to capture the complete rendered page.

## Evidence index

| File | State | Review purpose |
| --- | --- | --- |
| [`desktop-before-full.png`](desktop-before-full.png) | Before Packet 48 | Full desktop baseline for density comparison. |
| [`desktop-full.png`](desktop-full.png) | After; default disclosures collapsed | Full desktop hierarchy and final vertical footprint. |
| [`desktop-top.png`](desktop-top.png) | After; default disclosures collapsed | Address, APN, actions, data status, and Level 1 facts. |
| [`desktop-zoning.png`](desktop-zoning.png) | After; zoning interpretation collapsed | Compact base-zone, program, overlay, and uncertainty treatment. |
| [`desktop-permits.png`](desktop-permits.png) | After; source details collapsed | Parcel permit and nearby-activity hierarchy. |
| [`desktop-methodology-expanded.png`](desktop-methodology-expanded.png) | After; outer Sources & methodology disclosure expanded | Receipts, publishers, source dates, methodology controls, FAQ controls, and disclaimer. Nested methodology and FAQ disclosures remain collapsed. |
| [`mobile-before-full.png`](mobile-before-full.png) | Before Packet 48 | Full mobile baseline for density comparison. |
| [`mobile-full.png`](mobile-full.png) | After; default disclosures collapsed | Full mobile hierarchy and final vertical footprint. |
| [`mobile-top.png`](mobile-top.png) | After; default disclosures collapsed | First mobile viewport, key facts, and first development-context action. |
| [`mobile-source-expanded.png`](mobile-source-expanded.png) | After; one fact source disclosure expanded | Source dataset label, confidence state, and receipt link on mobile. |

No similar-lots `View all` screenshot is included because the bounded review fixture returned no similar-lot matches. The implementation and interaction behavior for populated results are covered by code and tests rather than represented by a synthetic screenshot state.

## Review boundary

These files are static visual-review evidence only. They demonstrate layout, information hierarchy, disclosure states, and responsive density. Keyboard behavior, focus handling, clipboard behavior, server rendering, indexability, truth preservation, and conditional interaction behavior should be judged from the Packet 48 code and tests, not inferred from screenshots.

The screenshots contain no credentials, tokens, private environment values, protected preview URLs, browser account identity, or unrelated private data. Image pixels were copied unchanged from the original Packet 48 evidence captures.

## SHA-256 integrity manifest

| File | SHA-256 |
| --- | --- |
| `desktop-before-full.png` | `a505abd376bd8d2377494fd3b032b9da2c124bd837d69c4b9232026dd06611a3` |
| `desktop-full.png` | `3639d7330434cd91048a7ae266597033fedbb3ae721e17659134083a5f313d64` |
| `desktop-methodology-expanded.png` | `bfdbde47984e3c3ad07d59d23b17e36cf1215043467134cd4c9edf6129445fab` |
| `desktop-permits.png` | `c2d809d71288f7caa287bc19bdacbd72dbcca14da004c294be3619051af116c5` |
| `desktop-top.png` | `5082fa1261b2bb08600c48cd10366a1e65a06b1d7cb5f67bfcb0a41ef88b534c` |
| `desktop-zoning.png` | `44ee29b4b0829e010c024a8e407e7cc7f50506e55ed660a1f4ea7d6d5c645e6d` |
| `mobile-before-full.png` | `fa2e9e53881c79b8353030de4305795e91b20981dc88c6815924011faa16b58c` |
| `mobile-full.png` | `7205258d149535d05b5bbc8f3f682f0fd7a973e6011514aeae0acd91dc777d08` |
| `mobile-source-expanded.png` | `7f7f58a30deed0d84997041beaaa64e974bd621c27e15f7196d1735453eeda9c` |
| `mobile-top.png` | `a51b084b5d7061c047ce10642f37120f6e08c144b1dde1311d1994bd48d3db93` |
