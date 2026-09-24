# Parcel Intelligence Serving V2 integration rehearsal

Decision: `ZONING_SERVING_INTEGRATION_REHEARSAL_PASS`. Packet 11 composes the already-rehearsed Parcel Serving V2 identity/geometry contract with Base Zoning V2. It is offline, reproducible, and not connected to Parcel V1.

## Integrated contract and join

The rehearsal object is `parcel_intelligence_serving_v2`. Each row retains the complete Parcel Serving V2 record, one Base Zoning V2 mapping object, three distinct provenance references, and integration method `parcel-intelligence-serving-v2-left-join-v1`.

The logical join starts from all Parcel Serving V2 rows and matches zoning on the proven tuple:

```text
(parcel acquisition ID, parcel source object ID, normalized ten-digit APN)
```

This is LEFT JOIN behavior. A zoning state never removes a parcel. All 393,733 parcel identities matched exactly; there were no missing parcel rows, missing zoning rows, duplicate APNs, or unintended one-to-many joins. The APN-set fingerprint remains `93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25`, and the complete Parcel Serving row fingerprint remains `a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f`.

## Facts and truth states

Parcel identity and geometry come only from Parcel Serving V2: acquisition/source IDs, APN, parcel ID, nullable address, ZIP, `SD` situs jurisdiction, polygon, centroid, point on surface, geometry area, and nullable taxable acreage. Parcel Truth keeps recorded and derived meanings unchanged.

Base zoning comes only from Base Zoning V2: mapping state, every raw code, contributing source feature IDs, intersection areas, coverage percentages, repaired-source marker, and mapping method. `analyticalDominantZoneCode` is explicitly a descriptive area ranking. It never replaces the complete evidence array.

| Mapping state | Integrated rows | Truth behavior |
|---|---:|---|
| `SINGLE_ZONE` | 317,604 | supported; one raw source code and full evidence |
| `MULTI_ZONE` | 73,064 | supported; every material code retained |
| `BOUNDARY_SLIVER` | 1,097 | supported; principal and all sliver codes retained |
| `UNMAPPED` | 327 | unknown; never presented as “unzoned” |
| `INDETERMINATE` | 1,641 | partial; available intersection evidence retained |

If zoning fails while the parcel succeeds, the integrated result is partial: parcel truth remains supported and zoning is unavailable. If parcel identity fails, the overall lookup is unavailable and zoning is not evaluated. A scoped parcel absence makes zoning not applicable.

## Display semantics

The offline adapter exposes raw codes, source label, source acquisition/modification timestamps, mapping state, coverage, source feature IDs, and a factual basis. It supplies no development interpretation or promotional copy.

Examples from the actual golden evidence:

```text
RM-1-1 — 100% parcel coverage — SINGLE_ZONE
OF-1-1 — 94.755944% + AR-1-2 — 5.244056% — MULTI_ZONE
RS-1-14 — 99.996523% + RM-1-1 — 0.003477% boundary sliver — BOUNDARY_SLIVER
```

The literal source code `UNZONED`, when present in authoritative source evidence, remains a raw code. It is distinct from a parcel with no zoning intersection.

## Split, sliver, and stacked fidelity

Every Packet 10 zone-to-parcel count matches after integration. The ordered split/sliver fingerprint is `6cbefbddb32fd29d68effc9ef059b956d22eeeb5c53e20284692a6bbec50cc26`. Ordering is descending intersected area, then raw code; every contributing source feature remains traceable.

All 126,239 APNs in 5,446 identical-geometry groups remain separate. No group has inconsistent zoning evidence. Canonical route behavior remains APN-specific.

## Separate provenance

Parcel provenance resolves to SanGIS parcel acquisition `sangis-20260924T183743Z`, artifact SHA-256 `07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544`, and its source temporal extent.

Zoning provenance resolves separately to City of San Diego Planning via SanGIS acquisition `zoning-city-sd-20260924T201131Z`, artifact SHA-256 `7f65bfd9bb0ea11fda8537e3fc121c0d8e37f15c37f82d1f00afa7a0fa6542b6`, service modification time, acquisition time, and mapping method `base-zoning-city-sd-v2-area-coverage-v1`.

No generic “last updated” field is created.

## Determinism and query rehearsal

Two complete external builds from the same immutable inputs produced identical:

- 393,733 rows and all state/zone counts;
- APN set and Parcel Serving row fingerprints;
- Packet 10 mapping fingerprint;
- split/sliver fingerprint;
- integrated fingerprint `27b1a362bdae28369cdf7274d1b9842bef07b5970e33c1f9522d68d042e616d8`;
- compressed output SHA-256 `e3fa496fa742a784c520a5baa608ae2431987eb7988b6dcade8e2bb1bdada6e9`;
- golden parcel outputs and provenance references.

The full geometry-bearing output is 214,967,385 compressed bytes and remains outside Git. A compact in-memory indexed rehearsal of all 393,733 rows observed local lookup times of 0.035 ms for APN identity + zoning, 0.322 ms for zone-to-parcel count, 0.032 ms for a split parcel, 0.062 ms for a stacked group, and 0.064 ms for an unmapped parcel. Query plans used APN, zone-code, geometry-hash, and mapping-state indexes. These are local observations, not production claims.

## Golden coverage

The committed bounded corpus includes an ordinary single zone, material split, boundary sliver, unmapped parcel, indeterminate parcel, stacked group, null address, null taxable acreage, historical APN `5490330700`, explicit zoning-geometry derivative, and a MultiPolygon parcel. Tests assert actual codes, percentages, source feature IDs, truth states, route separation, and provenance.

## Runtime migration boundary

Packet 11 does not change `/parcel/san-diego/[slug]`, `getParcelPageV1Result()`, existing permit/overlay reads, or any production object. A future separately authorized shadow packet must:

1. add a reviewed integrated V2 data-access path;
2. perform shadow reads before rendering;
3. preserve the current route and permit/overlay behavior;
4. render raw zoning truth without standards;
5. retain the legacy fallback during bounded validation;
6. prevent legacy capacity and eligibility logic from entering the new zoning fact.

## Next dependency: Zoning Standards V2

Answering “What does RS-1-7 mean?” requires a separate recovery of authoritative municipal code and development regulations, versioned section citations, effective/amendment lineage, code-to-rule applicability, and separate overlay/program treatment. Packet 11 intentionally contains no density, FAR, height, unit, ADU, SB 9, SB 79, Density Bonus, Complete Communities, or capacity logic.

`ZONING_SERVING_INTEGRATION_REHEARSAL_PASS`

`READY_FOR_ZONING_RUNTIME_SHADOW_DESIGN`
