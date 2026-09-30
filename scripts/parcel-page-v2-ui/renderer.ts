import type { DisplayState, DisplayValue, ParcelPageV2UiModel, StandardsGroup } from "./adapter";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function status(state: DisplayState, label: string): string {
  return `<span class="status status--${escapeHtml(state)}"><span aria-hidden="true" class="status__dot"></span><span class="sr-only">Status: </span>${escapeHtml(label)}</span>`;
}

function valueCard(item: DisplayValue): string {
  const conditions = item.conditions?.length
    ? `<details class="condition"><summary>View exact condition</summary><ul>${item.conditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join("")}</ul></details>`
    : "";
  return `<article class="fact-card">
    <div class="fact-card__top"><h3>${escapeHtml(item.label)}</h3>${status(item.state, item.stateLabel)}</div>
    <p class="fact-card__value">${escapeHtml(item.value)}</p>
    ${item.source ? `<p class="source-label">${escapeHtml(item.source)}</p>` : ""}
    ${item.detail ? `<p class="fact-card__detail">${escapeHtml(item.detail)}</p>` : ""}
    ${conditions}
  </article>`;
}

function standardsGroup(group: StandardsGroup, index: number): string {
  const subtitle = [group.coverage ? `${group.coverage} of mapped parcel area` : null, group.stateLabel].filter(Boolean).join(" · ");
  const cards = group.standards.length
    ? `<div class="standards-grid">${group.standards.map(valueCard).join("")}</div>`
    : `<div class="empty-state"><p>${escapeHtml(group.explanation || "No base standards are available for this zone.")}</p></div>`;
  return `<section class="zone-group" aria-labelledby="zone-${index}-${slug(group.zoneCode)}">
    <div class="zone-group__heading">
      <div><p class="eyebrow">Zone ${index + 1}</p><h3 id="zone-${index}-${slug(group.zoneCode)}">${escapeHtml(group.zoneCode)}</h3><p>${escapeHtml(subtitle)}</p></div>
      ${status(group.state, group.stateLabel)}
    </div>
    ${group.explanation && group.standards.length ? `<p class="zone-note">${escapeHtml(group.explanation)}</p>` : ""}
    ${cards}
  </section>`;
}

function orientationItem(label: string, value: string, state: DisplayState, extra = ""): string {
  return `<article class="orientation-card">
    <p class="orientation-card__label">${escapeHtml(label)}</p>
    <p class="orientation-card__value">${escapeHtml(value)}</p>
    ${status(state, state === "supported" ? "Verified source state" : state === "review" ? "Review required" : state === "unavailable" ? "Source currently unavailable" : "Not yet verified")}
    ${extra}
  </article>`;
}

