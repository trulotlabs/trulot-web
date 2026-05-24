import { notFound } from "next/navigation";
import { getParcelPageData } from "../../../lib/get-parcel-page-data";
import type { ReactNode } from "react";
import type { ConfidenceLevel } from "../../../lib/parcel-page-contract";
import type { ParcelPageResult } from "../../../lib/get-parcel-page-data";

export const dynamic = "force-dynamic";

type RowStatus = ConfidenceLevel | string | undefined;

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function money(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `$${value.toLocaleString()}`;
}

function labelize(key: string): string {
  if (key === "source-backed") return "Deterministic";
  if (key === "inferred")      return "Interpretive";
  if (key === "conditional")   return "Conditional";
  if (key === "unknown")       return "Unverified";
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Tpa", "TPA")
    .replace("Sda", "SDA")
    .replace("Cchs", "CCHS")
    .replace("Ctcac", "CTCAC")
    .replace("Esl", "ESL")
    .replace("Far", "FAR")
    .replace("Fire Hazard", "Fire / VHFHSZ")
    .replace("Historic Determination", "Historic");
}

function badgeClasses(tone?: string): string {
  const value = String(tone ?? "unknown").toLowerCase();
  if (value === "source-backed" || value === "active" || value === "inspection" || value === "issued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "conditional" || value === "early" || value === "in review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (value === "inferred" || value === "complete") return "bg-slate-100 text-slate-600 border-slate-200";
  if (value === "scaling") return "bg-violet-50 text-violet-700 border-violet-200";
  if (value === "stalled") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  if (!children) return null;
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[11px] font-bold uppercase leading-5 tracking-wide ${badgeClasses(tone ?? String(children))}`}>{children}</span>;
}

function Section({ title, status, children }: { title: string; status?: RowStatus; children: ReactNode }) {
  return (
    <section className="border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 className="text-[11px] font-bold uppercase leading-5 tracking-widest text-slate-400">{title}</h2>
        {status ? <Badge tone={status}>{labelize(status)}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

function DataRow({ label, value, status, primary = false, muted = false }: {
  label: string;
  value?: ReactNode;
  status?: RowStatus;
  primary?: boolean;
  muted?: boolean;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid min-h-8 grid-cols-[120px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <div className="text-[11px] font-bold uppercase leading-5 tracking-wide text-slate-400">{label}</div>
      <div className={`min-w-0 leading-5 ${primary ? "text-[16px] font-bold text-slate-950" : muted ? "text-[13px] text-slate-500" : "text-[14px] text-slate-800"}`}>{value}</div>
      {status ? <Badge tone={status}>{status}</Badge> : <span />}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-[14px] text-slate-700">{value}</span>
    </div>
  );
}

// Derives actionable next-check items from available parcel signals
function deriveNextChecks(data: ParcelPageResult): string[] {
  const checks: string[] = [];

  if (data.development_stage === "STALLED") {
    checks.push("Confirm current permit status in Accela — may have reactivated");
    checks.push("Verify field activity — stall classification is heuristic, not field-confirmed");
  }
  if (data.development_stage === "EARLY") {
    checks.push("Monitor permit issuance — project is in review, not yet approved");
  }
  if (data.phase_result?.stalled) {
    checks.push("Review inspection log for recent field activity");
  }
  if (data.project?.proposed_project?.confidence === "inferred") {
    checks.push("Confirm proposed scope with permit office — extracted from description, not formally filed");
  }
  if (data.capacity?.baseline_units?.confidence === "inferred") {
    checks.push("Verify zoning capacity with SDMC — computed estimate, not formally assessed");
  }

  const unknownOverlays = Object.entries(data.constraints?.overlays ?? {})
    .filter(([, v]) => !v.status || v.status.toLowerCase() === "unknown" || v.confidence === "unknown")
    .map(([k]) => labelize(k));
  if (unknownOverlays.length > 0) {
    checks.push(`Verify overlay eligibility — ${unknownOverlays.join(", ")} unconfirmed`);
  }

  if (data.opportunity_layer?.watch_next?.length) {
    for (const w of data.opportunity_layer.watch_next.slice(0, 2)) {
      if (!checks.includes(w)) checks.push(w);
    }
  } else if (data.opportunity_layer?.key_triggers?.length) {
    for (const t of data.opportunity_layer.key_triggers.slice(0, 2)) {
      if (!checks.includes(t)) checks.push(t);
    }
  }

  return checks.slice(0, 5);
}

export default async function ParcelPage({ params }: { params: Promise<{ apn: string }> }) {
  const { apn } = await params;
  const data = await getParcelPageData(apn);

  if (!data?.parcel) notFound();

  const parcel = data.parcel;
  const primaryPermit = data.project?.primary_permit;
  const proposedProject = data.project?.proposed_project?.scope && !/^no proposed/i.test(data.project.proposed_project.scope)
    ? data.project.proposed_project
    : null;
  const nearby = data.context?.nearby_development;
  const permitTree = data.project?.permit_tree;
  const hasPermitTree = Boolean((permitTree?.building?.length ?? 0) + (permitTree?.related_records?.length ?? 0) + (permitTree?.execution?.length ?? 0));
  const opportunity = data.opportunity_layer;
  const jobsToEngage = data.jobs_to_engage ?? [];
  const stage = data.development_stage ?? "INACTIVE";
  const hasActivity = stage !== "INACTIVE" ||
    (primaryPermit?.permit_number != null && primaryPermit.permit_number !== "none");
  const nextChecks = deriveNextChecks(data);

  const nearbyTone = !nearby ? "unknown"
    : nearby.signal_strength === "High" ? "active"
    : nearby.signal_strength === "Moderate" ? "inferred"
    : "unknown";

  const nearbyHeadline = !nearby || !nearby.total_nearby || nearby.signal_strength === "None"
    ? "No Recent Nearby Activity"
    : nearby.signal_strength === "High" && nearby.active >= 3 ? "Active Development Corridor"
    : nearby.signal_strength === "High" && nearby.completed > nearby.stalled ? "Established Infill Zone"
    : nearby.signal_strength === "High" ? "High Nearby Activity"
    : nearby.signal_strength === "Moderate" && nearby.active > 0 ? "Active Infill Market"
    : nearby.signal_strength === "Moderate" ? "Moderate Development History"
    : "Limited Nearby Activity";

  const nearbyNarrative = (() => {
    if (!nearby || !nearby.total_nearby) return "No recent development projects detected within proximity radius.";
    const parts = [
      nearby.active    > 0 ? `${nearby.active} active`       : "",
      nearby.completed > 0 ? `${nearby.completed} completed` : "",
      nearby.stalled   > 0 ? `${nearby.stalled} stalled`     : "",
    ].filter(Boolean).join(", ");
    const tail = parts ? ` — ${parts}` : "";
    if (nearby.signal_strength === "High" && nearby.active >= 3)
      return `${nearby.total_nearby} projects in proximity${tail}. Multiple active sites indicate consistent development pressure.`;
    if (nearby.signal_strength === "High")
      return `${nearby.total_nearby} projects detected${tail}. Elevated activity for this area type.`;
    if (nearby.signal_strength === "Moderate")
      return `${nearby.total_nearby} projects on record${tail}. Moderate infill activity in proximity.`;
    return `${nearby.total_nearby} project${nearby.total_nearby !== 1 ? "s" : ""} on record${tail}. Limited recent activity.`;
  })();

  // 10-second story for right column header
  const storyHeadline = stage === "COMPLETE" ? "Development complete"
    : stage === "ACTIVE"   ? "Active construction"
    : stage === "SCALING"  ? "Project scaling or amended"
    : stage === "STALLED"  ? "Development appears stalled"
    : stage === "EARLY"    ? "Permit filed — awaiting issuance"
    : "No permit activity on file";

  const storySummary = data.readout?.summary ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[1200px] px-6 py-7">

        {/* ── Parcel Identity ── */}
        <section className="mb-5 border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-[24px] font-bold leading-tight text-slate-950">
              {parcel.full_address ?? parcel.address}
            </h1>
            <Badge tone={stage}>{stage}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1.5 border-t border-slate-100 pt-3">
            <MetaItem label="APN"       value={parcel.apn} />
            <MetaItem label="Community" value={parcel.community ?? undefined} />
            <MetaItem label="Lot"       value={parcel.lot_size ?? undefined} />
            <MetaItem label="Zoning"    value={parcel.zoning ?? undefined} />
          </div>
        </section>

        {/* ── Two-column body ── */}
        <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">

          {/* ═══ LEFT — Universal Parcel Record ═══ */}
          <div className="space-y-5">

            <Section title="Existing Structure" status={data.structure.confidence}>
              <DataRow label="Land use"    value={text(data.structure.land_use)              ?? "Unknown"} />
              <DataRow label="Units"       value={data.structure.unit_count != null ? String(data.structure.unit_count) : null} />
              <DataRow label="Living area" value={text(data.structure.living_area)           ?? "Unknown"} />
              <DataRow label="Year built"  value={text(data.structure.year_built)            ?? "Unknown"} />
              <DataRow label="Beds / Baths"
                value={
                  data.structure.bedrooms != null || data.structure.bathrooms != null
                    ? `${data.structure.bedrooms ?? "?"} bd / ${data.structure.bathrooms ?? "?"} ba`
                    : null
                }
              />
              <DataRow label="Land value"  value={money(data.structure.land_value)}  />
              <DataRow label="Improvement" value={money(data.structure.improvement_value)} />
              <DataRow label="Assessed"    value={money(data.structure.total_assessed_value)} />
              <DataRow label="Owner-occ."  value={
                data.structure.owner_occupied === "yes" ? "Yes"
                : data.structure.owner_occupied === "no" ? "No"
                : null
              } />
            </Section>

            <Section title="Zoning & Capacity">
              {data.capacity?.baseline_units ? (
                <div className="pb-5">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">By-right allowance</div>
                  <DataRow label="Baseline" value={`${data.capacity.baseline_units.units} units`} status={data.capacity.baseline_units.confidence} primary />
                  <DataRow label="Basis"    value={data.capacity.baseline_units.basis} muted />
                </div>
              ) : (
                <p className="pb-4 text-[13px] leading-5 text-slate-500">Capacity not determined — zoning or lot data unavailable.</p>
              )}
              {data.capacity?.adu_upside_units ? (
                <div className="border-t border-slate-100 pt-4">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">ADU program — conditional</div>
                  <DataRow label="Upside" value={`Up to ${data.capacity.adu_upside_units.units} units`} status={data.capacity.adu_upside_units.confidence} primary />
                  <DataRow label="Basis"  value={data.capacity.adu_upside_units.basis} muted />
                  <p className="mt-2 text-[12px] leading-5 text-slate-400">Eligibility subject to program verification. Not all parcels qualify.</p>
                </div>
              ) : null}
            </Section>

            <Section title="Constraints & Overlays">
              <p className="mb-4 text-[13px] leading-5 text-slate-400">Spatial overlay boundaries under verification. Assessor-recorded flags shown where on record.</p>
              <div className="space-y-5">
                <ConstraintGroup title="Overlay Programs"   items={data.constraints?.overlays   as unknown as Record<string, { status?: string; confidence?: string }>} />
                <ConstraintGroup title="Site / Regulatory"  items={data.constraints?.regulatory as unknown as Record<string, { status?: string; confidence?: string }>} />
              </div>
            </Section>

            {(data.signals?.site?.length || data.signals?.owner?.length) ? (
              <Section title="Parcel Signals">
                <div className="space-y-4">
                  <SignalGroup title="Site"  items={data.signals?.site} />
                  <SignalGroup title="Owner" items={data.signals?.owner} />
                </div>
              </Section>
            ) : null}

            <Section title="Nearby Development">
              {nearby ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-bold leading-6 text-slate-900">{nearbyHeadline}</div>
                      <p className="mt-1 text-[13px] leading-5 text-slate-600">{nearbyNarrative}</p>
                    </div>
                    <Badge tone={nearbyTone}>{nearby.signal_strength}</Badge>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <DataRow label="Nearby"    value={nearby.total_nearby} />
                    <DataRow label="Active"    value={nearby.active    > 0 ? nearby.active    : null} />
                    <DataRow label="Completed" value={nearby.completed > 0 ? nearby.completed : null} />
                    <DataRow label="Stalled"   value={nearby.stalled   > 0 ? nearby.stalled   : null} />
                    <DataRow label="Nearest"   value={nearby.nearest_completed} />
                  </div>
                </>
              ) : (
                <p className="text-[13px] leading-5 text-slate-500">No nearby development data available.</p>
              )}
            </Section>

            {data.confidence ? (
              <Section title="Source / Confidence">
                {Object.entries(data.confidence).map(([key, value]) => (
                  <DataRow key={key} label={labelize(key)} value={value} status={key} />
                ))}
              </Section>
            ) : null}

          </div>

          {/* ═══ RIGHT — Development Intelligence Layer ═══ */}
          <div className="space-y-5">

            {/* 10-second story */}
            <section className="border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[17px] font-bold leading-6 text-slate-950">{storyHeadline}</div>
                  {storySummary ? (
                    <p className="mt-2 text-[14px] leading-5 text-slate-700">{storySummary}</p>
                  ) : (
                    <p className="mt-2 text-[13px] leading-5 text-slate-400">No permit history on file. Parcel may be underbuilt relative to zoning allowance.</p>
                  )}
                </div>
                <Badge tone={stage}>{stage}</Badge>
              </div>
              {(() => {
                // Only show compact status signals in the story header — long text belongs in permit section
        const signals = (data.readout?.signals ?? []).filter(s =>
          text(s.value) && s.key !== "nearby_activity" && s.key !== "proposed_project" && s.key !== "scope_conflict" && (s.value?.length ?? 0) <= 30
        );
                return signals.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {signals.slice(0, 4).map(s => (
                      <Badge key={s.key ?? s.value} tone={s.confidence}>{s.value}</Badge>
                    ))}
                  </div>
                ) : null;
              })()}
            </section>

            {/* Construction Phase — when known */}
            {data.phase_result && data.phase_result.phase !== "UNKNOWN" ? (
              <Section title="Construction Phase" status={data.phase_result.phase_label}>
                <DataRow label="Phase"      value={data.phase_result.phase_label} primary />
                <DataRow
                  label="Confidence"
                  value={data.phase_result.confidence}
                  status={
                    data.phase_result.confidence === "HIGH"   ? "source-backed" :
                    data.phase_result.confidence === "MEDIUM" ? "inferred"      :
                    data.phase_result.confidence === "LOW"    ? "conditional"   : "unknown"
                  }
                />
                {data.phase_result.estimated_timing && data.phase_result.estimated_timing !== "Unknown"
                  ? <DataRow label="Est. timing" value={data.phase_result.estimated_timing} />
                  : null}
                {data.phase_result.stalled && data.phase_result.stall_reason
                  ? <DataRow label="Stall signal" value={data.phase_result.stall_reason} status="stalled" />
                  : null}
                {data.phase_result.trades_needed_now?.length ? (
                  <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <BulletGroup title="Trades now"  items={data.phase_result.trades_needed_now} />
                    {data.phase_result.trades_needed_next?.length
                      ? <BulletGroup title="Trades next" items={data.phase_result.trades_needed_next} />
                      : null}
                  </div>
                ) : null}
              </Section>
            ) : null}

            {/* Active Permit + Proposed Project + Permit Tree + Timeline */}
            {hasActivity ? (
              <Section title="Active Permit" status={primaryPermit?.confidence}>
                {primaryPermit?.permit_number && primaryPermit.permit_number !== "none" ? (
                  <>
                    <DataRow label="Permit" value={`${primaryPermit.permit_number} — ${primaryPermit.type ?? "Permit"}`} status={primaryPermit.status} />
                    <DataRow label="Scope"  value={/scope not on file/i.test(primaryPermit.scope ?? "") ? null : primaryPermit.scope} primary />
                    {/scope not on file/i.test(primaryPermit.scope ?? "")
                      ? <p className="py-1 text-[13px] leading-5 text-slate-400">No description on record for this permit type.</p>
                      : null}
                    {primaryPermit.applicant ? <DataRow label="Applicant" value={primaryPermit.applicant} /> : null}

                    {proposedProject ? (
                      <div className="my-4 rounded border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Proposed project</div>
                        <div className="mt-1 text-[15px] font-bold leading-6 text-slate-950">{proposedProject.scope}</div>
                        {proposedProject.note ? <div className="mt-1 text-[12px] leading-5 text-slate-500">{proposedProject.note}</div> : null}
                        <div className="mt-2"><Badge tone={proposedProject.confidence}>{proposedProject.confidence}</Badge></div>
                      </div>
                    ) : null}

                    {hasPermitTree ? <PermitTree tree={permitTree} /> : null}

                    {data.project?.timeline ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Timeline</div>
                        <DataRow label="Filed"          value={data.project.timeline.filed} />
                        <DataRow label="Issued"         value={data.project.timeline.issued} />
                        <DataRow label="Field activity" value={data.project.timeline.field_activity} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[13px] leading-5 text-slate-500">No active permit on file.</p>
                )}
              </Section>
            ) : null}

            {/* Project Interpretation */}
            {opportunity ? (
              <Section title="Project Interpretation" status={opportunity.development_stage ?? stage}>
                <p className="mb-4 text-[14px] leading-5 text-slate-800">{opportunity.interpretation}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <BulletGroup
                    title="Jobs to engage"
                    items={jobsToEngage.length
                      ? jobsToEngage.map((j) => `${j.role} — ${j.timing}`)
                      : (opportunity.potential_opportunities ?? [])}
                  />
                  <BulletGroup title="Key triggers" items={opportunity.key_triggers ?? opportunity.watch_next ?? []} />
                </div>
              </Section>
            ) : null}

            {/* Developer Next Checks */}
            {nextChecks.length > 0 ? (
              <Section title="Developer Next Checks">
                <ul className="space-y-2">
                  {nextChecks.map((item) => (
                    <li key={item} className="flex gap-2 text-[14px] leading-5 text-slate-700">
                      <span className="mt-0.5 shrink-0 text-slate-300">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

          </div>
        </div>
      </main>
    </div>
  );
}

function SignalGroup({ title, items }: { title: string; items?: Array<{ key?: string; value?: string; strength?: string; confidence?: string }> }) {
  const rows = (items ?? []).filter((item) => text(item.value));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      {rows.map((item) => (
        <DataRow
          key={`${title}-${item.key ?? item.value}`}
          label={labelize(item.key ?? "Signal")}
          value={item.strength ? `${item.value} — ${item.strength}` : item.value}
          status={item.confidence}
        />
      ))}
    </div>
  );
}

function PermitTree({ tree }: {
  tree?: {
    building?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }>;
    related_records?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }>;
    execution?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }>;
  }
}) {
  const groups = [
    ["Building", tree?.building ?? []],
    ["Related Records", tree?.related_records ?? []],
    ["Execution", tree?.execution ?? []],
  ] as const;

  const hasNodes = groups.some(([, nodes]) => nodes.length > 0);
  if (!hasNodes) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Permit Tree</div>
      <div className="space-y-4">
        {groups.map(([title, nodes]) => nodes.length > 0 ? (
          <div key={title}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
            <div className="space-y-1">
              {nodes.map((node) => (
                <div className="relative pl-4" key={`${title}-${node.title}`}>
                  <div className="absolute left-0 top-2 h-full border-l border-slate-200" />
                  <div className="absolute left-[-3px] top-[9px] h-1.5 w-1.5 rounded-full bg-slate-300" />
                  <div className="space-y-1 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {node.status ? <Badge tone={node.status}>{node.status}</Badge> : null}
                      <div className="text-[13px] font-semibold leading-5 text-slate-800">{node.title}</div>
                      {node.confidence ? <Badge tone={node.confidence}>{node.confidence}</Badge> : null}
                    </div>
                    {node.scope && !/scope not on file/i.test(node.scope)
                      ? <div className="text-[13px] leading-5 text-slate-600"><span className="font-semibold text-slate-400">Scope:</span> {node.scope}</div>
                      : null}
                    {node.issued ? <div className="text-[12px] leading-5 text-slate-400">Issued: {node.issued}</div> : null}
                    {node.filed  ? <div className="text-[12px] leading-5 text-slate-400">Filed: {node.filed}</div>  : null}
                    {node.note   ? <div className="text-[12px] leading-5 text-slate-400">{node.note}</div>           : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null)}
      </div>
    </div>
  );
}

function ConstraintGroup({ title, items }: { title: string; items?: Record<string, { status?: string; confidence?: string }> }) {
  const rows = Object.entries(items ?? {}).filter(([, item]) => text(item.status));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      {rows.map(([key, item]) => {
        const isUnknown = !item.status || item.status.toLowerCase() === "unknown";
        return (
          <div key={key} className="flex min-h-8 items-center justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
            <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{labelize(key)}</span>
            {isUnknown
              ? <Badge tone="unknown">Unverified</Badge>
              : (
                <div className="flex items-center gap-2 text-right">
                  <span className="text-[13px] leading-5 text-slate-700">{item.status}</span>
                  {item.confidence && item.confidence !== "unknown"
                    ? <Badge tone={item.confidence}>{item.confidence}</Badge>
                    : null}
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}

function BulletGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[13px] leading-5 text-slate-700">— {item}</li>
        ))}
      </ul>
    </div>
  );
}
