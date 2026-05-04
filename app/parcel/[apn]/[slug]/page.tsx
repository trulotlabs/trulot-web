import { headers } from "next/headers";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type ConfidenceLevel = "source-backed" | "inferred" | "conditional" | "unknown" | string;

type ConfidenceRecord = {
  confidence?: ConfidenceLevel;
  source?: string;
  note?: string;
};

type PermitNode = ConfidenceRecord & {
  status?: string;
  title?: string;
  scope?: string;
  filed?: string;
  issued?: string;
  label?: string;
  note?: string;
  permit_count?: number;
  dependent_approvals_summary?: string;
};

type ParcelPageData = {
  development_stage?: string;
  parcel?: {
    address?: string;
    apn?: string;
    lot_size?: string;
    zoning?: string;
    status?: string;
  };
  readout?: {
    summary?: string;
    signals?: Array<ConfidenceRecord & { key?: string; value?: string }>;
  };
  project?: {
    primary_permit?: ConfidenceRecord & {
      permit_number?: string;
      type?: string;
      status?: string;
      scope?: string;
      filed?: string;
      issued?: string;
      last_activity?: string;
      applicant?: string;
    };
    proposed_project?: ConfidenceRecord & {
      scope?: string;
      adu_units?: number;
      sfr_units?: number;
      building_count?: number;
      note?: string;
    };
    permit_tree?: {
      building?: PermitNode[];
      related_records?: PermitNode[];
      execution?: PermitNode[];
      scaling_clusters?: PermitNode[];
    };
    timeline?: {
      filed?: string;
      issued?: string;
      field_activity?: string;
    };
  };
  opportunity_layer?: {
    development_stage?: string;
    interpretation?: string;
    potential_opportunities?: string[];
    watch_next?: string[];
  };
  capacity?: {
    baseline_units?: ConfidenceRecord & { units?: number; basis?: string };
    adu_upside_units?: ConfidenceRecord & { units?: number; basis?: string };
  };
  signals?: {
    site?: Array<ConfidenceRecord & { key?: string; value?: string; strength?: string }>;
    market?: Array<ConfidenceRecord & { key?: string; value?: string; strength?: string }>;
    owner?: Array<ConfidenceRecord & { key?: string; value?: string; strength?: string }>;
  };
  context?: {
    nearby_development?: {
      total_nearby?: number;
      active?: number;
      completed?: number;
      stalled?: number;
      nearest_completed?: string;
      signal_strength?: string;
    };
  };
  structure?: ConfidenceRecord & Record<string, unknown>;
  constraints?: {
    overlays?: Record<string, ConfidenceRecord & { status?: string }>;
    regulatory?: Record<string, ConfidenceRecord & { status?: string }>;
  };
  confidence?: Record<string, string>;
};

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

