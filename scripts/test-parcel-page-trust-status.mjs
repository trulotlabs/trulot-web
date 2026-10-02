import assert from "node:assert/strict";
import path from "node:path";
import { fixture, root, renderToStaticMarkup } from "./parcel-v1-test-fixture.mjs";

const candidates = [
  { apn_norm: "2000000001", address: "201 Nearby St", city: "San Diego", state: "CA", base_zone: "RS-1-7", zone_name: "RS-1-7", lot_area_sqft: 7000, lat: 32.7505, lng: -117.19 },
  { apn_norm: "2000000002", address: "202 Nearby St", city: "San Diego", state: "CA", base_zone: "RS-1-7", zone_name: "RS-1-7", lot_area_sqft: 7100, lat: 32.751, lng: -117.19 },
  { apn_norm: "2000000003", address: "203 Nearby St", city: "San Diego", state: "CA", base_zone: "RS-1-7", zone_name: "RS-1-7", lot_area_sqft: 7200, lat: 32.7515, lng: -117.19 },
];

const permits = candidates.map((candidate, index) => ({
  apn_norm: candidate.apn_norm,
  record_number: `NEAR-${index + 1}`,
  record_type: "Building permit",
  status: "Issued",
  description: `Recorded nearby project ${index + 1}`,
  opened_date: `2026-0${index + 1}-01`,
}));

async function load(options = {}, overlay = { tpa: true, ctcac: false, sda: true }) {
  const f = fixture(overlay, options);
  const result = await f.load(path.join(root, "lib/parcel-page-v1.ts")).getParcelPageV1Result("3113333800");
  const Page = f.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx")).default;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: result.data.canonicalSlug }) }));
  return { result, html };
}

const mapped = await load({ similarData: candidates, similarPermitData: permits.slice(0, 2) });
const programs = Object.fromEntries(mapped.result.data.zoning.programs.map(item => [item.name, item]));
assert.equal(programs["Transit Priority Area"].displayState, "mapped_overlay");
assert.equal(programs["Sustainable Development Area"].displayState, "verification_pending");
assert.equal(programs["Accessory Dwelling Unit rules"].displayState, "not_evaluated");
assert.equal(programs["SB 9"].displayState, "not_evaluated");
assert.equal(programs["Complete Communities / other bonus programs"].displayState, "not_evaluated");
assert.equal(mapped.result.truth.overlays.tpa.state, "supported");
assert.match(mapped.html, /Mapped overlay/);
assert.match(mapped.html, /Verification pending/);
assert.match(mapped.html, /Eligibility not yet evaluated/);
assert.match(mapped.html, />Conditional</);

assert.equal(mapped.result.data.similarLots.totalMatchCount, 3);
assert.equal(mapped.result.data.similarLots.activityMatchCount, 2);
assert.deepEqual(mapped.result.data.similarLots.matches.map(match => match.hasRecordedActivity), [true, true, false]);
assert.match(mapped.html, /2 nearby parcels have recorded development activity/);
assert.doesNotMatch(mapped.html, /3 nearby parcels have recorded development activity/);
assert.match(mapped.html, /2 nearby parcels with the same recorded base zone and similar lot size have recorded permit activity/);
assert.match(mapped.html, /No recorded permit activity found/);

const zero = await load({ similarData: candidates, similarPermitData: [] });
assert.equal(zero.result.data.similarLots.totalMatchCount, 3);
assert.equal(zero.result.data.similarLots.activityMatchCount, 0);
assert.ok(zero.result.data.similarLots.matches.every(match => !match.hasRecordedActivity));
assert.doesNotMatch(zero.html, /\d+ nearby parcels have recorded development activity/);
assert.doesNotMatch(zero.html, /nearby parcels .* have recorded permit activity/);
assert.match(zero.html, /No matched nearby parcels have recorded development activity in this source/);

const all = await load({ similarData: candidates, similarPermitData: permits });
assert.equal(all.result.data.similarLots.activityMatchCount, 3);
assert.match(all.html, /3 nearby parcels have recorded development activity/);

const unavailable = await load({ similarData: candidates, similarPermitError: { code: "42501" } });
assert.equal(unavailable.result.sourceStatus.similarLots.status, "source_unavailable");
assert.equal(unavailable.result.data.similarLots.activityMatchCount, 0);
assert.equal(unavailable.result.data.similarLots.matches.length, 0);
assert.doesNotMatch(unavailable.html, /\d+ nearby parcels have recorded development activity/);

const overlayUnavailable = await load({ error: { code: "42501" } });
const unavailableTpa = overlayUnavailable.result.data.zoning.programs.find(item => item.name === "Transit Priority Area");
assert.equal(unavailableTpa.displayState, "source_unavailable");
assert.match(overlayUnavailable.html, /Source unavailable/);

for (const html of [mapped.html, zero.html, all.html, unavailable.html, overlayUnavailable.html]) {
  assert.doesNotMatch(html, /TODO|Technical note|adapter|current parcel views|not yet attached|lookup function|check_parcel_overlays\(lat,lng\)|parcel_page_api_v2/i);
  assert.match(html, /TruLot summarizes public records and planning data/);
  assert.match(html, /id="sources-methodology"/);
  assert.doesNotMatch(html, /aria-label="[^"]*(TODO|adapter|lookup|parcel_page_api_v2)/i);
}

console.log("PASS Packet 48B program states, public language, activity counts, provenance, and zero/partial cases");
