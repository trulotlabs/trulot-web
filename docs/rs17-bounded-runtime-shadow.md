# Bounded RS-1-7 runtime shadow

Baseline verified clean at start: `/Users/ops/trulot-web-parcel`, branch
`codex/trulot-parcel-v1-hardening`, HEAD
`bd5d758a2180bd93e95b4632aaab1968acf4343f`, tree
`5109b0d51a8a5aa8c7af0b6b83aa6d58bacaf560`.

## Runtime path and scope

The force-dynamic `/parcel/san-diego/[slug]` page still calls
`getParcelPageV1Result()` in `lib/parcel-page-v1.ts`. That loader supplies the
canonical parcel truth, source statuses, identity, zoning presentation and other
page facts. Invalid, absent, unavailable and redirected requests retain their
existing handling. Metadata and the loader are unchanged.

After successful canonical-slug resolution, the server page checks the gate. Only
when enabled does it dynamically import `lib/rs17-runtime-shadow.ts`. The resulting
optional section sits after base zoning and before current programs/overlays.
Existing sections, including the published-standards placeholder, remain intact.
Removing this optional call, import and JSX insertion restores the prior page.

The adapter requires supported canonical parcel truth and an exact RS-1-7 base
code. An explicit local input provides APN-bound V2 parcel/zoning responses,
context, authority observation and absolute paths to previously acquired source
files. No serialized parameter values or prebuilt HTML are accepted. It invokes
the Packet 13 consumer, which verifies the approved evidence through its existing
Python gate, then passes only its result to the Packet 14 renderer/allowlist.
No parallel rules engine or assumed Coastal/application/airport context is added.

The Packet 13 subprocess path now resolves from repository-root working directory,
because bundled Next.js modules do not retain the source module's `__dirname`.
Its verification, selection and parameter logic is unchanged. Start local review
from the repository root. Missing Python, files or dependencies fail closed.

Canonical V1 currently exposes a base-code presentation fact, not authoritative
V2 split-zone truth. This bounded insertion therefore rejects split zones or a
V2 zone that disagrees with the current page. It does not replace the page's zoning
identity, synthesize missing assignments, or blend standards.

## Hard-disabled gate

All conditions must hold:

- `TRULOT_RS17_STANDARDS_SHADOW=1` exactly;
- `NODE_ENV` is `development` or `test`;
- neither `VERCEL` nor `CI` is set to a nonempty value;
- an explicit absolute `TRULOT_RS17_SHADOW_INPUT` names valid local inputs.

Production remains disabled regardless of opt-in. Missing/unknown environment
values fail closed. The adapter repeats the gate before any file access or
consumer invocation. The page catches optional import/adapter failures.
No hostname inference, remote configuration, database flag, request parameter,
cookie, client preference, NEXT_PUBLIC flag, or persistent enablement is used.
No environment file was created or changed. This is not authorization for public
display; the supplied review launcher binds both servers to loopback only.

## Display and uncertainty

The unchanged approved renderer exposes only minimum lot width 50 ft, minimum
corner-lot width 55 ft, and minimum depth 95 ft. Both widths remain visible for
unknown corner context, with the corner condition and required qualifier.
An amber banner identifies local review using supplied evidence/context.
Unknown Coastal context displays an unresolved-version message and no values.
Source drift is unavailable; invalid identity/zoning/input silently omits the
optional section. Provenance uses native nested disclosure; hashes remain deep.
No measurements, legal-lot decision, parcel compliance or capacity are calculated.

## Reproduce safely

Use an existing local public-source manifest of the kind used by Packet 13.
From the repository root:

```sh
node scripts/test-rs17-runtime-shadow.mjs /absolute/source-paths.json /tmp/rs17-runtime-review
node scripts/rs17-local-review.mjs /tmp/rs17-runtime-review/input.json on
```

Open `http://127.0.0.1:4380/parcel/san-diego/apn-3113333800`; it redirects to the
fixture's canonical slug. The launcher supplies an in-memory loopback data API
at port 4379 and a fake, noncredential API key. It runs the actual Next.js route
and loader; the displayed parcel is a fixture, not evidence about a real parcel.
No real Supabase endpoint or database is contacted. Stop with Ctrl-C.
Run the launcher with `off` (or without `on`) for the normal page.
The temporary input's context may be changed to `unknown` Coastal and the page
reloaded to inspect the fail-closed state. No generated input is checked in.