const CSS = `
:root{color-scheme:light;--ink:#172033;--muted:#5b6475;--line:#dbe1ea;--paper:#fff;--wash:#f5f7fa;--navy:#19355c;--blue:#245a98;--supported:#266047;--supported-bg:#eaf6ef;--conditional:#76520c;--conditional-bg:#fff4d6;--unknown:#4e596d;--unknown-bg:#eef1f5;--review:#684c22;--review-bg:#f8eedc;--unavailable:#66475a;--unavailable-bg:#f5eaf1;--radius:18px;--shadow:0 18px 50px rgba(24,38,61,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--wash);color:var(--ink);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.55}a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.site-header{background:#102744;color:white}.site-header__inner{max-width:1120px;margin:auto;padding:15px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:780;letter-spacing:-.02em}.preview-label{font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:#d6e7fb;border:1px solid #59789f;border-radius:999px;padding:5px 9px}.hero{background:linear-gradient(155deg,#17365f 0%,#244d7b 62%,#315f88 100%);color:white}.hero__inner{max-width:1120px;margin:auto;padding:38px 20px 42px}.breadcrumb,.eyebrow{margin:0 0 8px;font-size:12px;font-weight:760;letter-spacing:.1em;text-transform:uppercase}.breadcrumb{color:#c8d8ec}.hero h1{max-width:780px;margin:0;font-size:clamp(31px,7vw,55px);line-height:1.06;letter-spacing:-.045em}.hero__meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin:18px 0 0;color:#dce7f5;font-size:14px}.page{max-width:1120px;margin:0 auto;padding:22px 16px 64px}.notice{background:#eef6ff;border:1px solid #c8dcf3;border-radius:14px;padding:13px 16px;margin-bottom:22px;color:#25466d;font-size:14px}.section{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:22px;margin-top:18px;box-shadow:var(--shadow)}.section__heading{max-width:760px;margin-bottom:18px}.section__heading h2{font-size:clamp(23px,4vw,31px);line-height:1.15;letter-spacing:-.025em;margin:0 0 7px}.section__heading p{color:var(--muted);margin:0}.orientation-grid,.facts-grid,.standards-grid{display:grid;grid-template-columns:1fr;gap:12px}.orientation-card,.fact-card,.investigation,.capacity-card{border:1px solid var(--line);border-radius:14px;padding:16px;background:white}.orientation-card__label{margin:0 0 6px;color:var(--muted);font-size:13px;font-weight:700}.orientation-card__value{font-size:20px;line-height:1.25;font-weight:760;letter-spacing:-.015em;margin:0 0 12px;overflow-wrap:anywhere}.zone-list{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0 0;padding:0;list-style:none}.zone-list li{border-radius:10px;background:#e8eef6;color:#193d68;padding:6px 9px;font-size:13px;font-weight:700}.zone-group{border-top:1px solid var(--line);padding-top:20px;margin-top:20px}.zone-group:first-of-type{border-top:0;margin-top:0;padding-top:0}.zone-group__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.zone-group__heading h3{font-size:24px;margin:0}.zone-group__heading p{margin:3px 0 0;color:var(--muted);font-size:14px}.zone-note{color:var(--muted)}.fact-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.fact-card h3{font-size:14px;line-height:1.35;margin:0;color:#344056}.fact-card__value{font-size:22px;line-height:1.2;font-weight:760;letter-spacing:-.02em;margin:13px 0 5px}.source-label{font-size:12px;font-weight:720;color:var(--blue);margin:0}.fact-card__detail{color:var(--muted);font-size:13px;margin:10px 0 0}.status{display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:100%;border-radius:999px;padding:5px 9px;font-size:11px;line-height:1.2;font-weight:780;white-space:normal}.status__dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.status--supported{color:var(--supported);background:var(--supported-bg)}.status--conditional{color:var(--conditional);background:var(--conditional-bg)}.status--unknown{color:var(--unknown);background:var(--unknown-bg)}.status--review{color:var(--review);background:var(--review-bg)}.status--unavailable{color:var(--unavailable);background:var(--unavailable-bg)}.status--not_applicable{color:var(--unknown);background:var(--unknown-bg)}.condition{margin-top:13px;border-top:1px solid var(--line);padding-top:11px}.condition summary,.evidence summary{cursor:pointer;font-weight:720;color:#244f82}.condition summary:focus-visible,.evidence summary:focus-visible{outline:3px solid #75a9e2;outline-offset:4px;border-radius:3px}.condition ul{margin:10px 0 0;padding-left:20px;color:var(--muted);font-size:13px}.unknown-list,.investigation-list{display:grid;gap:10px}.unknown-row{border:1px solid var(--line);border-radius:14px;padding:14px 15px;display:grid;gap:7px}.unknown-row__top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.unknown-row h3{font-size:16px;margin:0}.unknown-row p{margin:0;color:var(--muted);font-size:14px}.unknown-row__action{color:var(--blue)!important;font-weight:700}.investigation{display:grid;grid-template-columns:34px 1fr;gap:12px}.investigation__number{width:30px;height:30px;border-radius:50%;background:#e7eef7;color:#244b78;display:grid;place-items:center;font-weight:800}.investigation h3{font-size:17px;margin:2px 0 4px}.investigation p{font-size:14px;color:var(--muted);margin:4px 0}.investigation dl{display:grid;gap:7px;margin:12px 0 0}.investigation dt{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#697386}.investigation dd{margin:0;font-size:13px}.capacity-card{background:#f7f9fc}.capacity-card h3{font-size:21px;margin:0}.capacity-card__state{font-weight:780;color:#4e596d;margin:4px 0}.capacity-card p:last-child{color:var(--muted);margin-bottom:0}.evidence{border-top:1px solid var(--line);padding:15px 0}.evidence:first-of-type{border-top:0}.evidence summary{display:flex;justify-content:space-between;gap:12px;align-items:center}.evidence__body{padding:13px 0 2px}.evidence dl{display:grid;grid-template-columns:minmax(100px,150px) 1fr;gap:8px 14px;margin:0}.evidence dt{font-weight:740;color:#445066}.evidence dd{margin:0;overflow-wrap:anywhere}.developer-evidence{margin-top:12px;padding:12px;border-radius:10px;background:#f4f6f9}.developer-evidence code{font-size:11px;overflow-wrap:anywhere}.footer-note{text-align:center;color:#687184;font-size:13px;margin:28px auto 0;max-width:700px}.empty-state{border:1px dashed #c5ccd7;border-radius:14px;padding:18px;color:var(--muted);background:#fafbfc}.empty-state p{margin:0}
@media(min-width:700px){.page{padding:28px 24px 72px}.hero__inner,.site-header__inner{padding-left:28px;padding-right:28px}.section{padding:28px}.orientation-grid{grid-template-columns:repeat(3,1fr)}.facts-grid,.standards-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.unknown-list{grid-template-columns:repeat(2,minmax(0,1fr))}.investigation-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1040px){.facts-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.standards-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.section{padding:32px}.hero__inner{padding-top:48px;padding-bottom:52px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{.site-header,.notice{display:none}.hero{background:white;color:var(--ink);border-bottom:2px solid var(--ink)}.hero__meta,.breadcrumb{color:var(--ink)}.page{max-width:none}.section{box-shadow:none;break-inside:avoid}}
`;

