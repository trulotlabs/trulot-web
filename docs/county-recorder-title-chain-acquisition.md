# Packet 26 — Bounded County Recorder APN Kiosk Worksheet

## Purpose and boundary

Use this worksheet only at an official San Diego County Recorder public kiosk to collect the indexed Recorder/title-chain evidence needed for APNs `3506320400` and `6341302200`. Do not search unrelated parcels, substitute owner/name searches for APN results, infer a title chain, calculate compliance or capacity, or enter payment information into Codex-controlled fields.

The County states that, effective December 9, 2024, APN search is unavailable through the online Official Record Search and remains available only at public kiosks in its five offices. Document images can be viewed at those kiosks. Official information and office links: <https://www.sdarcc.gov/content/arcc/home/divisions/recorder-clerk/recording.html>.

## Search procedure

1. Search by the exact 10-digit APN. If the kiosk supports formatted APNs, also try the formatted form shown below.
2. Search the full date range shown for that parcel.
3. Record the total result count and every indexed result before applying filters.
4. If the result set is too large, preserve or print the complete result list first. Then filter by date or document type, record every filter used, and do not silently omit a potentially relevant mapping or title record.
5. Review every plausibly relevant index entry and available image. Common ownership or one tax APN is not proof of merger.
6. Obtain an authoritative copy only when the document contains operative legal-description or parcel-configuration evidence and the copy is reasonably available.
7. Record only the minimum grantor/grantee information necessary to distinguish and connect instruments. Do not capture unrelated personal information.

## Query A — Cabrillo

| Query field | Value |
| --- | --- |
| APN | `3506320400` |
| Formatted APN | `350-632-04-00` |
| Situs | `7553 CABRILLO AVE` |
| Assessor description | `TR 915 BLK 4 LOTS 7 THRU 9` |
| Originating map | `MAP 00915` |
| Originating filing | August 4, 1904 at 4:30 PM |
| Search range | `1904-08-04` through search date |
| Known issue | One APN references three separately recorded subdivision lots. Determine whether a later operative instrument merged, tied, adjusted, reverted, corrected, or otherwise configured Lots 7–9. |

Kiosk used: ____________________  Search date/time: ____________________

Unfiltered result count: ____________________

Filters used after preserving the full list: ________________________________________________________________

Full result list preserved as/at: ___________________________________________________________________________

### Cabrillo result log

Repeat rows as necessary. Do not limit the log to this page.

| Document number | Recording date | Document type | Grantor | Grantee | Short index description | APN indexed | Image reviewed? | Copy obtained? | Relation to legal-lot question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

Priority question: Were Lots 7, 8, and 9 ever legally merged, tied, adjusted, reverted, or superseded by a later map or compliance instrument?

Do not treat common ownership, a shared deed, or one assessor APN as an affirmative answer unless an operative instrument supports it.

## Query B — 27th Street

| Query field | Value |
| --- | --- |
| APN | `6341302200` |
| Formatted APN | `634-130-22-00` |
| Situs | `1456 27TH ST` |
| Assessor description | `PM17383 PAR 2` |
| Originating map | `PM 17383` |
| Originating filing | June 30, 1994 at 11:51 AM; File No. `1994-414843` |
| Search range | `1994-06-30` through search date |
| Recorded Parcel 2 area | `0.315 acres` |
| Current assessor evidence | Approximately `0.510 acres / 22,215 sq ft` |
| Current Parcel V2 geometry | Approximately `21,841 sq ft` |
| Known issue | Current parcel evidence materially exceeds the originating recorded Parcel 2 area. Identify any later operative instrument explaining the current configuration. |

Kiosk used: ____________________  Search date/time: ____________________

Unfiltered result count: ____________________

Filters used after preserving the full list: ________________________________________________________________

Full result list preserved as/at: ___________________________________________________________________________

### 27th Street result log

Repeat rows as necessary. Do not limit the log to this page.

| Document number | Recording date | Document type | Grantor | Grantee | Short index description | APN indexed | Image reviewed? | Copy obtained? | Relation to legal-lot question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

Priority question: What is the first instrument after PM 17383 that could explain the change from approximately 0.315 acre to approximately 0.51 acre?

Do not select an explanatory category until the index or document supports it.

## Target document families

Capture every plausibly relevant indexed instrument, including but not limited to:

- Lot Line Adjustment;
- Lot Tie Agreement;
- Merger or Notice of Merger;
- Certificate of Compliance;
- Certificate of Correction;
- Parcel Map;
- Final Map, Subdivision Map, or related recorded instrument;
- Reversion to Acreage;
- boundary adjustment or reconfiguration;
- easement, dedication, vacation, or right-of-way instrument affecting parcel configuration;
- deed containing a changed legal description or incorporating additional land;
- any instrument explicitly referencing Map 00915, PM 17383, Block 4, Lots 7–9, or Parcel 2;
- any other indexed instrument whose description or image could alter the legal-lot chain.

## Document review and copy decision

For every potentially relevant result:

1. Record the document number, recording date, document type, indexed APN, minimum identifying grantor/grantee information, and short index description.
2. View the document image when available and mark whether it was reviewed.
3. Identify the operative text, legal description, exhibit, map reference, or parcel configuration that makes it relevant.
4. Obtain an authoritative copy when that evidence could establish or change the legal-lot chain.
5. Keep unrelated deeds and personal information out of the handoff. Do not purchase documents that are plainly unrelated.

## Local handoff

Place original authoritative copies in:

`/private/tmp/trulot-packet-26-input/`

Preserve Recorder-supplied filenames and original bytes. If an unusable filename requires a descriptive local copy, retain the untouched original beside it.

Record the bounded index in:

`/private/tmp/trulot-packet-26-input/recorder-index.txt`

Use exactly these tab-separated columns:

```text
APN	document number	recording date	document type	short relevance note
```

Do not put payment data, account information, full unrelated party histories, or unnecessary personal data in that file.

## Kiosk checklist

- [ ] Use an official County Recorder public kiosk.
- [ ] Search APN `3506320400` from `1904-08-04` through the current date.
- [ ] Search APN `6341302200` from `1994-06-30` through the current date.
- [ ] Preserve each complete unfiltered result list and record the result count.
- [ ] Record every later filter used.
- [ ] Review every plausibly relevant index entry and available image.
- [ ] For Cabrillo, look specifically for an operative combination, tie, merger, adjustment, reversion, correction, or later map affecting Lots 7–9.
- [ ] For 27th Street, prioritize the first post-PM-17383 instrument that could explain the area/configuration change.
- [ ] Record document number, date, type, indexed APN, short relevance, image-review status, and copy status.
- [ ] Obtain only authoritative copies with operative configuration evidence.
- [ ] Save originals in `/private/tmp/trulot-packet-26-input/`.
- [ ] Update `recorder-index.txt` using only the five allowed fields.
- [ ] Exclude payment data and unnecessary personal information.
- [ ] Return with `FILES_READY`; do not adjudicate the chain at the kiosk.
