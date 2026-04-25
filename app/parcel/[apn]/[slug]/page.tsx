import { supabase } from "@/lib/supabase";

function generateStory(primaryProject: any): string {
  if (!primaryProject || !primaryProject.has_building_project) {
    return "No building permit is on record for this parcel. Only administrative or support permits have been filed.";
  }
  const momentum = primaryProject.project_momentum_label;
  const type = (primaryProject.primary_project_label || primaryProject.primary_project_type || "building permit").toLowerCase();
  switch (momentum) {
    case "Awaiting Issuance": return `A ${type} has been filed but not yet issued by the city. Construction cannot begin until the permit is issued.`;
    case "Active": return `A ${type} is active and construction is underway on this parcel.`;
    case "Completed": return `A ${type} was filed and the project has been completed and delivered.`;
    case "Status unclear": return `A ${type} is on record but recent activity signals are limited. Status will sharpen as more data becomes available.`;
    default: return `A ${type} is on record for this parcel.`;
  }
}

function formatAPN(apn: string): string {
  if (apn.length === 10) return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8, 10)}`;
  return apn;
}

function getStatusBadge(primaryProject: any, pageData: any) {
  if (primaryProject) {
    switch (primaryProject.project_momentum_label) {
      case "Active": return { label: "Active", bg: "bg-emerald-50", text: "text-emerald-700" };
      case "Completed": return { label: "Completed", bg: "bg-blue-50", text: "text-blue-700" };
      case "Awaiting Issuance": return { label: "In Review", bg: "bg-amber-50", text: "text-amber-700" };
      case "Status unclear": return { label: "Status unclear", bg: "bg-slate-100", text: "text-slate-600" };
    }
  }
  if (pageData?.has_nearby_active_project) return { label: "Active nearby", bg: "bg-emerald-50", text: "text-emerald-700" };
  if (pageData?.has_nearby_completed_project) return { label: "Recently built nearby", bg: "bg-blue-50", text: "text-blue-700" };
  return { label: "No recent activity", bg: "bg-slate-100", text: "text-slate-600" };
}

function getMomentumDescription(momentum: string | null): string {
  switch (momentum) {
    case "Awaiting Issuance": return "Permit filed, not yet issued.";
    case "Active": return "Construction underway.";
    case "Completed": return "Project completed and delivered.";
    case "Status unclear": return "Activity signals limited.";
    default: return momentum || "";
  }
}

export default async function ParcelPage({ params }: { params: Promise<{ apn: string; slug: string }> }) {
  const { apn } = await params;

  const { data, error } = await supabase.from("parcel_page_api_v2").select("*").eq("apn_norm", apn).single();
  const { data: primaryProject } = await supabase.from("parcel_primary_project_v1").select("*").eq("apn_norm", apn).maybeSingle();
  const { data: permitData } = await supabase.from("parcel_permit_terminal_v2").select("*").eq("apn_norm", apn).order("opened_date", { ascending: false });

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

  const status = getStatusBadge(primaryProject, data);
  const story = generateStory(primaryProject);
  const hasNearby = (data.nearby_project_count ?? 0) > 0;

  const seen = new Set<string>();
  const uniquePermits = (permitData || []).filter((p: any) => {
    const key = p.record_number || p.record_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const supportingPermits = uniquePermits.filter(
    (p: any) => !primaryProject || p.record_number !== primaryProject.primary_project_id
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-4 py-3">
        <a href="/" className="text-emerald-700 font-semibold text-lg tracking-tight">TruLot</a>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* 1. Header */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{data.address}</h1>
              <p className="text-slate-500 text-sm mt-0.5">{data.city}, {data.state}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${status.bg} ${status.text}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">APN</p>
              <p className="text-slate-700 font-medium">{formatAPN(apn)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Lot</p>
              <p className="text-slate-700 font-medium">{Math.round(data.lot_area_sqft).toLocaleString()} SF / {data.lot_area_acres} ac</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Zoning</p>
              <p className="text-slate-700 font-medium">{data.zone_name}</p>
            </div>
          </div>
        </section>

        {/* 2. What's happening */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">What&apos;s happening</h2>
          <p className="text-slate-700 text-base leading-relaxed">{story}</p>
        </section>

        {/* 3. Development potential */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Development potential</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            This parcel is zoned {data.zone_name}{data.zone_family ? ` (${data.zone_family} family)` : ""}. Lot size and zoning together determine the scope of what can be built here.
          </p>
          <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
            Additional ADU capacity may apply under state ADU law, separate from base zoning allowances.
          </p>
        </section>

        {/* 4. Project activity */}
        {primaryProject && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Project activity</h2>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">{primaryProject.has_building_project ? "🏗" : "📄"}</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 text-base">
                  {primaryProject.primary_project_label || primaryProject.primary_project_type}
                </p>
                {primaryProject.primary_project_description && (
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{primaryProject.primary_project_description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span>
                    <span className="text-xs text-slate-400 font-medium mr-1">Permit</span>
                    <span className="text-slate-600 font-mono text-xs">{primaryProject.primary_project_id}</span>
                  </span>
                  {primaryProject.primary_project_opened && (
                    <span>
                      <span className="text-xs text-slate-400 font-medium mr-1">Filed</span>
                      <span className="text-slate-600">{new Date(primaryProject.primary_project_opened).toLocaleDateString()}</span>
                    </span>
                  )}
                  {primaryProject.primary_project_issued && (
                    <span>
                      <span className="text-xs text-slate-400 font-medium mr-1">Issued</span>
                      <span className="text-slate-600">{new Date(primaryProject.primary_project_issued).toLocaleDateString()}</span>
                    </span>
                  )}
                </div>
                {primaryProject.project_momentum_label && primaryProject.project_momentum_label !== "N/A" && (
                  <p className="mt-3 text-sm text-slate-600 font-medium">
                    {getMomentumDescription(primaryProject.project_momentum_label)}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 5. Signals */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Signals</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            {primaryProject?.has_building_project
              ? <li className="flex gap-2"><span className="text-slate-300">·</span>Building permit on record</li>
              : <li className="flex gap-2"><span className="text-slate-300">·</span>No building permit filed</li>
            }
            {primaryProject?.has_building_project && (
              primaryProject?.primary_project_issued
                ? <li className="flex gap-2"><span className="text-slate-300">·</span>Permit issued by city</li>
                : <li className="flex gap-2"><span className="text-slate-300">·</span>Permit filed, not yet issued</li>
            )}
            {primaryProject?.project_momentum_label === "Active"
              ? <li className="flex gap-2"><span className="text-slate-300">·</span>Active construction signals detected</li>
              : <li className="flex gap-2"><span className="text-slate-300">·</span>No confirmed field activity in system</li>
            }
            {primaryProject?.team_flag_active && primaryProject?.team_flag_reason && (
              <li className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400 italic">Unverified field note: {primaryProject.team_flag_reason}. Not yet confirmed by inspection or imagery signals.</span>
              </li>
            )}
          </ul>
        </section>

        {/* 6. Nearby development */}
        {hasNearby && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Nearby development</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <div>
                <span className="text-2xl font-bold text-slate-900">{data.nearby_project_count ?? 0}</span>
                <span className="text-slate-500 ml-1.5">nearby projects</span>
              </div>
              {(data.nearby_completed_count ?? 0) > 0 && (
                <div>
                  <span className="text-lg font-bold text-blue-700">{data.nearby_completed_count}</span>
                  <span className="text-slate-500 ml-1.5">completed</span>
                </div>
              )}
              {(data.nearby_active_count ?? 0) > 0 && (
                <div>
                  <span className="text-lg font-bold text-emerald-700">{data.nearby_active_count}</span>
                  <span className="text-slate-500 ml-1.5">active</span>
                </div>
              )}
              {(data.nearby_stalled_count ?? 0) > 0 && (
                <div>
                  <span className="text-lg font-bold text-slate-500">{data.nearby_stalled_count}</span>
                  <span className="text-slate-500 ml-1.5">stalled</span>
                </div>
              )}
            </div>
            {data.nearest_completed_distance_ft && (
              <p className="mt-3 text-xs text-slate-400">Nearest completed project: {Math.round(data.nearest_completed_distance_ft)} ft away</p>
            )}
          </section>
        )}

        {/* 7. CTA */}
        <section className="bg-emerald-700 rounded-xl p-6 text-center">
          <h2 className="text-white font-semibold">Get alerts when this parcel changes</h2>
          <p className="text-emerald-200 text-sm mt-1 mb-5">Permit filings, status changes, new entitlements &mdash; delivered to you.</p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button type="button" className="px-5 py-2.5 bg-white text-emerald-700 font-semibold text-sm rounded-lg hover:bg-emerald-50 transition-colors">
              Notify me
            </button>
          </div>
        </section>

      </main>

      <footer className="mt-8 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} TruLot &middot; Parcel data for San Diego County
      </footer>
    </div>
  );
}
