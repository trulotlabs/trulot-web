# Packet 63 — La Mesa jurisdiction reconnaissance

Observed 2026-10-26. This is local, static reconnaissance. It does not authorize a production load or a public La Mesa conclusion.

## 1. Baseline

Repository `/Users/ops/trulot-web-parcel`, branch `codex/trulot-parcel-v1-hardening`, starting commit `cf9f001bf714d2921b387b516b1d45c40181b2da`, tree `9d70191077283dfcf101f3b669d37ef3c08388f5`, clean.

## 2. Packet 62 jurisdiction requirements

A jurisdiction must provide a stable jurisdiction ID; an explicit parcel-scope doctrine; a zone/profile registry; normalized parcel measurements; generic mapped-context records; a public source registry; a sealed rule-profile version; and public evidence provenance. Profile selection is jurisdiction + zone + rule version + applicable context. The output remains fail-closed when any profile or required evidence is unavailable.

## 3. Existing La Mesa parcel population

The sealed countywide SanGIS Parcel V2 acquisition contains **17,391** accepted `situs_juris=LM` rows and **17,391** distinct APNs; duplicate APNs **0**; missing APNs **0**; missing addresses **663**; invalid/missing normalized geometries **0**. Sorted-APN SHA-256: `11440df9a1fb2a72592000dc656f75dcec9bf7ed9d90e9efcb9ebba8e700a467`. The City boundary representative-point check found **17,388** APNs: 17,387 agree, four are `LM`-only, and one (`4953350500`) is boundary-point-only. Primary scope should remain explicit SanGIS municipal attribution with the spatial result as QA.

## 4. Parcel-fabric comparison

City zoning has 17,422 features but only 14,175 APN strings, 3,233 repeated APN features, and 14 missing APNs. Repetition is concentrated in condominium/common-parcel geometry. The City PropertyLines layer is two multipart line features with no APN key. Metadata says the City zoning is attributed on current parcel fabric; a related City fire layer identifies SanGIS/County ARCC as the parcel source. This supports **County/SanGIS APN identity + geometry, City La Mesa zoning/overlay attribution**. The City geometry is a clipped/attributed derivative and must not replace county identity.

## 5. Jurisdiction boundary

Use City `Land_Use/FeatureServer/2`: one valid polygon, EPSG:2230 source, 9.036358 sq mi / 5,783.269 acres, data edit 2026-07-01, normalized SHA-256 `69eaebfff0f201289dbb55767d7134a2fcbb6a5e2ec841100dd3b3f828364079`. Recommended doctrine: SanGIS `situs_juris=LM` is primary; point-on-surface within/covers boundary is deterministic QA; conflicts become `INDETERMINATE_JURISDICTION` pending maximum-area intersection and official confirmation. Mere touching/intersection does not include a parcel.

## 6. Zoning source

City `ZoningOverlay/FeatureServer/88` provides 17,422 features, 21 fields, EPSG:2230, max record count 2,000, JSON/GeoJSON/PBF query support, data edit 2026-10-15. Useful fields are `ZONE_CODE`, `ZONE_NAME`, `ZONE_LABEL`, `OVERLAY_CODES`, `OVERLAY_NAMES`, `HAS_OVERLAY`, `ZONE_STATUS`, `ORD_URL`, `APN`, parcel/address fields and source area. General Plan/specific-plan fields described at service level are not present on layer 88 and must come from their dedicated layers.

## 7. Zoning authority classification

Classification: **City-maintained mapped zoning observation**, not legal-entitlement determination. Service prose calls the data official/current; layer prose calls it a planning reference that may be adopted as authoritative pending Planning review and disclaims property rights. `VERIFIED_CURRENT` therefore requires mapped observation + operative Title 24/adopted-plan version + either a City-published effective-date linkage or Planning confirmation.

## 8. Local zoning snapshot

