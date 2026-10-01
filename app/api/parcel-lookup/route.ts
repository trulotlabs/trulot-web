import { invalidParcelLookupResponse, parcelLookupProductionEnabled } from "@/lib/parcel-lookup-production-v0";
import { runParcelLookupProduction } from "@/lib/parcel-lookup-production-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!parcelLookupProductionEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => key !== "q" && key !== "limit")
    || url.searchParams.getAll("q").length !== 1
    || url.searchParams.getAll("limit").length > 1
  ) {
    return Response.json(invalidParcelLookupResponse("Request parameters are invalid."), {
      status: 400,
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const query = url.searchParams.get("q") ?? "";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  const outcome = await runParcelLookupProduction({ query, limit });
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
