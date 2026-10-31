import { clearCourseListCache } from './lib/courseListCache'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Alert, App as AntdApp, Button, Spin } from 'antd'
import { Navigate, Route, Routes } from 'react-router-dom'
import type {
  AdminUser,
  CatalogExerciseSummary,
  ExerciseCategory,
  MaterialCategory,
} from '@duolinting/shared'
import './App.css'
import { ContentAdmin } from './components/ContentAdmin'
import {
  AdminConfirmDialog,
  type AdminNoticeTone,
} from './components/admin/AdminFeedback'
import { apiClient, setUnauthorizedHandler } from './lib/apiClient'
import { createAdminSessionVerifier } from './lib/adminSession'
import {
  ADMIN_TOKEN_STORAGE_KEY,
  ADMIN_USER_STORAGE_KEY,
} from './lib/contentTools'
import { adminUiLocaleLabels, useAdminLanguage } from './i18n/AdminLanguageProvider'

const loadStoredAdminUser = () => {
  const raw = localStorage.getItem(ADMIN_USER_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AdminUser
  } catch {
    return null
  }
}

function App() {
  const { message: appMessage } = AntdApp.useApp()
  const { t, uiLocale, setUiLocale } = useAdminLanguage()
  const [categoryGroups, setCategoryGroups] = useState<MaterialCategory[]>([])
  const [categories, setCategories] = useState<ExerciseCategory[]>([])
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [exercises, setExercises] = useState<CatalogExerciseSummary[]>([])
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '',
  )
  const [adminUser, setAdminUser] = useState<AdminUser | null>(
    loadStoredAdminUser,
  )
  // Cached credentials are only a hint until /auth/me has verified this boot.
  // After a successful login, transient retries must keep the editor mounted.
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false)
  const [sessionVerification, setSessionVerification] = useState<'checking' | 'verified' | 'network' | 'server'>(
    adminToken ? 'checking' : 'verified',
  )
  const activeAdminTokenRef = useRef(adminToken)
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [confirmState, setConfirmState] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    alternateLabel?: string
    tone?: 'danger' | 'default'
  }>({
    open: false,
    title: '',
    message: '',
  })
  const confirmResolverRef = useRef<((value: boolean | 'discard') => void) | null>(null)
  const catalogRequestSerialRef = useRef(0)
  // 退出登录前的保存确认钩子，由 ContentAdmin 注册（制课工作台有未保存修改时先确认保存）
  const beforeLogoutRef = useRef<(() => Promise<boolean>) | null>(null)

  const isAuthenticated = Boolean(adminToken && adminUser && hasVerifiedSession)

  // 清空本地管理员会话（token 过期或主动退出时调用），回到登录页
  const clearAdminSession = () => {
    activeAdminTokenRef.current = ''
    sessionVerifier.cancel()
    catalogRequestSerialRef.current += 1
    clearCourseListCache()
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    localStorage.removeItem(ADMIN_USER_STORAGE_KEY)
    setAdminToken('')
    setAdminUser(null)
    setHasVerifiedSession(false)
    setSessionVerification('verified')
  }

  const showNotice = useCallback((content: string, tone: AdminNoticeTone = 'info') => {
    const duration = tone === 'error' ? 5.2 : 3.2
    appMessage[tone]({ content, duration })
  }, [appMessage])

  // 仅当前 token 的 401 会使会话失效；旧请求不能清空之后重新登录的会话。
  // 用 ref 持有最新的清会话/提示函数，避免 effect 依赖项随渲染漂移。
  const sessionExpiredNotifiedRef = useRef(false)
  const handleSessionExpiredRef = useRef<() => void>(() => {})
  handleSessionExpiredRef.current = () => {
    clearAdminSession()
    // 并发多个请求同时 401 时，只提示一次，避免刷屏。
    if (!sessionExpiredNotifiedRef.current) {
      sessionExpiredNotifiedRef.current = true
      showNotice(t('管理员登录已过期，请重新登录'), 'error')
    }
  }

  const [sessionVerifier] = useState(() => createAdminSessionVerifier({
    readToken: () => activeAdminTokenRef.current,
    loadUser: (token: string) => apiClient.getCurrentAdmin(token),
    onChecking: () => setSessionVerification('checking'),
    onVerified: (user: AdminUser) => {
      // Always use the server's current role rather than a stale cached role.
      localStorage.setItem(ADMIN_USER_STORAGE_KEY, JSON.stringify(user))
      setAdminUser(user)
      setHasVerifiedSession(true)
      setSessionVerification('verified')
    },
    onUnavailable: (kind) => setSessionVerification(kind),
    onExpired: () => handleSessionExpiredRef.current(),
  }))

  useEffect(() => {
    setUnauthorizedHandler((token) => sessionVerifier.expire(token))
    return () => setUnauthorizedHandler(null)
  }, [sessionVerifier])

  const requestConfirm = (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current = (result) => resolve(result === true)
      setConfirmState({
        open: true,
        ...options,
      })
    })

  const requestUnsavedLeaveConfirm = () =>
    new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
      confirmResolverRef.current = (result) => {
        resolve(result === true ? 'save' : result === 'discard' ? 'discard' : 'cancel')
      }
      setConfirmState({
        open: true,
        title: t('保存课程后离开？'),
        message: t('当前制课工作台里还有未保存的课程信息或字幕。请选择保存后离开，或放弃当前修改直接离开。'),
        confirmLabel: t('保存并离开'),
        cancelLabel: t('继续编辑'),
        alternateLabel: t('放弃修改并离开'),
        tone: 'danger',
      })
    })

  const closeConfirm = (confirmed: boolean | 'discard') => {
    setConfirmState((current) => ({
      ...current,
      open: false,
    }))
    confirmResolverRef.current?.(confirmed)
    confirmResolverRef.current = null
  }

  // 目录按账号缓存一分钟；写入后的 refreshCatalog 仍强制刷新，避免缓存掩盖修改。
  const catalogCacheRef = useRef<{ token: string; loadedAt: number; pending?: Promise<void> }>({ token: '', loadedAt: 0 })
  const refreshCatalog = useCallback(async (force = true) => {
    const requestSerial = ++catalogRequestSerialRef.current
    const catalog = await apiClient.getAdminCatalog(adminToken)
    if (requestSerial !== catalogRequestSerialRef.current) {
      return
    }
    setCategoryGroups(catalog.categoryGroups)
    setCategories(catalog.categories)
    catalogCacheRef.current = { token: adminToken, loadedAt: Date.now() }
    if (force) {
      clearCourseListCache()
      setCatalogRevision((revision) => revision + 1)
    }
  }, [adminToken])

  const ensureCatalog = useCallback(() => {
    const cached = catalogCacheRef.current
    if (cached.token === adminToken) {
      if (cached.pending) return cached.pending
      if (Date.now() - cached.loadedAt < 60_000) return Promise.resolve()
    }
    const pending = refreshCatalog(false).finally(() => {
      if (catalogCacheRef.current.pending === pending) catalogCacheRef.current.pending = undefined
    })
    catalogCacheRef.current = { token: adminToken, loadedAt: 0, pending }
    return pending
  }, [adminToken, refreshCatalog])

  const loadExercises = useCallback(async () => {
    const nextExercises = await apiClient.getAdminExercises(adminToken)
    setExercises(nextExercises)
    return nextExercises
  }, [adminToken])

  useEffect(() => {
    if (adminToken) void sessionVerifier.check(adminToken)
    return () => sessionVerifier.cancel()
  }, [adminToken, sessionVerifier])

  const login = async () => {
    setIsLoggingIn(true)
    try {
      const result = await apiClient.adminLogin(loginForm)
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, result.token)
      localStorage.setItem(ADMIN_USER_STORAGE_KEY, JSON.stringify(result.user))
      sessionVerifier.cancel()
      activeAdminTokenRef.current = result.token
      setAdminToken(result.token)
      setAdminUser(result.user)
      setHasVerifiedSession(true)
      setSessionVerification('verified')
      sessionExpiredNotifiedRef.current = false
      showNotice(t('管理员已登录'), 'success')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : t('登录失败'), 'error')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const logout = async () => {
    // 制课工作台有未保存修改时，先走与切换工作区相同的保存确认，放弃则留在当前页
    const canLeave = (await beforeLogoutRef.current?.()) ?? true
    if (!canLeave) {
      return
    }

    try {
      await apiClient.adminLogout(adminToken)
    } catch {
      // 即使网络中断也要清理本地凭据；服务端会话还有绝对过期时间兜底。
    }
    clearAdminSession()
    showNotice(t('管理员已退出登录'), 'info')
  }

  const handleLoginSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void login()
  }

  const changeRequiredPassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotice(t('两次输入的新密码不一致'), 'error')
      return
    }
    setIsChangingPassword(true)
    try {
      const updatedUser = await apiClient.changeAdminPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }, adminToken)
      localStorage.setItem(ADMIN_USER_STORAGE_KEY, JSON.stringify(updatedUser))
      setAdminUser(updatedUser)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      showNotice(t('密码已修改，欢迎进入管理后台'), 'success')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : t('密码修改失败'), 'error')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleChangeRequiredPassword: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void changeRequiredPassword()
  }

  const languageSelector = (
    <label className="field login-language-field">
      <span>{t('界面语言')}</span>
      <select
        aria-label={t('界面语言')}
        onChange={(event) => {
          const locale = event.target.value
          if (locale === 'zh-CN' || locale === 'en-US' || locale === 'th-TH' || locale === 'ja-JP' || locale === 'fr-FR' || locale === 'es-ES') setUiLocale(locale)
        }}
        value={uiLocale}
      >
        {(Object.keys(adminUiLocaleLabels) as Array<keyof typeof adminUiLocaleLabels>).map((locale) => (
          <option key={locale} value={locale}>{adminUiLocaleLabels[locale]}</option>
        ))}
      </select>
    </label>
  )


  const loginPage = (
    <main className="app-shell login-shell">
      <section className="login-page" aria-label={t('管理员登录')}>
        <div className="login-brand">
          <img alt="DuolinTing" className="login-brand-logo" src="/duolinting-logo-ear.png" />
          <div className="login-brand-copy">
            <h1>{t('管理后台')}</h1>
            <p>{t('统一内容管理端')}</p>
          </div>
        </div>
        {languageSelector}

        <form className="login-panel" onSubmit={handleLoginSubmit}>
          <div className="login-panel-head">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <h2>{t('管理员登录')}</h2>
              <p>{t('登录后进入内容、课程、媒体与字幕管理工作台。')}</p>
            </div>
          </div>
          <label className="field">
            <span>{t('登录邮箱')}</span>
            <input
              autoComplete="email"
              inputMode="email"
              // 输入框保持文本类型，使尚未迁移邮箱的历史管理员仍可使用旧账号完成登录。
              // 新开通的账号由服务端强制校验为邮箱，正常流程不会受到这一过渡兼容影响。
              type="text"
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="name@example.com"
            />
          </label>
          <label className="field">
            <span>{t('密码')}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder={t('输入管理员密码')}
            />
          </label>
          <button className="command-button" disabled={isLoggingIn} type="submit">
            {isLoggingIn ? t('登录中') : t('登录')}
          </button>
        </form>
      </section>
    </main>
  )

  const requiredPasswordPage = (
    <main className="app-shell login-shell">
      <section className="login-page" aria-label={t('修改初始密码')}>
        <div className="login-brand">
          <img alt="DuolinTing" className="login-brand-logo" src="/duolinting-logo-ear.png" />
          <div className="login-brand-copy">
            <h1>{t('欢迎加入')}</h1>
            <p>{t('请先保护你的后台账号')}</p>
          </div>
        </div>
        {languageSelector}

        <form className="login-panel" onSubmit={handleChangeRequiredPassword}>
          <div className="login-panel-head">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <h2>{t('修改初始密码')}</h2>
              <p>{t('这是管理员为你开通的临时密码。修改后才能进入管理后台。')}</p>
            </div>
          </div>
          <label className="field">
            <span>{t('临时密码')}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>{t('新密码（至少 8 位）')}</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>{t('确认新密码')}</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            />
          </label>
          <button className="command-button" disabled={isChangingPassword || passwordForm.newPassword.length < 8} type="submit">
            {isChangingPassword ? t('保存中') : t('确认并进入后台')}
          </button>
          <button className="command-button secondary" disabled={isChangingPassword} onClick={() => void logout()} type="button">
            {t('退出登录')}
          </button>
        </form>
      </section>
    </main>
  )

  const sessionStatus = sessionVerification === 'checking' ? (
    <div role="status" className="admin-session-checking">
      <Spin size="small" />
      <span>{t('正在验证管理员会话，请稍候')}</span>
    </div>
  ) : sessionVerification === 'network' || sessionVerification === 'server' ? (
    <Alert
      showIcon
      type="warning"
      title={t(sessionVerification === 'network'
        ? '无法连接服务器，请检查网络后重试。登录信息已保留。'
        : '服务器暂时不可用，请稍后重试。登录信息已保留。')}
      description={!hasVerifiedSession ? t('会话尚未验证，连接恢复后才能进入管理后台。') : t('当前编辑内容已保留，请重试验证。')}
      action={<Button onClick={() => void sessionVerifier.check(adminToken)}>{t('重试验证')}</Button>}
    />
  ) : null

  if (adminToken && !hasVerifiedSession) {
    return (
      <main className="app-shell login-shell">
        <section className="login-page" aria-label={t('管理员会话验证')}>
          <div className="login-brand">
            <img alt="DuolinTing" className="login-brand-logo" src="/duolinting-logo-ear.png" />
            <div className="login-brand-copy">
              <h1>{t('管理后台')}</h1>
              <p>{t('管理员会话验证')}</p>
            </div>
          </div>
          {languageSelector}
          <div className="login-panel">
            {sessionStatus}
            <Button onClick={() => void logout()}>{t('退出登录')}</Button>
          </div>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={loginPage} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const currentAdminUser = adminUser as AdminUser

  if (currentAdminUser.mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={requiredPasswordPage} />
      </Routes>
    )
  }

  return (
    <main className="app-shell">
      {sessionVerification !== 'verified' && <div className="admin-session-status">{sessionStatus}</div>}
      <Routes>
        <Route path="/login" element={<Navigate to="/directory" replace />} />
        <Route
          path="*"
          element={
            <ContentAdmin
              adminToken={adminToken}
              categoryGroups={categoryGroups}
              categories={categories}
              exercises={exercises}
              onRefreshCatalog={refreshCatalog}
              catalogRevision={catalogRevision}
              onEnsureCatalog={ensureCatalog}
              onEnsureExercises={loadExercises}
              onNotify={showNotice}
              onRequestConfirm={requestConfirm}
              onRequestUnsavedLeaveConfirm={requestUnsavedLeaveConfirm}
              adminUser={currentAdminUser}
              onLogout={() => void logout()}
              onRegisterBeforeLogout={(handler) => {
                beforeLogoutRef.current = handler
              }}
            />
          }
        />
      </Routes>
      <AdminConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        alternateLabel={confirmState.alternateLabel}
        tone={confirmState.tone}
        onCancel={() => closeConfirm(false)}
        onAlternate={() => closeConfirm('discard')}
        onConfirm={() => closeConfirm(true)}
      />
    </main>
  )
}

export default App