Complete paginated zoning, overlays, boundary, property-line, planned-land-use and specific-plan responses are stored under `source-snapshots/raw`; exact service/layer metadata is preserved as deterministic gzip under `metadata`; stable sorted NDJSON is under `normalized`. Zoning normalized SHA-256 `b8a082968cdea8b23dbcd99ec3f5d333ae76e7c1894bb4099564a7a3672c0fa7`; overlays `7d854ea16a6cdb10aa56c1261c040031e5d306eeec5c06147b55df5f0da63dd0`. No database load occurred.

## 9. Zone inventory

Current codes: **C, CD, CM, CN, Civic Center, M, MacArthur, R1, R1A, R1E, R1R, R1S, R2, R3, RB, TBD** (16 distinct including `TBD`). Representative-point parcel counts are recorded in `zone-inventory.json`. The City feature counts and source areas remain separate because condo/common geometry repeats. `TBD` is unsupported, never inferred.

## 10. Residential zone inventory

Current mapped residential families are exactly **R1E, R1R, R1S, R1, R1A, R2, R3, RB**. Representative-point counts: R1E 95; R1R 180; R1S 2,336; R1 8,685; R1A 325; R2 640; R3 3,600; RB 406. These are mapped observations, not encoded development standards.

## 11. Split-zone analysis

The City layer has no advertised split-zone field in the actual layer schema, all APN groups carry a single unique zone code, and no La Mesa parcel representative point returned multiple zone codes. Point results: `SINGLE_ZONE` 17,387; `UNMAPPED` 4; `MULTI_ZONE` 0 at point level; `BOUNDARY_SLIVER` and `INDETERMINATE` are **not yet measurable** from point membership. Packet 64 must dissolve duplicate City geometries and intersect complete county parcel polygons. Proposed states: dominant coverage >=80% with material secondary area = MULTI_ZONE; secondary <1% or <100 sq ft = BOUNDARY_SLIVER; no coverage = UNMAPPED; conflicting/unrepairable geometry or no dominant zone = INDETERMINATE.

## 12. Overlay inventory

Layer 89 has 920 polygons and these codes: BT (Briercrest Tract), D (Urban Design), MU (Mixed Use), F (Floodway), G (Grossmont Center), H (Hillside), MH (Mobile Home), NP/NP2 (Neighborhood Preservation), P (Scenic Preservation), BG (Bowling Green, combined with P). Exact combination and representative-point counts are in `point-joins.json`; examples include H 231, P 1,326, P-BG 11, G-D 337, D-MU 556. All are rule-modifying candidates until the code proves otherwise; base-only polygons are mapped context. No separate floodplain code was found.

## 13. Specific-plan inventory

The mapped adopted boundaries are Downtown Village (1990; 924 parcel points), Grossmont (1994 layer value; 360), and Eastridge (1989; 227). Base zoning alone is insufficient inside these 1,511 non-overlapping representative-point memberships. Downtown is in an active update and Grossmont has draft 2026 housing clarifications; neither draft belongs in current rules. Eastridge is mapped as adopted. Two of three GeoJSON plan geometries are invalid and require a pinned repair before production.

## 14. General Plan / land-use inventory

Layer 49 contains 913 polygons from the adopted 2012 General Plan (Council adoption/certification July 9, 2013), 26 designations, and five invalid GeoJSON geometries. Use it for public context and a zoning-consistency warning/future intelligence layer. It is not a rule selector and never substitutes for zoning.

## 15. Municipal-code sources

The City points to Municode Title 24 as the zoning ordinance. Required inventory: 24.01 definitions/measurement; 24.05 residential zones, accessory structures and ADU/JADU provisions; 24.08 Floodway; 24.09 Scenic Preservation; 24.11 Urban Design; 24.13 Hillside; 24.14 Neighborhood Plan 2; 24.15 Murray Hill; 24.16 Grossmont; 24.17 Bowling Green; 24.18 Mixed Use; plus applicable specific plans. Stable node-ID URLs are the strategy. Municode offers compare/version UI, but direct automated retrieval returned 403; Packet 65/66 must capture section text, amendment/effective dates, and historical versions or adoption ordinances.

## 16. Residential rule-matrix design

