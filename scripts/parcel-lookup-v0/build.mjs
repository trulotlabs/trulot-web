#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dataDir = path.join(root, "data/parcel-lookup-v0");
const outputIndex = process.argv.indexOf("--output-dir");
const outputDir = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : dataDir;
const sourcePath = path.join(dataDir, "source-records.json");
const EXPECTED_SOURCE_CANONICAL_SHA256 = "e7dac2b7b803f50aef935a52caec96721fc9751ff803649372b194dd78a9783d";
const EXPECTED_SOURCE_FILE_SHA256 = "b871a054a16d6b0fe67af1a80a764cb9aebdb7c9ea09bca052cd95f493cdab5e";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const directionals = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW" };
const suffixes = { STREET: "ST", AVENUE: "AVE", BOULEVARD: "BLVD", ROAD: "RD", DRIVE: "DR", COURT: "CT", PLACE: "PL", LANE: "LN", TERRACE: "TER", CIRCLE: "CIR", HIGHWAY: "HWY", PARKWAY: "PKWY" };

function normalizeAddress(input) {
  const prepared = input.normalize("NFKD").toUpperCase().replace(/#/g, " UNIT ").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return prepared.split(" ").filter(Boolean).map((token) => directionals[token] ?? suffixes[token] ?? token).join(" ").replace(/\bUNIT 0+(\d+)\b/g, "UNIT $1");
}

function formatApn(apn) {
  return `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8)}`;
}

const sourceBytes = fs.readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString("utf8"));
if (sha(sourceBytes) !== EXPECTED_SOURCE_FILE_SHA256 || source.canonicalSha256 !== EXPECTED_SOURCE_CANONICAL_SHA256) {
  throw new Error("Parcel Lookup V0 source seal does not match");
}
if (source.recordCount !== 49 || source.records.length !== 49) throw new Error("Parcel Lookup V0 source count does not match");

const records = source.records.map((record) => {
  const normalizedAddress = record.address ? normalizeAddress(record.address) : null;
  const normalizedUnitAddress = normalizedAddress && record.unit ? `${normalizedAddress} UNIT ${String(record.unit).replace(/^0+(?=\d)/, "")}` : normalizedAddress;
  return {
    ...record,
    apnDisplay: formatApn(record.apn),
    displayAddress: record.address ? `${record.address}${record.unit ? ` · Unit ${record.unit}` : ""}` : `APN ${formatApn(record.apn)}`,
    normalizedAddress,
    normalizedUnitAddress,
  };
});

const corpus = {
  contractVersion: "parcel-lookup-v0-2026-10-01-p43",
  sourceContractVersion: source.contractVersion,
  sourceClassification: source.classification,
  parcelAcquisition: source.parcelAcquisition,
  recordCount: records.length,
  records,
};
corpus.canonicalSha256 = sha(corpus);

