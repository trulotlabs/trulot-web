import { notFound } from "next/navigation";
import { getParcelPageData } from "../../../lib/get-parcel-page-data";
import type { ReactNode } from "react";
import type { ParcelPageResult } from "../../../lib/get-parcel-page-data";

export const dynamic = "force-dynamic";

// ── Utilities ────────────────────────────────────────────────────────────────

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function money(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `$${value.toLocaleString()}`;
}

function constraintLabel(key: string): string {
  const map: Record<string, string> = {
    tpa: "TPA", sda: "SDA", cchs: "CCHS", ctcac: "CTCAC",
    fire_hazard: "Fire / VHFHSZ", historic_determination: "Historic",
    coastal_overlay: "Coastal", esl: "ESL", far_coverage: "FAR",
  };
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function stagePillClass(stage: string): string {
  if (stage === "ACTIVE" || stage === "SCALING") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (stage === "EARLY")    return "text-amber-700 bg-amber-50 border-amber-200";
  if (stage === "STALLED")  return "text-red-700 bg-red-50 border-red-200";
  if (stage === "COMPLETE") return "text-slate-600 bg-slate-100 border-slate-200";
  return "text-slate-400 bg-slate-50 border-slate-200";
}

function permitStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "inspection" || s === "issued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "in review")  return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "complete")   return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

// ── Derived intelligence ──────────────────────────────────────────────────────

function deriveUncertainty(data: ParcelPageResult): string | null {
  if ((data.readout?.signals ?? []).some(s => s.key === "scope_conflict"))
    return "Scope conflict flagged — primary permit scope differs from proposed scope";
  if (data.development_stage === "STALLED")
    return "Stall classification is heuristic — verify current status in Accela";
  const pp = data.project?.proposed_project;
  if (pp?.confidence === "conditional")
    return "Proposed scope is conditional — not yet city-approved";
  if (pp?.confidence === "inferred")
    return "Proposed scope inferred from permit description — confirm with permit office";
  if (data.capacity?.baseline_units?.confidence === "inferred")
    return "Capacity is estimated — verify with SDMC before underwriting";
  return null;
}

function deriveNextChecks(data: ParcelPageResult): string[] {
  const checks: string[] = [];
  const stage = data.development_stage ?? "INACTIVE";
  if (stage === "STALLED") {
    checks.push("Confirm current permit status in Accela — may have reactivated");
    checks.push("Verify field activity — stall classification is heuristic, not field-confirmed");
  }
  if (stage === "EARLY")
    checks.push("Monitor permit issuance — project is in review, not yet approved");
  if (data.phase_result?.stalled)
    checks.push("Review inspection log for recent field activity");
  if (data.project?.proposed_project?.confidence === "inferred")
    checks.push("Confirm proposed scope with permit office — extracted from description, not formally filed");
  if (data.capacity?.baseline_units?.confidence === "inferred")
    checks.push("Verify zoning capacity with SDMC — computed estimate, not formally assessed");
  const unknownOverlays = Object.entries(data.constraints?.overlays ?? {})
    .filter(([, v]) => !v.status || v.status.toLowerCase() === "unknown" || v.confidence === "unknown")
    .map(([k]) => constraintLabel(k));
  if (unknownOverlays.length > 0)
    checks.push(`Verify overlay eligibility — ${unknownOverlays.join(", ")} unconfirmed`);
  if (data.opportunity_layer?.watch_next?.length) {
    for (const w of data.opportunity_layer.watch_next.slice(0, 2))
      if (!checks.includes(w)) checks.push(w);
  } else if (data.opportunity_layer?.key_triggers?.length) {
    for (const t of data.opportunity_layer.key_triggers.slice(0, 2))
      if (!checks.includes(t)) checks.push(t);
  }
  return checks.slice(0, 5);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FactLine({ label, value, sub }: { label: string; value?: ReactNode; sub?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-4 border-b border-slate-100 py-1.5 last:border-0">
      <span className="w-[88px] shrink-0 text-[12px] text-slate-400">{label}</span>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-800">{value}</div>
        {sub ? <div className="mt-0.5 text-[12px] leading-4 text-slate-400">{sub}</div> : null}
      </div>
    </div>
  );
}

function MilestoneRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 border-b border-slate-100 py-1.5 last:border-0">
      <span className="w-[72px] shrink-0 text-[12px] text-slate-400">{label}</span>
      <span className="text-[13px] text-slate-700">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ParcelPage({ params }: { params: Promise<{ apn: string }> }) {
  const { apn } = await params;
  const data = await getParcelPageData(apn);
  if (!data?.parcel) notFound();

  const parcel    = data.parcel;
  const stage     = data.development_stage ?? "INACTIVE";
  const primary   = data.project?.primary_permit;
  const hasPermit = !!(primary?.permit_number && primary.permit_number !== "none");
  const proposed  = data.project?.proposed_project?.scope &&
    !/^no proposed/i.test(data.project.proposed_project.scope)
    ? data.project.proposed_project : null;
  const tree      = data.project?.permit_tree;
  const timeline  = data.project?.timeline;
  const nearby    = data.context?.nearby_development;
  const jobs      = data.jobs_to_engage ?? [];
  const nextChecks   = deriveNextChecks(data);
  const primaryCheck = nextChecks[0] ?? null;
  const uncertainty  = deriveUncertainty(data);

  // Stage headline — concise, no hedge words for deterministic states
  const stageHeadline: Record<string, string> = {
    ACTIVE:   "Active construction",
    SCALING:  "Active construction — scope under revision",
    EARLY:    "Permit filed, awaiting issuance",
    STALLED:  "Development appears stalled",
    COMPLETE: "Development complete",
    INACTIVE: "No permit activity on file",
  };

  // Meta line under address
  const metaLine = [
    parcel.community ?? null,
    parcel.lot_size  ?? null,
    parcel.zoning    ?? null,
    `APN ${parcel.apn}`,
  ].filter(Boolean).join("  ·  ");

  // Capacity callout for parcels without a proposed project (suppress for COMPLETE)
  const cap = data.capacity;
  const capacityCallout = !proposed && stage !== "COMPLETE" && cap?.baseline_units ? {
    text: [
      cap.baseline_units.units > 0
        ? `${cap.baseline_units.units} unit${cap.baseline_units.units !== 1 ? "s" : ""} by right`
        : null,
      cap.adu_upside_units?.units > 0
        ? `up to ${cap.adu_upside_units.units} units with ADU program`
        : null,
    ].filter(Boolean).join("  ·  "),
    note: "Capacity estimate — subject to program eligibility and SDMC verification",
  } : null;

  // Nearby prose
  const nearbyHeadline = !nearby?.total_nearby || nearby.signal_strength === "None" ? null
    : nearby.signal_strength === "High" && nearby.active >= 3 ? "Active development corridor"
    : nearby.signal_strength === "High" && nearby.completed > nearby.stalled ? "Established infill zone"
    : nearby.signal_strength === "High" ? "High nearby activity"
    : nearby.signal_strength === "Moderate" && nearby.active > 0 ? "Active infill market"
    : nearby.signal_strength === "Moderate" ? "Moderate development history"
    : null;

  const nearbyProse = (() => {
    if (!nearby?.total_nearby) return null;
    const parts = [
      nearby.active    > 0 ? `${nearby.active} active`       : "",
      nearby.completed > 0 ? `${nearby.completed} completed` : "",
      nearby.stalled   > 0 ? `${nearby.stalled} stalled`     : "",
    ].filter(Boolean).join(", ");
    const dist = nearby.nearest_completed ? `, ${nearby.nearest_completed} to nearest completed` : "";
    return `${nearby.total_nearby} project${nearby.total_nearby !== 1 ? "s" : ""} in proximity — ${parts}${dist}.`;
  })();

  // Constraints flat list
  const constraints: Array<{ label: string; value: string; known: boolean }> = [
    ...Object.entries(data.constraints?.overlays   ?? {}),
    ...Object.entries(data.constraints?.regulatory ?? {}),
  ].map(([k, v]) => {
    const val = (v as { status?: string }).status ?? "";
    const unknown = !val || val.toLowerCase() === "unknown";
    return { label: constraintLabel(k), value: unknown ? "Unverified" : val, known: !unknown };
  });

  // Related permit nodes (excluding primary)
  const relatedNodes = [
    ...(tree?.building?.slice(1)       ?? []),
    ...(tree?.related_records          ?? []),
    ...(tree?.execution                ?? []),
  ].slice(0, 5);

  // Proposed project callout border color
  const proposedBorder = proposed?.confidence === "source-backed" ? "border-emerald-400"
    : proposed?.confidence === "inferred" ? "border-amber-400"
    : "border-amber-300";
  const proposedNote = proposed?.confidence === "source-backed"
    ? "Confirmed in permit record"
    : proposed?.confidence === "conditional"
    ? "Proposed — conditional, not yet city-approved"
    : "Inferred from permit description — verify with permit office";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ════════════════════════════════════════════════════════════
          NARRATIVE LAYER — 5-second comprehension
      ════════════════════════════════════════════════════════════ */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1100px] px-6 py-9">

          {/* Address + stage pill */}
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-950">
              {parcel.full_address ?? parcel.address}
            </h1>
            <span className={`inline-flex shrink-0 items-center rounded border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${stagePillClass(stage)}`}>
              {stage}
            </span>
          </div>
          <p className="mb-7 text-[12px] tracking-wide text-slate-400">{metaLine}</p>

          {/* Stage headline */}
          <p className="mb-2 text-[19px] font-semibold leading-snug text-slate-900">
            {stageHeadline[stage] ?? "Status unknown"}
          </p>

          {/* Story prose — readout summary + interpretation */}
          <div className="mb-5 max-w-[680px] space-y-2">
            {data.readout?.summary ? (
              <p className="text-[15px] leading-relaxed text-slate-700">{data.readout.summary}</p>
            ) : null}
            {data.opportunity_layer?.interpretation &&
             !data.opportunity_layer.interpretation.toLowerCase().startsWith(
               (data.readout?.summary ?? "").toLowerCase().slice(0, 40)
             ) &&
             !(data.readout?.summary ?? "").toLowerCase().includes(
               data.opportunity_layer.interpretation.toLowerCase().slice(0, 40)
             ) ? (
              <p className="text-[14px] leading-relaxed text-slate-500">
                {data.opportunity_layer.interpretation}
              </p>
            ) : null}
          </div>

          {/* Proposed scope callout — the single most important development fact */}
          {proposed ? (
            <div className={`my-5 border-l-[3px] ${proposedBorder} pl-4 py-1`}>
              <p className="text-[16px] font-semibold leading-snug text-slate-900">{proposed.scope}</p>
              {proposed.note ? (
                <p className="mt-0.5 text-[12px] text-slate-400">{proposed.note}</p>
              ) : null}
              <p className="mt-1 text-[12px] text-slate-400">{proposedNote}</p>
            </div>
          ) : capacityCallout?.text ? (
            <div className="my-5 border-l-[3px] border-slate-200 pl-4 py-1">
              <p className="text-[15px] font-semibold text-slate-700">{capacityCallout.text}</p>
              <p className="mt-1 text-[12px] text-slate-400">{capacityCallout.note}</p>
            </div>
          ) : null}

          {/* Uncertainty — one line, muted */}
          {uncertainty ? (
            <p className="mb-4 text-[13px] text-slate-400">{uncertainty}</p>
          ) : null}

          {/* Primary next check */}
          {primaryCheck ? (
            <div className="flex items-baseline gap-2 border-t border-slate-100 pt-3">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-300">
                Next check
              </span>
              <span className="text-[13px] text-slate-600">{primaryCheck}</span>
            </div>
          ) : null}

        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          EVIDENCE LAYER — parcel record + development record
      ════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-[1100px] px-6 py-9">
        <div className="grid items-start gap-x-14 gap-y-9 lg:grid-cols-2">

          {/* LEFT — Parcel facts */}
          <div className="space-y-7">

            <div>
              <SectionLabel>Structure</SectionLabel>
              <FactLine label="Land use"    value={text(data.structure.land_use)} />
              <FactLine label="Living area" value={text(data.structure.living_area)} />
              <FactLine label="Year built"  value={text(data.structure.year_built)} />
              <FactLine
                label="Beds / baths"
                value={
                  data.structure.bedrooms != null || data.structure.bathrooms != null
                    ? `${data.structure.bedrooms ?? "?"} bd / ${data.structure.bathrooms ?? "?"} ba`
                    : null
                }
              />
              <FactLine
                label="Units"
                value={data.structure.unit_count != null ? String(data.structure.unit_count) : null}
              />
            </div>

            <div>
              <SectionLabel>Zoning & capacity</SectionLabel>
              <FactLine label="Zone" value={text(parcel.zoning)} />
              {cap?.baseline_units ? (
                <FactLine
                  label="By right"
                  value={`${cap.baseline_units.units} unit${cap.baseline_units.units !== 1 ? "s" : ""}`}
                  sub={cap.baseline_units.basis}
                />
              ) : null}
              {cap?.adu_upside_units && cap.adu_upside_units.units > 0 ? (
                <FactLine
                  label="ADU upside"
                  value={`Up to ${cap.adu_upside_units.units} units`}
                  sub={`Conditional — ${cap.adu_upside_units.basis.slice(0, 90)}`}
                />
              ) : null}
            </div>

            <div>
              <SectionLabel>Valuation</SectionLabel>
              <FactLine label="Assessed"    value={money(data.structure.total_assessed_value)} />
              <FactLine label="Land"        value={money(data.structure.land_value)} />
              <FactLine label="Improvement" value={money(data.structure.improvement_value)} />
              <FactLine
                label="Owner"
                value={
                  data.structure.owner_occupied === "yes" ? "Owner-occupied"
                  : data.structure.owner_occupied === "no" ? "Absentee"
                  : null
                }
              />
            </div>

          </div>

          {/* RIGHT — Development record */}
          <div>
            <SectionLabel>Development record</SectionLabel>

            {hasPermit ? (
              <>
                {/* Milestones */}
                {(timeline?.filed || timeline?.issued) ? (
                  <div className="mb-5">
                    <MilestoneRow label="Filed"   value={timeline.filed} />
                    <MilestoneRow label="Issued"  value={timeline.issued} />
                    {timeline.field_activity && !/none detected/i.test(timeline.field_activity) ? (
                      <MilestoneRow label="Activity" value={timeline.field_activity} />
                    ) : null}
                    {data.phase_result && data.phase_result.phase !== "UNKNOWN" ? (
                      <MilestoneRow
                        label="Phase"
                        value={
                          `${data.phase_result.phase_label}` +
                          (data.phase_result.confidence !== "HIGH"
                            ? ` — ${data.phase_result.confidence.toLowerCase()} confidence`
                            : "")
                        }
                      />
                    ) : null}
                  </div>
                ) : null}

                {/* Primary permit */}
                <div className="mb-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {primary?.status ? (
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${permitStatusClass(primary.status)}`}>
                        {primary.status}
                      </span>
                    ) : null}
                    <span className="text-[13px] font-semibold text-slate-700">
                      {primary?.type ?? "Permit"}
                    </span>
                    <span className="text-[11px] text-slate-400">{primary?.permit_number}</span>
                  </div>
                  {primary?.scope && !/scope not on file/i.test(primary.scope) ? (
                    <p className="mb-1 text-[13px] leading-5 text-slate-700">{primary.scope}</p>
                  ) : (
                    <p className="mb-1 text-[13px] text-slate-400">No scope description on record.</p>
                  )}
                  {primary?.applicant ? (
                    <p className="text-[12px] text-slate-400">{primary.applicant}</p>
                  ) : null}
                </div>

                {/* Related permits */}
                {relatedNodes.length > 0 ? (
                  <div className="mb-5 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Related</p>
                    <div className="space-y-3">
                      {relatedNodes.map((node, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {node.status ? (
                            <span className={`mt-0.5 inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${permitStatusClass(node.status)}`}>
                              {node.status}
                            </span>
                          ) : null}
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-slate-600">{node.title}</p>
                            {node.scope && !/scope not on file/i.test(node.scope) ? (
                              <p className="text-[12px] leading-5 text-slate-500">{node.scope}</p>
                            ) : null}
                            {node.note ? (
                              <p className="text-[11px] text-slate-400">{node.note}</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Trades */}
                {data.phase_result?.trades_needed_now?.length ? (
                  <p className="mb-1 text-[13px] text-slate-500">
                    <span className="text-slate-400">Trades now: </span>
                    {data.phase_result.trades_needed_now.join(" · ")}
                  </p>
                ) : null}
                {data.phase_result?.trades_needed_next?.length ? (
                  <p className="mb-4 text-[13px] text-slate-500">
                    <span className="text-slate-400">Trades next: </span>
                    {data.phase_result.trades_needed_next.join(" · ")}
                  </p>
                ) : null}

                {/* Engage roles */}
                {jobs.length > 0 ? (
                  <p className="mb-4 text-[13px] text-slate-500">
                    <span className="text-slate-400">Engage: </span>
                    {jobs.slice(0, 3).map(j => j.role).join(" · ")}
                    {jobs.length > 3 ? <span className="text-slate-300"> +{jobs.length - 3} more</span> : null}
                  </p>
                ) : null}

                {/* Additional investigation items */}
                {nextChecks.slice(1).length > 0 ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <SectionLabel>Investigation items</SectionLabel>
                    <ul className="space-y-2">
                      {nextChecks.slice(1).map((item, i) => (
                        <li key={i} className="flex gap-2 text-[13px] text-slate-600">
                          <span className="shrink-0 text-slate-300">→</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="mb-5 text-[13px] text-slate-400">
                  No building permits on file. Verify in Accela before underwriting.
                </p>
                {nextChecks.length > 0 ? (
                  <ul className="space-y-2">
                    {nextChecks.map((item, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-slate-600">
                        <span className="shrink-0 text-slate-300">→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          REFERENCE LAYER — constraints, market context, footnote
      ════════════════════════════════════════════════════════════ */}
      <div className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-7">

          {/* Constraints — horizontal, muted */}
          {constraints.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Constraints & overlays
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {constraints.map(({ label, value, known }) => (
                  <span key={label} className="text-[12px]">
                    <span className="text-slate-400">{label}: </span>
                    <span className={known ? "text-slate-700" : "text-slate-400"}>{value}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Nearby — prose only */}
          {nearbyProse ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Nearby development{nearbyHeadline ? ` — ${nearbyHeadline}` : ""}
              </p>
              <p className="text-[13px] text-slate-600">{nearbyProse}</p>
            </div>
          ) : null}

          {/* Confidence footnote */}
          <p className="border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
            Data from parcel assessor, permit records, and proximity analysis.
            Interpretive claims derived from permit patterns. Conditional claims subject to program
            verification. Not a substitute for title review or city consultation.
          </p>

        </div>
      </div>

    </div>
  );
}
