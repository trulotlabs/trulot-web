import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { findPilotLead } from "@/lib/elevate-review/batch";
import { mockEnrichment } from "@/lib/elevate-review/mock";
import { buildContactEnrichmentPrompt } from "@/lib/elevate-review/prompts";
import {
  enrichmentModelResultSchema,
  enrichmentRequestSchema,
  enrichmentResultSchema,
} from "@/lib/elevate-review/schema";
import {
  authorizeElevateRequest,
  elevateSafetyIdentifier,
  isElevateRateLimited,
  neutralApiError,
} from "@/lib/elevate-review/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const OUTREACH_SIGNATURE = "\n\nThank you,\nCesar\nElevate";

function safeElevateEmailBody(value: string) {
  const signatureIndex = value.search(
    /\n\s*(?:thank you,?\s*\n)?\s*cesar\b/i,
  );
  const content = (signatureIndex >= 0 ? value.slice(0, signatureIndex) : value)
    .replace(EMAIL_PATTERN, "")
    .replace(PHONE_PATTERN, "")
    .replace(/\s*[•|]\s*\(?optional\)?/gi, "")
    .trim();
  return `${content.slice(0, 4000 - OUTREACH_SIGNATURE.length)}${OUTREACH_SIGNATURE}`;
}

function sanitizedEnrichmentError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    return {
      name: error.name,
      status: error.status,
      code: error.code ?? null,
      type: error.type ?? null,
      param: error.param ?? null,
    };
  }
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return {
      name: "SchemaValidationError",
      issuePaths: error.issues
        .slice(0, 8)
        .map((issue) =>
          issue &&
          typeof issue === "object" &&
          "path" in issue &&
          Array.isArray(issue.path)
            ? issue.path.join(".")
            : "unknown",
        ),
    };
  }
  return {
    name: error instanceof Error ? error.name : "UnknownError",
  };
}

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
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      store: false,
      safety_identifier: elevateSafetyIdentifier(token),
      instructions: buildContactEnrichmentPrompt(lead),
      input:
        "Find the best currently public project contact for this lead and return only schema-supported facts with sources.",
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      text: {
        format: zodTextFormat(
          enrichmentModelResultSchema,
          "elevate_contact_enrichment",
        ),
      },
    });
    if (!response.output_parsed) return neutralApiError();
    const validated = enrichmentResultSchema.parse(response.output_parsed);
    return Response.json({
      ...validated,
      revisedDraftEmailBody: safeElevateEmailBody(
        validated.revisedDraftEmailBody,
      ),
    });
  } catch (error) {
    console.error("Elevate contact enrichment failed:", sanitizedEnrichmentError(error));
    return neutralApiError();
  }
}
