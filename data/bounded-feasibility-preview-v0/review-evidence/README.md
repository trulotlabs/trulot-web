# Packet 60F review evidence

Static screenshots of the development/test-only, contract-driven Bounded Feasibility Preview. They contain fixture evidence only: no production URL, credentials, browser identity, private filesystem path, or environment value.

Desktop captures use a 1440×1000 viewport. Mobile captures use a 390×844 viewport. Every image is a full-page capture, so its pixel height exceeds the viewport height. The base views use collapsed evidence; the three named `expanded` captures show the relevant evidence disclosure open.

| File | View | Pixels | SHA-256 |
| --- | --- | ---: | --- |
| `public-rs-desktop.png` | Public RS, collapsed | 1440×2866 | `707c258a8de74270bf285b8f54e4e641c7884eafeaac0ec170905e8923c413d1` |
| `public-rs-mobile.png` | Public RS, collapsed | 390×5454 | `ea13f80e4ba6b79e486e5c6fb6155e7596b7514fad07c41594a94543a71957bc` |
| `public-rs-rear-setback-expanded.png` | Public RS, rear-setback evidence open | 1440×3093 | `edb8be41e78e2fe864763afb37115a821ae74660a80c628638854ca4fbb79cb4` |
| `public-rm-desktop.png` | Public RM, collapsed | 1440×2211 | `32e0e20ebd2804da80337b5de67e12674e2a6a94a0c60d96c852923c65b956f3` |
| `public-rm-mobile.png` | Public RM, collapsed | 390×3837 | `e4a7e2aae5a991296a89d1ddce225dd0e3abda92afaab3239b147e05c7f0c604` |
| `public-rm-sda-context-expanded.png` | Public RM, SDA evidence open | 1440×2326 | `c41ae200c65f9b918497bcf1cf062976a984ab4b50b89ad791f99624ff3dc78b` |
| `private-project-desktop.png` | Private project, collapsed | 1440×1502 | `53621fbe8297a8e32dee807065ac4839de7017721065f9f649bca7e941dfe592` |
| `private-project-mobile.png` | Private project, collapsed | 390×1875 | `4bcb7986436fe72d9af94df36717441b341ad5d58a34bed96670ce99e6d0071f` |
| `private-project-status-expanded.png` | Private project, status/evidence open | 1440×1769 | `f97b57a70ceb47569e47825ab1038310a8ba259fbbdbd3bea611144bdcf750c2` |
| `height-far-blocked-desktop.png` | Private height/FAR evidence blockers | 1440×2049 | `458f930df293150530d2a3eddeaf7828882c0c22e2aef691f8d96376a8bf1e01` |

The browser suite separately proves keyboard disclosure operation, summary-link targets, mobile overflow containment, production gating, public/private containment, and failure handling. Those behaviors should be judged from tests and source rather than inferred from static images.
