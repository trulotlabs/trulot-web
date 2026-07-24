import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { findPilotLead } from "@/lib/elevate-review/batch";
import { mockChatAnswer } from "@/lib/elevate-review/mock";
import { buildLeadChatPrompt } from "@/lib/elevate-review/prompts";
import {
  chatRequestSchema,
  chatResponseSchema,
} from "@/lib/elevate-review/schema";
import {
  authorizeElevateRequest,
  elevateSafetyIdentifier,
  isElevateRateLimited,
  neutralApiError,
} from "@/lib/elevate-review/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = request.headers.get("x-elevate-interview-token") ?? "";
  if (!authorizeElevateRequest(request)) {
    return Response.json({ error: "Access denied." }, { status: 404 });
  }
  if (isElevateRateLimited(request)) {
    return Response.json({ error: "Please wait and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The request is invalid or too long." }, { status: 400 });
  }
  const totalCharacters = parsed.data.transcript.reduce(
    (sum, message) => sum + message.content.length,
    parsed.data.question.length + parsed.data.notes.length,
  );
  if (totalCharacters > 30_000) {
    return Response.json({ error: "This discussion has reached its length limit." }, { status: 413 });
  }

  const lead = findPilotLead(parsed.data.leadId);
  if (!lead) return neutralApiError(503);

  if (process.env.ELEVATE_INTERVIEW_MOCK === "true") {
    return Response.json(mockChatAnswer(lead, parsed.data.question));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return neutralApiError(503);

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      safety_identifier: elevateSafetyIdentifier(token),
      instructions: buildLeadChatPrompt(lead),
      input: [
        ...parsed.data.transcript.slice(-12).map(({ role, content }) => ({
          role,
          content,
        })),
        {
          role: "user" as const,
          content: [
            `Current decision: ${parsed.data.decision ?? "not selected"}.`,
            `Current notes: ${parsed.data.notes || "none"}.`,
            parsed.data.question,
          ].join("\n"),
        },
      ],
      text: {
        format: zodTextFormat(chatResponseSchema, "elevate_lead_chat_response"),
      },
    });
    if (!response.output_parsed) return neutralApiError();
    return Response.json(chatResponseSchema.parse(response.output_parsed));
  } catch (error) {
    console.error(
      "Elevate lead chat failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return neutralApiError();
  }
}
