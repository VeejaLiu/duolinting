export type AdminLogDetails = Record<string, unknown>

// 管理端关键工作流日志在生产环境也保留，便于现场复现后直接从浏览器控制台复制。
// 调用方只应传入可诊断的业务上下文，不要传管理员 token、文件正文或完整私有地址。
const adminLog = (
  level: 'info' | 'warn' | 'error',
  scope: string,
  event: string,
  details?: AdminLogDetails,
) => {
  const prefix = `[DuolinTing Admin][${scope}]`
  const payload = {
    at: new Date().toISOString(),
    ...details,
  }

  if (level === 'error') {
    console.error(prefix, event, payload)
  } else if (level === 'warn') {
    console.warn(prefix, event, payload)
  } else {
    console.info(prefix, event, payload)
  }
}

export const logAdminInfo = (scope: string, event: string, details?: AdminLogDetails) => {
  adminLog('info', scope, event, details)
}

export const logAdminWarn = (scope: string, event: string, details?: AdminLogDetails) => {
  adminLog('warn', scope, event, details)
}

export const logAdminError = (scope: string, event: string, details?: AdminLogDetails) => {
  adminLog('error', scope, event, details)
}

export const createAdminOperationId = (prefix: string) => (
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
)

export const getAdminErrorDetails = (error: unknown): AdminLogDetails => (
  error instanceof Error
    ? {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      }
    : { error: String(error) }
)
