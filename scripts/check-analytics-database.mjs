import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
const e = dotenv.parse(fs.readFileSync("backend/.env"));
assert.ok(
  ["127.0.0.1", "localhost", "::1"].includes(e.MYSQL_HOST || "127.0.0.1"),
  "Integration fixtures require a local database",
);
const config = {
  host: e.MYSQL_HOST || "127.0.0.1",
  port: Number(e.MYSQL_PORT || 3306),
  user: e.MYSQL_USER || e.MYSQL_USERNAME || "root",
  password: e.MYSQL_PASSWORD || "",
};
const source = e.MYSQL_DATABASE;
assert.match(source, /^[a-zA-Z0-9_]+$/);
const database = "analytics_test_" + crypto.randomBytes(6).toString("hex");
const db = await mysql.createConnection({
  ...config,
  multipleStatements: true,
});
let sequelize;
try {
  await db.query(`create database \`${database}\``);
  await db.query(`use \`${database}\``);
  for (const table of [
    "users",
    "user_sessions",
    "user_access_daily",
    "exercises",
    "exercise_progress",
    "line_progress",
    "vocabulary_items",
    "accepted_answer_feedback",
    "user_preferences",
    "user_daily_activity",
    "admin_users",
  ])
    await db.query(`create table \`${table}\` like \`${source}\`.\`${table}\``);
  await db.query(
    fs.readFileSync(
      "infra/mysql/migrations/V202609240002__growth_analytics_v2.sql",
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      "infra/mysql/migrations/V202609240003__activity_operation_idempotency.sql",
      "utf8",
    ),
  );
  Object.assign(process.env, e, {
    MYSQL_DATABASE: database,
    MYSQL_LOGGING: "false",
    NODE_ENV: "test",
  });
  const service = await import("../backend/src/general/analytics/service.ts");
  const sessions =
    await import("../backend/src/general/user/user-session-service.ts");
  const reports = await import("../backend/src/general/analytics/reports.ts");
  const ops = await import("../backend/src/general/analytics/operations.ts");
  ({ sequelize } = await import("../backend/src/models/db-config-mysql.ts"));
  await db.query(
    "insert into users(id,email,display_name,password_hash) values(1,'analytics-fixture@example.invalid','Fixture','not-a-login-hash')",
  );
  await db.query(
    "insert into analytics_user_profiles(user_id,registration_country,consent) values(1,'CN','granted')",
  );
  await db.query(
    "insert into exercises(id,category_id,title,source,difficulty,duration_label,audio_url,summary,transcript_json,status) values(1,1,'Fixture','fixture','beginner','1 min','/fixture.mp3','Fixture',?,'published')",
    [JSON.stringify([{ id: "line-1", start: 0, end: 10, text: "fixture" }])],
  );
  const { default: bcrypt } = await import("bcryptjs");
  await db.query("update users set password_hash=? where id=1", [
    await bcrypt.hash("fixture-password", 4),
  ]);
  const token = await sessions.issueUserSession({
    userId: 1,
    clientType: "web_app",
  });
  await db.query("delete from user_access_daily");
  const req = {
    body: { consent: true, clientType: "web_app", surface: "learner" },
    headers: { authorization: "Bearer " + token },
    cookies: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    app: { get: () => () => false },
    get: () => undefined,
  };
  const context = await service.createContext(req);
  await db.query(
    "update analytics_sessions set environment='production',started_at=UTC_TIMESTAMP()-interval 10 minute where analytics_session_id=?",
    [context.analyticsSessionId],
  );
  const [course] = await service.rows(
    "select transcript_json,audio_url from exercises where id=1",
  );
  const version = service.publishedVersion(course),
    study = crypto.randomUUID();
  let seq = 0;
  const at = Date.now() - 1000;
  const event = (name, properties = {}, offset = 0, extra = {}) => ({
    eventId: crypto.randomUUID(),
    eventName: name,
    occurredAt: new Date(at + offset).toISOString(),
    analyticsSessionId: context.analyticsSessionId,
    identityEpoch: context.identityEpoch,
    seq: ++seq,
    appBuild: "test",
    exerciseId: 1,
    courseVersion: version,
    studySessionId: study,
    properties,
    ...extra,
  });
  const start = event("study_started", { mode: "intensive" }, -210000);
  const intervals = Array.from({ length: 13 }, (_, i) => [
    at - 195000 + i * 15000,
    at - 180000 + i * 15000,
  ]);
  const heartbeat = event("study_heartbeat", { intervals });
  const ingest = async (events) =>
    service.ingestEvents({ ...req, body: { schemaVersion: 1, events } });
  let result = await ingest([start, heartbeat]);
  assert.deepEqual(
    result.results.map((r) => r.status),
    ["accepted", "accepted"],
  );
  for (let i = 0; i < 10; i++)
    assert.equal((await ingest([heartbeat])).results[0].status, "duplicate");
  assert.equal(
    (await ingest([{ ...heartbeat, eventId: crypto.randomUUID() }])).results[0]
      .status,
    "duplicate",
  );
  const [daily] = await service.rows(
    "select * from analytics_user_daily where user_id=1",
  );
  assert.equal(Number(daily.play_ms), 195000);
  assert.equal(Number(daily.qualified), 1);
  const [profile] = await service.rows(
    "select * from analytics_user_profiles where user_id=1",
  );
  assert.ok(profile.activated_at);
  assert.equal(profile.registration_country, "CN");
  const [legacy] = await service.rows(
    "select count(*) as n from user_access_daily",
  );
  assert.equal(Number(legacy.n), 0);
  const attemptId = crypto.randomUUID();
  const attempt = event(
    "play_attempt",
    { attemptId, trigger: "sentence", lineId: "line-1", mediaType: "audio" },
    -1000,
  );
  const started = event("play_started", { attemptId, latencyMs: 100 }, -900);
  const practice = event(
    "sentence_practiced",
    { lineId: "line-1", action: "mastery" },
    0,
    { operationId: crypto.randomUUID() },
  );
  assert.deepEqual(
    (await ingest([attempt, started, practice])).results.map((r) => r.status),
    ["accepted", "accepted", "accepted"],
  );
  await ingest([
    {
      ...practice,
      eventId: crypto.randomUUID(),
      seq: ++seq,
      operationId: crypto.randomUUID(),
    },
  ]);
  assert.equal(
    Number(
      (
        await service.rows(
          "select practice_count from analytics_user_daily where user_id=1",
        )
      )[0].practice_count,
    ),
    1,
  );
  const second = await service.createContext({
    ...req,
    body: { consent: true, clientType: "mobile_app", surface: "learner" },
  });
  await db.query(
    "update analytics_sessions set environment='production',started_at=UTC_TIMESTAMP()-interval 10 minute where analytics_session_id=?",
    [second.analyticsSessionId],
  );
  const secondEvents = [
    {
      ...start,
      eventId: crypto.randomUUID(),
      analyticsSessionId: second.analyticsSessionId,
      identityEpoch: second.identityEpoch,
      seq: 1,
    },
    {
      ...heartbeat,
      eventId: crypto.randomUUID(),
      analyticsSessionId: second.analyticsSessionId,
      identityEpoch: second.identityEpoch,
      seq: 2,
    },
  ];
  assert.deepEqual(
    (await ingest(secondEvents)).results.map((r) => r.status),
    ["accepted", "accepted"],
  );
  assert.equal(
    Number(
      (
        await service.rows(
          "select play_ms from analytics_user_daily where user_id=1",
        )
      )[0].play_ms,
    ),
    195000,
  );
  const foreign = await service.ingestEvents({
    ...req,
    headers: {},
    body: { schemaVersion: 1, events: [event("study_ended")] },
  });
  assert.equal(foreign.results[0].code, "identity_mismatch");
  for (const kind of [
    "overview",
    "retention",
    "geography",
    "acquisition",
    "media-quality",
    "traffic",
  ]) {
    const report = await reports.analyticsReport(kind, {});
    assert.equal(report.metadata.timezone, "Asia/Shanghai");
    if (kind === "traffic") assert.equal(report.data.downstreamBytes, null);
  }

  // A report's cohort range is not its observation cutoff: D7 can lie after `to`.
  const cohortDay = new Date(Date.now() - 20 * 86400000)
    .toISOString()
    .slice(0, 10);
  const returnDay = new Date(Date.now() - 13 * 86400000)
    .toISOString()
    .slice(0, 10);
  await db.query(
    "insert into users(id,email,display_name,password_hash,created_at) values(2,'retention-fixture@example.invalid','Retention fixture','not-a-login-hash',?)",
    [cohortDay + " 04:00:00"],
  );
  await db.query(
    "insert into analytics_user_profiles(user_id,consent,consent_changed_at,activated_at) values(2,'granted',?,?)",
    [cohortDay + " 04:00:00", cohortDay + " 04:10:00"],
  );
  await db.query(
    "insert into user_access_daily(user_id,client_type,activity_date,first_seen_at,last_seen_at) values(2,'web_app',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",
    [returnDay],
  );
  await db.query(
    "insert into analytics_user_daily(user_id,stat_date,play_ms,qualified,intervals,practiced_lines) values(2,?,60000,1,'[]','[]')",
    [returnDay],
  );
  for (const metric of ["learning", "legacy_access"])
    for (const client of ["web_app", "mobile_web", "mobile_app"])
      await db.query(
        "insert into analytics_coverage(metric,client_type,starts_at,status,source_timezone) values(?, ?, UTC_TIMESTAMP()-interval 1 year,'complete','Asia/Bangkok')",
        [metric, client],
      );
  for (const cohortType of ["access", "learning"]) {
    const retention = await reports.analyticsReport("retention", {
      from: cohortDay,
      to: cohortDay,
      cohortType,
    });
    assert.equal(
      retention.data.cohorts[0].cells.find((cell) => cell.offset === 7)
        .retained,
      1,
    );
    assert.equal(
      retention.data.cohorts[0].cells.find((cell) => cell.offset === 30).status,
      "observing",
    );
  }
  await db.query(
    "update analytics_user_profiles set is_internal=1 where user_id=2",
  );
  const traffic = {
    statDate: new Date().toISOString().slice(0, 10),
    provider: "fixture",
    host: "example.invalid",
    deliveryRole: "downstream",
    dimensionType: "country",
    dimensionValue: "CN",
    resourceType: "video",
    sourceId: "fixed-partition",
    bytes: 1000,
    requests: 10,
    errors: 1,
    hits: 9,
    sampling: 1,
    completeness: "complete",
  };
  await ops.importTraffic([traffic]);
  await ops.importTraffic([{ ...traffic, bytes: 1200 }]);
  const [bytes] = await service.rows(
    "select sum(bytes) as n from analytics_traffic_daily",
  );
  assert.equal(Number(bytes.n), 1200);
  await service.revokeContext({
    ...req,
    body: { identityEpoch: context.identityEpoch },
  });
  assert.equal(
    (await ingest([event("study_ended")])).results[0].code,
    "identity_mismatch",
  );
  const { getAdminGrowthReport } =
    await import("../backend/src/general/admin/user-activity-service.ts");
  assert.equal((await getAdminGrowthReport()).summary.totalUsers, 1);
  const { recordMasteredActivity } =
    await import("../backend/src/general/progress/daily-activity-service.ts");
  const op = crypto.randomUUID();
  await recordMasteredActivity(1, "2026-09-24", 1, op);
  await recordMasteredActivity(1, "2026-09-24", 1, op);
  assert.equal(
    Number(
      (
        await service.rows(
          "select mastered_count from user_daily_activity where user_id=1",
        )
      )[0].mastered_count,
    ),
    1,
  );
  const { deleteUserAccount } =
    await import("../backend/src/general/user/user-service.ts");
  const deleted = await deleteUserAccount({
    userId: 1,
    currentPassword: "fixture-password",
  });
  assert.equal(deleted.success, true);
  for (const table of [
    "analytics_events",
    "analytics_sessions",
    "analytics_user_profiles",
    "analytics_user_daily",
    "analytics_user_dimension_daily",
  ])
    assert.equal(
      Number(
        (
          await service.rows(
            `select count(*) as n from ${table} where user_id=1`,
          )
        )[0].n,
      ),
      0,
    );
  console.log(
    "Analytics database checks passed: atomic ingestion, repeated delivery, operation identity, activation, practice uniqueness, auth/access isolation, six reports, traffic replacement and consent revocation.",
  );
} finally {
  if (sequelize) await sequelize.close();
  await db.query(`drop database if exists \`${database}\``);
  await db.end();
}
