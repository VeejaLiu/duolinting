import type {
  AcceptedAnswerFeedbackListResponse,
  AdminContentResponse,
  AdminAuthResponse,
  AdminExercisePage,
  AdminLoginRequest,
  AdminUserActivityReport,
  AdminUser,
  CatalogExerciseSummary,
  CatalogResponse,
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
  CreateExerciseRequest,
  CreateTranscriptLineRequest,
  ImageUploadResponse,
  ListeningExercise,
  MediaUploadResponse,
  UpdateAcceptedAnswerFeedbackStatusRequest,
} from '@duolinting/shared'

// 生产与本地开发都走同源（空字符串）：生产由前端 nginx 容器把 /api/ 代理到 backend，
// 本地由 admin/vite.config.ts 的 dev server proxy 代理到 8100 端口的 backend。
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/+$/, '')

const apiUrl = (path: string) => `${API_BASE_URL}${path}`

export const resolveApiUrl = (value: string | undefined | null) => {
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
    return apiUrl(rawValue)
  }

  return rawValue
}

type ApiResult<T> = {
  success: boolean
  message: string
  data?: T
}

type ApiErrorBody = {
  message?: string
  errors?: Array<{
    msg?: string
    path?: string
  }>
}

const formatApiError = (errorBody: ApiErrorBody | undefined, status: number) => {
  const fieldErrors = errorBody?.errors
    ?.map((error) => [error.path, error.msg].filter(Boolean).join(': '))
    .filter(Boolean)

  if (fieldErrors?.length) {
    return `${errorBody?.message ?? 'Invalid request'}: ${fieldErrors.join('; ')}`
  }

  return errorBody?.message ?? `API request failed: ${status}`
}

const fetchJson = async <T>(
  path: string,
  init?: RequestInit,
  options?: {
    adminToken?: string
    authToken?: string
  },
): Promise<T> => {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(options?.adminToken
        ? { authorization: `Bearer ${options.adminToken}` }
        : {}),
      ...(options?.authToken
        ? { authorization: `Bearer ${options.authToken}` }
        : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | ApiErrorBody
      | undefined
    throw new Error(formatApiError(errorBody, response.status))
  }

  return response.json() as Promise<T>
}

const uploadFile = async <T>(
  path: string,
  file: File,
  fieldName: string,
  options?: {
    adminToken?: string
  },
): Promise<T> => {
  const formData = new FormData()
  formData.append(fieldName, file)

  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      ...(options?.adminToken
        ? { authorization: `Bearer ${options.adminToken}` }
        : {}),
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | ApiErrorBody
      | undefined
    throw new Error(formatApiError(errorBody, response.status))
  }

  return response.json() as Promise<T>
}

const fetchApiResult = async <T>(
  path: string,
  init?: RequestInit,
  options?: {
    adminToken?: string
    authToken?: string
  },
) => {
  const result = await fetchJson<ApiResult<T>>(path, init, options)
  if (!result.success || !result.data) {
    throw new Error(result.message)
  }
  return result.data
}

