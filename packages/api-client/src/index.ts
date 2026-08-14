import type {
  AuthResponse,
  AuthClientType,
  AuthUser,
  ChangePasswordRequest,
  ContentLocale,
  CatalogExerciseSummary,
  CatalogResponse,
  DailyActivitySummary,
  LeaderboardResponse,
  ListeningExercise,
  LoginRequest,
  ProgressSyncResponse,
  RegisterRequest,
  StudyStore,
  UserPreferences,
  SubmitAcceptedAnswerFeedbackRequest,
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
    getCatalog: (contentLocale?: ContentLocale) => fetchJson<CatalogResponse>(
      `/api/v1/catalog${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
    ),
    getCategoryExercises: (categoryId: number, contentLocale?: ContentLocale) =>
      fetchJson<CatalogExerciseSummary[]>(
        `/api/v1/catalog/category/${categoryId}/exercises${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
      ),
    getExercise: (exerciseId: number, contentLocale?: ContentLocale) =>
      fetchJson<ListeningExercise>(
        `/api/v1/exercises/${exerciseId}${contentLocale ? `?contentLocale=${encodeURIComponent(contentLocale)}` : ''}`,
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
    recordDailyActivity: (day: string, masteredDelta: number, authToken: string) =>
      fetchJson<{ ok: boolean }>('/api/v1/activity/mastered', {
        method: 'POST',
        body: JSON.stringify({ day, masteredDelta }),
      }, { authToken }),
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
    getCurrentUser: (authToken: string) =>
      fetchJson<AuthUser>('/api/v1/auth/me', { method: 'GET' }, { authToken }),
    changePassword: (request: ChangePasswordRequest, authToken: string) =>
      fetchApiResult<AuthResponse>(
        '/api/v1/auth/password',
        {
          method: 'PUT',
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
