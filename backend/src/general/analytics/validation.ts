import type { AnalyticsEvent, Interval } from "./contracts";
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const fields: Record<string, string[]> = {
  page_view: ["pageViewId", "path"],
  course_viewed: [],
  study_started: ["mode"],
  study_heartbeat: ["intervals"],
  sentence_practiced: ["lineId", "action"],
  play_attempt: ["attemptId", "trigger", "lineId", "mediaType"],
  play_started: ["attemptId", "latencyMs"],
  play_finished: ["attemptId", "reason"],
  playback_quality: ["attemptId", "bufferingMs", "playMs"],
  study_ended: [],
  upload_finished: [
    "attemptId",
    "reason",
    "durationMs",
    "logicalBytes",
    "retryCount",
  ],
};
export function validateEvent(
  value: unknown,
  anchor: number,
  now = Date.now(),
): string | null {
  if (!value || typeof value !== "object") return "invalid_event";
  const e = value as AnalyticsEvent;
  const allowed = fields[e.eventName];
  const at = Date.parse(e.occurredAt);
  if (
    !allowed ||
    !uuid(e.eventId) ||
    !uuid(e.analyticsSessionId) ||
    !Number.isSafeInteger(e.seq) ||
    e.seq < 1 ||
    e.seq > 4294967295 ||
    typeof e.identityEpoch !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.identityEpoch)
  )
    return "invalid_envelope";
  if (
    !Number.isFinite(at) ||
    at < now - 7 * 86400000 ||
    at > now + 60000 ||
    at < anchor - 1000
  )
    return "invalid_time";
  if (typeof e.appBuild !== "string" || e.appBuild.length > 64 || !e.appBuild)
    return "invalid_build";
  if (e.operationId !== undefined && !uuid(e.operationId))
    return "invalid_operation";
  if (e.studySessionId !== undefined && !uuid(e.studySessionId))
    return "invalid_study_session";
  if (
    !e.properties ||
    typeof e.properties !== "object" ||
    Array.isArray(e.properties) ||
    Object.keys(e.properties).some((k) => !allowed.includes(k))
  )
    return "invalid_properties";
  const p = e.properties;
  if (
    e.eventName === "page_view" &&
    (!uuid(p.pageViewId) ||
      typeof p.path !== "string" ||
      !/^\/[\w\-/]*$/.test(p.path) ||
      p.path.length > 200)
  )
    return "invalid_page";
  if (
    !["page_view", "upload_finished"].includes(e.eventName) &&
    (!Number.isSafeInteger(e.exerciseId) ||
      Number(e.exerciseId) < 1 ||
      typeof e.courseVersion !== "string" ||
      !/^[a-f0-9]{64}$/.test(e.courseVersion))
  )
    return "invalid_course";
  if (e.eventName.startsWith("study_") && !uuid(e.studySessionId))
    return "invalid_study_session";
  if (
    e.eventName === "study_started" &&
    !["extensive", "intensive", "review"].includes(String(p.mode))
  )
    return "invalid_mode";
  if (
    e.eventName === "sentence_practiced" &&
    (!uuid(e.operationId) ||
      !["dictation", "answer_check", "mastery"].includes(String(p.action)) ||
      typeof p.lineId !== "string" ||
      p.lineId.length > 128)
  )
    return "invalid_practice";
  if (
    [
      "play_attempt",
      "play_started",
      "play_finished",
      "playback_quality",
      "upload_finished",
    ].includes(e.eventName) &&
    !uuid(p.attemptId)
  )
    return "invalid_attempt";
  if (
    e.eventName === "play_attempt" &&
    (!["first", "sentence", "replay"].includes(String(p.trigger)) ||
      !["audio", "video"].includes(String(p.mediaType)) ||
      (p.lineId !== undefined &&
        (typeof p.lineId !== "string" || p.lineId.length > 128)))
  )
    return "invalid_attempt";
  if (
    e.eventName === "play_finished" &&
    ![
      "range-ended",
      "media-ended",
      "paused",
      "cancelled",
      "failed",
      "timeout",
      "interrupted",
      "superseded",
    ].includes(String(p.reason))
  )
    return "invalid_reason";
  if (
    e.eventName === "upload_finished" &&
    !["success", "failed", "timeout", "cancelled"].includes(String(p.reason))
  )
    return "invalid_reason";
  for (const key of [
    "latencyMs",
    "bufferingMs",
    "playMs",
    "durationMs",
    "logicalBytes",
    "retryCount",
  ])
    if (
      allowed.includes(key) &&
      (!Number.isSafeInteger(p[key]) ||
        Number(p[key]) < 0 ||
        Number(p[key]) >
          (key === "logicalBytes"
            ? 10 ** 12
            : key === "retryCount"
              ? 100
              : 86400000))
    )
      return "invalid_number";
  if (e.eventName === "study_heartbeat") {
    if (
      !Array.isArray(p.intervals) ||
      p.intervals.length < 1 ||
      p.intervals.length > 60
    )
      return "invalid_intervals";
    let last = anchor;
    for (const interval of p.intervals as Interval[]) {
      if (!Array.isArray(interval) || interval.length !== 2)
        return "invalid_intervals";
      const [a, b] = interval;
      if (
        !Number.isSafeInteger(a) ||
        !Number.isSafeInteger(b) ||
        a < last ||
        b <= a ||
        b - a > 16000 ||
        b > at + 1000
      )
        return "invalid_intervals";
      last = b;
    }
  }
  return null;
}
