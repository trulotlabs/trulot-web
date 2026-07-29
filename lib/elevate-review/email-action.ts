import {
  type Contact,
  type PilotLead,
} from "./schema";

const UNSAFE_EMAIL_LABEL =
  /\b(?:unverified|pattern|inferred|guess(?:ed)?|possible|proposed|likely)\b/i;
const VERIFIED_EMAIL_LABEL =
  /\b(?:verified|official|public|general (?:company )?inbox|company inbox)\b/i;

export type VerifiedEmailRoute = {
  address: string;
  label: string;
  contact: Contact;
  routeType: "direct" | "general";
};

function verifiedEmailFromContact(
  contact: Contact | null,
): VerifiedEmailRoute | null {
  if (!contact) return null;
  const method = contact.methods.find(
    (candidate) =>
      candidate.type === "email" &&
      VERIFIED_EMAIL_LABEL.test(candidate.label) &&
      !UNSAFE_EMAIL_LABEL.test(candidate.label),
  );
  if (!method) return null;
  const general =
    contact.classification === "general_company_contact" ||
    /\b(?:general|company|inbox|info@|contact@)\b/i.test(
      `${method.label} ${method.value}`,
    );
  return {
    address: method.value,
    label: method.label,
    contact,
    routeType: general ? "general" : "direct",
  };
}

export function findVerifiedEmailRoute(
  lead: PilotLead,
  enrichedPrimary?: Contact | null,
  enrichedBackup?: Contact | null,
): VerifiedEmailRoute | null {
  const candidates = [
    enrichedPrimary ?? null,
    enrichedBackup ?? null,
    lead.primaryContact,
    lead.backupContact,
  ];
  for (const contact of candidates) {
    const route = verifiedEmailFromContact(contact);
    if (route) return route;
  }
  return null;
}

export function buildMailtoHref(
  recipient: string,
  subject: string,
  body: string,
) {
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function isLegacyCallDecision(
  decision: string | null,
): decision is "call_now" | "call_later" {
  return decision === "call_now" || decision === "call_later";
}
