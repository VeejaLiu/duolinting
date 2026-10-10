import { doRawQuery } from '../../models';
import { accessDaysSql } from '../analytics/access-days';

type GrowthSummaryRow = {
    total_users: number | string;
    registered_today_count: number | string;
    registered_7d_count: number | string;
    registered_30d_count: number | string;
    dau: number | string;
    wau: number | string;
    mau: number | string;
    tracking_started_at: Date | string | null;
};

type GrowthTrendRow = {
    activity_date: Date | string;
    registered_user_count: number | string;
    total_registered_user_count: number | string;
    active_user_count: number | string;
    weekly_active_user_count: number | string;
    monthly_active_user_count: number | string;
    web_app_active_user_count: number | string;
    mobile_web_active_user_count: number | string;
    mobile_app_active_user_count: number | string;
};

type ClientDistributionRow = {
    client_type: 'web_app' | 'mobile_web' | 'mobile_app';
    active_today_count: number | string;
    active_7d_count: number | string;
    active_30d_count: number | string;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const formatDay = (value: Date | string | null) => {
    if (!value) return null;
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
};

/**
 * 增长看板统一使用上海自然日：daily 表的唯一键将端内活跃去重；DAU/WAU/MAU
 * 再按 user_id 去重，因此同一用户跨端不会重复算入总活跃。端侧分布则按端独立
 * 去重，跨端用户会同时出现在多个端，用于观察产品触点而非强行二选一。
 */
export async function getAdminGrowthReport() {
    const [summaryRows, trendRows, clientDistributionRows] = await Promise.all([
        doRawQuery<GrowthSummaryRow>({
            query: `
                with eligible_users as (select u.* from users u left join analytics_user_profiles p on p.user_id=u.id where coalesce(p.is_internal,0)=0), eligible_access as (select a.* from (${accessDaysSql()}) a left join analytics_user_profiles p on p.user_id=a.user_id where coalesce(p.is_internal,0)=0)

                select
                    (select count(*) from eligible_users) as total_users,
                    (select count(*) from eligible_users where date(created_at+interval 8 hour) = date(utc_timestamp()+interval 8 hour)) as registered_today_count,
                    (select count(*) from eligible_users where created_at >= date(utc_timestamp()+interval 8 hour) - interval 6 day - interval 8 hour) as registered_7d_count,
                    (select count(*) from eligible_users where created_at >= date(utc_timestamp()+interval 8 hour) - interval 29 day - interval 8 hour) as registered_30d_count,
                    (select count(distinct user_id) from eligible_access where activity_date = date(utc_timestamp()+interval 8 hour)) as dau,
                    (select count(distinct user_id) from eligible_access where activity_date >= date(utc_timestamp()+interval 8 hour) - interval 6 day) as wau,
                    (select count(distinct user_id) from eligible_access where activity_date >= date(utc_timestamp()+interval 8 hour) - interval 29 day) as mau,
                    (select min(activity_date) from eligible_access) as tracking_started_at
            `,
        }),
        doRawQuery<GrowthTrendRow>({
            query: `
                with recursive eligible_users as (select u.* from users u left join analytics_user_profiles p on p.user_id=u.id where coalesce(p.is_internal,0)=0), eligible_access as (select a.* from (${accessDaysSql()}) a left join analytics_user_profiles p on p.user_id=a.user_id where coalesce(p.is_internal,0)=0), days as (
                    select date(utc_timestamp()+interval 8 hour) - interval 29 day as activity_date
                    union all
                    select activity_date + interval 1 day from days where activity_date < date(utc_timestamp()+interval 8 hour)
                )
                select
                    date_format(days.activity_date,'%Y-%m-%d') as activity_date,
                    (select count(*) from eligible_users where date(created_at+interval 8 hour) = days.activity_date) as registered_user_count,
                    (select count(*) from eligible_users where created_at < days.activity_date + interval 1 day - interval 8 hour) as total_registered_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date = days.activity_date) as active_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date between days.activity_date - interval 6 day and days.activity_date) as weekly_active_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date between days.activity_date - interval 29 day and days.activity_date) as monthly_active_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date = days.activity_date and client_type = 'web_app') as web_app_active_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date = days.activity_date and client_type = 'mobile_web') as mobile_web_active_user_count,
                    (select count(distinct user_id) from eligible_access
                        where activity_date = days.activity_date and client_type = 'mobile_app') as mobile_app_active_user_count
                from days
                order by days.activity_date asc
            `,
        }),
        doRawQuery<ClientDistributionRow>({
            query: `
                with eligible_users as (select u.* from users u left join analytics_user_profiles p on p.user_id=u.id where coalesce(p.is_internal,0)=0), eligible_access as (select a.* from (${accessDaysSql()}) a left join analytics_user_profiles p on p.user_id=a.user_id where coalesce(p.is_internal,0)=0)

                select client_types.client_type,
                    count(distinct case when activity_date = date(utc_timestamp()+interval 8 hour) then access_days.user_id end) as active_today_count,
                    count(distinct case when activity_date >= date(utc_timestamp()+interval 8 hour) - interval 6 day then access_days.user_id end) as active_7d_count,
                    count(distinct case when activity_date >= date(utc_timestamp()+interval 8 hour) - interval 29 day then access_days.user_id end) as active_30d_count
                from (select 'web_app' as client_type union all select 'mobile_web' union all select 'mobile_app') client_types
                left join eligible_access access_days on access_days.client_type = client_types.client_type
                    and access_days.activity_date >= date(utc_timestamp()+interval 8 hour) - interval 29 day
                group by client_types.client_type
                order by field(client_types.client_type, 'web_app', 'mobile_web', 'mobile_app')
            `,
        }),
    ]);

    const summaryRow = summaryRows[0];
    const dau = toNumber(summaryRow?.dau);
    const mau = toNumber(summaryRow?.mau);
    return {
        generatedAt: new Date().toISOString(),
        trackingStartedAt: formatDay(summaryRow?.tracking_started_at ?? null),
        summary: {
            totalUsers: toNumber(summaryRow?.total_users),
            registeredTodayCount: toNumber(summaryRow?.registered_today_count),
            registered7dCount: toNumber(summaryRow?.registered_7d_count),
            registered30dCount: toNumber(summaryRow?.registered_30d_count),
            dau,
            wau: toNumber(summaryRow?.wau),
            mau,
            dauMauPercent: mau > 0 ? Math.round((dau / mau) * 1000) / 10 : 0,
        },
        trend: trendRows.map((row) => ({
            date: formatDay(row.activity_date) ?? '',
            registeredUserCount: toNumber(row.registered_user_count),
            totalRegisteredUserCount: toNumber(row.total_registered_user_count),
            activeUserCount: toNumber(row.active_user_count),
            weeklyActiveUserCount: toNumber(row.weekly_active_user_count),
            monthlyActiveUserCount: toNumber(row.monthly_active_user_count),
            webAppActiveUserCount: toNumber(row.web_app_active_user_count),
            mobileWebActiveUserCount: toNumber(row.mobile_web_active_user_count),
            mobileAppActiveUserCount: toNumber(row.mobile_app_active_user_count),
        })),
        clientDistribution: clientDistributionRows.map((row) => ({
            clientType: row.client_type,
            activeTodayCount: toNumber(row.active_today_count),
            active7dCount: toNumber(row.active_7d_count),
            active30dCount: toNumber(row.active_30d_count),
        })),
    };
}
