import type { ClaimableWorkflowTaskPage } from '../../../domain';
import { doRawQuery } from '../../../models';
import { parseWorkflowLocalizations } from '.././workflow-localizations';
import type { AdminWorkflowOverview } from '../../../domain';
import type { CourseWorkflowAssignmentSource } from '../../../domain';
import type { SubtitleDraftStatus } from '../../../domain';
import { CLAIM_WINDOW_HOURS } from './policy';
import { MAX_CONCURRENT_CLAIMS } from './policy';
import { countActiveProofreadingClaims } from './policy';

/**
 * 任务池的可领取课程：草稿状态、媒体就绪、未被禁止领取、且当前没有有效校对负责人。
 * 两种来源的过期锁都视同无主，由“not exists”条件惰性过滤。
 */
export async function listClaimableWorkflowTasks({
    adminId,
    page = 1,
    pageSize = 20,
    groupId,
    categoryId,
}: {
    adminId: number;
    page?: number;
    pageSize?: number;
    groupId?: number;
    categoryId?: number;
}): Promise<ClaimableWorkflowTaskPage> {
    const resolvedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const resolvedPageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 20;
    const offset = (resolvedPage - 1) * resolvedPageSize;
    // 过滤条件使用绑定参数，避免把前端传入的目录 ID 拼进 SQL；空值表示不过滤。
    const normalizedGroupId = typeof groupId === 'number' && Number.isInteger(groupId) && groupId > 0 ? groupId : undefined;
    const normalizedCategoryId = typeof categoryId === 'number' && Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined;
    const directoryConditions = [
        normalizedGroupId ? 'and c.group_id = :groupId' : '',
        normalizedCategoryId ? 'and e.category_id = :categoryId' : '',
    ].join('\n                      ');
    const directoryParams = {
        ...(normalizedGroupId ? { groupId: normalizedGroupId } : {}),
        ...(normalizedCategoryId ? { categoryId: normalizedCategoryId } : {}),
    };
    const [countRows, rows] = await Promise.all([
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total
                    from exercises e
                    inner join categories c on c.id = e.category_id
                    where e.status = 'draft'
                      and e.claim_blocked = false
                      and trim(e.audio_url) <> ''
                      ${directoryConditions}
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id
                          and assignees.workflow_role = 'proofreader'
                          and (
                            assignees.claim_expires_at is null
                            or assignees.claim_expires_at > utc_timestamp()
                          )
                      )`,
            params: directoryParams,
        }),
        doRawQuery<{
            exercise_id: number | string;
            category_id: number | string;
            exercise_title: string;
    exercise_localizations: unknown;
            category_name: string;
            difficulty: string;
            media_type: string;
            line_count: number | string;
            claim_release_count: number | string;
        }>({
            query: `select e.id as exercise_id, e.category_id, e.title as exercise_title, e.localizations_json as exercise_localizations, c.name as category_name,
                           e.difficulty, e.media_type,
                           json_length(coalesce(e.transcript_json, json_array())) as line_count,
                           (
                             select count(*) from admin_workflow_activity_events events
                             where events.exercise_id = e.id
                               and events.event_type in ('workflow_claim_released', 'workflow_claim_expired')
                           ) as claim_release_count
                    from exercises e
                    inner join categories c on c.id = e.category_id
                    where e.status = 'draft'
                      and e.claim_blocked = false
                      and trim(e.audio_url) <> ''
                      ${directoryConditions}
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id
                          and assignees.workflow_role = 'proofreader'
                          and (
                            assignees.claim_expires_at is null
                            or assignees.claim_expires_at > utc_timestamp()
                          )
                      )
                    order by e.sort_order asc, e.created_at desc, e.title asc
                    limit :limit offset :offset`,
            params: { ...directoryParams, limit: resolvedPageSize, offset },
        }),
    ]);
    return {
        items: rows.map((row) => ({
            exerciseId: Number(row.exercise_id),
            exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
            categoryId: Number(row.category_id),
            categoryName: row.category_name,
            difficulty: row.difficulty as ClaimableWorkflowTaskPage['items'][number]['difficulty'],
            mediaType: row.media_type === 'video' ? 'video' : 'audio',
            lineCount: Number(row.line_count ?? 0),
            claimReleaseCount: Number(row.claim_release_count ?? 0),
        })),
        page: resolvedPage,
        pageSize: resolvedPageSize,
        total: Number(countRows[0]?.total ?? 0),
        policy: {
            claimWindowHours: CLAIM_WINDOW_HOURS,
            maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
            myActiveClaimCount: await countActiveProofreadingClaims(adminId),
        },
    };
}

/**
 * 超级管理员的任务池概览：谁闲着、谁卡住、池子是否需要补课。
 * “超期未提交”包含管理员指派（只标记不释放）和自助领取（会被清扫器释放）两类。
 */
export async function getWorkflowOverview(): Promise<AdminWorkflowOverview> {
    const now = new Date();
    const hoursBetween = (iso: string) => {
        const at = new Date(iso).getTime();
        return Math.max(0, Math.floor((now.getTime() - at) / (60 * 60 * 1000)));
    };

    const [claimable, unready, blocked, awaiting, overdueRows, statRows] = await Promise.all([
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total
                    from exercises e
                    where e.status = 'draft' and e.claim_blocked = false and trim(e.audio_url) <> ''
                      and not exists (
                        select 1 from exercise_workflow_assignees assignees
                        where assignees.exercise_id = e.id and assignees.workflow_role = 'proofreader'
                          and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                      )`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercises
                    where status = 'draft' and (audio_url is null or trim(audio_url) = '')`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercises where status = 'draft' and claim_blocked = true`,
        }),
        doRawQuery<{ total: number | string }>({
            query: `select count(*) as total from exercise_subtitle_drafts where status = 'submitted'`,
        }),
        doRawQuery<{
            exercise_id: number | string;
            exercise_title: string;
    exercise_localizations: unknown;
            contributor_display_name: string;
            assignment_source: CourseWorkflowAssignmentSource;
            draft_status: SubtitleDraftStatus | null;
            claim_expires_at: Date | string;
        }>({
            query: `select assignees.exercise_id, exercises.title as exercise_title, exercises.localizations_json as exercise_localizations,
                           admins.display_name as contributor_display_name,
                           assignees.assignment_source,
                           coalesce(drafts.status, 'editing') as draft_status,
                           assignees.claim_expires_at
                    from exercise_workflow_assignees assignees
                    inner join exercises on exercises.id = assignees.exercise_id
                    inner join admin_users admins on admins.id = assignees.admin_user_id
                    left join exercise_subtitle_drafts drafts
                      on drafts.exercise_id = assignees.exercise_id
                     and drafts.admin_user_id = assignees.admin_user_id
                    where assignees.workflow_role = 'proofreader'
                      and assignees.claim_expires_at is not null
                      and assignees.claim_expires_at <= utc_timestamp()
                      and coalesce(drafts.status, 'editing') <> 'submitted'
                    order by assignees.claim_expires_at asc
                    limit 100`,
        }),
        doRawQuery<{
            admin_user_id: number | string;
            display_name: string;
            active_claim_count: number | string;
            awaiting_review_count: number | string;
            overdue_count: number | string;
            completed_count: number | string;
        }>({
            query: `select admins.id as admin_user_id, admins.display_name,
                           (
                             select count(*) from exercise_workflow_assignees assignees
                             inner join exercises on exercises.id = assignees.exercise_id
                             where assignees.admin_user_id = admins.id
                               and assignees.workflow_role = 'proofreader'
                               and exercises.status in ('draft', 'proofread')
                               and (assignees.claim_expires_at is null or assignees.claim_expires_at > utc_timestamp())
                           ) as active_claim_count,
                           (
                             select count(*) from exercise_subtitle_drafts drafts
                             where drafts.reviewer_admin_user_id = admins.id and drafts.status = 'submitted'
                           ) as awaiting_review_count,
                           (
                             select count(*) from exercise_workflow_assignees assignees
                             left join exercise_subtitle_drafts drafts
                               on drafts.exercise_id = assignees.exercise_id
                              and drafts.admin_user_id = assignees.admin_user_id
                             where assignees.admin_user_id = admins.id
                               and assignees.workflow_role = 'proofreader'
                               and assignees.claim_expires_at is not null
                               and assignees.claim_expires_at <= utc_timestamp()
                               and coalesce(drafts.status, 'editing') <> 'submitted'
                           ) as overdue_count,
                           (
                             select count(*) from exercise_subtitle_drafts drafts
                             where drafts.admin_user_id = admins.id and drafts.status = 'approved'
                           ) as completed_count
                    from admin_users admins
                    where admins.role = 'subtitle_contributor' and admins.is_active = true
                    order by admins.display_name asc`,
        }),
    ]);

    const contributors = statRows.map((row) => {
        const active = Number(row.active_claim_count ?? 0);
        const awaiting = Number(row.awaiting_review_count ?? 0);
        const overdue = Number(row.overdue_count ?? 0);
        const completed = Number(row.completed_count ?? 0);
        return {
            adminUserId: Number(row.admin_user_id),
            displayName: row.display_name,
            activeClaimCount: active,
            awaitingReviewCount: awaiting,
            overdueCount: overdue,
            completedCount: completed,
            // “空闲”定义为：没有进行中的课程，也没有待审核的稿子。
            isIdle: active === 0 && awaiting === 0,
        };
    });

    return {
        generatedAt: now.toISOString(),
        claimableCount: Number(claimable[0]?.total ?? 0),
        unreadyDraftCount: Number(unready[0]?.total ?? 0),
        claimBlockedCount: Number(blocked[0]?.total ?? 0),
        awaitingReviewCount: Number(awaiting[0]?.total ?? 0),
        overdueTasks: overdueRows.map((row) => {
            const expiresIso = new Date(row.claim_expires_at).toISOString();
            return {
                exerciseId: Number(row.exercise_id),
                exerciseTitle: row.exercise_title,
            exerciseLocalizations: parseWorkflowLocalizations(row.exercise_localizations),
                contributorDisplayName: row.contributor_display_name,
                source: row.assignment_source,
                stage: row.draft_status === 'returned' ? 'returned' : 'proofreading',
                claimExpiresAt: expiresIso,
                overdueHours: hoursBetween(expiresIso),
            };
        }),
        contributors,
        idleContributorCount: contributors.filter((item) => item.isIdle).length,
        policy: {
            claimWindowHours: CLAIM_WINDOW_HOURS,
            maxConcurrentClaims: MAX_CONCURRENT_CLAIMS,
            myActiveClaimCount: 0,
        },
    };
}
