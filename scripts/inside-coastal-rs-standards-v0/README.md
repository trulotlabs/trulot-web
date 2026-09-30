# Inside-Coastal RS standards V0

This offline packet selects the City of San Diego RS base-standards version effective inside the Coastal Overlay Zone from September 10 through September 30, 2026. It composes O-21836, Coastal Commission LCP amendment LCP-6-SAN-24-0038-3, and O-22117, including the separately certified O-21934 Footnote 7 repeal, while excluding O-22109 from the inside-Coastal version.

```sh
python3 scripts/inside-coastal-rs-standards-v0/build.py
python3 scripts/inside-coastal-rs-standards-v0/test.py
```

The builder derives a separate 343-rule inside-Coastal bundle from the independently verified Packet 12 cell transcription. It preserves the certified O-21934 Footnote 7 repeal, removes the O-22109-only section 131.0443(i) condition, retains the unresolved Footnote 8 state, and recomputes provenance. It never evaluates parcel compliance or capacity and is not wired to production runtime.
