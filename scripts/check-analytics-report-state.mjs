import assert from "node:assert/strict";
import {
  analyticsRows,
  currentAnalyticsReport,
} from "../admin/src/lib/analyticsReportState.ts";

const requestKey = (tab, query = "range-a", refresh = 0) =>
  JSON.stringify([tab, query, "test-identity", refresh]);
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
console.log(
  "Analytics report regression checks passed: tab/filter/refresh isolation, late responses, missing summaries and valid zero/null metrics.",
);
