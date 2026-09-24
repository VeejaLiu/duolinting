import type {
  AcceptedAnswerFeedbackListResponse,
  AdminContentResponse,
  AdminAuthResponse,
  AdminExercisePage,
  AdminLoginRequest,
  AdminGrowthReport,
  AdminMember,
  AdminMemberProvisioning,
  AdminOpenContentApiKey,
  AdminUser,
  AdminReviewTask,
  AdminSubtitleWorkflowTaskInbox,
  AdminWorkflowActivityPage,
  AdminWorkflowActivityType,
  AdminWorkflowNotifications,
  AdminWorkflowOverview,
  ClaimableWorkflowTaskPage,
  ChangeAdminPasswordRequest,
  CreateAdminMemberRequest,
  CreateOpenContentApiKeyRequest,
  CreateOpenContentApiKeyResponse,
  CatalogExerciseSummary,
  CatalogResponse,
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
  CreateExerciseRequest,
  CreateTranscriptLineRequest,
  ExerciseSubtitleVersion,
  ImageUploadResponse,
  ListeningExercise,
  PreviewVolunteer,
  MediaUploadResponse,
  UpdateAcceptedAnswerFeedbackStatusRequest,
  UpdateOpenContentApiKeyRequest,
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

export type FileUploadProgress = {
  // sending 表示浏览器仍在发送请求体；confirming 表示请求体已发完、正在等待最终响应。
  phase: 'sending' | 'confirming'
  // 已经由浏览器发送到服务端的请求体字节数。上传媒体时会略包含 multipart 边界开销。
  loaded: number
  // 浏览器可确定时使用请求体总字节数；否则退回为所选文件大小，供界面持续展示进度。
  total: number | null
  // 仅在总字节数已知且大于 0 时提供。100% 代表文件已发送，仍可能在等待服务端确认。
  percent: number | null
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

/** 携带 HTTP 状态码的请求错误，便于上层区分「会话失效(401)」与其它失败。 */
export class ApiClientError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
  }
}

let onUnauthorizedHandler: (() => void) | null = null

