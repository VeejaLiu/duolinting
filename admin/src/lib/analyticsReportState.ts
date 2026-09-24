export type AnalyticsRow = Record<string, unknown>;

export type AnalyticsReportResult<T> = {
  requestKey: string;
  report: T;
};

/** Effects run after render. Hide a previous tab/filter's payload during that first render too. */
export function currentAnalyticsReport<T>(
  result: AnalyticsReportResult<T> | null,
  requestKey: string,
): T | null {
  return result?.requestKey === requestKey ? result.report : null;
}

/** Optional summary fields can produce [undefined]; only actual records can supply table columns. */
export function analyticsRows(value: unknown): AnalyticsRow[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is AnalyticsRow =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}
