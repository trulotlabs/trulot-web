import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { findPilotLead } from "@/lib/elevate-review/batch";
import { sanitizedElevateDiagnostic } from "@/lib/elevate-review/diagnostics";
import { mockEnrichment } from "@/lib/elevate-review/mock";
import {
  buildOutreachRepairInput,
  OUTREACH_FAILURE_MESSAGE,
  resolveOutreachGeneration,
} from "@/lib/elevate-review/outreach-reliability";
import { buildContactEnrichmentPrompt } from "@/lib/elevate-review/prompts";
import {
  enrichmentModelResultSchema,
  enrichmentRequestSchema,
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
  const parsed = enrichmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The request is invalid." }, { status: 400 });
  }

  const lead = findPilotLead(parsed.data.leadId);
  if (!lead) return neutralApiError(503);

  if (process.env.ELEVATE_INTERVIEW_MOCK === "true") {
    return Response.json(mockEnrichment(lead));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return neutralApiError(503);

  try {
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 });
    const resolution = await resolveOutreachGeneration(
      lead,
      async ({ repairCategories }) => {
        const response = await client.responses.parse({
          model,
          store: false,
          max_output_tokens: 5000,
          safety_identifier: elevateSafetyIdentifier(token),
          instructions: buildContactEnrichmentPrompt(lead),
          input: buildOutreachRepairInput(repairCategories),
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"],
          text: {
            format: zodTextFormat(
              enrichmentModelResultSchema,
              "elevate_contact_enrichment",
            ),
          },
        });
        if (
          response.status !== "completed" ||
          response.incomplete_details ||
          !response.output_parsed
        ) {
          throw new Error("IncompleteResponse");
        }
        return response.output_parsed;
      },
    );
    if (!resolution.ok) {
      console.warn("Elevate outreach generation rejected:", {
        categories: resolution.categories,
      });
      return Response.json(
        { error: OUTREACH_FAILURE_MESSAGE },
        { status: 502 },
      );
    }
    if (resolution.strategy !== "initial") {
      console.warn("Elevate outreach generation recovered:", {
        strategy: resolution.strategy,
        categories: resolution.repairedCategories,
      });
    }
    return Response.json(resolution.result);
  } catch (error) {
    console.error(
      "Elevate contact enrichment failed:",
      sanitizedElevateDiagnostic(error),
    );
    return Response.json(
      { error: OUTREACH_FAILURE_MESSAGE },
      { status: 502 },
    );
  }
}
