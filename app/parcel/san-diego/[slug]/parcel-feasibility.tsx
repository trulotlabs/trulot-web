import type {
  PublicFeasibilityRuleRow,
  PublicParcelFeasibilityOutput,
} from "@/lib/public-parcel-feasibility";

function stateClass(state: PublicFeasibilityRuleRow["state"]): string {
  if (state === "MEETS_BASE_RULE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (state === "DOES_NOT_MEET_BASE_RULE") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (state === "CONDITIONAL" || state === "NEEDS_EVIDENCE") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function DevelopmentRulesSummary({
  feasibility,
}: {
  feasibility: PublicParcelFeasibilityOutput;
}) {
  if (feasibility.readiness !== "READY" || feasibility.summary.length === 0) {
    return null;
  }
  return (
    <aside
      aria-label="Development rules summary"
      className="border-b border-slate-100 py-2.5"
      data-testid="development-rules-summary"
    >
      <div className="text-sm">
        <p className="leading-5 text-slate-600">
          <span className="font-semibold text-slate-900">Development rules:</span>{" "}
          {feasibility.baseZoneCode ? `${feasibility.baseZoneCode} · ` : ""}
          {feasibility.summary
            .map(
              (entry) =>
                `${entry.count} ${entry.label.toLocaleLowerCase()}`,
            )
            .join(" · ")}
          {" "}
          <a
            href="#development-rules"
            className="inline-flex min-h-6 items-center rounded text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            View rules
          </a>
        </p>
      </div>
    </aside>
  );
}

function RuleEvidence({ rule }: { rule: PublicFeasibilityRuleRow }) {
  const hasDetails =
    Boolean(rule.calculation || rule.blocker) || rule.evidence.length > 0;
  if (!hasDetails) return null;
  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="inline-flex min-h-6 cursor-pointer items-center rounded py-1 text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
        Calculation &amp; evidence
      </summary>
      <div className="mt-1 space-y-1 rounded bg-slate-50 px-2.5 py-2 leading-5 text-slate-600">
        {rule.calculation ? (
          <p><span className="font-medium">Exact calculation:</span> {rule.calculation}</p>
        ) : null}
        {rule.blocker ? (
          <p><span className="font-medium">Evidence needed:</span> {rule.blocker}</p>
        ) : null}
        {rule.evidence.map((entry, index) => (
          <p key={`${entry.label}-${index}`}>
            <span className="font-medium">{entry.label}</span>
            {entry.value ? ` · ${entry.value}` : ""}
            {entry.sourceDate ? ` · ${entry.sourceDate}` : ""}
            {entry.url ? (
              <>{" · "}<a className="text-sky-800 underline" href={entry.url}>Source</a></>
            ) : null}
          </p>
        ))}
        <p><a href="#sources-methodology" className="text-sky-800 underline">All sources &amp; methodology</a></p>
      </div>
    </details>
  );
}

export function DevelopmentRulesSection({
  feasibility,
}: {
  feasibility: PublicParcelFeasibilityOutput;
}) {
  if (feasibility.readiness !== "READY") {
    return feasibility.sectionMessage ? (
      <div
        className="col-span-full rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600"
        data-testid="development-rules-unavailable"
      >
        {feasibility.sectionMessage}
      </div>
    ) : null;
  }
  return (
    <section
      aria-labelledby="development-rules"
      className="col-span-full rounded border border-slate-200 bg-white"
      data-testid="development-rules-section"
    >
      <div className="border-b border-slate-100 px-3 py-2">
        <h3 id="development-rules" className="text-sm font-semibold text-slate-900">
          Development rules
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Validated public parcel-rule results. Existing-building and project compliance remain separate.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {feasibility.rules.map((rule) => (
          <article
            className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(150px,0.38fr)_1fr]"
            data-rule-family={rule.family}
            key={rule.id}
          >
            <div>
              <h4 className="text-sm font-medium text-slate-900">{rule.name}</h4>
              <span className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs font-medium ${stateClass(rule.state)}`}>
                {rule.stateLabel}
              </span>
            </div>
            <div>
              <p className="text-sm leading-5 text-slate-800">{rule.answer}</p>
              {rule.requirement || rule.fact ? (
                <p className="mt-1 text-xs text-slate-500">
                  {rule.fact ? `Parcel fact: ${rule.fact}` : null}
                  {rule.fact && rule.requirement ? " · " : null}
                  {rule.requirement ? `Rule: ${rule.requirement}` : null}
                </p>
              ) : null}
              <p className="mt-1 text-xs leading-5 text-slate-500">{rule.explanation}</p>
              <RuleEvidence rule={rule} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
