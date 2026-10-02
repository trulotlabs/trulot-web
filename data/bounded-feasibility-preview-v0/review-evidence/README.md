# Packet 60E review evidence

Static screenshots of the development/test-only, contract-driven Bounded Feasibility Preview. They contain fixture evidence only: no production URL, credentials, browser identity, private filesystem path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height. The base views use collapsed evidence; the three named `expanded` captures show the relevant evidence disclosure open.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS, collapsed | 1440×2866 | `46c70d7869d358535dd44c6fa182a8f437af916bc52bef172eb52927af4e1ea2` |
| `public-rs-mobile.png` | Public RS, collapsed | 390×5454 | `b2299829f16c5fa5d6499bb97c247c741d2227dcfaf95f010c2544df6b56d5f7` |
| `public-rs-rear-setback-expanded.png` | Public RS, rear-setback evidence open | 1440×3093 | `c2c1b2aa3a16091c33b48c128d84885aaeef39c306cdc70882c14453affb7305` |
| `public-rm-desktop.png` | Public RM, collapsed | 1440×2211 | `811ab0f02a3e7728b9364a169f0946cfd56e7fc5926dd9a302f7407b4d69ba34` |
| `public-rm-mobile.png` | Public RM, collapsed | 390×3837 | `e4a7e2aae5a991296a89d1ddce225dd0e3abda92afaab3239b147e05c7f0c604` |
| `public-rm-sda-context-expanded.png` | Public RM, SDA evidence open | 1440×2326 | `c35bf26b1ab833abb9383bc05fcce3604c07e6f9bcb4846dece149a5c9255651` |
| `private-project-desktop.png` | Private project, collapsed | 1440×1517 | `340e2b357fa33aef05234e46939d8a03c3024e7c11d867c0b035f1114f059191` |
| `private-project-mobile.png` | Private project, collapsed | 390×1891 | `e59ff64b309161d6619f8a2e2e6ba935ab78cec491afda71201af0f01b475272` |
| `private-project-status-expanded.png` | Private project, status/evidence open | 1440×1784 | `90fb4c2ad47aae2495df3a09008955a3827445d0c86faca682c0bf84aebef32d` |
| `height-far-blocked-desktop.png` | Private height/FAR evidence blockers | 1440×2049 | `458f930df293150530d2a3eddeaf7828882c0c22e2aef691f8d96376a8bf1e01` |

The browser suite separately proves keyboard disclosure operation, summary-link targets, mobile overflow containment, production gating, public/private containment, and failure handling. Those behaviors should be judged from tests and source rather than inferred from static images.
