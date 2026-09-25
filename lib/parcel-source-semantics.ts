export type ParcelSearchQueryOutcome<T> =
  | { status: "found"; rows: T[]; httpStatus: 200 }
  | { status: "not_found"; rows: []; httpStatus: 200 }
  | { status: "source_unavailable"; rows: []; httpStatus: 503 };

export type ParcelRecordQueryOutcome<T> =
  | { status: "found"; data: T; httpStatus: 200 }
  | { status: "not_found"; data: null; httpStatus: 404 }
  | { status: "source_unavailable"; data: null; httpStatus: 503 };

export function classifyParcelSearchQuery<T>(
  rows: T[] | null | undefined,
  error: unknown,
): ParcelSearchQueryOutcome<T> {
  if (error || !Array.isArray(rows)) {
    return { status: "source_unavailable", rows: [], httpStatus: 503 };
  }
  if (rows.length === 0) {
    return { status: "not_found", rows: [], httpStatus: 200 };
  }
  return { status: "found", rows, httpStatus: 200 };
}

export function classifyParcelRecordQuery<T>(
  data: T | null | undefined,
  error: unknown,
): ParcelRecordQueryOutcome<T> {
  if (error) {
    return { status: "source_unavailable", data: null, httpStatus: 503 };
  }
  if (data === null) {
    return { status: "not_found", data: null, httpStatus: 404 };
  }
  if (data === undefined) {
    return { status: "source_unavailable", data: null, httpStatus: 503 };
  }
  return { status: "found", data, httpStatus: 200 };
}
