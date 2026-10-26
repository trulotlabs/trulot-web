import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import countReport from "../data/la-mesa-parcel-lookup-serving-v0/row-count-report.json";
import duplicateReport from "../data/la-mesa-parcel-lookup-serving-v0/duplicate-address-report.json";
import integrity from "../data/la-mesa-parcel-lookup-serving-v0/artifact-integrity.json";
import sampleReport from "../data/la-mesa-parcel-lookup-serving-v0/random-sample.json";
import {
  evaluateLaMesaFrontDoor,
  resolveLaMesaFrontDoor,
} from "../lib/la-mesa-adu-front-door";
import { buildLaMesaFrontDoorDataset } from "../lib/la-mesa-adu-front-door-server";
import {
  formatApn,
  normalizeAddress,
  normalizeApnInput,
  searchParcelLookup,
} from "../lib/parcel-lookup-contract";

const ROOT = "data/la-mesa-parcel-lookup-serving-v0";
const dataset = buildLaMesaFrontDoorDataset();
const canonical = dataset.records.filter((row) => row.authority === "SEALED_PUBLIC_SERVING");
const comparison = dataset.records.filter((row) => row.authority === "CROSS_JURISDICTION_COMPARISON");

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("artifact manifest and predecessor-backed population are sealed", () => {
  for (const [name, expected] of Object.entries(integrity.files)) {
    const path = `${ROOT}/${name}`;
    assert.equal(readFileSync(path).length, expected.bytes, name);
    assert.equal(sha(path), expected.sha256, name);
  }
  assert.equal(dataset.canonicalCount, 17_391);
  assert.equal(canonical.length, 17_391);
  assert.equal(new Set(canonical.map((row) => row.apn)).size, 17_391);
  assert.equal(canonical.some((row) => row.apn === "4953350500"), false);
});

test("serving schema/count and exact Packet 63 address analysis agree", () => {
  assert.deepEqual(
    {
      canonicalRows: countReport.canonicalRows,
      addressedRows: countReport.addressedRows,
      missingAddressRows: countReport.missingAddressRows,
      distinctAddressStrings: countReport.distinctAddressStrings,
      duplicateAddressGroups: countReport.duplicateAddressGroups,
      extraDuplicateAddressRows: countReport.extraDuplicateAddressRows,
    },
    {
      canonicalRows: 17_391,
      addressedRows: 16_728,
      missingAddressRows: 663,
      distinctAddressStrings: 13_212,
      duplicateAddressGroups: 186,
      extraDuplicateAddressRows: 3_516,
    },
  );
  assert.equal(duplicateReport.groups.length, 186);
  assert.equal(countReport.crossJurisdictionAddressStrings, 7);
  assert.equal(comparison.length, 27);
});

test("APN normalization supports raw, dashed, spaced, and leading-zero values", () => {
  for (const value of ["4640301100", "464-030-11-00", "464 030 11 00"]) {
    assert.equal(normalizeApnInput(value).canonical, "4640301100");
  }
  assert.equal(normalizeApnInput("000 001 23 45").canonical, "0000012345");
  assert.equal(formatApn("0000012345"), "000-001-23-45");
});

test("address normalization reuses generic punctuation, direction, suffix, and spacing rules", () => {
  const expected = "5836 PAWNEE DR";
  for (const value of ["5836 Pawnee Drive", " 5836   pawnee dr. "]) {
    assert.equal(normalizeAddress(value), expected);
  }
  assert.equal(normalizeAddress("100 North Main Street"), "100 N MAIN ST");
});

test("ordinary exact and formatted APNs resolve one canonical parcel", () => {
  for (const query of ["4640301100", "464-030-11-00"]) {
    const result = resolveLaMesaFrontDoor(query, dataset);
    assert.equal(result.state, "EXACT_MATCH");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].apn, "4640301100");
  }
});

test("exact and partial address queries preserve deterministic generic ranking", () => {
  const exact = resolveLaMesaFrontDoor("5836 Pawnee Drive", dataset);
  assert.equal(exact.state, "EXACT_MATCH");
  assert.equal(exact.candidates[0].apn, "4640301100");
  const houseAndStreet = resolveLaMesaFrontDoor("5836 Paw", dataset);
  assert.equal(houseAndStreet.state, "PARTIAL_MATCHES");
  assert.equal(houseAndStreet.candidates.some((candidate) => candidate.apn === "4640301100"), true);
  const streetOnly = resolveLaMesaFrontDoor("Pawnee", dataset);
  assert.equal(streetOnly.state, "PARTIAL_MATCHES");
  assert.equal(streetOnly.candidates.length > 0, true);
});

