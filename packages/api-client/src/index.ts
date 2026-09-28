import type {
  AnalyticsContext,
  AnalyticsEvent,
  AuthResponse,
  AuthClientType,
  AuthUser,
  AuthMethods,
  ChangePasswordRequest,
  ContentLocale,
  CatalogExerciseSummary,
  CatalogResponse,
  DailyActivitySummary,
  DeleteAccountRequest,
  DeleteAccountResponse,
  EmailStartRequest,
  EmailVerifyRequest,
  LeaderboardResponse,
  ListeningExercise,
  LoginRequest,
  OAuthConfig,
  OAuthResult,
  OAuthStartRequest,
  OAuthStartResponse,
  RequestEmailCodeRequest,
  RequestEmailCodeResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  ReauthPurpose,
  ReauthRequest,
  ReauthResponse,
  ProgressSyncResponse,
  RegisterRequest,
  StudyStore,
  UserPreferences,
  SubmitAcceptedAnswerFeedbackRequest,
  Sponsor,
  Donation,
} from '@duolinting/domain'
import { normalizeApiBaseUrl } from '@duolinting/app-config'

type ApiResult<T> = {
  success: boolean
  message: string
  data?: T
}

export class ApiClientError extends Error {
  status: number
  code?: string

  constructor(message: string, status = 500, code?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

export type ApiClientConfig = {
  apiBaseUrl: string
  analyticsContext?: () => string | undefined
  authClientType?: AuthClientType
  fetchImpl?: typeof fetch
}

export const resolveApiUrl = (
  apiBaseUrl: string,
  value: string | undefined | null,
) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  if (
    rawValue.startsWith('http://') ||
    rawValue.startsWith('https://') ||
    rawValue.startsWith('blob:') ||
    rawValue.startsWith('data:')
  ) {
    return rawValue
  }

  if (rawValue.startsWith('/')) {
    return `${normalizeApiBaseUrl(apiBaseUrl)}${rawValue}`
  }

  return rawValue
}

export const createApiClient = ({
  apiBaseUrl,
  authClientType = 'web_app',
  analyticsContext,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: ApiClientConfig) => {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const apiUrl = (path: string) => `${normalizedBaseUrl}${path}`

  const fetchJson = async <T>(
    path: string,
    init?: RequestInit,
    options?: {
      authToken?: string
    },
  ): Promise<T> => {
    const response = await fetchImpl(apiUrl(path), {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-duolinting-client-type': authClientType,
        ...(analyticsContext?.() ? { 'x-analytics-context': analyticsContext()! } : {}),
        ...(options?.authToken
          ? { authorization: `Bearer ${options.authToken}` }
          : {}),
        ...init?.headers,
      },
    })

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as
        | { message?: string; code?: string }
        | undefined
      throw new ApiClientError(
        errorBody?.message ?? `API request failed: ${response.status}`,
        response.status,
        errorBody?.code,
      )
    }

    return response.json() as Promise<T>
  }

  const fetchApiResult = async <T>(
    path: string,
    init?: RequestInit,
    options?: {
      authToken?: string
    },
  ) => {
    const result = await fetchJson<ApiResult<T>>(path, init, options)
    if (!result.success || !result.data) {
      throw new ApiClientError(result.message)
    }
    return result.data
  }