`matrix-design.json` defines lot area, width, depth, frontage, setbacks, height, coverage, FAR, density, open space, relevant parking, overlay modifiers and special-lot formulas. Each cell is directly stated, formula, conditional, not specified, modifier dependent, or unresolved. No rule values were encoded.

## 17. ADU source inventory

Current sources: City ADU webpage (observed 2026-10-26); City **ADU/JADU Development Matrix — Updated 2026**; LMMC 24.05.020D8/D9 via current Title 24; current HCD ADU Handbook updated March 2026; MaintStar submission requirements. The February/March 2023 guidebook, quick sheet and FAQ are historical/supporting only. Checksums for acquired sources are in `source-manifest.json`.

## 18. State-law reconciliation

Categories: (1) current local text confirmed against operative Government Code; (2) older local ordinance superseded by state law; (3) newer City guidance that reflects state law but still needs statutory binding; (4) unresolved conflict/current interpretation. Unit counts, size, setbacks, height, parking, owner occupancy, review timing, multifamily paths and overlay constraints must be compared field by field. Conflicts remain explicit and never silently resolved.

## 19. 2027 readiness

AB 956 was chaptered September 29, 2026 (Ch. 791) and is effective January 1, 2027. La Mesa's 2026 page/matrix does not clearly establish a sealed future-effective profile. Maintain `CA_ADU_2026` through 2026-12-31 and separately seal `CA_ADU_2027` for 2027-01-01. Do not apply future two-detached-ADU changes early.

## 20. ADU-rule matrix design

The design in `matrix-design.json` covers types/count, JADU, sizes, setbacks, height, coverage exceptions, parking, occupancy/rental, sprinklers, overlays/historic limits, conversions, multifamily, objective standards, timing, and state fallback. Primary-dwelling facts and effective dates are required; zoning alone cannot establish eligibility.

## 21. Permit/activity inventory

MaintStar is the official online application/status portal; accessibility without an account and complete parcel/APN export are unresolved. Projects Under Review supplies monthly active/inactive project lists/maps: project/address-level, not a full permit ledger. HCD APR is aggregate jurisdiction reporting. Classification: MaintStar potentially addressable but unproven; project pages project-level; APR aggregate. Permit integration remains phase two.

## 22. Parcel Lookup compatibility

Countywide source readiness: APN yes and address yes for 16,728 of 17,391 LM parcels. Those rows contain 13,212 distinct address strings, 186 duplicate-address groups (3,516 extra rows, largely unit/common-address cases), and seven LM address strings also appear under another county jurisdiction, so APN and jurisdiction must disambiguate. Current TruLot production lookup is **not La Mesa-ready**: its contract and serving schema hard-code `SD`, and slug generation routes to `/parcel/san-diego`. A future extension needs jurisdiction in candidate identity/ranking, duplicate-address disambiguation, LM serving rows, and an LM canonical route. Parcel Lookup was not modified.

## 23. LaMesaADU.com architecture

Recommend **A**: LaMesaADU.com is a branded acquisition/front-door that calls the same jurisdiction-keyed TruLot parcel intelligence and links/canonicalizes to one source of truth. A separate calculator/store would duplicate evidence, versioning and privacy controls and is rejected. No domain or route was built.

## 24. Jurisdiction-neutral compatibility

DTO/profile selection/privacy are already neutral. Registry extension and labels are trivial. Real blockers are the San Diego route/slug, loader, overlay semantics, rule-builder text/URLs, coastal-shaped evidence registry, SD-only serving/lookup contract, and San Diego SEO/disclaimer copy. See `architecture-audit.json`. Packet 62 itself was not altered.

## 25. Profile-registry design

Key: `CITY_OF_LA_MESA + zone + municipal-code effective profile + ADU/state-law effective profile + applicable adopted specific-plan version + rule-modifying overlay signature`. Acquisition time/checksum stays provenance unless it changes operative rules. This avoids versioning every map refresh.

## 26. Benchmark parcels

