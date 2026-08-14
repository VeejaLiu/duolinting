import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Logger } from './logger';

const logger = new Logger(__filename);

const getClientIp = (req: Request) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }

    return req.socket.remoteAddress ?? 'unknown';
};

const getRequestSummary = (req: Request, res: Response, startedAt: bigint) => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const contentLength = res.getHeader('content-length');

    return [
        `id=${res.locals.requestId}`,
        `${req.method} ${req.originalUrl}`,
        `status=${res.statusCode}`,
        `duration=${durationMs.toFixed(1)}ms`,
        `ip=${getClientIp(req)}`,
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

    res.on('finish', () => {
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

    next();
};
