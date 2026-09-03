import { ArrowDown, ArrowUp, Bell, BookOpen, Ellipsis, FilePenLine, History, Pencil, PlaySquare, Plus, RefreshCw, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, Dropdown, Empty, Form, Image, Input, Modal, Popover, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { AdminMember, AdminReviewTask, AdminWorkflowNotifications, CatalogExerciseSummary, ExerciseCategory, ExerciseSubtitleVersion, MaterialCategory } from '@duolinting/shared'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'
import { BatchCourseImporter } from './BatchCourseImporter'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type CourseManagerProps = {
  adminToken: string
  currentAdminId: number
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  isCatalogLoading: boolean
  catalogLoadError: string
  onRefreshCatalog: () => Promise<void>
  isSaving: boolean
  onCreateCourse: (categoryId: number) => void
  onDeleteCourse: (exercise: CatalogExerciseSummary) => void
  onEditCourse: (exercise: CatalogExerciseSummary) => void
  onMoveCourse: (exerciseId: number, direction: 'up' | 'down') => void
  onOpenRecorder: (exerciseId: number) => void
  onRenameCourse: (exercise: CatalogExerciseSummary, title: string) => Promise<void>
  canManageCourses?: boolean
  onReviewSubtitleDraft?: (exerciseId: number) => void
  reviewTasks: AdminReviewTask[]
  workflowNotifications: AdminWorkflowNotifications
  onReadWorkflowNotifications: () => Promise<void>
  contributors: AdminMember[]
  onUpdateWorkflowAssignee: (
    exercise: CatalogExerciseSummary,
    workflowRole: 'proofreader' | 'second_reviewer',
    adminUserId: number | undefined,
  ) => Promise<void>
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

type CourseStatus = 'all' | 'draft' | 'proofread' | 'published' | 'archived'

const statusLabels = { draft: '草稿', proofread: '已校对', published: '已发布', archived: '已归档' }
const statusColors = { draft: 'default', proofread: 'processing', published: 'success', archived: 'purple' } as const
const LAST_CATEGORY_STORAGE_KEY = 'duolinting.admin.last-course-category-id'

const workflowSteps = ['课程草稿', '字幕校对', '二次审核', '已发布']
const workflowStageIndex = {
  draft: 0,
  proofreading: 1,
  returned: 1,
  awaiting_review: 2,
  published: 3,
  archived: 0,
} as const

const formatSubmittedAt = (value: string | undefined, locale: string) => value
  ? new Intl.DateTimeFormat(locale, {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value))
  : ''

/** 字幕时间轴以秒存储；这里格式化成 mm:ss 便于在版本历史里阅读。 */
const formatTimestamp = (seconds: number) => {
  if (!Number.isFinite(seconds)) return ''
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const rest = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

const workflowNotificationCopy = (notification: AdminWorkflowNotifications['items'][number], t: (key: string, values?: Record<string, string | number>) => string) => {
  if (notification.type === 'subtitle_submitted') return t('{{name}} 提交了校对稿', { name: notification.actorDisplayName })
  if (notification.type === 'subtitle_returned') return t('{{name}} 退回了稿件', { name: notification.actorDisplayName })
  if (notification.type === 'subtitle_approved') return t('{{name}} 审核通过并发布了稿件', { name: notification.actorDisplayName })
  if (notification.type === 'task_claim_expiring') return t('{{title}} 的领取任务即将到期，请尽快保存或提交', { title: notification.exerciseTitle })
  return t('{{title}} 的领取任务已超时，已释放回任务池', { title: notification.exerciseTitle })
}

function CourseWorkflow({
  exercise,
  contributors,
  canManageCourses,
  onUpdateWorkflowAssignee,
}: {
  exercise: CatalogExerciseSummary
  contributors: AdminMember[]
  canManageCourses: boolean
  onUpdateWorkflowAssignee: (workflowRole: 'proofreader' | 'second_reviewer', adminUserId: number | undefined) => void
}) {
  const { t, uiLocale } = useAdminLanguage()
  const workflow: NonNullable<CatalogExerciseSummary['workflow']> = exercise.workflow ?? {
    stage: exercise.status === 'published' ? 'published' : exercise.status === 'archived' ? 'archived' : exercise.status === 'proofread' ? 'awaiting_review' : 'draft',
  }
  const activeIndex = workflowStageIndex[workflow.stage]
  const summary = workflow.stage === 'awaiting_review'
    ? `${workflow.contributorDisplayName ?? t('字幕贡献者')} ${t('已提交')}${workflow.submittedAt ? ` · ${formatSubmittedAt(workflow.submittedAt, uiLocale)}` : ''}`
    : workflow.stage === 'returned'
      ? `${workflow.contributorDisplayName ?? t('字幕贡献者')} ${t('待修改')}${workflow.reviewNote ? ` · ${workflow.reviewNote}` : ''}`
      : workflow.stage === 'proofreading'
        ? `${workflow.contributorDisplayName ?? t('字幕贡献者')} ${t('正在校对')}`
        : workflow.stage === 'published'
          ? `${t('校对：')}${workflow.proofreaderDisplayName ?? '—'} · ${t('二审：')}${workflow.secondReviewerDisplayName ?? '—'}`
          : workflow.stage === 'archived'
            ? t('课程已归档')
            : t('分配一位字幕贡献者后，将自动负责校对和二次审核')

  const workflowStepRole = (index: number) => index === 1
    ? 'proofreader' as const
    : index === 2
      ? 'second_reviewer' as const
      : undefined

  const assigneeForRole = (workflowRole: 'proofreader' | 'second_reviewer') => (
    workflowRole === 'proofreader'
      ? workflow.proofreaderAssignee
      : workflow.secondReviewerAssignee
  )

  return <div className="course-workflow" title={summary}>
    <div className="course-workflow-steps" aria-label={`${t('工作流：')}${summary}`}>
      {workflowSteps.map((step, index) => {
        const workflowRole = workflowStepRole(index)
        const assignee = workflowRole ? assigneeForRole(workflowRole) : undefined
        return (
        <div className={index <= activeIndex ? 'course-workflow-step is-complete' : 'course-workflow-step'} key={step}>
          <div className="course-workflow-step-label">
            <span className={index === activeIndex ? 'course-workflow-dot is-active' : 'course-workflow-dot'}>{index + 1}</span>
            <span>{t(step)}</span>
          </div>
          {workflowRole && (canManageCourses && workflowRole === 'proofreader' ? (
            <Select
              allowClear
              className="course-workflow-assignee-select"
              onChange={(adminUserId: number | undefined) => onUpdateWorkflowAssignee(workflowRole, adminUserId)}
              options={contributors.map((contributor) => ({
                label: `${contributor.displayName}${contributor.mustChangePassword ? t('（待首次改密）') : ''}`,
                value: contributor.id,
              }))}
              placeholder={workflowRole === 'proofreader' ? t('选择校对人') : t('选择二审人')}
              size="small"
              value={assignee?.adminUserId}
            />
          ) : (
            <Typography.Text className="course-workflow-assignee-name" ellipsis type="secondary">
              {assignee?.displayName ?? (workflowRole === 'second_reviewer' ? t('跟随校对人') : t('未分配'))}
            </Typography.Text>
          ))}
        </div>
        )
      })}
    </div>
    <Typography.Text className={workflow.stage === 'returned' ? 'course-workflow-summary is-returned' : 'course-workflow-summary'} ellipsis={{ tooltip: summary }} type="secondary">
      {summary}
    </Typography.Text>
    <div className="course-workflow-details">
      <Typography.Text type="secondary">
        {t('校对负责人：')}{workflow.proofreaderAssignee?.displayName ?? t('未分配')} · {t('二审负责人：')}{workflow.secondReviewerAssignee?.displayName ?? t('未分配')}
      </Typography.Text>
      {(workflow.drafts ?? []).map((draft) => (
        <Typography.Text key={`${draft.adminUserId}-${draft.status}`} type={draft.status === 'returned' ? 'warning' : 'secondary'}>
          {draft.contributorDisplayName} · {draft.status === 'submitted' ? t('已提交二审') : draft.status === 'returned' ? `${t('已退回')}${draft.reviewNote ? `：${draft.reviewNote}` : ''}` : draft.status === 'editing' ? t('校对草稿中') : t('已通过')}
        </Typography.Text>
      ))}
    </div>
  </div>
}

export function CourseManager({
  adminToken, currentAdminId, categoryGroups, categories, isCatalogLoading, catalogLoadError, onRefreshCatalog, isSaving, onCreateCourse,
  onDeleteCourse, onEditCourse, onMoveCourse, onOpenRecorder, onRenameCourse, canManageCourses = true, onReviewSubtitleDraft,
  contributors, onUpdateWorkflowAssignee, reviewTasks, workflowNotifications, onReadWorkflowNotifications, onNotify,
}: CourseManagerProps) {
  const { t, uiLocale } = useAdminLanguage()
  // 筛选器不提供"全部"选项：用户必须选中一个具体系列（目录加载完成前
  // 用 0 表示尚未就绪，此时不发起课程请求）。
  const [selectedGroupId, setSelectedGroupId] = useState<number>(0)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(0)
  const [selectedStatus, setSelectedStatus] = useState<CourseStatus>('all')
  const [searchText, setSearchText] = useState('')
  const [renamingExercise, setRenamingExercise] = useState<CatalogExerciseSummary | null>(null)
  const [nextTitle, setNextTitle] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagedExercises, setPagedExercises] = useState<CatalogExerciseSummary[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [revertingExercise, setRevertingExercise] = useState<CatalogExerciseSummary | null>(null)
  const [revertReason, setRevertReason] = useState('')
  const [isReverting, setIsReverting] = useState(false)
  const [versionsExercise, setVersionsExercise] = useState<CatalogExerciseSummary | null>(null)
  const [versions, setVersions] = useState<ExerciseSubtitleVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const requestSerialRef = useRef(0)
  const hasRestoredLastCategoryRef = useRef(false)

  const visibleCategories = useMemo(() => categories.filter((category) => category.groupId === selectedGroupId), [categories, selectedGroupId])

  useEffect(() => {
    if (categories.length === 0) return

    if (hasRestoredLastCategoryRef.current && selectedCategoryId && categories.some((category) => category.id === selectedCategoryId)) {
      return
    }

    const storedCategoryId = Number(localStorage.getItem(LAST_CATEGORY_STORAGE_KEY))
    const initialCategory = categories.find((item) => item.id === storedCategoryId) ?? categories[0]
    hasRestoredLastCategoryRef.current = true
    setSelectedCategoryId(initialCategory.id)
    setSelectedGroupId(initialCategory.groupId)
  }, [categories, selectedCategoryId])

  const loadPage = useCallback(async () => {
    const requestSerial = ++requestSerialRef.current
    // 先加载目录并确定系列，再请求该系列课程，避免空筛选请求与目录请求竞态。
    if (categories.length === 0 || !selectedCategoryId) {
      setPagedExercises([])
      setTotal(0)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const result = await apiClient.getAdminExercisesPage(adminToken, {
        page,
        pageSize,
        groupId: selectedGroupId,
        categoryId: selectedCategoryId,
        ...(selectedStatus === 'all' ? {} : { status: selectedStatus }),
        ...(searchText.trim() ? { search: searchText } : {}),
      })
      if (requestSerial === requestSerialRef.current) {
        setPagedExercises(result.items)
        setTotal(result.total)
      }
    } finally {
      if (requestSerial === requestSerialRef.current) setIsLoading(false)
    }
  }, [adminToken, categories, page, pageSize, searchText, selectedCategoryId, selectedGroupId, selectedStatus])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const createTargetCategoryId = selectedCategoryId || visibleCategories[0]?.id || 0
  const resetFilters = () => {
    const firstCategory = categories[0]
    setSelectedGroupId(firstCategory?.groupId ?? 0)
    setSelectedCategoryId(firstCategory?.id ?? 0)
    setSelectedStatus('all')
    setSearchText('')
    setPage(1)
  }
  const changeGroup = (groupId: number) => {
    setSelectedGroupId(groupId)
    setPage(1)

    const firstCategory = categories.find((item) => item.groupId === groupId)
    setSelectedCategoryId(firstCategory?.id ?? 0)
    if (firstCategory) {
      localStorage.setItem(LAST_CATEGORY_STORAGE_KEY, String(firstCategory.id))
    }
  }
  const changeCategory = (categoryId: number) => {
    setSelectedCategoryId(categoryId)
    setPage(1)
    const category = categories.find((item) => item.id === categoryId)
    if (category) {
      setSelectedGroupId(category.groupId)
      localStorage.setItem(LAST_CATEGORY_STORAGE_KEY, String(category.id))
    }
  }
  const canMove = (exercise: CatalogExerciseSummary, direction: 'up' | 'down') => {
    // 注意：不能用父层全量 exercises 判断——它是按需加载的（仅 importer/recorder
    // 区块），直接刷新课程管理页时为空，会导致所有排序按钮被误禁用。
    // 这里基于当前分页数据判断；页边界课程的相邻项可能在上一页/下一页，
    // 此时也允许移动（真正交换由 moveCourse 用全量数据完成）。
    const siblings = pagedExercises.filter((item) => item.categoryId === exercise.categoryId).sort((left, right) => left.sortOrder - right.sortOrder)
    const index = siblings.findIndex((item) => item.id === exercise.id)
    if (index < 0) return false
    if (direction === 'up') return index > 0 || page > 1
    return index < siblings.length - 1 || page * pageSize < total
  }
  const canRecord = (exercise: CatalogExerciseSummary) => exercise.status === 'published' && Boolean(exercise.audioUrl) && exercise.lineCount > 0
  // 二审负责人只处理已提交稿，不应被“编辑”入口带到校对工作台。
  // 未分配二审人的历史课程则保留原有的被授权即可编辑行为。
  const canEditCourseSubtitles = (exercise: CatalogExerciseSummary) => (
    canManageCourses
    || (
      exercise.workflow?.proofreaderAssignee?.adminUserId === currentAdminId
      && !['submitted', 'approved'].includes(
        exercise.workflow?.drafts?.find((draft) => draft.adminUserId === currentAdminId)?.status ?? '',
      )
    )
    // 已流转给当前成员的审核任务只能从“开始审核”进入，避免把审核人误带进校对编辑器。
    || (!reviewTasks.some((task) => task.exerciseId === exercise.id)
      && exercise.workflow?.secondReviewerAssignee?.adminUserId !== currentAdminId)
  )
  const openRecorder = (exercise: CatalogExerciseSummary) => {
    if (canRecord(exercise)) {
      onOpenRecorder(exercise.id)
      return
    }

    const missing = [
      exercise.status !== 'published' && t('发布课程'),
      !exercise.audioUrl && t('上传媒体'),
      exercise.lineCount <= 0 && t('完成字幕时间轴'),
    ].filter(Boolean).join('、')
    Modal.warning({
      title: t('课程暂不能录制'),
      content: t('“{{title}}”还需要：{{missing}}。完成后可从这里直接打开视频录制台。', { title: exercise.title, missing }),
    })
  }
  const openRenameDialog = (exercise: CatalogExerciseSummary) => {
    setRenamingExercise(exercise)
    setNextTitle(exercise.title)
  }
  const saveRename = async () => {
    if (!renamingExercise || !nextTitle.trim()) return
    setIsRenaming(true)
    try {
      await onRenameCourse(renamingExercise, nextTitle.trim())
      setRenamingExercise(null)
    } finally {
      setIsRenaming(false)
    }
  }

  const openRevertDialog = (exercise: CatalogExerciseSummary) => {
    setRevertingExercise(exercise)
    setRevertReason('')
  }

  const confirmRevert = async () => {
    if (!revertingExercise || !revertReason.trim()) return
    setIsReverting(true)
    try {
      await apiClient.revertPublishedSubtitle(revertingExercise.id, revertReason.trim(), adminToken)
      onNotify(t('课程已回退到草稿，并重新开放领取'), 'success')
      setRevertingExercise(null)
      setRevertReason('')
      // 回退后课程状态从"已发布"变为"草稿"，重新拉取当前列表以反映状态变化。
      void loadPage()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('课程回退失败'), 'error')
    } finally {
      setIsReverting(false)
    }
  }

  const openVersions = async (exercise: CatalogExerciseSummary) => {
    setVersionsExercise(exercise)
    setVersions([])
    setVersionsLoading(true)
    try {
      const result = await apiClient.getExerciseSubtitleVersions(exercise.id, adminToken)
      setVersions(result.items)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('字幕版本历史加载失败'), 'error')
      setVersions([])
    } finally {
      setVersionsLoading(false)
    }
  }

  const versionColumns: ColumnsType<ExerciseSubtitleVersion> = [
    { title: t('版本'), dataIndex: 'versionNo', key: 'versionNo', width: 70, render: (value: number) => <Typography.Text strong>v{value}</Typography.Text> },
    {
      title: t('来源'), dataIndex: 'source', key: 'source', width: 90,
      render: (source: ExerciseSubtitleVersion['source']) => source === 'submitted'
        ? <Tag color="blue">{t('提交')}</Tag>
        : source === 'approved'
          ? <Tag color="green">{t('发布')}</Tag>
          : <Tag color="magenta">{t('回退')}</Tag>,
    },
    { title: t('操作者'), dataIndex: 'adminDisplayName', key: 'adminDisplayName', width: 120 },
    { title: t('时间'), dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (value: string) => formatSubmittedAt(value, uiLocale) },
    { title: t('理由'), dataIndex: 'note', key: 'note', render: (value?: string) => value ? <Typography.Text type="secondary">{value}</Typography.Text> : '—' },
    { title: t('句数'), dataIndex: 'lines', key: 'lineCount', width: 70, render: (lines: ExerciseSubtitleVersion['lines']) => lines.length },
  ]

  const updateWorkflowAssignee = async (
    exercise: CatalogExerciseSummary,
    workflowRole: 'proofreader' | 'second_reviewer',
    adminUserId: number | undefined,
  ) => {
    try {
      await onUpdateWorkflowAssignee(exercise, workflowRole, adminUserId)
      // 课程列表是分页独立加载的，接口成功后只同步当前步骤负责人，
      // 不把“计划职责”误写成已完成的公开贡献署名。
      const assignee = contributors.find((contributor) => contributor.id === adminUserId)
      setPagedExercises((current) => current.map((item) => (
        item.id === exercise.id
          ? {
            ...item,
            workflow: {
              ...(item.workflow ?? { stage: 'draft' as const }),
              [workflowRole === 'proofreader' ? 'proofreaderAssignee' : 'secondReviewerAssignee']:
                assignee ? { adminUserId: assignee.id, displayName: assignee.displayName } : undefined,
            },
          }
          : item
      )))
    } catch {
      // 父级已展示具体错误；保留当前选择，避免把失败请求误显示为已授权。
    }
  }

  const columns: ColumnsType<CatalogExerciseSummary> = [
    {
      title: t('课程'), dataIndex: 'title', key: 'title', width: 250,
      render: (_, exercise) => <Space align="start" size={8}>
        {exercise.coverImageUrl ? <Image alt={`${exercise.title} ${t('封面')}`} height={40} preview={false} src={resolveApiUrl(exercise.coverImageUrl)} width={56} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div className="course-table-cover">{exercise.mediaType === 'video' ? 'V' : 'A'}</div>}
        <Space direction="vertical" size={2}>
          <Space size={4}><Typography.Text strong>{exercise.title}</Typography.Text>{canManageCourses && <Tooltip title={t('快速修改名称')}><Button icon={<Pencil size={13} />} onClick={() => openRenameDialog(exercise)} size="small" type="text" /></Tooltip>}</Space>
          <Typography.Text ellipsis={{ tooltip: exercise.summary }} type="secondary" style={{ maxWidth: 170 }}>{exercise.summary || exercise.source}</Typography.Text>
        </Space>
      </Space>,
    },
    {
      title: t('内容'), key: 'details', width: 105,
      render: (_, exercise) => <Typography.Text type="secondary">
        {exercise.mediaType === 'video' ? t('视频') : t('音频')} · {exercise.lineCount} {t('句')}
      </Typography.Text>,
    },
    {
      title: t('排序'), dataIndex: 'sortOrder', key: 'sortOrder', width: 72,
      render: (sortOrder: number) => <Typography.Text>{sortOrder}</Typography.Text>,
    },
    {
      title: t('发布状态 / 协作流程'), dataIndex: 'status', key: 'workflow', width: 520,
      render: (status: Exclude<CourseStatus, 'all'>, exercise) => <Space direction="vertical" size={5}>
        <Space size={4} wrap>
          <Tag color={statusColors[status]}>{t('内容：')}{t(statusLabels[status])}</Tag>
          <Tag color={exercise.workflow?.stage === 'awaiting_review' ? 'orange' : exercise.workflow?.stage === 'returned' ? 'warning' : exercise.workflow?.stage === 'published' ? 'green' : 'blue'}>
            {t('协作：')}{exercise.workflow?.stage === 'awaiting_review' ? t('待审核') : exercise.workflow?.stage === 'returned' ? t('待修改') : exercise.workflow?.stage === 'proofreading' ? t('校对中') : exercise.workflow?.stage === 'published' ? t('已完成') : exercise.workflow?.stage === 'archived' ? t('已归档') : t('待开始')}
          </Tag>
          {(exercise.pendingSubtitleDraftCount ?? 0) > 0 && <Tag color="orange">{t('待二审')} {exercise.pendingSubtitleDraftCount}</Tag>}
        </Space>
        <CourseWorkflow
          canManageCourses={canManageCourses}
          contributors={contributors}
          exercise={exercise}
          onUpdateWorkflowAssignee={(workflowRole, adminUserId) => {
            void updateWorkflowAssignee(exercise, workflowRole, adminUserId)
          }}
        />
      </Space>,
    },
    {
      title: t('完整度'), key: 'readiness', width: 100,
      render: (_, exercise) => <Space direction="vertical" size={1}>
        <Typography.Text type={exercise.audioUrl ? undefined : 'danger'}>{exercise.audioUrl ? t('媒体') : t('缺媒体')}</Typography.Text>
        <Typography.Text type={exercise.lineCount > 0 ? undefined : 'danger'}>{exercise.lineCount > 0 ? t('字幕') : t('缺字幕')}</Typography.Text>
      </Space>,
    },
    {
      title: t('操作'), key: 'actions', width: 200, fixed: 'right',
      render: (_, exercise) => <Space size={4}>
        {canEditCourseSubtitles(exercise) && <Button disabled={isSaving} icon={<FilePenLine size={15} />} onClick={() => onEditCourse(exercise)} size="small">{t('编辑')}</Button>}
        <Tooltip title={t('查看字幕版本历史')}><Button icon={<History size={15} />} onClick={() => void openVersions(exercise)} size="small" type="text" /></Tooltip>
        {canManageCourses && <Tooltip title={t('在系列内上移')}><Button disabled={isSaving || !canMove(exercise, 'up')} icon={<ArrowUp size={15} />} onClick={() => onMoveCourse(exercise.id, 'up')} size="small" type="text" /></Tooltip>}
        {canManageCourses && <Tooltip title={t('在系列内下移')}><Button disabled={isSaving || !canMove(exercise, 'down')} icon={<ArrowDown size={15} />} onClick={() => onMoveCourse(exercise.id, 'down')} size="small" type="text" /></Tooltip>}
        {canManageCourses && <Tooltip title={t('打开视频录制台')}>
          <Button icon={<PlaySquare size={15} />} onClick={() => openRecorder(exercise)} size="small" type="text" />
        </Tooltip>}
        {reviewTasks.some((task) => task.exerciseId === exercise.id) && onReviewSubtitleDraft && <Tooltip title={t('审核字幕投稿')}><Button icon={<Undo2 size={15} />} onClick={() => onReviewSubtitleDraft(exercise.id)} size="small" type="text" /></Tooltip>}
          {canManageCourses && <Dropdown menu={{ items: [
          ...(exercise.status === 'published' ? [{ disabled: isSaving, icon: <RotateCcw size={15} />, key: 'revert', label: t('回退到草稿') }] : []),
          { danger: true, disabled: isSaving, icon: <Trash2 size={15} />, key: 'delete', label: t('删除课程') },
        ], onClick: ({ key }) => { if (key === 'revert') openRevertDialog(exercise); if (key === 'delete') onDeleteCourse(exercise) } }}>
          <Button icon={<Ellipsis size={17} />} size="small" type="text" />
        </Dropdown>}
      </Space>,
    },
  ]

  const selectedCategoryExists = Boolean(
    selectedCategoryId && categories.some((category) => category.id === selectedCategoryId),
  )
  const createCourseDisabledReason = isSaving
    ? t('后台正在保存、删除或调整课程顺序，请等待当前操作完成。')
    : isCatalogLoading
      ? t('正在加载内容分类和学习系列，请稍候。')
      : catalogLoadError
        ? t('目录加载失败：{{error}}', { error: catalogLoadError })
        : categoryGroups.length === 0
          ? t('当前还没有内容分类，请先到“目录结构”中新建内容分类。')
          : categories.length === 0
            ? t('已有内容分类，但还没有学习系列，请先到“目录结构”中新建学习系列。')
            : !selectedCategoryExists
              ? t('当前没有选中有效的学习系列，请重新选择学习系列或刷新页面。')
              : ''
  const createCourseDisabled = Boolean(createCourseDisabledReason)

  return <Card
    className="course-manager"
    extra={<Space>
      <Popover
        content={<div className="workflow-notification-list">
          {workflowNotifications.items.length === 0 ? <Typography.Text type="secondary">{t('暂时没有工作流通知')}</Typography.Text> : workflowNotifications.items.map((notification) => (
            <div className={notification.isRead ? 'workflow-notification-item' : 'workflow-notification-item is-unread'} key={notification.id}>
              <Typography.Text>{workflowNotificationCopy(notification, t)}</Typography.Text>
              <Typography.Text type="secondary">{notification.exerciseTitle} · {formatSubmittedAt(notification.createdAt, uiLocale)}</Typography.Text>
              {notification.reviewNote && <Typography.Text type="secondary">{t('意见：')}{notification.reviewNote}</Typography.Text>}
            </div>
          ))}
        </div>}
        onOpenChange={(open) => {
          if (open && workflowNotifications.unreadCount > 0) void onReadWorkflowNotifications()
        }}
        placement="bottomRight"
        title={t('工作流通知')}
        trigger="click"
      >
        <Badge count={workflowNotifications.unreadCount} overflowCount={99} size="small">
          <Button aria-label={t('查看工作流通知')} icon={<Bell size={15} />} />
        </Badge>
      </Popover>
      <Button disabled={isSaving || isLoading || isCatalogLoading} icon={<RefreshCw size={15} />} onClick={() => void onRefreshCatalog().catch(() => undefined)}>{t('刷新')}</Button>
      {canManageCourses && (
        <BatchCourseImporter
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          initialCategoryId={selectedCategoryId}
          isSaving={isSaving}
          onNotify={onNotify}
          onRefreshCatalog={onRefreshCatalog}
        />
      )}
      {canManageCourses && <Tooltip title={createCourseDisabled ? createCourseDisabledReason : undefined}>
        <span>
          <Button disabled={createCourseDisabled} icon={<Plus size={15} />} onClick={() => onCreateCourse(createTargetCategoryId)} type="primary">{t('新建课程')}</Button>
        </span>
      </Tooltip>}
    </Space>}
    title={<Space><BookOpen size={18} /><span>{t('课程管理')}</span></Space>}
  >
    {createCourseDisabled && (
      <Alert
        description={createCourseDisabledReason}
        message={t('暂时无法新建课程')}
        showIcon
        style={{ marginBottom: 16 }}
        type={catalogLoadError ? 'error' : 'warning'}
      />
    )}
    <Form className="course-filter-form" layout="inline">
    <Form.Item label={t('内容分类')}><Select value={selectedGroupId || undefined} placeholder={t('选择内容分类')} onChange={(value) => changeGroup(Number(value))} options={categoryGroups.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
      <Form.Item label={t('学习系列')}><Select value={selectedCategoryId || undefined} placeholder={t('选择学习系列')} onChange={(value) => changeCategory(Number(value))} options={visibleCategories.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
      <Form.Item label={t('发布状态')}><Select value={selectedStatus} onChange={(value) => setSelectedStatus(value as CourseStatus)} options={[{ label: t('全部状态'), value: 'all' }, { label: t('草稿'), value: 'draft' }, { label: t('已校对'), value: 'proofread' }, { label: t('已发布'), value: 'published' }, { label: t('已归档'), value: 'archived' }]} /></Form.Item>
      <Form.Item><Input allowClear prefix={<Search size={15} />} placeholder={t('搜索课程标题、来源或摘要')} value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1) }} /></Form.Item>
      <Button onClick={resetFilters} type="link">{t('重置筛选')}</Button>
    </Form>
    <Space className="course-table-summary" direction="vertical" size={2}>
      <Typography.Text strong>{t('共 {{count}} 门课程', { count: total })}</Typography.Text>
      <Typography.Text type="secondary">{t('排序仅在同一学习系列内生效。')}</Typography.Text>
    </Space>
    <div className="course-table-wrap">
    <Table
      columns={columns}
      dataSource={pagedExercises}
      loading={isLoading}
      locale={{ emptyText: <Empty description={t('当前筛选条件下还没有课程。')} /> }}
      pagination={{
        current: page,
        pageSize,
        showSizeChanger: true,
        showTotal: (count) => t('共 {{count}} 门课程', { count }),
        total,
        onChange: (nextPage, nextPageSize) => {
          setPage(nextPage)
          if (nextPageSize !== pageSize) setPageSize(nextPageSize)
        },
      }}
      rowKey="id"
      size="small"
      scroll={{ x: canManageCourses ? 1400 : 1190 }}
    />
    </div>
    <Modal
      okButtonProps={{ disabled: !nextTitle.trim(), loading: isRenaming }}
      onCancel={() => setRenamingExercise(null)}
      onOk={() => void saveRename()}
      open={Boolean(renamingExercise)}
      title={t('修改课程名称')}
    >
      <Input autoFocus maxLength={160} onChange={(event) => setNextTitle(event.target.value)} onPressEnter={() => void saveRename()} value={nextTitle} />
    </Modal>

    <Modal
      okButtonProps={{ disabled: !revertReason.trim(), loading: isReverting }}
      okText={t('确认回退')}
      onCancel={() => { if (!isReverting) setRevertingExercise(null) }}
      onOk={() => void confirmRevert()}
      open={Boolean(revertingExercise)}
      title={t('回退到草稿')}
    >
      <Space direction="vertical" size={8} style={{ display: 'flex' }}>
        <Typography.Text type="secondary">
          {t('将《{{title}}》回退到草稿并重新开放领取。现有字幕会保留，作为下一次校对的起点；本次回退理由会记入版本历史与协作动态。', { title: revertingExercise?.title ?? '' })}
        </Typography.Text>
        <Input.TextArea
          autoFocus
          maxLength={4000}
          onChange={(event) => setRevertReason(event.target.value)}
          placeholder={t('请填写回退理由（必填）')}
          rows={4}
          value={revertReason}
        />
      </Space>
    </Modal>

    <Modal
      footer={null}
      onCancel={() => setVersionsExercise(null)}
      open={Boolean(versionsExercise)}
      title={<Space><History size={16} /><span>{t('字幕版本历史')}</span>{versionsExercise && <Typography.Text type="secondary">{versionsExercise.title}</Typography.Text>}</Space>}
      width={760}
    >
      <Table<ExerciseSubtitleVersion>
        columns={versionColumns}
        dataSource={versions}
        expandable={{
          expandedRowRender: (version) => (
            <div style={{ padding: '4px 12px 8px' }}>
              {version.lines.length === 0 ? (
                <Typography.Text type="secondary">{t('该版本没有字幕行')}</Typography.Text>
              ) : (
                <div className="subtitle-version-lines">
                  {version.lines.map((line) => (
                    <div className="subtitle-version-line" key={line.id}>
                      <Typography.Text className="subtitle-version-time" type="secondary">
                        {formatTimestamp(line.start)} – {formatTimestamp(line.end)}
                      </Typography.Text>
                      <Typography.Text>{line.text}</Typography.Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        }}
        loading={versionsLoading}
        locale={{ emptyText: <Empty description={t('还没有字幕版本记录。')} /> }}
        pagination={false}
        rowKey="id"
        size="small"
      />
    </Modal>
  </Card>
}
