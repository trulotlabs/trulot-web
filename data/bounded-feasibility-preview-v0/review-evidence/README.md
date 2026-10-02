# Packet 60C review evidence

Static screenshots of the development/test-only, contract-driven Bounded Feasibility Preview. They contain fixture evidence only: no production URL, credentials, browser identity, private filesystem path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height. The base views use collapsed evidence; the three named `expanded` captures show the relevant evidence disclosure open.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS, collapsed | 1440×2889 | `275a8c636798f3cdc4ea65bb1e08ab1dea7074ef87d8b4f8e555d36b6cd6caff` |
| `public-rs-mobile.png` | Public RS, collapsed | 390×5502 | `44bd74db7b9a3afd096121ed3ddd47e52a6677366f71eaa85f5e8b34e4567f5e` |
| `public-rs-rear-setback-expanded.png` | Public RS, rear-setback evidence open | 1440×3054 | `738a27e6735fe9350269f6e0b1a791ae637ef11c9004bf632e08fa5c89525dd6` |
| `public-rm-desktop.png` | Public RM, collapsed | 1440×2211 | `64c6c347b5999d8b31be226ea8cd13a479f57a1de38acf8c0380a5da4634c65b` |
| `public-rm-mobile.png` | Public RM, collapsed | 390×3872 | `a4645fed25ddf1256d71fc523c743d107ac0c03eb76b6a37bb847215c667b0c7` |
| `public-rm-sda-context-expanded.png` | Public RM, SDA evidence open | 1440×2335 | `082e813d1fd47e89d3b32a59ffb3c607407a195ccbff7aa032179ee2f1c78f97` |
| `private-project-desktop.png` | Private project, collapsed | 1440×1502 | `049673b4a9bc21776c9619bc5af47a01f3b298e8da5d574b406ed85b49069636` |
| `private-project-mobile.png` | Private project, collapsed | 390×1875 | `340a93570f370e042e74c628e221cb9d278933cd901cea1644708f5c3a041f21` |
| `private-project-status-expanded.png` | Private project, status/evidence open | 1440×1747 | `89e2463fe6602d1244bc8c94cfe4a6063944f3f51dd3dd8d782e2fbdd4c42e05` |
| `height-far-blocked-desktop.png` | Private height/FAR evidence blockers | 1440×2072 | `37e7014088ca177e0b2a806f1bcf3a73edf66972687152666048ccaa3e8425d9` |

The browser suite separately proves keyboard disclosure operation, summary-link targets, mobile overflow containment, production gating, public/private containment, and failure handling. Those behaviors should be judged from tests and source rather than inferred from static images.
