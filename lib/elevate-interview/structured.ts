import type {
  Classification,
  DisqualifierDecision,
  ElevateBuyBox,
  InterviewSectionId,
  OptionalExample,
  SectionStatus,
  StructuredInterviewAnswers,
} from "./schema";

export const INTERVIEW_SECTIONS: ReadonlyArray<{
  id: InterviewSectionId;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    id: "service_area",
    title: "Service area",
    shortTitle: "Service area",
    description: "Where Elevate actively pursues ROW work.",
  },
  {
    id: "scopes",
    title: "Desired ROW scopes",
    shortTitle: "ROW scopes",
    description: "The work Elevate wants, considers, or normally excludes.",
  },
  {
    id: "economics",
    title: "Project economics",
    shortTitle: "Economics",
    description: "A useful contract-value floor and preferred range.",
  },
  {
    id: "customers",
    title: "Preferred customer types",
    shortTitle: "Customers",
    description: "Which buyer groups should receive priority.",
  },
  {
    id: "contacts",
    title: "Contact preference",
    shortTitle: "Contacts",
    description: "Who TruLot should prioritize when several contacts exist.",
  },
  {
    id: "timing",
    title: "Lead timing",
    shortTitle: "Timing",
    description: "The earliest useful signal, ideal outreach, and too-late point.",
  },
  {
    id: "disqualifiers",
    title: "Hard disqualifiers",
    shortTitle: "Disqualifiers",
    description: "Obvious opportunities to suppress from the first batch.",
  },
  {
    id: "capacity_examples",
    title: "Pursuit capacity and examples",
    shortTitle: "Capacity",
    description: "A realistic daily load and optional fit examples.",
  },
] as const;

export const SCOPE_OPTIONS = [
  { id: "sidewalks", label: "Sidewalks" },
  { id: "curb_gutter", label: "Curb & gutter" },
  { id: "driveway_approaches", label: "Driveway/approach replacements" },
  { id: "ada_ramps", label: "ADA ramps & tactile domes" },
  { id: "utility_trenching", label: "Trenching/excavation for utilities" },
  {
    id: "utility_laterals",
    label: "Utility laterals (water/sewer/gas/power/comm) and tie-ins",
  },
  { id: "mainline_utilities", label: "Mainline utility work (water/sewer/storm)" },
  { id: "traffic_control", label: "Traffic control (setups, MOT)" },
  {
    id: "restoration",
    label: "Street/asphalt/concrete restoration & patch-back",
  },
  {
    id: "frontage_improvements",
    label: "Frontage/public improvements (full frontage packages)",
  },
  {
    id: "encroachment_coordination",
    label: "Encroachment permitting & inspections coordination",
  },
  { id: "storm_structures", label: "Storm drain structures/inlets" },
] as const;

export const CUSTOMER_OPTIONS = [
  { id: "general_contractors", label: "General contractors" },
  { id: "utilities", label: "Utilities" },
  { id: "developers_owners", label: "Developers / owners" },
  { id: "public_agencies", label: "Direct public-agency work" },
] as const;

export const CONTACT_OPTIONS = [
  "Estimating / preconstruction",
  "Project manager",
  "Company owner / operations",
  "Developer / owner’s representative",
  "Civil engineer / permit applicant as a fallback",
] as const;

export const EARLIEST_TIMING_OPTIONS = [
  "Building/grading plan check submitted",
  "First plan-check corrections issued",
  "Encroachment/ROW or traffic-control permit applied",
  "Utility service/lateral application submitted",
  "Building permit issued with frontage/utility conditions",
  "Other",
  "Not sure yet",
] as const;

export const IDEAL_TIMING_OPTIONS = [
  "First corrections clearly scope ROW work",
  "ROW/encroachment permit applied",
  "ROW permit approved",
  "GC or estimator identified",
  "Project enters pre-bid",
  "Building permit nearing issuance",
  "Other",
  "Not sure yet",
] as const;

