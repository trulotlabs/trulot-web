import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

export type PrivatePropertyIntelligenceDto = {
  apn: string;
  preliminaryDwellingState: "SINGLE_FAMILY_LIKELY" | "MULTIFAMILY_LIKELY" | "CONDO" | "UNKNOWN" | "CONFLICTING";
  currentnessState: string;
  provenanceClass: "COMPOSED_PROPERTY_INTELLIGENCE";
  activeChange: boolean;
  laterChange: boolean;
  boundedAduEvidence: "FINALED" | "ACTIVE" | "EXPIRED_OR_WITHDRAWN" | "UNKNOWN" | "NONE";
  accessoryStructureCandidate: boolean;
  conflictTypes: string[];
  questionClass: string;
  publicUseClassification: string;
  sourceVersionReceipt: { assessor: string; permit: string; structure: string; composition: string };
};
export type PrivateLookupResult = { status: "FOUND"; value: PrivatePropertyIntelligenceDto } | { status: "NOT_FOUND" } | { status: "UNAVAILABLE"; reason: string };
export type PrivateAuthorization = { authenticated: true; ownerOrgId: string };
type Shard = { prefix: string; path: string; rows: number; firstApn: string; lastApn: string; bytes: number; sha256: string };
type Manifest = { schemaVersion: string; runtimeVersion: string; compositionVersion: string; rowCount: number; uniqueApns: number; shardCount: number; apnFingerprint: string; artifactFingerprint: string; privateOnly: boolean; shards: Shard[] };
const EXPECTED_APN_FINGERPRINT="e247b647ecff8bb0f138e55f7e362f35c301ac591f8f1e5c5c3538ab1433a97f";
const EXPECTED_ARTIFACT_FINGERPRINT="0d442709decaff6b8e5c0906c165f1e0af1d6720b7670096bd84efe7b417a410";
export type PrivateRuntimeMetric = "lookup_found" | "lookup_not_found" | "lookup_unavailable" | "manifest_failure" | "shard_failure" | "version_mismatch";
export class PrivatePropertyIntelligenceRuntime {
  private manifest: Manifest | null = null; private unavailable: string | null = null;
  private cache = new Map<string, Map<string, PrivatePropertyIntelligenceDto>>();
  private root: string; private metric: (name: PrivateRuntimeMetric) => void; private maxCachedShards: number;
  constructor(root: string, metric: (name: PrivateRuntimeMetric) => void = () => {}, maxCachedShards = 8) { this.root=root; this.metric=metric; this.maxCachedShards=maxCachedShards; }
  private async initialize(): Promise<boolean> {
    if (this.manifest) return true; if (this.unavailable) return false;
    try {
      const m = JSON.parse(await readFile(join(this.root,"manifest.json"),"utf8")) as Manifest;
      if (m.schemaVersion !== "private-property-intelligence-runtime-v0" || m.compositionVersion !== "san-diego-property-intelligence-composition-v0") { this.metric("version_mismatch"); throw new Error("unsupported version"); }
      if (!m.privateOnly || m.rowCount !== 393733 || m.uniqueApns !== 393733 || m.shardCount !== m.shards.length || m.apnFingerprint !== EXPECTED_APN_FINGERPRINT || m.artifactFingerprint !== EXPECTED_ARTIFACT_FINGERPRINT) throw new Error("manifest invariant failure");
      const prefixes = new Set(m.shards.map(x=>x.prefix)); if (prefixes.size !== m.shards.length) throw new Error("duplicate shard"); this.manifest=m; return true;
    } catch (e) { this.unavailable=e instanceof Error?e.message:"manifest failure";this.metric("manifest_failure");return false; }
  }
  private async loadShard(prefix: string): Promise<Map<string, PrivatePropertyIntelligenceDto>> {
    const cached=this.cache.get(prefix); if(cached){this.cache.delete(prefix);this.cache.set(prefix,cached);return cached;}
    const meta=this.manifest!.shards.find(x=>x.prefix===prefix); if(!meta) return new Map();
    const bytes=await readFile(join(this.root,meta.path));if(createHash("sha256").update(bytes).digest("hex")!==meta.sha256)throw new Error("corrupt shard");
    const map=new Map<string,PrivatePropertyIntelligenceDto>();let prev="";
    for(const line of gunzipSync(bytes).toString("utf8").trimEnd().split("\n")){const x=JSON.parse(line) as PrivatePropertyIntelligenceDto;if(x.apn<=prev||map.has(x.apn))throw new Error("duplicate or unsorted APN");prev=x.apn;map.set(x.apn,x);}
    if(map.size!==meta.rows)throw new Error("shard population mismatch");this.cache.set(prefix,map);while(this.cache.size>this.maxCachedShards)this.cache.delete(this.cache.keys().next().value!);return map;
  }
  async lookup(apn: string, auth: PrivateAuthorization): Promise<PrivateLookupResult> {
    if(!auth?.authenticated||!auth.ownerOrgId)return {status:"UNAVAILABLE",reason:"authorization required"};
    if(!/^\d{10}$/.test(apn))return {status:"NOT_FOUND"};if(!await this.initialize()){this.metric("lookup_unavailable");return {status:"UNAVAILABLE",reason:this.unavailable!};}
    try{const value=(await this.loadShard(apn.slice(0,3))).get(apn);if(!value){this.metric("lookup_not_found");return {status:"NOT_FOUND"};}this.metric("lookup_found");return {status:"FOUND",value};}
    catch(e){this.metric("shard_failure");this.metric("lookup_unavailable");return {status:"UNAVAILABLE",reason:e instanceof Error?e.message:"shard failure"};}
  }
  toPrivateV4(dto: PrivatePropertyIntelligenceDto){return {preliminaryDwellingState:dto.preliminaryDwellingState,dwellingStateProvenance:dto.preliminaryDwellingState==="UNKNOWN"?"UNKNOWN":"RECORDED",currentnessState:dto.currentnessState,activeChange:dto.activeChange,explicitAduPermitEvidence:dto.boundedAduEvidence,accessoryStructureCandidate:dto.accessoryStructureCandidate,unresolvedConflictTypes:dto.conflictTypes};}
}
