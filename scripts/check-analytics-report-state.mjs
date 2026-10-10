import assert from "node:assert/strict";
import {
  analyticsRows,
  currentAnalyticsReport,
  analyticsDisplayValue,
  retentionRows,
} from "../admin/src/lib/analyticsReportState.ts";

const requestKey = (tab, query = "range-a", refresh = 0) =>
  JSON.stringify([tab, query, "test-identity", refresh]);
assert.equal(analyticsDisplayValue("playMs", 6008551), 6008551 / 60000);
assert.equal(analyticsDisplayValue("playMs", null), null);
assert.equal(analyticsDisplayValue("playMs", 0), 0);
assert.equal(analyticsDisplayValue("registrations", 34), 34);
const overview = {
  requestKey: requestKey("overview"),
  report: { activation: { numerator: 2, denominator: 9 } },
};
assert.equal(
  currentAnalyticsReport(overview, requestKey("overview")),
  overview.report,
);
// Reproduce the render immediately after clicking Retention, before its fetch effect can clear state.
assert.equal(currentAnalyticsReport(overview, requestKey("retention")), null);
assert.equal(
  currentAnalyticsReport(overview, requestKey("overview", "range-b")),
  null,
);
assert.equal(
  currentAnalyticsReport(overview, requestKey("overview", "range-a", 1)),
  null,
);
const lateRetention = {
  requestKey: requestKey("retention"),
  report: { weekly: { sustained: 1 } },
};
assert.equal(
  currentAnalyticsReport(lateRetention, requestKey("geography")),
  null,
);
assert.equal(currentAnalyticsReport(null, requestKey("overview")), null);

// Missing summaries must never reach Object.keys as undefined or null.
for (const value of [
  undefined,
  null,
  {},
  [undefined],
  [null],
  [undefined, null, false, 7, "bad", []],
]) {
  assert.deepEqual(analyticsRows(value).flatMap(Object.keys), []);
}
const rows = [{ numerator: 0, denominator: 0 }, { numerator: null }];
assert.deepEqual(analyticsRows([null, rows[0], undefined, rows[1]]), rows);
assert.deepEqual(
  [...new Set(analyticsRows(rows).flatMap(Object.keys))],
  ["numerator", "denominator"],
);
// An incomplete but mature window must remain visible. Sorting must not mutate
// a cached response, and D7 filtering must not use D1's maturity.
const cohorts = [
  { cohortDate: "2026-09-01", cells: [{ offset: 1, status: "complete" }, { offset: 7, status: "incomplete" }], windowRetention: { status: "incomplete" } },
  { cohortDate: "2026-10-10", cells: [{ offset: 1, status: "observing" }, { offset: 7, status: "observing" }], windowRetention: { status: "observing" } },
  { cohortDate: "2026-10-07", cells: [{ offset: 1, status: "incomplete" }, { offset: 7, status: "observing" }], windowRetention: { status: "observing" } },
];
assert.deepEqual(retentionRows(cohorts, "all").map((row) => row.cohortDate), ["2026-10-10", "2026-10-07", "2026-09-01"]);
assert.equal(cohorts[0].cohortDate, "2026-09-01");
assert.deepEqual(retentionRows(cohorts, "1").map((row) => row.cohortDate), ["2026-10-07", "2026-09-01"]);
assert.deepEqual(retentionRows(cohorts, "7").map((row) => row.cohortDate), ["2026-09-01"]);
assert.deepEqual(retentionRows(cohorts, "w1").map((row) => row.cohortDate), ["2026-09-01"]);
assert.deepEqual(retentionRows([], "30"), []);
console.log(
  "Analytics report regression checks passed: tab/filter/refresh isolation, late responses, missing summaries and valid zero/null metrics.",
);
