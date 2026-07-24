"use client";

import { useId } from "react";
import {
  localIsoDate,
  quickFollowUpDate,
  validateFollowUpDate,
  type FollowUpQuickAction,
} from "@/lib/elevate-review/dates";

const QUICK_ACTIONS: ReadonlyArray<{
  value: FollowUpQuickAction;
  label: string;
}> = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "three_days", label: "3 days" },
  { value: "one_week", label: "1 week" },
  { value: "two_weeks", label: "2 weeks" },
  { value: "one_month", label: "1 month" },
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0a1118] px-3 py-2.5 text-sm text-white outline-none focus:border-[#d89a52]/70";

export function FollowUpDateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const errorId = useId();
  const minimum = localIsoDate();
  const error = validateFollowUpDate(value, minimum);

  return (
    <div className="text-sm font-semibold">
      <label>
        Follow-up date
        <input
          type="date"
          min={minimum}
          value={value ?? ""}
          onInput={(event) =>
            onChange(event.currentTarget.value || null)
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`${inputClass} mt-2`}
        />
      </label>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-xs font-normal text-red-200"
        >
          {error}
        </p>
      )}
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Date shortcuts"
      >
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            onClick={() => onChange(quickFollowUpDate(action.value))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-[#d89a52]"
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-[#d89a52]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