test("all missing-address rows remain APN-searchable without synthetic addresses", () => {
  const missing = canonical.filter((row) => row.address === null);
  assert.equal(missing.length, 663);
  for (const row of missing) {
    const result = searchParcelLookup(dataset.records, row.apn);
    assert.equal(result.state, "EXACT_MATCH", row.apn);
    assert.equal(result.candidates[0].record.address, null, row.apn);
    assert.match(result.candidates[0].record.displayAddress, /Address unavailable/);
  }
});

test("largest condo/common-address collision preserves APN and available unit identity", () => {
  const largest = duplicateReport.groups[0];
  assert.equal(largest.address, "5700 BALTIMORE DR");
  assert.equal(largest.candidateCount, 254);
  assert.equal(new Set(largest.candidates.map((candidate) => candidate.apn)).size, 254);
  assert.equal(largest.candidates.some((candidate) => candidate.unit), true);
  const result = resolveLaMesaFrontDoor(largest.address, dataset);
  assert.equal(result.state, "MULTIPLE_MATCHES");
  assert.equal(result.candidates.length, 10);
  assert.match(result.message ?? "", /Keep typing/);
});

test("cross-jurisdiction comparisons retain source jurisdiction and block La Mesa rules", () => {
  const result = resolveLaMesaFrontDoor("3740 Riviera Drive", dataset);
  assert.equal(result.state, "MULTIPLE_MATCHES");
  assert.equal(dataset.records.some((row) => row.normalizedAddress === "3740 RIVIERA DR" && row.jurisdictionId === "CITY_OF_SAN_DIEGO"), true);
  const outside = resolveLaMesaFrontDoor("4234411508", dataset).candidates[0];
  assert.equal(evaluateLaMesaFrontDoor(outside, dataset).answerCategory, "Source unavailable");
});

test("four jurisdiction-conflict rows are searchable and fail closed", () => {
  for (const apn of ["7601960217", "7601960218", "7601960219", "7601960220"]) {
    const candidate = resolveLaMesaFrontDoor(apn, dataset).candidates[0];
    assert.equal(candidate.canonicalScopeState, "JURISDICTION_UNRESOLVED");
    const evaluation = evaluateLaMesaFrontDoor(candidate, dataset);
    assert.equal(evaluation.answerCategory, "Source unavailable");
    assert.equal(evaluation.pathways.length, 0);
  }
});

test("unsupported TBD parcel resolves identity without a rule conclusion", () => {
  const candidate = resolveLaMesaFrontDoor("4645231900", dataset).candidates[0];
  assert.equal(candidate.apn, "4645231900");
  const evaluation = evaluateLaMesaFrontDoor(candidate, dataset);
  assert.equal(evaluation.answerCategory, "Outside current scope");
  assert.equal(evaluation.pathways.length, 0);
});

test("deterministic stratified 100-parcel sample resolves stable APN identity", () => {
  assert.equal(sampleReport.count, 100);
  for (const sample of sampleReport.samples) {
    const first = resolveLaMesaFrontDoor(sample.apn, dataset);
    const second = resolveLaMesaFrontDoor(sample.apn, dataset);
    assert.equal(first.state, "EXACT_MATCH", sample.apn);
    assert.equal(first.candidates[0].apn, sample.apn);
    assert.deepEqual(first, second);
  }
});

test("result limits and deliberate empty/short/malformed states are bounded", () => {
  const broad = resolveLaMesaFrontDoor("Baltimore", dataset);
  assert.equal(broad.candidates.length, 10);
  assert.match(broad.message ?? "", /Keep typing/);
  assert.equal(resolveLaMesaFrontDoor("", dataset).state, "INVALID_QUERY");
  assert.equal(resolveLaMesaFrontDoor("x", dataset).state, "INVALID_QUERY");
  assert.equal(resolveLaMesaFrontDoor("464-03", dataset).state, "INVALID_QUERY");
  assert.equal(resolveLaMesaFrontDoor("address that does not exist", dataset).state, "NO_MATCH");
});

test("search DTO is public identity only and regulatory data stays in the APN index", () => {
  const candidate = resolveLaMesaFrontDoor("4640301100", dataset).candidates[0];
  const publicText = JSON.stringify(candidate);
  assert.doesNotMatch(publicText, /homeowner|lead|survey|project|sha256|acquisition|file path|packet/i);
  assert.equal("baseZone" in candidate, false);
  assert.equal("mappedModifierIds" in candidate, false);
  assert.equal(dataset.evaluations[candidate.apn].baseZone, "R1");
});

test("compressed artifacts contain valid NDJSON and no private fields", () => {
  for (const name of ["serving-rows.ndjson.gz", "cross-jurisdiction-comparison.ndjson.gz", "evaluation-index.ndjson.gz"]) {
    const text = gunzipSync(readFileSync(`${ROOT}/${name}`)).toString("utf8");
    assert.doesNotThrow(() => text.trim().split("\n").forEach((line) => JSON.parse(line)));
    assert.doesNotMatch(text, /password|access_token|private_key|homeownerAnswers|consentReceipt|leadInfo/i);
  }
});
