import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../env';

export const TOKEN_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

export function signToken(
    userId: string | number,
    session?: {
        sessionId: string | number;
        clientType: string;
    },
): string {
    return jwt.sign(
        {
            id: userId,
            ...session,
            // 每次签发都带唯一 jti，避免同一秒重签同一 session 时生成相同 JWT，
            // 从而保证密码更新撤销旧 token 后，新 token 一定具有不同的哈希。
            jti: crypto.randomUUID(),
        },
        env.secret.jwt,
        {
            expiresIn: TOKEN_EXPIRES_IN_SECONDS,
        },
    );
}
