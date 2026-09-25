import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { env } from '../../env';
import { sendTransactionalEmail, isTransactionalEmailConfigured } from '../email/email-service';
import { UserEmailChallengeModel, type UserEmailChallengePurpose } from '../../models/schema/UserEmailChallengeDB';
import { UserModel } from '../../models/schema/UserDB';
import type { UiLocale } from '../../domain';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const SUPPORTED_LOCALES: UiLocale[] = ['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES'];

export type EmailChallengeErrorCode =
    | 'EMAIL_SERVICE_UNAVAILABLE'
    | 'EMAIL_ALREADY_REGISTERED'
    | 'EMAIL_CODE_REQUIRED'
    | 'EMAIL_CODE_INVALID'
    | 'EMAIL_CODE_EXPIRED'
    | 'EMAIL_CODE_LOCKED';

export class EmailChallengeError extends Error {
    constructor(
        public readonly code: EmailChallengeErrorCode,
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'EmailChallengeError';
    }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * The six-digit code is convenient on web and native clients. It is never
 * stored directly: HMAC ties it to both the normalized email and purpose, so a
 * leaked database cannot be brute-forced without the separate server secret.
 */
const hashCode = (email: string, purpose: UserEmailChallengePurpose, code: string) =>
    createHmac('sha256', env.secret.jwt)
        .update(`${purpose}\0${normalizeEmail(email)}\0${code}`)
        .digest('hex');

const codesMatch = (expected: string, actual: string) => {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
};

const normalizeLocale = (locale: unknown): UiLocale =>
    SUPPORTED_LOCALES.includes(locale as UiLocale) ? (locale as UiLocale) : 'en-US';

const emailCopy: Record<UiLocale, Record<UserEmailChallengePurpose, { subject: string; heading: string; intro: string; note: string }>> = {
    'zh-CN': {
        register: { subject: 'DuolinTing 注册验证码', heading: '验证你的邮箱', intro: '使用下面的验证码完成 DuolinTing 注册：', note: '验证码 10 分钟内有效。若不是你本人操作，请忽略此邮件。' },
        password_reset: { subject: 'DuolinTing 密码重置验证码', heading: '重置你的密码', intro: '使用下面的验证码重置 DuolinTing 密码：', note: '验证码 10 分钟内有效。若不是你本人操作，请立即忽略此邮件。' },
    },
    'en-US': {
        register: { subject: 'Your DuolinTing verification code', heading: 'Verify your email', intro: 'Use this code to finish creating your DuolinTing account:', note: 'This code expires in 10 minutes. Ignore this email if you did not request it.' },
        password_reset: { subject: 'Your DuolinTing password reset code', heading: 'Reset your password', intro: 'Use this code to reset your DuolinTing password:', note: 'This code expires in 10 minutes. Ignore this email if you did not request it.' },
    },
    'th-TH': {
        register: { subject: 'รหัสยืนยัน DuolinTing', heading: 'ยืนยันอีเมลของคุณ', intro: 'ใช้รหัสนี้เพื่อสร้างบัญชี DuolinTing ให้เสร็จสมบูรณ์:', note: 'รหัสนี้หมดอายุใน 10 นาที หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้' },
        password_reset: { subject: 'รหัสรีเซ็ตรหัสผ่าน DuolinTing', heading: 'รีเซ็ตรหัสผ่านของคุณ', intro: 'ใช้รหัสนี้เพื่อรีเซ็ตรหัสผ่าน DuolinTing:', note: 'รหัสนี้หมดอายุใน 10 นาที หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้' },
    },
    'ja-JP': {
        register: { subject: 'DuolinTing メール認証コード', heading: 'メールアドレスを確認', intro: 'DuolinTing アカウントの作成を完了するには、次のコードを入力してください：', note: 'コードの有効期限は10分です。心当たりがない場合は、このメールを無視してください。' },
        password_reset: { subject: 'DuolinTing パスワード再設定コード', heading: 'パスワードを再設定', intro: 'DuolinTing のパスワードを再設定するには、次のコードを入力してください：', note: 'コードの有効期限は10分です。心当たりがない場合は、このメールを無視してください。' },
    },
    'fr-FR': {
        register: { subject: 'Votre code de vérification DuolinTing', heading: 'Vérifiez votre adresse e-mail', intro: 'Utilisez ce code pour terminer la création de votre compte DuolinTing :', note: 'Ce code expire dans 10 minutes. Ignorez cet e-mail si vous ne l’avez pas demandé.' },
        password_reset: { subject: 'Votre code de réinitialisation DuolinTing', heading: 'Réinitialisez votre mot de passe', intro: 'Utilisez ce code pour réinitialiser votre mot de passe DuolinTing :', note: 'Ce code expire dans 10 minutes. Ignorez cet e-mail si vous ne l’avez pas demandé.' },
    },
    'es-ES': {
        register: { subject: 'Tu código de verificación de DuolinTing', heading: 'Verifica tu correo', intro: 'Usa este código para terminar de crear tu cuenta de DuolinTing:', note: 'El código caduca en 10 minutos. Ignora este correo si no lo solicitaste.' },
        password_reset: { subject: 'Tu código para restablecer la contraseña de DuolinTing', heading: 'Restablece tu contraseña', intro: 'Usa este código para restablecer tu contraseña de DuolinTing:', note: 'El código caduca en 10 minutos. Ignora este correo si no lo solicitaste.' },
    },
};

const renderEmail = (purpose: UserEmailChallengePurpose, code: string, locale: unknown) => {
    const copy = emailCopy[normalizeLocale(locale)][purpose];
    return {
        subject: copy.subject,
        text: `${copy.heading}\n\n${copy.intro}\n\n${code}\n\n${copy.note}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17324d"><h1 style="font-size:24px">${copy.heading}</h1><p>${copy.intro}</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1cb0f6">${code}</p><p style="color:#5f7082">${copy.note}</p></div>`,
    };
};

// Production fails closed: losing the provider key must disable registration,
// not silently turn verified signup into an unverified flow. Unconfigured local
// development remains usable for self-hosters working before email setup.
export const emailVerificationRequired = () => env.isProduction || isTransactionalEmailConfigured();

export async function requestUserEmailChallenge({
    email,
    purpose,
    uiLocale,
}: {
    email: string;
    purpose: UserEmailChallengePurpose;
    uiLocale?: unknown;
}) {
    if (!isTransactionalEmailConfigured()) {
        if (purpose === 'register' && !emailVerificationRequired()) {
            return { verificationRequired: false, delivery: 'disabled' as const, expiresInSeconds: 0 };
        }
        throw new EmailChallengeError('EMAIL_SERVICE_UNAVAILABLE', 'Email service is unavailable.', 503);
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await UserModel.findOne({ where: { email: normalizedEmail }, raw: true });
    if (purpose === 'register' && existingUser) {
        throw new EmailChallengeError('EMAIL_ALREADY_REGISTERED', 'Email already registered.', 409);
    }

    // Password recovery never reveals whether an address is registered.
    if (purpose === 'password_reset' && !existingUser) {
        return { verificationRequired: true, delivery: 'sent' as const, expiresInSeconds: CODE_TTL_MS / 1000 };
    }

    const latest = await UserEmailChallengeModel.findOne({
        // A consumed code must not trigger cooldown: after a successful reset
        // the user may legitimately need to start a fresh recovery flow.
        where: { email: normalizedEmail, purpose, consumed_at: null } as any,
        order: [['created_at', 'DESC']],
    });
    const createdAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
    const cooldownRemaining = RESEND_COOLDOWN_MS - (Date.now() - createdAt);
    if (cooldownRemaining > 0) {
        return {
            verificationRequired: true,
            delivery: 'cooldown' as const,
            expiresInSeconds: CODE_TTL_MS / 1000,
            retryAfterSeconds: Math.ceil(cooldownRemaining / 1000),
        };
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hashCode(normalizedEmail, purpose, code);
    const now = new Date();
    const challenge = await UserEmailChallengeModel.create({
        email: normalizedEmail,
        purpose,
        code_hash: codeHash,
        failed_attempts: 0,
        expires_at: new Date(now.getTime() + CODE_TTL_MS),
        consumed_at: null,
    } as any);

    try {
        const content = renderEmail(purpose, code, uiLocale);
        await sendTransactionalEmail({
            to: normalizedEmail,
            ...content,
            // A database id can repeat after a restore or across local and
            // production databases that share one Resend account. Bind the
            // provider idempotency key to this challenge's HMAC as well, so a
            // different recipient/code can never reuse a previous email body.
            idempotencyKey: `user-email-challenge-${challenge.id}-${codeHash.slice(0, 24)}`,
        });
        await UserEmailChallengeModel.update(
            { consumed_at: now },
            {
                where: {
                    email: normalizedEmail,
                    purpose,
                    consumed_at: null,
                } as any,
            },
        );
        await UserEmailChallengeModel.update(
            { consumed_at: null },
            { where: { id: challenge.id } },
        );
    } catch (error) {
        await UserEmailChallengeModel.update({ consumed_at: new Date() }, { where: { id: challenge.id } });
        throw error;
    }

    return { verificationRequired: true, delivery: 'sent' as const, expiresInSeconds: CODE_TTL_MS / 1000 };
}

export async function consumeUserEmailChallenge({
    email,
    purpose,
    code,
    transaction,
}: {
    email: string;
    purpose: UserEmailChallengePurpose;
    code?: string;
    transaction: Transaction;
}) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code ?? '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new EmailChallengeError('EMAIL_CODE_REQUIRED', 'A six-digit email code is required.', 400);
    }

    const challenge = await UserEmailChallengeModel.findOne({
        where: { email: normalizedEmail, purpose, consumed_at: null } as any,
        order: [['created_at', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!challenge) {
        throw new EmailChallengeError('EMAIL_CODE_INVALID', 'Email code is invalid.', 400);
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        await challenge.update({ consumed_at: new Date() }, { transaction });
        throw new EmailChallengeError('EMAIL_CODE_EXPIRED', 'Email code has expired.', 400);
    }
    if (challenge.failed_attempts >= MAX_FAILED_ATTEMPTS) {
        throw new EmailChallengeError('EMAIL_CODE_LOCKED', 'Too many invalid code attempts.', 429);
    }

    const actualHash = hashCode(normalizedEmail, purpose, normalizedCode);
    if (!codesMatch(challenge.code_hash, actualHash)) {
        const failedAttempts = challenge.failed_attempts + 1;
        await challenge.update(
            {
                failed_attempts: failedAttempts,
                ...(failedAttempts >= MAX_FAILED_ATTEMPTS ? { consumed_at: new Date() } : {}),
            },
            { transaction },
        );
        throw new EmailChallengeError(
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 'EMAIL_CODE_LOCKED' : 'EMAIL_CODE_INVALID',
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 'Too many invalid code attempts.' : 'Email code is invalid.',
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 429 : 400,
        );
    }

    await challenge.update({ consumed_at: new Date() }, { transaction });
}
