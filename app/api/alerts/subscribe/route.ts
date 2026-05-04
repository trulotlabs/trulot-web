import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/alerts/subscribe
 *
 * Accepts a subscriber signup from the Alerts CTA modal.
 * Writes to alerts_subscribers in Supabase.
 *
 * Body: { email, role, location }
 * Returns: { success: true } or { error: string }
 *
 * Notes for Brooks:
 * - This route does NOT trigger notifications.
 * - It does NOT validate role/location against the jobs taxonomy.
 * - It only records the subscription. Matching and delivery is handled separately.
 */

interface SubscribeBody {
  email: string;
  role?: string;
  location?: string;
}

export async function POST(req: Request) {
  let body: SubscribeBody;

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, role, location } = body;

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const { error } = await supabase.from("alerts_subscribers").insert({
    email: email.trim().toLowerCase(),
    role: role?.trim() ?? null,
    location: location?.trim() ?? null,
  });

  if (error) {
    // Duplicate email is not a hard error — silently succeed
    if (error.code === "23505") {
      return Response.json({ success: true, note: "Already subscribed" });
    }
    return Response.json({ error: "Failed to subscribe", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

// GET not supported
export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
