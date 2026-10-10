export type AnalyticsRow = Record<string, unknown>;
export type RetentionCell = {
  status: string;
  retained: number | null;
  observedRetained?: number | null;
  denominator: number;
  percent?: number | null;
  availableOn?: string;
  incompleteReasons?: string[];
};
export type RetentionCohort = AnalyticsRow & {
  cohortDate: string;
  windowRetention: RetentionCell;
  cells: (RetentionCell & { offset: number })[];
};

/** Maturity means the target Shanghai calendar day has ended, not that
 * telemetry is complete. Keep incomplete cohorts visible when filtering. */
export function retentionRows(rows: RetentionCohort[], window: string): RetentionCohort[] {
  return rows.filter((row) => {
    if (window === "all") return true;
    const cell = window === "w1"
      ? row.windowRetention
      : row.cells?.find((item) => item.offset === Number(window));
    return Boolean(cell && cell.status !== "observing");
  }).sort((a, b) => b.cohortDate.localeCompare(a.cohortDate));
}
/** Backend playMs is always milliseconds; every presentation uses minutes. */
export function analyticsDisplayValue(key: string, value: unknown): unknown {
  return key === "playMs" && value !== null && value !== undefined ? Number(value) / 60000 : value;
}

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
