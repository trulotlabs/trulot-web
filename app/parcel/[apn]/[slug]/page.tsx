import { supabase } from "@/lib/supabase";

function formatAPN(apn: string): string {
  if (apn.length === 10) return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8, 10)}`;
  return apn;
}

function getNeighborhoodFromZip(zip: string | null): string | null {
  if (!zip) return null;
  const zipMap: Record<string, string> = {
    "92101": "Downtown", "92102": "South Park / Golden Hill", "92103": "Mission Hills / Hillcrest",
    "92104": "North Park", "92105": "City Heights", "92106": "Point Loma",
    "92107": "Ocean Beach", "92108": "Mission Valley", "92109": "Pacific Beach",
    "92110": "Old Town", "92111": "Linda Vista", "92113": "Barrio Logan",
    "92114": "Encanto", "92115": "College Area", "92116": "Normal Heights",
    "92117": "Clairemont", "92119": "San Carlos", "92120": "Allied Gardens",
    "92121": "Sorrento Valley", "92122": "University City", "92123": "Serra Mesa",
    "92124": "Tierrasanta", "92126": "Mira Mesa", "92127": "Rancho Bernardo",
    "92128": "Rancho Bernardo", "92129": "Penasquitos", "92130": "Carmel Valley",
    "92131": "Scripps Ranch", "92139": "Paradise Hills", "92154": "Otay Ranch"
  };
  return zipMap[zip] || zip;
}

function normalizeStatus(momentumLabel: string | null | undefined): {
  label: "IN REVIEW" | "ISSUED" | "INSPECTION" | "COMPLETE" | "ACTIVE" | "UNKNOWN";
  color: "amber" | "emerald" | "blue" | "slate";
} {
  switch (momentumLabel) {
    case "Awaiting Issuance": return { label: "IN REVIEW",  color: "amber" };
    case "Active":            return { label: "ACTIVE",     color: "emerald" };
    case "Completed":         return { label: "COMPLETE",   color: "blue" };
    case "Status unclear":    return { label: "UNKNOWN",    color: "slate" };
    default:                  return { label: "UNKNOWN",    color: "slate" };
  }
}

function normalizeRawPermitStatus(rawStatus: string | null | undefined): string {
  const s = (rawStatus || "").toLowerCase().trim();
  if (s === "opened") return "IN REVIEW";
  if (s === "issued") return "ISSUED";
  if (s.includes("inspection")) return "INSPECTION";
  if (s === "closed" || s === "finaled") return "COMPLETE";
  if (s === "expired") return "EXPIRED";
  return rawStatus || "Unknown";
}

function statusClasses(color: "amber" | "emerald" | "blue" | "slate"): { bg: string; text: string } {
  switch (color) {
    case "amber":   return { bg: "bg-amber-50",  text: "text-amber-700" };
    case "emerald": return { bg: "bg-emerald-50", text: "text-emerald-700" };
    case "blue":    return { bg: "bg-blue-50",   text: "text-blue-700" };
    default:        return { bg: "bg-slate-100", text: "text-slate-600" };
  }
}

// Infer existing structure from permit history — heuristic only
// Never state unit count as fact without assessor data
function getExistingStructure(permits: any[]): {
  label: string;
  units: string;
  additionalUnits: string;
  recentActivity: string | null;
} {
  const hasAduPermit = permits.some((p: any) =>
    /ADU|accessory dwelling|addition|conversion/i.test(p.record_type || '') ||
    /ADU|accessory dwelling/i.test(p.description || '')
  );
  const hasPvPermit = permits.some((p: any) =>
    /photovoltaic|solar|PV/i.test(p.record_type || '')
  );
  const hasExpansion = permits.some((p: any) =>
    /addition|expansion|conversion/i.test(p.record_type || '')
  );

  const recentYear = permits.length > 0
    ? new Date(permits[0].opened_date || '').getFullYear() || null
    : null;

  let units: string;
  let additionalUnits: string;

  if (hasAduPermit) {
    units = '1 unit (inferred)';
    additionalUnits = 'ADU/conversion permit on record';
  } else if (hasExpansion) {
    units = '1 unit (inferred from permits)';
    additionalUnits = 'Expansion permit on record';
  } else {
    units = '1 unit (inferred)';
    additionalUnits = 'None detected';
  }

  let recentActivity: string | null = null;
  if (hasPvPermit && recentYear) {
    recentActivity = `Solar installation detected (${recentYear}) — non-housing improvement`;
  } else if (permits.length > 0 && recentYear) {
    recentActivity = `Recent permit activity (${recentYear})`;
  }

  return { label: 'Permit-based inference only', units, additionalUnits, recentActivity };
}

// Underbuilt signal — directional only, conservative phrasing required
function getUnderbuiltSignal(
  permits: any[],
  buildInfo: ReturnType<typeof getWhatCanBeBuilt> | null
): { level: 'high' | 'moderate' | 'low' | 'unknown'; reasoning: string[]; verify: string[] } | null {
  if (!buildInfo) return null;

  const hasAduPermit = permits.some((p: any) =>
    /ADU|accessory dwelling/i.test(p.record_type || '') ||
    /ADU|accessory dwelling/i.test(p.description || '')
  );

  const potentialMax = buildInfo.currentCapacity
    ? parseInt(buildInfo.currentCapacity.replace(/\D/g, '')) || 0
    : 0;

  if (potentialMax === 0) return null;

  const reasoning: string[] = [];
  const verify: string[] = ['ADU Bonus program eligibility', 'Overlay and site constraints'];

  if (hasAduPermit) {
    reasoning.push('ADU permit detected — some density may already be added');
    return { level: 'low', reasoning, verify };
  }

  reasoning.push('1 unit (inferred from permits)');
  reasoning.push(`Lot size may support conditional upside (${buildInfo.currentCapacity})`);
  reasoning.push('No ADU or density expansion permits detected');

  if (potentialMax >= 6) {
    return { level: 'moderate', reasoning, verify };
  }
  return { level: 'low', reasoning, verify };
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
    const currentDetail = `1 SDU + up to ${aduCap.maxAduJadu} ADU/JADU (SD IB-400)`;

    return {
      type: hasAduSignal ? "adu-heavy" : "sfr",
      baseCapacity: `${baseUnits} unit${baseUnits !== 1 ? "s" : ""}`,
      baseLabel: zoneName,
      baseDensity: `${zoneName} → 1 DU / ${minSfPerUnit.toLocaleString()} SF + ADU`,
      currentCapacity,
      currentDetail,
      interpretation: `${zoneName}: ${baseUnits} unit${baseUnits !== 1 ? "s" : ""} base. Up to ${aduCap.totalMax} total with ADU program.`,
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

// Returns the best available proposed scope description from permit data
// Fixes 639 67th St bug: primary permit may describe retaining walls ("per separate permit")
// while the real ADU/unit scope lives in a sibling permit
function getProposedScope(
  primaryProject: any,
  permits: any[]
): { text: string; source: string; isRelated: boolean } | null {
  const primary = primaryProject?.primary_project_description ?? '';

  // Check if the primary description is vague or deferred
  const isVague =
    primary.length < 100 ||
    /per separate permit/i.test(primary) ||
    /retaining wall/i.test(primary) ||
    /associated with.*existing/i.test(primary);

  if (primary && !isVague) {
    return { text: primary, source: primaryProject.primary_project_id, isRelated: false };
  }

  // Scan sibling permits for a richer description
  const richer = [...permits]
    .filter(p => p.description && p.description.length > primary.length)
    .sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))
    .find(p => /ADU|units?|construction|building|residential|multifamily|dwelling/i.test(p.description ?? ''));

  if (richer) {
    return { text: richer.description, source: richer.record_id || richer.record_number, isRelated: true };
  }

  if (primary) {
    return { text: primary, source: primaryProject.primary_project_id, isRelated: false };
  }

  return null;
}

// Sprint 1 Feature Functions

// Build permit tree using parent_record_id relationships
function buildPermitTree(permits: any[]) {
  const tree: any[] = [];
  const permitMap = new Map(permits.map(p => [p.record_number, p]));

  permits.forEach(permit => {
    if (!permit.parent_record_id || !permitMap.has(permit.parent_record_id)) {
      tree.push({ ...permit, children: [] });
    }
  });

  permits.forEach(permit => {
    if (permit.parent_record_id && permitMap.has(permit.parent_record_id)) {
      const parent = tree.find(p => p.record_number === permit.parent_record_id);
      if (parent) {
        parent.children.push(permit);
      }
    }
  });

  return tree.slice(0, 15);
}

// Calculate time-to-permit metrics
function calculateTimeToPermit(permits: any[]) {
  const closedPermits = permits.filter(p =>
    p.opened_date && p.issued_date &&
    (p.status?.toLowerCase().includes('finaled') || p.status?.toLowerCase().includes('closed') || p.issued_date)
  );

  if (closedPermits.length === 0) return null;

  const days = closedPermits.map(p => {
    const opened = new Date(p.opened_date);
    const issued = new Date(p.issued_date);
    return Math.round((issued.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24));
  }).filter(d => d > 0 && d < 3650); // Filter out invalid dates

  if (days.length === 0) return null;

  const avgDays = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  let rating: 'Easy' | 'Moderate' | 'Complex';

  if (avgDays < 60) rating = 'Easy';
  else if (avgDays <= 200) rating = 'Moderate';
  else rating = 'Complex';

  return { avgDays, rating, count: days.length };
}

// Get top active developers in submarket
function getActiveDevelopers(permits: any[], currentApn: string) {
  const activePermits = permits.filter(p =>
    p.record_type?.toLowerCase().includes('combination building') &&
    (p.status?.toLowerCase().includes('issued') || p.status?.toLowerCase().includes('active')) &&
    p.apn_norm !== currentApn
  );

  const builderCounts = new Map<string, number>();

  activePermits.forEach(p => {
    const name = p.applicant_name || p.contractor_name || 'Unknown';
    if (name && name !== 'Unknown' && name.trim().length > 0) {
      builderCounts.set(name, (builderCounts.get(name) || 0) + 1);
    }
  });

  return Array.from(builderCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// Get comparable permitted projects
function getComparableProjects(permits: any[], currentApn: string) {
  return permits.filter(p =>
    p.record_type?.toLowerCase().includes('combination building') &&
    (p.status?.toLowerCase().includes('issued') || p.status?.toLowerCase().includes('finaled')) &&
    p.apn_norm !== currentApn &&
    p.address
  ).slice(0, 8);
}

function getTenSecondStory(
  primaryProject: any,
  buildInfo: ReturnType<typeof getWhatCanBeBuilt> | null,
  proposedUnits: string | null,
  _data: any
): string {
  if (primaryProject?.has_building_project) {
    const momentum = primaryProject.project_momentum_label;
    let story = '';
    if (momentum === 'Active') {
      story = `${proposedUnits || 'Development'} actively under construction.`;
    } else if (momentum === 'Awaiting Issuance') {
      story = `Development permit filed for ${proposedUnits || 'new project'}, pending city approval.`;
    } else if (momentum === 'Completed') {
      story = `Development project (${proposedUnits || 'unknown scope'}) has been completed.`;
    } else {
      story = 'A building permit is on file — current status unclear.';
    }
    if (buildInfo?.currentCapacity) {
      story += ` ADU program may allow up to ${buildInfo.currentCapacity} if eligible.`;
    }
    return story;
  }
  if (buildInfo) {
    return `No current development activity. Zoning allows ${buildInfo.baseCapacity} by right.`;
  }
  return 'No current development activity detected.';
}

export default async function ParcelPage({ params }: { params: Promise<{ apn: string; slug: string }> }) {
  const { apn } = await params;

  const { data, error } = await supabase.from("parcel_page_api_v2").select("*").eq("apn_norm", apn).single();
  const { data: primaryProject } = await supabase.from("parcel_primary_project_v1").select("*").eq("apn_norm", apn).maybeSingle();
  const { data: permitData } = await supabase.from("parcel_permit_terminal_v2").select("*").eq("apn_norm", apn).order("opened_date", { ascending: false });

  // Sprint 1 feature queries
  const zipCode = data?.zip_code;
  const { data: submarketPermits } = zipCode
    ? await supabase.from("parcel_permit_terminal_v2").select("*").eq("zip_code", zipCode).order("opened_date", { ascending: false }).limit(200)
    : { data: null };

  // Sprint 2: Fetch nearby parcels from PostGIS edge function
  let nearbyParcels: any[] = [];
  let nearbyError: string | null = null;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/nearby-parcels?apn=${apn}&radius_ft=2640`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (response.ok) {
        const result = await response.json();
        nearbyParcels = result.nearby_parcels || [];
      } else {
        const errorData = await response.json().catch(() => ({}));
        nearbyError = errorData.error || 'Failed to fetch nearby parcels';
      }
    }
  } catch (err) {
    console.error('Error fetching nearby parcels:', err);
    nearbyError = 'Edge function not available';
  }

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

  // Use live nearby data if available to determine status
  const hasNearbyActive = nearbyParcels.some(p => p.project_state === 'Active');
  const hasNearbyCompleted = nearbyParcels.some(p => p.project_state === 'Completed');

  // Enhance status badge with PostGIS data
  const status = (() => {
    const ns = normalizeStatus(primaryProject?.project_momentum_label);
    const baseStatus = { label: ns.label, ...statusClasses(ns.color) };
    if (!primaryProject && nearbyParcels.length > 0) {
      if (hasNearbyActive) return { label: "Active nearby", bg: "bg-emerald-50", text: "text-emerald-700" };
      if (hasNearbyCompleted) return { label: "Recently built nearby", bg: "bg-blue-50", text: "text-blue-700" };
    }
    return baseStatus;
  })();

  const seen = new Set<string>();
  const uniquePermits = (permitData || []).filter((p: any) => {
    const key = p.record_number || p.record_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const supportingPermits = uniquePermits.filter(
    (p: any) => !primaryProject || p.record_number !== primaryProject.primary_project_id
  );

  const proposedUnits = parseProposedUnits(primaryProject, permitData || []);
  const proposedScope = getProposedScope(primaryProject, permitData || []);
  const buildInfo = getWhatCanBeBuilt(data.zone_name, data.lot_area_sqft, primaryProject, proposedUnits);
  const interpretation = getInterpretation(primaryProject, proposedUnits);
  const existingStructure = getExistingStructure(uniquePermits);
  const underbuiltSignal = getUnderbuiltSignal(uniquePermits, buildInfo);

  // Sprint 1 feature data
  const neighborhood = getNeighborhoodFromZip(data.zip_code);
  const timeToPermit = calculateTimeToPermit(uniquePermits);
  const activeDevelopers = submarketPermits ? getActiveDevelopers(submarketPermits, apn) : [];
  const comparableProjects = submarketPermits ? getComparableProjects(submarketPermits, apn) : [];

  // Derived counts — prefer live PostGIS data, fall back to static
  const nearbyCount = nearbyParcels.length > 0 ? nearbyParcels.length : (data.nearby_project_count ?? 0);
  const nearbyActiveCount = nearbyParcels.length > 0
    ? nearbyParcels.filter((p: any) => p.project_state === 'Active').length
    : (data.nearby_active_count ?? 0);
  const nearbyCompletedCount = nearbyParcels.length > 0
    ? nearbyParcels.filter((p: any) => p.project_state === 'Completed').length
    : (data.nearby_completed_count ?? 0);
  const nearbyStalled = nearbyParcels.length > 0
    ? nearbyParcels.filter((p: any) => p.project_state === 'Awaiting Issuance').length
    : (data.nearby_stalled_count ?? 0);
  const nearbyStrength = nearbyCount >= 5 ? 'High' : nearbyCount >= 2 ? 'Moderate' : nearbyCount >= 1 ? 'Low' : null;
  const isRsZone = !!data.zone_name?.match(/^RS-1-(\d+)/i);
  const tenSecondStory = getTenSecondStory(primaryProject, buildInfo, proposedUnits, data);
  const hasAnySignal = data.lot_area_sqft > 10000 || isRsZone || nearbyStrength !== null
    || data.absentee_owner === true || data.has_nearby_active_project === true
    || comparableProjects.length >= 3;
  const hasVhfhszInPermits = uniquePermits.some((p: any) =>
    /VHFSZ|VHFHSZ/i.test(p.description || '') || /VHFSZ|VHFHSZ/i.test(p.record_type || '')
  );
  const primaryPermitRecord = uniquePermits.find((p: any) => p.record_number === primaryProject?.primary_project_id);
  const allPermitsSorted = [
    ...(primaryPermitRecord ? [primaryPermitRecord] : []),
    ...uniquePermits.filter((p: any) => p.record_number !== primaryProject?.primary_project_id),
  ];

  // Suppress unused-var lint on fmtMonthYear — kept for backward compat
  void fmtMonthYear;

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
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">APN</p>
              <p className="text-slate-700 font-mono text-xs">{formatAPN(apn)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Lot size</p>
              <p className="text-slate-700 font-medium">{Math.round(data.lot_area_sqft).toLocaleString()} SF / {data.lot_area_acres} ac</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Zoning</p>
              <p className="text-slate-700 font-medium">{data.zone_name}</p>
            </div>
          </div>
        </section>

        {/* 2. 10-Second Story */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <p className="text-lg font-medium text-slate-900">{tenSecondStory}</p>
          <ul className="mt-4 space-y-2">
            {primaryProject?.project_momentum_label === 'Active' && (
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-emerald-500 shrink-0">·</span>Construction active
              </li>
            )}
            {buildInfo?.currentCapacity && (
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-amber-500 shrink-0">·</span>ADU upside detected — conditional on eligibility
              </li>
            )}
            {data.absentee_owner === true && (
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-amber-500 shrink-0">·</span>Absentee owner
              </li>
            )}
            {underbuiltSignal && underbuiltSignal.level !== 'low' && (
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-amber-500 shrink-0">·</span>Likely underbuilt relative to zoning allowances
              </li>
            )}
            {nearbyCount > 0 && (
              <li className="flex gap-2 text-sm text-slate-600">
                <span className="text-slate-400 shrink-0">·</span>
                {nearbyCount} development project{nearbyCount !== 1 ? 's' : ''} within ½ mile
              </li>
            )}
          </ul>
        </section>

        {/* 3. Opportunity Signals */}
        {hasAnySignal && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Signals</h2>
            <div className="flex flex-wrap gap-2">
              {data.lot_area_sqft > 10000 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Large lot</span>
              )}
              {isRsZone && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">ADU eligible (RS)</span>
              )}
              {nearbyStrength && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  nearbyStrength === 'High' ? 'bg-emerald-50 text-emerald-700' :
                  nearbyStrength === 'Moderate' ? 'bg-amber-50 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{nearbyCount === 1 ? '1 nearby project' : `${nearbyCount} nearby projects`}</span>
              )}
              {data.absentee_owner === true && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Absentee owner</span>
              )}
              {data.has_nearby_active_project === true && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">TPA</span>
              )}
              {comparableProjects.length >= 3 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{comparableProjects.length} comparable projects</span>
              )}
            </div>
          </section>
        )}

        {/* 4. Reality Layer — What's Happening Now */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">What&apos;s Happening Now</h2>
          {primaryProject?.has_building_project ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-900 text-base">
                    {primaryProject.primary_project_label || primaryProject.primary_project_type}
                  </p>
                  <p className="font-mono text-xs text-slate-400 mt-0.5">{primaryProject.primary_project_id}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Proposed scope</p>
                {proposedScope ? (
                  <div>
                    <p className="text-slate-700 text-sm">{proposedScope.text}</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">Source: {proposedScope.source}</p>
                    {proposedScope.isRelated && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">From related permit — verify</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Scope unknown</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Timeline</p>
                <div className="flex items-start gap-3 text-sm flex-wrap">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Filed</p>
                    <p className="text-slate-700 font-medium">
                      {primaryProject.primary_project_opened
                        ? new Date(primaryProject.primary_project_opened).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>
                  <span className="text-slate-300 mt-4">→</span>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Issued</p>
                    <p className={primaryProject.primary_project_issued ? 'text-slate-700 font-medium' : 'text-amber-600'}>
                      {primaryProject.primary_project_issued
                        ? new Date(primaryProject.primary_project_issued).toLocaleDateString()
                        : 'Pending'}
                    </p>
                  </div>
                  <span className="text-slate-300 mt-4">→</span>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Field Activity</p>
                    <p className={primaryProject.project_momentum_label === 'Active' ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {primaryProject.project_momentum_label === 'Active' ? 'Active' : 'None detected'}
                    </p>
                  </div>
                </div>
              </div>

              {interpretation && (
                <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{interpretation}</p>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No building permit on file.</p>
          )}
        </section>

        {/* 5. Nearby Development */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Nearby Development</h2>
            {nearbyStrength && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                nearbyStrength === 'High' ? 'bg-emerald-50 text-emerald-700' :
                nearbyStrength === 'Moderate' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>{nearbyStrength}</span>
            )}
          </div>

          {nearbyCount > 0 ? (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-2xl font-bold text-slate-900">{nearbyCount}</span>
                  <span className="text-slate-500 ml-1.5">nearby projects</span>
                </div>
                {nearbyActiveCount > 0 && (
                  <div>
                    <span className="text-lg font-bold text-emerald-700">{nearbyActiveCount}</span>
                    <span className="text-slate-500 ml-1.5">active</span>
                  </div>
                )}
                {nearbyCompletedCount > 0 && (
                  <div>
                    <span className="text-lg font-bold text-blue-700">{nearbyCompletedCount}</span>
                    <span className="text-slate-500 ml-1.5">completed</span>
                  </div>
                )}
                {nearbyStalled > 0 && (
                  <div>
                    <span className="text-lg font-bold text-slate-500">{nearbyStalled}</span>
                    <span className="text-slate-500 ml-1.5">stalled</span>
                  </div>
                )}
              </div>

              {(data.nearest_completed_distance_ft || nearbyParcels.find((p: any) => p.project_state === 'Completed')) && (
                <p className="mt-3 text-xs text-slate-400">
                  Nearest completed:{' '}
                  {data.nearest_completed_distance_ft
                    ? `${Math.round(data.nearest_completed_distance_ft)} ft away`
                    : `${nearbyParcels.find((p: any) => p.project_state === 'Completed')?.distance_ft?.toLocaleString()} ft away`
                  }
                </p>
              )}

              {nearbyError && (
                <p className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Live nearby data unavailable ({nearbyError}) — showing static counts
                </p>
              )}

              {nearbyParcels.length > 0 && (
                <details className="mt-4 group">
                  <summary className="cursor-pointer text-sm font-medium text-emerald-700 hover:text-emerald-800 list-none flex items-center gap-2">
                    <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                    Show nearby projects
                  </summary>
                  <div className="mt-3 space-y-2 pl-5">
                    {nearbyParcels.map((project: any, idx: number) => (
                      <div key={idx} className="border-l-2 border-slate-200 pl-3 py-1">
                        <p className="text-sm font-medium text-slate-700">{project.address}</p>
                        <div className="flex gap-3 mt-1 text-xs">
                          <span className={`font-medium ${
                            project.project_state === 'Active' ? 'text-emerald-600' :
                            project.project_state === 'Completed' ? 'text-blue-600' :
                            project.project_state === 'Awaiting Issuance' ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {project.project_state || 'Unknown status'}
                          </span>
                          <span className="text-slate-400">
                            {project.distance_ft?.toLocaleString()} ft away
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">No nearby development projects detected within ½ mile.</p>
          )}
        </section>

        {/* 6. Potential Layer — What Could Be Built */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">What Could Be Built</h2>
          {buildInfo ? (
            <div className="space-y-5">

              {/* Baseline — source-backed */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Baseline</p>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">Source-backed</span>
                </div>
                <p className="text-slate-900 font-bold text-2xl">{buildInfo.baseCapacity}</p>
                <p className="text-sm text-slate-500 mt-1">{buildInfo.baseDensity}</p>
                <p className="text-xs text-slate-400 mt-0.5">Zone: {buildInfo.baseLabel}</p>
              </div>

              {/* ADU program upside — conditional */}
              {buildInfo.currentCapacity && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-amber-600 uppercase tracking-wide font-semibold">ADU Program Upside</p>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">Conditional — requires verification</span>
                  </div>
                  <p className="text-amber-800 font-bold text-2xl">{buildInfo.currentCapacity}</p>
                  <p className="text-sm text-slate-500 mt-1">{buildInfo.currentDetail}</p>
                  <ul className="mt-2 space-y-1">
                    <li className="text-xs text-amber-700">· Requires ADU Bonus Program compliance</li>
                    <li className="text-xs text-amber-700">· Subject to site constraints</li>
                    <li className="text-xs text-amber-700">· Not guaranteed</li>
                  </ul>
                  <p className="mt-2 text-xs text-slate-400">
                    Source:{' '}
                    <a
                      href="https://www.sandiego.gov/development-services/forms-publications/information-bulletins/400"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-slate-600"
                    >
                      SD IB-400
                    </a>
                  </p>
                </div>
              )}

              {/* Historical proposal */}
              {buildInfo.potentialCapacity && (() => {
                const showWarning = shouldShowRegulatoryWarning(buildInfo.potentialCapacity, data.zone_name);
                return (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Historical Proposal</p>
                    <p className="text-slate-600 font-bold text-xl">{buildInfo.potentialCapacity}</p>
                    <p className="text-xs text-slate-400 mt-1">Historical proposal — verify under current rules</p>
                    {showWarning && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This proposal may reflect prior ADU regulations. Current rules may not allow this configuration.
                      </p>
                    )}
                  </div>
                );
              })()}

            </div>
          ) : (
            <p className="text-sm text-slate-400">See local zoning code for development allowances.</p>
          )}
        </section>

        {/* 7. Constraints & Unknowns (collapsed by default) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <details>
            <summary className="cursor-pointer flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Constraints &amp; Unknowns — 4 unknown / unverified</h2>
              <span className="text-xs text-slate-400 ml-2">▶</span>
            </summary>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2 text-sm">
                <span className="text-slate-300 shrink-0">·</span>
                <span className="text-slate-500">
                  Coastal Overlay:{' '}
                  {data.zone_name?.toLowerCase().includes('coastal')
                    ? <span className="text-amber-600">May apply — verify</span>
                    : <span className="text-slate-400">Unknown</span>
                  }
                </span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-slate-300 shrink-0">·</span>
                <span className="text-slate-400">ESL (Environmentally Sensitive Lands): Unknown</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-slate-300 shrink-0">·</span>
                <span className="text-slate-400">FAR / lot coverage: Verification required</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-slate-300 shrink-0">·</span>
                <span className="text-slate-500">
                  Fire / VHFHSZ:{' '}
                  {hasVhfhszInPermits
                    ? <span className="text-amber-600">Detected in permit</span>
                    : <span className="text-slate-400">Unknown</span>
                  }
                </span>
              </div>
            </div>
          </details>
        </section>

        {/* 8. Property Profile */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Property Profile</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-2">
                Unit count
                {(data.unitqty != null && data.unitqty !== 0)
                  ? <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">Source-backed</span>
                  : <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">Inferred</span>
                }
              </p>
              <p className="text-slate-700">
                {(data.unitqty != null && data.unitqty !== 0)
                  ? `${data.unitqty} unit${data.unitqty !== 1 ? 's' : ''}`
                  : existingStructure.units
                }
              </p>
            </div>
            {data.total_lvg_area != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-2">
                  Living area
                  <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">Source-backed</span>
                </p>
                <p className="text-slate-700">{Math.round(data.total_lvg_area).toLocaleString()} SF</p>
              </div>
            )}
            {data.year_effective != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-2">
                  Year built
                  <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">Source-backed</span>
                </p>
                <p className="text-slate-700">{data.year_effective}</p>
              </div>
            )}
            {data.bedrooms != null && data.baths != null && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-2">
                  Bedrooms / Baths
                  <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">Source-backed</span>
                </p>
                <p className="text-slate-700">{data.bedrooms} bd / {data.baths} ba</p>
              </div>
            )}
            {(data.unitqty == null || data.unitqty === 0) && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">ADU / conversion evidence</p>
                <p className="text-slate-600 text-sm">{existingStructure.additionalUnits}</p>
              </div>
            )}
            {existingStructure.recentActivity && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Recent improvements</p>
                <p className="text-slate-500 text-sm">{existingStructure.recentActivity}</p>
              </div>
            )}
            {underbuiltSignal && underbuiltSignal.level !== 'low' && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-2">
                  Underbuilt signal
                  <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">Inferred</span>
                </p>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  underbuiltSignal.level === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-yellow-50 text-yellow-700'
                }`}>{underbuiltSignal.level === 'moderate' ? 'Moderate' : 'High'}</span>
                <ul className="mt-2 space-y-1">
                  {underbuiltSignal.reasoning.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-500">
                      <span className="text-slate-300 shrink-0">·</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(data.unitqty == null || data.unitqty === 0) && (
              <p className="text-xs text-slate-300 pt-1 border-t border-slate-100">
                Assessor data: not loaded
              </p>
            )}
          </div>
        </section>

        {/* 9. Permit History (collapsed by default) */}
        {allPermitsSorted.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <details>
              <summary className="cursor-pointer flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Permit History ({allPermitsSorted.length})
                </h2>
                <span className="text-xs text-slate-400 ml-2">▶</span>
              </summary>
              <div className="mt-4 space-y-3">
                {allPermitsSorted.map((permit: any, idx: number) => {
                  const isPrimary = permit.record_number === primaryProject?.primary_project_id;
                  const normStatus = normalizeRawPermitStatus(permit.status);
                  const sc = (() => {
                    switch (normStatus) {
                      case "IN REVIEW":  return { bg: "bg-amber-50",  text: "text-amber-700" };
                      case "ISSUED":     return { bg: "bg-emerald-50", text: "text-emerald-700" };
                      case "INSPECTION": return { bg: "bg-blue-50",   text: "text-blue-700" };
                      case "COMPLETE":   return { bg: "bg-blue-50",   text: "text-blue-700" };
                      case "EXPIRED":    return { bg: "bg-slate-100", text: "text-slate-400" };
                      default:           return { bg: "bg-slate-100", text: "text-slate-500" };
                    }
                  })();
                  return (
                    <div key={idx} className={isPrimary ? "border border-emerald-200 rounded-lg p-3 bg-emerald-50/30" : ""}>
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono text-xs text-slate-700 font-semibold">{permit.record_number}</p>
                            {isPrimary && <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-medium">Primary</span>}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{permit.record_type}</p>
                          {permit.description && (
                            <p className="text-xs text-slate-600 mt-1">
                              {permit.description.length > 80 ? permit.description.slice(0, 80) + '…' : permit.description}
                            </p>
                          )}
                          {permit.opened_date && (
                            <p className="text-xs text-slate-400 mt-1">Filed: {new Date(permit.opened_date).toLocaleDateString()}</p>
                          )}
                        </div>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          {normStatus}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>
        )}

        {/* 10. Entitlement Complexity */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Entitlement complexity</h2>
          {timeToPermit ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-900">{timeToPermit.avgDays} days</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  timeToPermit.rating === 'Easy' ? 'bg-emerald-50 text-emerald-700' :
                  timeToPermit.rating === 'Moderate' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>{timeToPermit.rating}</span>
              </div>
              <p className="text-sm text-slate-600">
                Average time from filing to issuance for this parcel (based on {timeToPermit.count} closed permit{timeToPermit.count !== 1 ? 's' : ''})
              </p>
              <div className="border-t border-slate-100 pt-3 mt-3">
                <p className="text-xs text-slate-400 mb-1">San Diego benchmark</p>
                <p className="text-sm text-slate-600">Combination Building Permit: <span className="font-semibold">183 days avg</span> (146 days median)</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">No closed permits available to calculate processing time.</p>
              <div className="border-t border-slate-100 pt-3 mt-3">
                <p className="text-xs text-slate-400 mb-1">San Diego benchmark</p>
                <p className="text-sm text-slate-600">Combination Building Permit: <span className="font-semibold">183 days avg</span> (146 days median)</p>
              </div>
            </div>
          )}
        </section>

        {/* 11. Active Developers Nearby */}
        {activeDevelopers.length >= 3 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Active developers nearby</h2>
            <p className="text-xs text-slate-500 mb-4">Most active in {neighborhood || data.zip_code}</p>
            <div className="space-y-2">
              {activeDevelopers.map((dev, idx) => (
                <div key={idx} className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-700">{dev.name}</span>
                  <span className="text-sm font-semibold text-slate-900">{dev.count} active permit{dev.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 12. What Actually Gets Built Here */}
        {comparableProjects.length >= 3 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">What actually gets built here</h2>
            <p className="text-xs text-slate-500 mb-4">
              Based on {comparableProjects.length} comparable permitted project{comparableProjects.length !== 1 ? 's' : ''} in {neighborhood || data.zip_code}
            </p>
            <div className="space-y-3">
              {comparableProjects.map((project, idx) => (
                <div key={idx} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm font-medium text-slate-700">{project.address}</p>
                  {project.description && (
                    <p className="text-xs text-slate-500 mt-1">
                      {project.description.slice(0, 100)}{project.description.length > 100 ? '...' : ''}
                    </p>
                  )}
                  {project.issued_date && (
                    <p className="text-xs text-slate-400 mt-1">Issued: {new Date(project.issued_date).toLocaleDateString()}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 13. CTA */}
        <section className="bg-emerald-700 rounded-xl p-6 text-center">
          <h2 className="text-white font-semibold">Track this parcel</h2>
          <p className="text-emerald-200 text-sm mt-1 mb-5">Get alerts when permits, status, or entitlement signals change.</p>
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
