import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageProvider'

const MOBILE_VIEWPORT_QUERY = '(max-width: 720px)'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const
const AUTO_REDIRECT_DELAY_MS = 5_000

/**
 * 用户可能使用桌面模式访问移动端浏览器，也可能把电脑窗口缩窄；因此同时
 * 检查设备 UA 和视口宽度。部署地址由构建变量注入，生产缺失时不猜测域名。
 */
function isMobileBrowser() {
  const userAgent = navigator.userAgent
  const hasMultiTouch = navigator.maxTouchPoints > 1
  const isIPadDesktopMode =
    hasMultiTouch && (navigator.platform === 'MacIntel' || /Macintosh/i.test(userAgent))
  // Some iPad browsers expose a desktop UA. Multi-touch plus a tablet-sized
  // viewport catches those devices even when platform strings are reduced.
  const isTabletSizedTouchDevice =
    hasMultiTouch && Math.min(window.innerWidth, window.innerHeight) >= 700

  return (
    isIPadDesktopMode || isTabletSizedTouchDevice ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  )
}

function isLearnerRoute(pathname: string) {
  return pathname === '/' || /^\/courses\/\d+(?:\/chapters\/\d+)?\/?$/.test(pathname)
}

function getMobileRoute(pathname: string) {
  const chapterMatch = pathname.match(/^\/courses\/(\d+)\/chapters\/(\d+)\/?$/)
  if (chapterMatch) {
    const [, seriesId, exerciseId] = chapterMatch
    if (Number.isSafeInteger(Number(seriesId)) && Number(seriesId) > 0 &&
      Number.isSafeInteger(Number(exerciseId)) && Number(exerciseId) > 0) {
      return { pathname: `/study/${seriesId}/${exerciseId}` }
    }
  }

  const seriesMatch = pathname.match(/^\/courses\/(\d+)\/?$/)
  if (seriesMatch && Number.isSafeInteger(Number(seriesMatch[1])) && Number(seriesMatch[1]) > 0) {
    return { pathname: '/', seriesId: seriesMatch[1] }
  }

  return { pathname: '/' }
}

function getMobileAppUrl() {
  const configuredUrl = import.meta.env.VITE_MOBILE_APP_URL?.trim()
  if (configuredUrl) return configuredUrl

  // Expo 的本地 Web 开发服务器固定在 8103；仅开发环境提供此兜底，
  // 防止生产漏配变量时把用户导向不存在的端口。
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8103`
  }

  return ''
}

export function MobileExperiencePrompt() {
  const { t } = useLanguage()
  const location = useLocation()
  const [mobileAppUrl] = useState(getMobileAppUrl)
  const [isMobileOrNarrow, setIsMobileOrNarrow] = useState(false)
  const [open, setOpen] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_REDIRECT_DELAY_MS / 1000)
  const dismissedInSession = useRef(false)

  useEffect(() => {
    const updateViewportEligibility = () => {
      setIsMobileOrNarrow(
        isMobileBrowser() || window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
      )
    }

    updateViewportEligibility()
    window.addEventListener('resize', updateViewportEligibility, { passive: true })
    return () => window.removeEventListener('resize', updateViewportEligibility)
  }, [])

  useEffect(() => {
    if (!mobileAppUrl || !isMobileOrNarrow || !isLearnerRoute(location.pathname)) {
      setOpen(false)
      return
    }
    if (dismissedInSession.current) return

    const timer = window.setTimeout(() => setOpen(true), 700)
    return () => window.clearTimeout(timer)
  }, [isMobileOrNarrow, location.pathname, mobileAppUrl])

  const dismiss = () => {
    dismissedInSession.current = true
    setOpen(false)
  }

  const openMobileApp = useCallback(() => {
    // Only content IDs and approved attribution fields cross the app boundary;
    // authentication tokens, user data, and the original URL are never forwarded.
    const target = new URL(mobileAppUrl)
    const mobileRoute = getMobileRoute(location.pathname)
    target.pathname = mobileRoute.pathname
    target.searchParams.set('from', 'web')
    if (mobileRoute.seriesId) target.searchParams.set('seriesId', mobileRoute.seriesId)

    // UTM values are allowlisted and validated before transfer so unrelated query
    // parameters (which may contain private data) never reach the mobile app.
    const currentParams = new URLSearchParams(window.location.search)
    for (const key of UTM_KEYS) {
      const value = currentParams.get(key)?.trim()
      if (value && /^[\p{L}\p{N}_. -]{1,100}$/u.test(value)) {
        target.searchParams.set(key, value)
      }
    }
    // Give referrals without an existing campaign a consistent analytics source.
    if (!target.searchParams.has('utm_source')) {
      target.searchParams.set('utm_source', 'duolinting-web')
    }
    if (!target.searchParams.has('utm_medium')) {
      target.searchParams.set('utm_medium', 'mobile-experience-prompt')
    }

    dismissedInSession.current = true
    window.location.assign(target.toString())
  }, [location.pathname, mobileAppUrl])

  useEffect(() => {
    if (!open) {
      setSecondsRemaining(AUTO_REDIRECT_DELAY_MS / 1000)
      return
    }

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, Math.ceil((AUTO_REDIRECT_DELAY_MS - elapsed) / 1000))
      setSecondsRemaining(remaining)
      if (remaining === 0) {
        window.clearInterval(timer)
        openMobileApp()
      }
    }, 50)

    return () => window.clearInterval(timer)
  }, [open, openMobileApp])

  if (!mobileAppUrl || !isLearnerRoute(location.pathname)) return null

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-experience-overlay" />
        <Dialog.Content className="mobile-experience-dialog">
          <Dialog.Close asChild>
            <button
              aria-label={t('mobileExperience.close')}
              className="mobile-experience-close"
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </Dialog.Close>
          <div className="mobile-experience-icon" aria-hidden="true">
            <Smartphone size={29} strokeWidth={2.5} />
          </div>
          <p className="mobile-experience-eyebrow">{t('mobileExperience.eyebrow')}</p>
          <Dialog.Title className="mobile-experience-title">
            {t('mobileExperience.title')}
          </Dialog.Title>
          <Dialog.Description className="mobile-experience-description">
            {t('mobileExperience.description')}
          </Dialog.Description>
          <div className="mobile-experience-actions">
            <button className="mobile-experience-stay" onClick={dismiss} type="button">
              {t('mobileExperience.stay')}
            </button>
            <button className="mobile-experience-open" onClick={openMobileApp} type="button">
              <span aria-hidden="true" className="mobile-experience-open-progress" />
              <span className="mobile-experience-open-label">
                {t('mobileExperience.countdown', { seconds: secondsRemaining })}
              </span>
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
