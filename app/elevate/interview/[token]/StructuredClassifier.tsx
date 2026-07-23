"use client";

import type { Classification } from "@/lib/elevate-interview/schema";
import { CLASSIFICATION_LABELS } from "@/lib/elevate-interview/structured";

const CLASSIFICATIONS: Classification[] = [
  "core",
  "selective",
  "excluded",
  "unassigned",
];

export function StructuredClassifier({
  label,
  options,
  values,
  onChange,
  testId,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  values: Record<string, Classification>;
  onChange: (id: string, value: Classification) => void;
  testId: string;
}) {
  const grouped = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      options
        .filter(
          (option) => (values[option.id] ?? "unassigned") === classification,
        )
        .map((option) => option.label),
    ]),
  ) as Record<Classification, string[]>;

  return (
    <div className="space-y-5" data-testid={testId}>
      <div className="space-y-3" aria-label={label}>
        {options.map((option) => {
          const selected = values[option.id] ?? "unassigned";
          return (
            <fieldset
              key={option.id}
              className="rounded-2xl border border-white/[0.09] bg-black/10 p-4"
            >
              <legend className="px-1 text-sm font-medium leading-6 text-white/85">
                {option.label}
              </legend>
              <div
                className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
                role="radiogroup"
                aria-label={`${option.label} classification`}
              >
                {CLASSIFICATIONS.map((classification) => {
                  const inputId = `${testId}-${option.id}-${classification}`;
                  const active = selected === classification;
                  return (
                    <label
                      key={classification}
                      htmlFor={inputId}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-xs font-medium transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d89a52] ${
                        active
                          ? classification === "core"
                            ? "border-emerald-300/60 bg-emerald-300/15 text-emerald-100"
                            : classification === "selective"
                              ? "border-[#d89a52]/70 bg-[#d89a52]/15 text-[#f0cfaa]"
                              : classification === "excluded"
                                ? "border-rose-300/55 bg-rose-300/10 text-rose-100"
                                : "border-white/25 bg-white/[0.07] text-white/70"
                          : "border-white/10 bg-white/[0.025] text-white/45 hover:border-white/25 hover:text-white/75"
                      }`}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={`${testId}-${option.id}`}
                        value={classification}
                        checked={active}
                        onChange={() => onChange(option.id, classification)}
                        className="sr-only"
                      />
                      {CLASSIFICATION_LABELS[classification]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <section
        className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4"
        aria-label={`${label} grouped summary`}
        data-testid={`${testId}-summary`}
      >
        <h3 className="text-sm font-semibold text-white/85">Live grouped summary</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CLASSIFICATIONS.map((classification) => (
            <div key={classification}>
              <p className="font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">
                {CLASSIFICATION_LABELS[classification]}
              </p>
              <p
                className="mt-1 text-xs leading-5 text-white/65"
                data-testid={`${testId}-summary-${classification}`}
              >
                {grouped[classification].length
                  ? grouped[classification].join(", ")
                  : "None"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
