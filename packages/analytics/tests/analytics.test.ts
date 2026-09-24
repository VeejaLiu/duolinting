import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PlaybackClock,
  intervalDuration,
  splitDays,
  unionIntervals,
  sanitizeAttribution,
} from "../src/index.ts";
import { AnalyticsClient } from "../src/client.ts";
import { validateEvent } from "../../../backend/src/general/analytics/validation.ts";

test("overlapping devices and replayed intervals count wall time once", () => {
  assert.equal(
    intervalDuration([
      [0, 600000],
      [100, 600100],
      [0, 600000],
    ]),
    600100,
  );
  assert.deepEqual(
    unionIntervals([
      [20, 30],
      [0, 10],
      [10, 20],
    ]),
    [[0, 30]],
  );
});
test("operational midnight splits UTC intervals in Shanghai, independent of machine timezone", () => {
  const midnight = Date.parse("2026-09-24T16:00:00Z");
  const days = splitDays([[midnight - 15000, midnight + 15000]]);
  assert.equal(intervalDuration(days.get("2026-09-24")!), 15000);
  assert.equal(intervalDuration(days.get("2026-09-25")!), 15000);
});
test("clock excludes seeks, suspension, buffer and background; double speed uses wall time", () => {
  const clock = new PlaybackClock();
  assert.equal(clock.sample(0, 0, true, 2), 0);
  assert.equal(clock.sample(1000, 2000, true, 2), 1000);
  assert.equal(clock.sample(1250, 302000, true, 2), 0);
  assert.equal(clock.sample(1500, 302500, false, 2), 0);
  assert.equal(clock.sample(1750, 303000, true, 2), 0);
  assert.equal(clock.sample(6000, 305000, true, 2), 0);
});
test("schema rejects oversized, future, free-form and forged derived events", () => {
  const now = Date.now(),
    event = {
      eventId: randomUUID(),
      analyticsSessionId: randomUUID(),
      identityEpoch: "a".repeat(64),
      eventName: "page_view",
      seq: 1,
      appBuild: "test",
      occurredAt: new Date(now).toISOString(),
      properties: { pageViewId: randomUUID(), path: "/study" },
    };
  assert.equal(validateEvent(event, now - 1000, now), null);
  assert.equal(
    validateEvent({ ...event, eventName: "activated" }, now - 1000, now),
    "invalid_envelope",
  );
  assert.equal(
    validateEvent(
      { ...event, properties: { ...event.properties, dictation: "private" } },
      now - 1000,
      now,
    ),
    "invalid_properties",
  );
  assert.equal(
    validateEvent(
      { ...event, occurredAt: new Date(now + 120000).toISOString() },
      now - 1000,
      now,
    ),
    "invalid_time",
  );
  assert.deepEqual(
    sanitizeAttribution({
      utm_source: "bilibili",
      referrer_host: "example.org",
      landing_path: "/lesson?token=secret",
      email: "private",
    }),
    { utm_source: "bilibili", referrer_host: "example.org" },
  );
});
test("SDK persists retries with original event IDs and never sends an old account queue with new credentials", async () => {
  const storage = new Map<string, string>();
  let fail = true;
  const deliveries: { token: string; ids: string[] }[] = [];
  const client = new AnalyticsClient({
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
      removeItem: (k) => {
        storage.delete(k);
      },
    },
    uuid: randomUUID,
    url: (p) => p,
    clientType: "web_app",
    surface: "learner",
    build: "test",
    fetch: async (path, init) => {
      if (String(path).endsWith("/context"))
        return new Response(
          JSON.stringify({
            analyticsSessionId: randomUUID(),
            identityEpoch: "a".repeat(64),
            anonymousId: randomUUID(),
            serverTime: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
        );
      if (String(path).endsWith("/revoke")) return new Response("{}");
      const body = JSON.parse(init!.body as string);
      deliveries.push({
        token: (init!.headers as Record<string, string>).Authorization,
        ids: body.events.map((e: { eventId: string }) => e.eventId),
      });
      if (fail) return new Response("{}", { status: 503 });
      return new Response(
        JSON.stringify({
          results: body.events.map((e: { eventId: string }) => ({
            eventId: e.eventId,
            status: "accepted",
          })),
        }),
      );
    },
  });
  await client.configure(true, "old-token", "old-user");
  await client.track("page_view", { pageViewId: randomUUID(), path: "/old" });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(JSON.parse(storage.values().next().value!).queue.length);
  fail = false;
  await client.configure(true, "new-token", "new-user");
  await client.track("page_view", { pageViewId: randomUUID(), path: "/new" });
  const queued = JSON.parse(storage.values().next().value!);
  assert.equal(queued.owner, "new-user");
  assert.equal(
    queued.queue.some(
      (e: { properties: { path: string } }) => e.properties.path === "/old",
    ),
    false,
  );
  assert.ok(
    deliveries.every(
      (d) =>
        d.token === "Bearer old-token" || !d.ids.includes(deliveries[0].ids[0]),
    ),
  );
  await client.configure(false);
  assert.equal(storage.size, 0);
});

test("geo context rejects forged public XFF and Cloudflare country headers", async () => {
  const { resolveRequestGeoContext } =
    await import("../../../backend/src/general/analytics/geo.ts");
  const req = {
    ip: "203.0.113.7",
    socket: { remoteAddress: "203.0.113.7" },
    app: { get: () => () => false },
    get: (key: string) =>
      ({
        "cf-ipcountry": "CN",
        "x-analytics-country": "CN",
        "x-forwarded-for": "8.8.8.8",
      })[key],
  };
  process.env.ANALYTICS_TRUST_GEO_HEADER = "true";
  assert.equal(resolveRequestGeoContext(req as never).countryCode, "unknown");
  delete process.env.ANALYTICS_TRUST_GEO_HEADER;
});
test("edge adapters count cache HIT bytes and do not invent visitor country from provider region", async () => {
  const { aggregateDelivery, nginxDelivery, providerDelivery } =
    await import("../../../backend/src/general/analytics/traffic-adapters.ts");
  const record = nginxDelivery(
    JSON.stringify({
      time: "2026-09-24T00:00:00Z",
      host: "example.invalid",
      bytes: 4096,
      status: 206,
      cache: "HIT",
      country: "CN",
      path: "/media/video.mp4",
    }),
  );
  const [result] = aggregateDelivery([record], {
    provider: "fixture",
    sourceId: "2026-09-24",
    deliveryRole: "downstream",
    sampling: 1,
    completeness: "complete",
  });
  assert.equal(result.bytes, 4096);
  assert.equal(result.hits, 1);
  assert.equal(result.deliveryRole, "downstream");
  assert.equal(
    providerDelivery(
      { t: record.at, h: record.host, b: 1, s: 200, c: "HIT", g: "CN" },
      {
        time: "t",
        host: "h",
        bytes: "b",
        status: "s",
        cache: "c",
        country: "g",
      },
      false,
    ).country,
    "unknown",
  );
});

test("an authenticated queue survives process recreation with its original identity", async () => {
  const values = new Map<string, string>();
  let contexts = 0;
  const options = {
    storage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: (k: string) => {
        values.delete(k);
      },
    },
    uuid: randomUUID,
    url: (p: string) => p,
    clientType: "web_app",
    surface: "learner",
    build: "test",
    fetch: async (path: RequestInfo | URL) => {
      if (String(path).endsWith("/context")) {
        contexts++;
        return new Response(
          JSON.stringify({
            analyticsSessionId: randomUUID(),
            identityEpoch: "b".repeat(64),
            anonymousId: randomUUID(),
            serverTime: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
        );
      }
      return new Response("{}", { status: 503 });
    },
  };
  const first = new AnalyticsClient(options);
  await first.configure(true, "token", "account");
  await first.track("page_view", {
    pageViewId: randomUUID(),
    path: "/persisted",
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const savedBefore = JSON.parse(values.values().next().value!);
  const eventId = savedBefore.queue[0].eventId;
  const restored = new AnalyticsClient(options);
  await restored.configure(true, "token", "account");
  const savedAfter = JSON.parse(values.values().next().value!);
  assert.equal(savedAfter.queue[0].eventId, eventId);
  assert.equal(savedAfter.owner, "account");
  assert.equal(contexts, 2);
});