function confidenceLabel(confidence?: ConfidenceLevel): string | null {
  if (!confidence) return null;
  return String(confidence).replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeClasses(kind?: string): string {
  const value = String(kind ?? "unknown").toLowerCase();
  if (value === "source-backed" || value === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "conditional" || value === "early" || value === "in review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (value === "inferred" || value === "complete") return "bg-slate-100 text-slate-600 border-slate-200";
  if (value === "scaling") return "bg-violet-50 text-violet-700 border-violet-200";
  if (value === "stalled") return "bg-red-50 text-red-700 border-red-200";
  if (value === "inspection" || value === "issued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  if (!children) return null;
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[12px] font-semibold uppercase leading-5 ${badgeClasses(tone ?? String(children))}`}>{children}</span>;
}

function Section({ title, status, children, quiet = false }: { title: string; status?: string | null; children: ReactNode; quiet?: boolean }) {
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

function DataRow({ label, value, status, primary = false }: { label: string; value?: ReactNode; status?: string | null; primary?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid min-h-9 grid-cols-[132px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <div className="text-[12px] font-bold uppercase leading-5 text-slate-500">{label}</div>
      <div className={`${primary ? "text-[16px] font-bold text-slate-950" : "text-[14px] text-slate-800"} min-w-0 leading-5`}>{value}</div>
      {status ? <Badge tone={status}>{status}</Badge> : <span />}
    </div>
  );
}

function SignalGroup({ title, items }: { title: string; items?: Array<ConfidenceRecord & { key?: string; value?: string; strength?: string }> }) {
  const rows = (items ?? []).filter((item) => text(item.value));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      <div>
        {rows.map((item) => (
          <DataRow
            key={`${title}-${item.key ?? item.value}`}
            label={labelize(item.key ?? "Signal")}
            value={<span className={item.strength ? "font-bold text-slate-950" : undefined}>{item.strength ? `${item.value} - ${item.strength}` : item.value}</span>}
            status={item.confidence}
          />
        ))}
      </div>
    </div>
  );
}

function PermitTreeNode({ node }: { node: PermitNode }) {
  const title = text(node.title ?? node.label);
  if (!title) return null;
  return (
    <div className="relative pl-5">
      <div className="absolute left-0 top-2 h-full border-l border-slate-200" />
      <div className="absolute left-[-3px] top-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
      <div className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {node.status ? <Badge tone={node.status}>{node.status}</Badge> : null}
          <div className="text-[14px] font-bold leading-5 text-slate-900">{title}</div>
          {node.confidence ? <Badge tone={node.confidence}>{confidenceLabel(node.confidence)}</Badge> : null}
        </div>
        {node.scope ? <div className="text-[14px] leading-5 text-slate-700"><span className="font-bold text-slate-500">Scope:</span> {node.scope}</div> : null}
        {node.issued ? <div className="text-[12px] leading-5 text-slate-500">Issued: {node.issued}</div> : null}
        {node.filed ? <div className="text-[12px] leading-5 text-slate-500">Filed: {node.filed}</div> : null}
        {node.permit_count !== undefined ? <div className="text-[12px] leading-5 text-slate-500">Permits: {node.permit_count}</div> : null}
        {node.dependent_approvals_summary ? <div className="text-[12px] leading-5 text-slate-500">{node.dependent_approvals_summary}</div> : null}
        {node.note ? <div className="text-[12px] leading-5 text-slate-500">{node.note}</div> : null}
      </div>
    </div>
  );
}

function PermitTree({ tree }: { tree?: ParcelPageData["project"]["permit_tree"] }) {
  const building = tree?.building ?? [];
  const related = tree?.related_records ?? [];
  const execution = tree?.execution ?? [];
  const clusters = tree?.scaling_clusters ?? [];
  if (building.length + related.length + execution.length + clusters.length === 0) return null;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-3 text-[13px] font-bold uppercase leading-5 text-slate-700">Permit Tree</div>
      {clusters.length > 0 ? (
        <div className="space-y-3">
          {clusters.map((node, index) => <PermitTreeNode key={`cluster-${index}`} node={node} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {building.length > 0 ? <TreeGroup title="Building" nodes={building} /> : null}
          {related.length > 0 ? <TreeGroup title="Related / Child Record" nodes={related} /> : null}
          {execution.length > 0 ? <TreeGroup title="Execution" nodes={execution} /> : null}
        </div>
      )}
    </div>
  );
}

function TreeGroup({ title, nodes }: { title: string; nodes: PermitNode[] }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      <div className="space-y-1">{nodes.map((node, index) => <PermitTreeNode key={`${title}-${index}`} node={node} />)}</div>
    </div>
  );
}

async function getParcelData(apn: string): Promise<ParcelPageData | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const protocol = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const res = await fetch(`${protocol}://${host}/api/parcel/${apn}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function hasProposedProject(project?: ParcelPageData["project"]["proposed_project"]): boolean {
  if (!project?.scope) return false;
  return !/^no proposed/i.test(project.scope) && project.scope.toLowerCase() !== "none";
}

export default async function ParcelPage({ params }: { params: Promise<{ apn: string; slug: string }> }) {
  const { apn } = await params;
  const data = await getParcelData(apn);

  if (!data?.parcel) {
    return (
      <main className="mx-auto max-w-[1180px] px-6 py-10">
        <Section title="Parcel unavailable">
          <p className="text-[14px] leading-5 text-slate-600">Parcel data is unavailable.</p>
        </Section>
      </main>
    );
  }

  const parcel = data.parcel;
  const primaryPermit = data.project?.primary_permit;
  const proposedProject = hasProposedProject(data.project?.proposed_project) ? data.project?.proposed_project : null;
  const nearby = data.context?.nearby_development;
  const hasPermitTree = Boolean(data.project?.permit_tree && (
    (data.project.permit_tree.building?.length ?? 0) +
    (data.project.permit_tree.related_records?.length ?? 0) +
    (data.project.permit_tree.execution?.length ?? 0) +
    (data.project.permit_tree.scaling_clusters?.length ?? 0) > 0
  ));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[1180px] space-y-5 px-6 py-6">
        <section className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold leading-8 tracking-normal text-slate-950">{parcel.address}</h1>
              <div className="mt-4 grid gap-3 text-[14px] text-slate-800 sm:grid-cols-3">
                <DataRow label="APN" value={parcel.apn} />
                <DataRow label="Lot" value={parcel.lot_size} />
                <DataRow label="Zoning" value={parcel.zoning} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {parcel.status ? <Badge tone={parcel.status}>{parcel.status}</Badge> : null}
              {data.development_stage ? <Badge tone={data.development_stage}>{data.development_stage}</Badge> : null}
            </div>
          </div>
        </section>

        {data.readout?.summary ? (
          <Section title="Parcel Readout">
            <p className="text-[16px] font-bold leading-6 text-slate-950">{data.readout.summary}</p>
            {data.readout.signals?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.readout.signals.filter((signal) => text(signal.value)).map((signal) => (
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
                      {proposedProject.confidence ? <div className="mt-2"><Badge tone={proposedProject.confidence}>{confidenceLabel(proposedProject.confidence)}</Badge></div> : null}
                    </div>
                  ) : null}
                  {hasPermitTree ? <PermitTree tree={data.project?.permit_tree} /> : null}
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

            {data.opportunity_layer ? (
              <Section title="Opportunity Layer" status={data.opportunity_layer.development_stage ?? data.development_stage}>
                {data.opportunity_layer.interpretation ? <p className="mb-3 text-[14px] leading-5 text-slate-800">{data.opportunity_layer.interpretation}</p> : null}
                {data.opportunity_layer.potential_opportunities?.length ? <BulletGroup title="Potential opportunities" items={data.opportunity_layer.potential_opportunities} /> : null}
                {data.opportunity_layer.watch_next?.length ? <BulletGroup title="Watch next" items={data.opportunity_layer.watch_next} /> : null}
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
              <ConstraintGroup title="Overlay Programs" items={data.constraints.overlays} />
              <ConstraintGroup title="Site / Regulatory Constraints" items={data.constraints.regulatory} />
            </div>
          </Section>
        ) : null}

        {data.confidence ? (
          <Section title="Source / Confidence" quiet>
            <div className="grid gap-x-8 lg:grid-cols-2">
              {Object.entries(data.confidence).map(([key, value]) => <DataRow key={key} label={confidenceLabel(key) ?? key} value={value} status={key} />)}
            </div>
          </Section>
        ) : null}
      </main>
    </div>
  );
}

function BulletGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      <ul className="space-y-1">
        {items.map((item) => <li key={item} className="text-[14px] leading-5 text-slate-700">- {item}</li>)}
      </ul>
    </div>
  );
}

function ConstraintGroup({ title, items }: { title: string; items?: Record<string, ConfidenceRecord & { status?: string }> }) {
  const rows = Object.entries(items ?? {}).filter(([, item]) => text(item.status));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase leading-5 text-slate-500">{title}</div>
      {rows.map(([key, item]) => <DataRow key={key} label={labelize(key)} value={item.status} status={item.confidence} />)}
    </div>
  );
}
