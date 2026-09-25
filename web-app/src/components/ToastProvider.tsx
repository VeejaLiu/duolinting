import {
  AlertCircle,
  CheckCircle2,
  Info,
  Sparkles,
  X,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from 'react'
import { useLanguage } from '../i18n/LanguageProvider'
import '../styles/toast.css'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

type ToastOptions = {
  message: string
  title?: string
  tone?: ToastTone
  durationMs?: number
}

type ActiveToast = Required<Pick<ToastOptions, 'message' | 'tone' | 'durationMs'>> & {
  id: number
  title?: string
}

type ToastContextValue = {
  dismissToast: () => void
  showToast: (options: ToastOptions | string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: Sparkles,
} satisfies Record<ToastTone, typeof Info>

export function ToastProvider({ children }: PropsWithChildren) {
  const { t } = useLanguage()
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const nextId = useRef(0)
  const timeoutRef = useRef<number | null>(null)

  const dismissToast = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setToast(null)
  }, [])

  const showToast = useCallback((options: ToastOptions | string) => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    const normalized: ToastOptions = typeof options === 'string' ? { message: options } : options
    const activeToast: ActiveToast = {
      id: ++nextId.current,
      message: normalized.message,
      title: normalized.title,
      tone: normalized.tone ?? 'info',
      durationMs: normalized.durationMs ?? 3200,
    }
    setToast(activeToast)
    timeoutRef.current = window.setTimeout(() => {
      setToast((current) => current?.id === activeToast.id ? null : current)
      timeoutRef.current = null
    }, activeToast.durationMs)
  }, [])

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
  }, [])

  const Icon = toast ? toneIcon[toast.tone] : Info
  const progressStyle = toast
    ? ({ '--toast-duration': `${toast.durationMs}ms` } as CSSProperties)
    : undefined

  return (
    <ToastContext.Provider value={{ dismissToast, showToast }}>
      {children}
      <div aria-live="polite" className="toast-viewport" aria-atomic="true">
        {toast && (
          <section
            className={`app-toast app-toast-${toast.tone}`}
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="app-toast-icon" aria-hidden="true">
              <Icon size={21} strokeWidth={2.7} />
            </div>
            <div className="app-toast-copy">
              {toast.title && <strong>{toast.title}</strong>}
              <span>{toast.message}</span>
            </div>
            <button aria-label={t('toast.dismiss')} onClick={dismissToast} type="button">
              <X size={16} aria-hidden="true" />
            </button>
            <i className="app-toast-progress" style={progressStyle} aria-hidden="true" />
          </section>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
