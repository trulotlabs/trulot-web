# RS Rule Profile V0

Packet 58 turns the existing RS-1-7 research into a deterministic, versioned base-zone profile. It keeps table cells, definitions, footnotes, program modifiers, version selection, and project facts in separate layers.

Generate and test without network or production access:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/rs-rule-profile-v0/build.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/rs-rule-profile-v0/test.py
```

The shared record fields match RM Rule Profile V0. The schema makes one generic extension: the old RM-only `zone_code` pattern now accepts both RM and RS zones. It does not compute capacity, determine whole-project compliance, modify the Parcel Page, or connect to production.
