import type {
  AcceptedAnswerFeedbackListResponse,
  AdminContentResponse,
  AdminAuthResponse,
  AdminExercisePage,
  AdminLoginRequest,
  AdminGrowthReport,
  AdminMember,
  AdminMemberProvisioning,
  AdminUser,
  AdminReviewTask,
  AdminSubtitleWorkflowTaskInbox,
  AdminWorkflowActivityPage,
  AdminWorkflowActivityType,
  AdminWorkflowNotifications,
  ChangeAdminPasswordRequest,
  CreateAdminMemberRequest,
  CatalogExerciseSummary,
  CatalogResponse,
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
  CreateExerciseRequest,
  CreateTranscriptLineRequest,
  ImageUploadResponse,
  ListeningExercise,
  PreviewVolunteer,
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

export type FileUploadProgress = {
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
    onProgress?: (progress: FileUploadProgress) => void
  },
): Promise<T> => {
  const formData = new FormData()
  formData.append(fieldName, file)

  // fetch 目前不会暴露浏览器上传请求体的进度事件。媒体文件可能较大，因此这里使用
  // XMLHttpRequest 的 upload.onprogress，在不改变接口或 multipart 格式的前提下反馈进度。
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()

    const reportProgress = (loaded: number, total: number | null) => {
      const resolvedTotal = total && total > 0 ? total : file.size || null
      options?.onProgress?.({
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
      )
    }
    request.upload.onload = () => {
      // 请求体已发送完毕，但请求本身尚未完成：服务端仍可能在校验或写入对象存储。
      reportProgress(file.size, file.size)
    }
    request.onload = () => {
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
          reject(new Error('上传接口返回了无法识别的响应'))
          return
        }
        resolve(body as T)
        return
      }

      reject(
        new Error(
          formatApiError(body as ApiErrorBody | undefined, request.status),
        ),
      )
    }
    request.onerror = () => reject(new Error('上传请求失败，请检查网络后重试'))
    request.onabort = () => reject(new Error('上传已取消'))

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
  getAdminMembers: (adminToken: string) =>
    fetchJson<{ items: AdminMember[] }>(
      '/api/v1/admin/collaboration/members',
      { method: 'GET' },
      { adminToken },
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
  getPreviewVolunteers: (adminToken: string) =>
    fetchJson<{ items: PreviewVolunteer[] }>(
      '/api/v1/admin/collaboration/preview-volunteers',
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