const B = (id, query, intent, expectedState, expectedTopApns) => ({ id, query, intent, expectedState, expectedTopApns });
const benchmarkCases = [
  B("p43-001", "639 N 67TH ST", "exact_address", "EXACT_MATCH", ["5442140600"]),
  B("p43-002", "639 North 67th Street", "exact_address", "EXACT_MATCH", ["5442140600"]),
  B("p43-003", "  639   n. 67th st. ", "exact_address", "EXACT_MATCH", ["5442140600"]),
  B("p43-004", "639 67", "partial_address", "PARTIAL_MATCHES", ["5442140600"]),
  B("p43-005", "639 N 67", "partial_address", "PARTIAL_MATCHES", ["5442140600"]),
  B("p43-006", "5442140600", "apn_exact", "EXACT_MATCH", ["5442140600"]),
  B("p43-007", "544-214-06-00", "apn_exact", "EXACT_MATCH", ["5442140600"]),
  B("p43-008", "544 214 06 00", "apn_exact", "EXACT_MATCH", ["5442140600"]),
  B("p43-009", "544214", "apn_prefix", "PARTIAL_MATCHES", ["5442140600"]),
  B("p43-010", "1456 27TH ST", "exact_address", "EXACT_MATCH", ["6341302200"]),
  B("p43-011", "1456 27th Street", "exact_address", "EXACT_MATCH", ["6341302200"]),
  B("p43-012", "1456 27", "partial_address", "PARTIAL_MATCHES", ["6341302200"]),
  B("p43-013", "634-130-22-00", "apn_exact", "EXACT_MATCH", ["6341302200"]),
  B("p43-014", "6341302200", "apn_exact", "EXACT_MATCH", ["6341302200"]),
  B("p43-015", "7553 CABRILLO AVE", "exact_address", "EXACT_MATCH", ["3506320400"]),
  B("p43-016", "7553 Cabrillo Avenue", "exact_address", "EXACT_MATCH", ["3506320400"]),
  B("p43-017", "7553 CAB", "partial_address", "PARTIAL_MATCHES", ["3506320400"]),
  B("p43-018", "350-632-04-00", "apn_exact", "EXACT_MATCH", ["3506320400"]),
  B("p43-019", "4927 WHITEHAVEN WAY", "exact_address", "EXACT_MATCH", ["4304211000"]),
  B("p43-020", "4927 WHITE", "partial_address", "PARTIAL_MATCHES", ["4304211000"]),
  B("p43-021", "430-421-10-00", "apn_exact", "EXACT_MATCH", ["4304211000"]),
  B("p43-022", "303-170-18-00", "missing_situs_apn", "EXACT_MATCH", ["3031701800"]),
  B("p43-023", "6782511200", "missing_situs_apn", "EXACT_MATCH", ["6782511200"]),
  B("p43-024", "581-093-46-00", "missing_situs_apn", "EXACT_MATCH", ["5810934600"]),
  B("p43-025", "1501 FRONT ST", "ambiguous_address", "MULTIPLE_MATCHES", ["5333641301", "5333641302"]),
  B("p43-026", "1501 Front Street Unit 101", "exact_address", "EXACT_MATCH", ["5333641301"]),
  B("p43-027", "1501 FRONT ST #102", "exact_address", "EXACT_MATCH", ["5333641302"]),
  B("p43-028", "5333641301", "apn_exact", "EXACT_MATCH", ["5333641301"]),
  B("p43-029", "2416 ADIRONDACK ROW", "ambiguous_address", "MULTIPLE_MATCHES", ["5891700509", "5891700510", "5891700512"]),
  B("p43-030", "2416 ADIRONDACK ROW UNIT 1", "exact_address", "EXACT_MATCH", ["5891700509"]),
  B("p43-031", "2416 ADIRONDACK ROW UNIT 2", "exact_address", "EXACT_MATCH", ["5891700510"]),
  B("p43-032", "2416 ADIRONDACK ROW UNIT 4", "exact_address", "EXACT_MATCH", ["5891700512"]),
  B("p43-033", "589-170-05-12", "apn_exact", "EXACT_MATCH", ["5891700512"]),
  B("p43-034", "5173 BRIGHTON AVE", "ambiguous_address", "MULTIPLE_MATCHES", ["4480233601", "4480233602", "4480233603", "4480233611", "4480233605"]),
  B("p43-035", "5173 Brighton Avenue Unit 1", "exact_address", "EXACT_MATCH", ["4480233601"]),
  B("p43-036", "5173 BRIGHT", "partial_address", "PARTIAL_MATCHES", ["4480233601"]),
  B("p43-037", "44802336", "apn_prefix", "PARTIAL_MATCHES", ["4480233601"]),
  B("p43-038", "4010 TEXAS ST", "exact_address", "EXACT_MATCH", ["4455722001"]),
  B("p43-039", "4016 TEXAS STREET", "exact_address", "EXACT_MATCH", ["4455722004"]),
  B("p43-040", "4016 1/2 TEXAS ST", "exact_address", "EXACT_MATCH", ["4455722005"]),
  B("p43-041", "401 TEXAS", "partial_address", "PARTIAL_MATCHES", ["4455722001"]),
  B("p43-042", "2112 ERIE ST", "exact_address", "EXACT_MATCH", ["4303410600"]),
  B("p43-043", "2112 ERIE", "partial_address", "PARTIAL_MATCHES", ["4303410600"]),
  B("p43-044", "4303410600", "apn_exact", "EXACT_MATCH", ["4303410600"]),
  B("p43-045", "505 IONA DR", "exact_address", "EXACT_MATCH", ["5490330700"]),
  B("p43-046", "505 IONA DRIVE", "exact_address", "EXACT_MATCH", ["5490330700"]),
  B("p43-047", "740 47TH ST", "exact_address", "EXACT_MATCH", ["5470501600"]),
  B("p43-048", "740 47", "partial_address", "PARTIAL_MATCHES", ["5470501600"]),
  B("p43-049", "13591 NOGALES DR", "exact_address", "EXACT_MATCH", ["3013101500"]),
  B("p43-050", "13591 NOGALES", "partial_address", "PARTIAL_MATCHES", ["3013101500"]),
  B("p43-051", "6292 CAMINO DE LA COSTA", "exact_address", "EXACT_MATCH", ["3515710700"]),
  B("p43-052", "6292 CAMINO", "partial_address", "PARTIAL_MATCHES", ["3515710700"]),
  B("p43-053", "12761 CAMINO DE LA BRECCIA", "exact_address", "EXACT_MATCH", ["2725300831"]),
  B("p43-054", "12761 BRECCIA", "partial_address", "PARTIAL_MATCHES", ["2725300831"]),
  B("p43-055", "15747 SPRECKELS PL", "exact_address", "EXACT_MATCH", ["2673600300"]),
  B("p43-056", "18320 BERNARDO TRAILS DR", "exact_address", "EXACT_MATCH", ["2723200100"]),
  B("p43-057", "2688 MISSION BAY DR", "exact_address", "EXACT_MATCH", ["7600360300"]),
  B("p43-058", "998 West Mission Bay Drive", "exact_address", "EXACT_MATCH", ["7600300100"]),
  B("p43-059", "9999999999", "nonexistent_apn", "NO_MATCH", []),
  B("p43-060", "99999 NOWHERE ST", "nonexistent_address", "NO_MATCH", []),
];

