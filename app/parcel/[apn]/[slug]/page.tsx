import { supabase } from "@/lib/supabase";

type StateConfig = {
  emoji: string;
  label: string;
  bg: string;
  text: string;
};

// Uses parcel_page_api_v2 engine-derived fields: nearby counts + active flag
function stateFromV2(data: any): StateConfig {
  if (data?.has_nearby_active_project) {
    return { emoji: "🟢", label: "Active nearby", bg: "bg-emerald-50", text: "text-emerald-700" };
  }
  if (data?.has_nearby_completed_project) {
    return { emoji: "🔵", label: "Recently built nearby", bg: "bg-blue-50", text: "text-blue-700" };
  }
  if ((data?.nearby_stalled_count ?? 0) > 0) {
    return { emoji: "⚪", label: "Stalled nearby", bg: "bg-slate-100", text: "text-slate-500" };
  }
  return { emoji: "⚫", label: "No recent activity", bg: "bg-slate-100", text: "text-slate-600" };
}

export default async function ParcelPage({
  params,
}: {
  params: Promise<{ apn: string; slug: string }>;
}) {
  const { apn } = await params;

  const { data, error } = await supabase
    .from("parcel_page_api_v2")
    .select("*")
    .eq("apn_norm", apn)
    .single();

  const { data: primaryProject } = await supabase
    .from("parcel_primary_project_v1")
    .select("*")
    .eq("apn_norm", apn)
    .maybeSingle();

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

  const state = stateFromV2(data);
  const hasNearby = (data.nearby_project_count ?? 0) > 0;

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

        {/* ── 2. What's Being Built (Primary Project) ── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              What's being built
            </h2>
            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${state.bg} ${state.text}`}>
              {state.emoji} {state.label}
            </span>
          </div>

          {primaryProject ? (
            <div>
              <div className="flex items-start gap-3">
                {primaryProject.has_building_project ? (
                  <span className="mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 text-sm">🏗️</span>
                ) : (
                  <span className="mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-sm">📄</span>
                )}
                <div className="flex-1">
                  <p className="text-base font-semibold text-slate-900 leading-snug">
                    {primaryProject.primary_project_label || primaryProject.primary_project_type}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    <span className="text-slate-700 font-medium">{primaryProject.primary_project_status}</span>
                    {primaryProject.primary_project_applicant && (
                      <> · Applicant: {primaryProject.primary_project_applicant}</>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    {primaryProject.primary_project_id}
                    {primaryProject.primary_project_opened && (
                      <> · opened {new Date(primaryProject.primary_project_opened).toLocaleDateString()}</>
                    )}
                    {primaryProject.primary_project_issued && (
                      <> · issued {new Date(primaryProject.primary_project_issued).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>
              {!primaryProject.has_building_project && (
                <p className="mt-4 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Only execution / support permits on record for this parcel. No building permit filed.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No permits on record for this parcel.</p>
          )}
        </section>

        {/* ── 3. Nearby Development Activity (context) ── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Nearby Development Activity
          </h2>

          {hasNearby ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-900">{data.nearby_project_count ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Total nearby</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">{data.nearby_active_count ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Active</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{data.nearby_completed_count ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-500">{data.nearby_stalled_count ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Stalled</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No nearby development signals detected.</p>
          )}

          {(data.nearest_active_distance_ft || data.nearest_completed_distance_ft) && (
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-4 text-center">
              {data.nearest_active_distance_ft && (
                <div>
                  <p className="text-lg font-semibold text-emerald-700">{Math.round(data.nearest_active_distance_ft)} ft</p>
                  <p className="text-xs text-slate-400 mt-0.5">Nearest active project</p>
                </div>
              )}
              {data.nearest_completed_distance_ft && (
                <div>
                  <p className="text-lg font-semibold text-blue-700">{Math.round(data.nearest_completed_distance_ft)} ft</p>
                  <p className="text-xs text-slate-400 mt-0.5">Nearest completed project</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 5. Supporting Permits (dedup + collapsed) ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Supporting permits
          </h2>
          {(() => {
            // Dedupe by record_number
            const seen = new Set<string>();
            const uniquePermits = (permitData || []).filter((p: any) => {
              const key = p.record_number || p.record_id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            // Hide the primary project permit from supporting list
            const filtered = uniquePermits.filter(
              (p: any) => !primaryProject || p.record_number !== primaryProject.primary_project_id
            );
            if (filtered.length === 0) {
              return (
                <p className="text-sm text-slate-400 italic">
                  No supporting permits on record.
                </p>
              );
            }
            return (
              <div className="space-y-3">
                {filtered.map((permit: any, index: number) => (
                  <div
                    key={permit.record_number || index}
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
            );
          })()}
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
