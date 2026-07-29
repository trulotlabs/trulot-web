import {
  type BuyerRouterStatus,
  type Contact,
  type ContactClassification,
  type OutreachMode,
  type PilotLead,
} from "./schema";
import { validateOutreachDraft } from "./outreach-reliability";

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

export type CanonicalEmailDraft = {
  recipient: string;
  subject: string;
  body: string;
  styleMode: OutreachMode;
  contactClassification: ContactClassification;
  buyerRouterStatus: BuyerRouterStatus;
  validationStatus: "validated";
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

export function createCanonicalEmailDraft(
  lead: PilotLead,
  route: VerifiedEmailRoute | null,
  draft: Omit<CanonicalEmailDraft, "recipient" | "validationStatus">,
): CanonicalEmailDraft | null {
  if (!route?.address) return null;
  const validation = validateOutreachDraft(lead, draft.subject, draft.body);
  // A client must never silently normalize, trim, or otherwise alter the draft
  // that the server accepted. A mismatch means a fresh draft is required.
  if (!validation.ok || validation.body !== draft.body) return null;
  return { ...draft, recipient: route.address, validationStatus: "validated" };
}

export function buildValidatedMailtoHref(
  lead: PilotLead,
  draft: CanonicalEmailDraft,
  expectedRecipient: string,
): string | null {
  if (draft.validationStatus !== "validated") return null;
  const href = buildMailtoHref(draft.recipient, draft.subject, draft.body);
  try {
    const decoded = new URL(href);
    const recipient = decodeURIComponent(decoded.pathname);
    const subject = decoded.searchParams.get("subject") ?? "";
    const body = decoded.searchParams.get("body") ?? "";
    const validation = validateOutreachDraft(lead, subject, body);
    if (
      recipient !== draft.recipient ||
      recipient !== expectedRecipient ||
      subject !== draft.subject ||
      body !== draft.body ||
      !validation.ok ||
      validation.body !== draft.body
    ) {
      return null;
    }
    return href;
  } catch {
    return null;
  }
}

export function isLegacyCallDecision(
  decision: string | null,
): decision is "call_now" | "call_later" {
  return decision === "call_now" || decision === "call_later";
}
