import { isoDateSchema } from "./schema";

export type FollowUpQuickAction =
  | "tomorrow"
  | "three_days"
  | "one_week"
  | "two_weeks"
  | "one_month";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function validateFollowUpDate(
  value: string | null,
  minimum = localIsoDate(),
) {
  if (!value) return null;
  if (!isoDateSchema.safeParse(value).success) {
    return "Enter a real date in YYYY-MM-DD format.";
  }
  if (value < minimum) {
    return "Choose today or a future date.";
  }
  return null;
}

export function quickFollowUpDate(
  action: FollowUpQuickAction,
  today = new Date(),
) {
  const date = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (action === "one_month") {
    const originalDay = date.getDate();
    const targetMonth = date.getMonth() + 1;
    date.setDate(1);
    date.setMonth(targetMonth);
    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return localIsoDate(date);
  }
  const days = {
    tomorrow: 1,
    three_days: 3,
    one_week: 7,
    two_weeks: 14,
  }[action];
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}