export function renderParcelPageV2(model: ParcelPageV2UiModel): string {
  const zoneItems = model.orientation.zones.length
    ? `<ul class="zone-list" aria-label="Mapped base zones">${model.orientation.zones.map((zone) => `<li>${escapeHtml(zone.code)}${zone.coverage ? ` · ${escapeHtml(zone.coverage)}` : ""}</li>`).join("")}</ul>`
    : "";
  const unknowns = model.unknowns.length
    ? model.unknowns.map((item) => `<article class="unknown-row"><div class="unknown-row__top"><h3>${escapeHtml(item.label)}</h3>${status(item.state, item.stateLabel)}</div><p>${escapeHtml(item.detail || item.value)}</p>${item.linkedAction ? `<p class="unknown-row__action">Next: ${escapeHtml(model.investigations.find((action) => action.action === item.linkedAction)?.title || item.linkedAction)}</p>` : ""}</article>`).join("")
    : `<div class="empty-state"><p>No material unresolved facts are recorded in this fixture.</p></div>`;
  const investigations = model.investigations.length
    ? model.investigations.map((item, index) => `<article class="investigation"><div class="investigation__number" aria-hidden="true">${index + 1}</div><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p><dl><div><dt>Needed evidence</dt><dd>${escapeHtml(item.requiredEvidence)}</dd></div><div><dt>Blocks</dt><dd>${escapeHtml(item.blockedConclusion.replaceAll("_", " ").toLowerCase())}</dd></div></dl></div></article>`).join("")
    : `<div class="empty-state"><p>No next investigation action is recorded.</p></div>`;
  const evidence = model.evidence.map((item) => `<details class="evidence"><summary><span>${escapeHtml(item.layer)}</span>${status(item.state, item.stateLabel)}</summary><div class="evidence__body"><dl><dt>Source</dt><dd>${escapeHtml(item.source)}</dd><dt>Contract/version</dt><dd>${escapeHtml(item.version)}</dd><dt>Derivation</dt><dd>Recorded or deterministically derived as specified by the source contract</dd><dt>Limit</dt><dd>This evidence supports the displayed fact state; it does not establish compliance or development capacity.</dd></dl><details class="developer-evidence"><summary>Developer evidence</summary><p><strong>Artifact fingerprint</strong><br><code>${escapeHtml(item.artifactFingerprint)}</code></p><p><strong>Record fingerprint</strong><br><code>${escapeHtml(item.recordFingerprint)}</code></p></details></div></details>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(model.header.title)} · Parcel V2 preview · TruLot</title><style>${CSS}</style></head>
<body>
  <header class="site-header"><div class="site-header__inner"><div class="brand">TruLot</div><div class="preview-label">Non-production V2 preview</div></div></header>
  <main>
    <section class="hero" aria-labelledby="parcel-title"><div class="hero__inner"><p class="breadcrumb">San Diego parcel intelligence</p><h1 id="parcel-title">${escapeHtml(model.header.title)}</h1><div class="hero__meta"><span>APN ${escapeHtml(model.header.apn)}</span><span>${escapeHtml(model.header.jurisdiction)}</span><span>Evidence as of ${escapeHtml(model.asOf)}</span>${status(model.header.identityState, `Parcel identity ${model.header.identityLabel.toLowerCase()}`)}</div></div></section>
    <div class="page">
      <aside class="notice" aria-label="Preview status"><strong>Review preview.</strong> This static page is disconnected from production and makes no compliance or development-capacity conclusion.</aside>

      <section class="section" aria-labelledby="applies-heading"><div class="section__heading"><h2 id="applies-heading">What applies here</h2><p>Base zoning and Coastal context determine which recorded standards version can be shown.</p></div><div class="orientation-grid">
        ${orientationItem("Base zoning", model.orientation.zoningLabel, model.orientation.zoningState, zoneItems)}
        ${orientationItem("Coastal context", model.orientation.coastalLabel, model.orientation.coastalState)}
        ${orientationItem("Applicable standards version", model.orientation.standardsVersion, model.orientation.standardsVersionState)}
      </div></section>

      <section class="section" aria-labelledby="standards-heading"><div class="section__heading"><h2 id="standards-heading">Base development standards</h2><p>Recorded base-zone rules are shown without applying them to this parcel. Conditional rules keep their conditions.</p></div>${model.standardsGroups.map(standardsGroup).join("")}</section>

      <section class="section" aria-labelledby="facts-heading"><div class="section__heading"><h2 id="facts-heading">Existing property facts</h2><p>Recorded and derived facts retain their source meaning and limitations.</p></div><div class="facts-grid">${model.propertyFacts.map(valueCard).join("")}</div></section>

      <section class="section" aria-labelledby="unknowns-heading"><div class="section__heading"><h2 id="unknowns-heading">What we don’t know yet</h2><p>These are evidence gaps, not negative findings. The most material gaps appear first.</p></div><div class="unknown-list">${unknowns}</div></section>

      <section class="section" aria-labelledby="next-heading"><div class="section__heading"><h2 id="next-heading">Next investigation</h2><p>Deterministic actions from the Parcel Intelligence contract connect each gap to the evidence needed next.</p></div><div class="investigation-list">${investigations}</div></section>

      <section class="section" aria-labelledby="capacity-heading"><div class="section__heading"><h2 id="capacity-heading">Development capacity</h2></div><article class="capacity-card"><h3>${escapeHtml(model.capacity.label)}</h3><p class="capacity-card__state">No units or buildable area calculated</p><p>${escapeHtml(model.capacity.explanation)}</p></article></section>

      <section class="section" aria-labelledby="evidence-heading"><div class="section__heading"><h2 id="evidence-heading">Evidence / How TruLot knows</h2><p>Open a source layer for provenance, version, derivation, limitations, and optional technical fingerprints.</p></div>${evidence}</section>
      <p class="footer-note">Packet 19 static review artifact · Adapter ${escapeHtml(model.adapterVersion)} · Source contract ${escapeHtml(model.sourceContractVersion)}</p>
    </div>
  </main>
</body></html>`;
  return html.replace(/[ \t]+$/gm, "");
}