const benchmark = {
  contractVersion: "parcel-lookup-v0-benchmark-2026-10-01-p43",
  classification: "PUBLIC_AUTHORITY_SANITIZED_TEST_CASES",
  privateBenchmarkInputUsed: false,
  caseCount: benchmarkCases.length,
  cases: benchmarkCases,
};
benchmark.canonicalSha256 = sha(benchmark);

const scoutRedContract = {
  contractVersion: "parcel-lookup-scoutred-comparison-2026-10-01-p43",
  state: "AWAITING_INDEPENDENT_EVIDENCE",
  superiorityClaimed: false,
  dimensions: ["steps_to_apn", "time_to_apn", "autocomplete", "partial_address_tolerance", "apn_prominence", "copy_behavior", "parcel_map", "first_screen_facts"],
  requiredEvidence: "Independent, like-for-like observed results using the same query cases and timing method.",
};
scoutRedContract.canonicalSha256 = sha(scoutRedContract);

fs.mkdirSync(outputDir, { recursive: true });
for (const [name, value] of [["corpus.json", corpus], ["benchmark-cases.json", benchmark], ["scoutred-comparison-contract.json", scoutRedContract]]) {
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({ recordCount: records.length, corpusCanonicalSha256: corpus.canonicalSha256, benchmarkCases: benchmarkCases.length, benchmarkCanonicalSha256: benchmark.canonicalSha256 }, null, 2));
