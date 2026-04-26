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

function getInterpretation(primaryProject: any, proposedUnits: string | null): string | null {
  if (!primaryProject?.has_building_project) return null;
  const momentum = primaryProject.project_momentum_label;
  const isAdu = proposedUnits && /ADU/i.test(proposedUnits);
  const unitCount = proposedUnits || 'a new development';

  if (isAdu) {
    if (momentum === 'Awaiting Issuance') return `This site is being planned as a high-density ADU development (${unitCount}).`;
    if (momentum === 'Active') return `This site is actively under construction as a ${unitCount} ADU project.`;
    if (momentum === 'Completed') return `This site was developed as a ${unitCount} ADU project.`;
    if (momentum === 'Status unclear') return `A ${unitCount} ADU project is on record — current construction status is unclear.`;
  }
  if (momentum === 'Awaiting Issuance') return 'A development permit has been filed and is pending city approval.';
  if (momentum === 'Active') return 'Construction is actively underway on this parcel.';
  if (momentum === 'Completed') return 'A development project on this parcel has been completed.';
  return null;
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

// TruLot Regulatory Doctrine — enforced here
// Tier 1A: fully deterministic + constraint-complete → show numbers cleanly
// Tier 1B: deterministic but incomplete inputs → show number + warning
// Tier 2: conditional/overlay-driven → flags ONLY, no unit counts
// NEVER aggregate across tiers. Each program stands alone.
// Source: 99_Brooks/brain/companies/TruLot-Regulatory-Doctrine.md

// SD ADU Home Density Bonus cap — Single Dwelling Unit Zones
// Source: SD IB-400 Section C table (lot area ≥ 10,000 SF → max 6 ADUs/JADUs)
function sdAduCap(lotSqft: number): { maxAduJadu: number; totalMax: number; label: string } {
  if (lotSqft <= 8000)  return { maxAduJadu: 4, totalMax: 5, label: '1 SDU + up to 4 ADUs/JADUs' };
  if (lotSqft <= 10000) return { maxAduJadu: 5, totalMax: 6, label: '1 SDU + up to 5 ADUs/JADUs' };
  return                       { maxAduJadu: 6, totalMax: 7, label: '1 SDU + up to 6 ADUs/JADUs' };
}

function getWhatCanBeBuilt(zoneName: string, lotSqft: number, primaryProject: any, proposedUnits: string | null) {
  const rsMatch = zoneName?.match(/^RS-1-(\d+)/i);
  const rmMatch = zoneName?.match(/^RM-(\d+)-(\d+)/i);

  if (rsMatch) {
    const minSfPerUnit = parseInt(rsMatch[1]) * 1000;
    const baseUnits = Math.floor(lotSqft / minSfPerUnit);
    const aduCap = sdAduCap(lotSqft);
    const hasAduSignal = !!proposedUnits && /ADU/i.test(proposedUnits);

    // Current program capacity: always show for RS zones (deterministic SD rule)
    const currentCapacity = `Up to ${aduCap.totalMax} units`;
    const currentDetail = `${aduCap.label} (SD ADU program — lot ${lotSqft >= 10000 ? '> 10,000' : lotSqft > 8000 ? '8,001–10,000' : '≤ 8,000'} SF)`;

    return {
      type: hasAduSignal ? "adu-heavy" : "sfr",
      baseCapacity: `${baseUnits} unit${baseUnits !== 1 ? "s" : ""}`,
      baseLabel: zoneName,
      baseDensity: `${zoneName} → 1 DU / ${minSfPerUnit.toLocaleString()} SF`,
      currentCapacity,
      currentDetail,
      interpretation: `Base zoning allows ${baseUnits} unit${baseUnits !== 1 ? "s" : ""} by right. The SD ADU program may allow up to ${aduCap.totalMax} total units on this lot.`,
      note: "ADU capacity is based on lot size per SD IB-400. Verify current eligibility with the city.",
      potentialCapacity: hasAduSignal ? proposedUnits : null,
      potentialNote: hasAduSignal ? "From submitted permit plans" : null,
    };
  }

  if (rmMatch) {
    const minSfPerUnit = parseInt(rmMatch[2]) * 1000;
    const baseUnits = Math.floor(lotSqft / minSfPerUnit);
    return {
      type: "multifamily",
      baseCapacity: `${baseUnits} unit${baseUnits !== 1 ? "s" : ""}`,
      baseLabel: zoneName,
      baseDensity: `${zoneName} → 1 DU / ${minSfPerUnit.toLocaleString()} SF`,
      currentCapacity: null,
      currentDetail: null,
      interpretation: `${zoneName} zoning allows 1 unit per ${minSfPerUnit.toLocaleString()} SF. This parcel supports ${baseUnits} unit${baseUnits !== 1 ? "s" : ""} by-right.`,
      note: "Higher unit counts may be achievable through ADU programs or density bonuses.",
      potentialCapacity: null,
      potentialNote: null,
    };
  }

  return null;
}

// Regulatory warning: flag when proposed units likely exceed current ADU allowances
// Simple heuristic — does NOT attempt to recalculate current capacity
function shouldShowRegulatoryWarning(proposedUnits: string | null, zoneName: string): boolean {
  if (!proposedUnits) return false;
  const isSingleFamily = /^RS-/i.test(zoneName);
  if (!isSingleFamily) return false;
  // Extract ADU count from proposed string
  const aduMatch = proposedUnits.match(/(\d+)\s+ADUs?/i);
  const aduCount = aduMatch ? parseInt(aduMatch[1]) : 0;
  // Current CA ADU law on SFR lots: typically 1 ADU + 1 JADU = 2-3 units max
  // More than 3 ADUs almost certainly reflects prior or special program rules
  return aduCount > 3;
}

// Permit type priority: lower number = higher priority
function permitTypePriority(recordType: string | null | undefined): number {
  const t = (recordType || "").toLowerCase();
  if (t.includes("combination building")) return 1;
  if (t.includes("building permit") || t === "building permit") return 2;
  if (t.includes("grading") || t.includes("structural")) return 3;
  if (t.includes("plumbing") || t.includes("electrical") || t.includes("mechanical")) return 9;
  return 5; // everything else
}

function extractUnitsFromDescription(description: string): string | null {
  if (!description) return null;

  const aduMatch = description.match(/\((\d+)\)\s*(?:new\s+)?ADU/i) ||
                   description.match(/(\d+)\s+(?:new\s+)?(?:detached\s+)?ADU/i) ||
                   description.match(/ADU[s]?\s+[x×]\s*(\d+)/i) ||
                   description.match(/(\d+)\s+ADU\s+units?/i);
  const aduCount = aduMatch ? parseInt(aduMatch[1]) : 0;

  const hasSdu = /\bSDU\b/i.test(description);
  const hasSfr = /\bSFR\b/i.test(description) || /single.family/i.test(description);
  const hasDwelling = /\bdwelling\b/i.test(description);
  const primaryUnit = hasSdu ? "1 SDU" : (hasSfr || hasDwelling) ? "1 primary unit" : null;

  if (aduCount > 0 && primaryUnit) return `${primaryUnit} + ${aduCount} ADUs`;
  if (aduCount > 0) return `${aduCount} ADUs`;
  if (primaryUnit) return primaryUnit;

  const unitMatch = description.match(/(\d+)\s+(?:new\s+)?(?:residential\s+)?units?/i);
  if (unitMatch && parseInt(unitMatch[1]) > 1) return `${unitMatch[1]} units (see permit description)`;

  return null;
}

// Parse proposed units by permit type priority — not by highest count
function parseProposedUnits(
  primaryProject: any,
  permits: any[]
): string | null {
  // Build candidate list: primary project first, then all permits, sorted by type priority
  const candidates: Array<{ priority: number; description: string | null }> = [];

  if (primaryProject?.primary_project_description) {
    candidates.push({
      priority: permitTypePriority(primaryProject.primary_project_label),
      description: primaryProject.primary_project_description,
    });
  }

  for (const p of permits) {
    if (p.description) {
      candidates.push({
        priority: permitTypePriority(p.record_type),
        description: p.description,
      });
    }
  }

  // Sort by permit type priority (ascending = best first)
  candidates.sort((a, b) => a.priority - b.priority);

  // Return first result that yields a parseable unit summary
  for (const c of candidates) {
    const result = extractUnitsFromDescription(c.description || "");
    if (result) return result;
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

  const proposedUnits = parseProposedUnits(primaryProject, permitData || []);
  const buildInfo = getWhatCanBeBuilt(data.zone_name, data.lot_area_sqft, primaryProject, proposedUnits);
  const interpretation = getInterpretation(primaryProject, proposedUnits);

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
            <div className="space-y-4">
              {/* Base zoning */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Base (Zoning)</p>
                <p className="text-slate-900 font-semibold text-2xl">{buildInfo.baseCapacity}</p>
                <p className="text-xs text-slate-400 mt-0.5">{buildInfo.baseDensity}</p>
              </div>
              {/* Current Program Capacity — deterministic SD ADU rule */}
              {buildInfo.currentCapacity && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide font-medium mb-0.5">Current Program (ADU)</p>
                  <p className="text-emerald-700 font-semibold text-2xl">{buildInfo.currentCapacity}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{buildInfo.currentDetail}</p>
                </div>
              )}
              {/* Historical Proposal — only when permit evidence exists */}
              {buildInfo.potentialCapacity && (() => {
                const showWarning = shouldShowRegulatoryWarning(buildInfo.potentialCapacity, data.zone_name);
                return (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-0.5">Historical Proposal</p>
                    <p className="text-slate-700 font-semibold text-2xl">{buildInfo.potentialCapacity}</p>
                    <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wide font-medium">
                      From submitted permit plans — verify under current rules
                    </p>
                    {showWarning && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠️ This proposal may reflect prior ADU regulations. Current rules may not allow this configuration.
                      </p>
                    )}
                  </div>
                );
              })()}
              <p className="text-sm text-slate-600 leading-relaxed">{buildInfo.interpretation}</p>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">{buildInfo.note}</p>
              <p className="text-xs text-slate-300 mt-1">Verified capacity shown separately from potential upside. Numbers are source-backed.</p>
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
          {interpretation && (
            <p className="mt-4 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              {interpretation}
            </p>
          )}
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
                {proposedUnits && (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wide mr-1.5">Proposed</span>
                    {proposedUnits}
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
