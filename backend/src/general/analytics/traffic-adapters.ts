import { statDate } from "./contracts";
/** Normalized edge records. Adapter callers must supply a stable whole-partition sourceId, not a download attempt ID. */
export type DeliveryRecord = {
  at: string;
  host: string;
  bytes: number;
  status: number;
  cacheHit: boolean;
  country?: string;
  resourceType: "audio" | "video" | "other";
};
export function aggregateDelivery(
  records: DeliveryRecord[],
  source: {
    provider: string;
    sourceId: string;
    deliveryRole: "downstream" | "origin";
    sampling: number;
    completeness: "complete" | "partial" | "sampled";
  },
) {
  const buckets = new Map<string, Record<string, any>>();
  for (const r of records) {
    if (
      !Number.isFinite(Date.parse(r.at)) ||
      !Number.isSafeInteger(r.bytes) ||
      r.bytes < 0 ||
      !Number.isInteger(r.status) ||
      r.status < 100 ||
      r.status > 599
    )
      throw new Error("Invalid delivery record");
    const country =
      r.country && /^[A-Z]{2}$/.test(r.country) && r.country !== "XX"
        ? r.country
        : "unknown";
    const stat = statDate(Date.parse(r.at)),
      key = [stat, r.host, country, r.resourceType].join("|");
    const row = buckets.get(key) ?? {
      statDate: stat,
      ...source,
      host: r.host,
      dimensionType: "country",
      dimensionValue: country,
      resourceType: r.resourceType,
      bytes: 0,
      requests: 0,
      errors: 0,
      hits: 0,
    };
    row.bytes += r.bytes;
    row.requests++;
    row.errors += r.status >= 400 ? 1 : 0;
    row.hits += r.cacheHit ? 1 : 0;
    buckets.set(key, row);
  }
  return [...buckets.values()];
}
/** Nginx JSON logs use actual sent body bytes. When this is an origin behind CDN, label it origin, never downstream. */
export function nginxDelivery(line: string): DeliveryRecord {
  const r = JSON.parse(line);
  return {
    at: r.time,
    host: r.host,
    bytes: Number(r.bytes),
    status: Number(r.status),
    cacheHit: r.cache === "HIT",
    country: r.country,
    resourceType: /\.(mp4|webm|mov)$/i.test(r.path)
      ? "video"
      : /\.(mp3|m4a|wav|aac|ogg)$/i.test(r.path)
        ? "audio"
        : "other",
  };
}
/** CDN exports are normalized explicitly. Region-like provider fields must not be relabeled as visitor country. */
export function providerDelivery(
  record: Record<string, unknown>,
  fields: {
    time: string;
    host: string;
    bytes: string;
    status: string;
    cache: string;
    country?: string;
  },
  countryIsVisitorCountry: boolean,
): DeliveryRecord {
  return {
    at: String(record[fields.time]),
    host: String(record[fields.host]),
    bytes: Number(record[fields.bytes]),
    status: Number(record[fields.status]),
    cacheHit: String(record[fields.cache]).toUpperCase() === "HIT",
    country:
      countryIsVisitorCountry && fields.country
        ? String(record[fields.country])
        : "unknown",
    resourceType: "other",
  };
}
