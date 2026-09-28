import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { UserModel } from '../../models/schema/UserDB';
import { UserReauthTicketModel, type ReauthPurpose } from '../../models/schema/UserReauthTicketDB';
import { consumeUserEmailChallenge } from './user-email-challenge-service';

const TICKET_TTL_MS = 5 * 60 * 1000;
const ticketHash = (ticket: string) => createHash('sha256').update(ticket).digest('hex');
export const reauthChallengePurpose = (purpose: ReauthPurpose) => `reauth_${purpose}` as const;

export class ReauthError extends Error {
    constructor(public readonly code: string, public readonly status = 400) {
        super(code);
    }
}

/** A reauth ticket is single-use and bound to the exact session and operation. */
export async function issueReauthTicket({
    userId, sessionId, purpose, method, password, challengeId, code,
}: {
    userId: number;
    sessionId: number;
    purpose: ReauthPurpose;
    method: 'password' | 'email_code';
    password?: string;
    challengeId?: number;
    code?: string;
}) {
    const ticket = randomBytes(32).toString('hex');
    const result = await sequelize.transaction(async (transaction) => {
        const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) return new ReauthError('USER_NOT_FOUND', 404);
        if (method === 'password') {
            if (!user.password_hash || !password || !(await bcrypt.compare(password, user.password_hash))) {
                return new ReauthError('INVALID_CREDENTIALS', 401);
            }
        } else {
            if (!user.email || !user.email_verified_at) return new ReauthError('EMAIL_AUTH_UNAVAILABLE');
            const error = await consumeUserEmailChallenge({
                email: user.email, purpose: reauthChallengePurpose(purpose),
                challengeId, code, transaction,
            });
            if (error) return error;
        }
        await UserReauthTicketModel.create({
            user_id: userId, session_id: sessionId, purpose,
            ticket_hash: ticketHash(ticket),
            expires_at: new Date(Date.now() + TICKET_TTL_MS),
        } as any, { transaction });
        return null;
    });
    if (result instanceof Error) throw result;
    return { ticket, expiresAt: new Date(Date.now() + TICKET_TTL_MS).toISOString() };
}

/** Call only inside the same transaction as the sensitive mutation. */
export async function consumeReauthTicket({
    userId, sessionId, purpose, ticket, transaction,
}: {
    userId: number;
    sessionId: number;
    purpose: ReauthPurpose;
    ticket: string;
    transaction: Transaction;
}) {
    if (!/^[a-f0-9]{64}$/.test(ticket)) throw new ReauthError('REAUTH_REQUIRED', 403);
    const row = await UserReauthTicketModel.findOne({
        where: { user_id: userId, session_id: sessionId, purpose, ticket_hash: ticketHash(ticket), consumed_at: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) throw new ReauthError('REAUTH_REQUIRED', 403);
    await row.update({ consumed_at: new Date() }, { transaction });
}
