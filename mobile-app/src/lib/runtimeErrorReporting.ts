import { Platform } from 'react-native'
import { runtimeConfig } from './runtimeConfig'

type ErrorUtilsHandler = (error: Error, isFatal?: boolean) => void

type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorUtilsHandler
  setGlobalHandler?: (handler: ErrorUtilsHandler) => void
}

type ErrorUtilsGlobal = typeof globalThis & {
  ErrorUtils?: ErrorUtilsLike
  __duolintingRuntimeErrorReportingInstalled?: boolean
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }

  try {
    return new Error(typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    return new Error('Unknown runtime error')
  }
}

const recentReports = new Map<string, number>()

// Runtime exceptions can include URLs, tokens, or a learner's email. Send only a
// bounded, redacted diagnostic excerpt through the operational error endpoint.
const redact = (value: string, maxLength: number) => value
  .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
  .replace(/\b(password|token|secret|api[_-]?key|code)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
  .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
    try {
      const url = new URL(match)
      return `${url.origin}${url.pathname}`
    } catch { return '[url]' }
  })
  .replace(/file:\/\/[^\s"'<>]+/gi, '[file]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[value]')
  .slice(0, maxLength)

export function reportRuntimeError(source: string, value: unknown, isFatal = false, componentStack = '') {
  const error = toError(value)
  const fingerprint = `${error.name}:${error.message}`
  const now = Date.now()
  if ((recentReports.get(fingerprint) ?? 0) > now - 30_000) return
  recentReports.set(fingerprint, now)
  if (recentReports.size > 100) {
    for (const [key, timestamp] of recentReports) {
      if (timestamp < now - 30_000) recentReports.delete(key)
    }
  }

  const routePart = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean)[0] ?? '' : ''
  const route = ['settings', 'study', 'series', 'auth', 'contribute', 'vocabulary'].includes(routePart)
    ? `/${routePart}`
    : routePart ? '/other' : '/'
  const payload = {
    source: redact(source, 64),
    name: redact(error.name || 'Error', 80),
    message: redact(error.message || 'Unknown runtime error', 600),
    stack: redact(`${error.stack ?? ''}\n${componentStack}`, 4000),
    platform: ['web', 'ios', 'android'].includes(Platform.OS) ? Platform.OS : 'web',
    route,
  }

  if (__DEV__) console.error('[DuolinTing runtime error]', { ...payload, isFatal })
  const send = async () => {
    const response = await fetch(`${runtimeConfig.apiBaseUrl}/api/v1/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: Platform.OS === 'web',
    })
    if (response.status >= 500) throw new Error('Runtime report server unavailable')
  }
  void send().catch(() => {
    setTimeout(() => { void send().catch(() => undefined) }, 3_000)
  })
}

export function installRuntimeErrorReporting() {
  const runtime = globalThis as ErrorUtilsGlobal

  if (runtime.__duolintingRuntimeErrorReportingInstalled) {
    return
  }
  runtime.__duolintingRuntimeErrorReportingInstalled = true

  const errorUtils = runtime.ErrorUtils
  const previousHandler = errorUtils?.getGlobalHandler?.()

  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    reportRuntimeError('ErrorUtils', error, isFatal ?? false)
    previousHandler?.(error, isFatal)
  })

  // Browsers dispatch this event for rejected Promises without a catch handler.
  // Native errors are covered by ErrorUtils above, so this is intentionally web-only.
  if (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    window.addEventListener('error', (event) => {
      reportRuntimeError('window.error', event.error ?? event.message, true)
    })
    window.addEventListener('unhandledrejection', (event) => {
      reportRuntimeError('unhandledrejection', event.reason)
    })
  }
}
