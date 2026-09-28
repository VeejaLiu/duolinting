import { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { UniqueConstraintError, type Transaction } from 'sequelize';
import type { AuthUser } from '../../domain';
import { env } from '../../env';
import { sequelize } from '../../models/db-config-mysql';
import { AuthTransactionModel, type OAuthPlatform, type OAuthPurpose } from '../../models/schema/AuthTransactionDB';
import { UserAuthIdentityModel, type OAuthProvider } from '../../models/schema/UserAuthIdentityDB';
import { UserAuthGrantModel } from '../../models/schema/UserAuthGrantDB';
import { UserModel } from '../../models/schema/UserDB';
import { UserSessionModel } from '../../models/schema/UserSessionDB';
import { UserReauthTicketModel, type ReauthPurpose } from '../../models/schema/UserReauthTicketDB';
import { issueUserSession, normalizeAuthClientType } from './user-session-service';
import { write, rows, json, utcValue } from '../analytics/service';
import type { GeoContext } from '../analytics/geo';
import { consumeReauthTicket } from './user-reauth-service';

const TRANSACTION_TTL_MS = 5 * 60 * 1000;
const APPLE_ISSUER = 'https://appleid.apple.com';
const GOOGLE_ISSUER = 'https://accounts.google.com';
type AuthResponse = { user: AuthUser; token: string };
let appleKeys: any;
const googleClient = new OAuth2Client();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const validAppleSigningKey = (() => {
    if (!env.oauth.applePrivateKey) return false;
    try {
        const key = createPrivateKey(env.oauth.applePrivateKey);
        return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
    } catch { return false; }
})();

export class OAuthError extends Error {
    constructor(public readonly code: string, public readonly status = 400) { super(code); }
}

const refreshKey = () => {
    const key = Buffer.from(env.oauth.refreshTokenKey, 'base64');
    if (key.length !== 32) throw new OAuthError('APPLE_NOT_CONFIGURED', 503);
    return key;
};

/** AES-GCM stores Apple refresh tokens without making the database a token vault. */
const encryptRefreshToken = (token: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', refreshKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
};
const decryptRefreshToken = (value: string) => {
    const [version, iv, tag, ciphertext] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new OAuthError('APPLE_TOKEN_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', refreshKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

export const oauthAvailability = () => {
    const googleClientIdPattern = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
    const googleWeb = googleClientIdPattern.test(env.oauth.googleWebClientId);
    const googleIos = googleWeb && googleClientIdPattern.test(env.oauth.googleIosClientId);
    const googleAndroid = googleWeb && googleClientIdPattern.test(env.oauth.googleAndroidClientId);
    const appleNative = Boolean(env.oauth.appleTeamId && env.oauth.appleKeyId && validAppleSigningKey && env.oauth.appleBundleId && env.oauth.refreshTokenKey && Buffer.from(env.oauth.refreshTokenKey, 'base64').length === 32);
    const appleWeb = appleNative && Boolean(env.oauth.appleServiceId && env.oauth.appleRedirectUri && env.oauth.webOrigins.length);
    return { googleWeb, googleIos, googleAndroid, appleNative, appleWeb };
};

async function appleClientSecret(clientId: string) {
    const { importPKCS8, SignJWT } = await import('jose');
    const key = await importPKCS8(env.oauth.applePrivateKey, 'ES256');
    return new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: env.oauth.appleKeyId })
        .setIssuer(env.oauth.appleTeamId)
        .setSubject(clientId)
        .setAudience(APPLE_ISSUER)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
}

async function exchangeAppleCode(code: string, clientId: string) {
    const parameters = new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret(clientId), code, grant_type: 'authorization_code' });
    if (clientId === env.oauth.appleServiceId) parameters.set('redirect_uri', env.oauth.appleRedirectUri);
    const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: parameters,
    });
    const result = await response.json() as { id_token?: string; refresh_token?: string; error?: string };
    if (!response.ok || !result.id_token) throw new OAuthError('APPLE_TOKEN_EXCHANGE_FAILED', 401);
    return { idToken: result.id_token, refreshToken: result.refresh_token ?? null };
}

