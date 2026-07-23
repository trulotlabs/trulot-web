"use client";

import { useState } from "react";
import type {
  Classification,
  DisqualifierDecision,
  InterviewSectionId,
  SectionStatus,
  StructuredInterviewAnswers,
} from "@/lib/elevate-interview/schema";
import {
  CONTACT_OPTIONS,
  CUSTOMER_OPTIONS,
  DISQUALIFIER_LABELS,
  DISQUALIFIER_OPTIONS,
  EARLIEST_TIMING_OPTIONS,
  IDEAL_TIMING_OPTIONS,
  SCOPE_OPTIONS,
  TOO_LATE_OPTIONS,
} from "@/lib/elevate-interview/structured";
import { StructuredClassifier } from "./StructuredClassifier";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#0c1117] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#d89a52]/65 focus:ring-2 focus:ring-[#d89a52]/10";

function numericValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerValue(value: string) {
  const parsed = numericValue(value);
  return parsed === null ? null : Math.floor(parsed);
}

function SectionActions({
  pending,
  unresolved,
  onContinue,
  onSkip,
}: {
  pending: boolean;
  unresolved: boolean;
  onContinue: (status: SectionStatus) => void;
  onSkip: () => void;
}) {
  const [showWarning, setShowWarning] = useState(false);

  if (unresolved && showWarning) {
    return (
      <div
        className="rounded-2xl border border-amber-300/25 bg-amber-200/[0.06] p-4"
        role="alert"
        data-testid="unresolved-warning"
      >
        <p className="text-sm leading-6 text-amber-100">
          Some items are still unassigned. You can go back or keep them visible as
          unresolved in the review.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowWarning(false)}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52]"
          >
            Go back
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onContinue("unresolved")}
            className="rounded-xl bg-[#d89a52] px-4 py-2 text-sm font-semibold text-[#17120c] disabled:opacity-40"
          >
            Continue with unresolved items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onSkip}
        disabled={pending}
        className="rounded-xl px-4 py-3 text-sm font-medium text-white/45 transition hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d89a52] disabled:opacity-40"
      >
        Skip for now
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          unresolved ? setShowWarning(true) : onContinue("completed")
        }
        className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] transition hover:bg-[#e4aa69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f1e8] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}

function OptionalNotes({
  value,
  onChange,
  label = "Optional notes",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="block text-sm text-white/65">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={1200}
        className={`${fieldClass} mt-2 min-h-24 max-h-48 resize-y`}
        placeholder="Add only what would help TruLot screen the first batch."
      />
    </label>
  );
}

export function InterviewSectionForm({
  section,
  answers,
  onChange,
  onContinue,
  onSkip,
  pending,
}: {
  section: InterviewSectionId;
  answers: StructuredInterviewAnswers;
  onChange: (answers: StructuredInterviewAnswers) => void;
  onContinue: (status: SectionStatus) => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const [customGeography, setCustomGeography] = useState("");
  const [customDisqualifier, setCustomDisqualifier] = useState("");

  const updateClassification = (
    key: "scopes" | "customers",
    id: string,
    value: Classification,
  ) => {
    onChange({
      ...answers,
      [key]: {
        ...answers[key],
        classifications: {
          ...answers[key].classifications,
          [id]: value,
        },
      },
    });
  };

  if (section === "service_area") {
    const unassigned = answers.serviceArea.geographies.some(
      (item) => item.classification === "unassigned",
    );
    const setPreset = (preset: "county" | "nearby" | "describe") => {
      if (preset === "describe") {
        document.getElementById("custom-geography")?.focus();
        return;
      }
      onChange({
        ...answers,
        serviceArea: {
          ...answers.serviceArea,
          geographies: answers.serviceArea.geographies.map((item) => ({
            ...item,
            classification:
              item.id === "san_diego_county"
                ? "core"
                : preset === "nearby"
                  ? "selective"
                  : "excluded",
          })),
        },
      });
    };

    return (
      <div className="space-y-6" data-testid="section-service_area">
        <div>
          <p className="text-sm leading-6 text-white/65">
            Classify the geographies Elevate actively pursues today. These
            shortcuts update the controls but do not submit the step.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Service area shortcuts">
            <button
              type="button"
              onClick={() => setPreset("county")}
              className="rounded-full border border-[#d89a52]/30 px-3 py-2 text-xs text-[#e8c79e]"
            >
              San Diego County only
            </button>
            <button
              type="button"
              onClick={() => setPreset("nearby")}
              className="rounded-full border border-[#d89a52]/30 px-3 py-2 text-xs text-[#e8c79e]"
            >
              San Diego core; nearby counties selective
            </button>
            <button
              type="button"
              onClick={() => setPreset("describe")}
              className="rounded-full border border-[#d89a52]/30 px-3 py-2 text-xs text-[#e8c79e]"
            >
              I will describe the service area
            </button>
          </div>
        </div>

        <StructuredClassifier
          label="Service area"
          options={answers.serviceArea.geographies}
          values={Object.fromEntries(
            answers.serviceArea.geographies.map((item) => [
              item.id,
              item.classification,
            ]),
          )}
          onChange={(id, classification) =>
            onChange({
              ...answers,
              serviceArea: {
                ...answers.serviceArea,
                geographies: answers.serviceArea.geographies.map((item) =>
                  item.id === id ? { ...item, classification } : item,
                ),
              },
            })
          }
          testId="service-area-classifier"
        />

        <div className="rounded-2xl border border-white/[0.08] p-4">
          <label htmlFor="custom-geography" className="text-sm text-white/65">
            Add custom geography
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="custom-geography"
              value={customGeography}
              onChange={(event) => setCustomGeography(event.target.value)}
              className={fieldClass}
              placeholder="County, city, or practical service area"
            />
            <button
              type="button"
              disabled={!customGeography.trim()}
              onClick={() => {
                const label = customGeography.trim();
                onChange({
                  ...answers,
                  serviceArea: {
                    ...answers.serviceArea,
                    geographies: [
                      ...answers.serviceArea.geographies,
                      {
                        id: `custom-${Date.now()}`,
                        label,
                        classification: "unassigned",
                      },
                    ],
                  },
                });
                setCustomGeography("");
              }}
              className="shrink-0 rounded-xl border border-white/15 px-4 text-sm text-white/75 disabled:opacity-35"
            >
              Add
            </button>
          </div>
        </div>

        <OptionalNotes
          label="Optional mobilization note"
          value={answers.serviceArea.mobilizationNote}
          onChange={(mobilizationNote) =>
            onChange({
              ...answers,
              serviceArea: { ...answers.serviceArea, mobilizationNote },
            })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={unassigned}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "scopes") {
    const unassigned = SCOPE_OPTIONS.some(
      (scope) =>
        (answers.scopes.classifications[scope.id] ?? "unassigned") ===
        "unassigned",
    );
    return (
      <div className="space-y-6" data-testid="section-scopes">
        <p className="text-sm leading-6 text-white/65">
          One click classifies each scope. You can change a choice at any time.
        </p>
        <StructuredClassifier
          label="ROW scopes"
          options={SCOPE_OPTIONS}
          values={answers.scopes.classifications}
          onChange={(id, value) => updateClassification("scopes", id, value)}
          testId="scope-classifier"
        />
        <OptionalNotes
          label="Additional scopes or qualifications"
          value={answers.scopes.additionalScopes}
          onChange={(additionalScopes) =>
            onChange({
              ...answers,
              scopes: { ...answers.scopes, additionalScopes },
            })
          }
        />
        <OptionalNotes
          value={answers.scopes.notes}
          onChange={(notes) =>
            onChange({ ...answers, scopes: { ...answers.scopes, notes } })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={unassigned}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "economics") {
    const exceptionOptions = [
      "None",
      "Existing relationship",
      "Bundled with larger work",
      "Strategic customer",
      "Already mobilized nearby",
    ];
    return (
      <div className="space-y-6" data-testid="section-economics">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-white/65">
            Ordinary minimum worthwhile ROW contract
            <input
              inputMode="numeric"
              aria-label="Ordinary minimum worthwhile ROW contract value"
              value={answers.economics.ordinaryMinimumContractValue ?? ""}
              onChange={(event) =>
                onChange({
                  ...answers,
                  economics: {
                    ...answers.economics,
                    ordinaryMinimumContractValue: numericValue(
                      event.target.value,
                    ),
                  },
                })
              }
              className={`${fieldClass} mt-2`}
              placeholder="$"
            />
          </label>
          <label className="text-sm text-white/65">
            Preferred range minimum
            <input
              inputMode="numeric"
              aria-label="Preferred contract value minimum"
              value={answers.economics.preferredContractValueMin ?? ""}
              onChange={(event) =>
                onChange({
                  ...answers,
                  economics: {
                    ...answers.economics,
                    preferredContractValueMin: numericValue(event.target.value),
                  },
                })
              }
              className={`${fieldClass} mt-2`}
              placeholder="$"
            />
          </label>
          <label className="text-sm text-white/65">
            Preferred range maximum
            <input
              inputMode="numeric"
              aria-label="Preferred contract value maximum"
              value={answers.economics.preferredContractValueMax ?? ""}
              onChange={(event) =>
                onChange({
                  ...answers,
                  economics: {
                    ...answers.economics,
                    preferredContractValueMax: numericValue(event.target.value),
                  },
                })
              }
              className={`${fieldClass} mt-2`}
              placeholder="$"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-white/75">
            Any obvious exception we should remember?
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {exceptionOptions.map((option) => {
              const checked = answers.economics.exceptionChoices.includes(option);
              return (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d89a52]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next =
                        option === "None"
                          ? checked
                            ? []
                            : ["None"]
                          : [
                              ...answers.economics.exceptionChoices.filter(
                                (item) => item !== "None" && item !== option,
                              ),
                              ...(checked ? [] : [option]),
                            ];
                      onChange({
                        ...answers,
                        economics: {
                          ...answers.economics,
                          exceptionChoices: next,
                        },
                      });
                    }}
                    className="h-4 w-4 accent-[#d89a52]"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        </fieldset>
        <OptionalNotes
          label="Optional exception note"
          value={answers.economics.exceptionNote}
          onChange={(exceptionNote) =>
            onChange({
              ...answers,
              economics: { ...answers.economics, exceptionNote },
            })
          }
        />
        <OptionalNotes
          value={answers.economics.notes}
          onChange={(notes) =>
            onChange({ ...answers, economics: { ...answers.economics, notes } })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={
            answers.economics.ordinaryMinimumContractValue === null ||
            answers.economics.preferredContractValueMin === null ||
            answers.economics.preferredContractValueMax === null
          }
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "customers") {
    const unassigned = CUSTOMER_OPTIONS.some(
      (customer) =>
        (answers.customers.classifications[customer.id] ?? "unassigned") ===
        "unassigned",
    );
    return (
      <div className="space-y-6" data-testid="section-customers">
        <StructuredClassifier
          label="Customer types"
          options={CUSTOMER_OPTIONS}
          values={answers.customers.classifications}
          onChange={(id, value) => updateClassification("customers", id, value)}
          testId="customer-classifier"
        />
        <OptionalNotes
          value={answers.customers.notes}
          onChange={(notes) =>
            onChange({ ...answers, customers: { ...answers.customers, notes } })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={unassigned}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "contacts") {
    return (
      <div className="space-y-6" data-testid="section-contacts">
        <fieldset disabled={answers.contacts.useBestAvailable}>
          <legend className="text-sm font-medium text-white/75">
            When several contacts are available, who should TruLot prioritize?
          </legend>
          <div className="mt-3 grid gap-2">
            {CONTACT_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d89a52]"
              >
                <input
                  type="radio"
                  name="primary-contact"
                  checked={answers.contacts.primary === option}
                  onChange={() =>
                    onChange({
                      ...answers,
                      contacts: {
                        ...answers.contacts,
                        primary: option,
                        useBestAvailable: false,
                      },
                    })
                  }
                  className="h-4 w-4 accent-[#d89a52]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm text-white/65">
          Optional secondary preference
          <select
            aria-label="Optional secondary contact preference"
            value={answers.contacts.secondary ?? ""}
            disabled={answers.contacts.useBestAvailable}
            onChange={(event) =>
              onChange({
                ...answers,
                contacts: {
                  ...answers.contacts,
                  secondary: event.target.value || null,
                },
              })
            }
            className={`${fieldClass} mt-2`}
          >
            <option value="">No secondary preference</option>
            {CONTACT_OPTIONS.filter(
              (option) => option !== answers.contacts.primary,
            ).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#d89a52]/25 bg-[#d89a52]/[0.06] p-4 text-sm text-[#f0cfaa]">
          <input
            type="checkbox"
            checked={answers.contacts.useBestAvailable}
            onChange={(event) =>
              onChange({
                ...answers,
                contacts: {
                  ...answers.contacts,
                  useBestAvailable: event.target.checked,
                  primary: event.target.checked ? null : answers.contacts.primary,
                  secondary: event.target.checked
                    ? null
                    : answers.contacts.secondary,
                },
              })
            }
            className="h-4 w-4 accent-[#d89a52]"
          />
          No strong preference — use the best available named contact
        </label>
        <OptionalNotes
          value={answers.contacts.notes}
          onChange={(notes) =>
            onChange({ ...answers, contacts: { ...answers.contacts, notes } })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={
            !answers.contacts.useBestAvailable && !answers.contacts.primary
          }
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "timing") {
    return (
      <div className="space-y-6" data-testid="section-timing">
        <fieldset>
          <legend className="text-sm font-semibold text-white/80">
            Earliest useful signal
          </legend>
          <div className="mt-3 grid gap-2">
            {EARLIEST_TIMING_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65"
              >
                <input
                  type="radio"
                  name="earliest-timing"
                  checked={answers.timing.earliest === option}
                  onChange={() =>
                    onChange({
                      ...answers,
                      timing: { ...answers.timing, earliest: option },
                    })
                  }
                  className="accent-[#d89a52]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold text-white/80">
            Ideal outreach point
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {IDEAL_TIMING_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65"
              >
                <input
                  type="checkbox"
                  checked={answers.timing.ideal.includes(option)}
                  onChange={() =>
                    onChange({
                      ...answers,
                      timing: {
                        ...answers.timing,
                        ideal: answers.timing.ideal.includes(option)
                          ? answers.timing.ideal.filter((item) => item !== option)
                          : [...answers.timing.ideal, option],
                      },
                    })
                  }
                  className="accent-[#d89a52]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold text-white/80">Too late</legend>
          <div className="mt-3 grid gap-2">
            {TOO_LATE_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65"
              >
                <input
                  type="radio"
                  name="too-late-timing"
                  checked={answers.timing.tooLate === option}
                  onChange={() =>
                    onChange({
                      ...answers,
                      timing: { ...answers.timing, tooLate: option },
                    })
                  }
                  className="accent-[#d89a52]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <OptionalNotes
          value={answers.timing.notes}
          onChange={(notes) =>
            onChange({ ...answers, timing: { ...answers.timing, notes } })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={
            !answers.timing.earliest ||
            answers.timing.ideal.length === 0 ||
            !answers.timing.tooLate
          }
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "disqualifiers") {
    const decisions = answers.disqualifiers.decisions;
    const unresolved =
      !answers.disqualifiers.noHardDisqualifiers &&
      [
        ...DISQUALIFIER_OPTIONS.map(
          (item) => decisions[item.id]?.decision ?? "unassigned",
        ),
        ...answers.disqualifiers.customItems.map((item) => item.decision),
      ].some((decision) => decision === "unassigned");
    const setDecision = (id: string, decision: DisqualifierDecision) => {
      onChange({
        ...answers,
        disqualifiers: {
          ...answers.disqualifiers,
          noHardDisqualifiers: false,
          decisions: {
            ...decisions,
            [id]: { ...decisions[id], decision, note: decisions[id]?.note ?? "" },
          },
        },
      });
    };
    return (
      <div className="space-y-6" data-testid="section-disqualifiers">
        <p className="text-sm leading-6 text-white/65">
          Are there any obvious opportunities TruLot should suppress from the
          first lead batch?
        </p>
        <button
          type="button"
          aria-pressed={answers.disqualifiers.noHardDisqualifiers}
          onClick={() =>
            onChange({
              ...answers,
              disqualifiers: {
                ...answers.disqualifiers,
                noHardDisqualifiers:
                  !answers.disqualifiers.noHardDisqualifiers,
              },
            })
          }
          className={`w-full rounded-2xl border p-4 text-left text-sm font-medium ${
            answers.disqualifiers.noHardDisqualifiers
              ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
              : "border-white/10 text-white/65"
          }`}
        >
          No hard disqualifiers yet
        </button>

        {!answers.disqualifiers.noHardDisqualifiers && (
          <div className="space-y-3">
            {DISQUALIFIER_OPTIONS.map((item) => {
              const current = decisions[item.id] ?? {
                decision: "unassigned" as const,
                note: "",
              };
              return (
                <fieldset
                  key={item.id}
                  className="rounded-2xl border border-white/[0.09] p-4"
                >
                  <legend className="px-1 text-sm font-medium text-white/80">
                    {item.label}
                  </legend>
                  <div
                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
                    role="radiogroup"
                    aria-label={`${item.label} screening rule`}
                  >
                    {(
                      [
                        "suppress",
                        "conditional",
                        "allow",
                        "unassigned",
                      ] as DisqualifierDecision[]
                    ).map((decision) => (
                      <label
                        key={decision}
                        className={`rounded-xl border px-3 py-2 text-center text-xs ${
                          current.decision === decision
                            ? "border-[#d89a52]/70 bg-[#d89a52]/15 text-[#f0cfaa]"
                            : "border-white/10 text-white/45"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`disqualifier-${item.id}`}
                          checked={current.decision === decision}
                          onChange={() => setDecision(item.id, decision)}
                          className="sr-only"
                        />
                        {DISQUALIFIER_LABELS[decision]}
                      </label>
                    ))}
                  </div>
                  {current.decision === "conditional" && (
                    <label className="mt-3 block text-xs text-white/55">
                      Short condition
                      <input
                        aria-label={`${item.label} condition`}
                        value={current.note}
                        onChange={(event) =>
                          onChange({
                            ...answers,
                            disqualifiers: {
                              ...answers.disqualifiers,
                              decisions: {
                                ...decisions,
                                [item.id]: {
                                  ...current,
                                  note: event.target.value,
                                },
                              },
                            },
                          })
                        }
                        className={`${fieldClass} mt-2`}
                      />
                    </label>
                  )}
                </fieldset>
              );
            })}
            {answers.disqualifiers.customItems.map((item) => (
              <fieldset
                key={item.id}
                className="rounded-2xl border border-[#d89a52]/20 p-4"
              >
                <legend className="px-1 text-sm font-medium text-white/80">
                  {item.label}
                </legend>
                <div
                  className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
                  role="radiogroup"
                  aria-label={`${item.label} screening rule`}
                >
                  {(
                    [
                      "suppress",
                      "conditional",
                      "allow",
                      "unassigned",
                    ] as DisqualifierDecision[]
                  ).map((decision) => (
                    <label
                      key={decision}
                      className={`rounded-xl border px-3 py-2 text-center text-xs ${
                        item.decision === decision
                          ? "border-[#d89a52]/70 bg-[#d89a52]/15 text-[#f0cfaa]"
                          : "border-white/10 text-white/45"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`disqualifier-${item.id}`}
                        checked={item.decision === decision}
                        onChange={() =>
                          onChange({
                            ...answers,
                            disqualifiers: {
                              ...answers.disqualifiers,
                              customItems:
                                answers.disqualifiers.customItems.map(
                                  (custom) =>
                                    custom.id === item.id
                                      ? { ...custom, decision }
                                      : custom,
                                ),
                            },
                          })
                        }
                        className="sr-only"
                      />
                      {DISQUALIFIER_LABELS[decision]}
                    </label>
                  ))}
                </div>
                {item.decision === "conditional" && (
                  <label className="mt-3 block text-xs text-white/55">
                    Short condition
                    <input
                      aria-label={`${item.label} condition`}
                      value={item.note}
                      onChange={(event) =>
                        onChange({
                          ...answers,
                          disqualifiers: {
                            ...answers.disqualifiers,
                            customItems:
                              answers.disqualifiers.customItems.map(
                                (custom) =>
                                  custom.id === item.id
                                    ? { ...custom, note: event.target.value }
                                    : custom,
                              ),
                          },
                        })
                      }
                      className={`${fieldClass} mt-2`}
                    />
                  </label>
                )}
              </fieldset>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/[0.08] p-4">
          <label className="text-sm text-white/65">
            Add another disqualifier
            <div className="mt-2 flex gap-2">
              <input
                value={customDisqualifier}
                onChange={(event) => setCustomDisqualifier(event.target.value)}
                className={fieldClass}
                placeholder="Short, participant-provided rule"
              />
              <button
                type="button"
                disabled={!customDisqualifier.trim()}
                onClick={() => {
                  onChange({
                    ...answers,
                    disqualifiers: {
                      ...answers.disqualifiers,
                      noHardDisqualifiers: false,
                      customItems: [
                        ...answers.disqualifiers.customItems,
                        {
                          id: `custom-${Date.now()}`,
                          label: customDisqualifier.trim(),
                          decision: "unassigned",
                          note: "",
                        },
                      ],
                    },
                  });
                  setCustomDisqualifier("");
                }}
                className="shrink-0 rounded-xl border border-white/15 px-4 text-sm text-white/75 disabled:opacity-35"
              >
                Add
              </button>
            </div>
          </label>
        </div>
        <OptionalNotes
          value={answers.disqualifiers.notes}
          onChange={(notes) =>
            onChange({
              ...answers,
              disqualifiers: { ...answers.disqualifiers, notes },
            })
          }
        />
        <SectionActions
          pending={pending}
          unresolved={unresolved}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  const capacity = answers.capacityExamples;
  const updateCapacity = (
    patch: Partial<StructuredInterviewAnswers["capacityExamples"]>,
  ) =>
    onChange({
      ...answers,
      capacityExamples: { ...capacity, ...patch },
    });

  return (
    <div className="space-y-6" data-testid="section-capacity_examples">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-white/65">
          Leads Cesar can review per weekday
          <input
            inputMode="numeric"
            aria-label="Leads reviewable per weekday"
            value={capacity.leadsPerWeekday ?? ""}
            onChange={(event) =>
              updateCapacity({
                leadsPerWeekday: integerValue(event.target.value),
              })
            }
            className={`${fieldClass} mt-2`}
          />
        </label>
        <label className="text-sm text-white/65">
          Outreach actions per weekday
          <input
            inputMode="numeric"
            aria-label="Outreach actions per weekday"
            value={capacity.outreachPerWeekday ?? ""}
            onChange={(event) =>
              updateCapacity({
                outreachPerWeekday: integerValue(event.target.value),
              })
            }
            className={`${fieldClass} mt-2`}
          />
        </label>
        <label className="text-sm text-white/65">
          Follow-up owner, if known
          <input
            value={capacity.followUpOwner}
            onChange={(event) =>
              updateCapacity({ followUpOwner: event.target.value })
            }
            className={`${fieldClass} mt-2`}
            placeholder="Name or team"
          />
        </label>
        <label className="text-sm text-white/65">
          Expected response time
          <input
            value={capacity.responseTime}
            onChange={(event) =>
              updateCapacity({ responseTime: event.target.value })
            }
            className={`${fieldClass} mt-2`}
            placeholder="For example: within one business day"
          />
        </label>
      </div>

      {(["goodFit", "badFit"] as const).map((kind) => {
        const example = capacity[kind];
        const title = kind === "goodFit" ? "Optional good-fit example" : "Optional bad-fit example";
        return (
          <fieldset
            key={kind}
            className="rounded-2xl border border-white/[0.08] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-white/80">
              {title}
            </legend>
            <p className="mb-3 text-xs leading-5 text-white/40">
              Leave blank if no real example is useful yet. No example is
              prefilled.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["projectOrLocation", "Project type or location"],
                  ["scopes", "Main ROW scopes"],
                  ["contractRange", "Approximate contract-value range"],
                  ["customerType", "Customer type"],
                  [
                    "fitReason",
                    kind === "goodFit"
                      ? "Why it was a good fit"
                      : "Why it was a bad fit",
                  ],
                ] as const
              ).map(([field, label]) => (
                <label
                  key={field}
                  className={`text-sm text-white/65 ${
                    field === "fitReason" ? "sm:col-span-2" : ""
                  }`}
                >
                  {label}
                  <input
                    value={example[field]}
                    onChange={(event) =>
                      updateCapacity({
                        [kind]: { ...example, [field]: event.target.value },
                      })
                    }
                    className={`${fieldClass} mt-2`}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <OptionalNotes
        value={capacity.notes}
        onChange={(notes) => updateCapacity({ notes })}
      />
      <SectionActions
        pending={pending}
        unresolved={
          capacity.leadsPerWeekday === null ||
          capacity.outreachPerWeekday === null
        }
        onContinue={onContinue}
        onSkip={onSkip}
      />
    </div>
  );
}
