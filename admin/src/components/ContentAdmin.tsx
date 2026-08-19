import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, Card, ConfigProvider, Input, Layout, Modal, Space, Typography } from 'antd'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type {
  AcceptedAnswerFeedback,
  AdminGrowthReport,
  CatalogExerciseSummary,
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
  ExerciseCategory,
  FeedbackStatus,
  MaterialCategory,
  AdminUser,
  AdminMember,
  AdminReviewTask,
  AdminSubtitleWorkflowTaskInbox,
  AdminWorkflowNotifications,
} from '@duolinting/shared'
import { AudioLessonImporter } from './AudioLessonImporter'
import type { AdminNoticeTone } from './admin/AdminFeedback'
import { AcceptedAnswerFeedbackPanel } from './admin/AcceptedAnswerFeedbackPanel'
import { UserActivityPanel } from './admin/UserActivityPanel'
import {
  AdminWorkspaceNav,
  type AdminSection,
} from './admin/AdminWorkspaceNav'
import { CourseManager } from './admin/CourseManager'
import { DirectoryManager } from './admin/DirectoryManager'
import { ListeningVideoRecorder } from './admin/ListeningVideoRecorder'
import { CollaborationManager } from './admin/CollaborationManager'
import { WorkflowActivityPanel } from './admin/WorkflowActivityPanel'
import { OpenContentApiDocumentation } from './admin/OpenContentApiDocumentation'
import { OpenContentApiKeyManager } from './admin/OpenContentApiKeyManager'
import { apiClient } from '../lib/apiClient'

type ContentAdminProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  onRefreshCatalog: () => Promise<void>
  onEnsureCatalog: () => Promise<void>
  onEnsureExercises: () => Promise<CatalogExerciseSummary[]>
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  adminUser: AdminUser
  onRequestDisplayNameChange: () => void
  onLogout: () => void
  // 注册退出登录前的确认钩子（复用制课工作台的保存确认），null 表示注销
  onRegisterBeforeLogout?: (handler: (() => Promise<boolean>) | null) => void
  onRequestConfirm: (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) => Promise<boolean>
  onRequestUnsavedLeaveConfirm: () => Promise<'save' | 'discard' | 'cancel'>
}

type ImporterDraft =
  | {
      mode: 'create'
      categoryId: number
    }
  | {
      mode: 'edit'
      exercise: CatalogExerciseSummary
    }
  | null

