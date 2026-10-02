# Packet 60B review evidence

Static screenshots of the development/test-only Bounded Feasibility Preview trust and comprehension revision. They contain fixture evidence only: no production URL, credentials, browser identity, private filesystem path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height. The base views use collapsed evidence; the three named `expanded` captures show the relevant evidence disclosure open.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS, collapsed | 1440×2819 | `92af28b2f18bf16b12fcf5d9613924cbd3fd159917f860b94e1fb5fc0954e3cc` |
| `public-rs-mobile.png` | Public RS, collapsed | 390×5290 | `9658b85f00a523a74b3580e30abba32aa2f7061881a11b979a6776322f8be668` |
| `public-rs-rear-setback-expanded.png` | Public RS, rear-setback evidence open | 1440×2984 | `75ad1a61100d8b40a0f58c4d6efb19b3c89b0e321e57dee7db7131193d65f0d6` |
| `public-rm-desktop.png` | Public RM, collapsed | 1440×1872 | `7bb663f7683bc6f9bd06a6da76880f763e3924d670aaacd93c5d753111e33cd1` |
| `public-rm-mobile.png` | Public RM, collapsed | 390×3204 | `ba43e8a89aff0763ca70382ae31b9f48ce6badec5783da8e766dc75e65a4c2e6` |
| `public-rm-sda-context-expanded.png` | Public RM, SDA evidence open | 1440×2012 | `8faa29334b50e918e49b2794351dfdccc7fb995ce0ea390edb17cfa250e2c010` |
| `private-project-desktop.png` | Private project, collapsed | 1440×1479 | `c1975c24cc7ee366db10f0726f1ea536b311478e8ffd6195f903df63099c24d6` |
| `private-project-mobile.png` | Private project, collapsed | 390×1830 | `64d5d8f7dff36018aa4b0a69daa75c977a12da93cfab029a7e72bb10725e44e4` |
| `private-project-status-expanded.png` | Private project, status/evidence open | 1440×1739 | `3c28891ce184d1f17869ce75c0499173a5ffe7d31ef6a91f5946323d9861b2af` |
| `height-far-blocked-desktop.png` | Private height/FAR evidence blockers | 1440×1455 | `fe30c66b97b7918cdb03e987172dfd66ea83815edd6b3d7c594ae3ad0afd48e0` |

The browser suite separately proves keyboard disclosure operation, summary-link targets, mobile overflow containment, production gating, public/private containment, and failure handling. Those behaviors should be judged from tests and source rather than inferred from static images.
