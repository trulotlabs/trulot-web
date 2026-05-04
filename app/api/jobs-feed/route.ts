import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Timing = "now" | "near-term" | "future";
type Confidence = "source-backed" | "inferred" | "conditional" | "unknown";

interface JobEntry {
  address: string;
  apn: string;
  role: string;
  stage: string;
  timing: Timing;
  reason: string;
  confidence: Confidence;
  priority_score: number;
}

interface JobGroup {
  group: string;
  jobs: JobEntry[];
}

// ─── Stage derivation (no permit tree — uses primary project fields only) ──────

function deriveStage(
  momentum: string | null,
  hasBuilding: boolean,
  daysInactive: number,
  desc: string
): string {
  if (!hasBuilding || !momentum) return "INACTIVE";
  if (momentum === "Awaiting Issuance") return "EARLY";
  if (momentum === "Completed") return "COMPLETE";
  if (momentum === "Status unclear" || (daysInactive > 180 && momentum !== "Active")) return "STALLED";
  if (momentum === "Active") {
    if (/scope change/i.test(desc) || /26 ADU|multiple building|MDU construction per separate/i.test(desc))
      return "SCALING";
    return "ACTIVE";
  }
  return "INACTIVE";
}

// ─── Job generation from permit type + stage ───────────────────────────────────

function generateJobs(
  stage: string,
  permitType: string | null,
  desc: string,
  lotSqft: number
): { role: string; timing: Timing; reason: string; confidence: Confidence }[] {
  const jobs: { role: string; timing: Timing; reason: string; confidence: Confidence }[] = [];

  if (stage === "INACTIVE" || stage === "COMPLETE") return jobs;

  const isComboBp = /combination building/i.test(permitType ?? "");
  const isGrading = /grading/i.test(permitType ?? "");
  const isEarlyReview = /approval.*process|pre-application/i.test(permitType ?? "");
  const hasRetainingWall = /retaining wall/i.test(desc);
  const hasMDU = /MDU|26 ADU|multiple.*unit|multifamily/i.test(desc);
  const hasScopeChange = /scope change/i.test(desc);

  if (stage === "ACTIVE" || stage === "SCALING") {
    // Site / civil work
    if (isComboBp || isGrading || hasRetainingWall) {
      jobs.push({
        role: "Civil / Grading",
        timing: "now",
        reason: hasRetainingWall
          ? "Active combination permit — retaining walls in inspection phase"
          : "Active combination permit — site work underway",
        confidence: "source-backed",
      });
    }

    // Framing / structural — after site prep
    if (isComboBp) {
      jobs.push({
        role: "Structural / Framing",
        timing: hasMDU || hasScopeChange ? "near-term" : "now",
        reason: hasMDU
          ? "Multi-unit scope in permit record — structural follows site prep"
          : "Active building permit — framing phase",
        confidence: hasMDU ? "inferred" : "source-backed",
      });
    }

    // MEP — follows framing
    if (isComboBp) {
      jobs.push({
        role: "MEP (Electrical, Mechanical, Plumbing)",
        timing: hasMDU ? "near-term" : "now",
        reason: "Combination permit includes MEP scope",
        confidence: "source-backed",
      });
    }

    // Grading standalone
    if (isGrading) {
      jobs.push({
        role: "Civil / Grading",
        timing: "now",
        reason: "Standalone grading permit — active earthwork",
        confidence: "source-backed",
      });
    }
  }

  if (stage === "SCALING") {
    // Larger project forming
    jobs.push({
      role: "Vertical Construction (future pipeline)",
      timing: "near-term",
      reason: hasMDU
        ? "MDU development cluster in review — larger construction to follow site prep"
        : "Scope change indicates expanded project — vertical construction in pipeline",
      confidence: "conditional",
    });

    if (hasMDU && lotSqft > 15000) {
      jobs.push({
        role: "Structural / Foundation (multi-unit)",
        timing: "near-term",
        reason: "Multi-unit development scope + large lot — foundation/basement work follows grading",
        confidence: "conditional",
      });
    }
  }

  if (stage === "EARLY") {
    jobs.push({
      role: "Entitlement / Investor Tracking",
      timing: "near-term",
      reason: "Permit in review — project has not broken ground",
      confidence: "inferred",
    });
  }

  if (stage === "STALLED") {
    jobs.push({
      role: "Acquisition / Salvage",
      timing: "near-term",
      reason: "Project stalled — entitlement may be salvageable or lot available",
      confidence: "inferred",
    });
  }

  return jobs;
}

// ─── Priority score ────────────────────────────────────────────────────────────