async function verifyProviderCredential(tx: AuthTransactionModel, idToken: string, authorizationCode?: string) {
    if (tx.provider === 'google') {
        const audiences = [env.oauth.googleWebClientId, env.oauth.googleIosClientId, env.oauth.googleAndroidClientId].filter(Boolean);
        const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
        const payload = ticket.getPayload();
        if (!payload?.sub || payload.nonce !== tx.nonce) throw new OAuthError('OAUTH_TOKEN_INVALID', 401);
        return { issuer: GOOGLE_ISSUER, subject: payload.sub, clientId: payload.aud, email: payload.email?.trim().toLowerCase() ?? null, emailVerified: payload.email_verified === true, refreshToken: null };
    }
    const clientId = tx.platform === 'ios' ? env.oauth.appleBundleId : env.oauth.appleServiceId;
    if (!authorizationCode || !clientId) throw new OAuthError('OAUTH_TOKEN_INVALID', 401);
    const exchanged = await exchangeAppleCode(authorizationCode, clientId);
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    appleKeys ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const { payload } = await jwtVerify(exchanged.idToken, appleKeys, { issuer: APPLE_ISSUER, audience: clientId });
    if (!payload.sub || payload.nonce !== tx.nonce) throw new OAuthError('OAUTH_TOKEN_INVALID', 401);
    if (idToken) {
        const original = await jwtVerify(idToken, appleKeys, { issuer: APPLE_ISSUER, audience: clientId });
        if (original.payload.sub !== payload.sub || original.payload.nonce !== tx.nonce) throw new OAuthError('OAUTH_TOKEN_INVALID', 401);
    }
    return { issuer: APPLE_ISSUER, subject: payload.sub, clientId, email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null, emailVerified: payload.email_verified === true || payload.email_verified === 'true', refreshToken: exchanged.refreshToken ? encryptRefreshToken(exchanged.refreshToken) : null };
}

type Verified = Awaited<ReturnType<typeof verifyProviderCredential>>;
const toAuthUser = (user: UserModel): AuthUser => ({ id: Number(user.id), email: user.email, displayName: user.display_name });

