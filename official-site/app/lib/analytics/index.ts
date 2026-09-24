export const DEFINITION_VERSION = "growth_v2_1";
export const STAT_TIMEZONE = "Asia/Shanghai";
export type Interval = [number, number];
export type EventName =
  | "page_view"
  | "course_viewed"
  | "study_started"
  | "study_heartbeat"
  | "sentence_practiced"
  | "play_attempt"
  | "play_started"
  | "play_finished"
  | "playback_quality"
  | "study_ended"
  | "upload_finished";
export type AnalyticsEvent = {
  eventId: string;
  eventName: EventName;
  occurredAt: string;
  analyticsSessionId: string;
  identityEpoch: string;
  seq: number;
  appBuild: string;
  studySessionId?: string;
  exerciseId?: number;
  courseVersion?: string;
  operationId?: string;
  properties: Record<string, unknown>;
};
export type AnalyticsContext = {
  analyticsSessionId: string;
  identityEpoch: string;
  serverTime: string;
  expiresAt: string;
  anonymousId: string;
};
/** Half-open UTC millisecond intervals. Merge before summing: parallel devices never double wall time. */
export function unionIntervals(values: Interval[]): Interval[] {
  const sorted = values
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]): Interval => [a, b])
    .sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [];
  for (const pair of sorted) {
    const last = result.at(-1);
    if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1]);
    else result.push(pair);
  }
  return result;
}
export const intervalDuration = (values: Interval[]) =>
  unionIntervals(values).reduce((n, [a, b]) => n + b - a, 0);
export const statDate = (ms: number) =>
  new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
export function splitDays(values: Interval[]) {
  const days = new Map<string, Interval[]>();
  for (const [start, end] of unionIntervals(values)) {
    let at = start;
    while (at < end) {
      const day = statDate(at);
      const midnight = Date.parse(`${day}T00:00:00+08:00`) + 86400000;
      const stop = Math.min(end, midnight);
      days.set(day, [...(days.get(day) ?? []), [at, stop]]);
      at = stop;
    }
  }
  return days;
}
/** A conservative monotonic sampler. Long suspension gaps and seek jumps are discarded. */
export class PlaybackClock {
  private last:
    | { monotonic: number; position: number; eligible: boolean }
    | undefined;
  sample(
    monotonic: number,
    position: number,
    eligible: boolean,
    rate = 1,
  ): number {
    const last = this.last;
    this.last = { monotonic, position, eligible };
    if (!last || !eligible || !last.eligible) return 0;
    const wall = monotonic - last.monotonic,
      media = position - last.position;
    return wall > 0 &&
      wall <= 2000 &&
      media > 0 &&
      media <= wall * Math.max(rate, 1) * 1.8 + 150
      ? wall
      : 0;
  }
  reset() {
    this.last = undefined;
  }
}
export function sanitizeAttribution(input: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = input[key];
    if (typeof value === "string" && /^[\p{L}\p{N}_. -]{1,100}$/u.test(value))
      result[key] = value;
  }
  if (
    typeof input.landing_path === "string" &&
    /^\/[\w\-/]*$/.test(input.landing_path)
  )
    result.landing_path = input.landing_path.slice(0, 200);
  if (
    typeof input.referrer_host === "string" &&
    /^[a-z0-9.-]{1,253}$/i.test(input.referrer_host)
  )
    result.referrer_host = input.referrer_host.toLowerCase();
  return result;
}
