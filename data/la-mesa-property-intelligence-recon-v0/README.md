# La Mesa Property Intelligence Recon V0

Packet 72 evaluates recorded property characteristics, public permit discoverability, observational building outlines, and currentness signals against the sealed 17,391-APN La Mesa population. It is evidence and design only. It does not change V4 logic, homeowner UI, Parcel Lookup, production data, or public behavior.

## Result

`LA_MESA_PROPERTY_INTELLIGENCE_RECON_READY_FOR_IMPLEMENTATION`

The sealed SanGIS parcel acquisition already includes County ARCC-derived MPR/PAR characteristics. Nucleus use is non-unknown for 17,132 parcels; positive recorded unit quantity exists for 16,432; positive valid-range total living area exists for 16,276. `YEAR_EFFECTIVE` is not building age: the source explicitly prohibits that use and is not Y2K compliant. Assessor land-use fields are irregularly maintained and cannot establish current legal as-built conditions.

The anonymous City MaintStar sample found records for 23 of 25 purposeful cases. Its public response supports record/type/status/milestone/address evidence, but did not establish complete history, bulk export, valuation, APN echo, inspections, or separate application/issue/final milestones. The sample is not a countywide estimate.

The Spring-2017 SanGIS building-outline capture assigned at least one observational footprint to 16,253 parcels (93.46%); 7,141 have multiple outline assignments and 3,262 are affected by stacked/ambiguous tax-parcel matching. These are `OBSERVATIONAL_GEOMETRY`, never permit or legal-structure evidence.

The conservative uplift bound is 11,993 current `Needs property evidence` parcels whose recorded use and unit count form a matching detached-single-family or multifamily preliminary state. It supports future preselection for user confirmation only after licensing, currentness, and conflict gates. The 15,289 optimistic bound includes condo and weak/conflict states and cannot suppress questions. Neither bound is eligibility.

## Reproduction

`build.py` documents the inputs and deterministic derivations. `validate.py` checks the committed recon contract, canonical APN seal, sample size, coverage arithmetic, source receipts, decision, and preservation boundaries without network access. Raw licensed building outlines and bulk assessor rows are not repackaged here; their content fingerprints and derived evidence are recorded.
