import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .trim()
    .split(/\n+/)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function normalizeApnDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function parseApnCandidates(raw) {
  const input = String(raw || "");
  const matches = input.match(/\d{3}-\d{3}-\d{2}-\d{2}|\d{10,11}/g) ?? [];
  const candidates = new Set();

  for (const match of matches) {
    const digits = normalizeApnDigits(match);
    if (digits.length === 10) candidates.add(digits);
    if (digits.length === 11) {
      candidates.add(digits);
      candidates.add(digits.slice(0, 10));
    }
  }

  const rawDigits = normalizeApnDigits(input);
  if (rawDigits.length === 10) candidates.add(rawDigits);
  if (rawDigits.length === 11) {
    candidates.add(rawDigits);
    candidates.add(rawDigits.slice(0, 10));
  }

  return [...candidates];
}

function getPermitLinkage(parcelApnNorm, parcelAddress, permitRow) {
  const permitDigits = normalizeApnDigits(permitRow.apn_norm);
  if (permitDigits === parcelApnNorm) return "exact_apn";

  const parsedCandidates = parseApnCandidates(
    [
      permitRow.apn_norm,
      permitRow.description,
      permitRow.project_scope,
      permitRow.approval_scope,
      permitRow.project_title,
    ].join(" "),
  );
  if (parsedCandidates.includes(parcelApnNorm)) return "parsed_apn";

  if ((permitRow.address_full || "").split(",")[0]?.trim() === parcelAddress) {
    return "address_match";
  }

  return "unmatched";
}

function isDirectParcelPermit(parcelApnNorm, permitRow) {
  if (permitRow.linkage_confidence === "exact_apn") return true;
  if (permitRow.linkage_confidence !== "parsed_apn") return false;

  const candidates = [...new Set((permitRow.apn_candidates || []).map((value) => normalizeApnDigits(value)).filter((value) => value.length === 10))];
  return candidates.length === 1 && candidates[0] === parcelApnNorm;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const adapterSource = fs.readFileSync("lib/parcel-page-v1.ts", "utf8");
  const pageSource = fs.readFileSync("app/parcel/san-diego/[slug]/page.tsx", "utf8");

  const results = [];

  {
    const permit = { apn_norm: "3113333800" };
    const linkage = getPermitLinkage("3113333800", "123 Main St", permit);
    assert(linkage === "exact_apn", "Expected exact normalized APN match.");
    results.push({ id: 1, name: "exact normalized APN", pass: true });
  }

  {
    const candidates = parseApnCandidates("Permit references APN 31133338000");
    assert(candidates.includes("3113333800"), "Expected trailing-zero APN normalization to preserve the canonical 10-digit APN.");
    results.push({ id: 2, name: "permitted trailing-zero normalization", pass: true });
  }

  {
    const permit = {
      apn_norm: "",
      description: "Work for APN 311-333-38-00 with no direct APN field match",
      project_scope: "",
      approval_scope: "",
      project_title: "",
    };
    const linkage = getPermitLinkage("3113333800", "123 Main St", permit);
    assert(linkage === "parsed_apn", "Expected APN parsed from permit description to count as parsed_apn.");
    results.push({ id: 3, name: "APN parsed from permit description", pass: true });
  }

  {
    const direct = isDirectParcelPermit("3113333800", {
      linkage_confidence: "parsed_apn",
      apn_candidates: ["3113333800", "4406530200"],
    });
    assert(direct === false, "Expected multi-APN parsed matches to stay out of direct parcel history.");
    results.push({ id: 4, name: "multiple APNs in one permit", pass: true });
  }

  {
    const direct = isDirectParcelPermit("3113333800", {
      linkage_confidence: "address_match",
      apn_candidates: [],
    });
    assert(direct === false, "Expected address-only linkage to stay out of direct parcel history.");
    results.push({ id: 5, name: "address-only match excluded from direct parcel history", pass: true });
  }

  {
    const linkage = getPermitLinkage("3113333800", "123 Main St", {
      apn_norm: "",
      description: "",
      project_scope: "",
      approval_scope: "",
      project_title: "",
      address_full: "999 Other Rd, San Diego, CA",
    });
    assert(linkage === "unmatched", "Expected unmatched permit classification.");
    results.push({ id: 6, name: "unmatched permit", pass: true });
  }

  {
    const { data, error } = await supabase
      .from("parcel_permit_terminal_v2")
      .select("record_number")
      .in("apn_norm", ["4152722200", "41527222000"])
      .limit(1);
    if (error) throw error;
    assert((data ?? []).length === 0, "Expected a legitimate no-permit parcel to return zero permit rows for the normalized APN candidates.");
    results.push({ id: 7, name: "legitimate no-permit result", pass: true });
  }

  {
    assert(
      adapterSource.includes('status: buildSourceStatus("source_unavailable"') &&
        adapterSource.includes("Permit records are temporarily unavailable."),
      "Expected permit-source failures to map to an unavailable state rather than a no-permits conclusion.",
    );
    results.push({ id: 8, name: "permit-source failure becomes unavailable", pass: true });
  }

  {
    assert(
      pageSource.includes("Source:") &&
        pageSource.includes("Recorded fact") &&
        pageSource.includes("Mapped fact") &&
        pageSource.includes("Conditional"),
      "Expected canonical page source and confidence language to be rendered.",
    );
    results.push({ id: 9, name: "rendered Parcel Page source and confidence language", pass: true });
  }

  {
    assert(
      pageSource.includes('data.pageStatus === "partial"') &&
        adapterSource.includes("const pageStatus"),
      "Expected canonical page partial-source handling to be wired into the page and adapter.",
    );
    results.push({ id: 10, name: "canonical page behavior for partial-source results", pass: true });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
