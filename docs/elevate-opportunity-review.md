# Elevate Opportunity Review

The private portal at `/elevate/interview/[token]` loads its five-lead pilot
batch from the server-only `ELEVATE_PILOT_BATCH_JSON` environment variable.
The value is parsed and validated before the authenticated page is rendered.
Missing or invalid configuration fails closed. Do not place a real batch,
invite token, participant notes, or contact data in Git.

For recurring batches, the value is a configuration object with a stable batch
ID, an optional visible batch name, and an array of exactly five lead objects.
An absent or blank batch name displays as `Current batch`. The lead array must
contain exactly one `routing_experiment` and one `obvious_control`. Legacy
five-lead arrays remain valid and receive a deterministic fallback batch
identity based on their ordered lead IDs. This abbreviated, fictional example
documents the preferred shape; every field shown is required unless its value
is explicitly nullable:

```json
{
  "batchId": "batch-2",
  "batchName": "Elevate ROW Lead Batch 2",
  "leads": [
    {
    "leadId": "EXAMPLE-001",
    "address": "101 Example Avenue",
    "projectDescription": "Fictional permit test project.",
    "jurisdiction": "Example County",
    "projectIdentifiers": ["EXAMPLE-PERMIT-1"],
    "trigger": "A public permit milestone referenced frontage work.",
    "triggerDate": "2026-07-01",
    "currentStage": "Permit review",
    "latestMeaningfulEvent": "A correction response was accepted.",
    "rowRelevance": "explicit",
    "likelyScopes": ["Sidewalk restoration"],
    "whyElevateMayCare": "The permit sequence suggests a possible ROW package.",
    "evidence": [
      {
        "claim": "The permit references frontage work.",
        "basis": "The official permit record contains the reference.",
        "kind": "verified_fact",
        "confidence": "high"
      }
    ],
    "sources": [
      {
        "label": "Official permit record",
        "url": "https://example.test/permit/1",
        "sourceType": "official_permit",
        "verifiedAt": "2026-07-23"
      }
    ],
    "timingAssessment": "The project may be ready for routing.",
    "timingConfidence": "medium",
    "projectConfidence": "high",
    "rowScopeConfidence": "high",
    "contactConfidence": "medium",
    "primaryContact": {
      "name": null,
      "company": "Example Builder",
      "role": "Public project routing desk",
      "classification": "probable_routing_contact",
      "methods": [
        {
          "type": "website",
          "label": "Public contact page",
          "value": "https://example.test/contact"
        }
      ],
      "relationshipConfidence": "medium",
      "routingConfidence": "medium",
      "caveats": ["Confirm the project assignment before outreach."]
    },
    "backupContact": null,
    "contactClassification": "probable_routing_contact",
    "suggestedCallOpener": "Ask whether the ROW package has been assigned.",
    "draftEmailSubject": "ROW package question",
    "draftEmailBody": "Please route me to the correct project contact.",
    "risksAndCaveats": ["Procurement status is unverified."],
      "experimentType": "small_non_obvious"
    }
  ]
}
```

The strict schemas and full field constraints live in
`lib/elevate-review/schema.ts`. Browser persistence is scoped to the review
token, stable batch ID, and ordered lead IDs, and remains local to the
reviewer’s device. Existing legacy records are left untouched. Generated email
fields contain body copy only;
the reviewer’s approved Outlook signature supplies the sender block. OpenAI
requests run only on the server, use the Responses API with `store: false`,
and return schema-validated output. Contact enrichment uses public web search
and never sends outreach automatically.
