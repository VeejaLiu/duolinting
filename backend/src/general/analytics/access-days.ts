/**
 * Legacy endpoint columns are MySQL TIMESTAMP (not the ambiguous DATE bucket).
 * The backend connection reads them in UTC, regardless of the zone that wrote
 * the old bucket. Endpoint days are observed facts, not continuous activity.
 */
export function accessDaysSql() {
  const legacy = `select user_id,client_type,date(first_seen_at + interval 8 hour) as activity_date from user_access_daily
       union select user_id,client_type,date(last_seen_at + interval 8 hour) as activity_date from user_access_daily`;
  // Cast the DATE expression to text: mysql2 otherwise interprets UNION dates
  // in the process timezone before a caller can read the calendar-day label.
  return `select distinct user_id,client_type,cast(activity_date as char) as activity_date from (
    ${legacy}
    union select user_id,client_type,stat_date as activity_date from user_access_daily_v2
  ) normalized_access`;
}
