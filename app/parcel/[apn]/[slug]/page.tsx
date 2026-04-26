import { supabase } from "@/lib/supabase";

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

function getWhatsHappeningContent(primaryProject: any) {
  if (!primaryProject || !primaryProject.has_building_project) {
    return (
      <>
        <p className="font-semibold text-slate-900">No building permit on record.</p>
        <p className="text-slate-600 mt-1">Only administrative or support permits have been filed.</p>
      </>
    );
  }
  const momentum = primaryProject.project_momentum_label;
  switch (momentum) {
    case "Awaiting Issuance":
      return (
        <>
          <p className="font-semibold text-slate-900">Project is in review.</p>
          <p className="text-slate-600 mt-1">Permit filed, not yet approved.</p>
          <p className="text-slate-600">Construction cannot begin until approval.</p>
        </>
      );
    case "Active":
      return (
        <>
          <p className="font-semibold text-slate-900">Construction is underway.</p>
          <p className="text-slate-600 mt-1">Active building permit on file.</p>
          <p className="text-slate-600">Field activity detected.</p>
        </>
      );
    case "Completed":
      return (
        <>
          <p className="font-semibold text-slate-900">Project completed.</p>
          <p className="text-slate-600 mt-1">Permit closed.</p>
          <p className="text-slate-600">Construction finished.</p>
        </>
      );
    default: {
      const type = (primaryProject.primary_project_label || primaryProject.primary_project_type || "building permit").toLowerCase();
      return (
        <>
          <p className="font-semibold text-slate-900">A {type} is on record.</p>
          <p className="text-slate-600 mt-1">Activity signals are limited.</p>
        </>
      );
    }
  }
}