export async function startOAuth({ provider, purpose, platform, clientType, reauthPurpose, userId, sessionId, verifier, returnOrigin, analyticsEpoch, geo }: {
    provider: OAuthProvider;
    purpose: OAuthPurpose;
    platform: OAuthPlatform;
    clientType: unknown;
    reauthPurpose?: ReauthPurpose;
    userId?: number;
    sessionId?: number;
    verifier?: string;
    returnOrigin?: string;
    analyticsEpoch?: string;
    geo?: GeoContext;
}) {
    const available = oauthAvailability();
    if (provider === 'google' && !(platform === 'ios' ? available.googleIos : platform === 'android' ? available.googleAndroid : available.googleWeb)
        || provider === 'apple' && !(platform === 'ios' ? available.appleNative : available.appleWeb)) {
        throw new OAuthError('OAUTH_NOT_CONFIGURED', 503);
    }
    if (purpose !== 'login' && (!userId || !sessionId)) throw new OAuthError('AUTH_REQUIRED', 401);
    if (purpose === 'reauth' && !reauthPurpose) throw new OAuthError('REAUTH_PURPOSE_REQUIRED');
    if (platform !== 'ios' && provider === 'apple' && (!verifier || verifier.length < 32)) throw new OAuthError('OAUTH_VERIFIER_REQUIRED');
    if (platform === 'web' && provider === 'apple' && (!returnOrigin || !env.oauth.webOrigins.includes(returnOrigin))) throw new OAuthError('OAUTH_RETURN_INVALID', 401);
    // Nitro's Android Credential Manager adapter expects a SHA-256-shaped hex
    // nonce; the same unpredictable value works for Apple and Google Web.
    const nonce = randomBytes(32).toString('hex');
    const state = random();
    const transaction = await AuthTransactionModel.create({
        provider, purpose, platform, client_type: normalizeAuthClientType(clientType),
        reauth_purpose: reauthPurpose ?? null,
        analytics_epoch_hash: analyticsEpoch && /^[a-f0-9]{64}$/.test(analyticsEpoch) ? hash(analyticsEpoch) : null,
        registration_country: geo?.countryCode ?? 'unknown',
        registration_geo_source: geo?.source ?? 'unknown',
        nonce, state_hash: hash(state), verifier_hash: verifier ? hash(verifier) : null,
        return_origin: platform === 'web' && provider === 'apple' ? returnOrigin : null,
        user_id: userId ?? null, session_id: sessionId ?? null,
        expires_at: new Date(Date.now() + TRANSACTION_TTL_MS),
    } as any);
    const result: { transactionId: number; nonce: string; state: string; authorizationUrl?: string } = { transactionId: transaction.id, nonce, state };
    if (provider === 'apple' && platform !== 'ios') {
        const url = new URL(`${APPLE_ISSUER}/auth/authorize`);
        url.searchParams.set('client_id', env.oauth.appleServiceId);
        url.searchParams.set('redirect_uri', env.oauth.appleRedirectUri);
        url.searchParams.set('response_type', 'code id_token');
        url.searchParams.set('response_mode', 'form_post');
        url.searchParams.set('scope', 'name email');
        url.searchParams.set('state', state);
        url.searchParams.set('nonce', nonce);
        result.authorizationUrl = url.toString();
    }
    return result;
}

async function addIdentity(tx: AuthTransactionModel, userId: number, verified: Verified, transaction: Transaction) {
    const identity = await UserAuthIdentityModel.create({
        user_id: userId, provider: tx.provider, issuer: verified.issuer,
        provider_subject: verified.subject,
        client_id: verified.clientId,
        provider_email: verified.email,
        provider_email_verified: verified.emailVerified,
        // Grants are stored per client ID below; the identity row holds only
        // stable provider identity and contact metadata.
        refresh_token_ciphertext: null,
    } as any, { transaction });
    await saveAppleGrant(identity, verified.clientId, verified.refreshToken, transaction);
    return identity;
}

async function saveAppleGrant(identity: UserAuthIdentityModel, clientId: string, encryptedRefreshToken: string | null, transaction: Transaction) {
    if (identity.provider !== 'apple' || !encryptedRefreshToken) return;
    await UserAuthGrantModel.upsert({
        user_id: identity.user_id,
        identity_id: identity.id,
        provider: 'apple',
        client_id: clientId,
        refresh_token_ciphertext: encryptedRefreshToken,
    } as any, { transaction });
}

type Resolution = { status: 'authenticated'; userId: number } | { status: 'needs_link'; transactionId: number; emailHint: string } | { status: 'linked' } | { status: 'reauthenticated'; ticket: string };

/** All identity decisions are serialized with the OAuth transaction row.
 * Call only after verifying a provider-signed token and this transaction's nonce. */
