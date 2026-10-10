import { AdminListPerformance, adminListPaths, adminListPerformance, parsePreviousListTiming } from './admin-list-performance';
import { requestClientIp } from '../general/analytics/geo';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Logger } from './logger';

const logger = new Logger(__filename);

const getRequestSummary = (req: Request, res: Response, startedAt: bigint) => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const contentLength = res.getHeader('content-length');

    return [
        `id=${res.locals.requestId}`,
        `${req.method} ${req.originalUrl.split('?')[0]}`,
        `status=${res.statusCode}`,
        `duration=${durationMs.toFixed(1)}ms`,
        `ip=${requestClientIp(req)}`,
        `origin=${req.headers.origin ?? '-'}`,
        `bytes=${contentLength ?? '-'}`,
    ].join(' ');
};

export const requestLogger = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const startedAt = process.hrtime.bigint();
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId);

    const path = req.originalUrl.split('?')[0];
    const trace = req.method === 'GET' && adminListPaths.has(path) ? new AdminListPerformance() : undefined;
    const clientPrevious = trace ? parsePreviousListTiming(req.headers['x-admin-list-timing']) : undefined;
    // 每次列表请求只追加一行汇总；沿用现有后台日志输出与保留策略。
    const writePerformance = (outcome: 'finished' | 'aborted') => {
        if (trace) logger.info(`[admin-list-perf] ${JSON.stringify({
            requestId: res.locals.requestId, path, status: res.statusCode, outcome,
            totalMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 100_000) / 10,
            bytes: Number(res.getHeader('content-length') ?? 0),
            stepsMs: trace.steps, counts: trace.counts, clientPrevious,
        })}`);
    };
    res.on('close', () => {
        // 被浏览器取消的请求也保留一条；此时尚未结束的步骤不会出现在汇总中。
        if (!res.writableFinished) writePerformance('aborted');
    });
    res.on('finish', () => {
        writePerformance('finished');
        const summary = getRequestSummary(req, res, startedAt);
        if (res.statusCode >= 500) {
            logger.error(`<-- ${summary}`);
            return;
        }
        if (res.statusCode >= 400) {
            logger.warn(`<-- ${summary}`);
            return;
        }
        logger.info(`<-- ${summary}`);
    });

    if (trace) adminListPerformance.run(trace, next);
    else next();
};
