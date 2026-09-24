import fs from "node:fs";
import {
  aggregateDelivery,
  nginxDelivery,
} from "../backend/src/general/analytics/traffic-adapters.ts";
// Run with node --import tsx. Source file must cover a complete stable partition; re-fetch the latest 48h upstream.
const [file, provider, sourceId, deliveryRole] = process.argv.slice(2);
if (
  !file ||
  !provider ||
  !sourceId ||
  !["downstream", "origin"].includes(deliveryRole)
)
  throw new Error(
    "Usage: node --import tsx scripts/import-analytics-traffic.mjs <nginx-jsonl> <provider> <stable-partition> <downstream|origin>",
  );
const url = process.env.ANALYTICS_ADMIN_BASE_URL,
  token = process.env.ANALYTICS_ADMIN_TOKEN;
if (!url || !token)
  throw new Error(
    "Set ANALYTICS_ADMIN_BASE_URL and ANALYTICS_ADMIN_TOKEN locally",
  );
const records = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map(nginxDelivery);
const partitions = aggregateDelivery(records, {
  provider,
  sourceId,
  deliveryRole,
  sampling: 1,
  completeness:
    process.env.ANALYTICS_TRAFFIC_COMPLETE === "true" ? "complete" : "partial",
});
const groups = new Map();
for (const row of partitions) {
  const key = [
    row.statDate,
    row.provider,
    row.host,
    row.deliveryRole,
    row.sourceId,
  ].join("|");
  groups.set(key, [...(groups.get(key) ?? []), row]);
}
for (const group of groups.values()) {
  if (group.length > 500)
    throw new Error(
      "Partition exceeds 500 dimensions; use finer stable source partitions",
    );
  const response = await fetch(
    url.replace(/\/$/, "") + "/api/v1/admin/analytics/traffic/import",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ partitions: group }),
    },
  );
  if (!response.ok)
    throw new Error("Traffic import failed: " + response.status);
}
console.log(
  `Imported ${partitions.length} aggregate traffic partitions. No source IPs were uploaded.`,
);
