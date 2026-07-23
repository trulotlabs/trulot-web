"use client";

import { useState } from "react";
import type {
  Classification,
  InterviewSectionId,
  SectionStatus,
  StructuredInterviewAnswers,
} from "@/lib/elevate-interview/schema";
import {
  CALIBRATION_LABELS,
  DELIVERY_SPEED_OPTIONS,
  EVIDENCE_OPTIONS,
  NOISE_OPTIONS,
  SIGNAL_OPTIONS,
} from "@/lib/elevate-interview/structured";
import { StructuredClassifier } from "./StructuredClassifier";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#0c1117] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d89a52]/65 focus:ring-2 focus:ring-[#d89a52]/10";

function Notes({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm text-white/65">
      Optional notes
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={1000}
        className={`${fieldClass} mt-2 max-h-48 min-h-24 resize-y`}
        placeholder="Add only what would improve the first calibration batch."
      />
    </label>
  );
}

function Actions({
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
  const [warning, setWarning] = useState(false);
  if (warning) {
    return (
      <div
        className="rounded-2xl border border-amber-300/25 bg-amber-200/[0.06] p-4"
        role="alert"
        data-testid="unresolved-warning"
      >
        <p className="text-sm text-amber-100">
          Some choices remain unresolved. Keep them visible for the first-batch
          review or go back.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWarning(false)}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm"
          >
            Go back
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onContinue("unresolved")}
            className="rounded-xl bg-[#d89a52] px-4 py-2 text-sm font-semibold text-[#17120c]"
          >
            Continue with unresolved items
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:justify-between">
      <button
        type="button"
        onClick={onSkip}
        disabled={pending}
        className="rounded-xl px-4 py-3 text-sm text-white/45 hover:text-white"
      >
        Skip for now
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          unresolved ? setWarning(true) : onContinue("completed")
        }
        className="rounded-xl bg-[#d89a52] px-5 py-3 text-sm font-semibold text-[#17120c] disabled:opacity-40"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </div>
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
  if (section === "signals") {
    const unresolved = SIGNAL_OPTIONS.some(
      ({ id }) =>
        (answers.signals.classifications[id] ?? "unassigned") === "unassigned",
    );
    return (
      <div className="space-y-6" data-testid="section-signals">
        <div className="rounded-2xl border border-[#d89a52]/20 bg-[#d89a52]/[0.05] p-4 text-sm leading-6 text-white/65">
          <strong className="text-white">Already assumed:</strong> San Diego
          County, any project size, and broad public ROW scope. This step only
          calibrates the signals TruLot should surface.
        </div>
        <StructuredClassifier
          label="Project signals"
          options={SIGNAL_OPTIONS}
          values={answers.signals.classifications}
          labels={CALIBRATION_LABELS}
          onChange={(id, value: Classification) =>
            onChange({
              ...answers,
              signals: {
                ...answers.signals,
                classifications: {
                  ...answers.signals.classifications,
                  [id]: value,
                },
              },
            })
          }
          testId="signal-classifier"
        />
        <Notes
          value={answers.signals.notes}
          onChange={(notes) =>
            onChange({ ...answers, signals: { ...answers.signals, notes } })
          }
        />
        <Actions
          pending={pending}
          unresolved={unresolved}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "evidence") {
    return (
      <div className="space-y-6" data-testid="section-evidence">
        <fieldset>
          <legend className="text-sm font-semibold text-white/80">
            What evidence makes a lead actionable?
          </legend>
          <p className="mt-1 text-xs text-white/40">
            Choose any that matter. These are evidence cues, not required
            homework.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {EVIDENCE_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-sm leading-5 text-white/65"
              >
                <input
                  type="checkbox"
                  checked={answers.evidence.priorities.includes(option)}
                  onChange={() =>
                    onChange({
                      ...answers,
                      evidence: {
                        ...answers.evidence,
                        priorities: answers.evidence.priorities.includes(option)
                          ? answers.evidence.priorities.filter(
                              (item) => item !== option,
                            )
                          : [...answers.evidence.priorities, option],
                      },
                    })
                  }
                  className="mt-0.5 h-4 w-4 accent-[#d89a52]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <Notes
          value={answers.evidence.notes}
          onChange={(notes) =>
            onChange({ ...answers, evidence: { ...answers.evidence, notes } })
          }
        />
        <Actions
          pending={pending}
          unresolved={answers.evidence.priorities.length === 0}
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  if (section === "noise") {
    return (
      <div className="space-y-6" data-testid="section-noise">
        <button
          type="button"
          aria-pressed={answers.noise.noAdditionalRules}
          onClick={() =>
            onChange({
              ...answers,
              noise: {
                ...answers.noise,
                noAdditionalRules: !answers.noise.noAdditionalRules,
                suppressions: !answers.noise.noAdditionalRules
                  ? []
                  : answers.noise.suppressions,
              },
            })
          }
          className={`w-full rounded-2xl border p-4 text-left text-sm font-medium ${
            answers.noise.noAdditionalRules
              ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
              : "border-white/10 text-white/65"
          }`}
        >
          No additional suppression rules yet
        </button>
        {!answers.noise.noAdditionalRules && (
          <fieldset>
            <legend className="text-sm font-semibold text-white/80">
              Suppress these obvious false positives
            </legend>
            <div className="mt-3 grid gap-2">
              {NOISE_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65"
                >
                  <input
                    type="checkbox"
                    checked={answers.noise.suppressions.includes(option)}
                    onChange={() =>
                      onChange({
                        ...answers,
                        noise: {
                          ...answers.noise,
                          suppressions: answers.noise.suppressions.includes(
                            option,
                          )
                            ? answers.noise.suppressions.filter(
                                (item) => item !== option,
                              )
                            : [...answers.noise.suppressions, option],
                        },
                      })
                    }
                    className="mt-0.5 h-4 w-4 accent-[#d89a52]"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Notes
          value={answers.noise.notes}
          onChange={(notes) =>
            onChange({ ...answers, noise: { ...answers.noise, notes } })
          }
        />
        <Actions
          pending={pending}
          unresolved={
            !answers.noise.noAdditionalRules &&
            answers.noise.suppressions.length === 0
          }
          onContinue={onContinue}
          onSkip={onSkip}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-delivery">
      <fieldset>
        <legend className="text-sm font-semibold text-white/80">
          First calibration batch
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[5, 10].map((size) => (
            <label
              key={size}
              className="rounded-xl border border-white/10 p-4 text-center text-sm text-white/70"
            >
              <input
                type="radio"
                name="batch-size"
                checked={answers.delivery.batchSize === size}
                onChange={() =>
                  onChange({
                    ...answers,
                    delivery: {
                      ...answers.delivery,
                      batchSize: size as 5 | 10,
                    },
                  })
                }
                className="mr-2 accent-[#d89a52]"
              />
              {size} real leads
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold text-white/80">
          How quickly should TruLot hand them over?
        </legend>
        <div className="mt-3 grid gap-2">
          {DELIVERY_SPEED_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/65"
            >
              <input
                type="radio"
                name="delivery-speed"
                checked={answers.delivery.deliverySpeed === option}
                onChange={() =>
                  onChange({
                    ...answers,
                    delivery: { ...answers.delivery, deliverySpeed: option },
                  })
                }
                className="accent-[#d89a52]"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm text-white/65">
        Feedback owner, if known
        <input
          value={answers.delivery.feedbackOwner}
          onChange={(event) =>
            onChange({
              ...answers,
              delivery: {
                ...answers.delivery,
                feedbackOwner: event.target.value,
              },
            })
          }
          className={`${fieldClass} mt-2`}
          placeholder="Leave blank if Cesar will reply directly"
        />
      </label>
      <Notes
        value={answers.delivery.notes}
        onChange={(notes) =>
          onChange({ ...answers, delivery: { ...answers.delivery, notes } })
        }
      />
      <Actions
        pending={pending}
        unresolved={
          answers.delivery.batchSize === null ||
          answers.delivery.deliverySpeed === null
        }
        onContinue={onContinue}
        onSkip={onSkip}
      />
    </div>
  );
}