export const TOO_LATE_OPTIONS = [
  "Mobilization begins",
  "Inspector scheduling begins",
  "Paving/patch-back scheduled",
  "Work is underway",
  "Work completed",
  "No firm cutoff",
  "Other",
  "Not sure yet",
] as const;

export const DISQUALIFIER_OPTIONS = [
  {
    id: "private_only",
    label: "No public ROW impact / private on-site work only",
  },
  { id: "agency_prime", label: "Direct-to-agency prime bid" },
  {
    id: "outside_geography",
    label: "Outside Elevate’s selected service geography",
  },
  { id: "traffic_only", label: "Traffic-control-only opportunity" },
  {
    id: "design_only",
    label: "Design-only or feasibility-only work with no construction",
  },
] as const;

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  core: "Core",
  selective: "Selective",
  excluded: "Excluded",
  unassigned: "Unassigned",
};

export const DISQUALIFIER_LABELS: Record<DisqualifierDecision, string> = {
  suppress: "Suppress",
  conditional: "Conditional",
  allow: "Allow",
  unassigned: "Unassigned",
};

export function createInitialSectionStatus(): Record<
  InterviewSectionId,
  SectionStatus
> {
  return Object.fromEntries(
    INTERVIEW_SECTIONS.map((section) => [section.id, "pending"]),
  ) as Record<InterviewSectionId, SectionStatus>;
}

export function createInitialAnswers(): StructuredInterviewAnswers {
  return {
    serviceArea: {
      geographies: [
        {
          id: "san_diego_county",
          label: "San Diego County",
          classification: "unassigned",
        },
        {
          id: "southwest_riverside",
          label: "Southwest Riverside County",
          classification: "unassigned",
        },
        {
          id: "orange_county",
          label: "Orange County",
          classification: "unassigned",
        },
        {
          id: "imperial_county",
          label: "Imperial County",
          classification: "unassigned",
        },
      ],
      mobilizationNote: "",
    },
    scopes: {
      classifications: Object.fromEntries(
        SCOPE_OPTIONS.map((scope) => [scope.id, "unassigned"]),
      ),
      additionalScopes: "",
      notes: "",
    },
    economics: {
      ordinaryMinimumContractValue: null,
      preferredContractValueMin: null,
      preferredContractValueMax: null,
      exceptionChoices: [],
      exceptionNote: "",
      notes: "",
    },
    customers: {
      classifications: Object.fromEntries(
        CUSTOMER_OPTIONS.map((customer) => [customer.id, "unassigned"]),
      ),
      notes: "",
    },
    contacts: {
      primary: null,
      secondary: null,
      useBestAvailable: false,
      notes: "",
    },
    timing: {
      earliest: null,
      ideal: [],
      tooLate: null,
      notes: "",
    },
    disqualifiers: {
      decisions: Object.fromEntries(
        DISQUALIFIER_OPTIONS.map((item) => [
          item.id,
          { decision: "unassigned", note: "" },
        ]),
      ),
      customItems: [],
      noHardDisqualifiers: false,
      notes: "",
    },
    capacityExamples: {
      leadsPerWeekday: null,
      outreachPerWeekday: null,
      followUpOwner: "",
      responseTime: "",
      goodFit: emptyExample(),
      badFit: emptyExample(),
      notes: "",
    },
  };
}

function emptyExample(): OptionalExample {
  return {
    projectOrLocation: "",
    scopes: "",
    contractRange: "",
    customerType: "",
    fitReason: "",
  };
}

function classify(
  options: ReadonlyArray<{ id: string; label: string }>,
  values: Record<string, Classification>,
  target: Classification,
) {
  return options
    .filter((option) => (values[option.id] ?? "unassigned") === target)
    .map((option) => option.label);
}

function classifiedGeographies(
  answers: StructuredInterviewAnswers,
  target: Classification,
) {
  return answers.serviceArea.geographies
    .filter((item) => item.classification === target)
    .map((item) => item.label);
}

