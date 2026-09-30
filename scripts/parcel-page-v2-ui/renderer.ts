import type { DisplayState, DisplayValue, ParcelPageV2UiModel, StandardsGroup } from "./adapter";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function displayApn(apn: string): string {
  const digits = apn.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}` : digits;
}

function status(state: DisplayState, label: string): string {
  return `<span class="status status--${escapeHtml(state)}"><span aria-hidden="true" class="status__dot"></span><span class="sr-only">Status: </span>${escapeHtml(label)}</span>`;
}

function usefulCondition(item: DisplayValue): string | null {
  if (item.state !== "conditional") return null;
  const candidates = (item.conditions || []).filter((value) => !value.startsWith("Unresolved dependencies:") && !value.startsWith("Referenced exceptions:"));
  return candidates.find((value) => value.length > 32 && !/^See Section/i.test(value))
    || candidates.find((value) => !/^See Section/i.test(value))
    || "Conditions apply; the parcel-specific requirement has not been determined.";
}

function conditionDetails(item: DisplayValue): string {
  if (!item.conditions?.length) return "";
  return `<details class="rule-details"><summary>Full rule conditions</summary><ul>${item.conditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join("")}</ul></details>`;
}

function standardCard(item: DisplayValue): string {
  const condition = usefulCondition(item);
  return `<article class="standard-card"><div class="card-top"><h4>${escapeHtml(item.label)}</h4>${status(item.state, item.stateLabel)}</div><p class="standard-card__value">${escapeHtml(item.value)}</p>${condition ? `<p class="standard-card__condition">${escapeHtml(condition)}</p>` : ""}${item.source ? `<p class="rule-citation">${escapeHtml(item.source)}</p>` : ""}${conditionDetails(item)}</article>`;
}

function factCard(item: DisplayValue): string {
  return `<article class="fact-card"><div class="card-top"><h3>${escapeHtml(item.label)}</h3>${status(item.state, item.stateLabel)}</div><p class="fact-card__value">${escapeHtml(item.value)}</p>${item.source ? `<p class="source-label">${escapeHtml(item.source)}</p>` : ""}${item.detail ? `<p class="fact-detail">${escapeHtml(item.detail)}</p>` : ""}</article>`;
}

const PRIORITY_STANDARDS = new Set([
  "Minimum lot area", "Minimum front setback", "Minimum interior-side setback", "Minimum street-side setback",
  "Minimum rear setback", "Maximum structure height", "Density basis", "Maximum floor-area ratio",
]);

function standardsGroup(group: StandardsGroup, index: number, split: boolean): string {
  const primary = group.standards.filter((item) => PRIORITY_STANDARDS.has(item.label));
  const secondary = group.standards.filter((item) => !PRIORITY_STANDARDS.has(item.label));
  const groupLabel = group.state === "not_applicable" ? "Detailed standards not included" : group.stateLabel;
  const subtitle = [split && group.coverage ? `${group.coverage} of mapped parcel area` : null, groupLabel].filter(Boolean).join(" · ");
  const source = group.standards.find((item) => item.detail)?.detail;
  const publicExplanation = group.state === "not_applicable" ? "Detailed standards for this zone are not included in this TruLot version." : group.explanation;
  const content = group.standards.length
    ? `<div class="standards-grid standards-grid--primary">${primary.map(standardCard).join("")}</div>${secondary.length ? `<details class="secondary-disclosure"><summary>Lot dimensions and corner condition (${secondary.length})</summary><div class="standards-grid">${secondary.map(standardCard).join("")}</div></details>` : ""}`
    : `<div class="empty-state"><p>${escapeHtml(publicExplanation || "No base standards are available for this zone.")}</p></div>`;
  return `<section class="zone-group${split ? " zone-group--split" : ""}" aria-labelledby="zone-${index}"><div class="zone-group__heading"><div><p class="eyebrow">${split ? `Mapped zone ${index + 1}` : "Base zone"}</p><h3 id="zone-${index}">${escapeHtml(group.zoneCode)}</h3><p>${escapeHtml(subtitle)}</p></div>${status(group.state, groupLabel)}</div>${source ? `<p class="zone-source"><strong>Controlling source:</strong> ${escapeHtml(source)}. Compact section/table references appear on each rule.</p>` : ""}${publicExplanation && group.standards.length ? `<p class="zone-note">${escapeHtml(publicExplanation)}</p>` : ""}${content}</section>`;
}

type ConfirmationGroup = { title: string; missing: string[]; needed: string; evidence: string[] };

function confirmationGroups(model: ParcelPageV2UiModel): ConfirmationGroup[] {
  const labels = new Set(model.unknowns.map((item) => item.label));
  const actions = new Map(model.investigations.map((item) => [item.action, item]));
  const groups: ConfirmationGroup[] = [];
  const dimensions = ["Legal lot width", "Legal lot depth", "Legal lot area", "Legal street frontage", "Corner-lot status"].filter((label) => labels.has(label));
  if (dimensions.length) groups.push({ title: "Lot dimensions", missing: dimensions, needed: "Needed to assess lot-dimension rules and conditions using legally established measurements.", evidence: [actions.get("VERIFY_LEGAL_LOT_WIDTH")?.requiredEvidence].filter(Boolean) as string[] });
  const lotLines = ["Front lot line", "Interior-side lot lines", "Street-side lot lines", "Rear lot line"].filter((label) => labels.has(label));
  if (lotLines.length) groups.push({ title: "Setbacks and lot-line layout", missing: ["Lot-line designations not yet verified"], needed: "Needed to assess which front, side, street-side, and rear setback rules apply.", evidence: [actions.get("VERIFY_LOT_LINE_DESIGNATIONS")?.requiredEvidence].filter(Boolean) as string[] });
  const heightConditional = model.standardsGroups.some((group) => group.standards.some((item) => item.label === "Maximum structure height" && item.state === "conditional"));
  if (heightConditional || labels.has("Parcel slope")) groups.push({ title: "Height", missing: [heightConditional ? "Height-rule conditions not yet evaluated" : "Parcel slope not yet verified"], needed: "Needed to assess the applicable height limit and angled-building-envelope conditions.", evidence: [] });
  if (labels.has("Gross floor area")) groups.push({ title: "Floor area", missing: ["Gross floor area not yet verified"], needed: "Needed to assess floor-area-ratio use with a Code-defined numerator and legal lot-area denominator.", evidence: [actions.get("OBTAIN_GROSS_FLOOR_AREA")?.requiredEvidence].filter(Boolean) as string[] });
  const split = ["Split-zone applicability", "Non-RS base standards"].filter((label) => labels.has(label));
  if (split.length) groups.push({ title: "Split-zone applicability", missing: split, needed: "Needed to assess the rules for each mapped portion without blending zones.", evidence: [actions.get("REVIEW_SPLIT_ZONE_GEOMETRY")?.requiredEvidence, actions.get("OBTAIN_SUPPORTED_ZONE_STANDARDS")?.requiredEvidence].filter(Boolean) as string[] });
  const context = ["Base zoning", "Coastal applicability", "Parcel source"].filter((label) => labels.has(label));
  if (context.length) groups.push({ title: "Zoning and Coastal context", missing: context, needed: "Needed to select definitive zoning and Coastal-dependent standards.", evidence: [actions.get("VERIFY_BASE_ZONING_MAPPING")?.requiredEvidence, actions.get("VERIFY_COASTAL_APPLICABILITY")?.requiredEvidence].filter(Boolean) as string[] });
  const other = ["Existing dwelling units", "Assessor living area", "Situs address"].filter((label) => labels.has(label));
  if (other.length) groups.push({ title: "Property record", missing: other, needed: "Needed to complete the current property record before further evaluation.", evidence: [actions.get("VERIFY_EXISTING_UNIT_COUNT")?.requiredEvidence, actions.get("VERIFY_PARCEL_SITUS")?.requiredEvidence].filter(Boolean) as string[] });
  return groups;
}

function sourceLinks(model: ParcelPageV2UiModel): string {
  const hasOutline = model.propertyFacts.some((item) => item.label.startsWith("Building outline evidence"));
  const sources = [
    ["SanGIS parcel records", "Parcel and assessor snapshot acquired September 24, 2026", "https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0"],
    ["City Base Zoning", "Zoning snapshot acquired September 30, 2026", "https://geo.sandag.org/server/rest/services/Hosted/Zoning_Base_SD/FeatureServer/0"],
    ["City Coastal Overlay", "Coastal snapshot acquired September 30, 2026", "https://webmaps.sandiego.gov/arcgis/rest/services/DSD/Zoning_Overlay/MapServer/2"],
    ["San Diego Municipal Code · Residential Zones", "Division 4, September 2026 edition", "https://docs.sandiego.gov/municode/MuniCodeChapter13/Ch13Art01Division04.pdf"],
    ["San Diego County Assessor / Recorder / County Clerk", "Official parcel and assessment resources", "https://arcc.sdcounty.ca.gov/"],
    ...(hasOutline ? [["City/SANDAG building outlines", "Spring 2017 imagery baseline; acquired September 30, 2026", "https://webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer/1"]] : []),
  ];
  return sources.map(([label, detail, href]) => `<article class="official-source"><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a><p>${escapeHtml(detail)}</p></article>`).join("");
}

export const PARCEL_PAGE_V2_CSS = `
:root{color-scheme:light;--ink:#14211b;--muted:#5e6b64;--line:#dce4df;--paper:#fff;--wash:#f4f7f4;--accent:#1d654c;--accent-dark:#124b38;--supported:#266047;--supported-bg:#eaf6ef;--conditional:#76520c;--conditional-bg:#fff4d6;--unknown:#4e596d;--unknown-bg:#eef1f5;--review:#684c22;--review-bg:#f8eedc;--unavailable:#66475a;--unavailable-bg:#f5eaf1;--radius:15px;--shadow:0 10px 28px rgba(24,38,31,.06)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--wash);color:var(--ink);font-family:var(--font-geist-sans,Inter),ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.5}summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:740;color:var(--accent-dark)}summary:focus-visible,a:focus-visible{outline:3px solid #78b79f;outline-offset:3px;border-radius:4px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.site-header{height:52px;border-bottom:1px solid var(--line);background:#fff}.site-header__inner{height:100%;max-width:1040px;margin:auto;padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:800}.preview-label{font-size:10px;font-weight:780;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}.hero{background:#fff;border-bottom:1px solid var(--line)}.hero__inner{max-width:1040px;margin:auto;padding:24px 18px 26px}.back-link{display:inline-block;margin-bottom:16px;color:var(--accent-dark);font-size:12px;font-weight:720;text-underline-offset:3px}.eyebrow{margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--accent)}.hero h1{max-width:800px;margin:0;font-size:clamp(30px,7vw,48px);line-height:1.05;letter-spacing:-.04em;font-weight:560}.hero__meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;color:var(--muted);font-size:12px}.page{max-width:1040px;margin:auto;padding:18px 12px 54px}.interpretation{background:#eef6f1;border:1px solid #cfe2d6;border-radius:12px;padding:12px 14px;color:#315344;font-size:13px}.section{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-top:14px;box-shadow:var(--shadow)}.section__heading{max-width:760px;margin-bottom:15px}.section__heading h2{font-size:clamp(22px,4vw,30px);line-height:1.15;letter-spacing:-.025em;margin:0 0 5px}.section__heading p{color:var(--muted);margin:0;font-size:14px}.orientation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden}.orientation-item{padding:12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.orientation-item:nth-child(2n){border-right:0}.orientation-item dt{font-size:10px;font-weight:760;color:var(--muted)}.orientation-item dd{font-size:15px;font-weight:780;margin:4px 0 7px}.zone-group{padding-top:18px;margin-top:18px;border-top:1px solid var(--line)}.zone-group:first-of-type{padding-top:0;margin-top:0;border-top:0}.zone-group--split{padding:16px;border:1px solid var(--line);border-radius:14px}.zone-group__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.zone-group__heading h3{font-size:23px;margin:0}.zone-group__heading p{margin:2px 0 0;color:var(--muted);font-size:12px}.zone-source,.zone-note{margin:0 0 12px;color:var(--muted);font-size:12px}.split-callout{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#fff8e8;border:1px solid #ead59f;color:#5d481d;font-size:13px}.standards-grid,.facts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.standard-card,.fact-card{border:1px solid var(--line);border-radius:12px;padding:11px;background:#fff;min-width:0}.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.card-top h3,.card-top h4{font-size:12px;line-height:1.3;margin:0;color:#3a465a}.standard-card__value,.fact-card__value{font-size:18px;line-height:1.18;font-weight:800;letter-spacing:-.02em;margin:9px 0 3px;overflow-wrap:anywhere}.standard-card__condition,.fact-detail{margin:7px 0 0;color:var(--muted);font-size:11px}.rule-citation,.source-label{font-size:10px;font-weight:730;color:var(--accent);margin:7px 0 0}.rule-details{border-top:1px solid #e6eae7;margin-top:8px}.rule-details summary{min-height:36px;font-size:11px}.rule-details ul{margin:0 0 8px;padding-left:18px;color:var(--muted);font-size:11px}.secondary-disclosure,.secondary-facts{margin-top:9px;border-top:1px solid var(--line)}.secondary-disclosure>summary,.secondary-facts>summary{font-size:13px}.secondary-disclosure>.standards-grid,.secondary-facts>.facts-grid{padding-top:8px}.status{display:inline-flex;align-items:center;gap:5px;width:max-content;max-width:100%;border-radius:999px;padding:4px 7px;font-size:10px;line-height:1.15;font-weight:800;white-space:normal}.status__dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}.status--supported{color:var(--supported);background:var(--supported-bg)}.status--conditional{color:var(--conditional);background:var(--conditional-bg)}.status--unknown{color:var(--unknown);background:var(--unknown-bg)}.status--review{color:var(--review);background:var(--review-bg)}.status--unavailable{color:var(--unavailable);background:var(--unavailable-bg)}.status--not_applicable{color:var(--unknown);background:var(--unknown-bg)}.confirmation-grid{display:grid;gap:8px}.confirmation-card{border-top:1px solid var(--line);padding:13px 0}.confirmation-card:first-child{border-top:0;padding-top:0}.confirmation-card h3{margin:0;font-size:15px}.confirmation-card__missing{margin:4px 0;color:var(--ink);font-size:13px;font-weight:680}.confirmation-card__needed,.confirmation-card__evidence{margin:4px 0 0;color:var(--muted);font-size:12px}.official-sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px}.official-source{padding:10px 0;border-bottom:1px solid var(--line)}.official-source a{color:var(--accent-dark);font-size:13px;font-weight:740;text-underline-offset:3px}.official-source p{margin:3px 0 0;color:var(--muted);font-size:11px}.date-note{margin:14px 0 0;color:var(--muted);font-size:11px}.technical-link{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:13px 15px;border:1px solid var(--line);border-radius:12px;color:var(--accent-dark);font-size:12px;font-weight:720;text-decoration:none;background:#fff}.empty-state{border:1px dashed #c5cec8;border-radius:12px;padding:14px;color:var(--muted);background:#fafbfa;font-size:13px}.empty-state p{margin:0}.footer-note{text-align:center;color:#68756f;font-size:11px;margin:24px auto 0;max-width:700px}
@media(min-width:700px){.page{padding:24px 24px 66px}.section{padding:26px}.orientation-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.orientation-item{border-bottom:0}.orientation-item:nth-child(2n){border-right:1px solid var(--line)}.orientation-item:last-child{border-right:0}.standards-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.facts-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.confirmation-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}.confirmation-card:nth-child(2){border-top:0;padding-top:0}.official-sources{grid-template-columns:repeat(3,minmax(0,1fr))}.hero__inner,.site-header__inner{padding-left:26px;padding-right:26px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{.site-header,.technical-link{display:none}.page{max-width:none}.section{box-shadow:none;break-inside:avoid}}
`;

export function renderParcelPageV2Fragment(model: ParcelPageV2UiModel): string {
  const units = model.propertyFacts.find((item) => item.label === "Existing dwelling units");
  const area = model.propertyFacts.find((item) => item.label === "Approximate parcel geometry area");
  const split = model.orientation.zones.length > 1;
  const zoneSummary = model.orientation.zones.length ? model.orientation.zones.map((zone) => `${zone.code}${split && zone.coverage ? ` · ${zone.coverage}` : ""}`).join(" / ") : model.orientation.zoningLabel;
  const primaryFacts = model.propertyFacts.filter((item) => !item.label.startsWith("Building outline evidence"));
  const historicalFacts = model.propertyFacts.filter((item) => item.label.startsWith("Building outline evidence"));
  const confirmations = confirmationGroups(model);
  const confirmationHtml = confirmations.length ? confirmations.map((group) => `<article class="confirmation-card"><h3>${escapeHtml(group.title)}</h3><p class="confirmation-card__missing">${escapeHtml(group.missing.join(" · "))}</p><p class="confirmation-card__needed">${escapeHtml(group.needed)}</p>${group.evidence.length ? `<p class="confirmation-card__evidence"><strong>Evidence to collect:</strong> ${escapeHtml(group.evidence.join(" "))}</p>` : ""}</article>`).join("") : `<div class="empty-state"><p>No material parcel-specific confirmation item is recorded.</p></div>`;
  return `<header class="site-header"><div class="site-header__inner"><div class="brand">TruLot</div><div class="preview-label">Zoning detail preview</div></div></header>
  <main><section class="hero" aria-labelledby="parcel-title"><div class="hero__inner"><a class="back-link" href="/parcel-public-preview/${escapeHtml(model.header.apn)}">← Back to parcel overview</a><p class="eyebrow">Zoning details</p><h1 id="parcel-title">${escapeHtml(model.header.title)}</h1><div class="hero__meta"><span>APN ${escapeHtml(displayApn(model.header.apn))}</span><span>Normalized APN ${escapeHtml(model.header.apn)}</span><span>${escapeHtml(model.header.jurisdiction)}</span></div></div></section>
  <div class="page"><aside class="interpretation" aria-label="Interpretation boundary"><strong>Interpretation boundary.</strong> These are base zoning records and source facts. Parcel-specific applicability, compliance, and development capacity are not determined here.</aside>
  <section class="section" aria-labelledby="orientation-heading"><div class="section__heading"><h2 id="orientation-heading">Parcel orientation</h2><p>Zoning, Coastal context, and the source facts most useful for reading the standards.</p></div><dl class="orientation-grid"><div class="orientation-item"><dt>Base zoning</dt><dd>${escapeHtml(zoneSummary)}</dd>${status(model.orientation.zoningState, model.orientation.zoningState === "supported" ? "Recorded" : model.orientation.zoningState === "review" ? "Review required" : "Not yet verified")}</div><div class="orientation-item"><dt>Coastal context</dt><dd>${escapeHtml(model.orientation.coastalLabel)}</dd>${status(model.orientation.coastalState, model.orientation.coastalState === "supported" ? "Recorded" : model.orientation.coastalState === "review" ? "Review required" : "Not yet verified")}</div><div class="orientation-item"><dt>Approx. parcel area</dt><dd>${escapeHtml(area?.value || "Not yet verified")}</dd>${status(area?.state || "unknown", area?.stateLabel || "Not yet verified")}</div><div class="orientation-item"><dt>Assessor-reported units</dt><dd>${escapeHtml(units?.value || "Not yet verified")}</dd>${status(units?.state || "unknown", units?.stateLabel || "Not yet verified")}</div></dl></section>
  <section class="section" aria-labelledby="standards-heading"><div class="section__heading"><h2 id="standards-heading">Base zoning standards</h2><p>All standards in the current source-backed contract, without applying them to this parcel.</p></div>${split ? `<aside class="split-callout"><strong>Different rules apply to each mapped portion.</strong> The area shares below describe zoning mapping, not buildable area. Detailed standards are available for the RS-1-7 portion only; OR-1-1 standards are not included in this version.</aside>` : ""}${model.standardsGroups.map((group, index) => standardsGroup(group, index, split)).join("")}</section>
  <section class="section" aria-labelledby="facts-heading"><div class="section__heading"><h2 id="facts-heading">Existing property facts</h2><p>Recorded and estimated facts retain their source meaning and limitations.</p></div><div class="facts-grid">${primaryFacts.map(factCard).join("")}</div>${historicalFacts.length ? `<details class="secondary-facts"><summary>Historical building outline evidence (${historicalFacts.length})</summary><div class="facts-grid">${historicalFacts.map(factCard).join("")}</div></details>` : ""}</section>
  <section class="section" aria-labelledby="confirm-heading"><div class="section__heading"><h2 id="confirm-heading">What still needs to be confirmed</h2><p>Material missing inputs are grouped by the question they are needed to assess.</p></div><div class="confirmation-grid">${confirmationHtml}</div></section>
  <section class="section" aria-labelledby="sources-heading"><div class="section__heading"><h2 id="sources-heading">Official sources</h2><p>Readable source destinations and dates. Internal paths, IDs, and hashes are available in the technical record.</p></div><div class="official-sources">${sourceLinks(model)}</div><p class="date-note">Parcel intelligence compiled ${escapeHtml(model.asOf)}. Parcel data, zoning, Coastal mapping, and the regulatory edition have separate dates above; compilation does not mean every source fact was re-observed or legally revalidated on that date.</p><a class="technical-link" href="/parcel-v2-evidence/${escapeHtml(model.header.apn)}"><span>Open technical evidence and provenance</span><span aria-hidden="true">→</span></a></section>
  <p class="footer-note">Zoning detail preview · Readable parcel evidence with technical provenance separated.</p></div></main>`;
}

export function renderParcelPageV2(model: ParcelPageV2UiModel): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(model.header.title)} · Zoning details · TruLot</title><style>${PARCEL_PAGE_V2_CSS}</style></head><body>${renderParcelPageV2Fragment(model)}</body></html>`;
}
