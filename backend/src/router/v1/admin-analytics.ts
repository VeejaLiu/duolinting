import express from "express";
import { randomUUID } from "node:crypto";
import {
  analyticsReport,
  clearAnalyticsReportCache,
} from "../../general/analytics/reports";
import { rows, write, sqlTime } from "../../general/analytics/service";
import {
  importTraffic,
  pruneAnalytics,
} from "../../general/analytics/operations";
const router = express.Router();
router.use((req, _res, next) => {
  if (req.method !== "GET") clearAnalyticsReportCache();
  next();
});
for (const kind of [
  "overview",
  "retention",
  "acquisition",
  "geography",
  "media-quality",
  "traffic",
])
  router.get("/" + kind, async (req, res) => {
    const report = await analyticsReport(kind, req.query);
    if (req.query.format === "csv") {
      // Exports contain aggregate rows only, suppress cohorts below five and protect spreadsheet formula cells.
      const data = report.data as Record<string, unknown>;
      const rowKeys: Record<string, string> = {
        retention: "cohorts",
        acquisition: "channels",
        geography: "countries",
        "media-quality": "quality",
        traffic: "rows",
      };
      const array = data[rowKeys[kind]] as
        | Record<string, unknown>[]
        | undefined;
      const exportRows: Record<string, unknown>[] = (array ?? [data])
        .filter((row) => {
          const samples =
            row.size ??
            row.sampleSize ??
            row.visitingUsers ??
            row.visitors ??
            row.attempts;
          return (
            kind === "overview" ||
            kind === "traffic" ||
            (samples !== undefined && Number(samples) >= 5)
          );
        })
        .map((row) => ({
          definitionVersion: report.metadata.definitionVersion,
          timezone: report.metadata.timezone,
          isComplete: report.metadata.isComplete,
          ...row,
        }));
      const keys = [...new Set(exportRows.flatMap(Object.keys))];
      const cell = (v: unknown) => {
        let s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
        if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      res
        .type("text/csv")
        .attachment(`analytics-${kind}.csv`)
        .send(
          "\uFEFF" +
            [
              keys.map(cell).join(","),
              ...exportRows.map((r) => keys.map((k) => cell(r[k])).join(",")),
            ].join("\r\n"),
        );
    } else res.send(report);
  });
router.put("/internal/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    typeof req.body.isInternal !== "boolean"
  )
    return res.sendStatus(400);
  if (
    !(await rows("select id from users where id= :userId", { userId })).length
  )
    return res.sendStatus(404);
  await write(
    "insert into analytics_user_profiles(user_id,is_internal) values(:userId,:internal) on duplicate key update is_internal= :internal",
    { userId, internal: req.body.isInternal },
  );
  res.send({ ok: true });
});
router.post("/coverage", async (req, res) => {
  const b = req.body;
  if (
    !["legacy_access", "learning", "page_view", "media_quality"].includes(
      b.metric,
    ) ||
    !["web_app", "mobile_web", "mobile_app"].includes(b.clientType) ||
    !["complete", "outage", "partial"].includes(b.status) ||
    !Number.isFinite(Date.parse(b.startsAt)) ||
    (b.endsAt &&
      (!Number.isFinite(Date.parse(b.endsAt)) ||
        Date.parse(b.endsAt) <= Date.parse(b.startsAt))) ||
    typeof b.note !== "string" ||
    b.note.length > 255 ||
    !["Asia/Shanghai", "Asia/Bangkok", "UTC", null, undefined].includes(
      b.sourceTimezone,
    )
  )
    return res.sendStatus(400);
  await write(
    "insert into analytics_coverage(metric,client_type,starts_at,ends_at,status,source_timezone,note) values(:metric,:client,:start,:end,:status,:zone,:note)",
    {
      metric: b.metric,
      client: b.clientType,
      start: sqlTime(Date.parse(b.startsAt)),
      end: b.endsAt ? sqlTime(Date.parse(b.endsAt)) : null,
      status: b.status,
      zone: b.sourceTimezone ?? null,
      note: b.note,
    },
  );
  res.send({ ok: true });
});
router.post("/traffic/import", async (req, res) =>
  res.send(await importTraffic(req.body.partitions)),
);
router.post("/maintenance", async (_req, res) =>
  res.send(await pruneAnalytics()),
);
router.post("/upload-finished", async (req, res) => {
  const b = req.body;
  if (
    !/^[0-9a-f-]{36}$/i.test(b.operationId) ||
    !["success", "failed", "timeout", "cancelled"].includes(b.reason) ||
    ![b.durationMs, b.logicalBytes, b.retryCount].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    b.durationMs > 86400000 ||
    b.logicalBytes > 10 ** 12 ||
    b.retryCount > 100
  )
    return res.sendStatus(400);
  const id = b.operationId,
    session = randomUUID(),
    properties = JSON.stringify({
      attemptId: id,
      reason: b.reason,
      durationMs: b.durationMs,
      logicalBytes: b.logicalBytes,
      retryCount: b.retryCount,
    });
  await write(
    `insert ignore into analytics_events(event_id,event_name,identity_epoch,analytics_session_id,seq,event_at,received_at,stat_date,client_type,surface,environment,country_code,geo_source,app_build,properties) values(:id,'upload_finished','admin',:session,1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),date(UTC_TIMESTAMP()+interval 8 hour),'web_app','admin',:environment,'unknown','unknown',:build,:properties)`,
    {
      id,
      session,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      build: String(b.appBuild ?? "unknown").slice(0, 64),
      properties,
    },
  );
  res.send({ ok: true });
});
router.use(((error, _req, res, next) => {
  if (error.status && error.status < 500)
    return res.status(error.status).send({ message: error.message });
  next(error);
}) as express.ErrorRequestHandler);
export default router;