function disqualifierGroup(
  answers: StructuredInterviewAnswers,
  target: DisqualifierDecision,
) {
  const builtIn = DISQUALIFIER_OPTIONS.filter(
    (item) =>
      (answers.disqualifiers.decisions[item.id]?.decision ?? "unassigned") ===
      target,
  ).map((item) => {
    const note = answers.disqualifiers.decisions[item.id]?.note.trim();
    return note ? `${item.label} — ${note}` : item.label;
  });
  const custom = answers.disqualifiers.customItems
    .filter((item) => item.decision === target)
    .map((item) => (item.note.trim() ? `${item.label} — ${item.note}` : item.label));
  return [...builtIn, ...custom];
}

function exampleToText(example: OptionalExample) {
  const parts = [
    example.projectOrLocation,
    example.scopes,
    example.contractRange,
    example.customerType,
    example.fitReason,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function buildElevateBuyBox(
  answers: StructuredInterviewAnswers,
  status: Record<InterviewSectionId, SectionStatus>,
  approval?: { approvedAt: string | null },
): ElevateBuyBox {
  const unresolvedQuestions = INTERVIEW_SECTIONS.filter(
    (section) =>
      status[section.id] === "skipped" || status[section.id] === "unresolved",
  ).map((section) =>
    status[section.id] === "skipped"
      ? `${section.title} was skipped for now.`
      : `${section.title} contains unresolved selections.`,
  );

  const scopeUnresolved = classify(
    SCOPE_OPTIONS,
    answers.scopes.classifications,
    "unassigned",
  );
  const customerUnresolved = classify(
    CUSTOMER_OPTIONS,
    answers.customers.classifications,
    "unassigned",
  );
  const screeningUnresolved = disqualifierGroup(answers, "unassigned");
  const goodFitText = exampleToText(answers.capacityExamples.goodFit);
  const badFitText = exampleToText(answers.capacityExamples.badFit);

  const exceptionChoices = [
    ...answers.economics.exceptionChoices,
    ...(answers.economics.exceptionNote.trim()
      ? [answers.economics.exceptionNote.trim()]
      : []),
  ];

  const notes = [answers.economics.notes.trim()].filter(Boolean).join(" ");

  return {
    version: "0.1",
    participantName: "Cesar",
    companyName: "Elevate",
    serviceGeography: {
      coreMarkets: classifiedGeographies(answers, "core"),
      selectiveMarkets: classifiedGeographies(answers, "selective"),
      excludedMarkets: classifiedGeographies(answers, "excluded"),
      mobilizationNotes: answers.serviceArea.mobilizationNote.trim() || null,
    },
    scopes: {
      core: classify(SCOPE_OPTIONS, answers.scopes.classifications, "core"),
      selective: classify(
        SCOPE_OPTIONS,
        answers.scopes.classifications,
        "selective",
      ),
      excluded: classify(
        SCOPE_OPTIONS,
        answers.scopes.classifications,
        "excluded",
      ),
      unresolved: scopeUnresolved,
      notes:
        [answers.scopes.additionalScopes.trim(), answers.scopes.notes.trim()]
          .filter(Boolean)
          .join(" — ") || null,
    },
    economics: {
      ordinaryMinimumContractValue:
        answers.economics.ordinaryMinimumContractValue,
      preferredContractValueMin: answers.economics.preferredContractValueMin,
      preferredContractValueMax: answers.economics.preferredContractValueMax,
      minimumGrossProfit: null,
      strategicExceptions: exceptionChoices,
      notes: notes || null,
    },
    customerTypes: {
      core: classify(
        CUSTOMER_OPTIONS,
        answers.customers.classifications,
        "core",
      ),
      selective: classify(
        CUSTOMER_OPTIONS,
        answers.customers.classifications,
        "selective",
      ),
      excluded: classify(
        CUSTOMER_OPTIONS,
        answers.customers.classifications,
        "excluded",
      ),
      unresolved: customerUnresolved,
      notes: answers.customers.notes.trim() || null,
    },
    preferredProjectTypes: [],
    excludedProjectTypes: [],
    preferredCustomerTypes: [
      ...classify(
        CUSTOMER_OPTIONS,
        answers.customers.classifications,
        "core",
      ),
      ...classify(
        CUSTOMER_OPTIONS,
        answers.customers.classifications,
        "selective",
      ),
    ],
    targetAccounts: [],
    existingCustomers: [],
    doNotContactAccounts: [],
    preferredContactRoles: answers.contacts.useBestAvailable
      ? ["Use the best available named contact"]
      : [answers.contacts.primary, answers.contacts.secondary].filter(
          (value): value is string => Boolean(value),
        ),
    contactPreference: {
      primary: answers.contacts.primary,
      secondary: answers.contacts.secondary,
      useBestAvailable: answers.contacts.useBestAvailable,
      notes: answers.contacts.notes.trim() || null,
    },
    timing: {
      earliestUsefulStage: answers.timing.earliest,
      idealOutreachStage: answers.timing.ideal.join("; ") || null,
      idealOutreachStages: answers.timing.ideal,
      tooLateStage: answers.timing.tooLate,
      timingNotes: answers.timing.notes.trim() || null,
    },
    disqualifiers: answers.disqualifiers.noHardDisqualifiers
      ? []
      : disqualifierGroup(answers, "suppress"),
    screeningRules: {
      suppress: answers.disqualifiers.noHardDisqualifiers
        ? []
        : disqualifierGroup(answers, "suppress"),
      conditional: answers.disqualifiers.noHardDisqualifiers
        ? []
        : disqualifierGroup(answers, "conditional"),
      allow: answers.disqualifiers.noHardDisqualifiers
        ? []
        : disqualifierGroup(answers, "allow"),
      unresolved: answers.disqualifiers.noHardDisqualifiers
        ? []
        : screeningUnresolved,
      notes: answers.disqualifiers.notes.trim() || null,
    },
    capacity: {
      leadsReviewablePerWeekday: answers.capacityExamples.leadsPerWeekday,
      outreachActionsPerWeekday: answers.capacityExamples.outreachPerWeekday,
      followUpOwner: answers.capacityExamples.followUpOwner.trim() || null,
      expectedResponseTime:
        answers.capacityExamples.responseTime.trim() || null,
    },
    goodFitExamples: goodFitText ? [goodFitText] : [],
    badFitExamples: badFitText ? [badFitText] : [],
    examples: {
      goodFit: goodFitText ? answers.capacityExamples.goodFit : null,
      badFit: badFitText ? answers.capacityExamples.badFit : null,
    },
    sectionStatus: status,
    unresolvedQuestions: [
      ...unresolvedQuestions,
      ...(scopeUnresolved.length ? ["Some ROW scopes remain unassigned."] : []),
      ...(customerUnresolved.length
        ? ["Some customer types remain unassigned."]
        : []),
      ...(screeningUnresolved.length &&
      !answers.disqualifiers.noHardDisqualifiers
        ? ["Some screening rules remain unassigned."]
        : []),
    ],
    confidence:
      unresolvedQuestions.length === 0 &&
      scopeUnresolved.length === 0 &&
      customerUnresolved.length === 0
        ? "high"
        : "medium",
    approvedByCesar: Boolean(approval?.approvedAt),
    approvedAt: approval?.approvedAt ?? null,
  };
}

export function nextSection(current: InterviewSectionId) {
  const index = INTERVIEW_SECTIONS.findIndex((section) => section.id === current);
  return INTERVIEW_SECTIONS[index + 1]?.id ?? "review";
}

export function sectionTitle(sectionId: InterviewSectionId) {
  return (
    INTERVIEW_SECTIONS.find((section) => section.id === sectionId)?.title ??
    sectionId
  );
}