async function resolveVerifiedProviderIdentity(txId: number, verified: Verified, deferSession: boolean, userId?: number, sessionId?: number): Promise<Resolution> {
    return sequelize.transaction<Resolution>(async (transaction) => {
        const tx = await AuthTransactionModel.findByPk(txId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!tx || tx.consumed_at || tx.result_kind || new Date(tx.expires_at).getTime() <= Date.now()) throw new OAuthError('OAUTH_TRANSACTION_INVALID', 401);
        if (tx.purpose !== 'login') {
            if (!deferSession && (tx.user_id !== userId || tx.session_id !== sessionId)) throw new OAuthError('AUTH_REQUIRED', 401);
            if (!tx.session_id || !tx.user_id) throw new OAuthError('AUTH_REQUIRED', 401);
            const session = await UserSessionModel.findByPk(tx.session_id, { transaction });
            if (!session || session.user_id !== tx.user_id || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) throw new OAuthError('AUTH_REQUIRED', 401);
        }
        const existing = await UserAuthIdentityModel.findOne({ where: { provider: tx.provider, issuer: verified.issuer, provider_subject: verified.subject }, transaction, lock: transaction.LOCK.UPDATE });
        if (tx.purpose === 'link') {
            if (existing && existing.user_id !== tx.user_id) throw new OAuthError('IDENTITY_ALREADY_LINKED', 409);
            if (deferSession) {
                // The browser callback has no business token. Save verified
                // claims but do not bind until the initiating app exchanges
                // its one-use ticket with the still-current session token.
                await tx.update({ provider_issuer: verified.issuer, provider_subject: verified.subject,
                    client_id: verified.clientId, provider_email: verified.email,
                    provider_email_verified: verified.emailVerified,
                    refresh_token_ciphertext: verified.refreshToken,
                    result_kind: 'pending_link' }, { transaction });
            } else {
                if (!existing) await addIdentity(tx, Number(tx.user_id), verified, transaction);
                else {
                    if (verified.email) await existing.update({ provider_email: verified.email, provider_email_verified: verified.emailVerified }, { transaction });
                    await saveAppleGrant(existing, verified.clientId, verified.refreshToken, transaction);
                }
                await tx.update({ result_kind: 'linked', consumed_at: new Date() }, { transaction });
            }
            return { status: 'linked' };
        }
        if (tx.purpose === 'reauth') {
            if (!existing || existing.user_id !== tx.user_id) throw new OAuthError('IDENTITY_NOT_LINKED', 403);
            await saveAppleGrant(existing, verified.clientId, verified.refreshToken, transaction);
            const ticket = randomBytes(32).toString('hex');
            if (!deferSession) {
                await UserReauthTicketModel.create({ user_id: tx.user_id, session_id: tx.session_id, purpose: tx.reauth_purpose, ticket_hash: hash(ticket), expires_at: new Date(Date.now() + TRANSACTION_TTL_MS) } as any, { transaction });
            }
            await tx.update({ result_kind: 'reauthenticated', ...(deferSession ? {} : { consumed_at: new Date() }) }, { transaction });
            return { status: 'reauthenticated', ticket };
        }
        if (existing) {
            if (verified.email || verified.refreshToken) await existing.update({
                ...(verified.email ? { provider_email: verified.email, provider_email_verified: verified.emailVerified } : {}),
                ...(verified.refreshToken ? { client_id: verified.clientId } : {}),
            }, { transaction });
            await saveAppleGrant(existing, verified.clientId, verified.refreshToken, transaction);
            await tx.update({ result_user_id: existing.user_id, result_kind: 'authenticated', ...(deferSession ? {} : { consumed_at: new Date() }) }, { transaction });
            return { status: 'authenticated', userId: existing.user_id };
        }
        if (verified.email) {
            const collision = await UserModel.findOne({ where: { email: verified.email }, transaction, lock: transaction.LOCK.UPDATE });
            if (collision) {
                await tx.update({ provider_issuer: verified.issuer, provider_subject: verified.subject, client_id: verified.clientId, provider_email: verified.email, provider_email_verified: verified.emailVerified, refresh_token_ciphertext: verified.refreshToken, result_kind: 'needs_link' }, { transaction });
                return { status: 'needs_link', transactionId: tx.id, emailHint: verified.email };
            }
        }
        const user = await UserModel.create({ email: null, display_name: 'Learner', password_hash: null, email_verified_at: null } as any, { transaction });
        await user.update({ display_name: `Learner ${user.id}` }, { transaction });
        await write('insert into analytics_user_profiles(user_id,registration_country) values(:id,:country)', { id: user.id, country: tx.registration_country ?? 'unknown' }, transaction);
        const context = tx.analytics_epoch_hash
            ? (await rows('select * from analytics_sessions where identity_epoch=:epoch and user_id is null and revoked_at is null and expires_at>UTC_TIMESTAMP(3) for update', { epoch: tx.analytics_epoch_hash }, transaction))[0]
            : undefined;
        if (context && Date.now() - utcValue(context.last_activity_at) < 30 * 60_000) {
            const source = json<Record<string, string>>(context.attribution).utm_source ?? 'direct_or_unknown';
            await write('update analytics_user_profiles set registration_source=:source where user_id=:id', { source, id: user.id }, transaction);
            await write(`insert into analytics_events(event_id,event_name,user_id,anonymous_id,identity_epoch,analytics_session_id,seq,event_at,received_at,stat_date,client_type,surface,environment,country_code,geo_source,app_build,properties) values(:id,'signup_completed',:userId,:anon,:epoch,:session,0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),date(UTC_TIMESTAMP()+interval 8 hour),:client,'learner',:environment,:country,:source,'server','{}')`, { id: randomUUID(), userId: user.id, anon: context.anonymous_id, epoch: context.identity_epoch, session: context.analytics_session_id, client: context.client_type, environment: context.environment, country: tx.registration_country ?? 'unknown', source: tx.registration_geo_source ?? 'unknown' }, transaction);
        }
        await addIdentity(tx, user.id, verified, transaction);
        await tx.update({ result_user_id: user.id, result_kind: 'authenticated', ...(deferSession ? {} : { consumed_at: new Date() }) }, { transaction });
        return { status: 'authenticated', userId: user.id };
    }).catch((error) => {
        if (error instanceof UniqueConstraintError) throw new OAuthError('IDENTITY_ALREADY_LINKED', 409);
        throw error;
    });
}

