# Verified residential standards production runtime

This packet compiles the exact sealed 213-record display-safe membership into a
server-only deployment artifact. It does not authorize production display,
parcel application, compliance, entitlement, unit counts, or capacity.

## Request-time dependency boundary

| Dependency | Prior role | Final classification |
| --- | --- | --- |
| `app/parcel/san-diego/[slug]/page.tsx` | Canonical server route and optional insertion point | Production-safe |
| `lib/rs17-shadow-gate.ts` | Local/staging gate and unconditional production denial | Production-safe; production remains denied |
| `lib/rs17-runtime-shadow.ts` | Read an absolute input file, invoke rehearsal consumer, render | Production-safe after conversion to compiled resolver |
| `scripts/rs17-parameter-rehearsal/adapter.ts` | `node:child_process` Python bridge | Build/review and rehearsal only |
| `scripts/rs17-parameter-rehearsal/gate.py` | Approved Python consumer | Build/review and equivalence only |
| `scripts/residential-standards-review/gate.py` | Review seal and authority-byte validation | Build/review only |
| `scripts/high-value-residential-review/consumer.py` | Packet 17 seal validation | Build/review only |
| `/private/tmp/trulot-*/...` source corpus | Authoritative PDF/HTML bytes used for source drift checks | Build/review only; prohibited at request time |
| `TRULOT_RS17_SHADOW_INPUT` / `TRULOT_VERIFIED_STANDARDS_INPUT` | Absolute request-time input paths | Removed from request-time runtime |
| `data/runtime/verified-residential-standards-v2.json` | Not previously present | Production-safe immutable serving bundle |
| `lib/verified-standards-runtime.ts` | Not previously present | Production-safe pure TypeScript consumer |
| `lib/verified-standards-display.ts` | Previously under rehearsal scripts | Production-safe server-only renderer |

No production-serving import reaches a rehearsal script, Python, a child
process, an arbitrary filesystem path, or the source-document corpus.

## Compiled artifact

The generated bundle contains the 97-record baseline seal plus the Packet 17
116-record seal. Every entry retains its original canonical reviewed record
string and SHA-256. Shared authority metadata and public source identity are
stored once. The artifact also records:

- schema and release versions;
- exact ordered membership and its fingerprint;
- record count;
- source-evidence manifest and fingerprint;
- source-review decision identities;
- original record fingerprints;
- the outer canonical bundle fingerprint.

The runtime requires all generated constants in
`lib/verified-standards-runtime-seal.ts` to match. It rejects malformed data,
wrong schema/release versions, count changes, membership changes, source
manifest drift, original-record hash failures, partition changes, and outer
bundle drift.

## Offline generation

Generation deliberately remains evidence-heavy and offline:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/verified-standards-runtime/build.py \
  --source-paths /absolute/path/to/reviewed-source-paths.json \
  --write
```

To verify committed outputs without rewriting them:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/verified-standards-runtime/build.py \
  --source-paths /absolute/path/to/reviewed-source-paths.json \
  --check
```

Two builds from unchanged reviewed inputs must produce byte-identical bundle,
receipt, and TypeScript seal files.

## Runtime semantics

The TypeScript consumer performs exact zone-code selection from the sealed
membership. It does not derive admission from review-state labels. Structured
expressions, scalar values, units, conditions, unresolved predicates, source
citations, applicability fields, and the original sealed records are returned
without evaluation. Split zones remain separate groups. Unsupported zones,
inside/unknown Coastal context, wrong operative profiles, unmapped or
indeterminate zoning, malformed bundles, and unreviewed rule requests fail
closed.

The canonical Parcel Page catches any optional standards failure and continues
without the standards section.

## Production cohort discovery

The established production read path was queried through the deployed
`/api/search` endpoint for known evidence addresses and broader terms including
`47TH`, `IONA`, `ADIRONDACK`, `92101`, and `MAIN`. Each request returned HTTP
200 with an empty result set. A direct request for the known rehearsal APN
`5490330700` also returned the existing parcel-not-found response.

No rehearsal APN has therefore been promoted into a production cohort. The
smallest next cohort packet must first identify at least one APN that resolves
through current production Parcel Truth, then bind it to independently sealed
Base Zoning V2 evidence. Legacy `zone_name`/`base_zone` alone is insufficient
for production authorization.

## Release and rollback control

`data/runtime/verified-standards-release.json` is an auditable deploy-time
control and is committed in the `off` state. The pure release evaluator proves
the intended future condition: exact Vercel production identity, exact release
version, nonempty sealed cohort version, valid bundle, valid cohort membership,
supported parcel and zoning, and approved applicability must all be true.

The active product gate still rejects every production request because no
production cohort exists. A later bounded cohort packet must wire its sealed
artifact into the active gate. The established deployment path is GitHub
`main` to the existing Vercel project. Its deploy-time rollback procedure is to
restore the prior committed `off` control through that path or use Vercel's
deployment rollback to the preceding OFF deployment. Operator access to the
rollback action must be proven before enablement.

## Security boundary

The runtime bundle contains public regulatory citations and reviewed serving
metadata. It contains no credentials, source-path manifest, `/private/tmp`
path, user home path, raw Municipal Code corpus, environment variable name,
private diagnostic, or production parcel record. It is imported only through
the dynamically loaded server path; no client component imports it.
