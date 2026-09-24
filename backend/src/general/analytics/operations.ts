import { sequelize } from "../../models/db-config-mysql";
import { write, rows, sqlTime } from "./service";
/** Provider-neutral snapshots replace the same source partition; delayed log refreshes cannot add bytes twice. */
export async function importTraffic(input: unknown) {
  if (!Array.isArray(input) || input.length > 500)
    throw Object.assign(new Error("Maximum 500 traffic partitions"), {
      status: 400,
    });
  for (const r of input) {
    if (
      !r ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.statDate) ||
      !["downstream", "origin", "upload"].includes(r.deliveryRole) ||
      !["country", "provider_region", "none"].includes(r.dimensionType) ||
      !["complete", "partial", "sampled"].includes(r.completeness)
    )
      throw Object.assign(new Error("Invalid traffic dimensions"), {
        status: 400,
      });
    for (const key of [
      "provider",
      "host",
      "dimensionValue",
      "resourceType",
      "sourceId",
    ])
      if (
        typeof r[key] !== "string" ||
        !r[key] ||
        r[key].length >
          ({
            host: 255,
            sourceId: 128,
            dimensionValue: 64,
            resourceType: 24,
            provider: 32,
          }[key] ?? 64)
      )
        throw Object.assign(new Error("Invalid traffic source"), {
          status: 400,
        });
    for (const key of ["bytes", "requests", "errors", "hits"])
      if (!Number.isSafeInteger(r[key]) || r[key] < 0)
        throw Object.assign(new Error("Invalid traffic counters"), {
          status: 400,
        });
    if (!(r.sampling > 0 && r.sampling <= 1))
      throw Object.assign(new Error("Invalid sampling"), { status: 400 });
  }
  await sequelize.transaction(async (transaction) => {
    const groups = new Map(
      input.map((r) => [
        [r.statDate, r.provider, r.host, r.deliveryRole, r.sourceId].join("|"),
        r,
      ]),
    );
    for (const r of groups.values())
      await write(
        "delete from analytics_traffic_daily where stat_date=:statDate and provider=:provider and host=:host and delivery_role=:deliveryRole and source_id=:sourceId",
        r,
        transaction,
      );
    for (const r of input)
      await write(
        `insert into analytics_traffic_daily(stat_date,provider,host,delivery_role,dimension_type,dimension_value,resource_type,source_id,bytes,requests,errors,hits,sampling,completeness,observed_at) values(:statDate,:provider,:host,:deliveryRole,:dimensionType,:dimensionValue,:resourceType,:sourceId,:bytes,:requests,:errors,:hits,:sampling,:completeness,UTC_TIMESTAMP(3)) on duplicate key update bytes= :bytes,requests= :requests,errors= :errors,hits= :hits,sampling= :sampling,completeness= :completeness,observed_at=UTC_TIMESTAMP(3)`,
        r,
        transaction,
      );
  });
  return { imported: input.length };
}
/** Run from a protected operator action; advisory lock pins to this transaction's connection. */
export async function pruneAnalytics() {
  return sequelize.transaction(async (transaction) => {
    const [lock] = await rows(
      "select get_lock('analytics_retention',0) as acquired",
      {},
      transaction,
    );
    if (!lock.acquired) return { status: "busy" };
    try {
      await write(
        "delete from analytics_events where event_at<UTC_TIMESTAMP()-interval 90 day",
        {},
        transaction,
      );
      await write(
        "delete from analytics_sessions where last_activity_at<UTC_TIMESTAMP()-interval 13 month",
        {},
        transaction,
      );
      await write(
        "delete from analytics_user_daily where stat_date<UTC_DATE()-interval 13 month",
        {},
        transaction,
      );
      await write(
        "delete from analytics_user_dimension_daily where stat_date<UTC_DATE()-interval 13 month",
        {},
        transaction,
      );
      await write(
        "delete from user_activity_operations where created_at<UTC_TIMESTAMP()-interval 90 day",
        {},
        transaction,
      );
      return { status: "complete", completedAt: sqlTime(Date.now()) };
    } finally {
      await rows("select release_lock('analytics_retention')", {}, transaction);
    }
  });
}

export function startAnalyticsMaintenance() {
  if (process.env.ANALYTICS_MAINTENANCE_ENABLED !== "true") return;
  // One hourly sweep bounds retention overshoot; no raw events are needed to preserve materialized daily unions.
  const timer = setInterval(() => {
    void pruneAnalytics().catch(() => {
      /* Next hourly run retries; product requests are unaffected. */
    });
  }, 3600000);
  timer.unref();
}