export const apiClient = {
  getAdminCatalog: (adminToken: string) =>
    fetchJson<CatalogResponse>(
      '/api/v1/admin/catalog',
      {
        method: 'GET',
      },
      { adminToken },
    ),
  getAdminExercises: (adminToken: string) =>
    fetchJson<CatalogExerciseSummary[]>(
      '/api/v1/admin/exercises',
      {
        method: 'GET',
      },
      { adminToken },
    ),
  getAdminExercisesPage: (
    adminToken: string,
    options: {
      categoryId?: number
      groupId?: number
      page: number
      pageSize: number
      search?: string
      status?: 'draft' | 'published' | 'archived'
    },
  ) => {
    const params = new URLSearchParams({
      page: String(options.page),
      pageSize: String(options.pageSize),
    })
    if (options.groupId) params.set('groupId', String(options.groupId))
    if (options.categoryId) params.set('categoryId', String(options.categoryId))
    if (options.status) params.set('status', options.status)
    if (options.search?.trim()) params.set('search', options.search.trim())
    return fetchJson<AdminExercisePage>(
      `/api/v1/admin/exercises?${params.toString()}`,
      { method: 'GET' },
      { adminToken },
    )
  },
  adminLogin: (request: AdminLoginRequest) =>
    fetchApiResult<AdminAuthResponse>('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  getCurrentAdmin: (adminToken: string) =>
    fetchApiResult<AdminUser>(
      '/api/v1/admin/auth/me',
      {
        method: 'GET',
      },
      { adminToken },
    ),
  adminLogout: (adminToken: string) =>
    fetchJson<ApiResult<never>>(
      '/api/v1/admin/auth/logout',
      { method: 'POST' },
      { adminToken },
    ),
  getAdminExercise: (exerciseId: number, adminToken: string) =>
    fetchJson<ListeningExercise>(
      `/api/v1/admin/exercises/${exerciseId}`,
      {
        method: 'GET',
      },
      { adminToken },
    ),
  createCategory: (request: CreateCategoryRequest, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      '/api/v1/admin/categories',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      { adminToken },
    ),
  createCategoryGroup: (
    request: CreateCategoryGroupRequest,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      '/api/v1/admin/category-groups',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      { adminToken },
    ),
  updateExerciseMedia: (
    exerciseId: number,
    media: Pick<CreateExerciseRequest, 'mediaType' | 'audioUrl'>,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/media`,
      {
        method: 'PUT',
        body: JSON.stringify(media),
      },
      { adminToken },
    ),
  deleteCategoryGroup: (groupId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/category-groups/${groupId}`,
      {
        method: 'DELETE',
      },
      { adminToken },
    ),
  deleteCategory: (categoryId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/categories/${categoryId}`,
      {
        method: 'DELETE',
      },
      { adminToken },
    ),
  createExercise: (request: CreateExerciseRequest, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      '/api/v1/admin/exercises',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      { adminToken },
    ),
  translateLines: (
    lines: string[],
    adminToken: string,
    sourceLocale = 'en-US',
    targetLocale = 'zh-CN',
    // 轮询间隔：批量翻译调用多、任务耗时长，默认 10 秒一次足够，
    // 避免对后端造成不必要的请求压力；单句翻译等短任务可传更小的值。
    pollIntervalMs = 10_000,
  ): Promise<{ translations: string[]; failedIndexes: number[] }> =>
    (async () => {
      const { jobId } = await fetchApiResult<{ jobId: string }>(
      '/api/v1/admin/translate',
      {
        method: 'POST',
        body: JSON.stringify({ lines, sourceLocale, targetLocale }),
      },
      { adminToken },
      )

      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
        const job = await fetchApiResult<{
          status: 'processing' | 'completed' | 'failed'
          result?: { translations: string[]; failedIndexes: number[] }
          message?: string
        }>(`/api/v1/admin/translate/${encodeURIComponent(jobId)}`, { method: 'GET' }, { adminToken })
        if (job.status === 'completed' && job.result) {
          return job.result
        }
        if (job.status === 'failed') {
          throw new Error(job.message ?? 'AI 翻译失败')
        }
      }
    })(),
  deleteExercise: (exerciseId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}`,
      {
        method: 'DELETE',
      },
      { adminToken },
    ),
  replaceTranscript: (
    exerciseId: number,
    lines: CreateTranscriptLineRequest[],
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/transcript`,
      {
        method: 'PUT',
        body: JSON.stringify({ lines }),
      },
      { adminToken },
    ),
  uploadMedia: (file: File, adminToken: string) =>
    uploadFile<MediaUploadResponse>('/api/v1/media/files', file, 'media', {
      adminToken,
    }),
  uploadImage: (file: File, adminToken: string) =>
    uploadFile<ImageUploadResponse>('/api/v1/media/files', file, 'media', {
      adminToken,
    }),
  getAcceptedAnswerFeedback: (
    adminToken: string,
    status?: 'open' | 'reviewed' | 'dismissed' | 'all',
  ) =>
    fetchJson<AcceptedAnswerFeedbackListResponse>(
      `/api/v1/admin/feedback/accepted-answer${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`,
      {
        method: 'GET',
      },
      { adminToken },
    ),
  updateAcceptedAnswerFeedbackStatus: (
    feedbackId: number,
    request: UpdateAcceptedAnswerFeedbackStatusRequest,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/feedback/accepted-answer/${feedbackId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify(request),
      },
      { adminToken },
    ),
  getAdminUserActivity: (adminToken: string) =>
    fetchJson<AdminUserActivityReport>(
      '/api/v1/admin/users/activity',
      {
        method: 'GET',
      },
      { adminToken },
    ),
}
