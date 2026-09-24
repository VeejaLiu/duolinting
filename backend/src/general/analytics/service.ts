import { readAnonymousCookie } from "./cookie";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { Request } from "express";
import { sequelize } from "../../models/db-config-mysql";
import { verifyUserSession } from "../user/user-session-service";
import { resolveRequestGeoContext } from "./geo";
import {
  intervalDuration,
  splitDays,
  statDate,
  unionIntervals,
  sanitizeAttribution,
  type AnalyticsEvent,
  type Interval,
} from "./contracts";
import { uuid, validateEvent } from "./validation";
export const utcValue = (value: unknown) =>
  value instanceof Date
    ? value.getTime()
    : Date.parse(String(value).replace(" ", "T") + "Z");
export const sqlTime = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").replace("Z", "");
export const rows = <T extends object = Record<string, any>>(
  sql: string,
  replacements: Record<string, any> = {},
  transaction?: Transaction,
) =>
  sequelize.query<T>(sql, {
    replacements,
    transaction,
    type: QueryTypes.SELECT,
  });
export const write = (
  sql: string,
  replacements: Record<string, any> = {},
  transaction?: Transaction,
) => sequelize.query(sql, { replacements, transaction });
export const json = <T>(v: T | string): T =>
  typeof v === "string" ? JSON.parse(v) : v;
