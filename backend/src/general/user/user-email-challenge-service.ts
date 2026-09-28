import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op, type Transaction } from 'sequelize';
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
    | 'EMAIL_CODE_LOCKED'
    | 'EMAIL_ALREADY_VERIFIED'
    | 'EMAIL_SEND_LIMITED'
    | 'INVALID_CREDENTIALS';

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
const sendLocks = new Map<string, Promise<void>>();

/** The current deployment has one backend instance; serialize simultaneous
 * sends for an address so two first requests cannot invalidate each other. */
async function withEmailSendLock<T>(email: string, action: () => Promise<T>): Promise<T> {
    const key = normalizeEmail(email);
    const previous = sendLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    sendLocks.set(key, current);
    await previous;
    try { return await action(); }
    finally {
        release();
        if (sendLocks.get(key) === current) sendLocks.delete(key);
    }
}

/**
 * The six-digit code is convenient on web and native clients. It is never
 * stored directly: HMAC ties it to both the normalized email and purpose, so a
 * leaked database cannot be brute-forced without the separate server secret.
 */
const hashCode = (email: string, purpose: UserEmailChallengePurpose, code: string, challengeId: number) =>
    createHmac('sha256', env.secret.emailCode)
        .update(`${challengeId}\0${purpose}\0${normalizeEmail(email)}\0${code}`)
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
    purposes: Record<Exclude<UserEmailChallengePurpose, 'email_login' | 'link_email' | `reauth_${string}`>, EmailPurposeCopy>;
};