## Validation

- Runtime suite: 20 environment/flag combinations; hosted/CI guards; no adapter
  call while disabled; disabled markup identical byte-for-byte to authorized
  baseline; insertion order; missing/throwing optional adapter; actual consumer;
  unknown Coastal, drift, identity/APN mismatch, indeterminate zoning and bad input.
- Packet 13: 22 fixtures, 21 excluded records and isolation checks pass.
- Packet 14: 15 display states, 21 exclusions, four mutations, deterministic order
  and current/shadow preservation pass.
- TypeScript: `node_modules/.bin/tsc --noEmit --incremental false` passes.
- All 20 prior safe regression suites pass. Full lint reports three pre-existing
  errors (Packet 13/14 test-loader `module` bindings and the nearby-parcels
  explicit-any) and six warnings. The previous packet report understated this
  baseline as one error. Changed/new runtime files introduce no lint findings.

## Actual browser review

The agent-browser CLI was unavailable; the desktop browser inspected the actual
loopback Next.js route. This was not a file-preview workaround or a replacement
static page. Desktop screenshot/DOM inspection showed all three values, qualifier,
visible corner condition and placement before existing program cards. Clicking
the first disclosure and keyboard Enter on the nested disclosure exposed source
and hash details. No browser errors/warnings were recorded. Unknown Coastal
removed all values and showed unresolved context. Restarting with opt-in off
removed the entire shadow section while retaining base zoning and the existing
published-standards placeholder. Mobile sizing was not tested.

Both review servers were stopped after verification. No push, deployment,
production enablement, authoritative-evidence change or original-checkout edit
was performed. Packet 15 closure authorizes the single local commit
`Add bounded RS-1-7 runtime shadow`.

Original-checkout preservation was verified by comparing branch, HEAD, short
status, staged/unstaged diffs, untracked inventory and SHA-256 hashes of all 57
tracked/nonignored untracked files against the initial snapshot; all match.

## Packet 15 commit closure

The nine-file diff was reviewed against the authorized starting HEAD. No
unrelated modifications, production/deployment configuration changes, new
compliance/capacity logic, or canonical routing/SEO changes were found.
The existing consumer and renderer restrict output to the three approved
RS-1-7 parameters; the 21 excluded standards remain blocked.

These commands were rerun successfully from the repository root at closure:

```sh
node scripts/test-rs17-runtime-shadow.mjs /private/tmp/trulot-closure-parent/source-paths.json
node scripts/rs17-parameter-rehearsal/test.mjs /private/tmp/trulot-closure-parent/source-paths.json
node scripts/rs17-display-shadow/test.mjs /private/tmp/trulot-closure-parent/source-paths.json /private/tmp/rs17-packet15-closure-display
node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

`npm run lint` exits 1 with the exact unchanged baseline below. All six affected
files were verified identical to the starting commit; none is a Packet 15 file.

| Severity | File and position | Finding |
| --- | --- | --- |
| Error | scripts/rs17-display-shadow/test.mjs:14:2 | @next/next/no-assign-module-variable: binding `module` |
| Error | scripts/rs17-parameter-rehearsal/test.mjs:15:3 | @next/next/no-assign-module-variable: binding `module` |
| Error | supabase/functions/nearby-parcels/index.ts:125:67 | @typescript-eslint/no-explicit-any |
| Warning | app/api/jobs-feed/route.ts:114:9 | unused `isEarlyReview` |
| Warning | lib/infer-phase.ts:163:10 | unused `descSignal` |
| Warning | lib/infer-phase.ts:227:9 | unused `signals` |
| Warning | lib/infer-phase.ts:237:9 | unused `primaryLabel` |
| Warning | lib/infer-phase.ts:261:9 | unused `isDemoDesc` |
| Warning | scripts/triage-overlay-integrity.mjs:76:10 | unused `parseRowsOutput` |

Browser evidence above is the completed implementation-turn review, not a new
closure browser run. Desktop rendering, visible qualifier/corner condition,
click/Enter disclosure, provenance, unknown-Coastal suppression and shadow-off
behavior passed; mobile was not performed. Exact baseline markup equality is
established by the runtime test, while browser inspection confirmed the absent
shadow and retained existing content. Browser logs recorded no errors/warnings.
