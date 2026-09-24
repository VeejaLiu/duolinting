import type { Request } from "express";
import { isIP } from "node:net";

export type GeoContext = {
  countryCode: string;
  source: string;
  observedAt: string | null;
  dbVersion: string | null;
};
export const trustedProxyRanges = () =>
  (process.env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export const requestClientIp = (req: Request) =>
  req.ip ?? req.socket.remoteAddress ?? "unknown";
// A local database adapter can be installed at bootstrap; no IP is sent to a third-party API.
let lookup:
  | ((ip: string) => { countryCode: string; version: string } | undefined)
  | undefined;
export function setCountryDatabase(adapter: typeof lookup) {
  lookup = adapter;
}
export function resolveRequestGeoContext(req: Request): GeoContext {
  const unknown: GeoContext = {
    countryCode: "unknown",
    source: "unknown",
    observedAt: null,
    dbVersion: null,
  };
  const ip = requestClientIp(req);
  if (
    !isIP(ip) ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80)/i.test(
      ip.replace(/^::ffff:/, ""),
    )
  )
    return unknown;
  // Internal geo headers are only accepted from an explicitly trusted immediate proxy.
  // That ingress must overwrite both headers; CF headers received directly are never trusted.
  const trust = req.app.get("trust proxy fn") as
    | ((ip: string, hop: number) => boolean)
    | undefined;
  if (
    process.env.ANALYTICS_TRUST_GEO_HEADER === "true" &&
    trust?.(req.socket.remoteAddress ?? "", 0)
  ) {
    const country = req.get("x-analytics-country") ?? "";
    if (/^[A-Z]{2}$/.test(country) && !["XX", "T1"].includes(country))
      return {
        countryCode: country,
        source: "trusted_ingress",
        observedAt: new Date().toISOString(),
        dbVersion: null,
      };
  }
  try {
    const result = lookup?.(ip);
    if (result && /^[A-Z]{2}$/.test(result.countryCode))
      return {
        countryCode: result.countryCode,
        source: "local_database",
        observedAt: new Date().toISOString(),
        dbVersion: result.version,
      };
  } catch {
    /* Geo failure must not block registration or playback. */
  }
  return unknown;
}

/** MMDB files are provisioned locally; the reader reloads atomically when operators replace the database. */
export async function loadCountryDatabase() {
  const file = process.env.ANALYTICS_GEO_DB_PATH;
  if (!file) return;
  try {
    const { open } = await import("maxmind");
    const reader = await open<import("maxmind").CountryResponse>(file, {
      cache: { max: 5000 },
      watchForUpdates: true,
      watchForUpdatesNonPersistent: true,
    });
    setCountryDatabase((ip) => {
      const result = reader.get(ip);
      return result?.country?.iso_code
        ? {
            countryCode: result.country.iso_code,
            version: String(reader.metadata.buildEpoch),
          }
        : undefined;
    });
  } catch {
    /* Missing/corrupt optional MMDB yields explicit unknown geography. */
  }
}
