import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ConfigProvider, Layout } from 'antd'
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

const initialCategoryForm: CreateCategoryRequest = {
  groupId: 1,
  name: '新闻精听入门',
  description: '面向新闻材料的学习系列',
  accent: '#3a7ca5',
  coverImageUrl: '',
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
  const [importerHasUnsavedChanges, setImporterHasUnsavedChanges] = useState(false)
  const importerHasUnsavedChangesRef = useRef(false)
  const onRequestConfirmRef = useRef(onRequestConfirm)
  const saveImporterBeforeLeaveRef = useRef<(() => Promise<boolean>) | null>(null)
  const allowNextHistoryBackRef = useRef(false)
  const lastImporterRouteKeyRef = useRef('')

  const activeSection = useMemo<AdminSection>(() => {
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
    return 'directory'
  }, [location.pathname])

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

  useEffect(() => {
    if (activeSection !== 'directory' && activeSection !== 'courses' && activeSection !== 'importer' && activeSection !== 'recorder') {
      return
    }

    void refreshWorkspaceCatalog().catch(() => undefined)
  }, [activeSection, refreshWorkspaceCatalog])

  useEffect(() => {
    if (activeSection !== 'importer' && activeSection !== 'recorder') {
      return
    }

    void onEnsureExercises().catch((error) => {
      onNotify(error instanceof Error ? error.message : '课程数据加载失败', 'error')
    })
  }, [activeSection, exercises.length, onEnsureExercises, onNotify])

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
      location.pathname === '/courses' ||
      location.pathname === '/recorder' ||
      location.pathname === '/feedback' ||
      location.pathname === '/users'

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
    if (section === activeSection) {
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
        : section === 'courses'
          ? '/courses'
          : section === 'recorder'
            ? '/recorder'
          : section === 'feedback'
          ? '/feedback'
          : section === 'users'
            ? '/users'
            : '/importer',
    )
  }, [activeSection, confirmSaveImporterBeforeLeave, navigate])

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
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          isCatalogLoading={isCatalogLoading}
          catalogLoadError={catalogLoadError}
          onRefreshCatalog={refreshWorkspaceCatalog}
          categoryDraftName={categoryForm.name}
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
        />
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
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  )
}