function fmtMonthYear(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getWhatCanBeBuilt(zoneName: string, lotSqft: number, primaryProject: any) {
  const rsMatch = zoneName?.match(/^RS-1-(\d+)/i);
  const rmMatch = zoneName?.match(/^RM-(\d+)-(\d+)/i);

  const hasAduSignal = primaryProject?.primary_project_description &&
    (primaryProject.primary_project_description.match(/\d+.*ADU/i) ||
     primaryProject.primary_project_description.match(/ADU.*\d+/i));

  if (rsMatch) {
    const minSfPerUnit = parseInt(rsMatch[1]) * 1000;
    const baseUnits = Math.floor(lotSqft / minSfPerUnit);
    const isAduHeavy = hasAduSignal && baseUnits <= 2;
    return {
      type: isAduHeavy ? "adu-heavy" : "sfr",
      baseCapacity: `${baseUnits} unit${baseUnits !== 1 ? "s" : ""}`,
      zoning: `${zoneName} (single-family)`,
      density: `1 unit per ${minSfPerUnit.toLocaleString()} SF`,
      interpretation: isAduHeavy
        ? "Base zoning allows limited units, but recent permit activity suggests an ADU-driven development strategy."
        : `${zoneName} zoning allows 1 unit per ${minSfPerUnit.toLocaleString()} SF. This parcel supports ${baseUnits} unit${baseUnits !== 1 ? "s" : ""} based on lot size.`,
      note: isAduHeavy
        ? "ADU programs may allow significantly more units than base zoning."
        : "Additional units may be possible under state ADU law.",
    };
  }

  if (rmMatch) {
    const minSfPerUnit = parseInt(rmMatch[2]) * 1000;
    const baseUnits = Math.floor(lotSqft / minSfPerUnit);
    return {
      type: "multifamily",
      baseCapacity: `${baseUnits} unit${baseUnits !== 1 ? "s" : ""}`,
      zoning: `${zoneName} (multifamily)`,
      density: `1 unit per ${minSfPerUnit.toLocaleString()} SF`,
      interpretation: `${zoneName} zoning allows 1 unit per ${minSfPerUnit.toLocaleString()} SF. This parcel supports ${baseUnits} unit${baseUnits !== 1 ? "s" : ""} by-right.`,
      note: "Higher unit counts may be achievable through ADU programs or density bonuses.",
    };
  }

  return null;
}

function parseProposedUnits(description: string | null | undefined): string | null {
  if (!description) return null;

  // Extract ADU count
  const aduMatch = description.match(/\((\d+)\)\s*(?:new\s+)?ADU/i) ||
                   description.match(/(\d+)\s+(?:new\s+)?(?:detached\s+)?ADU/i) ||
                   description.match(/ADU[s]?\s+[x×]\s*(\d+)/i);
  const aduCount = aduMatch ? parseInt(aduMatch[1]) : 0;

  // Detect primary unit type
  const hasSdu = /\bSDU\b/i.test(description);
  const hasSfr = /\bSFR\b/i.test(description) || /single.family/i.test(description);
  const hasDwelling = /\bdwelling\b/i.test(description);
  const primaryUnit = hasSdu ? "1 SDU" : (hasSfr || hasDwelling) ? "1 primary unit" : null;

  if (aduCount > 0 && primaryUnit) {
    return `${primaryUnit} + ${aduCount} ADU${aduCount !== 1 ? "s" : ""}`;
  } else if (aduCount > 0) {
    return `${aduCount} ADU${aduCount !== 1 ? "s" : ""}`;
  } else if (primaryUnit) {
    return primaryUnit;
  }

  // Fallback: check for generic unit count
  const unitMatch = description.match(/(\d+)\s+(?:new\s+)?(?:residential\s+)?units?/i);
  if (unitMatch && parseInt(unitMatch[1]) > 1) {
    return `${unitMatch[1]} units (see permit description)`;
  }

  return null;
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

  const buildInfo = getWhatCanBeBuilt(data.zone_name, data.lot_area_sqft, primaryProject);

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

        {/* 2. What can be built */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">What can be built</h2>
          {buildInfo ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Base Capacity</p>
                <p className="text-slate-900 font-semibold text-2xl">{buildInfo.baseCapacity}</p>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{buildInfo.interpretation}</p>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">{buildInfo.note}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">See local zoning code for development allowances.</p>
          )}
        </section>

        {/* 3. What's happening now */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">What&apos;s happening now</h2>
          <div className="text-base leading-relaxed">
            {getWhatsHappeningContent(primaryProject)}
          </div>
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
                  <span>
                    <span className="text-xs text-slate-400 font-medium mr-1">Status</span>
                    <span className="text-slate-600">
                      {primaryProject.primary_project_issued
                        ? `Issued ${new Date(primaryProject.primary_project_issued).toLocaleDateString()}`
                        : "Not yet issued"}
                    </span>
                  </span>
                </div>
                {(() => {
                  const proposed = parseProposedUnits(primaryProject.primary_project_description);
                  return proposed ? (
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="text-xs text-slate-400 font-medium uppercase tracking-wide mr-1.5">Proposed</span>
                      {proposed}
                    </p>
                  ) : null;
                })()}
              </div>
            </div>
          </section>
        )}

        {/* 5. Signals */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Signals</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            {primaryProject?.primary_project_opened
              ? <li className="flex gap-2"><span className="text-slate-300">·</span>Permit filed ({fmtMonthYear(primaryProject.primary_project_opened)})</li>
              : <li className="flex gap-2"><span className="text-slate-300">·</span>No building permit filed</li>
            }
            {primaryProject?.has_building_project && (
              primaryProject?.primary_project_issued
                ? <li className="flex gap-2"><span className="text-slate-300">·</span>Permit issued {fmtMonthYear(primaryProject.primary_project_issued)}</li>
                : <li className="flex gap-2"><span className="text-slate-300">·</span>Permit not yet issued</li>
            )}
            {primaryProject?.project_momentum_label === "Active"
              ? <li className="flex gap-2"><span className="text-slate-300">·</span>Active construction signals detected</li>
              : <li className="flex gap-2"><span className="text-slate-300">·</span>No confirmed inspection or field activity</li>
            }
            {primaryProject?.team_flag_active && primaryProject?.team_flag_reason && (
              <li className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400 italic">Unverified field note: {primaryProject.team_flag_reason}</span>
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
