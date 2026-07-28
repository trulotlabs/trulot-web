import type { OutreachMode, PilotLead } from "./schema";

export type { OutreachMode } from "./schema";

export function outreachModeForLead(lead: PilotLead): OutreachMode {
  return lead.primaryContact.classification ===
    "project_specific_decision_maker" &&
    lead.contactConfidence === "high"
    ? "warm_opportunity"
    : "concise_route_check";
}

export function outreachModeGuidance(mode: OutreachMode) {
  if (mode === "warm_opportunity") {
    return {
      label: "Warm opportunity email",
      minimumWords: 105,
      maximumWords: 150,
      routingRequired: false,
    };
  }
  return {
    label: "Concise route-check email",
    minimumWords: 70,
    maximumWords: 105,
    routingRequired: true,
  };
}

export const cesarOutreachStyleProfile = `Provisional Cesar Hernandez outreach style (soft guidance, not a rigid template):
- Write in Cesar's first-person voice as a hands-on contractor and company president.
- Sound professional, approachable, confident, courteous, direct, commercially practical, and optimistic without exaggeration.
- Use natural contractions and clear construction language. Do not sound like a marketer, permit-monitoring product, or AI.
- Keep the requested action obvious: ask whether the civil/ROW package has been assigned, offer to review plans and provide pricing, and request routing when the recipient is not a verified buyer.
- A natural flow is a brief greeting; the reason for reaching out; the project and two or three defensible scope signals; Elevate's relevant capability when useful; the assignment question; the plans-and-pricing offer; routing when appropriate; and a positive, courteous close.
- Phrases such as "I wanted to reach out regarding," "I'd appreciate the opportunity," "Would you mind pointing me in the right direction?", "Please send over the plans when you have a chance," and "I'd welcome the opportunity" may be used naturally, but never copied mechanically into every draft.
- Accuracy overrides style. Preserve certainty labels; do not overstate permit scope, treat unresolved work as confirmed, imply recipient procurement authority, guess a name or role, or imply the package is still available without evidence.
- Return body-only copy. Never add Cesar's name, title, company signature, phone, email, or another signature block.`;
