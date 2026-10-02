# Packet 60 review evidence

Static screenshots of the development/test-only Bounded Feasibility Preview V0. They contain fixture evidence only, no production URL, credentials, browser identity, private file path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS | 1440×2783 | `b277ffa3b990ec5036492b974ffb32e207f80298da351ac84f49e98975de2234` |
| `public-rs-mobile.png` | Public RS | 390×5058 | `f5aeacb26972d25ebb791e7f86c73f6f6c5ff66174cc400d7830ba34efcb061f` |
| `public-rm-desktop.png` | Public RM | 1440×2242 | `8813c8acb41cb355ac0b9427f30b94e8d8e5a2f90ccdec274356e0e568ffb39e` |
| `public-rm-mobile.png` | Public RM | 390×3746 | `09461dee07c402762dacc0adab7d6146e075f42213a717323b7abfa031334a18` |
| `private-project-desktop.png` | Private project | 1440×1390 | `3b6967f3182fba2777ef1639884c93639f9ea7b0ab5d9c4ccd4077ad01f3e60c` |
| `private-project-mobile.png` | Private project | 390×1667 | `ca8ca644636237c8c8e1c6b4d395310278051e63aa67d95071d4c78b90186139` |
| `height-far-blocked-desktop.png` | Height/FAR blockers | 1440×1542 | `9a636c50ff1302e65ab7225eed9db329f9f540f7566cfb8fe82108d3b9e23034` |

The browser check opened an evidence disclosure by keyboard before capture. Interaction behavior, production gating, containment, and failure handling should be judged from the tests and source rather than inferred from static images.
