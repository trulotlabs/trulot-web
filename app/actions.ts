"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export type EarlyAccessState = {
  status: "idle" | "success" | "error";
  message: string;
};

const earlyAccessSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  propertyQuestion: z.string().trim().max(500),
  company: z.string().max(0),
});

export async function requestEarlyAccess(
  _previousState: EarlyAccessState,
  formData: FormData,
): Promise<EarlyAccessState> {
  const parsed = earlyAccessSchema.safeParse({
    email: formData.get("email"),
    propertyQuestion: formData.get("propertyQuestion") ?? "",
    company: formData.get("company") ?? "",
  });

  if (!parsed.success) {
    if (formData.get("company")) {
      return {
        status: "success",
        message: "Your request has been received.",
      };
    }

    return {
      status: "error",
      message: "Enter a valid email address and try again.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Early access capture is missing Supabase configuration.");
    return {
      status: "error",
      message: "We couldn’t save your request. Please try again shortly.",
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.from("early_access_requests").insert({
    email: parsed.data.email,
    property_question: parsed.data.propertyQuestion || null,
  });

  if (error && error.code !== "23505") {
    console.error("Early access request failed:", error.code);
    return {
      status: "error",
      message: "We couldn’t save your request. Please try again shortly.",
    };
  }

  return {
    status: "success",
    message: "Your request has been received.",
  };
}
