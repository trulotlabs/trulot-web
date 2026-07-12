import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALERTS_SIGNUP_STATUS = {
  status: "unavailable",
  reason: "alerts_subscribers backing object is not verifiable in the linked remote schema baseline",
  disposition: "Future stub isolated pending verified schema history and abuse-control review",
} as const;

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

  void supabase;
  void role;
  void location;

  return Response.json(
    {
      success: false,
      error: "Alerts signup is not available in the current verified environment",
      alerts_status: ALERTS_SIGNUP_STATUS,
    },
    { status: 503 },
  );
}

// GET not supported
export async function GET() {
  return Response.json(
    {
      error: "Method not allowed",
      alerts_status: ALERTS_SIGNUP_STATUS,
    },
    { status: 405 },
  );
}
