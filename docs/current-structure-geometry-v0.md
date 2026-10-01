# Current Structure Geometry Evidence V0

Packet 39 determines what structure geometry TruLot can support for APN `6341302200` without calculating setback compliance, lot coverage, or development capacity.

## Source findings

The City/SANDAG Building Outlines layer supplies two directly linked polygons and one boundary-touching ambiguous polygon. The outlines were delineated from Spring 2017 regional imagery using the EagleView/Pictometry ChangeFinder methodology. They remain authoritative historical outline evidence; their currentness and completeness are not established.

SANDAG's `Imagery/SD2023_9inch` service describes public 2023 regional imagery sourced from Nearmap and resampled to 9 inches. The service uses EPSG:2230 and a 0.75-foot pixel size. The parcel intersects primary source tile `SanGIS_Nearmap_Sp23_9in_29_02` and public grid tile `29_02`. The service and tile metadata establish Spring 2023 vintage but publish no parcel-specific acquisition timestamp. The service-linked metadata PDF is a 2020 order summary, so it is not used to assign a 2023 shot time or rectification chain.

One 515 by 325 pixel extract covering only the parcel and immediate context was retained outside Git. Its requested EPSG:2230 bounding box is `[6307015.78398855, 1788099.0010645539, 6307401.868162051, 1788342.9998923093]`, byte size is `38,562`, and SHA-256 is `85081333a7984dccc06870a9f35e56b63afac338bd25af4b53d954c9cc9bde51`.

## Change and permit review

Both directly linked 2017 outlines show no obvious plan-view change in the Spring 2023 image at 9-inch resolution. This is a visual roof/visible-outline finding, not a construction-status, wall-location, or current-through-2026 conclusion. The northern boundary-touching outline remains ambiguous and is not attributed to the parcel.

OpenDSD returned no exact-address result. Accela returned no APN result and one exact-address result: `PMT-3276742`, a no-plan plumbing record for approximately 105 lineal feet of new iron gas pipe. It opened February 26, 2024, was issued February 27, and was finaled and closed February 29. Its stated scope has no footprint effect. No relevant public approved site or building plan was found. Permit absence is not proof that no physical change occurred.

## Geometry doctrine

Roof outline, visible structure outline, building footprint, outer edge of building frame, permitted structure envelope, and assessor living area are separate concepts. SDMC section 113.0252(c) measures new-development setbacks to the outer edge of the building frame. Orthophoto roof edges cannot be promoted to that semantic because overhangs, shadows, occlusions, resampling, and perspective separate the visible edge from the frame.

SDMC section 113.0240 calculates lot coverage from the structure footprint measured at the exterior walls or support structure, with explicit inclusions and exclusions. The imagery cannot resolve those conditions. Assessor living area is neither footprint nor gross floor area.

## Registration and suitability

PM 17383 Parcel 1 is the sealed legal lot. Its recorded dimensions establish legal-lot evidence, but the map has no surveyed coordinate registration to the 2023 image. Exact-APN SanGIS parcel geometry in EPSG:2230 was used only as broad diagnostic control and was not silently promoted to the legal boundary.

The evidence state is `OBSERVATIONAL_STRUCTURE_GEOMETRY_SUPPORTED`, current as observed in Spring 2023 only. Current-through-2026 and current project-approved geometry remain unresolved.

`COMPLIANCE_GEOMETRY_NOT_READY`

Lot-coverage geometry is also not ready. No coverage percentage was calculated.

## Product and scale

Safe wording is: “Official 2017 building outlines exist. Spring 2023 regional imagery shows no obvious plan-view change to the two directly linked outlines, but current compliance-grade structure geometry has not been established.”

The workflow can cohort parcels into approved-plan geometry, recent imagery plus visually unchanged historical outline, imagery showing change, ambiguous multi-structure/stacked linkage, and no usable geometry. Packet 39 performs no citywide processing.

`CURRENT_STRUCTURE_GEOMETRY_V0_READY`

`NEXT_FEASIBILITY_SOURCE_TARGET: survey-controlled building footprint`
