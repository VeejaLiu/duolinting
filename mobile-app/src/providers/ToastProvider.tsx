import { FontAwesome6 } from '@expo/vector-icons'
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'

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

const toneStyles = {
  success: { accent: '#58cc02', soft: '#effbe7', icon: 'circle-check' },
  error: { accent: '#ff7043', soft: '#fff0eb', icon: 'circle-exclamation' },
  info: { accent: '#1cb0f6', soft: '#eaf7ff', icon: 'circle-info' },
  warning: { accent: '#ffb020', soft: '#fff7df', icon: 'wand-magic-sparkles' },
} as const

export function ToastProvider({ children }: PropsWithChildren) {
  const { t } = useLanguage()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const translateY = useRef(new Animated.Value(-24)).current
  const opacity = useRef(new Animated.Value(0)).current
  const nextId = useRef(0)
  const activeId = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const dismissToast = useCallback(() => {
    clearTimer()
    const closingId = activeId.current
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 150, useNativeDriver: true }),
    ]).start(() => setToast((current) => current?.id === closingId ? null : current))
  }, [clearTimer, opacity, translateY])

  const showToast = useCallback((options: ToastOptions | string) => {
    clearTimer()
    const normalized: ToastOptions = typeof options === 'string' ? { message: options } : options
    const activeToast: ActiveToast = {
      id: ++nextId.current,
      message: normalized.message,
      title: normalized.title,
      tone: normalized.tone ?? 'info',
      durationMs: normalized.durationMs ?? 3200,
    }
    activeId.current = activeToast.id
    setToast(activeToast)
    translateY.setValue(-24)
    opacity.setValue(0)
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 17, stiffness: 220, mass: 0.7, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start()
    AccessibilityInfo.announceForAccessibility(
      activeToast.title ? `${activeToast.title}. ${activeToast.message}` : activeToast.message,
    )
    timeoutRef.current = setTimeout(() => dismissToast(), activeToast.durationMs)
  }, [clearTimer, dismissToast, opacity, translateY])

  useEffect(() => () => clearTimer(), [clearTimer])

  const tone = toast ? toneStyles[toast.tone] : toneStyles.info

  return (
    <ToastContext.Provider value={{ dismissToast, showToast }}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.viewport, { paddingTop: insets.top + 10 }]}>
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              { borderColor: tone.accent, opacity, transform: [{ translateY }] },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: tone.soft, borderColor: tone.accent }]}>
              <FontAwesome6 color={tone.accent} name={tone.icon} size={20} />
            </View>
            <View style={styles.copy}>
              {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
              <Text style={styles.message}>{toast.message}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={dismissToast}
              style={styles.close}
            >
              <FontAwesome6 color="#718096" name="xmark" size={15} />
            </Pressable>
            <View style={[styles.accent, { backgroundColor: tone.accent }]} />
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}

const styles = StyleSheet.create({
  viewport: {
    left: 10,
    position: 'absolute',
    right: 10,
    top: 0,
    zIndex: 1000,
  },
  toast: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    borderWidth: 2,
    elevation: 10,
    flexDirection: 'row',
    minHeight: 68,
    overflow: 'hidden',
    paddingBottom: 13,
    paddingHorizontal: 12,
    paddingTop: 11,
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  copy: {
    flex: 1,
    marginLeft: 11,
    minWidth: 0,
  },
  title: {
    color: '#172033',
    fontSize: 14,
    fontWeight: '900',
  },
  message: {
    color: '#52637a',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 2,
  },
  close: {
    alignItems: 'center',
    backgroundColor: '#f5f9fc',
    borderRadius: 11,
    height: 32,
    justifyContent: 'center',
    marginLeft: 8,
    width: 32,
  },
  accent: {
    bottom: 0,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
  },
})
