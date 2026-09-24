import {
  PlaybackClock,
  sanitizeAttribution,
  type AnalyticsContext,
  type AnalyticsEvent,
  type EventName,
  type Interval,
} from "./index";
type Storage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<unknown> | void;
  removeItem(key: string): Promise<unknown> | void;
};
type Options = {
  storage: Storage;
  uuid: () => string;
  url: (path: string) => string;
  clientType: string;
  surface: string;
  build: string;
  fetch?: typeof fetch;
};
type Saved = {
  context: AnalyticsContext;
  queue: AnalyticsEvent[];
  seq: number;
  owner: string;
  lastActivity: number;
  dropped: number;
};
const key = "duolinting.analytics.v1";
/** Bounded persisted queue. Credentials live only in memory; account switches invalidate old pending work. */
export class AnalyticsClient {
  private saved: Saved | undefined;
  private token = "";
  private owner = "anonymous";
  private consent = false;
  private configured = false;
  private generation = 0;
  private pending: Promise<void> | undefined;
  private flushing = false;
  private retryAt = 0;
  private failures = 0;
  private anchor = 0;
  private mono = 0;
  private course:
    | {
        id: number;
        version: string;
        mediaType: string;
        lines: { id: string; start: number; end: number }[];
      }
    | undefined;
  private requestedCourse:
    | {
        id: number;
        mediaType: string;
        lines: { id: string; start: number; end: number }[];
      }
    | undefined;
  private study = "";
  private mode: "extensive" | "intensive" | "review" = "intensive";
  setMode(mode: "extensive" | "intensive" | "review") {
    this.mode = mode;
  }
  private intervals: Interval[] = [];
  private clock = new PlaybackClock();
  private lastFlush = 0;
  private attempt:
    | { id: string; at: number; started: boolean; play: number; buffer: number }
    | undefined;
  private lastSample = 0;
  private attribution: Record<string, string> = {};
  private previousEpoch: string | undefined;
  private options: Options;
  constructor(options: Options) {
    this.options = options;
  }
  get contextEpoch() {
    return this.consent ? this.saved?.context.identityEpoch : undefined;
  }
  private request(path: string, body: unknown, token = this.token) {
    return (this.options.fetch ?? fetch)(
      this.options.url("/api/v1/analytics/" + path),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        keepalive: this.options.clientType !== "mobile_app",
      },
    );
  }
  async configure(
    consent: boolean,
    token = "",
    owner = "anonymous",
    attribution: Record<string, unknown> = {},
  ) {
    const changed = this.configured && owner !== this.owner;
    this.configured = true;
    if (
      this.consent === consent &&
      this.token === token &&
      this.owner === owner &&
      this.saved
    )
      return;
    this.generation++;
    this.consent = consent;
    this.attribution = sanitizeAttribution(attribution);
    if (!consent) {
      if (this.saved)
        void this.request("revoke", {
          identityEpoch: this.saved.context.identityEpoch,
        }).catch(() => {});
      this.saved = undefined;
      this.token = token;
      this.owner = owner;
      this.resetPlayback();
      this.course = undefined;
      try {
        await this.options.storage.removeItem(key);
      } catch {
        /* Optional local telemetry storage. */
      }
      return;
    }
    if (changed) {
      this.previousEpoch =
        this.owner === "anonymous"
          ? this.saved?.context.identityEpoch
          : undefined;
      if (this.owner !== "anonymous" && this.saved)
        void this.request("revoke", {
          identityEpoch: this.saved.context.identityEpoch,
          withdraw: false,
        }).catch(() => {});
      this.saved = undefined;
      this.resetPlayback();
      try {
        await this.options.storage.removeItem(key);
      } catch {
        /* Optional local telemetry storage. */
      }
    }
    this.token = token;
    this.owner = owner;
    this.pending = undefined;
    try {
      await this.ensure();
      if (this.requestedCourse && !this.course)
        void this.setCourse(
          this.requestedCourse.id,
          this.requestedCourse.mediaType,
          this.requestedCourse.lines,
        );
    } catch {
      /* Optional analysis must not block account or player workflows. */
    }
  }
  private resetPlayback() {
    this.intervals = [];
    this.study = "";
    this.clock.reset();
    this.attempt = undefined;
  }
  private now() {
    return Math.round(this.anchor + performance.now() - this.mono);
  }
  private async persist() {
    if (this.saved)
      await this.options.storage.setItem(key, JSON.stringify(this.saved));
  }
  private async ensure() {
    if (!this.consent) return;
    if (this.pending) return this.pending;
    if (
      this.saved &&
      Date.now() - this.saved.lastActivity < 30 * 60000 &&
      Date.parse(this.saved.context.expiresAt) > Date.now()
    )
      return;
    const generation = this.generation;
    this.pending = (async () => {
      let old = this.saved;
      if (!old)
        try {
          const stored = await this.options.storage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored) as Saved;
            if (parsed.owner === this.owner && Array.isArray(parsed.queue))
              old = parsed;
          }
        } catch {
          /* Corrupt local telemetry is disposable. */
        }
      // Queued events keep their original context. A reload resumes a recent context; idle sessions rotate.
      const response = await this.request("context", {
        consent: true,
        clientType: this.options.clientType,
        surface: this.options.surface,
        identityEpoch: old?.context.identityEpoch ?? this.previousEpoch,
        resume: !!old && Date.now() - old.lastActivity < 30 * 60000,
        attribution: this.attribution,
      });
      if (!response.ok) throw new Error("context_unavailable");
      const context = (await response.json()) as AnalyticsContext;
      if (generation !== this.generation) return;
      this.saved = {
        context,
        queue: old?.queue ?? [],
        seq:
          old?.context.analyticsSessionId === context.analyticsSessionId
            ? old.seq
            : 0,
        owner: this.owner,
        lastActivity: Date.now(),
        dropped: old?.dropped ?? 0,
      };
      this.previousEpoch = undefined;
      this.anchor = Date.parse(context.serverTime);
      this.mono = performance.now();
      this.clock.reset();
      this.intervals = [];
      this.lastSample = 0;
      if (!this.attempt) this.study = "";
      await this.persist();
    })().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  async track(
    eventName: EventName,
    properties: Record<string, unknown> = {},
    extra: Partial<AnalyticsEvent> = {},
  ) {
    if (!this.consent) return;
    const generation = this.generation;
    try {
      await this.ensure();
      if (generation !== this.generation) return;
      const saved = this.saved;
      if (!saved) return;
      const cutoff = Date.now() - 7 * 86400000;
      const keep = saved.queue.filter(
        (e) => Date.parse(e.occurredAt) >= cutoff,
      );
      saved.dropped += saved.queue.length - keep.length;
      saved.queue = keep;
      if (saved.queue.length >= 500) {
        saved.queue.shift();
        saved.dropped++;
      }
      saved.queue.push({
        ...extra,
        eventId: this.options.uuid(),
        eventName,
        occurredAt: new Date(this.now()).toISOString(),
        analyticsSessionId: saved.context.analyticsSessionId,
        identityEpoch: saved.context.identityEpoch,
        seq: ++saved.seq,
        appBuild: this.options.build,
        properties,
      });
      saved.lastActivity = Date.now();
      await this.persist();
      if (Date.now() - this.lastFlush >= 15000) void this.flush();
    } catch {
      /* Store/network failures affect telemetry only. */
    }
  }
  async flush() {
    if (
      !this.consent ||
      !this.saved ||
      this.flushing ||
      Date.now() < this.retryAt ||
      !this.saved.queue.length
    )
      return;
    this.flushing = true;
    this.lastFlush = Date.now();
    const saved = this.saved;
    const generation = this.generation;
    let batch = saved.queue.slice(0, 50);
    while (
      JSON.stringify({ schemaVersion: 1, events: batch }).length > 60000 &&
      batch.length > 1
    )
      batch = batch.slice(0, -1);
    try {
      const response = await this.request("events", {
        schemaVersion: 1,
        events: batch,
      });
      if (!response.ok) throw new Error(String(response.status));
      const { results } = (await response.json()) as {
        results: { eventId: string; status: string }[];
      };
      if (generation !== this.generation) return;
      const done = new Set(
        results
          .filter((r) =>
            ["accepted", "duplicate", "rejected"].includes(r.status),
          )
          .map((r) => r.eventId),
      );
      saved.queue = saved.queue.filter((e) => !done.has(e.eventId));
      this.failures = 0;
      this.retryAt = 0;
      await this.persist();
    } catch {
      this.retryAt =
        Date.now() +
        Math.min(60000, 1000 * 2 ** Math.min(++this.failures, 6)) *
          (0.75 + Math.random() * 0.5);
    } finally {
      this.flushing = false;
    }
  }
  async setCourse(
    id: number,
    mediaType = "audio",
    lines: { id: string; start: number; end: number }[] = [],
  ) {
    this.requestedCourse = { id, mediaType, lines };
    if (
      this.course?.id === id &&
      this.course.mediaType === mediaType &&
      JSON.stringify(this.course.lines) === JSON.stringify(lines)
    )
      return;
    this.endStudy();
    this.course = undefined;
    if (!this.consent || !Number.isSafeInteger(id) || id < 1) return;
    try {
      const response = await (this.options.fetch ?? fetch)(
        this.options.url("/api/v1/analytics/courses/" + id),
      );
      if (!response.ok || this.requestedCourse?.id !== id) return;
      const { courseVersion } = (await response.json()) as {
        courseVersion: string;
      };
      this.course = { id, version: courseVersion, mediaType, lines };
      await this.track("course_viewed", {}, this.courseFields());
    } catch {
      /* Optional. */
    }
  }
  private courseFields() {
    return this.course
      ? {
          exerciseId: this.course.id,
          courseVersion: this.course.version,
          studySessionId: this.study || undefined,
        }
      : {};
  }
  beginAttempt(
    position = 0,
    trigger: "first" | "sentence" | "replay" = "first",
  ) {
    if (!this.consent || !this.course) return;
    if (this.saved && Date.now() - this.saved.lastActivity >= 30 * 60000)
      this.study = "";
    this.finishAttempt("cancelled");
    if (!this.study) {
      this.study = this.options.uuid();
      void this.track(
        "study_started",
        { mode: this.mode },
        this.courseFields(),
      );
    }
    const line = this.course.lines.find(
      (l) => position >= l.start - 0.1 && position < l.end,
    );
    this.attempt = {
      id: this.options.uuid(),
      at: performance.now(),
      started: false,
      play: 0,
      buffer: 0,
    };
    void this.track(
      "play_attempt",
      {
        attemptId: this.attempt.id,
        trigger,
        mediaType: this.course.mediaType,
        ...(line ? { lineId: String(line.id) } : {}),
      },
      this.courseFields(),
    );
  }
  sample(positionMs: number, eligible: boolean, buffering: boolean, rate = 1) {
    if (!this.consent || !this.course || !this.saved || !this.attempt) return;
    const mono = performance.now(),
      delta = this.clock.sample(mono, positionMs, eligible && !buffering, rate);
    if (delta > 0) {
      if (!this.attempt.started) {
        this.attempt.started = true;
        void this.track(
          "play_started",
          {
            attemptId: this.attempt.id,
            latencyMs: Math.round(mono - this.attempt.at),
          },
          this.courseFields(),
        );
      }
      this.attempt.play += delta;
      const end = this.now();
      const previous = this.intervals.at(-1);
      if (
        previous &&
        end - previous[0] <= 15000 &&
        end - Math.round(delta) <= previous[1] + 2
      )
        previous[1] = end;
      else this.intervals.push([end - Math.round(delta), end]);
    }
    if (
      buffering &&
      this.attempt.started &&
      this.lastSample &&
      mono - this.lastSample < 2000
    )
      this.attempt.buffer += mono - this.lastSample;
    this.lastSample = mono;
    if (
      this.intervals.length &&
      (mono - (this.intervals[0][0] - this.anchor + this.mono) >= 15000 ||
        !eligible ||
        buffering)
    )
      this.heartbeat();
  }
  private heartbeat() {
    if (!this.intervals.length) return;
    const intervals = this.intervals;
    this.intervals = [];
    void this.track("study_heartbeat", { intervals }, this.courseFields());
  }
  finishAttempt(reason: string) {
    this.heartbeat();
    this.clock.reset();
    if (!this.attempt) return;
    void this.track(
      "play_finished",
      { attemptId: this.attempt.id, reason },
      this.courseFields(),
    );
    void this.track(
      "playback_quality",
      {
        attemptId: this.attempt.id,
        playMs: Math.round(this.attempt.play),
        bufferingMs: Math.round(this.attempt.buffer),
      },
      this.courseFields(),
    );
    this.attempt = undefined;
  }
  practice(lineId: string, action: "mastery" | "dictation" | "answer_check") {
    if (this.course)
      void this.track(
        "sentence_practiced",
        { lineId, action },
        { ...this.courseFields(), operationId: this.options.uuid() },
      );
  }
  endStudy() {
    this.finishAttempt("cancelled");
    if (this.study) void this.track("study_ended", {}, this.courseFields());
    this.study = "";
    void this.flush();
  }
  page(path: string) {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;
    if (/^\/[\w\-/]*$/.test(path))
      void this.track("page_view", { pageViewId: this.options.uuid(), path });
  }
}