const emailLoginCopy: Record<UiLocale, EmailPurposeCopy> = {
    'zh-CN': { subject: 'DuolinTing 登录验证码', preheader: '验证邮箱后即可继续学习。', heading: '登录或注册', intro: '输入下面的验证码即可继续；首次使用此邮箱时会自动创建账号。', securityNote: '如果不是你本人操作，请忽略此邮件，不要分享验证码。' },
    'en-US': { subject: 'Your DuolinTing sign-in code', preheader: 'Verify your email to continue learning.', heading: 'Sign in or create an account', intro: 'Enter the code below to continue. A new account is created only after you verify this email.', securityNote: 'If this was not you, ignore this email and never share the code.' },
    'th-TH': { subject: 'รหัสเข้าสู่ระบบ DuolinTing', preheader: 'ยืนยันอีเมลเพื่อเรียนต่อ', heading: 'เข้าสู่ระบบหรือสมัคร', intro: 'ใส่รหัสด้านล่างเพื่อดำเนินการต่อ บัญชีใหม่จะถูกสร้างหลังยืนยันอีเมลเท่านั้น', securityNote: 'หากไม่ใช่คุณ โปรดละเว้นอีเมลนี้และอย่าแชร์รหัส' },
    'ja-JP': { subject: 'DuolinTing のログインコード', preheader: 'メールを確認して学習を続けましょう。', heading: 'ログインまたは登録', intro: '以下のコードを入力してください。新しいアカウントはメール確認後に作成されます。', securityNote: '心当たりがない場合は無視し、コードを共有しないでください。' },
    'fr-FR': { subject: 'Code de connexion DuolinTing', preheader: 'Confirmez votre adresse pour continuer.', heading: 'Connexion ou inscription', intro: 'Saisissez le code ci-dessous. Un nouveau compte est créé uniquement après vérification de cette adresse.', securityNote: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message et ne partagez pas le code.' },
    'es-ES': { subject: 'Código de acceso de DuolinTing', preheader: 'Verifica tu correo para continuar.', heading: 'Iniciar sesión o registrarse', intro: 'Introduce el código siguiente. Solo se creará una cuenta nueva después de verificar este correo.', securityNote: 'Si no fuiste tú, ignora este mensaje y no compartas el código.' },
};

const reauthCopy: Record<UiLocale, EmailPurposeCopy> = {
    'zh-CN': { subject: 'DuolinTing 账号安全验证码', preheader: '确认这次账号安全操作。', heading: '确认是你本人', intro: '请输入下面的验证码，确认这次账号安全操作。', securityNote: '如果不是你本人操作，请忽略此邮件并检查账号安全。' },
    'en-US': { subject: 'Your DuolinTing security code', preheader: 'Confirm this account security action.', heading: 'Confirm it is you', intro: 'Enter this code to confirm the requested account security action.', securityNote: 'If this was not you, ignore this email and review your account security.' },
    'th-TH': { subject: 'รหัสความปลอดภัย DuolinTing', preheader: 'ยืนยันการดำเนินการกับบัญชี', heading: 'ยืนยันตัวตน', intro: 'ป้อนรหัสนี้เพื่อยืนยันการดำเนินการด้านความปลอดภัยของบัญชี', securityNote: 'หากไม่ใช่คุณ โปรดละเว้นอีเมลนี้และตรวจสอบความปลอดภัยของบัญชี' },
    'ja-JP': { subject: 'DuolinTing セキュリティコード', preheader: 'アカウントの操作を確認してください。', heading: '本人確認', intro: 'このコードを入力して、アカウントの操作を確認してください。', securityNote: '心当たりがない場合は無視し、アカウントの安全を確認してください。' },
    'fr-FR': { subject: 'Code de sécurité DuolinTing', preheader: 'Confirmez cette opération sur votre compte.', heading: 'Confirmez votre identité', intro: 'Saisissez ce code pour confirmer cette opération de sécurité.', securityNote: 'Si ce n’était pas vous, ignorez ce message et vérifiez la sécurité de votre compte.' },
    'es-ES': { subject: 'Código de seguridad de DuolinTing', preheader: 'Confirma esta acción en tu cuenta.', heading: 'Confirma tu identidad', intro: 'Introduce este código para confirmar la acción de seguridad de la cuenta.', securityNote: 'Si no fuiste tú, ignora este mensaje y revisa la seguridad de tu cuenta.' },
};

const emailCopy: Record<UiLocale, EmailLocaleCopy> = {
    'zh-CN': {
        eyebrow: '账号安全验证', codeLabel: '你的验证码', validFor: '验证码将在 10 分钟后失效，请勿转发给任何人。', securityTitle: '保护你的账号', recipient: '此邮件发送至', footer: 'DuolinTing 多邻听 · 每天听懂一点点', privacy: '隐私政策', terms: '使用条款', support: '支持与联系', home: '访问官网',
        purposes: {
            register: { subject: 'DuolinTing 注册验证码', preheader: '完成邮箱验证，开始保存你的学习记录。', heading: '验证你的邮箱', intro: '使用下面的验证码完成 DuolinTing 注册，并安全同步你的学习记录。', securityNote: '如果不是你本人注册，请忽略此邮件；你的邮箱不会因此创建账号。' },
            password_reset: { subject: 'DuolinTing 密码重置验证码', preheader: '使用此验证码安全重置你的密码。', heading: '重置你的密码', intro: '我们收到了密码重置请求。请使用下面的验证码确认身份。', securityNote: '如果不是你本人操作，请忽略此邮件，并不要向任何人透露验证码。' },
            verify_account: { subject: 'DuolinTing 邮箱验证', preheader: '验证邮箱后即可继续使用你的学习账号。', heading: '确认你的邮箱', intro: '你的学习账号还需要完成邮箱验证。请输入下面的验证码，即可继续登录并保留原有学习记录。', securityNote: '如果不是你本人登录，请忽略此邮件，并不要向任何人透露验证码。' },
        },
    },
    'en-US': {
        eyebrow: 'Account security', codeLabel: 'Your verification code', validFor: 'This code expires in 10 minutes. Never share it with anyone.', securityTitle: 'Keep your account safe', recipient: 'This message was sent to', footer: 'DuolinTing · Understand a little more every day', privacy: 'Privacy', terms: 'Terms', support: 'Support', home: 'Visit DuolinTing',
        purposes: {
            register: { subject: 'Your DuolinTing verification code', preheader: 'Verify your email and start saving your learning progress.', heading: 'Verify your email', intro: 'Use the code below to finish creating your DuolinTing account and securely sync your progress.', securityNote: 'If you did not create an account, ignore this email. No account will be created from this message alone.' },
            password_reset: { subject: 'Your DuolinTing password reset code', preheader: 'Use this code to reset your password securely.', heading: 'Reset your password', intro: 'We received a password reset request. Use the code below to confirm your identity.', securityNote: 'If you did not request this, ignore this email and never share the code with anyone.' },
            verify_account: { subject: 'Verify your DuolinTing email', preheader: 'Confirm your email to continue using your learning account.', heading: 'Confirm your email', intro: 'Your learning account needs email verification. Enter the code below to sign in and keep your existing progress.', securityNote: 'If you did not try to sign in, ignore this email and never share the code.' },
        },
    },
    'th-TH': {
        eyebrow: 'ความปลอดภัยของบัญชี', codeLabel: 'รหัสยืนยันของคุณ', validFor: 'รหัสนี้หมดอายุใน 10 นาที โปรดอย่าแชร์กับผู้อื่น', securityTitle: 'รักษาบัญชีของคุณให้ปลอดภัย', recipient: 'อีเมลนี้ส่งถึง', footer: 'DuolinTing · เข้าใจเพิ่มขึ้นทุกวัน', privacy: 'นโยบายความเป็นส่วนตัว', terms: 'ข้อกำหนด', support: 'ช่วยเหลือ', home: 'เยี่ยมชม DuolinTing',
        purposes: {
            register: { subject: 'รหัสยืนยัน DuolinTing', preheader: 'ยืนยันอีเมลและเริ่มบันทึกความคืบหน้า', heading: 'ยืนยันอีเมลของคุณ', intro: 'ใช้รหัสด้านล่างเพื่อสร้างบัญชี DuolinTing และซิงค์ความคืบหน้าอย่างปลอดภัย', securityNote: 'หากคุณไม่ได้สมัครบัญชี โปรดละเว้นอีเมลนี้ บัญชีจะไม่ถูกสร้างจากอีเมลนี้เพียงอย่างเดียว' },
            password_reset: { subject: 'รหัสรีเซ็ตรหัสผ่าน DuolinTing', preheader: 'ใช้รหัสนี้เพื่อรีเซ็ตรหัสผ่านอย่างปลอดภัย', heading: 'รีเซ็ตรหัสผ่านของคุณ', intro: 'เราได้รับคำขอรีเซ็ตรหัสผ่าน ใช้รหัสด้านล่างเพื่อยืนยันตัวตน', securityNote: 'หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้และอย่าแชร์รหัสกับใคร' },
            verify_account: { subject: 'ยืนยันอีเมล DuolinTing ของคุณ', preheader: 'ยืนยันอีเมลเพื่อใช้บัญชีเรียนต่อ', heading: 'ยืนยันอีเมลของคุณ', intro: 'บัญชีเรียนของคุณต้องยืนยันอีเมล ใช้รหัสด้านล่างเพื่อเข้าสู่ระบบพร้อมเก็บความคืบหน้าเดิม', securityNote: 'หากคุณไม่ได้พยายามเข้าสู่ระบบ โปรดละเว้นอีเมลนี้และอย่าแชร์รหัส' },
        },
    },
    'ja-JP': {
        eyebrow: 'アカウントセキュリティ', codeLabel: '認証コード', validFor: 'コードの有効期限は10分です。誰にも共有しないでください。', securityTitle: 'アカウントを安全に保つために', recipient: 'このメールの送信先', footer: 'DuolinTing · 毎日少しずつ聞き取れるように', privacy: 'プライバシー', terms: '利用規約', support: 'サポート', home: 'DuolinTing を開く',
        purposes: {
            register: { subject: 'DuolinTing メール認証コード', preheader: 'メールを確認して学習記録の保存を始めましょう。', heading: 'メールアドレスを確認', intro: '次のコードを使って DuolinTing アカウントを作成し、学習記録を安全に同期してください。', securityNote: '登録した覚えがない場合は、このメールを無視してください。このメールだけでアカウントが作成されることはありません。' },
            password_reset: { subject: 'DuolinTing パスワード再設定コード', preheader: 'このコードでパスワードを安全に再設定できます。', heading: 'パスワードを再設定', intro: 'パスワード再設定のリクエストを受け付けました。次のコードで本人確認を行ってください。', securityNote: '心当たりがない場合は、このメールを無視し、コードを誰にも共有しないでください。' },
            verify_account: { subject: 'DuolinTing メール確認コード', preheader: 'メールを確認して学習アカウントを続けて利用しましょう。', heading: 'メールアドレスを確認', intro: '学習アカウントのメール確認が必要です。次のコードでログインすると、これまでの学習記録も引き継げます。', securityNote: 'ログインした覚えがない場合は、このメールを無視し、コードを共有しないでください。' },
        },
    },
    'fr-FR': {
        eyebrow: 'Sécurité du compte', codeLabel: 'Votre code de vérification', validFor: 'Ce code expire dans 10 minutes. Ne le communiquez à personne.', securityTitle: 'Protégez votre compte', recipient: 'Ce message a été envoyé à', footer: 'DuolinTing · Comprenez un peu plus chaque jour', privacy: 'Confidentialité', terms: 'Conditions', support: 'Assistance', home: 'Visiter DuolinTing',
        purposes: {
            register: { subject: 'Votre code de vérification DuolinTing', preheader: 'Vérifiez votre e-mail et enregistrez votre progression.', heading: 'Vérifiez votre adresse e-mail', intro: 'Utilisez le code ci-dessous pour créer votre compte DuolinTing et synchroniser votre progression en toute sécurité.', securityNote: 'Si vous n’avez pas créé de compte, ignorez cet e-mail. Aucun compte ne sera créé avec ce message seul.' },
            password_reset: { subject: 'Votre code de réinitialisation DuolinTing', preheader: 'Utilisez ce code pour réinitialiser votre mot de passe.', heading: 'Réinitialisez votre mot de passe', intro: 'Nous avons reçu une demande de réinitialisation. Utilisez le code ci-dessous pour confirmer votre identité.', securityNote: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail et ne partagez jamais le code.' },
            verify_account: { subject: 'Vérifiez votre e-mail DuolinTing', preheader: 'Confirmez votre adresse pour continuer à utiliser votre compte.', heading: 'Confirmez votre adresse e-mail', intro: 'Votre compte d’apprentissage doit confirmer son adresse e-mail. Saisissez ce code pour vous connecter en conservant votre progression.', securityNote: 'Si vous n’avez pas essayé de vous connecter, ignorez cet e-mail et ne partagez pas le code.' },
        },
    },
    'es-ES': {
        eyebrow: 'Seguridad de la cuenta', codeLabel: 'Tu código de verificación', validFor: 'Este código caduca en 10 minutos. No lo compartas con nadie.', securityTitle: 'Protege tu cuenta', recipient: 'Este mensaje se envió a', footer: 'DuolinTing · Entiende un poco más cada día', privacy: 'Privacidad', terms: 'Términos', support: 'Soporte', home: 'Visitar DuolinTing',
        purposes: {
            register: { subject: 'Tu código de verificación de DuolinTing', preheader: 'Verifica tu correo y empieza a guardar tu progreso.', heading: 'Verifica tu correo', intro: 'Usa el código para crear tu cuenta de DuolinTing y sincronizar tu progreso de forma segura.', securityNote: 'Si no creaste una cuenta, ignora este correo. Este mensaje por sí solo no creará ninguna cuenta.' },
            password_reset: { subject: 'Tu código para restablecer la contraseña de DuolinTing', preheader: 'Usa este código para restablecer tu contraseña.', heading: 'Restablece tu contraseña', intro: 'Recibimos una solicitud para restablecer tu contraseña. Usa el código para confirmar tu identidad.', securityNote: 'Si no hiciste esta solicitud, ignora el correo y no compartas el código con nadie.' },
            verify_account: { subject: 'Verifica tu correo de DuolinTing', preheader: 'Confirma tu correo para seguir usando tu cuenta.', heading: 'Confirma tu correo', intro: 'Tu cuenta de aprendizaje necesita verificar el correo. Introduce este código para iniciar sesión y conservar tu progreso.', securityNote: 'Si no intentaste iniciar sesión, ignora este correo y no compartas el código.' },
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
    const copy = purpose === 'email_login'
        ? emailLoginCopy[normalizedLocale]
        : purpose === 'link_email' || purpose.startsWith('reauth_')
            ? reauthCopy[normalizedLocale]
            : common.purposes[purpose as keyof typeof common.purposes];
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

async function requestUserEmailChallengeUnlocked({
    email,
    purpose,
    password,
    uiLocale,
}: {
    email: string;
    purpose: UserEmailChallengePurpose;
    password?: string;
    uiLocale?: unknown;
}) {
    if (!isTransactionalEmailConfigured()) {
        throw new EmailChallengeError('EMAIL_SERVICE_UNAVAILABLE', 'Email service is unavailable.', 503);
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await UserModel.findOne({ where: { email: normalizedEmail }, raw: true });
    if (purpose === 'register' && existingUser) {
        throw new EmailChallengeError('EMAIL_ALREADY_REGISTERED', 'Email already registered.', 409);
    }
    if (purpose === 'verify_account') {
        const passwordHash = existingUser?.password_hash;
        if (!passwordHash || !password || !(await bcrypt.compare(password, passwordHash))) {
            throw new EmailChallengeError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
        }
        if (existingUser.email_verified_at) {
            throw new EmailChallengeError('EMAIL_ALREADY_VERIFIED', 'Email is already verified.', 409);
        }
    }

    // Password recovery never reveals whether an address is registered.
    if (purpose === 'password_reset' && !existingUser) {
        return { verificationRequired: true, delivery: 'sent' as const, expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000, hourlyLimit: EMAIL_CODE_HOURLY_LIMIT };
    }

    // Count accepted messages in MySQL, not attempts at the HTTP endpoint.
    // This quota spans registration, sign-in and sensitive-operation codes.
    const sentInLastHour = await UserEmailChallengeModel.count({
        where: { email: normalizedEmail, sent_at: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (sentInLastHour >= EMAIL_CODE_HOURLY_LIMIT) {
        throw new EmailChallengeError('EMAIL_SEND_LIMITED', 'Email send limit reached.', 429);
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
            challengeId: latest?.id,
            expiresAt: latest?.expires_at,
            retryAt: new Date(createdAt + RESEND_COOLDOWN_MS),
            expiresInSeconds: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
            retryAfterSeconds: Math.ceil(cooldownRemaining / 1000),
            hourlyLimit: EMAIL_CODE_HOURLY_LIMIT,
        };
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    const challenge = await UserEmailChallengeModel.create({
        email: normalizedEmail,
        purpose,
        code_hash: '',
        failed_attempts: 0,
        expires_at: new Date(now.getTime() + CODE_TTL_MS),
        consumed_at: null,
    } as any);
    // The HMAC includes the immutable row ID so each challenge has its own
    // digest even if a code repeats for the same address and purpose.
    const codeHash = hashCode(normalizedEmail, purpose, code, challenge.id);
    await challenge.update({ code_hash: codeHash });

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
        await challenge.update({ sent_at: new Date() });
        await UserEmailChallengeModel.update(
            { consumed_at: now },
            { where: { email: normalizedEmail, purpose, consumed_at: null, id: { [Op.ne]: challenge.id } } },
        );
    } catch (error) {
        await UserEmailChallengeModel.update({ consumed_at: new Date() }, { where: { id: challenge.id } });
        throw error;
    }

    return { verificationRequired: true, delivery: 'sent' as const, challengeId: challenge.id, expiresAt: challenge.expires_at, retryAt: new Date(now.getTime() + RESEND_COOLDOWN_MS), expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000, hourlyLimit: EMAIL_CODE_HOURLY_LIMIT };
}

export const requestUserEmailChallenge = (request: Parameters<typeof requestUserEmailChallengeUnlocked>[0]) =>
    withEmailSendLock(request.email, () => requestUserEmailChallengeUnlocked(request));

export async function consumeUserEmailChallenge({
    email,
    purpose,
    code,
    challengeId,
    transaction,
}: {
    email: string;
    purpose: UserEmailChallengePurpose;
    code?: string;
    challengeId?: number;
    transaction: Transaction;
}) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code ?? '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new EmailChallengeError('EMAIL_CODE_REQUIRED', 'A six-digit email code is required.', 400);
    }

    const challenge = await UserEmailChallengeModel.findOne({
        where: { email: normalizedEmail, purpose, consumed_at: null, ...(challengeId ? { id: challengeId } : {}) } as any,
        order: [['created_at', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!challenge) {
        throw new EmailChallengeError('EMAIL_CODE_INVALID', 'Email code is invalid.', 400);
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        await challenge.update({ consumed_at: new Date() }, { transaction });
        return new EmailChallengeError('EMAIL_CODE_EXPIRED', 'Email code has expired.', 400);
    }
    if (challenge.failed_attempts >= MAX_FAILED_ATTEMPTS) {
        throw new EmailChallengeError('EMAIL_CODE_LOCKED', 'Too many invalid code attempts.', 429);
    }

    const actualHash = hashCode(normalizedEmail, purpose, normalizedCode, challenge.id);
    if (!codesMatch(challenge.code_hash, actualHash)) {
        const failedAttempts = challenge.failed_attempts + 1;
        await challenge.update(
            {
                failed_attempts: failedAttempts,
                ...(failedAttempts >= MAX_FAILED_ATTEMPTS ? { consumed_at: new Date() } : {}),
            },
            { transaction },
        );
        return new EmailChallengeError(
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 'EMAIL_CODE_LOCKED' : 'EMAIL_CODE_INVALID',
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 'Too many invalid code attempts.' : 'Email code is invalid.',
            failedAttempts >= MAX_FAILED_ATTEMPTS ? 429 : 400,
        );
    }

    await challenge.update({ consumed_at: new Date() }, { transaction });
    return null;
}