export async function analyticsUser(req: Request) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const result = await verifyUserSession(token, { recordAccess: false });
    if (result.success) return result.userId;
  } catch {
    /* Reject supplied invalid credentials, never silently downgrade. */
  }
  throw Object.assign(new Error("Invalid analytics authentication"), {
    status: 401,
  });
}
const epochHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function createContext(req: Request) {
  if (/bot|crawler|spider|headless/i.test(req.get("user-agent") ?? ""))
    throw Object.assign(new Error("Automated collection excluded"), {
      status: 403,
    });
  if (req.body?.consent !== true)
    throw Object.assign(new Error("Analytics consent required"), {
      status: 400,
    });
  const userId = await analyticsUser(req);
  const now = Date.now();
  const body = req.body;
  if (
    !["web_app", "mobile_web", "mobile_app"].includes(body.clientType) ||
    !["learner", "official"].includes(body.surface)
  )
    throw Object.assign(new Error("Invalid analytics surface"), {
      status: 400,
    });
  const prior =
    typeof body.identityEpoch === "string"
      ? (
          await rows(
            "select * from analytics_sessions where identity_epoch= :epoch and revoked_at is null and expires_at>UTC_TIMESTAMP(3)",
            { epoch: epochHash(body.identityEpoch) },
          )
        )[0]
      : undefined;
  if (
    body.resume === true &&
    prior &&
    (prior.user_id === null ? null : Number(prior.user_id)) === userId &&
    prior.client_type === body.clientType &&
    prior.surface === body.surface &&
    now - utcValue(prior.last_activity_at) < 30 * 60000
  )
    return {
      analyticsSessionId: prior.analytics_session_id,
      identityEpoch: body.identityEpoch,
      anonymousId: prior.anonymous_id,
      serverTime: new Date(now).toISOString(),
      expiresAt: new Date(utcValue(prior.expires_at)).toISOString(),
    };
  const anonymousId =
    prior && (prior.user_id === null || Number(prior.user_id) === userId)
      ? prior.anonymous_id
      : (readAnonymousCookie(req) ?? randomUUID());
  const sessionId = randomUUID(),
    epoch = randomBytes(32).toString("hex");
  const geo = resolveRequestGeoContext(req);
  const [firstTouch] = await rows(
    "select attribution from analytics_sessions where anonymous_id= :anon and started_at>=UTC_TIMESTAMP()-interval 30 day and json_extract(attribution,'$.utm_source') is not null order by started_at limit 1",
    { anon: anonymousId },
  );
  const attribution = firstTouch
    ? json(firstTouch.attribution)
    : {
        ...sanitizeAttribution(body.attribution ?? {}),
        first_touch_at: new Date(now).toISOString(),
      };
  // Only a currently continuous anonymous session can link to the newly authenticated user.
  await sequelize.transaction(async (transaction) => {
    if (userId) {
      const account = await rows(
        "select id from users where id= :userId for update",
        { userId },
        transaction,
      );
      if (!account.length)
        throw Object.assign(new Error("Account unavailable"), { status: 401 });
      await write(
        "insert into analytics_user_profiles(user_id,consent,consent_changed_at,first_observed_country,first_observed_at) values(:userId,'granted',:now,:country,:now) on duplicate key update consent_changed_at=if(consent<>'granted' or consent_changed_at is null,:now,consent_changed_at),consent='granted',first_observed_country=if(first_observed_country='unknown',:country,first_observed_country),first_observed_at=coalesce(first_observed_at,:now)",
        { userId, now: sqlTime(now), country: geo.countryCode },
        transaction,
      );
    }
    if (prior) {
      if (
        prior.user_id === null &&
        userId &&
        now - utcValue(prior.last_activity_at) < 30 * 60000
      ) {
        await write(
          "update analytics_events set user_id= :userId where analytics_session_id= :session and user_id is null",
          { userId, session: prior.analytics_session_id },
          transaction,
        );
        await write(
          "update analytics_sessions set user_id= :userId where id= :id",
          { userId, id: prior.id },
          transaction,
        );
        if (prior.environment === "production" && prior.surface === "learner") {
          const historical = await rows(
            "select * from analytics_events where analytics_session_id= :session order by event_at",
            { session: prior.analytics_session_id },
            transaction,
          );
          for (const row of historical)
            await updateDaily(
              userId,
              {
                eventName: row.event_name,
                analyticsSessionId: row.analytics_session_id,
                exerciseId: row.exercise_id,
                courseVersion: row.course_version,
                occurredAt: new Date(utcValue(row.event_at)).toISOString(),
                properties: json(row.properties),
              } as AnalyticsEvent,
              row.country_code,
              row.client_type,
              transaction,
            );
        }
      }
      if (prior.user_id === null && userId)
        await write(
          "update analytics_sessions set revoked_at= :now where id= :id",
          { now: sqlTime(now), id: prior.id },
          transaction,
        );
    }
    await write(
      `insert into analytics_sessions(analytics_session_id,identity_epoch,user_id,anonymous_id,client_type,surface,environment,started_at,last_activity_at,expires_at,country_code,attribution)
   values(:sessionId,:epoch,:userId,:anonymousId,:clientType,:surface,:environment,:now,:now,:expires,:country,:attribution)`,
      {
        sessionId,
        epoch: epochHash(epoch),
        userId,
        anonymousId,
        clientType: body.clientType,
        surface: body.surface,
        environment:
          process.env.NODE_ENV === "production" ? "production" : "development",
        now: sqlTime(now),
        expires: sqlTime(now + 7 * 86400000),
        country: geo.countryCode,
        attribution: JSON.stringify(attribution),
      },
      transaction,
    );
  });
  return {
    analyticsSessionId: sessionId,
    identityEpoch: epoch,
    anonymousId,
    serverTime: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 86400000).toISOString(),
  };
}
export function publishedVersion(exercise: {
  transcript_json: unknown;
  audio_url: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([json(exercise.transcript_json), exercise.audio_url]),
    )
    .digest("hex");
}
async function updateDaily(
  userId: number,
  event: AnalyticsEvent,
  country: string,
  client: string,
  transaction: Transaction,
) {
  const intervals =
    event.eventName === "study_heartbeat"
      ? (event.properties.intervals as Interval[])
      : [];
  const days = splitDays(intervals);
  if (!days.size) days.set(statDate(Date.parse(event.occurredAt)), []);
  for (const [day, delta] of days) {
    await write(
      "insert ignore into analytics_user_daily(user_id,stat_date,intervals,practiced_lines) values(:userId,:day,'[]','[]')",
      { userId, day },
      transaction,
    );
    const [existing] = await rows(
      "select * from analytics_user_daily where user_id= :userId and stat_date= :day for update",
      { userId, day },
      transaction,
    );
    const merged = unionIntervals([
      ...json<Interval[]>(existing.intervals),
      ...delta,
    ]);
    const lines = new Set(json<string[]>(existing.practiced_lines));
    if (event.eventName === "sentence_practiced")
      lines.add(
        `${event.exerciseId}:${event.courseVersion}:${event.properties.lineId}`,
      );
    const play = intervalDuration(merged);
    await write(
      "update analytics_user_daily set play_ms= :play,practice_count= :count,qualified= :qualified,intervals= :intervals,practiced_lines= :lines where id= :id",
      {
        play,
        count: lines.size,
        qualified: play >= 60000 || lines.size >= 3,
        intervals: JSON.stringify(merged),
        lines: JSON.stringify([...lines]),
        id: existing.id,
      },
      transaction,
    );
    await write(
      `insert into analytics_user_dimension_daily(user_id,stat_date,client_type,country_code,surface,intervals,first_at,last_at) values(:userId,:day,:client,:country,'learner','[]',:at,:at) on duplicate key update first_at=least(first_at,:at),last_at=greatest(last_at,:at)`,
      {
        userId,
        day,
        client,
        country,
        at: sqlTime(Date.parse(event.occurredAt)),
      },
      transaction,
    );
    const [dimension] = await rows(
      "select * from analytics_user_dimension_daily where user_id= :userId and stat_date= :day and client_type= :client and country_code= :country and surface='learner' for update",
      { userId, day, client, country },
      transaction,
    );
    const dim = unionIntervals([
      ...json<Interval[]>(dimension.intervals),
      ...delta,
    ]);
    await write(
      "update analytics_user_dimension_daily set play_ms= :play,intervals= :intervals where id= :id",
      {
        play: intervalDuration(dim),
        intervals: JSON.stringify(dim),
        id: dimension.id,
      },
      transaction,
    );
  }
  if (event.eventName === "study_heartbeat") {
    const heartbeats = await rows(
      "select properties,event_at from analytics_events where analytics_session_id= :session and event_name='study_heartbeat' order by event_at",
      { session: event.analyticsSessionId },
      transaction,
    );
    let all: Interval[] = [];
    for (const heartbeat of heartbeats) {
      all = unionIntervals([
        ...all,
        ...json<{ intervals: Interval[] }>(heartbeat.properties).intervals,
      ]);
      if (intervalDuration(all) >= 180000) {
        await write(
          "update analytics_user_profiles set activation_country=if(activated_at is null or activated_at> :at,:country,activation_country),activated_at=if(activated_at is null,:at,least(activated_at,:at)) where user_id= :userId",
          { at: heartbeat.event_at, country, userId },
          transaction,
        );
        break;
      }
    }
  }
}
export async function ingestEvents(req: Request) {
  const userId = await analyticsUser(req);
  const body = req.body;
  if (
    body?.schemaVersion !== 1 ||
    !Array.isArray(body.events) ||
    body.events.length > 50 ||
    !body.events.length ||
    Buffer.byteLength(JSON.stringify(body)) > 65536
  )
    throw Object.assign(new Error("Invalid analytics batch"), { status: 400 });
  const results: { eventId: string; status: string; code?: string }[] = [];
  // A single transaction includes all accepted events and their derived facts; response is sent only after commit.
  await sequelize.transaction(async (transaction) => {
    if (
      userId &&
      !(
        await rows(
          "select id from users where id= :userId for update",
          { userId },
          transaction,
        )
      ).length
    )
      throw Object.assign(new Error("Account unavailable"), { status: 401 });
    for (const e of body.events as AnalyticsEvent[]) {
      const eventId = typeof e?.eventId === "string" ? e.eventId : "";
      const reject = (code: string) =>
        results.push({ eventId, status: "rejected", code });
      if (
        !e ||
        !uuid(e.analyticsSessionId) ||
        typeof e.identityEpoch !== "string"
      ) {
        reject("invalid_context");
        continue;
      }
      const [session] = await rows(
        "select *,date_format(started_at,'%Y-%m-%dT%H:%i:%s.%fZ') as anchor from analytics_sessions where analytics_session_id= :id and identity_epoch= :epoch for update",
        { id: e.analyticsSessionId, epoch: epochHash(e.identityEpoch) },
        transaction,
      );
      if (
        !session ||
        session.revoked_at ||
        utcValue(session.expires_at) < Date.now() ||
        (session.user_id === null ? null : Number(session.user_id)) !== userId
      ) {
        reject("identity_mismatch");
        continue;
      }
      const error = validateEvent(e, Date.parse(session.anchor));
      if (error) {
        reject(error);
        continue;
      }
      const at = Date.parse(e.occurredAt),
        anchor = Date.parse(session.anchor);
      if (
        at > anchor + 7 * 86400000 ||
        at > Date.parse(sqlTime(Date.now()) + "Z") + 60000
      ) {
        reject("expired_context");
        continue;
      }
      const duplicate = await rows(
        "select event_id from analytics_events where event_id= :eventId or (analytics_session_id= :session and seq= :seq) or (identity_epoch= :epoch and operation_id= :operation)",
        {
          eventId,
          session: e.analyticsSessionId,
          seq: e.seq,
          epoch: session.identity_epoch,
          operation: e.operationId ?? null,
        },
        transaction,
      );
      if (duplicate.length) {
        results.push({ eventId, status: "duplicate" });
        continue;
      }
      if (e.eventName === "upload_finished") {
        reject("admin_only");
        continue;
      }
      if (
        ["play_started", "play_finished", "playback_quality"].includes(
          e.eventName,
        )
      ) {
        const attempt = await rows(
          "select id from analytics_events where analytics_session_id= :session and event_name='play_attempt' and exercise_id= :course and course_version= :version and event_at<= :at and json_unquote(json_extract(properties,'$.attemptId'))= :attempt limit 1",
          {
            session: e.analyticsSessionId,
            course: e.exerciseId ?? null,
            version: e.courseVersion ?? null,
            at: sqlTime(at),
            attempt: e.properties.attemptId,
          },
          transaction,
        );
        if (!attempt.length) {
          reject("attempt_not_found");
          continue;
        }
      }
      if (e.eventName === "study_heartbeat") {
        const start = await rows(
          "select id,event_at from analytics_events where analytics_session_id= :session and study_session_id= :study and event_name='study_started' and exercise_id= :course and course_version= :version and event_at<= :at limit 1",
          {
            session: e.analyticsSessionId,
            study: e.studySessionId,
            course: e.exerciseId,
            version: e.courseVersion,
            at: sqlTime(at),
          },
          transaction,
        );
        if (
          !start.length ||
          (e.properties.intervals as Interval[])[0][0] <
            utcValue(start[0].event_at)
        ) {
          reject("study_not_started");
          continue;
        }
      }

      if (e.exerciseId) {
        const [course] = await rows(
          "select transcript_json,audio_url from exercises where id= :id and status='published'",
          { id: e.exerciseId },
          transaction,
        );
        if (!course || publishedVersion(course as any) !== e.courseVersion) {
          reject("course_version_unavailable");
          continue;
        }
        if (e.eventName === "sentence_practiced") {
          const lines = json<{ id: string }[]>(course.transcript_json);
          const evidence = await rows(
            "select id from analytics_events where analytics_session_id= :session and exercise_id= :course and course_version= :version and event_name='play_attempt' and json_unquote(json_extract(properties,'$.lineId'))= :line and event_at<= :at and exists(select 1 from analytics_events s where s.analytics_session_id= :session and s.event_name='play_started' and json_unquote(json_extract(s.properties,'$.attemptId'))=json_unquote(json_extract(analytics_events.properties,'$.attemptId')) and s.event_at<= :at) limit 1",
            {
              session: e.analyticsSessionId,
              course: e.exerciseId,
              version: e.courseVersion,
              line: e.properties.lineId,
              at: sqlTime(at),
            },
            transaction,
          );
          if (
            !lines.some((line) => String(line.id) === e.properties.lineId) ||
            !evidence.length
          ) {
            reject("practice_without_playback");
            continue;
          }
        }
      }
      const geo =
        Date.now() - at < 60000
          ? resolveRequestGeoContext(req)
          : {
              countryCode: "unknown",
              source: "offline_unknown",
              observedAt: null,
              dbVersion: null,
            };
      const inserted = await write(
        `insert ignore into analytics_events(event_id,event_name,user_id,anonymous_id,identity_epoch,analytics_session_id,study_session_id,operation_id,seq,event_at,received_at,stat_date,client_type,surface,environment,country_code,geo_source,geo_observed_at,geo_db_version,app_build,exercise_id,course_version,properties)
    values(:id,:name,:userId,:anon,:epoch,:session,:study,:operation,:seq,:at,UTC_TIMESTAMP(3),:day,:client,:surface,:environment,:country,:geoSource,:geoAt,:geoVersion,:build,:course,:version,:properties)`,
        {
          id: eventId,
          name: e.eventName,
          userId,
          anon: session.anonymous_id,
          epoch: session.identity_epoch,
          session: e.analyticsSessionId,
          study: e.studySessionId ?? null,
          operation: e.operationId ?? null,
          seq: e.seq,
          at: sqlTime(at),
          day: statDate(at),
          client: session.client_type,
          surface: session.surface,
          environment: session.environment,
          country: geo.countryCode,
          geoSource: geo.source,
          geoAt: geo.observedAt ? sqlTime(Date.parse(geo.observedAt)) : null,
          geoVersion: geo.dbVersion,
          build: e.appBuild,
          course: e.exerciseId ?? null,
          version: e.courseVersion ?? null,
          properties: JSON.stringify(e.properties),
        },
        transaction,
      );
      if (
        Number((inserted[1] as { affectedRows?: number }).affectedRows) === 0
      ) {
        results.push({ eventId, status: "duplicate" });
        continue;
      }
      await write(
        "update analytics_sessions set last_activity_at=greatest(last_activity_at,:at) where id= :id",
        { at: sqlTime(at), id: session.id },
        transaction,
      );
      if (
        userId &&
        session.surface === "learner" &&
        session.environment === "production"
      )
        await updateDaily(
          userId,
          e,
          geo.countryCode,
          session.client_type,
          transaction,
        );
      results.push({ eventId, status: "accepted" });
    }
  });
  return { results };
}
export async function revokeContext(req: Request) {
  const userId = await analyticsUser(req);
  const epoch = epochHash(String(req.body?.identityEpoch ?? ""));
  await sequelize.transaction(async (transaction) => {
    await write(
      "update analytics_sessions set revoked_at=UTC_TIMESTAMP(3) where identity_epoch= :epoch",
      { epoch },
      transaction,
    );
    if (userId && req.body?.withdraw !== false) {
      await write(
        "update analytics_sessions set revoked_at=UTC_TIMESTAMP(3) where user_id= :userId",
        { userId },
        transaction,
      );
      await write(
        "update analytics_user_profiles set consent='denied',consent_changed_at=UTC_TIMESTAMP(3) where user_id= :userId",
        { userId },
        transaction,
      );
    }
  });
  return { ok: true };
}