`benchmarks.json` contains nine diverse public candidates: ordinary R1, R1E/P, R1R/P, R3, H hillside, P+MU, adopted specific-plan, jurisdiction-boundary mismatch, and TBD/unsupported zoning. No known ADU/permit benchmark was asserted because a complete parcel-addressable permit source was not established.

## 27. Golden-source plan

For every benchmark manually prove SanGIS APN/geometry; City mapped zone; overlay and adopted specific-plan applicability; operative Title 24 profile; recorded/survey dimensions before dimensional conclusions; primary dwelling facts; and current state/local ADU version. Boundary and TBD cases must remain fail-closed.

## 28. Data-volume estimates

Exact local/source counts: 17,391 accepted LM-attributed County parcels; 17,422 City zoning features; 920 overlay polygons; 16 zone codes; 8 residential codes; 1,511 specific-plan parcel points; 4 representative-point unmapped; 66 `TBD`; 0 point-level multi-zone. Full-polygon split/sliver/ambiguous counts remain pending Packet 64. Geometry defects: zoning 2, overlay 1, land use 5, specific plans 2.

## 29. Source manifest

`source-manifest.json` records publisher, URL/layer, observation/edit dates, checksums, authority, intended use and caveats. `source-snapshots` preserves the required GIS data locally. No secrets are present.

## 30. Provenance doctrine

Mapped zoning/overlay: SourceState `available` when the pinned City snapshot is readable; FactState `supported` for the mapped observation, never for entitlement; DerivationClass `recorded` for attributes and `deterministic_derived` for point/intersection results. ADU rules: `supported/recorded` only after current statute/code text is pinned; reconciliation is `conditional`; unresolved conflicts are `partial` or `unknown`. Missing/invalid source becomes `source_unavailable`/`unavailable`, not absence.

## 31. Risk register

See `risk-register.json`. Highest risks are source authority ambiguity, specific-plan overrides, local/state version mismatch, AB 956 effective-date handling, overlay modifiers, and proposed-vs-adopted contamination.

## 32. Implementation sequence

Packet 64: acquire/repair/dissolve La Mesa boundary, parcel, zoning, overlays and specific-plan geometry; full-polygon deterministic classification and fixture receipt. Packet 65: seal residential base and overlay/specific-plan rule profiles. Packet 66: seal 2026 ADU profile, state-law reconciliation, and future 2027 profile. Packet 67: benchmark/golden validation and jurisdiction-neutral V4/route integration. Packet 68: LaMesaADU.com front-door integration over the same engine.

## 33. Stop rules

Before production zoning load: exact source receipts, full pagination, repair invariance, County/City spatial reconciliation, APN collision policy, split/sliver classification, security and isolated rehearsal. Before public rule conclusions: sealed Title 24/adopted-plan/overlay profiles and golden review. Before ADU eligibility: operative state/local reconciliation plus required parcel/structure facts. Before indexing: canonical jurisdiction route, lookup disambiguation, privacy/SEO review, deterministic snapshot selection, browser/regression approval. None is authorized here.

## 34. Decision

`LA_MESA_JURISDICTION_RECON_READY_FOR_IMPLEMENTATION`

## 35. Tests/checks

Acquisition pagination and expected counts; metadata/field inventory; County APN uniqueness/missing address/geometry checks; City geometry validity; representative-point jurisdiction/zoning/overlay/specific-plan joins; source/raw and normalized SHA-256; static Packet 62 architecture scan; JSON parse; `git diff --check`. Runtime build is unnecessary because no application file changed.

## 36. Diff

Recon artifacts only under `data/la-mesa-jurisdiction-recon-v0/`; no application/runtime/lookup files.

## 37. Commit

To be filled by the Packet 63 closure report after committing with subject `Recon La Mesa jurisdiction sources`.

## 38. Preservation

No production access or mutation; Packet 11 frozen; no production zoning load; no selected snapshot; San Diego Parcel Page unchanged; Parcel Lookup unchanged; no deployment; no push; `/Users/ops/trulot-web` untouched.
