# TruLot Parcel Page V1 — Backend Field Mapping Report

This report tracks the Parcel Page V1 adapter fields, the current backend source, whether the field is available now, how nulls render, the public source label shown in the UI, and the confidence tier used on-page.

| Field name | Source table/view | Available now? | Null behavior | Source label | Confidence tier |
|---|---|---:|---|---|---|
| `identity.address` | `parcel_page_api_v2.address` | yes | Fall back to APN-only heading | SanGIS / assessor situs address | recorded |
| `identity.zip` | `parcel_page_api_v2.situs_zip` or future adapter | no | Show `Not available in public records` | TODO — situs ZIP adapter | recorded |
| `identity.neighborhood` | future neighborhood layer adapter | no | Omit from identity subline | TODO — neighborhood layer adapter | mapped |
| `identity.communityPlanArea` | `parcel_page_api_v2.situs_community` | yes | Omit from identity subline | Current parcel community field | mapped |
| `identity.dataRefreshedAt` | `parcel_page_api_v2.generated_at` | yes | Show refresh unavailable fallback | Current parcel view refresh timestamp | recorded |
| `facts.lotSizeSqFt` | `parcel_page_api_v2.lot_area_sqft` | yes | Show `Not available in public records` | SanGIS parcel layer | recorded |
| `facts.existingUse` | `parcel_page_api_v2.nucleus_use_cd` | yes | Show `Not available in public records` | County Assessor use code | recorded |
| `facts.yearBuilt` | `parcel_page_api_v2.year_effective` | yes | Show `Not available in public records` | County Assessor | recorded |
| `facts.buildingSizeSqFt` | `parcel_page_api_v2.total_lvg_area` | yes | Show `Not available in public records` | County Assessor building area | recorded |
| `facts.zoningCode` | `parcel_page_api_v2.zone_name` | yes | Show `Not available in public records` | Mapped base zone | mapped |
| `facts.communityPlan` | `parcel_page_api_v2.situs_community` | yes | Show `Not available in public records` | Current parcel community field | mapped |
| `facts.overlays` | `check_parcel_overlays(lat,lng)` | yes | Show overlay lookup unavailable state | Overlay lookup function | mapped |
| `facts.ownerType` | future owner-type adapter | no | Show `Not available in public records` | TODO — owner type category adapter | recorded |
| `facts.lastSale` | future recorder sale-date adapter | no | Show `Not available in public records` | TODO — recorder sale-date adapter | recorded |
| `facts.sewer` | future sewer adapter | no | Show `Not available in public records` | TODO — sewer adapter | recorded |
| `snapshot[0]` | `parcel_page_api_v2` lot + use + building fields | yes | Omit sentence if required inputs missing | SanGIS parcel layer + County Assessor | recorded |
| `snapshot[1]` | `parcel_page_api_v2.zone_name` + `check_parcel_overlays` | yes | Omit sentence if zone unavailable | Mapped base zone + overlay lookup | mapped |
| `snapshot[2]` | `parcel_permit_terminal_v2` linked through parsed APN helper | yes | Swap to no-permits sentence when no reliable direct permit link exists | City permit record via exact or parsed APN match | recorded |
| `snapshot[3]` | `parcel_page_api_v2` + `parcel_permit_terminal_v2` | yes | Omit sentence if nearby matching unavailable | Same-zone parcel query + permit records | mapped |
| `zoning.base.code` | `parcel_page_api_v2.zone_name` | yes | Show base-zone unavailable fallback | Mapped base zone | mapped |
| `zoning.base.plainName` | future curated zoning copy table | no | Show plain-name unavailable state | TODO — curated zoning copy table | mapped |
| `zoning.base.description` | future curated zoning copy table | no | Show description unavailable state | TODO — curated zoning copy table | mapped |
| `zoning.base.standards[]` | future zone standards adapter | no | Show standards unavailable state | TODO — zoning standards adapter | mapped |
| `zoning.programs.adu` | future program rules adapter | no | Show `Eligibility not yet exposed in the current parcel views` | TODO — program rules adapter | conditional |
| `zoning.programs.sb9` | future program rules adapter | no | Show `Eligibility not yet exposed in the current parcel views` | TODO — program rules adapter | conditional |
| `zoning.programs.tpa` | `check_parcel_overlays(lat,lng)` | yes | Show overlay lookup unavailable state | Overlay lookup function | conditional |
| `zoning.programs.sda` | `check_parcel_overlays(lat,lng)` | yes | Show overlay lookup unavailable state | Overlay lookup function | conditional |
| `zoning.programs.completeCommunities` | future program rules adapter | no | Show `Eligibility not yet exposed in the current parcel views` | TODO — program rules adapter | conditional |
| `similarLots.matches[]` | `parcel_page_api_v2` + `parcel_permit_terminal_v2` | yes | Show no-nearby-precedents empty state | Same-zone parcel query + permit records | mapped |
| `permits.thisParcel[]` | `parcel_permit_terminal_v2` linked through parsed APN helper (`trulot_permit_parcel_link_v1` planned) | yes | Show no-permits empty state when only weak or no linkage is available | City permit record via exact or parsed APN match | recorded |
| `permits.nearbySummary[]` | `parcel_page_api_v2.nearby_*` | yes | Show section-unavailable fallback | Parcel nearby development summary | mapped |
| `signals.coverage` | `parcel_page_api_v2.total_lvg_area` + `lot_area_sqft` | yes | Show no-signals empty state | Assessor + parcel area fields | mapped |
| `signals.overlay` | `check_parcel_overlays(lat,lng)` | yes | Show no-signals empty state | Overlay lookup function | mapped |
| `signals.nearbyActivity` | `parcel_page_api_v2.nearby_project_count` | yes | Show no-signals empty state | Parcel nearby development summary | mapped |

## Notes

- The live parcel page intentionally does **not** fabricate zoning standards, plain-language zone descriptions, owner type categories, recorder sale dates, sewer data, or program eligibility rows that are not yet exposed by the current backend route.
- When those fields are missing, the adapter returns explicit TODO-backed placeholders and the UI renders honest null states.
- Similar lots use canonical internal parcel URLs generated from APN + address whenever the address field is present in the live parcel view.