/**
 * 注册全局「后台会话失效」回调；传入 null 可注销。
 * 仅当携带 adminToken 的请求返回 401 时触发，登录接口的 401（密码错误）不会命中。
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorizedHandler = handler
}

const reportUnauthorizedIfNeeded = (
  status: number,
  options?: { adminToken?: string; authToken?: string },
) => {
  if (status === 401 && options?.adminToken) {
    onUnauthorizedHandler?.()
  }
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
    reportUnauthorizedIfNeeded(response.status, options)
    throw new ApiClientError(formatApiError(errorBody, response.status), response.status)
  }

  return response.json() as Promise<T>
}

const uploadFile = async <T>(
  path: string,
  file: File,
  fieldName: string,
  options?: {
    adminToken?: string
    onProgress?: (progress: FileUploadProgress) => void
  },
): Promise<T> => {
  const formData = new FormData()
  formData.append(fieldName, file)

  // fetch 目前不会暴露浏览器上传请求体的进度事件。媒体文件可能较大，因此这里使用
  // XMLHttpRequest 的 upload.onprogress，在不改变接口或 multipart 格式的前提下反馈进度。
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    const analyticsOperationId = crypto.randomUUID()
    const analyticsStartedAt = performance.now()
    let analyticsReported = false
    const reportUpload = (reason: 'success' | 'failed' | 'timeout' | 'cancelled') => {
      if (analyticsReported || !options?.adminToken) return
      analyticsReported = true
      void fetchJson('/api/v1/admin/analytics/upload-finished', { method: 'POST', body: JSON.stringify({ operationId: analyticsOperationId, reason, durationMs: Math.round(performance.now() - analyticsStartedAt), logicalBytes: file.size, retryCount: 0, appBuild: import.meta.env.VITE_APP_BUILD ?? 'development' }) }, { adminToken: options.adminToken }).catch(() => undefined)
    }
    let confirmationTimeoutId: number | null = null
    let confirmationTimedOut = false

    const clearConfirmationTimeout = () => {
      if (confirmationTimeoutId !== null) {
        window.clearTimeout(confirmationTimeoutId)
        confirmationTimeoutId = null
      }
    }

    const reportProgress = (
      loaded: number,
      total: number | null,
      phase: FileUploadProgress['phase'],
    ) => {
      const resolvedTotal = total && total > 0 ? total : file.size || null
      options?.onProgress?.({
        phase,
        loaded,
        total: resolvedTotal,
        percent:
          resolvedTotal && resolvedTotal > 0
            ? Math.min(100, Math.round((loaded / resolvedTotal) * 100))
            : null,
      })
    }

    request.upload.onprogress = (event) => {
      reportProgress(
        event.loaded,
        event.lengthComputable && event.total > 0 ? event.total : null,
        'sending',
      )
    }
    request.upload.onload = () => {
      // 请求体已发送完毕，但请求本身尚未完成：服务端仍可能在校验或写入对象存储。
      reportProgress(file.size, file.size, 'confirming')
      // 网络发送已经完成后只等待服务器确认；设置独立上限，避免对象存储或代理异常时
      // 页面永久停留在 Pending。慢速上行不受此计时器影响。
      confirmationTimeoutId = window.setTimeout(() => {
        confirmationTimedOut = true
        request.abort()
      }, 180_000)
    }
    request.onload = () => {
      clearConfirmationTimeout()
      let body: T | ApiErrorBody | undefined
      try {
        body = request.responseText
          ? (JSON.parse(request.responseText) as T | ApiErrorBody)
          : undefined
      } catch {
        body = undefined
      }

      if (request.status >= 200 && request.status < 300) {
        if (body === undefined) {
          reportUpload('failed')
          reject(new Error('上传接口返回了无法识别的响应'))
          return
        }
        reportUpload('success')
        resolve(body as T)
        return
      }

      reportUpload('failed')
      reportUnauthorizedIfNeeded(request.status, options)
      reject(
        new ApiClientError(
          formatApiError(body as ApiErrorBody | undefined, request.status),
          request.status,
        ),
      )
    }
    request.onerror = () => {
      reportUpload('failed')
      clearConfirmationTimeout()
      reject(new Error('上传请求失败，请检查网络后重试'))
    }
    request.onabort = () => {
      reportUpload(confirmationTimedOut ? 'timeout' : 'cancelled')
      clearConfirmationTimeout()
      reject(new Error(confirmationTimedOut ? '服务器保存文件超时，请稍后重试' : '上传已取消'))
    }

    request.open('POST', apiUrl(path))
    if (options?.adminToken) {
      request.setRequestHeader('authorization', `Bearer ${options.adminToken}`)
    }
    // 不手动设置 Content-Type，让浏览器带上 multipart boundary。
    request.send(formData)
  })
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
  setAnalyticsCoverage: (coverage: Record<string, unknown>, adminToken: string) => fetchJson('/api/v1/admin/analytics/coverage', { method: 'POST', body: JSON.stringify(coverage) }, { adminToken }),
  getAnalyticsReport: <T,>(kind: string, query: string, adminToken: string) => fetchJson<T>(`/api/v1/admin/analytics/${kind}?${query}`, undefined, { adminToken }),
  setAnalyticsInternal: (userId: number, isInternal: boolean, adminToken: string) => fetchJson(`/api/v1/admin/analytics/internal/${userId}`, { method: 'PUT', body: JSON.stringify({ isInternal }) }, { adminToken }),
  downloadAnalyticsCsv: async (kind: string, query: string, adminToken: string) => {
    const response = await fetch(apiUrl(`/api/v1/admin/analytics/${kind}?${query}&format=csv`), { headers: { Authorization: `Bearer ${adminToken}` } })
    if (!response.ok) throw new Error('Export unavailable')
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `analytics-${kind}.csv`; link.click(); URL.revokeObjectURL(url)
  },

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
      status?: 'draft' | 'proofread' | 'published' | 'archived'
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
  getOpenContentApiKeys: (adminToken: string) =>
    fetchJson<{ items: AdminOpenContentApiKey[] }>(
      '/api/v1/admin/open-content/api-keys',
      { method: 'GET' },
      { adminToken },
    ),
  createOpenContentApiKey: (
    request: CreateOpenContentApiKeyRequest,
    adminToken: string,
  ) =>
    fetchApiResult<CreateOpenContentApiKeyResponse>(
      '/api/v1/admin/open-content/api-keys',
      { method: 'POST', body: JSON.stringify(request) },
      { adminToken },
    ),
  updateOpenContentApiKey: (
    apiKeyId: number,
    request: UpdateOpenContentApiKeyRequest,
    adminToken: string,
  ) =>
    fetchApiResult<AdminOpenContentApiKey>(
      `/api/v1/admin/open-content/api-keys/${apiKeyId}`,
      { method: 'PUT', body: JSON.stringify(request) },
      { adminToken },
    ),
  deleteOpenContentApiKey: (apiKeyId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/open-content/api-keys/${apiKeyId}`,
      { method: 'DELETE' },
      { adminToken },
    ),
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
  changeAdminPassword: (request: ChangeAdminPasswordRequest, adminToken: string) =>
    fetchApiResult<AdminUser>(
      '/api/v1/admin/auth/password',
      { method: 'PUT', body: JSON.stringify(request) },
      { adminToken },
    ),
  changeOwnAdminDisplayName: (displayName: string, adminToken: string) =>
    fetchApiResult<AdminUser>(
      '/api/v1/admin/auth/display-name',
      { method: 'PUT', body: JSON.stringify({ displayName }) },
      { adminToken },
    ),
  bindOwnLearnerAccount: (request: { learnerEmail: string; learnerPassword: string }, adminToken: string) =>
    fetchApiResult<AdminUser>(
      '/api/v1/admin/auth/learner-binding',
      { method: 'PUT', body: JSON.stringify(request) },
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
  getMySubtitleReviewTasks: (adminToken: string) =>
    fetchJson<{ items: AdminReviewTask[] }>(
      '/api/v1/admin/subtitle-review-tasks',
      { method: 'GET' },
      { adminToken },
    ),
  getMySubtitleWorkflowInbox: (adminToken: string) =>
    fetchJson<AdminSubtitleWorkflowTaskInbox>(
      '/api/v1/admin/subtitle-workflow-inbox',
      { method: 'GET' },
      { adminToken },
    ),
  getMyWorkflowNotifications: (adminToken: string) =>
    fetchJson<AdminWorkflowNotifications>(
      '/api/v1/admin/workflow-notifications',
      { method: 'GET' },
      { adminToken },
    ),
  getClaimableWorkflowTasks: (
    adminToken: string,
    options: {
      page?: number
      pageSize?: number
      groupId?: number
      categoryId?: number
    } = {},
  ) => {
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 20),
    })
    if (options.groupId) params.set('groupId', String(options.groupId))
    if (options.categoryId) params.set('categoryId', String(options.categoryId))
    return fetchJson<ClaimableWorkflowTaskPage>(
      `/api/v1/admin/workflow/claimable-tasks?${params.toString()}`,
      { method: 'GET' },
      { adminToken },
    )
  },
  claimWorkflowTask: (exerciseId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/workflow-claim`,
      { method: 'POST' },
      { adminToken },
    ),
  releaseWorkflowTask: (exerciseId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/workflow-release`,
      { method: 'POST' },
      { adminToken },
    ),
  getWorkflowOverview: (adminToken: string) =>
    fetchJson<AdminWorkflowOverview>(
      '/api/v1/admin/workflow/overview',
      { method: 'GET' },
      { adminToken },
    ),
  updateExerciseClaimAvailability: (
    exerciseId: number,
    claimBlocked: boolean,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse & { exerciseId: number; claimBlocked: boolean }>(
      `/api/v1/admin/exercises/${exerciseId}/claim-availability`,
      { method: 'PUT', body: JSON.stringify({ claimBlocked }) },
      { adminToken },
    ),
  getWorkflowActivity: (
    adminToken: string,
    options: {
      page?: number
      pageSize?: number
      memberId?: number
      eventType?: AdminWorkflowActivityType
    } = {},
  ) => {
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      pageSize: String(options.pageSize ?? 20),
    })
    if (options.memberId) params.set('memberId', String(options.memberId))
    if (options.eventType) params.set('eventType', options.eventType)
    return fetchJson<AdminWorkflowActivityPage>(
      `/api/v1/admin/workflow-activity?${params.toString()}`,
      { method: 'GET' },
      { adminToken },
    )
  },
  markWorkflowNotificationsRead: (adminToken: string, notificationIds?: number[]) =>
    fetchJson<AdminContentResponse>(
      '/api/v1/admin/workflow-notifications/read',
      { method: 'PUT', body: JSON.stringify(notificationIds ? { notificationIds } : {}) },
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
  submitSubtitleDraft: (
    exerciseId: number,
    lines: CreateTranscriptLineRequest[],
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/subtitle-drafts/submit`,
      { method: 'POST', body: JSON.stringify({ lines }) },
      { adminToken },
    ),
  approveSubtitleDraft: (draftId: number, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/subtitle-drafts/${draftId}/approve`,
      { method: 'POST' },
      { adminToken },
    ),
  returnSubtitleDraft: (draftId: number, reviewNote: string, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/subtitle-drafts/${draftId}/return`,
      { method: 'POST', body: JSON.stringify({ reviewNote }) },
      { adminToken },
    ),
  revertPublishedSubtitle: (exerciseId: number, reason: string, adminToken: string) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/exercises/${exerciseId}/subtitle-revert`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      { adminToken },
    ),
  getExerciseSubtitleVersions: (exerciseId: number, adminToken: string) =>
    fetchJson<{ items: ExerciseSubtitleVersion[] }>(
      `/api/v1/admin/exercises/${exerciseId}/subtitle-versions`,
      { method: 'GET' },
      { adminToken },
    ),
  getAdminMembers: (adminToken: string) =>
    fetchJson<{ items: AdminMember[] }>(
      '/api/v1/admin/collaboration/members',
      { method: 'GET' },
      { adminToken },
    ),
  searchLearnerUsers: (search: string, adminToken: string) =>
    fetchJson<{ items: Array<{ id: number; email: string; displayName: string; boundAdminMemberId?: number; boundAdminDisplayName?: string }>; search: string }>(
      `/api/v1/admin/collaboration/learner-users?search=${encodeURIComponent(search)}`,
      { method: 'GET' }, { adminToken },
    ),
  updateContributorLearnerBinding: (memberId: number, learnerUserId: number | null, adminToken: string) =>
    fetchJson<{ ok: true; learnerUserId: number | null }>(
      `/api/v1/admin/collaboration/members/${memberId}/learner-binding`,
      { method: 'PUT', body: JSON.stringify({ learnerUserId }) }, { adminToken },
    ),
  createAdminMember: (request: CreateAdminMemberRequest, adminToken: string) =>
    fetchJson<{ ok: true, member: AdminMemberProvisioning }>(
      '/api/v1/admin/collaboration/members',
      { method: 'POST', body: JSON.stringify(request) },
      { adminToken },
    ),
  updateAdminMemberAssignments: (
    memberId: number,
    exerciseIds: number[],
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/collaboration/members/${memberId}/assignments`,
      { method: 'PUT', body: JSON.stringify({ exerciseIds }) },
      { adminToken },
    ),
  updateExerciseWorkflowAssignee: (
    exerciseId: number,
    workflowRole: 'proofreader' | 'second_reviewer',
    adminUserId: number | undefined,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse & { adminUserId: number | null }>(
      `/api/v1/admin/exercises/${exerciseId}/workflow-assignees/${workflowRole}`,
      { method: 'PUT', body: JSON.stringify({ adminUserId: adminUserId ?? null }) },
      { adminToken },
    ),
  resetAdminMemberPassword: (
    memberId: number,
    adminToken: string,
  ) =>
    fetchJson<{ ok: true, member: AdminMemberProvisioning }>(
      `/api/v1/admin/collaboration/members/${memberId}/password`,
      { method: 'PUT' },
      { adminToken },
    ),
  updateAdminMemberProfile: (memberId: number, profile: { email: string; displayName: string; role: AdminUser['role'] }, adminToken: string) =>
    fetchJson<{ ok: true; member: { id: number; email: string; displayName: string; role: AdminUser['role'] } }>(
      `/api/v1/admin/collaboration/members/${memberId}/profile`,
      { method: 'PUT', body: JSON.stringify(profile) },
      { adminToken },
    ),
  setAdminMemberActive: (memberId: number, isActive: boolean, adminToken: string) =>
    fetchJson<{ ok: true; isActive: boolean }>(
      `/api/v1/admin/collaboration/members/${memberId}/status`,
      { method: 'PUT', body: JSON.stringify({ isActive }) },
      { adminToken },
    ),
  revokeAdminMemberSessions: (memberId: number, adminToken: string) =>
    fetchJson<{ ok: true }>(
      `/api/v1/admin/collaboration/members/${memberId}/sessions/revoke`,
      { method: 'POST' },
      { adminToken },
    ),
  forceAdminMemberPasswordChange: (memberId: number, adminToken: string) =>
    fetchJson<{ ok: true }>(
      `/api/v1/admin/collaboration/members/${memberId}/force-password-change`,
      { method: 'PUT' },
      { adminToken },
    ),
  resetContributorDisplayNameCooldown: (memberId: number, adminToken: string) =>
    fetchJson<{ ok: true }>(
      `/api/v1/admin/collaboration/members/${memberId}/display-name-cooldown/reset`,
      { method: 'PUT' },
      { adminToken },
    ),
  getPreviewVolunteers: (adminToken: string, search?: string) =>
    fetchJson<{ items: PreviewVolunteer[]; search?: string }>(
      `/api/v1/admin/collaboration/preview-volunteers${search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`,
      { method: 'GET' },
      { adminToken },
    ),
  updatePreviewVolunteer: (
    userId: number,
    isPreviewVolunteer: boolean,
    adminToken: string,
  ) =>
    fetchJson<AdminContentResponse>(
      `/api/v1/admin/collaboration/preview-volunteers/${userId}`,
      { method: 'PUT', body: JSON.stringify({ isPreviewVolunteer }) },
      { adminToken },
    ),
  uploadMedia: (
    file: File,
    adminToken: string,
    onProgress?: (progress: FileUploadProgress) => void,
  ) =>
    uploadFile<MediaUploadResponse>('/api/v1/media/files', file, 'media', {
      adminToken,
      onProgress,
    }),
  uploadImage: (
    file: File,
    adminToken: string,
    onProgress?: (progress: FileUploadProgress) => void,
  ) =>
    uploadFile<ImageUploadResponse>('/api/v1/media/files', file, 'media', {
      adminToken,
      onProgress,
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
  getAdminGrowth: (adminToken: string) =>
    fetchJson<AdminGrowthReport>(
      '/api/v1/admin/analytics/growth',
      {
        method: 'GET',
      },
      { adminToken },
    ),
}
