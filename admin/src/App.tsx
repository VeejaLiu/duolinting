import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { App as AntdApp } from 'antd'
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
import { apiClient } from './lib/apiClient'
import {
  ADMIN_TOKEN_STORAGE_KEY,
  ADMIN_USER_STORAGE_KEY,
} from './lib/contentTools'

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
  const [categoryGroups, setCategoryGroups] = useState<MaterialCategory[]>([])
  const [categories, setCategories] = useState<ExerciseCategory[]>([])
  const [exercises, setExercises] = useState<CatalogExerciseSummary[]>([])
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '',
  )
  const [adminUser, setAdminUser] = useState<AdminUser | null>(
    loadStoredAdminUser,
  )
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

  const isAuthenticated = Boolean(adminToken && adminUser)

  // 清空本地管理员会话（token 过期或主动退出时调用），回到登录页
  const clearAdminSession = () => {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    localStorage.removeItem(ADMIN_USER_STORAGE_KEY)
    setAdminToken('')
    setAdminUser(null)
  }

  const showNotice = useCallback((content: string, tone: AdminNoticeTone = 'info') => {
    const duration = tone === 'error' ? 5.2 : 3.2
    appMessage[tone]({ content, duration })
  }, [appMessage])

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
        title: '保存课程后离开？',
        message: '当前制课工作台里还有未保存的课程信息或字幕。请选择保存后离开，或放弃当前修改直接离开。',
        confirmLabel: '保存并离开',
        cancelLabel: '继续编辑',
        alternateLabel: '放弃修改并离开',
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

  const refreshCatalog = useCallback(async () => {
    const requestSerial = ++catalogRequestSerialRef.current
    const catalog = await apiClient.getAdminCatalog(adminToken)
    if (requestSerial !== catalogRequestSerialRef.current) {
      return
    }
    setCategoryGroups(catalog.categoryGroups)
    setCategories(catalog.categories)
  }, [adminToken])

  const loadExercises = useCallback(async () => {
    const nextExercises = await apiClient.getAdminExercises(adminToken)
    setExercises(nextExercises)
    return nextExercises
  }, [adminToken])

  useEffect(() => {
    if (!adminToken) {
      return
    }

    void (async () => {
      // 启动时先校验本地保存的 token 是否仍然有效；
      // 过期或后端不可用视为登录态失效，清空会话回登录页，避免界面假死。
      try {
        const currentAdmin = await apiClient.getCurrentAdmin(adminToken)
        // 旧浏览器本地可能还缓存 role="admin"。以后端会话返回的规范角色为准，
        // 这样迁移后的超级管理员无需手动清除浏览器缓存就能看见协作管理面板。
        localStorage.setItem(ADMIN_USER_STORAGE_KEY, JSON.stringify(currentAdmin))
        setAdminUser(currentAdmin)
      } catch {
        clearAdminSession()
        showNotice('管理员登录已过期，请重新登录', 'error')
        return
      }

    })()
  }, [adminToken, showNotice])

  const login = async () => {
    setIsLoggingIn(true)
    try {
      const result = await apiClient.adminLogin(loginForm)
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, result.token)
      localStorage.setItem(ADMIN_USER_STORAGE_KEY, JSON.stringify(result.user))
      setAdminToken(result.token)
      setAdminUser(result.user)
      showNotice('管理员已登录', 'success')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '登录失败', 'error')
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
    showNotice('管理员已退出登录', 'info')
  }

  const handleLoginSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void login()
  }

  const changeRequiredPassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotice('两次输入的新密码不一致', 'error')
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
      showNotice('密码已修改，欢迎进入管理后台', 'success')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '密码修改失败', 'error')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleChangeRequiredPassword: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void changeRequiredPassword()
  }


  const loginPage = (
    <main className="app-shell login-shell">
      <section className="login-page" aria-label="管理员登录">
        <div className="login-brand">
          <img alt="DuolinTing" className="login-brand-logo" src="/duolinting-logo-ear.png" />
          <div className="login-brand-copy">
            <h1>管理后台</h1>
            <p>统一内容管理端</p>
          </div>
        </div>

        <form className="login-panel" onSubmit={handleLoginSubmit}>
          <div className="login-panel-head">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <h2>管理员登录</h2>
              <p>登录后进入内容、课程、媒体与字幕管理工作台。</p>
            </div>
          </div>
          <label className="field">
            <span>登录邮箱</span>
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
            <span>密码</span>
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
              placeholder="输入管理员密码"
            />
          </label>
          <button className="command-button" disabled={isLoggingIn} type="submit">
            {isLoggingIn ? '登录中' : '登录'}
          </button>
        </form>
      </section>
    </main>
  )

  const requiredPasswordPage = (
    <main className="app-shell login-shell">
      <section className="login-page" aria-label="修改初始密码">
        <div className="login-brand">
          <img alt="DuolinTing" className="login-brand-logo" src="/duolinting-logo-ear.png" />
          <div className="login-brand-copy">
            <h1>欢迎加入</h1>
            <p>请先保护你的后台账号</p>
          </div>
        </div>

        <form className="login-panel" onSubmit={handleChangeRequiredPassword}>
          <div className="login-panel-head">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <h2>修改初始密码</h2>
              <p>这是管理员为你开通的临时密码。修改后才能进入管理后台。</p>
            </div>
          </div>
          <label className="field">
            <span>临时密码</span>
            <input
              autoComplete="current-password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>新密码（至少 8 位）</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            />
          </label>
          <button className="command-button" disabled={isChangingPassword || passwordForm.newPassword.length < 8} type="submit">
            {isChangingPassword ? '保存中' : '确认并进入后台'}
          </button>
          <button className="command-button secondary" disabled={isChangingPassword} onClick={() => void logout()} type="button">
            退出登录
          </button>
        </form>
      </section>
    </main>
  )

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
              onEnsureCatalog={refreshCatalog}
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
