import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { createHash } from "node:crypto";
import { buildElevateInterviewerPrompt } from "@/lib/elevate-interview/prompt";
import { getMockInterviewTurn } from "@/lib/elevate-interview/mock";
import {
  interviewRequestSchema,
  interviewTurnSchema,
} from "@/lib/elevate-interview/schema";
import { isValidElevateToken } from "@/lib/elevate-interview/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || "private-pilot";
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const interviewToken = request.headers.get("x-elevate-interview-token");
  if (!isValidElevateToken(interviewToken)) {
    return Response.json({ error: "Access denied." }, { status: 404 });
  }

  if (isRateLimited(request)) {
    return Response.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }

  const parsed = interviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The interview history is invalid or too long." },
      { status: 400 },
    );
  }

  const totalCharacters = parsed.data.transcript.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  if (totalCharacters > 40_000) {
    return Response.json(
      { error: "This interview has reached its length limit. Please export the current record." },
      { status: 413 },
    );
  }

  if (process.env.ELEVATE_INTERVIEW_MOCK === "true") {
    return Response.json(getMockInterviewTurn(parsed.data.transcript));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    return Response.json(
      { error: "The interview service is not configured. Please contact TruLot." },
      { status: 503 },
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      safety_identifier: createHash("sha256")
        .update(`elevate:${interviewToken}`)
        .digest("hex")
        .slice(0, 64),
      instructions: buildElevateInterviewerPrompt(),
      input: parsed.data.transcript.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      text: {
        format: zodTextFormat(interviewTurnSchema, "elevate_interview_turn"),
      },
    });

    if (!response.output_parsed) {
      return Response.json(
        { error: "The interview response was incomplete. Please try again." },
        { status: 502 },
      );
    }

    return Response.json(interviewTurnSchema.parse(response.output_parsed));
  } catch (error) {
    console.error(
      "Elevate interview request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: "The interview service had a temporary problem. Your answer is still here." },
      { status: 502 },
    );
  }
}
