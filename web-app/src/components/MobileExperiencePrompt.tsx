import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageProvider'

const DISMISSED_STORAGE_KEY = 'duolinting.web.mobile-experience-prompt.dismissed.v1'

/**
 * 只用浏览器 UA 判断真实手机/平板，不能用屏幕宽度：桌面端缩窄窗口时仍应使用
 * Web 布局。部署地址由构建变量注入；生产缺失配置时宁可不显示，也不猜测域名。
 */
function isMobileBrowser() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
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
  const [mobileAppUrl] = useState(getMobileAppUrl)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!mobileAppUrl || !isMobileBrowser()) return
    if (window.localStorage.getItem(DISMISSED_STORAGE_KEY) === '1') return
    setOpen(true)
  }, [mobileAppUrl])

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1')
    setOpen(false)
  }

  const openMobileApp = () => {
    // from=web 只作来源标识，不传递登录 token、用户信息或当前 URL，
    // 保持两个端的认证存储边界清晰。
    const target = new URL(mobileAppUrl)
    target.searchParams.set('from', 'web')
    window.location.assign(target.toString())
  }

  if (!mobileAppUrl) return null

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
              {t('mobileExperience.open')}
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