export async function completeOAuth({ transactionId, idToken, authorizationCode, userId, sessionId, deferSession = false }: {
    transactionId: number;
    idToken: string;
    authorizationCode?: string;
    userId?: number;
    sessionId?: number;
    deferSession?: boolean;
}) {
    const tx = await AuthTransactionModel.findByPk(transactionId);
    if (!tx || tx.consumed_at || tx.result_kind || new Date(tx.expires_at).getTime() <= Date.now()) throw new OAuthError('OAUTH_TRANSACTION_INVALID', 401);
    let verified: Verified;
    try { verified = await verifyProviderCredential(tx, idToken, authorizationCode); }
    catch (error) {
        if (error instanceof OAuthError) throw error;
        // Vendor validation errors can contain token fragments; expose only a
        // stable code to the client and never log the raw credential.
        throw new OAuthError('OAUTH_TOKEN_INVALID', 401);
    }
    const resolution = await resolveVerifiedProviderIdentity(transactionId, verified, deferSession, userId, sessionId);
    if (deferSession || resolution.status !== 'authenticated') return resolution;
    const user = await UserModel.findByPk(resolution.userId);
    if (!user) throw new OAuthError('USER_NOT_FOUND', 404);
    const token = await issueUserSession({ userId: user.id, clientType: normalizeAuthClientType(tx.client_type), authMethod: tx.provider });
    return { status: 'authenticated' as const, auth: { user: toAuthUser(user), token } as AuthResponse };
}

