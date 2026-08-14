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

  return new Error(typeof value === 'string' ? value : JSON.stringify(value))
}

/**
 * Sends device-side failures to Metro through console.error while keeping Expo's
 * original handler installed. The structured prefix makes fatal errors easy to
 * find in the VSCode terminal that is running `expo start`.
 */
export function reportRuntimeError(source: string, value: unknown, isFatal = false) {
  const error = toError(value)
  console.error('[DuolinTing runtime error]', {
    source,
    isFatal,
    name: error.name,
    message: error.message,
    stack: error.stack,
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
    window.addEventListener('unhandledrejection', (event) => {
      reportRuntimeError('unhandledrejection', event.reason)
    })
  }
}
