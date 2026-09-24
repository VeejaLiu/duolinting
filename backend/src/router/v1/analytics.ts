import { env } from "../../env";
import {
  setAnonymousCookie,
  clearAnonymousCookie,
} from "../../general/analytics/cookie";
import express from "express";
import {
  createContext,
  ingestEvents,
  revokeContext,
  rows,
  publishedVersion,
} from "../../general/analytics/service";
const router = express.Router();
router.use((req, res, next) => {
  const origin = req.get("origin");
  const configured = env.cors.origins.split(",").map((value) => value.trim());
  const local =
    env.isDevelopment &&
    !!origin &&
    /^https?:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(:\d+)?$/.test(
      origin,
    );
  if (origin && !configured.includes(origin) && !local)
    return res.status(403).send({ message: "Analytics origin not allowed" });
  next();
});
// Successful ingestion also consumes quota. Auth's success-reset limiter is unsuitable here.
const buckets = new Map<string, { count: number; until: number }>();
router.use((req, res, next) => {
  const now = Date.now(),
    key = req.ip ?? "unknown";
  if (buckets.size >= 10000)
    for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
  const bucket = buckets.get(key);
  const nextBucket =
    !bucket || bucket.until < now
      ? { count: 1, until: now + 60000 }
      : { ...bucket, count: bucket.count + 1 };
  if (!bucket && buckets.size >= 10000)
    return res
      .status(429)
      .set("Retry-After", "60")
      .send({ message: "Analytics capacity reached" });
  buckets.set(key, nextBucket);
  if (nextBucket.count > 120)
    return res
      .status(429)
      .set("Retry-After", "60")
      .send({ message: "Analytics rate limit" });
  next();
});
router.post("/context", async (req, res) => {
  const context = await createContext(req);
  setAnonymousCookie(req, res, context.anonymousId);
  res.send(context);
});
router.post("/events", async (req, res) => res.send(await ingestEvents(req)));
router.post("/revoke", async (req, res) => {
  const result = await revokeContext(req);
  clearAnonymousCookie(req, res);
  res.send(result);
});
router.get("/courses/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(400);
  const [course] = await rows(
    "select transcript_json,audio_url from exercises where id=:id and status='published'",
    { id },
  );
  if (!course) return res.sendStatus(404);
  res.send({ courseVersion: publishedVersion(course as any) });
});
router.use(((error, _req, res, next) => {
  if (error.status && error.status < 500)
    return res.status(error.status).send({ message: error.message });
  next(error);
}) as express.ErrorRequestHandler);
export default router;
