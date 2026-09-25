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
export const EMAIL_CODE_HOURLY_LIMIT = 6;
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

type EmailPurposeCopy = {
    subject: string;
    preheader: string;
    heading: string;
    intro: string;
    securityNote: string;
};

type EmailLocaleCopy = {
    eyebrow: string;
    codeLabel: string;
    validFor: string;
    securityTitle: string;
    recipient: string;
    footer: string;
    privacy: string;
    terms: string;
    support: string;
    home: string;
    purposes: Record<UserEmailChallengePurpose, EmailPurposeCopy>;
};

const emailCopy: Record<UiLocale, EmailLocaleCopy> = {
    'zh-CN': {
        eyebrow: '账号安全验证', codeLabel: '你的验证码', validFor: '验证码将在 10 分钟后失效，请勿转发给任何人。', securityTitle: '保护你的账号', recipient: '此邮件发送至', footer: 'DuolinTing 多邻听 · 每天听懂一点点', privacy: '隐私政策', terms: '使用条款', support: '支持与联系', home: '访问官网',
        purposes: {
            register: { subject: 'DuolinTing 注册验证码', preheader: '完成邮箱验证，开始保存你的学习记录。', heading: '验证你的邮箱', intro: '使用下面的验证码完成 DuolinTing 注册，并安全同步你的学习记录。', securityNote: '如果不是你本人注册，请忽略此邮件；你的邮箱不会因此创建账号。' },
            password_reset: { subject: 'DuolinTing 密码重置验证码', preheader: '使用此验证码安全重置你的密码。', heading: '重置你的密码', intro: '我们收到了密码重置请求。请使用下面的验证码确认身份。', securityNote: '如果不是你本人操作，请忽略此邮件，并不要向任何人透露验证码。' },
        },
    },
    'en-US': {
        eyebrow: 'Account security', codeLabel: 'Your verification code', validFor: 'This code expires in 10 minutes. Never share it with anyone.', securityTitle: 'Keep your account safe', recipient: 'This message was sent to', footer: 'DuolinTing · Understand a little more every day', privacy: 'Privacy', terms: 'Terms', support: 'Support', home: 'Visit DuolinTing',
        purposes: {
            register: { subject: 'Your DuolinTing verification code', preheader: 'Verify your email and start saving your learning progress.', heading: 'Verify your email', intro: 'Use the code below to finish creating your DuolinTing account and securely sync your progress.', securityNote: 'If you did not create an account, ignore this email. No account will be created from this message alone.' },
            password_reset: { subject: 'Your DuolinTing password reset code', preheader: 'Use this code to reset your password securely.', heading: 'Reset your password', intro: 'We received a password reset request. Use the code below to confirm your identity.', securityNote: 'If you did not request this, ignore this email and never share the code with anyone.' },
        },
    },
    'th-TH': {
        eyebrow: 'ความปลอดภัยของบัญชี', codeLabel: 'รหัสยืนยันของคุณ', validFor: 'รหัสนี้หมดอายุใน 10 นาที โปรดอย่าแชร์กับผู้อื่น', securityTitle: 'รักษาบัญชีของคุณให้ปลอดภัย', recipient: 'อีเมลนี้ส่งถึง', footer: 'DuolinTing · เข้าใจเพิ่มขึ้นทุกวัน', privacy: 'นโยบายความเป็นส่วนตัว', terms: 'ข้อกำหนด', support: 'ช่วยเหลือ', home: 'เยี่ยมชม DuolinTing',
        purposes: {
            register: { subject: 'รหัสยืนยัน DuolinTing', preheader: 'ยืนยันอีเมลและเริ่มบันทึกความคืบหน้า', heading: 'ยืนยันอีเมลของคุณ', intro: 'ใช้รหัสด้านล่างเพื่อสร้างบัญชี DuolinTing และซิงค์ความคืบหน้าอย่างปลอดภัย', securityNote: 'หากคุณไม่ได้สมัครบัญชี โปรดละเว้นอีเมลนี้ บัญชีจะไม่ถูกสร้างจากอีเมลนี้เพียงอย่างเดียว' },
            password_reset: { subject: 'รหัสรีเซ็ตรหัสผ่าน DuolinTing', preheader: 'ใช้รหัสนี้เพื่อรีเซ็ตรหัสผ่านอย่างปลอดภัย', heading: 'รีเซ็ตรหัสผ่านของคุณ', intro: 'เราได้รับคำขอรีเซ็ตรหัสผ่าน ใช้รหัสด้านล่างเพื่อยืนยันตัวตน', securityNote: 'หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้และอย่าแชร์รหัสกับใคร' },
        },
    },
    'ja-JP': {
        eyebrow: 'アカウントセキュリティ', codeLabel: '認証コード', validFor: 'コードの有効期限は10分です。誰にも共有しないでください。', securityTitle: 'アカウントを安全に保つために', recipient: 'このメールの送信先', footer: 'DuolinTing · 毎日少しずつ聞き取れるように', privacy: 'プライバシー', terms: '利用規約', support: 'サポート', home: 'DuolinTing を開く',
        purposes: {
            register: { subject: 'DuolinTing メール認証コード', preheader: 'メールを確認して学習記録の保存を始めましょう。', heading: 'メールアドレスを確認', intro: '次のコードを使って DuolinTing アカウントを作成し、学習記録を安全に同期してください。', securityNote: '登録した覚えがない場合は、このメールを無視してください。このメールだけでアカウントが作成されることはありません。' },
            password_reset: { subject: 'DuolinTing パスワード再設定コード', preheader: 'このコードでパスワードを安全に再設定できます。', heading: 'パスワードを再設定', intro: 'パスワード再設定のリクエストを受け付けました。次のコードで本人確認を行ってください。', securityNote: '心当たりがない場合は、このメールを無視し、コードを誰にも共有しないでください。' },
        },
    },
    'fr-FR': {
        eyebrow: 'Sécurité du compte', codeLabel: 'Votre code de vérification', validFor: 'Ce code expire dans 10 minutes. Ne le communiquez à personne.', securityTitle: 'Protégez votre compte', recipient: 'Ce message a été envoyé à', footer: 'DuolinTing · Comprenez un peu plus chaque jour', privacy: 'Confidentialité', terms: 'Conditions', support: 'Assistance', home: 'Visiter DuolinTing',
        purposes: {
            register: { subject: 'Votre code de vérification DuolinTing', preheader: 'Vérifiez votre e-mail et enregistrez votre progression.', heading: 'Vérifiez votre adresse e-mail', intro: 'Utilisez le code ci-dessous pour créer votre compte DuolinTing et synchroniser votre progression en toute sécurité.', securityNote: 'Si vous n’avez pas créé de compte, ignorez cet e-mail. Aucun compte ne sera créé avec ce message seul.' },
            password_reset: { subject: 'Votre code de réinitialisation DuolinTing', preheader: 'Utilisez ce code pour réinitialiser votre mot de passe.', heading: 'Réinitialisez votre mot de passe', intro: 'Nous avons reçu une demande de réinitialisation. Utilisez le code ci-dessous pour confirmer votre identité.', securityNote: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail et ne partagez jamais le code.' },
        },
    },
    'es-ES': {
        eyebrow: 'Seguridad de la cuenta', codeLabel: 'Tu código de verificación', validFor: 'Este código caduca en 10 minutos. No lo compartas con nadie.', securityTitle: 'Protege tu cuenta', recipient: 'Este mensaje se envió a', footer: 'DuolinTing · Entiende un poco más cada día', privacy: 'Privacidad', terms: 'Términos', support: 'Soporte', home: 'Visitar DuolinTing',
        purposes: {
            register: { subject: 'Tu código de verificación de DuolinTing', preheader: 'Verifica tu correo y empieza a guardar tu progreso.', heading: 'Verifica tu correo', intro: 'Usa el código para crear tu cuenta de DuolinTing y sincronizar tu progreso de forma segura.', securityNote: 'Si no creaste una cuenta, ignora este correo. Este mensaje por sí solo no creará ninguna cuenta.' },
            password_reset: { subject: 'Tu código para restablecer la contraseña de DuolinTing', preheader: 'Usa este código para restablecer tu contraseña.', heading: 'Restablece tu contraseña', intro: 'Recibimos una solicitud para restablecer tu contraseña. Usa el código para confirmar tu identidad.', securityNote: 'Si no hiciste esta solicitud, ignora el correo y no compartas el código con nadie.' },
        },
    },
};

const escapeHtml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const renderUserEmailChallengeEmail = (
    purpose: UserEmailChallengePurpose,
    code: string,
    locale: unknown,
    recipientEmail: string,
) => {
    const normalizedLocale = normalizeLocale(locale);
    const common = emailCopy[normalizedLocale];
    const copy = common.purposes[purpose];
    const site = env.resend.PUBLIC_SITE_URL;
    const localizedBase = normalizedLocale === 'zh-CN' ? site : `${site}/en`;
    const links = {
        home: localizedBase,
        privacy: `${localizedBase}/privacy`,
        terms: `${localizedBase}/terms`,
        support: `${localizedBase}/support`,
    };
    const logoUrl = `${site}/duolinting-logo-lockup.png`;
    const year = new Date().getUTCFullYear();

    return {
        subject: copy.subject,
        text: [
            copy.heading,
            '',
            copy.intro,
            '',
            `${common.codeLabel}: ${code}`,
            common.validFor,
            '',
            `${common.securityTitle}: ${copy.securityNote}`,
            '',
            `${common.recipient}: ${recipientEmail}`,
            `${common.privacy}: ${links.privacy}`,
            `${common.terms}: ${links.terms}`,
            `${common.support}: ${links.support}`,
            '',
            `© ${year} ${common.footer}`,
        ].join('\n'),
        html: `<!doctype html><html><body style="margin:0;background:#f3f8fc;color:#172033;font-family:Arial,'Helvetica Neue',sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(copy.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f8fc"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:2px solid #dcebf7;border-radius:24px;overflow:hidden"><tr><td style="height:8px;background:#1cb0f6"></td></tr><tr><td style="padding:28px 34px 18px"><a href="${links.home}" style="text-decoration:none"><img src="${logoUrl}" width="190" alt="DuolinTing 多邻听" style="display:block;max-width:190px;height:auto;border:0"></a></td></tr><tr><td style="padding:0 34px 34px"><span style="display:inline-block;background:#effbe7;color:#3b8f00;border:1px solid #bfe99f;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:700">${escapeHtml(common.eyebrow)}</span><h1 style="margin:20px 0 10px;font-size:30px;line-height:1.2;color:#172033">${escapeHtml(copy.heading)}</h1><p style="margin:0;color:#52637a;font-size:16px;line-height:1.7">${escapeHtml(copy.intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 18px;background:#edf8ff;border:2px solid #9edcff;border-radius:20px"><tr><td align="center" style="padding:22px 18px"><div style="color:#1688bd;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${escapeHtml(common.codeLabel)}</div><div style="margin-top:10px;color:#172033;font-size:38px;font-weight:800;letter-spacing:10px;line-height:1.1">${code}</div></td></tr></table><p style="margin:0;text-align:center;color:#64748b;font-size:13px;font-weight:700">${escapeHtml(common.validFor)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:26px;background:#fff8df;border:1px solid #ffe08a;border-radius:16px"><tr><td style="padding:16px 18px"><strong style="display:block;color:#8a5b00;font-size:14px">${escapeHtml(common.securityTitle)}</strong><span style="display:block;margin-top:6px;color:#6b5a31;font-size:13px;line-height:1.55">${escapeHtml(copy.securityNote)}</span></td></tr></table></td></tr><tr><td style="background:#f8fbfd;border-top:1px solid #e4eef8;padding:22px 34px;text-align:center"><p style="margin:0 0 12px;color:#718096;font-size:12px">${escapeHtml(common.recipient)} <strong>${escapeHtml(recipientEmail)}</strong></p><p style="margin:0 0 12px;font-size:12px"><a href="${links.home}" style="color:#1688bd;text-decoration:none">${escapeHtml(common.home)}</a><span style="color:#a0aec0"> · </span><a href="${links.privacy}" style="color:#1688bd;text-decoration:none">${escapeHtml(common.privacy)}</a><span style="color:#a0aec0"> · </span><a href="${links.terms}" style="color:#1688bd;text-decoration:none">${escapeHtml(common.terms)}</a><span style="color:#a0aec0"> · </span><a href="${links.support}" style="color:#1688bd;text-decoration:none">${escapeHtml(common.support)}</a></p><p style="margin:0;color:#a0aec0;font-size:11px">© ${year} ${escapeHtml(common.footer)}</p></td></tr><tr><td style="height:7px;background:#58cc02"></td></tr></table></td></tr></table></body></html>`,
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
            return { verificationRequired: false, delivery: 'disabled' as const, expiresInSeconds: 0, retryAfterSeconds: 0, hourlyLimit: 0 };
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
        return { verificationRequired: true, delivery: 'sent' as const, expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000, hourlyLimit: EMAIL_CODE_HOURLY_LIMIT };
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
        const expiresAt = latest?.expires_at ? new Date(latest.expires_at).getTime() : 0;
        return {
            verificationRequired: true,
            delivery: 'cooldown' as const,
            expiresInSeconds: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
            retryAfterSeconds: Math.ceil(cooldownRemaining / 1000),
            hourlyLimit: EMAIL_CODE_HOURLY_LIMIT,
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
        const content = renderUserEmailChallengeEmail(purpose, code, uiLocale, normalizedEmail);
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

    return { verificationRequired: true, delivery: 'sent' as const, expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000, hourlyLimit: EMAIL_CODE_HOURLY_LIMIT };
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