export async function confirmOAuthLink(transactionId: number, userId: number) {
    return sequelize.transaction(async (transaction) => {
        const tx = await AuthTransactionModel.findByPk(transactionId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!tx || tx.result_kind !== 'needs_link' || tx.consumed_at || new Date(tx.expires_at).getTime() <= Date.now() || !tx.provider_issuer || !tx.provider_subject || !tx.provider_email) throw new OAuthError('OAUTH_TRANSACTION_INVALID', 401);
        const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user?.email_verified_at || user.email?.toLowerCase() !== tx.provider_email.toLowerCase()) throw new OAuthError('LINK_ACCOUNT_MISMATCH', 403);
        const existing = await UserAuthIdentityModel.findOne({ where: { provider: tx.provider, issuer: tx.provider_issuer, provider_subject: tx.provider_subject }, transaction, lock: transaction.LOCK.UPDATE });
        if (existing) throw new OAuthError('IDENTITY_ALREADY_LINKED', 409);
        const identity = await UserAuthIdentityModel.create({ user_id: userId, provider: tx.provider, issuer: tx.provider_issuer, provider_subject: tx.provider_subject, client_id: tx.client_id, provider_email: tx.provider_email, provider_email_verified: tx.provider_email_verified, refresh_token_ciphertext: null } as any, { transaction });
        await saveAppleGrant(identity, tx.client_id ?? env.oauth.appleBundleId, tx.refresh_token_ciphertext, transaction);
        await tx.update({ consumed_at: new Date(), result_user_id: userId, result_kind: 'linked' }, { transaction });
        return { linked: true };
    }).catch((error) => {
        if (error instanceof UniqueConstraintError) throw new OAuthError('IDENTITY_ALREADY_LINKED', 409);
        throw error;
    });
}

export async function findAppleCallbackTransaction(state: string) {
    if (!state || state.length < 20) throw new OAuthError('OAUTH_TRANSACTION_INVALID', 401);
    const tx = await AuthTransactionModel.findOne({ where: { state_hash: hash(state), provider: 'apple' } });
    if (!tx || tx.consumed_at || tx.result_kind || new Date(tx.expires_at).getTime() <= Date.now()) throw new OAuthError('OAUTH_TRANSACTION_INVALID', 401);
    return tx;
}

export async function createOAuthExchange(transactionId: number) {
    const exchangeTicket = random();
    await AuthTransactionModel.update({ exchange_hash: hash(exchangeTicket) }, { where: { id: transactionId, consumed_at: null } });
    return exchangeTicket;
}

export async function exchangeOAuthResult(exchangeTicket: string, verifier: string, userId?: number, sessionId?: number) {
    if (!exchangeTicket || !verifier) throw new OAuthError('OAUTH_EXCHANGE_INVALID', 401);
    const result = await sequelize.transaction(async (transaction) => {
        const tx = await AuthTransactionModel.findOne({ where: { exchange_hash: hash(exchangeTicket) }, transaction, lock: transaction.LOCK.UPDATE });
        if (!tx || tx.consumed_at || !tx.result_kind || new Date(tx.expires_at).getTime() <= Date.now() || tx.verifier_hash !== hash(verifier)) throw new OAuthError('OAUTH_EXCHANGE_INVALID', 401);
        if (tx.purpose !== 'login' && (tx.user_id !== userId || tx.session_id !== sessionId)) throw new OAuthError('AUTH_REQUIRED', 401);
        await tx.update({ exchange_hash: null, ...(tx.result_kind === 'needs_link' ? {} : { consumed_at: new Date() }) }, { transaction });
        if (tx.result_kind === 'reauthenticated') {
            const ticket = randomBytes(32).toString('hex');
            await UserReauthTicketModel.create({ user_id: tx.user_id, session_id: tx.session_id, purpose: tx.reauth_purpose, ticket_hash: hash(ticket), expires_at: new Date(Date.now() + TRANSACTION_TTL_MS) } as any, { transaction });
            return { status: 'reauthenticated' as const, ticket };
        }
        if (tx.result_kind === 'pending_link') {
            if (!tx.provider_issuer || !tx.provider_subject || !tx.user_id) throw new OAuthError('OAUTH_EXCHANGE_INVALID', 401);
            const existing = await UserAuthIdentityModel.findOne({ where: { provider: tx.provider, issuer: tx.provider_issuer, provider_subject: tx.provider_subject }, transaction, lock: transaction.LOCK.UPDATE });
            if (existing && existing.user_id !== tx.user_id) throw new OAuthError('IDENTITY_ALREADY_LINKED', 409);
            if (!existing) {
                const identity = await UserAuthIdentityModel.create({ user_id: tx.user_id, provider: tx.provider, issuer: tx.provider_issuer,
                    provider_subject: tx.provider_subject, client_id: tx.client_id, provider_email: tx.provider_email,
                    provider_email_verified: tx.provider_email_verified,
                    refresh_token_ciphertext: null } as any, { transaction });
                await saveAppleGrant(identity, tx.client_id ?? env.oauth.appleBundleId, tx.refresh_token_ciphertext, transaction);
            } else {
                if (tx.provider_email) await existing.update({ provider_email: tx.provider_email, provider_email_verified: tx.provider_email_verified }, { transaction });
                await saveAppleGrant(existing, tx.client_id ?? env.oauth.appleBundleId, tx.refresh_token_ciphertext, transaction);
            }
            return { status: 'linked' as const };
        }
        if (tx.result_kind === 'needs_link') return { status: 'needs_link' as const, transactionId: tx.id, emailHint: tx.provider_email };
        if (tx.result_kind === 'linked') return { status: 'linked' as const };
        return { status: 'authenticated' as const, userId: Number(tx.result_user_id), provider: tx.provider, clientType: tx.client_type };
    });
    if (result.status !== 'authenticated') return result;
    const user = await UserModel.findByPk(result.userId);
    if (!user) throw new OAuthError('USER_NOT_FOUND', 404);
    const token = await issueUserSession({ userId: user.id, clientType: normalizeAuthClientType(result.clientType), authMethod: result.provider });
    return { status: 'authenticated' as const, auth: { user: toAuthUser(user), token } as AuthResponse };
}

