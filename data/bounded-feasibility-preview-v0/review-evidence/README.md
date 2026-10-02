# Packet 60D review evidence

Static screenshots of the development/test-only, contract-driven Bounded Feasibility Preview. They contain fixture evidence only: no production URL, credentials, browser identity, private filesystem path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height. The base views use collapsed evidence; the three named `expanded` captures show the relevant evidence disclosure open.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS, collapsed | 1440×2905 | `8f8fb02f9b50355e18401690292a99840d1417bb31d5f376f956152e1971d620` |
| `public-rs-mobile.png` | Public RS, collapsed | 390×5499 | `d2c8f9041a801deffca8cb6e1d535a36230d6c7a120af94b102f2837d068d963` |
| `public-rs-rear-setback-expanded.png` | Public RS, rear-setback evidence open | 1440×3132 | `64f30af0ee0dcf0451d3174075258fda7102db31f0e1d4ef2a46a10398f2e249` |
| `public-rm-desktop.png` | Public RM, collapsed | 1440×2211 | `811ab0f02a3e7728b9364a169f0946cfd56e7fc5926dd9a302f7407b4d69ba34` |
| `public-rm-mobile.png` | Public RM, collapsed | 390×3837 | `e4a7e2aae5a991296a89d1ddce225dd0e3abda92afaab3239b147e05c7f0c604` |
| `public-rm-sda-context-expanded.png` | Public RM, SDA evidence open | 1440×2326 | `c41ae200c65f9b918497bcf1cf062976a984ab4b50b89ad791f99624ff3dc78b` |
| `private-project-desktop.png` | Private project, collapsed | 1440×1502 | `e5d0ac731474e0b7c2d706f753010cb60f0eb2c7aa37fb97edbdf7d3bea884b8` |
| `private-project-mobile.png` | Private project, collapsed | 390×1875 | `edc92aafa57eb80b6744cbd036a87f8844ed7ebd15d3b6549434c09688ecf1a5` |
| `private-project-status-expanded.png` | Private project, status/evidence open | 1440×1769 | `02b8324d305e13bd0f2d864d95914e9b2e89ba70f370da2f4b636f4834de2ea6` |
| `height-far-blocked-desktop.png` | Private height/FAR evidence blockers | 1440×2072 | `b85baaa741a8f6883e6022d9f0338bf6cde45db8719d26b2c5726c7aeed0e8ee` |

The browser suite separately proves keyboard disclosure operation, summary-link targets, mobile overflow containment, production gating, public/private containment, and failure handling. Those behaviors should be judged from tests and source rather than inferred from static images.
