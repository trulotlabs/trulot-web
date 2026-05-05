import { notFound } from "next/navigation";
import { getParcelPageData } from "../../../lib/get-parcel-page-data";
import type { ReactNode } from "react";
import type { ConfidenceLevel } from "../../../lib/parcel-page-contract";

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
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[12px] font-semibold uppercase leading-5 ${badgeClasses(tone ?? String(children))}`}>{children}</span>;
}

function Section({ title, status, children, quiet = false }: { title: string; status?: RowStatus; children: ReactNode; quiet?: boolean }) {
  return (
    <section className={`border border-slate-200 bg-white ${quiet ? "p-4" : "p-5"}`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <h2 className="text-[13px] font-bold uppercase leading-5 tracking-normal text-slate-700">{title}</h2>
        {status ? <Badge tone={status}>{status}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

function DataRow({ label, value, status, primary = false }: { label: string; value?: ReactNode; status?: RowStatus; primary?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid min-h-9 grid-cols-[132px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <div className="text-[12px] font-bold uppercase leading-5 text-slate-500">{label}</div>
      <div className={`${primary ? "text-[16px] font-bold text-slate-950" : "text-[14px] text-slate-800"} min-w-0 leading-5`}>{value}</div>
      {status ? <Badge tone={status}>{status}</Badge> : <span />}
    </div>
  );
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[1180px] space-y-5 px-6 py-6">
        <section className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-8 tracking-normal text-slate-950">{parcel.full_address ?? parcel.address}</h1>
              <div className="mt-4 grid gap-3 text-[14px] text-slate-800 sm:grid-cols-3">
                <DataRow label="APN" value={parcel.apn} />
                <DataRow label="Lot" value={parcel.lot_size} />
                <DataRow label="Zoning" value={parcel.zoning} />
              </div>
            </div>
            {data.development_stage ? <Badge tone={data.development_stage}>{data.development_stage}</Badge> : null}
          </div>
        </section>

        {data.readout?.summary ? (
          <Section title="Parcel Readout">
            <p className="text-[16px] font-bold leading-6 text-slate-950">{data.readout.summary}</p>
            {data.readout.signals?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.readout.signals.filter((signal) => text(signal.value)).slice(0, 4).map((signal) => (
                  <Badge key={signal.key ?? signal.value} tone={signal.confidence}>{signal.value}</Badge>
                ))}
              </div>
            ) : null}
          </Section>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[65fr_35fr]">
          <div className="space-y-5">
            <Section title="What's Happening Now" status={primaryPermit?.confidence}>
              {primaryPermit?.permit_number && primaryPermit.permit_number !== "none" ? (
                <>
                  <DataRow label="Primary permit" value={`${primaryPermit.permit_number} - ${primaryPermit.type ?? "Permit"}`} status={primaryPermit.status} />
                  <DataRow label="Primary scope" value={primaryPermit.scope} primary />
                  {primaryPermit.applicant ? <DataRow label="Applicant" value={primaryPermit.applicant} /> : null}
                  {proposedProject ? (
                    <div className="my-5 border-y border-slate-100 py-4">
                      <div className="text-[12px] font-bold uppercase leading-5 text-slate-500">Proposed Project</div>
                      <div className="mt-1 text-[16px] font-bold leading-6 text-slate-950">{proposedProject.scope}</div>
                      {proposedProject.note ? <div className="mt-1 text-[12px] leading-5 text-slate-500">{proposedProject.note}</div> : null}
                      <div className="mt-2"><Badge tone={proposedProject.confidence}>{proposedProject.confidence}</Badge></div>
                    </div>
                  ) : null}
                  {hasPermitTree ? <PermitTree tree={permitTree} /> : null}
                  {data.project?.timeline ? (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <DataRow label="Filed" value={data.project.timeline.filed} />
                      <DataRow label="Issued" value={data.project.timeline.issued} />
                      <DataRow label="Field activity" value={data.project.timeline.field_activity} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[14px] leading-5 text-slate-600">No active permit activity detected.</p>
              )}
            </Section>

            {opportunity ? (
              <Section title="Opportunity Layer" status={opportunity.development_stage ?? data.development_stage}>
                <p className="mb-3 text-[14px] leading-5 text-slate-800">{opportunity.interpretation}</p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <BulletGroup title="Jobs to engage" items={opportunity.jobs_to_engage ?? opportunity.potential_opportunities ?? []} />
                  <BulletGroup title="Key triggers" items={opportunity.key_triggers ?? opportunity.watch_next ?? []} />
                </div>
              </Section>
            ) : null}

            {(data.capacity?.baseline_units || data.capacity?.adu_upside_units) ? (
              <Section title="What Could Be Built">
                {data.capacity?.baseline_units ? (
                  <div className="pb-5">
                    <div className="text-[12px] font-bold uppercase leading-5 text-slate-500">Zoning Capacity (By Rule)</div>
                    <DataRow label="Baseline" value={`${data.capacity.baseline_units.units} units`} status={data.capacity.baseline_units.confidence} primary />
                    <DataRow label="Basis" value={data.capacity.baseline_units.basis} />
                  </div>
                ) : null}
                {data.capacity?.adu_upside_units ? (
                  <div className="border-t border-slate-100 pt-5">
                    <DataRow label="ADU upside" value={`Up to ${data.capacity.adu_upside_units.units} units`} status={data.capacity.adu_upside_units.confidence} primary />
                    <DataRow label="Basis" value={data.capacity.adu_upside_units.basis} />
                  </div>
                ) : null}
              </Section>
            ) : null}
          </div>

          <aside className="space-y-5">
            {(data.signals?.site?.length || data.signals?.market?.length || data.signals?.owner?.length) ? (
              <Section title="Signals">
                <div className="space-y-4">
                  <SignalGroup title="Site" items={data.signals?.site} />
                  <SignalGroup title="Market" items={data.signals?.market} />
                  <SignalGroup title="Owner" items={data.signals?.owner} />
                </div>
              </Section>
            ) : null}

            {nearby ? (
              <Section title="Market Context">
                <DataRow label="Total nearby" value={nearby.total_nearby} primary />
                <DataRow label="Active" value={nearby.active} primary />
                <DataRow label="Completed" value={nearby.completed} primary />
                <DataRow label="Stalled" value={nearby.stalled} />
                <DataRow label="Nearest" value={nearby.nearest_completed} />
                <DataRow label="Strength" value={nearby.signal_strength} />
              </Section>
            ) : null}
          </aside>
        </div>

        {data.structure ? (
          <Section title="Existing Site / Structure" status={data.structure.confidence} quiet>
            <div className="grid gap-x-8 lg:grid-cols-2">
              <DataRow label="Unit count" value={text(data.structure.unit_count)} />
              <DataRow label="Living area" value={text(data.structure.living_area)} />
              <DataRow label="Year built" value={text(data.structure.year_built)} />
              <DataRow label="Beds / Baths" value={data.structure.bedrooms !== undefined || data.structure.bathrooms !== undefined ? `${text(data.structure.bedrooms) ?? "?"} bd / ${text(data.structure.bathrooms) ?? "?"} ba` : null} />
              <DataRow label="Land value" value={money(data.structure.land_value)} />
              <DataRow label="Improvement" value={money(data.structure.improvement_value)} />
              <DataRow label="Assessed" value={money(data.structure.total_assessed_value)} />
              <DataRow label="Owner occupied" value={text(data.structure.owner_occupied)} />
              <DataRow label="Land use" value={text(data.structure.land_use)} />
            </div>
          </Section>
        ) : null}

        {data.constraints ? (
          <Section title="Constraints & Overlays" quiet>
            <div className="grid gap-5 lg:grid-cols-2">
              <ConstraintGroup title="Overlay Programs" items={data.constraints.overlays as unknown as Record<string, { status?: string; confidence?: string }>} />
              <ConstraintGroup title="Site / Regulatory Constraints" items={data.constraints.regulatory as unknown as Record<string, { status?: string; confidence?: string }>} />
            </div>
          </Section>
        ) : null}

        {data.confidence ? (
          <Section title="Source / Confidence" quiet>
            <div className="grid gap-x-8 lg:grid-cols-2">
              {Object.entries(data.confidence).map(([key, value]) => <DataRow key={key} label={labelize(key)} value={value} status={key} />)}
            </div>
          </Section>
        ) : null}
      </main>
    </div>
  );
}

function SignalGroup({ title, items }: { title: string; items?: Array<{ key?: string; value?: string; strength?: string; confidence?: string }> }) {
  const rows = (items ?? []).filter((item) => text(item.value));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      {rows.map((item) => (
        <DataRow key={`${title}-${item.key ?? item.value}`} label={labelize(item.key ?? "Signal")} value={item.strength ? `${item.value} - ${item.strength}` : item.value} status={item.confidence} />
      ))}
    </div>
  );
}

function PermitTree({ tree }: { tree?: { building?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }>; related_records?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }>; execution?: Array<{ title: string; status?: string; scope?: string; filed?: string; issued?: string; confidence?: string; note?: string }> } }) {
  const groups = [
    ["Current Site Work", tree?.building ?? []],
    ["Future Development", tree?.related_records ?? []],
    ["Execution", tree?.execution ?? []],
  ] as const;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-3 text-[13px] font-bold uppercase leading-5 text-slate-700">Permit Tree</div>
      <div className="space-y-4">
        {groups.map(([title, nodes]) => nodes.length > 0 ? (
          <div key={title}>
            <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
            <div className="space-y-1">
              {nodes.map((node) => (
                <div className="relative pl-5" key={`${title}-${node.title}`}>
                  <div className="absolute left-0 top-2 h-full border-l border-slate-200" />
                  <div className="absolute left-[-3px] top-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <div className="space-y-1 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {node.status ? <Badge tone={node.status}>{node.status}</Badge> : null}
                      <div className="text-[14px] font-bold leading-5 text-slate-900">{node.title}</div>
                      {node.confidence ? <Badge tone={node.confidence}>{node.confidence}</Badge> : null}
                    </div>
                    {node.scope ? <div className="text-[14px] leading-5 text-slate-700"><span className="font-bold text-slate-500">Scope:</span> {node.scope}</div> : null}
                    {node.issued ? <div className="text-[12px] leading-5 text-slate-500">Issued: {node.issued}</div> : null}
                    {node.filed ? <div className="text-[12px] leading-5 text-slate-500">Filed: {node.filed}</div> : null}
                    {node.note ? <div className="text-[12px] leading-5 text-slate-500">{node.note}</div> : null}
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
      <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      {rows.map(([key, item]) => <DataRow key={key} label={labelize(key)} value={item.status} status={item.confidence} />)}
    </div>
  );
}

function BulletGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      <ul className="space-y-1">
        {items.map((item) => <li key={item} className="text-[14px] leading-5 text-slate-700">- {item}</li>)}
      </ul>
    </div>
  );
}