export async function revokeAppleGrant(userId: number) {
    const identity = await UserAuthIdentityModel.findOne({ where: { user_id: userId, provider: 'apple' } });
    if (!identity) return;
    const grants = await UserAuthGrantModel.findAll({ where: { identity_id: identity.id } });
    const targets = grants.length ? grants.map((grant) => ({ clientId: grant.client_id, ciphertext: grant.refresh_token_ciphertext }))
        : identity.refresh_token_ciphertext ? [{ clientId: identity.client_id || env.oauth.appleBundleId, ciphertext: identity.refresh_token_ciphertext }] : [];
    for (const target of targets) {
        const response = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
            method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: target.clientId, client_secret: await appleClientSecret(target.clientId), token: decryptRefreshToken(target.ciphertext), token_type_hint: 'refresh_token' }),
        });
        if (!response.ok) throw new OAuthError('APPLE_REVOKE_FAILED', 503);
    }
}

/** Never remove the account's final usable credential. */
export async function unlinkOAuthIdentity(userId: number, sessionId: number, provider: OAuthProvider, reauthTicket: string) {
    return sequelize.transaction(async (transaction) => {
        const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw new OAuthError('USER_NOT_FOUND', 404);
        const identities = await UserAuthIdentityModel.findAll({ where: { user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
        const target = identities.find((identity) => identity.provider === provider);
        if (!target) throw new OAuthError('IDENTITY_NOT_LINKED', 404);
        const emailAvailable = Boolean(user.email && user.email_verified_at);
        if (identities.length + (emailAvailable ? 1 : 0) <= 1) throw new OAuthError('LAST_LOGIN_METHOD', 409);
        await consumeReauthTicket({ userId, sessionId, purpose: 'unlink_identity', ticket: reauthTicket, transaction });
        if (provider === 'apple') await revokeAppleGrant(userId);
        const currentSession = await UserSessionModel.findByPk(sessionId, { transaction });
        await UserAuthGrantModel.destroy({ where: { identity_id: target.id }, transaction });
        await target.destroy({ transaction });
        await UserSessionModel.update({ revoked_at: new Date() }, { where: { user_id: userId, auth_method: provider }, transaction });
        return { unlinked: true, currentSessionRevoked: currentSession?.auth_method === provider };
    });
}
