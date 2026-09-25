import type { CatalogExerciseSummary } from '@duolinting/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { type AdminSection } from '../../components/admin/AdminWorkspaceNav'
import type { ContentAdminProps, ImporterDraft } from '../../components/admin/content-workspace/types'

type ImporterNavigationOptions = Pick<ContentAdminProps, 'adminUser' | 'categories' | 'exercises' | 'onRequestConfirm' | 'onRequestUnsavedLeaveConfirm' | 'onRegisterBeforeLogout'>

export function useImporterNavigation({
  adminUser,
  categories,
  exercises,
  onRequestConfirm,
  onRequestUnsavedLeaveConfirm,
  onRegisterBeforeLogout,
}: ImporterNavigationOptions) {

  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [importerDraft, setImporterDraft] = useState<ImporterDraft>(null)
  const [importerHasUnsavedChanges, setImporterHasUnsavedChanges] = useState(false)
  const importerHasUnsavedChangesRef = useRef(false)
  const onRequestConfirmRef = useRef(onRequestConfirm)
  const saveImporterBeforeLeaveRef = useRef<(() => Promise<boolean>) | null>(null)
  const allowNextHistoryBackRef = useRef(false)
  const lastImporterRouteKeyRef = useRef('')

  const activeSection = useMemo<AdminSection>(() => {
    if (location.pathname.startsWith('/collaboration')) {
      return 'collaboration'
    }
    if (location.pathname.startsWith('/activity')) {
      return 'activity'
    }
    if (location.pathname.startsWith('/pool')) {
      return 'pool'
    }
    if (location.pathname.startsWith('/account-settings')) {
      return 'account-settings'
    }
    if (location.pathname.startsWith('/sponsors')) {
      return 'sponsors'
    }
    if (location.pathname.startsWith('/donations')) {
      return 'donations'
    }
    if (location.pathname.startsWith('/directory')) {
      return 'directory'
    }
    if (location.pathname.startsWith('/courses')) {
      return 'courses'
    }
    if (location.pathname.startsWith('/importer')) {
      return 'importer'
    }
    if (location.pathname.startsWith('/recorder')) {
      return 'recorder'
    }
    if (location.pathname.startsWith('/feedback')) {
      return 'feedback'
    }
    if (location.pathname.startsWith('/users')) {
      return 'users'
    }
    if (location.pathname.startsWith('/api-keys')) {
      return 'api-keys'
    }
    return 'directory'
  }, [location.pathname])
  const isOpenContentDocumentation = location.pathname === '/api-keys/docs'

  // 贡献者可直接输入旧链接或书签；统一回到其被分配的课程列表，避免展示没有写权限的工作区。
  useEffect(() => {
    if (
      adminUser.role === 'subtitle_contributor' &&
      !['courses', 'pool', 'importer', 'activity', 'account-settings'].includes(activeSection)
    ) {
      navigate('/courses', { replace: true })
    }
  }, [activeSection, adminUser.role, navigate])

  const importerRouteState = useMemo(
    () => {
      if (!location.pathname.startsWith('/importer')) {
        return null
      }

      if (location.pathname === '/importer/new') {
        const categoryIdParam = searchParams.get('categoryId')
        return {
          mode: 'create' as const,
          categoryId: categoryIdParam ? Number(categoryIdParam) : 0,
        }
      }

      const match = location.pathname.match(/^\/importer\/([^/]+)$/)
      if (!match) {
        return null
      }

      return {
        mode: 'edit' as const,
        exerciseId: Number(decodeURIComponent(match[1])),
      }
    },
    [location.pathname, searchParams],
  )

  useEffect(() => {
    importerHasUnsavedChangesRef.current = importerHasUnsavedChanges
  }, [importerHasUnsavedChanges])

  useEffect(() => {
    onRequestConfirmRef.current = onRequestConfirm
  }, [onRequestConfirm])

  useEffect(() => {
    const isKnownPath =
      location.pathname === '/importer' ||
      location.pathname === '/importer/new' ||
      /^\/importer\/[^/]+$/.test(location.pathname) ||
      location.pathname === '/directory' ||
      location.pathname === '/collaboration' ||
      location.pathname === '/courses' ||
      location.pathname === '/activity' ||
      location.pathname === '/pool' ||
      location.pathname === '/account-settings' ||
      location.pathname === '/sponsors' ||
      location.pathname === '/donations' ||
      location.pathname === '/recorder' ||
      location.pathname === '/feedback' ||
      location.pathname === '/users' ||
      location.pathname === '/api-keys' ||
      location.pathname === '/api-keys/docs'

    if (!isKnownPath) {
      navigate('/directory', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    if (!importerRouteState) {
      return
    }

    if (importerRouteState.mode === 'create') {
      const nextCategoryId =
        importerRouteState.categoryId || categories[0]?.id || 0
      const routeKey = `create:${nextCategoryId}`
      if (routeKey === lastImporterRouteKeyRef.current) {
        return
      }

      lastImporterRouteKeyRef.current = routeKey
      setImporterDraft({
        mode: 'create',
        categoryId: nextCategoryId,
      })
      return
    }

    const exercise = exercises.find(
      (item) => item.id === importerRouteState.exerciseId,
    )
    if (!exercise) {
      return
    }

    const routeKey = `edit:${exercise.id}`
    if (routeKey === lastImporterRouteKeyRef.current) {
      return
    }

    lastImporterRouteKeyRef.current = routeKey
    setImporterDraft({
      mode: 'edit',
      exercise,
    })
  }, [categories, exercises, importerRouteState])

  useEffect(() => {
    if (activeSection !== 'importer') {
      lastImporterRouteKeyRef.current = ''
    }
  }, [activeSection])

  const confirmSaveImporterBeforeLeave = useCallback(async () => {
    if (!importerHasUnsavedChangesRef.current) {
      return true
    }

    const action = await onRequestUnsavedLeaveConfirm()
    if (action === 'discard') {
      setImporterHasUnsavedChanges(false)
      importerHasUnsavedChangesRef.current = false
      return true
    }
    if (action !== 'save') {
      return false
    }

    const saved = await saveImporterBeforeLeaveRef.current?.()
    if (saved) {
      setImporterHasUnsavedChanges(false)
      importerHasUnsavedChangesRef.current = false
      return true
    }

    return false
  }, [onRequestUnsavedLeaveConfirm])

  // 把“离开前保存确认”注册给 App，退出登录时复用同一套确认逻辑
  useEffect(() => {
    onRegisterBeforeLogout?.(confirmSaveImporterBeforeLeave)
    return () => onRegisterBeforeLogout?.(null)
  }, [confirmSaveImporterBeforeLeave, onRegisterBeforeLogout])

  useEffect(() => {
    if (!importerHasUnsavedChanges) {
      return
    }

    window.history.pushState(
      { duolintingAdminUnsavedGuard: true },
      '',
      window.location.href,
    )

    const handlePopState = () => {
      if (allowNextHistoryBackRef.current) {
        allowNextHistoryBackRef.current = false
        return
      }

      if (!importerHasUnsavedChangesRef.current) {
        return
      }

      void (async () => {
        const canLeave = await confirmSaveImporterBeforeLeave()
        if (canLeave) {
          allowNextHistoryBackRef.current = true
          window.history.back()
          return
        }

        window.history.pushState(
          { duolintingAdminUnsavedGuard: true },
          '',
          window.location.href,
        )
      })()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [confirmSaveImporterBeforeLeave, importerHasUnsavedChanges])

  const changeSection = useCallback(async (section: AdminSection) => {
    if (section === activeSection && !(section === 'api-keys' && isOpenContentDocumentation)) {
      return
    }

    if (activeSection === 'importer') {
      const canLeave = await confirmSaveImporterBeforeLeave()
      if (!canLeave) {
        return
      }
    }

    navigate(
      section === 'directory'
        ? '/directory'
        : section === 'collaboration'
          ? '/collaboration'
        : section === 'activity'
          ? '/activity'
        : section === 'pool'
          ? '/pool'
          : section === 'courses'
          ? '/courses'
          : section === 'sponsors'
            ? '/sponsors'
          : section === 'donations'
            ? '/donations'
          : section === 'recorder'
            ? '/recorder'
          : section === 'feedback'
          ? '/feedback'
          : section === 'users'
            ? '/users'
            : section === 'api-keys'
              ? '/api-keys'
              : section === 'account-settings'
                ? '/account-settings'
                : '/importer',
    )
  }, [activeSection, confirmSaveImporterBeforeLeave, isOpenContentDocumentation, navigate])

  const openImporterForCategory = async (categoryId: number) => {
    if (activeSection === 'importer') {
      const canLeave = await confirmSaveImporterBeforeLeave()
      if (!canLeave) {
        return
      }
    }

    navigate(`/importer/new?categoryId=${encodeURIComponent(categoryId)}`)
  }

  const openImporterForExercise = async (exercise: CatalogExerciseSummary) => {
    if (activeSection === 'importer') {
      const canLeave = await confirmSaveImporterBeforeLeave()
      if (!canLeave) {
        return
      }
    }

    navigate(`/importer/${encodeURIComponent(exercise.id)}`)
  }
  return {
    activeSection,
    isOpenContentDocumentation,
    navigate,
    importerDraft,
    setImporterDraft,
    setImporterHasUnsavedChanges,
    saveImporterBeforeLeaveRef,
    changeSection,
    openImporterForCategory,
    openImporterForExercise,
  }
}