function AccountSettingsPanel({ adminToken, adminUser, onNotify }: { adminToken: string; adminUser: AdminUser; onNotify: (message: string, tone?: AdminNoticeTone) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(adminUser.displayName)
  const [changingName, setChangingName] = useState(false)
  const saveName = async () => {
    if (!name.trim() || name.trim() === adminUser.displayName) return
    setChangingName(true)
    try { await apiClient.changeOwnAdminDisplayName(name.trim(), adminToken); onNotify('显示名称已更新，请刷新页面查看', 'success') } catch (error) { onNotify(error instanceof Error ? error.message : '显示名称修改失败', 'error') } finally { setChangingName(false) }
  }
  const bind = async () => {
    if (!email.trim() || !password) return
    setSaving(true)
    try { await apiClient.bindOwnLearnerAccount({ learnerEmail: email.trim(), learnerPassword: password }, adminToken); setPassword(''); onNotify('学习端账号绑定成功', 'success') } catch (error) { onNotify(error instanceof Error ? error.message : '学习端账号绑定失败', 'error') } finally { setSaving(false) }
  }
  return <section className="admin-section"><div className="panel-title"><Typography.Title level={3} style={{ margin: 0 }}>我的账号</Typography.Title></div><Space direction="vertical" size={16} style={{ display: 'flex', maxWidth: 640 }}><Card title="公开资料"><Typography.Paragraph type="secondary">显示名称会展示在课程贡献者信息中，字幕贡献者每 90 天只能修改一次。</Typography.Paragraph><Space.Compact style={{ width: '100%' }}><Input value={name} onChange={(event) => setName(event.target.value)} /><Button loading={changingName} type="primary" onClick={() => void saveName()}>保存名称</Button></Space.Compact>{adminUser.nextDisplayNameChangeAt && <Typography.Text type="warning">下次可修改时间：{new Date(adminUser.nextDisplayNameChangeAt).toLocaleString('zh-CN')}</Typography.Text>}</Card><Card title="绑定学习端账号"><Typography.Paragraph type="secondary">请输入学习端登录邮箱和密码完成验证。绑定后，你负责的课程草稿会在学习端 App 和网页端中提供预览。</Typography.Paragraph><Input placeholder="学习端登录邮箱" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /><Input.Password placeholder="学习端登录密码" value={password} onChange={(event) => setPassword(event.target.value)} style={{ marginTop: 12 }} /><Button loading={saving} disabled={!email.trim() || !password} type="primary" onClick={() => void bind()} style={{ marginTop: 12 }}>验证并绑定</Button>{adminUser.learnerUserId && <Typography.Text type="success" style={{ display: 'block', marginTop: 12 }}>当前已绑定：{adminUser.learnerDisplayName}（{adminUser.learnerEmail}）</Typography.Text>}</Card></Space></section>
}

const initialCategoryForm: CreateCategoryRequest = {
  groupId: 1,
  name: '新闻精听入门',
  description: '面向新闻材料的学习系列',
  accent: '#3a7ca5',
  coverImageUrl: '',
  sourceUrl: '',
  sortOrder: 10,
}

const initialCategoryGroupForm: CreateCategoryGroupRequest = {
  name: '新闻资讯',
  description: '新闻简报、专题报道、公共事件解读',
  accent: '#1cb0f6',
  coverImageUrl: '',
  sortOrder: 10,
}

const getNextSortOrder = (items: Array<{ sortOrder: number }>) =>
  items.reduce((maxOrder, item) => Math.max(maxOrder, item.sortOrder), 0) + 10

const normalizeSortOrder = <T extends { sortOrder: number }>(items: T[]) =>
  items.map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 10,
  }))

const moveItem = <T extends { id: number }>(
  items: T[],
  itemId: number,
  direction: 'up' | 'down',
) => {
  const nextItems = [...items]
  const currentIndex = nextItems.findIndex((item) => item.id === itemId)
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= nextItems.length
  ) {
    return null
  }

  const currentItem = nextItems[currentIndex]
  nextItems[currentIndex] = nextItems[targetIndex]
  nextItems[targetIndex] = currentItem
  return nextItems
}

