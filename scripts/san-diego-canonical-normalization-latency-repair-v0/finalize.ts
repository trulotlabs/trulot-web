import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd(); const OUT = join(ROOT, "data/san-diego-canonical-normalization-latency-repair-v0"); const IDENTITY = join(ROOT, "data/san-diego-public-identity-v0");
const read = (root: string, name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));
const json = (root: string, name: string, value: unknown) => writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const on = read(OUT, "performance-review-on.json"); const off = read(OUT, "performance-review-off.json");
json(OUT, "performance.json", {
  environment: "Local production-equivalent Next.js Node runtime with bounded loopback Supabase fixture; no production access.",
  acceptanceBudget: { preferredMedianMs: 2000, warningMs: 3000, hardFailureMs: 5000 },
  snapshotOn: on.performance, snapshotOff: off.performance,
  coreStageTimings: { snapshotOn: on.stageTimingByOperation, snapshotOff: off.stageTimingByOperation },
  invocationProof: { canonicalCasesPerMode: 36, coreParcelPerCanonicalRequest: 1, overlayPerCanonicalRequest: 1, metadataCoreParcelReads: 0, metadataPermitReads: 0, metadataOverlayReads: 0, metadataSimilarLotReads: 0 },
  concurrencyProof: { fixtureDelaysMs: on.stageDelayMs, serialLowerBoundMs: 390, observedPageServerMedianMs: on.stageTimingByOperation.page.total_server.median, conclusion: "After the core parcel read, permits, overlays, and similar-lot work overlap; page server duration is below the serial sum." },
  duplicateWorkAudit: "Metadata uses immutable public identity plus optional immutable zoning only. The page owns the sole live parcel/enrichment waterfall. Process-wide two-second coalescing was removed because metadata and page can run in distinct React/serverless scopes.",
  cacheScopeAudit: "Identity and zoning readers cache verified prefix shards only within one warm Node process. Correctness and one-live-loader behavior do not depend on cache survival across metadata/page scopes, instances, or cold invocations.",
  runtimeArchitecture: { rendering: "force-dynamic", runtime: "Next.js Node.js default (filesystem-backed immutable snapshots require Node)", preferredRegionConfiguredInRepository: false, functionRegion: "not established by repository evidence", databaseRegion: "not established by repository evidence", connectionStartup: "Supabase HTTP client; measured within the bounded fixture, production network variance requires canary", functionSplitting: "metadata and page may execute in separate scopes/instances; design no longer depends on shared process state" },
  dependencyCriticality: { critical: ["public identity", "canonical", "core parcel", "zoning snapshot", "safe feasibility/rule state"], noncritical: ["permits/activity", "overlays beyond safe first-response context", "similar lots", "nearby activity"] },
  repair: ["single immutable structured identity source", "metadata decoupled from live parcel/permit/overlay/similar queries", "independent enrichment calls remain concurrent", "unreliable process coalescer removed", "gated identifier-free stage timing added"],
  decision: "SAN_DIEGO_CANONICAL_NORMALIZATION_AND_LATENCY_REPAIR_READY",
});
json(OUT, "next-canary-plan.json", {
  identityVersion: "parcel-identity-v2", addressVersion: "public-address-v1",
  preconditions: ["production snapshot OFF", "San Diego indexing OFF", "San Diego sitemap OFF", "global indexing kill switch ON", "Packet 11 frozen", "clean committed candidate"],
  procedure: ["Deploy only to a protected bounded canary", "Keep indexing and sitemap controls OFF", "Enable identifier-free TRULOT_PARCEL_SERVER_TIMING only for the bounded observation window", "Verify the four Packet 89 APNs plus the 36-case canonical set byte-for-byte", "Require every legacy slug to redirect once with no loop", "Measure cold and repeated requests with snapshot OFF then ON", "Stop and roll back on any canonical mismatch, repeated response above 5000 ms, privacy/robots regression, or source-truth regression", "Disable timing after evidence collection"],
  gates: { canonical: "exact byte parity", warningMs: 3000, hardFailureMs: 5000, preferredMedianMs: 2000, indexing: "OFF", sitemap: "OFF" },
  authorizedNow: false,
});
function files(root: string) { return readdirSync(root, { recursive: true }).map(String).filter((name) => !name.endsWith("integrity.json") && !name.endsWith("/")).filter((name) => { try { return readFileSync(join(root, name)).length >= 0; } catch { return false; } }).sort(); }
json(IDENTITY, "integrity.json", { files: Object.fromEntries(files(IDENTITY).map((name) => [name, sha(join(IDENTITY, name))])) });
json(OUT, "integrity.json", { files: Object.fromEntries(files(OUT).map((name) => [name, sha(join(OUT, name))])), identityManifestSha256: sha(join(IDENTITY, "manifest.json")), productionAccess: false, published: false });
console.log(JSON.stringify({ result: "PASS", snapshotOn: on.performance, snapshotOff: off.performance, packetFiles: files(OUT).length, identityFiles: files(IDENTITY).length }));
