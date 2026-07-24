import {
  completedReviewExportSchema,
  type CompletedReviewExport,
  type PilotBatch,
  type SavedLeadReview,
} from "./schema";

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export function canonicalOpportunityValue(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function buildCompletedReviewExport(
  leads: PilotBatch,
  reviews: Record<string, SavedLeadReview>,
  generatedAt = new Date().toISOString(),
): CompletedReviewExport {
  return completedReviewExportSchema.parse({
    schemaVersion: 1,
    generatedAt,
    leads: leads.map((lead) => {
      const review = reviews[lead.leadId];
      const enrichment = review?.enrichment ?? null;
      return {
        leadId: lead.leadId,
        address: lead.address,
        projectDescription: lead.projectDescription,
        experimentType: lead.experimentType,
        review: {
          decision: review?.decision ?? null,
          reasons: review?.reasons ?? [],
          otherReason:
            review?.reasons.includes("Other") && review.otherReason.trim()
              ? review.otherReason.trim()
              : null,
          notes: review ? nullableText(review.notes) : null,
          contacted: review?.contacted ?? false,
          outcome: review?.outcome ?? null,
          outcomeNotes: review ? nullableText(review.outcomeNotes) : null,
          estimatedOpportunityValue: review
            ? canonicalOpportunityValue(review.estimatedOpportunityValue)
            : null,
          followUpDate: review?.followUpDate ?? null,
        },
        verifiedPacket: {
          primaryContact: lead.primaryContact,
          backupContact: lead.backupContact,
          sourceUrls: lead.sources.map((source) => source.url),
        },
        aiEnrichment: {
          ran: Boolean(enrichment),
          primaryContactClassification:
            enrichment?.primaryContact.classification ?? null,
          backupContactClassification:
            enrichment?.backupContact?.classification ?? null,
          verifiedAt: enrichment?.verifiedAt ?? null,
          sourceUrls: enrichment?.sources.map((source) => source.url) ?? [],
          outreachAdopted: review?.enrichedOutreachAdopted ?? false,
        },
        finalOutreach: {
          callOpener: review ? nullableText(review.editedCallOpener) : null,
          emailSubject: review ? nullableText(review.editedEmailSubject) : null,
          emailBody: review ? nullableText(review.editedEmailBody) : null,
        },
      };
    }),
  });
}

function displayDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function displayCurrency(value: number | null) {
  if (value === null) return "Not provided";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function markdownValue(value: string | null) {
  return value || "Not provided";
}

export function markdownCompletedReview(payload: CompletedReviewExport) {
  return `# Elevate ROW Opportunity Review

Generated: ${new Date(payload.generatedAt).toLocaleString()}

${payload.leads
  .map(
    (lead) => `## ${lead.address}

- **Project:** ${lead.projectDescription}
- **Experiment:** ${humanize(lead.experimentType)}
- **Primary decision:** ${lead.review.decision ? humanize(lead.review.decision) : "Not provided"}
- **Reasons:** ${lead.review.reasons.length ? lead.review.reasons.join("; ") : "Not provided"}
- **Other-reason explanation:** ${markdownValue(lead.review.otherReason)}
- **Review notes:** ${markdownValue(lead.review.notes)}
- **Contacted:** ${lead.review.contacted ? "Yes" : "No"}
- **Outcome:** ${lead.review.outcome ? humanize(lead.review.outcome) : "Not provided"}
- **Outcome notes:** ${markdownValue(lead.review.outcomeNotes)}
- **Estimated opportunity value:** ${displayCurrency(lead.review.estimatedOpportunityValue)}
- **Follow-up date:** ${displayDate(lead.review.followUpDate)}

### Verified packet

- **Primary contact classification:** ${humanize(lead.verifiedPacket.primaryContact.classification)}
- **Backup contact classification:** ${lead.verifiedPacket.backupContact ? humanize(lead.verifiedPacket.backupContact.classification) : "Not provided"}
- **Source URLs:** ${lead.verifiedPacket.sourceUrls.length ? lead.verifiedPacket.sourceUrls.join(", ") : "Not provided"}

### AI-assisted enrichment

- **Enrichment run:** ${lead.aiEnrichment.ran ? "Yes" : "No"}
- **Enriched primary classification:** ${lead.aiEnrichment.primaryContactClassification ? humanize(lead.aiEnrichment.primaryContactClassification) : "Not provided"}
- **Enriched backup classification:** ${lead.aiEnrichment.backupContactClassification ? humanize(lead.aiEnrichment.backupContactClassification) : "Not provided"}
- **Enrichment verification date:** ${markdownValue(lead.aiEnrichment.verifiedAt)}
- **Enrichment source URLs:** ${lead.aiEnrichment.sourceUrls.length ? lead.aiEnrichment.sourceUrls.join(", ") : "Not provided"}
- **Enriched outreach adopted:** ${lead.aiEnrichment.outreachAdopted ? "Yes" : "No"}

### Final outreach

**Call opener**

${markdownValue(lead.finalOutreach.callOpener)}

**Email subject**

${markdownValue(lead.finalOutreach.emailSubject)}

**Email body**

${markdownValue(lead.finalOutreach.emailBody)}
`,
  )
  .join("\n")}`;
}
