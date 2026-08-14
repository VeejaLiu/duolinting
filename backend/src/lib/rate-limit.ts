import type { NextFunction, Request, Response } from 'express';

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

type RateLimitOptions = {
    namespace: string;
    windowMs: number;
    maxAttempts: number;
    keys: (req: Request) => string[];
};

const attempts = new Map<string, RateLimitEntry>();

/**
 * 认证接口的轻量限流器。key 同时包含客户端 IP 和规范化账号，避免单个来源
 * 对同一账号无限猜测，也避免只按账号限流时被攻击者用来锁死其他用户。
 * 当前部署是单后端实例；若扩展为多实例，应把计数器迁移到 Redis 等共享存储。
 */
export const createRateLimit = ({ namespace, windowMs, maxAttempts, keys }: RateLimitOptions) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        let blockedUntil = 0;
        const bucketKeys: string[] = [];

        // 同时计算来源 IP 桶和账号桶：轮换账号不能绕过 IP 限制，分布式来源也不能
        // 对同一账号无限尝试。namespace 避免注册、学习者登录、管理员登录互相污染。
        for (const rawKey of keys(req)) {
            const bucketKey = `${namespace}:${rawKey}`;
            bucketKeys.push(bucketKey);
            const current = attempts.get(bucketKey);
            const entry = !current || current.resetAt <= now
                ? { count: 0, resetAt: now + windowMs }
                : current;
            entry.count += 1;
            attempts.set(bucketKey, entry);
            if (entry.count > maxAttempts) blockedUntil = Math.max(blockedUntil, entry.resetAt);
        }

        if (blockedUntil > now) {
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((blockedUntil - now) / 1000))));
            return res.status(429).send({ success: false, message: 'Too many attempts. Please try again later.' });
        }

        // 成功的登录或注册不是攻击尝试：请求成功后清空本次来源和账号桶，
        // 避免正常用户主动重登多次后被固定窗口误伤。失败响应仍保留计数。
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                for (const bucketKey of bucketKeys) attempts.delete(bucketKey);
            }
        });

        // 顺手清理已过期桶，避免长期运行时由随机账号标识造成 Map 无界增长。
        if (attempts.size > 10_000) {
            for (const [storedKey, storedEntry] of attempts) {
                if (storedEntry.resetAt <= now) attempts.delete(storedKey);
            }
        }

        next();
    };
};

export const authenticationRateLimitKeys = (accountField: 'email' | 'username') => (req: Request) => {
    const account = String(req.body?.[accountField] ?? '').trim().toLowerCase().slice(0, 255);
    return [`ip:${req.ip}`, `account:${account || '-'}`];
};
