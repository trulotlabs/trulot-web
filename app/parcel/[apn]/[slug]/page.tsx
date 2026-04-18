import { supabase } from "@/lib/supabase";

type StateConfig = {
  emoji: string;
  label: string;
  bg: string;
  text: string;
};

// TODO: wire to engine state rules
function inferProjectState(permitData: any[] | null): StateConfig {
  if (!permitData || permitData.length === 0) {
    return { emoji: "⚫", label: "No Activity", bg: "bg-slate-100", text: "text-slate-600" };
  }
  const stages = permitData.map((p) => (p.normalized_stage || "").toLowerCase());
  const statuses = permitData.map((p) => (p.status || "").toLowerCase());

  const activeKeywords = ["active", "open", "issued", "approved", "permit issued", "finaled"];
  const reviewKeywords = ["review", "pending", "submitted", "plan check", "in progress", "intake"];
  const stalledKeywords = ["stalled", "expired", "withdrawn", "cancelled", "void", "closed"];

  const hasActive = statuses.some((s) => activeKeywords.some((k) => s.includes(k)));
  const hasReview = stages.some((s) => reviewKeywords.some((k) => s.includes(k)));
  const hasStalled = stages.some((s) => stalledKeywords.some((k) => s.includes(k)));

  if (hasActive) return { emoji: "🟢", label: "Active", bg: "bg-emerald-50", text: "text-emerald-700" };
  if (hasReview) return { emoji: "🟡", label: "In Review", bg: "bg-amber-50", text: "text-amber-700" };
  if (hasStalled) return { emoji: "⚪", label: "Stalled", bg: "bg-slate-100", text: "text-slate-500" };
  return { emoji: "🔵", label: "Unknown", bg: "bg-blue-50", text: "text-blue-700" };
}

export default async function ParcelPage({
  params,
}: {
  params: Promise<{ apn: string; slug: string }>;
}) {
  const { apn } = await params;

  const { data, error } = await supabase
    .from("parcel_page_api_v1")
    .select("*")
    .eq("apn_norm", apn)
    .single();

  const { data: permitData } = await supabase
    .from("parcel_permit_terminal_v2")
    .select("*")
    .eq("apn_norm", apn)
    .order("opened_date", { ascending: false });

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <nav className="bg-white border-b border-slate-200 px-4 py-3">
          <a href="/" className="text-emerald-700 font-semibold text-lg tracking-tight">TruLot</a>
        </nav>
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-2">Parcel not found</h1>
            <p className="text-slate-500 text-sm">APN: {apn}</p>
          </div>
        </div>
      </div>
    );
  }

  const state = inferProjectState(permitData);
  const hasDevPotential =
    data.units_allowed != null || data.units_built != null || data.units_proposed != null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-4 py-3">
        <a href="/" className="text-emerald-700 font-semibold text-lg tracking-tight">TruLot</a>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">

        {/* ── 1. Header ── */}
        <section>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
            {data.page_title}
          </h1>
          {data.meta_description && (
            <p className="mt-2 text-slate-500 text-sm leading-relaxed">{data.meta_description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span>
              <span className="font-medium text-slate-700">APN</span>{" "}
              <span className="text-slate-500">{apn}</span>
            </span>
            <span>
              <span className="font-medium text-slate-700">Lot</span>{" "}
              <span className="text-slate-500">{Math.round(data.lot_area_sqft).toLocaleString()} SF</span>
            </span>
            <span>
              <span className="font-medium text-slate-700">Zone</span>{" "}
              <span className="text-slate-500">{data.zone_name}</span>
            </span>
          </div>
        </section>

        {/* ── 2. Project State ── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Project State
          </h2>
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${state.bg} ${state.text}`}>
            {state.emoji} {state.label}
          </span>
        </section>

        {/* ── 3. Development Potential ── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Development Potential
          </h2>

          {hasDevPotential ? (
            // TODO: wire to engine
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-slate-900">{data.units_allowed ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-1">Max Allowed</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{data.units_built ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-1">Currently Built</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{data.units_proposed ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-1">Proposed</p>
              </div>
            </div>
          ) : (
            // TODO: wire to engine
            <p className="text-sm text-slate-400 italic">Development potential data coming soon.</p>
          )}

          {data.projects_analyzed > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold text-slate-800">{data.projects_analyzed}</p>
                <p className="text-xs text-slate-400 mt-0.5">Nearby projects analyzed</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">{data.median_units ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">Median units built</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{data.largest_project ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">Largest nearby project</p>
              </div>
            </div>
          )}
        </section>

        {/* ── 4. Narrative vs Reality ── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Narrative vs Reality
          </h2>
          {/* TODO: wire to narrative_claims table */}
          <div className="hidden sm:grid grid-cols-3 gap-4 pb-2 mb-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Narrative</span>
            <span>Reality</span>
            <span>Verdict</span>
          </div>
          <p className="text-sm text-slate-400 italic">
            TruLot cross-checks listing and market claims against entitlement data. No claims have been logged for this parcel yet.
          </p>
        </section>

        {/* ── 5. Proof — Permit Activity ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Proof — Permit Activity
          </h2>
          {permitData && permitData.length > 0 ? (
            <div className="space-y-3">
              {permitData.map((permit: any, index: number) => (
                <div
                  key={index}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {permit.record_number || "—"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{permit.record_type || "—"}</p>
                    </div>
                    {permit.normalized_stage && (
                      <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {permit.normalized_stage}
                      </span>
                    )}
                  </div>
                  {permit.description && (
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{permit.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    {permit.opened_date && <span>Opened {permit.opened_date}</span>}
                    {permit.last_activity_date && <span>Last activity {permit.last_activity_date}</span>}
                    {permit.status && <span>Status: {permit.status}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
              No permit activity currently surfaced for this parcel.
            </div>
          )}
        </section>

        {/* ── 6. CTA ── */}
        <section className="bg-emerald-700 rounded-xl p-8 text-center">
          <h2 className="text-white font-semibold text-lg">Get alerts when this parcel changes</h2>
          <p className="text-emerald-200 text-sm mt-1 mb-6">
            Permit filings, status changes, new entitlements — delivered to you.
          </p>
          {/* TODO: wire to alert_subscriptions table */}
          <div className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              type="button"
              className="px-5 py-2.5 bg-white text-emerald-700 font-semibold text-sm rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Notify me
            </button>
          </div>
        </section>

      </main>

      <footer className="mt-10 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} TruLot · Parcel data for San Diego County
      </footer>
    </div>
  );
}