  return {
    apiBaseUrl: normalizedBaseUrl,
    resolveApiUrl: (value: string | undefined | null) =>
      resolveApiUrl(normalizedBaseUrl, value),
    getSponsors: () => fetchJson<{ items: Sponsor[] }>('/api/v1/sponsors'),
    getDonations: async () => {
      // A persisted mobile query or an older backend may predate social links.
      // Normalize the optional fields before any learner UI receives the row.
      type DonationApiRow = Omit<Donation, 'socialLinks' | 'publicEmail'> &
        Partial<Pick<Donation, 'socialLinks' | 'publicEmail'>>
      const result = await fetchJson<{ items: DonationApiRow[] }>('/api/v1/sponsors/donations')
      return {
        items: (Array.isArray(result.items) ? result.items : []).map((item): Donation => ({
          ...item,
          socialLinks: Array.isArray(item.socialLinks) ? item.socialLinks : [],
          publicEmail: typeof item.publicEmail === 'string' ? item.publicEmail : null,
        })),
      }
    },
    getCatalog: (contentLocale?: ContentLocale, authToken?: string) => fetchJson<CatalogResponse>(
      `/api/v1/catalog${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
      undefined,
      { authToken },
    ),
    getCategoryExercises: (categoryId: number, contentLocale?: ContentLocale, authToken?: string) =>
      fetchJson<CatalogExerciseSummary[]>(
        `/api/v1/catalog/category/${categoryId}/exercises${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
        undefined,
        { authToken },
      ),
    getExercise: (exerciseId: number, contentLocale?: ContentLocale, authToken?: string) =>
      fetchJson<ListeningExercise>(
        `/api/v1/exercises/${exerciseId}${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
        undefined,
        { authToken },
      ),
    getUserPreferences: (authToken: string) =>
      fetchJson<UserPreferences>('/api/v1/user/preferences', { method: 'GET' }, { authToken }),
    updateUserPreferences: (preferences: Partial<UserPreferences>, authToken: string) =>
      fetchJson<UserPreferences>('/api/v1/user/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      }, { authToken }),
    getDailyActivity: (authToken: string) =>
      fetchJson<DailyActivitySummary>('/api/v1/activity', { method: 'GET' }, { authToken }),
    recordDailyActivity: (day: string, masteredDelta: number, authToken: string, operationId?: string) =>
      fetchJson<{ ok: boolean }>('/api/v1/activity/mastered', {
        method: 'POST',
        body: JSON.stringify({ day, masteredDelta, operationId }),
      }, { authToken }),
    createAnalyticsContext: (consent: boolean, surface: 'learner' | 'official', authToken?: string) => fetchJson<AnalyticsContext>('/api/v1/analytics/context', { method: 'POST', body: JSON.stringify({ consent, surface, clientType: authClientType }) }, { authToken }),
    sendAnalyticsEvents: (events: AnalyticsEvent[], authToken?: string) => fetchJson<{ results: { eventId: string; status: 'accepted' | 'duplicate' | 'rejected'; code?: string }[] }>('/api/v1/analytics/events', { method: 'POST', body: JSON.stringify({ schemaVersion: 1, events }) }, { authToken }),
    register: (request: RegisterRequest) =>
      fetchApiResult<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...request,
          clientType: request.clientType ?? authClientType,
        }),
      }),
    login: (request: LoginRequest) =>
      fetchApiResult<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          ...request,
          clientType: request.clientType ?? authClientType,
        }),
      }),
    startEmailLogin: (request: EmailStartRequest) =>
      fetchApiResult<RequestEmailCodeResponse & { challengeId: number; expiresAt: string; retryAt: string }>(
        '/api/v1/auth/email/start', { method: 'POST', body: JSON.stringify(request) },
      ),
    startEmailLink: (request: EmailStartRequest, authToken: string) =>
      fetchApiResult<RequestEmailCodeResponse & { challengeId: number; expiresAt: string; retryAt: string }>(
        '/api/v1/auth/email/link/start', { method: 'POST', body: JSON.stringify(request) }, { authToken },
      ),
    confirmEmailLink: (request: EmailVerifyRequest & { reauthTicket: string }, authToken: string) =>
      fetchApiResult<{ email: string }>('/api/v1/auth/email/link/confirm', {
        method: 'POST', body: JSON.stringify(request),
      }, { authToken }),
    verifyEmailLogin: (request: EmailVerifyRequest) =>
      fetchApiResult<AuthResponse>('/api/v1/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ ...request, clientType: request.clientType ?? authClientType }),
      }),
    passwordLogin: (request: LoginRequest) =>
      fetchApiResult<AuthResponse>('/api/v1/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ ...request, clientType: request.clientType ?? authClientType }),
      }),
    getOAuthConfig: () => fetchApiResult<OAuthConfig>('/api/v1/auth/oauth/config', { method: 'GET' }),
    startOAuth: (request: OAuthStartRequest, authToken?: string) =>
      fetchApiResult<OAuthStartResponse>('/api/v1/auth/oauth/start', {
        method: 'POST', body: JSON.stringify({ ...request, clientType: request.clientType ?? authClientType }),
      }, { authToken }),
    completeOAuth: (request: { transactionId: number; idToken?: string; authorizationCode?: string }, authToken?: string) =>
      fetchApiResult<OAuthResult>('/api/v1/auth/oauth/complete', {
        method: 'POST', body: JSON.stringify(request),
      }, { authToken }),
    exchangeOAuth: (ticket: string, verifier: string, authToken?: string) =>
      fetchApiResult<OAuthResult>('/api/v1/auth/oauth/exchange', {
        method: 'POST', body: JSON.stringify({ ticket, verifier }),
      }, { authToken }),
    confirmOAuthLink: (transactionId: number, authToken: string) =>
      fetchApiResult<{ linked: true }>('/api/v1/auth/link/confirm', {
        method: 'POST', body: JSON.stringify({ transactionId, confirmed: true }),
      }, { authToken }),
    unlinkOAuthIdentity: (provider: 'apple' | 'google', reauthTicket: string, authToken: string) =>
      fetchApiResult<{ unlinked: true; currentSessionRevoked: boolean }>('/api/v1/auth/oauth/unlink', {
        method: 'POST', body: JSON.stringify({ provider, reauthTicket }),
      }, { authToken }),
    requestEmailCode: (request: RequestEmailCodeRequest) =>
      fetchApiResult<RequestEmailCodeResponse>('/api/v1/auth/email-code', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    resetPassword: (request: ResetPasswordRequest) =>
      fetchApiResult<ResetPasswordResponse>('/api/v1/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    getCurrentUser: (authToken: string) =>
      fetchJson<AuthUser>('/api/v1/auth/me', { method: 'GET' }, { authToken }),
    logout: (authToken: string) =>
      fetchApiResult<{ loggedOut: true }>('/api/v1/auth/logout', { method: 'POST' }, { authToken }),
    getAuthMethods: (authToken: string) =>
      fetchApiResult<AuthMethods>('/api/v1/auth/methods', { method: 'GET' }, { authToken }),
    startReauthEmail: (purpose: ReauthPurpose, uiLocale: string, authToken: string) =>
      fetchApiResult<RequestEmailCodeResponse & { challengeId: number; expiresAt: string; retryAt: string }>(
        '/api/v1/auth/reauth/email/start',
        { method: 'POST', body: JSON.stringify({ purpose, uiLocale }) }, { authToken },
      ),
    reauth: (request: ReauthRequest, authToken: string) =>
      fetchApiResult<ReauthResponse>('/api/v1/auth/reauth', {
        method: 'POST', body: JSON.stringify(request),
      }, { authToken }),
    changePassword: (request: ChangePasswordRequest, authToken: string) =>
      fetchApiResult<AuthResponse>(
        '/api/v1/auth/password',
        {
          method: 'PUT',
          body: JSON.stringify(request),
        },
        { authToken },
      ),
    deleteAccount: (request: DeleteAccountRequest, authToken: string) =>
      fetchApiResult<DeleteAccountResponse>(
        '/api/v1/auth/account',
        {
          method: 'DELETE',
          body: JSON.stringify(request),
        },
        { authToken },
      ),
    getProgress: (authToken: string) =>
      fetchJson<ProgressSyncResponse>(
        '/api/v1/progress',
        { method: 'GET' },
        { authToken },
      ),
    getLeaderboard: (authToken: string) =>
      fetchJson<LeaderboardResponse>(
        '/api/v1/leaderboard',
        { method: 'GET' },
        { authToken },
      ),
    saveProgress: (store: StudyStore, authToken: string) =>
      fetchJson<{ ok: true }>(
        '/api/v1/progress',
        {
          method: 'PUT',
          body: JSON.stringify(store),
        },
        { authToken },
      ),
    submitAcceptedAnswerFeedback: (
      request: SubmitAcceptedAnswerFeedbackRequest,
      authToken: string,
    ) =>
      fetchJson<{ ok: true; id: number }>(
        '/api/v1/feedback/accepted-answer',
        {
          method: 'POST',
          body: JSON.stringify(request),
        },
        { authToken },
      ),
  }
}
