import { rows, json, sqlTime, publishedVersion } from "./service";
import { intervalDuration, statDate, type Interval } from "./contracts";
const dayMs = 86400000;
const dateMs = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
const addDay = (day: string, n: number) => statDate(dateMs(day) + n * dayMs);
const median = (n: number[]) => percentile(n, 0.5);
const percentile = (n: number[], p: number) =>
  n.length
    ? [...n].sort((a, b) => a - b)[Math.max(0, Math.ceil(n.length * p) - 1)]
    : null;
const dayOf = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const utcMs = (v: unknown) =>
  v instanceof Date
    ? v.getTime()
    : Date.parse(String(v).replace(" ", "T") + "Z");
const region = (country: string) =>
  country === "CN"
    ? "mainland"
    : country === "unknown"
      ? "unknown"
      : "non_mainland";
export function reportRange(query: Record<string, unknown>) {
  const today = statDate(Date.now()),
    from = String(query.from ?? addDay(today, -29)),
    to = String(query.to ?? today);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(dateMs(from)) ||
    !Number.isFinite(dateMs(to)) ||
    to < from ||
    dateMs(to) - dateMs(from) > 366 * dayMs ||
    to > today
  )
    throw Object.assign(new Error("Invalid date range (maximum 367 days)"), {
      status: 400,
    });
  const client = String(query.clientType ?? "all"),
    country = String(query.countryCode ?? "all"),
    group = String(query.regionGroup ?? "all");
  if (
    !["all", "web_app", "mobile_web", "mobile_app"].includes(client) ||
    !(
      country === "all" ||
      country === "unknown" ||
      /^[A-Z]{2}$/.test(country)
    ) ||
    !["all", "mainland", "non_mainland", "unknown"].includes(group)
  )
    throw Object.assign(new Error("Invalid analytics filters"), {
      status: 400,
    });
  if (query.definitionVersion && query.definitionVersion !== "growth_v2_1")
    throw Object.assign(new Error("Unsupported definition version"), {
      status: 400,
    });
  return { today, from, to, client, country, group };
}
async function buildAnalyticsReport(
  kind: string,
  query: Record<string, unknown>,
) {
  const r = reportRange(query);
  const params = {
    from: r.from,
    lookback: r.from < addDay(r.to, -44) ? r.from : addDay(r.to, -44),
    to: r.to,
    observationTo: r.today,
    start: sqlTime(dateMs(r.from)),
    end: sqlTime(dateMs(addDay(r.to, 1))),
  };
  const [
    users,
    profiles,
    coverage,
    events,
    daily,
    dimensions,
    sessions,
    access,
    excluded,
  ] = await Promise.all([
    rows(
      "select u.id,u.created_at from users u left join analytics_user_profiles p on p.user_id=u.id where coalesce(p.is_internal,0)=0",
    ),
    rows("select * from analytics_user_profiles where is_internal=0"),
    rows(
      "select *,date_format(starts_at,'%Y-%m-%dT%H:%i:%s.%fZ') as start_iso,date_format(ends_at,'%Y-%m-%dT%H:%i:%s.%fZ') as end_iso from analytics_coverage",
    ),
    rows(
      "select e.* from analytics_events e left join analytics_user_profiles p on p.user_id=e.user_id where e.event_at>= :start and e.event_at< :end and e.environment='production' and e.surface<>'admin' and coalesce(p.is_internal,0)=0",
      params,
    ),
    rows(
      "select d.* from analytics_user_daily d left join analytics_user_profiles p on p.user_id=d.user_id where d.stat_date<= :observationTo and coalesce(p.is_internal,0)=0",
      params,
    ),
    rows(
      "select d.* from analytics_user_dimension_daily d left join analytics_user_profiles p on p.user_id=d.user_id where d.stat_date between :lookback and :observationTo and coalesce(p.is_internal,0)=0",
      params,
    ),
    rows(
      "select s.* from analytics_sessions s left join analytics_user_profiles p on p.user_id=s.user_id where s.started_at>= :start and s.started_at< :end and s.environment='production' and s.surface<>'admin' and coalesce(p.is_internal,0)=0",
      params,
    ),
    rows(
      "select a.user_id,a.client_type,a.activity_date from user_access_daily a left join analytics_user_profiles p on p.user_id=a.user_id where a.activity_date>= :from and a.activity_date<=date_add(:to,interval 30 day) and coalesce(p.is_internal,0)=0",
      params,
    ),
    rows(
      "select count(*) as n from analytics_user_profiles where is_internal=1",
    ),
  ]);
  const legacyZones = [
    ...new Set(
      coverage
        .filter((c) => c.metric === "legacy_access" && c.status === "complete")
        .map((c) => c.source_timezone),
    ),
  ];
  const legacyTimezone = legacyZones.length === 1 ? legacyZones[0] : null;
  const legacyOffset = (
    { UTC: 0, "Asia/Shanghai": 8, "Asia/Bangkok": 7 } as Record<string, number>
  )[legacyTimezone ?? ""];
  const profile = new Map(profiles.map((p) => [Number(p.user_id), p]));
  const geoMatch = (c: string) =>
    (r.country === "all" || c === r.country) &&
    (r.group === "all" || region(c) === r.group);
  const dimensionMatch = (e: Record<string, any>) =>
    (r.client === "all" || e.client_type === r.client) &&
    geoMatch(e.country_code);
  const filteredEvents: Record<string, any>[] = events
    .filter(dimensionMatch)
    .map((e) => ({
      ...e,
      properties: json<Record<string, any>>(e.properties),
    }));
  const covered = (metric: string, day: string) => {
    const clients =
      r.client === "all" ? ["web_app", "mobile_web", "mobile_app"] : [r.client];
    return clients.every((client) => {
      const spans = coverage.filter(
        (c) => c.metric === metric && c.client_type === client,
      );
      const start =
          dateMs(day) +
          (metric === "legacy_access" && legacyOffset !== undefined
            ? (8 - legacyOffset) * 3600000
            : 0),
        end = start + dayMs;
      return (
        spans.some(
          (c) =>
            c.status === "complete" &&
            Date.parse(c.start_iso) <= start &&
            (!c.end_iso || Date.parse(c.end_iso) >= end),
        ) &&
        !spans.some(
          (c) =>
            c.status !== "complete" &&
            Date.parse(c.start_iso) < end &&
            (!c.end_iso || Date.parse(c.end_iso) > start),
        )
      );
    });
  };
  const unknown = filteredEvents.filter(
    (e) => e.country_code === "unknown",
  ).length;
  const completeRange = (metric: string, from = r.from, to = r.to) => {
    for (let day = from; day <= to; day = addDay(day, 1))
      if (!covered(metric, day)) return false;
    return true;
  };
  const metadata = {
    schemaVersion: 1,
    definitionVersion: "growth_v2_1",
    timezone: "Asia/Shanghai",
    legacyTimezone,
    rangeStart: r.from,
    rangeEnd: r.to,
    generatedAt: new Date().toISOString(),
    dataThrough: new Date().toISOString(),
    trackingStartedAtByMetricAndClient: coverage.map((c) => ({
      metric: c.metric,
      clientType: c.client_type,
      startsAt: c.start_iso,
      endsAt: c.end_iso,
      status: c.status,
      sourceTimezone: c.source_timezone,
    })),
    isComplete:
      completeRange(
        kind === "retention" && query.cohortType !== "learning"
          ? "legacy_access"
          : kind === "media-quality"
            ? "media_quality"
            : kind === "acquisition"
              ? "page_view"
              : "learning",
      ) && r.to < r.today,
    sampling: 1,
    sampleSize: filteredEvents.length,
    excludedCount: Number(excluded[0]?.n ?? 0),
    unknownGeoCount: unknown,
    geoCoveragePercent: filteredEvents.length
      ? 100 * (1 - unknown / filteredEvents.length)
      : null,
    warnings: [
      "telemetry_observable_population",
      "network_location_not_residence",
      ...(r.to === r.today ? ["provisional_day"] : []),
      ...(!coverage.length ? ["coverage_not_configured"] : []),
    ],
  };
  const qualified: (Record<string, any> & { day: string })[] = daily
    .filter((d) => d.qualified)
    .map((d) => ({ ...d, day: dayOf(d.stat_date) }));
  const windowDaily = daily.filter(
    (d) => dayOf(d.stat_date) >= r.from && dayOf(d.stat_date) <= r.to,
  );
  const allDimensions = dimensions.filter(dimensionMatch);
  const filteredDimensions = allDimensions.filter(
    (d) => dayOf(d.stat_date) >= r.from && dayOf(d.stat_date) <= r.to,
  );
  // Global qualification uses unioned global days. Dimension filters select exposure, never re-add parallel durations.
  const exposure = new Set(
    allDimensions.map((d) => `${d.user_id}:${dayOf(d.stat_date)}`),
  );
  const qRolling = qualified.filter(
    (d) =>
      d.day <= r.to &&
      ((r.client === "all" && r.country === "all" && r.group === "all") ||
        exposure.has(`${d.user_id}:${d.day}`)),
  );
  const qWindow = qualified.filter(
    (d) =>
      d.day >= r.from &&
      d.day <= r.to &&
      ((r.client === "all" && r.country === "all" && r.group === "all") ||
        exposure.has(`${d.user_id}:${d.day}`)),
  );
  const registered = users.filter(
    (u) =>
      utcMs(u.created_at) >= dateMs(r.from) &&
      utcMs(u.created_at) < dateMs(addDay(r.to, 1)) &&
      geoMatch(profile.get(Number(u.id))?.registration_country ?? "unknown"),
  );
  const retention = (cohortType: string) => {
    const groups = new Map<string, Record<string, any>[]>();
    for (const u of users) {
      const p = profile.get(Number(u.id));
      const time = cohortType === "learning" ? p?.activated_at : u.created_at;
      if (
        !time ||
        !geoMatch(
          cohortType === "learning"
            ? (p?.activation_country ?? "unknown")
            : (p?.registration_country ?? "unknown"),
        )
      )
        continue;
      const day =
        cohortType === "access" && legacyOffset !== undefined
          ? new Date(utcMs(time) + legacyOffset * 3600000)
              .toISOString()
              .slice(0, 10)
          : statDate(utcMs(time));
      if (day < r.from || day > r.to) continue;
      groups.set(day, [...(groups.get(day) ?? []), u]);
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, members]) => ({
        cohortDate: day,
        cohortType,
        size: members.length,
        smallSample: members.length < 20,
        cells: [1, 7, 30].map((offset) => {
          const target = addDay(day, offset),
            metric = cohortType === "learning" ? "learning" : "legacy_access";
          const mature =
            Date.now() >=
            dateMs(target) +
              dayMs +
              (cohortType === "access" && legacyOffset !== undefined
                ? (8 - legacyOffset) * 3600000
                : 0);
          // Legacy date buckets require an explicitly verified source timezone before comparison.
          const legacyZone =
            cohortType !== "access" || legacyOffset !== undefined;
          const eligible =
            cohortType === "learning"
              ? members.filter(
                  (u) =>
                    profile.get(Number(u.id))?.consent === "granted" &&
                    utcMs(profile.get(Number(u.id))?.consent_changed_at) <=
                      dateMs(addDay(day, 1)),
                )
              : members;
          const complete =
            completeRange(metric, day, target) &&
            legacyZone &&
            eligible.length === members.length;
          const retained = members.filter((u) =>
            cohortType === "learning"
              ? qualified.some(
                  (d) =>
                    Number(d.user_id) === Number(u.id) &&
                    d.day === target &&
                    (r.client === "all" ||
                      dimensions.some(
                        (x) =>
                          Number(x.user_id) === Number(u.id) &&
                          dayOf(x.stat_date) === target &&
                          x.client_type === r.client,
                      )),
                )
              : access.some(
                  (a) =>
                    Number(a.user_id) === Number(u.id) &&
                    dayOf(a.activity_date) === target &&
                    (r.client === "all" || a.client_type === r.client),
                ),
          ).length;
          return {
            offset,
            retained: mature && complete ? retained : null,
            denominator: members.length,
            percent:
              mature && complete && members.length
                ? (retained / members.length) * 100
                : null,
            status: !mature
              ? "observing"
              : !complete
                ? "incomplete"
                : "complete",
          };
        }),
        windowRetention: (() => {
          const end = addDay(day, 13),
            mature =
              Date.now() >=
              dateMs(end) +
                dayMs +
                (cohortType === "access" && legacyOffset !== undefined
                  ? (8 - legacyOffset) * 3600000
                  : 0),
            complete =
              (cohortType !== "access" || legacyOffset !== undefined) &&
              (cohortType !== "learning" ||
                members.every(
                  (u) =>
                    profile.get(Number(u.id))?.consent === "granted" &&
                    utcMs(profile.get(Number(u.id))?.consent_changed_at) <=
                      dateMs(addDay(day, 1)),
                )) &&
              completeRange(
                cohortType === "learning" ? "learning" : "legacy_access",
                day,
                end,
              );
          const count = members.filter((u) =>
            cohortType === "learning"
              ? qualified.some(
                  (d) =>
                    Number(d.user_id) === Number(u.id) &&
                    d.day >= addDay(day, 7) &&
                    d.day <= end &&
                    (r.client === "all" ||
                      dimensions.some(
                        (x) =>
                          Number(x.user_id) === Number(u.id) &&
                          dayOf(x.stat_date) === d.day &&
                          x.client_type === r.client,
                      )),
                )
              : access.some(
                  (a) =>
                    Number(a.user_id) === Number(u.id) &&
                    dayOf(a.activity_date) >= addDay(day, 7) &&
                    dayOf(a.activity_date) <= end &&
                    (r.client === "all" || a.client_type === r.client),
                ),
          ).length;
          return {
            label: "W1",
            retained: mature && complete ? count : null,
            denominator: members.length,
            status: !mature
              ? "observing"
              : !complete
                ? "incomplete"
                : "complete",
          };
        })(),
      }));
  };
  let data: unknown;
  if (kind === "retention") {
    const lastMonday =
      dateMs(r.to) -
      ((new Date(dateMs(r.to) + 8 * 3600000).getUTCDay() + 6) % 7) * dayMs;
    const weekStart = statDate(lastMonday - 7 * dayMs),
      weekEnd = statDate(lastMonday),
      previousStart = statDate(lastMonday - 14 * dayMs);
    const thisIds = new Set(
      qRolling
        .filter((d) => d.day >= weekStart && d.day < weekEnd)
        .map((d) => Number(d.user_id)),
    );
    const previous = new Set(
      qRolling
        .filter((d) => d.day >= previousStart && d.day < weekStart)
        .map((d) => Number(d.user_id)),
    );
    let fresh = 0,
      returning = 0,
      retained = 0,
      historyUnknown = 0;
    for (const id of thisIds) {
      if (previous.has(id)) retained++;
      else if (
        qualified.some((d) => Number(d.user_id) === id && d.day < previousStart)
      )
        returning++;
      else {
        const user = users.find((u) => Number(u.id) === id);
        if (user && covered("learning", statDate(utcMs(user.created_at))))
          fresh++;
        else historyUnknown++;
      }
    }
    const totals = [...thisIds].map((id) => ({
      user: id,
      days: qualified.filter(
        (d) =>
          Number(d.user_id) === id && d.day >= weekStart && d.day < weekEnd,
      ).length,
      playMs: daily
        .filter(
          (d) =>
            Number(d.user_id) === id &&
            dayOf(d.stat_date) >= weekStart &&
            dayOf(d.stat_date) < weekEnd,
        )
        .reduce((n, d) => n + Number(d.play_ms), 0),
    }));
    const accessDays = new Map<number, Set<string>>();
    for (const a of access)
      if (
        dayOf(a.activity_date) >= weekStart &&
        dayOf(a.activity_date) < weekEnd &&
        (r.client === "all" || a.client_type === r.client)
      ) {
        const id = Number(a.user_id);
        if (!accessDays.has(id)) accessDays.set(id, new Set());
        accessDays.get(id)!.add(dayOf(a.activity_date));
      }
    const coursePractice = new Map<
      string,
      { users: Map<number, Set<string>> }
    >();
    for (const d of windowDaily)
      for (const key of json<string[]>(d.practiced_lines)) {
        const [course, version, ...line] = key.split(":");
        const id = course + ":" + version;
        const item = coursePractice.get(id) ?? {
          users: new Map<number, Set<string>>(),
        };
        const lines = item.users.get(Number(d.user_id)) ?? new Set<string>();
        lines.add(line.join(":"));
        item.users.set(Number(d.user_id), lines);
        coursePractice.set(id, item);
      }
    const courseCoverage = [];
    for (const [key, item] of coursePractice) {
      const [courseId, version] = key.split(":");
      const [course] = await rows(
        "select transcript_json,audio_url from exercises where id=:id and status='published'",
        { id: Number(courseId) },
      );
      if (!course || publishedVersion(course as any) !== version) continue;
      const lineCount = json<unknown[]>(course.transcript_json).length;
      courseCoverage.push({
        exerciseId: Number(courseId),
        courseVersion: version,
        sampleSize: item.users.size,
        practicableLines: lineCount,
        meanCoveragePercent: lineCount
          ? [...item.users.values()].reduce(
              (n, lines) => n + (lines.size / lineCount) * 100,
              0,
            ) / item.users.size
          : null,
      });
    }
    data = {
      courseCoverage,
      cohorts: retention(
        query.cohortType === "learning" ? "learning" : "access",
      ),
      weekStart,
      weekEnd: addDay(weekEnd, -1),
      weekly: {
        newLearners: fresh,
        retained,
        returning,
        temporarilyLost: [...previous].filter((id) => !thisIds.has(id)).length,
        historyUnknown,
        sustained: totals.filter((t) => t.days >= 2 && t.playMs >= 600000)
          .length,
        medianPlayMs: median(totals.map((t) => t.playMs)),
        meanPlayMs: totals.length
          ? totals.reduce((n, t) => n + t.playMs, 0) / totals.length
          : null,
        sampleSize: totals.length,
      },
      learningDays: Array.from({ length: 7 }, (_, i) => ({
        days: i + 1,
        users: totals.filter((t) => t.days === i + 1).length,
      })),
      accessDays: Array.from({ length: 7 }, (_, i) => ({
        days: i + 1,
        users: [...accessDays.values()].filter((d) => d.size === i + 1).length,
      })),
    };
  } else if (kind === "geography") {
    const countries = new Set([
      ...filteredEvents.map((e) => e.country_code),
      ...registered.map(
        (u) => profile.get(Number(u.id))?.registration_country ?? "unknown",
      ),
    ]);
    const last = new Map<number, string>();
    for (const e of [...events]
      .filter((e) => r.client === "all" || e.client_type === r.client)
      .sort((a, b) => utcMs(a.event_at) - utcMs(b.event_at)))
      if (
        e.user_id &&
        (e.country_code !== "unknown" || !last.has(Number(e.user_id)))
      )
        last.set(Number(e.user_id), e.country_code);
    data = {
      countries: [...countries].map((country) => ({
        countryCode: country,
        regionGroup: region(country),
        registrations: registered.filter(
          (u) =>
            (profile.get(Number(u.id))?.registration_country ?? "unknown") ===
            country,
        ).length,
        visitingUsers: new Set(
          filteredEvents
            .filter((e) => e.country_code === country && e.user_id)
            .map((e) => e.user_id),
        ).size,
        lastKnownUsers: [...last.values()].filter((c) => c === country).length,
        learningUsers: new Set(
          filteredDimensions
            .filter(
              (d) =>
                d.country_code === country &&
                qWindow.some(
                  (q) =>
                    Number(q.user_id) === Number(d.user_id) &&
                    q.day === dayOf(d.stat_date),
                ),
            )
            .map((d) => d.user_id),
        ).size,
        playMs: [
          ...new Set(
            filteredDimensions
              .filter((d) => d.country_code === country)
              .map((d) => d.user_id),
          ),
        ].reduce(
          (n, id) =>
            n +
            intervalDuration(
              filteredDimensions
                .filter((d) => d.user_id === id && d.country_code === country)
                .flatMap((d) => json<Interval[]>(d.intervals)),
            ),
          0,
        ),
      })),
    };
  } else if (kind === "acquisition") {
    const sources = new Set(
      sessions.map(
        (s) =>
          json<Record<string, string>>(s.attribution).utm_source ??
          "direct_or_unknown",
      ),
    );
    for (const user of registered)
      sources.add(
        profile.get(Number(user.id))?.registration_source ??
          "direct_or_unknown",
      );
    data = {
      channels: [...sources].map((source) => {
        const cohort = sessions.filter(
          (s) =>
            dimensionMatch(s) &&
            (json<Record<string, string>>(s.attribution).utm_source ??
              "direct_or_unknown") === source,
        );
        // Ordered per-session funnel with a bounded 30-minute conversion window, not ratios of unrelated weekly totals.
        const converted = (names: string[]) =>
          cohort.filter((s) => {
            let at = utcMs(s.started_at);
            return names.every((name) => {
              const event = filteredEvents
                .filter(
                  (e) =>
                    e.analytics_session_id === s.analytics_session_id &&
                    e.event_name === name &&
                    utcMs(e.event_at) >= at &&
                    utcMs(e.event_at) <= utcMs(s.started_at) + 30 * 60000,
                )
                .sort((a, b) => utcMs(a.event_at) - utcMs(b.event_at))[0];
              if (!event) return false;
              at = utcMs(event.event_at);
              return true;
            });
          });
        return {
          source,
          visitors: new Set(cohort.map((s) => s.anonymous_id)).size,
          viewed: converted(["page_view", "course_viewed"]).length,
          played: converted(["page_view", "course_viewed", "play_started"])
            .length,
          trial: cohort.filter(
            (s) =>
              converted([
                "page_view",
                "course_viewed",
                "play_started",
              ]).includes(s) &&
              intervalDuration(
                filteredEvents
                  .filter(
                    (e) =>
                      e.analytics_session_id === s.analytics_session_id &&
                      e.event_name === "study_heartbeat",
                  )
                  .flatMap((e) => e.properties.intervals ?? []),
              ) >= 60000,
          ).length,
          registrations: registered.filter(
            (u) => profile.get(Number(u.id))?.registration_source === source,
          ).length,
        };
      }),
    };
  } else if (kind === "media-quality") {
    const uploadRows = await rows(
      "select properties from analytics_events where event_name='upload_finished' and environment='production' and event_at>= :start and event_at< :end",
      params,
    );
    const uploads = uploadRows.map((row) =>
      json<Record<string, any>>(row.properties),
    );
    const attempts = filteredEvents.filter(
      (e) =>
        e.event_name === "play_attempt" &&
        (!query.appBuild || e.app_build === query.appBuild) &&
        (!query.exerciseId ||
          Number(e.exercise_id) === Number(query.exerciseId)) &&
        (!query.mediaType || e.properties.mediaType === query.mediaType),
    );
    const groups = new Set(
      attempts.map(
        (e) => `${e.country_code}|${e.client_type}|${e.properties.mediaType}`,
      ),
    );
    data = {
      quality: [...groups].map((group) => {
        const cohort = attempts.filter(
          (e) =>
            `${e.country_code}|${e.client_type}|${e.properties.mediaType}` ===
            group,
        );
        const outcomes = cohort.map((a) => ({
          attempt: a,
          start: filteredEvents.find(
            (e) =>
              e.event_name === "play_started" &&
              e.analytics_session_id === a.analytics_session_id &&
              e.properties.attemptId === a.properties.attemptId,
          ),
          end: filteredEvents.find(
            (e) =>
              e.event_name === "play_finished" &&
              e.analytics_session_id === a.analytics_session_id &&
              e.properties.attemptId === a.properties.attemptId,
          ),
        }));
        const cancelled = outcomes.filter(
          (o) =>
            !o.start &&
            ["cancelled", "paused", "interrupted", "superseded"].includes(
              o.end?.properties.reason,
            ),
        ).length;
        const eligible = outcomes.length - cancelled;
        const failed = outcomes.filter(
          (o) =>
            ["failed", "timeout"].includes(o.end?.properties.reason) ||
            (!o.start &&
              !o.end &&
              Date.now() - utcMs(o.attempt.event_at) > 60000),
        ).length;
        const latency = (trigger: string) =>
          outcomes
            .filter((o) => o.attempt.properties.trigger === trigger && o.start)
            .map((o) => Number(o.start!.properties.latencyMs));
        const quality = filteredEvents.filter(
          (e) =>
            e.event_name === "playback_quality" &&
            cohort.some(
              (a) =>
                a.properties.attemptId === e.properties.attemptId &&
                a.analytics_session_id === e.analytics_session_id,
            ),
        );
        const play = quality.reduce(
            (n, e) => n + Number(e.properties.playMs),
            0,
          ),
          buffer = quality.reduce(
            (n, e) => n + Number(e.properties.bufferingMs),
            0,
          );
        const [countryCode, clientType, mediaType] = group.split("|");
        return {
          countryCode,
          clientType,
          mediaType,
          attempts: cohort.length,
          eligible,
          cancelled,
          failed,
          success: outcomes.filter((o) => o.start).length,
          successPercent: eligible
            ? (outcomes.filter((o) => o.start).length / eligible) * 100
            : null,
          failurePercent: eligible ? (failed / eligible) * 100 : null,
          firstP50Ms: percentile(latency("first"), 0.5),
          firstP95Ms: percentile(latency("first"), 0.95),
          sentenceP50Ms: percentile(latency("sentence"), 0.5),
          sentenceP95Ms: percentile(latency("sentence"), 0.95),
          bufferingRatio: play + buffer ? buffer / (play + buffer) : null,
        };
      }),
      uploads: ["success", "failed", "timeout", "cancelled"].map((outcome) => {
        const cohort = uploads.filter((row) => row.reason === outcome),
          duration = cohort.map((row) => Number(row.durationMs));
        return {
          outcome,
          samples: cohort.length,
          meanDurationMs: duration.length
            ? duration.reduce((n, v) => n + v, 0) / duration.length
            : null,
          durationP50Ms: percentile(duration, 0.5),
          durationP95Ms: percentile(duration, 0.95),
          logicalBytes: cohort.reduce(
            (n, row) => n + Number(row.logicalBytes),
            0,
          ),
        };
      }),
    };
  } else if (kind === "traffic") {
    const traffic = await rows(
      "select * from analytics_traffic_daily where stat_date between :from and :to",
      params,
    );
    data = {
      status: traffic.length ? "connected" : "not_connected",
      rows: traffic.map((row) => {
        const result = { ...row };
        delete result.id;
        return result;
      }),
      downstreamBytes: traffic.length
        ? traffic
            .filter((t) => t.delivery_role === "downstream")
            .reduce((n, t) => n + Number(t.bytes), 0)
        : null,
      originBytes: traffic.length
        ? traffic
            .filter((t) => t.delivery_role === "origin")
            .reduce((n, t) => n + Number(t.bytes), 0)
        : null,
      actualUploadBytes: null,
      billing: "provider_invoice_only",
    };
  } else {
    const mature = registered.filter(
      (u) => utcMs(u.created_at) + 7 * dayMs <= Date.now(),
    );
    const observable = mature.filter(
      (u) =>
        profile.get(Number(u.id))?.consent === "granted" &&
        completeRange(
          "learning",
          statDate(utcMs(u.created_at)),
          statDate(utcMs(u.created_at) + 7 * dayMs),
        ),
    );
    const activated = observable.filter((u) => {
      const at = profile.get(Number(u.id))?.activated_at;
      return (
        at &&
        utcMs(at) >= utcMs(u.created_at) &&
        utcMs(at) <= utcMs(u.created_at) + 7 * dayMs
      );
    });
    const weeklyStart = addDay(r.to, -6),
      monthlyStart = addDay(r.to, -29);
    const lastMonday =
      dateMs(r.to) -
      ((new Date(dateMs(r.to) + 8 * 3600000).getUTCDay() + 6) % 7) * dayMs;
    const week = qualified.filter(
      (d) =>
        dateMs(d.day) >= lastMonday - 7 * dayMs && dateMs(d.day) < lastMonday,
    );
    const weekIds = new Set(
      week
        .filter(
          (d) =>
            (r.client === "all" && r.country === "all" && r.group === "all") ||
            exposure.has(`${d.user_id}:${d.day}`),
        )
        .map((d) => d.user_id),
    );
    data = {
      pageViews: filteredEvents.filter((e) => e.event_name === "page_view")
        .length,
      visitors: new Set(filteredEvents.map((e) => e.anonymous_id)).size,
      registrations: registered.length,
      activation: {
        numerator: activated.length,
        denominator: observable.length,
        unobservable: mature.length - observable.length,
        percent: observable.length
          ? (activated.length / observable.length) * 100
          : null,
      },
      learningDau: new Set(
        qWindow.filter((d) => d.day === r.to).map((d) => d.user_id),
      ).size,
      learningWau: new Set(
        qRolling.filter((d) => d.day >= weeklyStart).map((d) => d.user_id),
      ).size,
      learningMau: new Set(
        qRolling.filter((d) => d.day >= monthlyStart).map((d) => d.user_id),
      ).size,
      sustainedWeekly: [...weekIds].filter(
        (id) =>
          week.filter((d) => d.user_id === id).length >= 2 &&
          daily
            .filter(
              (d) =>
                d.user_id === id &&
                dateMs(dayOf(d.stat_date)) >= lastMonday - 7 * dayMs &&
                dateMs(dayOf(d.stat_date)) < lastMonday,
            )
            .reduce((n, d) => n + Number(d.play_ms), 0) >= 600000,
      ).length,
      playMs:
        r.client === "all" && r.country === "all" && r.group === "all"
          ? windowDaily.reduce((n, d) => n + Number(d.play_ms), 0)
          : [...new Set(filteredDimensions.map((d) => d.user_id))].reduce(
              (n, id) =>
                n +
                intervalDuration(
                  filteredDimensions
                    .filter((d) => d.user_id === id)
                    .flatMap((d) => json<Interval[]>(d.intervals)),
                ),
              0,
            ),
      learningUsers: new Set(qWindow.map((d) => d.user_id)).size,
      legacyAccessUsers: new Set(
        access
          .filter(
            (a) =>
              dayOf(a.activity_date) <= r.to &&
              (r.client === "all" || a.client_type === r.client),
          )
          .map((a) => a.user_id),
      ).size,
    };
  }
  if (kind === "overview" && !windowDaily.length && !completeRange("learning"))
    for (const key of [
      "learningDau",
      "learningWau",
      "learningMau",
      "sustainedWeekly",
      "playMs",
      "learningUsers",
    ])
      (data as Record<string, unknown>)[key] = null;
  return { metadata, data };
}

const reportCache = new Map<
  string,
  { expires: number; value: Awaited<ReturnType<typeof buildAnalyticsReport>> }
>();
export const clearAnalyticsReportCache = () => reportCache.clear();
export async function analyticsReport(
  kind: string,
  query: Record<string, unknown>,
) {
  const key = kind + JSON.stringify(query),
    cached = reportCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await buildAnalyticsReport(kind, query);
  if (reportCache.size >= 50) reportCache.clear();
  reportCache.set(key, { expires: Date.now() + 30000, value });
  return value;
}
