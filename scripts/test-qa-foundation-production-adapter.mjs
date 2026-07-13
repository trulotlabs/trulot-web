import assert from "node:assert/strict";

import {
  createSupabaseQueryRunner,
  describeNonJsonOutput,
  extractRows,
} from "./qa-foundation-production.mjs";

function makeRunner(output) {
  return createSupabaseQueryRunner({
    runCommand: () => output,
    supabaseBin: "supabase",
    verifyMode: "linked",
    supabaseWorkdir: "/tmp/trulot-linked",
    dbUrl: "",
  });
}

{
  const runner = makeRunner(JSON.stringify([{ ok: 1 }]));
  assert.deepEqual(runner.query("select 1 as ok;"), [{ ok: 1 }]);
  assert.equal(runner.queryRow("select 1 as ok;", "ok"), 1);
}

{
  const runner = makeRunner(JSON.stringify({ rows: [{ ok: 1 }] }));
  assert.deepEqual(runner.query("select 1 as ok;"), { rows: [{ ok: 1 }] });
  assert.equal(runner.queryRow("select 1 as ok;", "ok"), 1);
}

{
  const runner = makeRunner(JSON.stringify([]));
  assert.throws(() => runner.queryRow("select 1 as ok;", "ok"), /Expected at least one row/);
}

{
  assert.throws(
    () => extractRows({ data: [{ ok: 1 }] }),
    /unsupported shape/i,
  );
}

{
  const runner = makeRunner("┌ table output");
  assert.throws(
    () => runner.query("select 1 as ok;"),
    /Supabase CLI returned non-JSON output in linked verification mode\. First non-whitespace character: "┌"\. Output length: 14\./,
  );
}

{
  const diagnostic = describeNonJsonOutput("  \nfoo", "db-url");
  assert.match(diagnostic, /db-url verification mode/);
  assert.match(diagnostic, /First non-whitespace character: "f"/);
}

console.log("qa-foundation-production adapter tests passed");
