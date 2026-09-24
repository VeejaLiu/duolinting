import { Resend, type CreateEmailOptions } from 'resend';
import { env } from '../../env';

export type SendTransactionalEmailInput = {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string | string[];
    idempotencyKey?: string;
};

let resendClient: Resend | null = null;

/**
 * Email is intentionally opt-in for self-hosted installations. Both values are
 * required: the API key authorizes Resend, while the From address determines
 * which verified sending domain is used.
 */
export const isTransactionalEmailConfigured = () =>
    Boolean(env.resend.API_KEY.trim() && env.resend.FROM_EMAIL.trim());

const configuredClient = () => {
    if (!isTransactionalEmailConfigured()) {
        throw new Error(
            'Transactional email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.',
        );
    }

    resendClient ??= new Resend(env.resend.API_KEY.trim());
    return resendClient;
};

const configuredSender = () => {
    const address = env.resend.FROM_EMAIL.trim();
    const name = env.resend.FROM_NAME.trim();

    // Resend's sender format is `Display Name <address@example.com>`. Reject
    // line breaks and angle brackets in the display name so configuration can
    // never add unintended email headers or replace the configured address.
    if (/\r|\n|[<>]/.test(name)) {
        throw new Error('RESEND_FROM_NAME contains unsupported characters.');
    }

    return name ? `${name} <${address}>` : address;
};

/**
 * Send one transactional message through the application's verified Resend
 * domain. Callers must provide HTML, plain text, or both. The returned id is
 * safe to log for delivery troubleshooting; recipient addresses are not.
 */
export async function sendTransactionalEmail(
    input: SendTransactionalEmailInput,
): Promise<{ id: string }> {
    if (!input.html && !input.text) {
        throw new Error('Transactional email requires an HTML or text body.');
    }

    const payload = {
        from: configuredSender(),
        to: input.to,
        subject: input.subject,
        ...(input.html ? { html: input.html } : {}),
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo
            ? { replyTo: input.replyTo }
            : env.resend.REPLY_TO.trim()
              ? { replyTo: env.resend.REPLY_TO.trim() }
              : {}),
    } as CreateEmailOptions;

    const { data, error } = await configuredClient().emails.send(payload, {
        ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
    });

    if (error) {
        throw new Error(`Resend rejected the email: ${error.message}`);
    }

    return { id: data.id };
}