function scoreJob(
  timing: Timing,
  stage: string,
  nearbyHigh: boolean,
  largeLot: boolean,
  absentee: boolean,
  confidence: Confidence
): number {
  let score = timing === "now" ? 3 : timing === "near-term" ? 2 : 1;
  if (stage === "SCALING") score += 2;
  if (stage === "ACTIVE") score += 1;
  if (nearbyHigh) score += 1;
  if (largeLot) score += 1;
  if (absentee) score += 1;
  if (confidence === "conditional") score -= 1;
  return score;
}

// ─── Group label ───────────────────────────────────────────────────────────────

function groupOf(role: string): string {
  if (/civil|grading|earthwork/i.test(role)) return "Civil / Grading";
  if (/structural|framing|foundation/i.test(role)) return "Structural / Framing";
  if (/MEP|electrical|mechanical|plumbing/i.test(role)) return "MEP";
  if (/entitlement|investor|acquisition|salvage|vertical.*pipeline/i.test(role)) return "Entitlement / Investor";
  return "Other";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");        // filter by group
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const stage = searchParams.get("stage");       // filter by stage

  // Step 1: Fetch active projects
  const projRes = await supabase
    .from("parcel_primary_project_v1")
    .select("apn_norm, primary_project_label, primary_project_description, project_momentum_label, primary_project_days_since_activity, has_building_project")
    .in("project_momentum_label", ["Active", "Awaiting Issuance"])
    .eq("has_building_project", true)
    .limit(2000);

  if (projRes.error || !projRes.data || projRes.data.length === 0) {
    return Response.json({ error: "Failed to fetch project data", detail: projRes.error?.message }, { status: 500 });
  }

  // Step 2: Fetch parcel data for those specific APNs
  const activeApns = projRes.data.map((r) => r.apn_norm);
  const parcelRes = await supabase
    .from("parcel_page_api_v2")
    .select("apn_norm, address, lot_area_sqft, nearby_project_count, absentee_owner")
    .in("apn_norm", activeApns)
    .not("address", "is", null);

  // Build parcel lookup map
  const parcelMap = new Map<string, { address: string; lot_area_sqft: number; nearby_project_count: number; absentee_owner: boolean | null }>(
    (parcelRes.data ?? []).map((p) => [p.apn_norm, p])
  );

  const allJobs: JobEntry[] = [];

  for (const row of projRes.data) {
    const parcel = parcelMap.get(row.apn_norm);
    if (!parcel?.address) continue;

    const derivedStage = deriveStage(
      row.project_momentum_label,
      row.has_building_project,
      row.primary_project_days_since_activity ?? 0,
      row.primary_project_description ?? ""
    );

    if (stage && derivedStage !== stage.toUpperCase()) continue;

    const lotSqft = parcel.lot_area_sqft ?? 0;
    const nearbyHigh = (parcel.nearby_project_count ?? 0) >= 5;
    const largeLot = lotSqft > 10000;
    const absentee = parcel.absentee_owner === true;

    const rawJobs = generateJobs(
      derivedStage,
      row.primary_project_label,
      row.primary_project_description ?? "",
      lotSqft
    );

    for (const job of rawJobs) {
      // Apply filters: exclude unknown confidence, exclude pure future
      if (job.confidence === "unknown") continue;
      if (job.timing === "future") continue;

      const score = scoreJob(
        job.timing,
        derivedStage,
        nearbyHigh,
        largeLot,
        absentee,
        job.confidence
      );

      if (role && groupOf(job.role).toLowerCase() !== role.toLowerCase()) continue;

      allJobs.push({
        address: parcel.address,
        apn: row.apn_norm,
        role: job.role,
        stage: derivedStage,
        timing: job.timing,
        reason: job.reason,
        confidence: job.confidence,
        priority_score: score,
      });
    }
  }

  // Sort by priority score descending
  allJobs.sort((a, b) => b.priority_score - a.priority_score);

  // Deduplicate: one job per address per role
  const seen = new Set<string>();
  const deduped = allJobs.filter((j) => {
    const key = `${j.apn}::${j.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const limited = deduped.slice(0, limit);

  // Group by role category
  const groups: Record<string, JobEntry[]> = {};
  for (const job of limited) {
    const g = groupOf(job.role);
    if (!groups[g]) groups[g] = [];
    groups[g].push(job);
  }

  const jobs_feed: JobGroup[] = Object.entries(groups)
    .sort((a, b) => {
      const order = ["Civil / Grading", "Structural / Framing", "MEP", "Entitlement / Investor", "Other"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([group, jobs]) => ({ group, jobs }));

  return Response.json({
    generated_at: new Date().toISOString(),
    total_jobs: limited.length,
    filters: { role: role ?? null, stage: stage ?? null, limit },
    jobs_feed,
    // Flat sorted list also available
    jobs_flat: limited,
  });
}
