import assert from "node:assert/strict";
import path from "node:path";
import { fixture, renderToReadableStream, root } from "./parcel-v1-test-fixture.mjs";

const f = fixture({ tpa: false, ctcac: false, sda: false });
const adapter = f.load(path.join(root, "lib/parcel-page-v1.ts"));

const core = await adapter.getParcelPageV1CoreResult("3113333800");
assert.ok(core.data);
assert.deepEqual(f.fromCalls(), ["parcel_page_api_v2"]);
assert.equal(core.sourceStatus.permits.sourceState, "not_evaluated");
assert.equal(core.sourceStatus.similarLots.sourceState, "not_evaluated");
assert.equal(core.truth.permits.state, "unavailable");
assert.equal(core.truth.permits.sourceState, "not_evaluated");
assert.equal(core.data.permits.thisParcel.length, 0);
assert.equal(core.data.similarLots.matches.length, 0);

const secondary = await adapter.getParcelPageV1SecondaryResult("3113333800");
assert.ok(secondary.data);
assert.deepEqual(f.fromCalls().slice(1), [
  "parcel_page_api_v2",
  "trulot_permit_parcel_link_v1",
  "parcel_page_api_v2",
]);
assert.equal(secondary.data.permits.thisParcel[0].permitNumber, "FIXTURE-1");
assert.equal(secondary.truth.permits.sourceState, "available");

const Page = f.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx")).default;
const stream = await renderToReadableStream(await Page({
  params: Promise.resolve({ slug: core.data.canonicalSlug }),
}));
const html = await new Response(stream).text();
assert.match(html, /Property facts/);
assert.match(html, /Permit &amp; development activity/);
assert.match(html, /FIXTURE-1/);
assert.ok(html.indexOf("Property facts") < html.indexOf("FIXTURE-1"));
assert.doesNotMatch(html, /owner name|mailing address|private source failure/i);

const timing = f.load(path.join(root, "lib/parcel-server-timing.ts"));
const metrics = [];
const recorder = timing.createParcelServerTiming("page_secondary", { enabled: true, sink: metric => metrics.push(metric) });
recorder.mark("route_entry");
recorder.finish();
assert.deepEqual(metrics.map(metric => metric.operation), ["page_secondary", "page_secondary"]);
assert.ok(metrics.every(metric => !Object.hasOwn(metric, "apn") && !Object.hasOwn(metric, "address")));

console.log("PASS canonical Parcel Page streams permit and similar-lot evidence after the public-safe core shell");
