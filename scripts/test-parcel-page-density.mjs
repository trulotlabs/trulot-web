import assert from "node:assert/strict";
import path from "node:path";
import { fixture, root, renderToStaticMarkup } from "./parcel-v1-test-fixture.mjs";

const f = fixture({ tpa: true, ctcac: false, sda: true }, {
  parcelFields: {
    generated_at: "2026-09-30T12:00:00Z",
    situs_community: "Uptown",
    nucleus_use_cd: "11",
    year_effective: 1958,
    total_lvg_area: 1420,
  },
});
const loader = f.load(path.join(root, "lib/parcel-page-v1.ts"));
const result = await loader.getParcelPageV1Result("3113333800");
assert.ok(result.data);
const data = result.data;
const pageModule = f.load(path.join(root, "app/parcel/san-diego/[slug]/page.tsx"));
const params = Promise.resolve({ slug: data.canonicalSlug });
const html = renderToStaticMarkup(await pageModule.default({ params }));

for (const { label, fact } of data.facts) {
  assert.ok(html.includes(label), `missing fact label: ${label}`);
  assert.ok(html.includes(fact.value ?? "Not available in public records"), `missing fact value: ${label}`);
  assert.ok(html.includes(fact.sourceLabel), `missing fact source: ${label}`);
}
for (const item of data.snapshot) {
  assert.ok(html.includes(item.value));
  assert.ok(html.includes(item.sourceLabel));
}
for (const item of data.zoning.programs) {
  assert.ok(html.includes(item.name));
  assert.ok(html.includes(item.value ?? "Eligibility not yet exposed in the current parcel views."));
  assert.ok(html.includes(item.sourceLabel));
}
for (const item of [...data.zoning.interpretation, ...data.signals]) {
  assert.ok(html.includes(item.value));
  assert.ok(html.includes(item.sourceLabel));
}
for (const source of data.sources) {
  assert.ok(html.includes(source.dataset));
  assert.ok(html.includes(source.publisher));
  assert.ok(html.includes(source.vintageOrRefresh));
}
for (const section of data.methodology.sections) {
  assert.ok(html.includes(section.title));
  assert.ok(html.includes(section.body));
}
for (const item of data.methodology.faq) {
  assert.ok(html.includes(item.question));
  assert.ok(html.includes(item.answer));
}
assert.ok(html.includes(data.methodology.disclaimer));
assert.match(html, /<button[^>]+type="button"[^>]+aria-label="Copy APN/);
assert.match(html, /Additional public records/);
assert.match(html, /Sources &amp; methodology/);
assert.match(html, /application\/ld\+json/);
assert.doesNotMatch(html, /<meta[^>]+noindex/i);
assert.doesNotMatch(html, /<details[^>]+open(?:=|\s|>)/);
assert.ok((html.match(/<details/g) ?? []).length === (html.match(/<summary/g) ?? []).length);
assert.ok((html.match(/focus-visible:outline/g) ?? []).length >= 10);

const metadata = await pageModule.generateMetadata({ params: Promise.resolve({ slug: data.canonicalSlug }) });
assert.equal(metadata.alternates.canonical, `https://trulot-web.vercel.app${data.canonicalPath}`);
assert.match(metadata.title, /zoning, permits, and public parcel records \| TruLot$/);
assert.match(metadata.description, /lot size, zoning, mapped overlays, permit activity, nearby precedents, and sources/);

console.log("PASS Parcel Page density, provenance, rendered HTML, accessibility, and SEO checks");
