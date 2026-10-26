# La Mesa Residential Rule Profile V0

Sealed municipal base zoning profile `LA_MESA_TITLE24_2026_10_04` built from the current Title 24 text dated 2026-10-04 and the Packet 64 classification without recomputing geometry.

## Boundary

The artifacts encode base rules for exactly R1E, R1R, R1S, R1, R1A, R2, R3, and RB. Mapped overlays select modifier records; they do not prove project-specific legal predicates. Adopted specific plans are versioned separately, and the ongoing Downtown update is excluded as draft. No ADU eligibility, capacity, production load, or public conclusion is produced.

## Rebuild and validation

```sh
python3 data/la-mesa-residential-rule-profile-v0/build.py
python3 data/la-mesa-residential-rule-profile-v0/validate.py
```

Precedence is applied per rule: a sourced adopted-plan replacement (300) may supersede a sourced overlay operation (150–250), which composes over the base profile. A missing trigger, plan table, or unsourced conflict stays conditional/unresolved.
