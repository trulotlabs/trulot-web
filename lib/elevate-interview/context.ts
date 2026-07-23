export type ElevateContextSource = {
  id: string;
  type: "pilot_brief" | "curated_email" | "customer_note";
  title: string;
  content: string;
  sourceDate?: string;
};

export const elevateContextSources: ElevateContextSource[] = [
  {
    id: "elevate-row-pilot-v0.1",
    type: "pilot_brief",
    title: "TruLot–Elevate ROW Revenue Lead Pilot",
    content: [
      "TruLot is defining a recurring Elevate Revenue Brief from timely municipal permit and project signals.",
      "Revenue generation is the north star: signal → qualified opportunity → outreach → conversation → bid → won revenue → feedback.",
      "The brief may include address, project description, permit IDs, trigger, stage, likely ROW need and scope, parties and contact path, evidence, priority, confidence, next action, and a permanent lead ID.",
      "The interview decides what should and should not enter that brief. Cesar's operating judgment outranks generic construction assumptions.",
      "Possible ROW scopes are hypotheses only: sidewalks, curb and gutter, approaches, ADA ramps, trenching, utilities, traffic control, street restoration, asphalt, frontage/public improvements, encroachment permits, and street, sewer, water, storm-drain, or lateral work.",
    ].join("\n"),
  },
];
