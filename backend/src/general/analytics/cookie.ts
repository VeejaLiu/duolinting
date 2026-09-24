import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../env";
import { uuid } from "./validation";
const name = "duolinting_analytics";
const signature = (body: string) =>
  createHmac("sha256", env.secret.jwt)
    .update("analytics-cookie:" + body)
    .digest("hex");
export function readAnonymousCookie(req: Request) {
  const value = req.cookies?.[name];
  if (typeof value !== "string") return undefined;
  const [id, expiry, sig] = value.split(".");
  const body = id + "." + expiry;
  if (
    !uuid(id) ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) < Date.now() ||
    !sig ||
    !/^[a-f0-9]{64}$/.test(sig)
  )
    return undefined;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(body)))
    ? id
    : undefined;
}
export function setAnonymousCookie(req: Request, res: Response, id: string) {
  const configured = (process.env.ANALYTICS_COOKIE_DOMAIN ?? "")
    .replace(/^\./, "")
    .toLowerCase();
  // Only a configured parent of the current first-party host is accepted; no inferred broad auth cookie scope.
  const domain =
    configured &&
    configured.includes(".") &&
    (req.hostname === configured || req.hostname.endsWith("." + configured))
      ? configured
      : undefined;
  const expires = Date.now() + 30 * 86400000,
    body = id + "." + expires;
  res.cookie(name, body + "." + signature(body), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    domain,
    path: "/",
    maxAge: 30 * 86400000,
  });
}
export function clearAnonymousCookie(req: Request, res: Response) {
  const domain = (process.env.ANALYTICS_COOKIE_DOMAIN ?? "").replace(/^\./, "");
  res.clearCookie(name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(domain && req.hostname.endsWith(domain) ? { domain } : {}),
  });
}
