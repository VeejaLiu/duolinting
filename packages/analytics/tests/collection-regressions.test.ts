import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AnalyticsClient } from "../src/client.ts";
import { browserClientType } from "../src/web.ts";
import type { AnalyticsContext, AnalyticsEvent } from "../src/index.ts";

function fixture() {
  const values = new Map<string, string>();
  const contexts = new Map<string, AnalyticsContext>();
  const accepted = new Map<string, AnalyticsEvent>();
  const deliveries: { token: string; events: AnalyticsEvent[] }[] = [];
  const visitor = randomUUID();
  const options = {
    storage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => { values.set(k, v); },
      removeItem: (k: string) => { values.delete(k); },
      getAllKeys: () => [...values.keys()],
    },
    uuid: randomUUID, url: (p: string) => p,
    clientType: "web_app", surface: "learner", build: "test",
    fetch: async (path: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(path).endsWith("/context")) {
        const prior = contexts.get(body.identityEpoch);
        if (body.resume && prior) return new Response(JSON.stringify(prior));
        const context: AnalyticsContext = {
          analyticsSessionId: randomUUID(), identityEpoch: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
          anonymousId: prior?.anonymousId ?? (body.visitorToken === "signed-fixture-proof" ? visitor : visitor),
          visitorToken: "signed-fixture-proof", serverTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        };
        contexts.set(context.identityEpoch, context);
        return new Response(JSON.stringify(context));
      }
      if (String(path).endsWith("/revoke")) return new Response("{}");
      const events = body.events as AnalyticsEvent[];
      deliveries.push({ token: (init?.headers as Record<string, string>).Authorization ?? "", events });
      const results = events.map((e) => {
        const key = e.analyticsSessionId + ":" + e.seq;
        const status = accepted.has(key) ? "duplicate" : "accepted";
        if (status === "accepted") accepted.set(key, e);
        return { eventId: e.eventId, status };
      });
      return new Response(JSON.stringify({ results }));
    },
  };
  return { values, accepted, deliveries, options };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const snapshots = (values: Map<string,string>) => [...values.entries()]
  .filter(([key]) => key.startsWith("duolinting.analytics.queue."))
  .map(([,value]) => JSON.parse(value));

test("independent tabs retain their outboxes and never collide on session sequence", async () => {
  const f = fixture(), a = new AnalyticsClient(f.options), b = new AnalyticsClient(f.options);
  await a.configure(true);
  await a.track("page_view", { pageViewId: randomUUID(), path: "/seed" });
  await tick(); await a.flush(); await tick();
  await b.configure(true);
  await a.track("page_view", { pageViewId: randomUUID(), path: "/tab-a" });
  await b.track("page_view", { pageViewId: randomUUID(), path: "/tab-b" });
  await tick();
  assert.equal(snapshots(f.values).length, 2);
  await a.flush(); await b.flush(); await tick();
  assert.equal(f.accepted.size, 3);
  assert.deepEqual([...f.accepted.values()].map((e) => e.properties.path).sort(), ["/seed", "/tab-a", "/tab-b"]);
});

test("anonymous login preserves the original pending event for its linked epoch", async () => {
  const f = fixture(), client = new AnalyticsClient(f.options);
  await client.configure(true);
  await client.track("page_view", { pageViewId: randomUUID(), path: "/seed" });
  await tick(); await client.flush(); await tick();
  await client.track("page_view", { pageViewId: randomUUID(), path: "/before-login" });
  await tick();
  const pending = snapshots(f.values)[0].queue[0];
  await client.configure(true, "fixture-account-token", "fixture-account");
  const saved = snapshots(f.values)[0];
  assert.equal(saved.queue[0].eventId, pending.eventId);
  assert.equal(saved.queue[0].identityEpoch, pending.identityEpoch);
  assert.notEqual(saved.context.identityEpoch, pending.identityEpoch);
  await client.flush(); await tick();
  assert.ok(f.deliveries.some((d) => d.token === "Bearer fixture-account-token" && d.events.some((e) => e.eventId === pending.eventId)));
});

test("logout retains only visitor proof, never an account queue", async () => {
  const f = fixture(), client = new AnalyticsClient({ ...f.options, clientType: "mobile_app" });
  await client.configure(true, "fixture-token", "fixture-user");
  await client.suspendSession();
  assert.equal(snapshots(f.values).length, 0);
  assert.equal(f.values.get("duolinting.analytics.visitor.v1"), "signed-fixture-proof");
  await client.configure(true);
  assert.equal(snapshots(f.values)[0].owner, "anonymous");
  await client.configure(false);
  assert.equal(f.values.size, 0);
});

test("browser client labels follow device rather than the served Web project", () => {
  assert.equal(browserClientType("Mozilla iPhone Mobile", 5), "mobile_web");
  assert.equal(browserClientType("Mozilla Android", 1), "mobile_web");
  assert.equal(browserClientType("Mozilla Macintosh", 5), "mobile_web");
  assert.equal(browserClientType("Mozilla Macintosh", 0), "web_app");
});

test("a final flush waits for an event scheduled immediately before backgrounding", async () => {
  const f = fixture(), client = new AnalyticsClient(f.options);
  await client.configure(true);
  await client.track("page_view", { pageViewId: randomUUID(), path: "/seed" });
  await tick(); await client.flush(); await tick();
  void client.track("page_view", { pageViewId: randomUUID(), path: "/last-event" });
  await client.flush();
  assert.ok([...f.accepted.values()].some((event) => event.properties.path === "/last-event"));
});
