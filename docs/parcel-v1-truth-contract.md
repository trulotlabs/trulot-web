# Parcel V1 truth contract

`lib/parcel-truth.ts` separates source availability, fact truth, derivation, and
provenance. `getParcelPageV1Result().truth` applies it only to core identity,
overlay membership, and direct permit history. Existing data/status fields remain
presentation-compatible; new scoped consumers should use `truth`.

- Unavailable is not false. Error is not absence. Null is not zero.
- Supported negative membership requires a successfully validated source.
- A successful empty core query supports `parcel.value = false`; query failures
  carry `unavailable` and null. Unevaluated downstream sources are explicit.
- Permit `supported` + `[]` means no linked records in this source, not no permits
  anywhere. Failure carries null. Partial evidence is not complete absence.
- Compatibility `data.permits.thisParcel` can be empty on failure for rendering;
  it is not a truth assertion. Read `truth.permits.state` before interpreting it.
- All overlay fields must be exact booleans. One invalid field invalidates the RPC.
  SDA remains unknown/conditional even when the raw observation is true or false.
- Provenance comes from source manifests and explicit source fields. Unknown or
  unverified metadata is null, never invented. A view rebuild is not a dataset
  effective date; permit event dates are not import timestamps. Legacy `freshness`
  strings remain compatibility display metadata, not canonical source vintage.
- Recorded facts, deterministic derivations, inference, and conditional statements
  remain distinct. Confidence is not provenance and does not prove source currency.
- `not_applicable` is reserved for an evaluated, supported applicability decision;
  none of these adapters invent such a decision. `partial` can retain known values.

No linkage algorithm, nearby search, stage inference, capacity rules, or source
completeness assessment is changed. Valid overlay booleans still rely on the
existing source-availability contract, not a new completeness guarantee.

Offline checks: `node scripts/test-parcel-truth.mjs` and
`node scripts/test-overlay-response.mjs` (mock only the database boundary).
