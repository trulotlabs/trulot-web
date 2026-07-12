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

async function main() {
  const { data, error } = await supabase
    .from("trulot_permit_linkage_report_v2")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      [
        "Permit Linkage Reporting V2 is unavailable or not readable.",
        "Apply the V2 migration and refresh the V2 reporting materialized views before running this script.",
        `Supabase error: ${error.message}`,
      ].join(" "),
    );
  }

  if (!data) {
    throw new Error(
      "Permit Linkage Reporting V2 returned no rows. Verify the V2 view exists and is readable.",
    );
  }

  const refreshedAt = data.cache_last_refreshed_at ?? null;
  const status = refreshedAt ? "ready" : "unrefreshed";
  const message = refreshedAt
    ? "Permit Linkage Reporting V2 is available."
    : "Permit Linkage Reporting V2 is installed but the cache has not been backfilled and stamped yet.";

  console.log(
    JSON.stringify(
      {
        status,
        message,
        report: data,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
