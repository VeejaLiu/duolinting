import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

/** 每个请求独立记录毫秒耗时；并发步骤的时间不能直接相加当作总耗时。 */
export class AdminListPerformance {
    readonly steps: Record<string, number> = {};
    readonly counts: Record<string, number> = {};

    async measure<T>(step: string, action: () => Promise<T>): Promise<T> {
        const start = performance.now();
        try { return await action(); }
        finally {
            this.steps[step] = Math.round(((this.steps[step] ?? 0) + performance.now() - start) * 10) / 10;
        }
    }
}

export const adminListPerformance = new AsyncLocalStorage<AdminListPerformance>();
export const measureAdminListStep = <T>(step: string, action: () => Promise<T>): Promise<T> => {
    const trace = adminListPerformance.getStore();
    return trace ? trace.measure(step, action) : action();
};

// 只诊断列表加载相关 GET，不记录查询文本、搜索词、身份、凭据或课程内容。
export const adminListPaths = new Set([
    '/api/v1/admin/catalog', '/api/v1/admin/exercises',
    '/api/v1/admin/collaboration/members', '/api/v1/admin/subtitle-review-tasks',
    '/api/v1/admin/subtitle-workflow-inbox', '/api/v1/admin/workflow-notifications',
]);

/** 浏览器在下一次列表请求捎带上次耗时，避免为了日志增加独立网络请求。 */
export function parsePreviousListTiming(header: unknown) {
    if (typeof header !== 'string' || header.length > 512) return undefined;
    try {
        const value = JSON.parse(header);
        if (!value || !adminListPaths.has(value.path)
            || typeof value.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(value.requestId)) return undefined;
        const validMs = (ms: unknown) => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= 300_000;
        if (!validMs(value.fetchMs) || !validMs(value.parseMs)) return undefined;
        return { path: value.path, requestId: value.requestId, fetchMs: value.fetchMs, parseMs: value.parseMs };
    } catch { return undefined; }
}
