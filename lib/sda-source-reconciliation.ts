export const SDA_RECONCILIATION_STATE = "source_reconciliation_pending" as const;
export const SDA_RECONCILIATION_LABEL = "SDA source reconciliation pending";
export const SDA_RECONCILIATION_MESSAGE = "SDA status is temporarily unavailable while its source is reconciled.";

export type SdaObservedMembership = "inside" | "outside" | "unavailable";

export interface SdaReconciliationStatus {
  state: typeof SDA_RECONCILIATION_STATE;
  observedMembership: SdaObservedMembership;
  authoritative: false;
  publicLabel: typeof SDA_RECONCILIATION_LABEL;
  publicMessage: typeof SDA_RECONCILIATION_MESSAGE;
}

export function applySdaReconciliationPolicy(observed: boolean | null): SdaReconciliationStatus {
  return {
    state: SDA_RECONCILIATION_STATE,
    observedMembership: observed === null ? "unavailable" : observed ? "inside" : "outside",
    authoritative: false,
    publicLabel: SDA_RECONCILIATION_LABEL,
    publicMessage: SDA_RECONCILIATION_MESSAGE,
  };
}

export function canUseSdaForRegulatoryConclusion(status: SdaReconciliationStatus): false {
  void status;
  return false;
}

export function publicSdaApiStatus() {
  return {
    state: SDA_RECONCILIATION_STATE,
    authoritative: false as const,
    label: SDA_RECONCILIATION_LABEL,
    message: SDA_RECONCILIATION_MESSAGE,
  };
}

export function formatUnaffectedOverlaySummary({
  tpa,
  ctcac,
  lookupUnavailable,
}: {
  tpa: boolean;
  ctcac: boolean;
  lookupUnavailable: boolean;
}): string {
  const pending = `${SDA_RECONCILIATION_LABEL}.`;
  if (lookupUnavailable) return `${pending} TPA and CTCAC lookup is also temporarily unavailable.`;

  const names = [
    tpa ? "Transit Priority Area" : null,
    ctcac ? "CTCAC mapped area" : null,
  ].filter(Boolean) as string[];
  if (names.length === 0) return `${pending} No TPA or CTCAC overlay was returned by the current lookup.`;
  return `${pending} Other mapped overlays: ${names.join(", ")}.`;
}