export function ContentAdmin({
  adminToken,
  categoryGroups,
  categories,
  exercises,
  onRefreshCatalog,
  onEnsureCatalog,
  onEnsureExercises,
  onNotify,
  adminUser,
  onRequestDisplayNameChange,
  onLogout,
  onRegisterBeforeLogout,
  onRequestConfirm,
  onRequestUnsavedLeaveConfirm,
}: ContentAdminProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [categoryForm, setCategoryForm] =
    useState<CreateCategoryRequest>(initialCategoryForm)
  const [categoryGroupForm, setCategoryGroupForm] =
    useState<CreateCategoryGroupRequest>(initialCategoryGroupForm)
  const [isSaving, setIsSaving] = useState(false)
  const [isCatalogLoading, setIsCatalogLoading] = useState(false)
  const [catalogLoadError, setCatalogLoadError] = useState('')
  const [feedbackItems, setFeedbackItems] = useState<AcceptedAnswerFeedback[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [growthReport, setGrowthReport] = useState<AdminGrowthReport | null>(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [importerDraft, setImporterDraft] = useState<ImporterDraft>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [reviewingExercise, setReviewingExercise] = useState<import('@duolinting/shared').ListeningExercise | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [workflowContributors, setWorkflowContributors] = useState<AdminMember[]>([])
  const [reviewTasks, setReviewTasks] = useState<AdminReviewTask[]>([])
  const [workflowInbox, setWorkflowInbox] = useState<AdminSubtitleWorkflowTaskInbox>({ items: [], counts: { proofreading: 0, awaitingReview: 0, returned: 0, completedProofreading: 0, completedSecondReview: 0 } })
  const [workflowNotifications, setWorkflowNotifications] = useState<AdminWorkflowNotifications>({ items: [], unreadCount: 0 })
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
    if (location.pathname.startsWith('/account-settings')) {
      return 'account-settings'
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
      !['courses', 'importer', 'activity'].includes(activeSection)
    ) {
      navigate('/courses', { replace: true })
    }
  }, [activeSection, adminUser.role, navigate])

  const refreshWorkspaceCatalog = useCallback(async () => {
    setIsCatalogLoading(true)
    setCatalogLoadError('')
    try {
      await onEnsureCatalog()
    } catch (error) {
      const message = error instanceof Error ? error.message : '目录数据加载失败'
      setCatalogLoadError(message)
      onNotify(message, 'error')
      throw error
    } finally {
      setIsCatalogLoading(false)
    }
  }, [onEnsureCatalog, onNotify])

  const refreshWorkflowContributors = useCallback(async () => {
    if (adminUser.role !== 'super_admin') {
      setWorkflowContributors([])
      return
    }
    try {
      const result = await apiClient.getAdminMembers(adminToken)
      // 校对和二次审核都由字幕贡献者承担；超级管理员只在此配置负责人。
      setWorkflowContributors(result.items.filter((member) => member.role === 'subtitle_contributor'))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '字幕贡献者加载失败', 'error')
    }
  }, [adminToken, adminUser.role, onNotify])

  const refreshWorkflowInbox = useCallback(async () => {
    try {
      const [tasks, notifications, inbox] = await Promise.all([
        apiClient.getMySubtitleReviewTasks(adminToken),
        apiClient.getMyWorkflowNotifications(adminToken),
        apiClient.getMySubtitleWorkflowInbox(adminToken),
      ])
      setReviewTasks(tasks.items)
      setWorkflowNotifications(notifications)
      setWorkflowInbox(inbox)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '工作流待办加载失败', 'error')
    }
  }, [adminToken, onNotify])

  useEffect(() => {
    // 课程授权要按“内容分类 → 学习系列 → 课程”分级显示，
    // 因此进入人员管理时也必须刷新目录数据，不能只依赖此前访问过课程页的缓存。
    if (activeSection !== 'directory' && activeSection !== 'courses' && activeSection !== 'importer' && activeSection !== 'recorder' && activeSection !== 'collaboration') {
      return
    }

    void refreshWorkspaceCatalog().catch(() => undefined)
  }, [activeSection, refreshWorkspaceCatalog])

  useEffect(() => {
    // 协作页的课程授权同样需要完整课程列表，用于逐级勾选和全选。
    if (activeSection !== 'importer' && activeSection !== 'recorder' && activeSection !== 'collaboration') {
      return
    }

    void onEnsureExercises().catch((error) => {
      onNotify(error instanceof Error ? error.message : '课程数据加载失败', 'error')
    })
  }, [activeSection, exercises.length, onEnsureExercises, onNotify])

  useEffect(() => {
    if (activeSection === 'courses') {
      void refreshWorkflowContributors()
      void refreshWorkflowInbox()
    }
  }, [activeSection, refreshWorkflowContributors, refreshWorkflowInbox])

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

  useEffect(() => {
    if (
      categoryGroups.length > 0 &&
      !categoryGroups.some((group) => group.id === categoryForm.groupId)
    ) {
      setCategoryForm((current) => ({
        ...current,
        groupId: categoryGroups[0].id,
      }))
    }
  }, [categoryForm.groupId, categoryGroups])

  const runAdminTask = async (
    task: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<boolean> => {
    setIsSaving(true)
    try {
      await task()
      return true
    } catch (error) {
      onNotify(error instanceof Error ? error.message : fallbackMessage, 'error')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const saveCategoryGroup = () =>
    runAdminTask(async () => {
      await apiClient.createCategoryGroup(
        {
          ...categoryGroupForm,
          sortOrder:
            categoryGroupForm.id !== undefined
              ? categoryGroupForm.sortOrder
              : getNextSortOrder(categoryGroups),
        },
        adminToken,
      )
      await onRefreshCatalog()
      onNotify('内容分类已保存', 'success')
    }, '内容分类保存失败')

  const saveCategory = () =>
    runAdminTask(async () => {
      if (!categoryForm.groupId) {
        throw new Error('请先创建内容分类')
      }

      const siblingCategories = categories.filter(
        (category) => category.groupId === categoryForm.groupId,
      )
      await apiClient.createCategory(
        {
          ...categoryForm,
          sortOrder:
            categoryForm.id !== undefined
              ? categoryForm.sortOrder
              : getNextSortOrder(siblingCategories),
        },
        adminToken,
      )
      await onRefreshCatalog()
      onNotify('学习系列已保存', 'success')
    }, '学习系列保存失败')

  const deleteCategoryGroup = (groupId: number) =>
    void runAdminTask(async () => {
      await apiClient.deleteCategoryGroup(groupId, adminToken)
      await onRefreshCatalog()
      onNotify('内容分类已删除', 'success')
    }, '内容分类删除失败')

  const deleteCategory = (categoryId: number) =>
    void runAdminTask(async () => {
      await apiClient.deleteCategory(categoryId, adminToken)
      await onRefreshCatalog()
      onNotify('学习系列已删除', 'success')
    }, '学习系列删除失败')

  const moveCategoryGroup = (
    groupId: number,
    direction: 'up' | 'down',
  ) =>
    void runAdminTask(async () => {
      const movedGroups = moveItem(categoryGroups, groupId, direction)
      if (!movedGroups) {
        return
      }

      // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
      for (const group of normalizeSortOrder(movedGroups)) {
        await apiClient.createCategoryGroup(
          {
            id: group.id,
            name: group.name,
            description: group.description,
            accent: group.accent,
            coverImageUrl: group.coverImageUrl,
            sortOrder: group.sortOrder,
            localizations: group.localizations,
          },
          adminToken,
        )
      }
      await onRefreshCatalog()
      onNotify('内容分类顺序已更新', 'success')
    }, '内容分类排序失败')

  const moveCategory = (
    categoryId: number,
    direction: 'up' | 'down',
  ) =>
    void runAdminTask(async () => {
      const currentCategory = categories.find(
        (category) => category.id === categoryId,
      )
      if (!currentCategory) {
        return
      }

      const siblingCategories = categories.filter(
        (category) => category.groupId === currentCategory.groupId,
      )
      const movedCategories = moveItem(siblingCategories, categoryId, direction)
      if (!movedCategories) {
        return
      }

      // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
      for (const category of normalizeSortOrder(movedCategories)) {
        await apiClient.createCategory(
          {
            id: category.id,
            groupId: category.groupId,
            name: category.name,
            description: category.description,
            accent: category.accent,
            coverImageUrl: category.coverImageUrl,
            sourceUrl: category.sourceUrl,
            sortOrder: category.sortOrder,
            localizations: category.localizations,
          },
          adminToken,
        )
      }
      await onRefreshCatalog()
      onNotify('学习系列顺序已更新', 'success')
    }, '学习系列排序失败')

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
        : section === 'courses'
          ? '/courses'
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

  const deleteCourse = async (exercise: CatalogExerciseSummary) => {
    const confirmed = await onRequestConfirm({
      title: '删除课程',
      message: `删除课程“${exercise.title}”后，会同时删除课程元数据、字幕、学习进度和对应媒体文件。此操作不可撤销。`,
      confirmLabel: '确认删除',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    void runAdminTask(async () => {
      await apiClient.deleteExercise(exercise.id, adminToken)
      await onRefreshCatalog()
      onNotify(`课程已删除：${exercise.title}`, 'success')
    }, '课程删除失败')
  }

  const moveCourse = (
    exerciseId: number,
    direction: 'up' | 'down',
  ) =>
    void runAdminTask(async () => {
      const availableExercises = exercises.length > 0 ? exercises : await onEnsureExercises()
      const currentExercise = availableExercises.find((exercise) => exercise.id === exerciseId)
      if (!currentExercise) {
        return
      }

      const siblingExercises = availableExercises
        .filter((exercise) => exercise.categoryId === currentExercise.categoryId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
      const currentIndex = siblingExercises.findIndex((exercise) => exercise.id === exerciseId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblingExercises.length) {
        return
      }

      // 排序只交换相邻两门课的 sortOrder（2 次写），不整体重编号——
      // sortOrder 间距本来就是为了支撑局部交换。
      const current = siblingExercises[currentIndex]
      const neighbor = siblingExercises[targetIndex]
      const swapped: CatalogExerciseSummary[] = [
        { ...current, sortOrder: neighbor.sortOrder },
        { ...neighbor, sortOrder: current.sortOrder },
      ]

      // 历史遗留的重复排序值交换后顺序不变，此时才回退到全量重编号兜底
      const toPersist =
        current.sortOrder === neighbor.sortOrder
          ? normalizeSortOrder(moveItem(siblingExercises, exerciseId, direction) ?? [])
          : swapped

      // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
      for (const exercise of toPersist) {
        await apiClient.createExercise(
          {
            id: exercise.id,
            categoryId: exercise.categoryId,
            title: exercise.title,
            source: exercise.source,
            sourceUrl: exercise.sourceUrl,
            difficulty: exercise.difficulty,
            durationLabel: exercise.durationLabel,
            mediaType: exercise.mediaType,
            audioUrl: exercise.audioUrl,
            coverImageUrl: exercise.coverImageUrl,
            summary: exercise.summary,
            sortOrder: exercise.sortOrder,
            // 透传原状态，避免把 archived 课程改回 published
            status: exercise.status,
          },
          adminToken,
        )
      }
      await onRefreshCatalog()
      onNotify('课程顺序已更新', 'success')
    }, '课程排序失败')

  const refreshFeedback = async (status?: FeedbackStatus | 'all') => {
    setFeedbackLoading(true)
    try {
      const response = await apiClient.getAcceptedAnswerFeedback(adminToken, status)
      setFeedbackItems(response.items)
    } catch (error) {
      // 失败最常见的原因是 admin 登录态过期（401），提示里顺带引导重新登录
      onNotify(
        `反馈数据加载失败：${error instanceof Error ? error.message : '未知错误'}；若提示未授权，请重新登录管理员账号`,
        'error',
      )
    } finally {
      setFeedbackLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection !== 'feedback') {
      return
    }

    void refreshFeedback('all')
  }, [activeSection, adminToken])

  const refreshGrowth = async () => {
    setGrowthLoading(true)
    try {
      const response = await apiClient.getAdminGrowth(adminToken)
      setGrowthReport(response)
    } catch (error) {
      // 失败最常见的原因是 admin 登录态过期（401），提示里顺带引导重新登录
      onNotify(
        `增长数据加载失败：${error instanceof Error ? error.message : '未知错误'}；若提示未授权，请重新登录管理员账号`,
        'error',
      )
    } finally {
      setGrowthLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection !== 'users') {
      return
    }

    void refreshGrowth()
  }, [activeSection, adminToken])

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1cb0f6' } }}>
      <Layout className="admin-workspace-layout" hasSider>
        <Layout.Sider
          breakpoint="lg"
          collapsed={isSidebarCollapsed}
          collapsedWidth={72}
          collapsible
          onCollapse={setIsSidebarCollapsed}
          trigger={null}
          width={248}
          theme="light"
        >
          <AdminWorkspaceNav
            activeSection={activeSection}
            adminUser={adminUser}
            collapsed={isSidebarCollapsed}
            onCollapsedChange={setIsSidebarCollapsed}
            onRequestDisplayNameChange={onRequestDisplayNameChange}
            onLogout={onLogout}
            onSectionChange={(section) => void changeSection(section)}
          />
        </Layout.Sider>
        <Layout.Content className="admin-workspace-content" aria-label="内容管理">

      {activeSection === 'importer' && (
        <AudioLessonImporter
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          draft={importerDraft}
          onRefreshCatalog={onRefreshCatalog}
          onStatusChange={onNotify}
          onDraftConsumed={() => setImporterDraft(null)}
          onUnsavedChangesChange={setImporterHasUnsavedChanges}
          onRegisterSaveBeforeLeave={(handler) => {
            saveImporterBeforeLeaveRef.current = handler
          }}
          adminRole={adminUser.role}
        />
      )}

      {activeSection === 'recorder' && (
        <ListeningVideoRecorder
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          onNotify={onNotify}
        />
      )}

      {activeSection === 'directory' && (
        <DirectoryManager
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          categoryGroupForm={categoryGroupForm}
          categoryForm={categoryForm}
          isSaving={isSaving}
          onNotify={onNotify}
          onCategoryGroupFormChange={setCategoryGroupForm}
          onCategoryFormChange={setCategoryForm}
          onSaveCategoryGroup={saveCategoryGroup}
          onSaveCategory={saveCategory}
          onEditCategoryGroup={setCategoryGroupForm}
          onEditCategory={setCategoryForm}
          onDeleteCategoryGroup={deleteCategoryGroup}
          onDeleteCategory={deleteCategory}
          onMoveCategoryGroup={moveCategoryGroup}
          onMoveCategory={moveCategory}
          onRefresh={onRefreshCatalog}
          onRequestConfirm={onRequestConfirm}
        />
      )}

      {activeSection === 'courses' && (
        <CourseManager
          adminToken={adminToken}
          currentAdminId={adminUser.id}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          isCatalogLoading={isCatalogLoading}
          catalogLoadError={catalogLoadError}
          onRefreshCatalog={refreshWorkspaceCatalog}
          isSaving={isSaving}
          onCreateCourse={(categoryId) => {
            void openImporterForCategory(categoryId)
          }}
          onEditCourse={(exercise) => {
            void openImporterForExercise(exercise)
          }}
          onDeleteCourse={deleteCourse}
          onMoveCourse={moveCourse}
          onOpenRecorder={(exerciseId) => {
            navigate(`/recorder?exerciseId=${encodeURIComponent(exerciseId)}`)
          }}
          onRenameCourse={async (exercise, title) => {
            try {
              await apiClient.createExercise(
                {
                  id: exercise.id,
                  categoryId: exercise.categoryId,
                  title,
                  source: exercise.source,
                  sourceUrl: exercise.sourceUrl,
                  difficulty: exercise.difficulty,
                  durationLabel: exercise.durationLabel,
                  mediaType: exercise.mediaType,
                  audioUrl: exercise.audioUrl,
                  coverImageUrl: exercise.coverImageUrl,
                  summary: exercise.summary,
                  sortOrder: exercise.sortOrder,
                  // 透传原状态，避免把 archived 课程改回 published
                  status: exercise.status,
                },
                adminToken,
              )
              await onRefreshCatalog()
              onNotify('课程名称已更新', 'success')
            } catch (error) {
              onNotify(error instanceof Error ? error.message : '课程名称更新失败', 'error')
              throw error
            }
          }}
          canManageCourses={adminUser.role === 'super_admin'}
          onReviewSubtitleDraft={(exerciseId) => {
            void (async () => {
              try {
                const detail = await apiClient.getAdminExercise(exerciseId, adminToken)
                if (!detail.subtitleDrafts?.length) {
                  onNotify('这门课程当前没有待二次审核的字幕稿', 'info')
                  return
                }
                setReviewNote('')
                setReviewingExercise(detail)
              } catch (error) {
                onNotify(error instanceof Error ? error.message : '加载字幕稿失败', 'error')
              }
            })()
          }}
          reviewTasks={reviewTasks}
          workflowInbox={workflowInbox}
          workflowNotifications={workflowNotifications}
          onReadWorkflowNotifications={async () => {
            await apiClient.markWorkflowNotificationsRead(adminToken)
            setWorkflowNotifications((current) => ({
              ...current,
              unreadCount: 0,
              items: current.items.map((item) => ({ ...item, isRead: true })),
            }))
          }}
          contributors={workflowContributors}
          onUpdateWorkflowAssignee={async (exercise, workflowRole, adminUserId) => {
            try {
              await apiClient.updateExerciseWorkflowAssignee(exercise.id, workflowRole, adminUserId, adminToken)
              await onRefreshCatalog()
              onNotify(
                adminUserId
                  ? `已更新“${exercise.title}”的${workflowRole === 'proofreader' ? '校对负责人' : '二审负责人'}`
                  : `已取消“${exercise.title}”的${workflowRole === 'proofreader' ? '校对负责人' : '二审负责人'}`,
                'success',
              )
            } catch (error) {
              onNotify(error instanceof Error ? error.message : '更新工作流负责人失败', 'error')
              throw error
            }
          }}
        />
      )}

      {activeSection === 'account-settings' && (
        <AccountSettingsPanel adminToken={adminToken} adminUser={adminUser} onNotify={onNotify} />
      )}

      {activeSection === 'feedback' && (
        <AcceptedAnswerFeedbackPanel
          isLoading={feedbackLoading}
          isSaving={isSaving}
          items={feedbackItems}
          onStatusChange={(feedbackId, status) =>
            void runAdminTask(async () => {
              await apiClient.updateAcceptedAnswerFeedbackStatus(
                feedbackId,
                { status },
                adminToken,
              )
              await refreshFeedback('all')
              onNotify('反馈状态已更新', 'success')
            }, '反馈状态更新失败')
          }
        />
      )}

      {activeSection === 'users' && (
        <UserActivityPanel
          report={growthReport}
          isLoading={growthLoading}
          onRefresh={() => {
            void refreshGrowth()
          }}
        />
      )}

      {activeSection === 'activity' && (
        <WorkflowActivityPanel
          adminToken={adminToken}
          currentAdminId={adminUser.id}
          onNotify={onNotify}
        />
      )}

      {activeSection === 'collaboration' && adminUser.role === 'super_admin' && (
        <CollaborationManager
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          onEnsureExercises={onEnsureExercises}
          onNotify={onNotify}
        />
      )}

      {activeSection === 'api-keys' && adminUser.role === 'super_admin' && (
        isOpenContentDocumentation
          ? <OpenContentApiDocumentation
            onBack={() => navigate('/api-keys')}
            onNotify={onNotify}
          />
          : <OpenContentApiKeyManager
            adminToken={adminToken}
            onNotify={onNotify}
            onOpenDocumentation={() => navigate('/api-keys/docs')}
            onRequestConfirm={onRequestConfirm}
          />
      )}

      <Modal
        footer={null}
        onCancel={() => { setReviewingExercise(null); setReviewNote('') }}
        open={Boolean(reviewingExercise)}
        title={reviewingExercise ? `二次审核：${reviewingExercise.title}` : '二次审核'}
        width={760}
      >
        {reviewingExercise?.subtitleDrafts?.map((subtitleDraft) => (
          <section key={subtitleDraft.id} style={{ borderTop: '1px solid #f0f0f0', marginTop: 16, paddingTop: 16 }}>
            <Space direction="vertical" size={10} style={{ display: 'flex' }}>
              <Typography.Text><strong>{subtitleDraft.contributorDisplayName}</strong> 提交的校对稿，共 {subtitleDraft.lines.length} 句。</Typography.Text>
              <Typography.Paragraph style={{ maxHeight: 230, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {subtitleDraft.lines.map((line) => `[${line.start.toFixed(3)}–${line.end.toFixed(3)}] ${line.text}`).join('\n')}
              </Typography.Paragraph>
              <Input.TextArea
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="退回时请填写修改意见"
                rows={3}
                value={reviewNote}
              />
              <Space>
                <Typography.Text type="secondary">作为本课程指定的二审负责人，审核通过会替换正式字幕并发布；退回不会影响当前已发布版本。</Typography.Text>
                <Space>
                  <button className="ant-btn" disabled={!reviewNote.trim()} onClick={() => {
                    void runAdminTask(async () => {
                      await apiClient.returnSubtitleDraft(subtitleDraft.id, reviewNote.trim(), adminToken)
                      setReviewingExercise(null)
                      await onRefreshCatalog()
                      await refreshWorkflowInbox()
                      onNotify('字幕稿已退回并附上修改意见', 'success')
                    }, '退回字幕稿失败')
                  }}>退回修改</button>
                  <button className="ant-btn ant-btn-primary" onClick={() => {
                    void runAdminTask(async () => {
                      await apiClient.approveSubtitleDraft(subtitleDraft.id, adminToken)
                      setReviewingExercise(null)
                      await onRefreshCatalog()
                      await refreshWorkflowInbox()
                      onNotify('字幕稿已通过二次审核并发布', 'success')
                    }, '审核发布失败')
                  }}>审核通过并发布</button>
                </Space>
              </Space>
            </Space>
          </section>
        ))}
      </Modal>
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  )
}
