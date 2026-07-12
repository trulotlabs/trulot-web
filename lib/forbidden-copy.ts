export const FORBIDDEN_COPY_TERMS = [
  "can build",
  "will allow",
  "guaranteed",
  "best use",
  "underutilized",
  "hidden value",
  "maximize",
  "investment opportunity",
] as const;

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findForbiddenCopy(text: string): string[] {
  const haystack = normalizeText(text);
  return FORBIDDEN_COPY_TERMS.filter((term) => haystack.includes(term));
}

export function assertNoForbiddenCopy(text: string, context: string): void {
  const found = findForbiddenCopy(text);
  if (found.length > 0) {
    throw new Error(`Forbidden copy in ${context}: ${found.join(", ")}`);
  }
}

export function assertNoForbiddenCopyInList(items: string[], context: string): void {
  for (const [index, item] of items.entries()) {
    assertNoForbiddenCopy(item, `${context}[${index}]`);
  }
}
