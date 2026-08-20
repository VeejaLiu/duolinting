import { ArrowDown, ArrowUp, Bell, BookOpen, Ellipsis, FilePenLine, Pencil, PlaySquare, Plus, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, Dropdown, Empty, Form, Image, Input, Modal, Popover, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { AdminMember, AdminReviewTask, AdminWorkflowNotifications, CatalogExerciseSummary, ExerciseCategory, MaterialCategory } from '@duolinting/shared'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'
import { BatchCourseImporter } from './BatchCourseImporter'

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

const formatSubmittedAt = (value?: string) => value
  ? new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value))
  : ''

const workflowNotificationCopy = (notification: AdminWorkflowNotifications['items'][number]) => {
  if (notification.type === 'subtitle_submitted') return `${notification.actorDisplayName} 提交了校对稿`
  if (notification.type === 'subtitle_returned') return `${notification.actorDisplayName} 退回了稿件`
  if (notification.type === 'subtitle_approved') return `${notification.actorDisplayName} 审核通过并发布了稿件`
  if (notification.type === 'task_claim_expiring') return `${notification.exerciseTitle} 的领取任务即将到期，请尽快保存或提交`
  return `${notification.exerciseTitle} 的领取任务已超时，已释放回任务池`
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
  const workflow: NonNullable<CatalogExerciseSummary['workflow']> = exercise.workflow ?? {
    stage: exercise.status === 'published' ? 'published' : exercise.status === 'archived' ? 'archived' : exercise.status === 'proofread' ? 'awaiting_review' : 'draft',
  }
  const activeIndex = workflowStageIndex[workflow.stage]
  const summary = workflow.stage === 'awaiting_review'
    ? `${workflow.contributorDisplayName ?? '字幕贡献者'} 已提交${workflow.submittedAt ? ` · ${formatSubmittedAt(workflow.submittedAt)}` : ''}`
    : workflow.stage === 'returned'
      ? `${workflow.contributorDisplayName ?? '字幕贡献者'} 待修改${workflow.reviewNote ? ` · ${workflow.reviewNote}` : ''}`
      : workflow.stage === 'proofreading'
        ? `${workflow.contributorDisplayName ?? '字幕贡献者'} 正在校对`
        : workflow.stage === 'published'
          ? `校对：${workflow.proofreaderDisplayName ?? '—'} · 二审：${workflow.secondReviewerDisplayName ?? '—'}`
          : workflow.stage === 'archived'
            ? '课程已归档'
            : '分配一位字幕贡献者后，将自动负责校对和二次审核'

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
    <div className="course-workflow-steps" aria-label={`工作流：${summary}`}>
      {workflowSteps.map((step, index) => {
        const workflowRole = workflowStepRole(index)
        const assignee = workflowRole ? assigneeForRole(workflowRole) : undefined
        return (
        <div className={index <= activeIndex ? 'course-workflow-step is-complete' : 'course-workflow-step'} key={step}>
          <div className="course-workflow-step-label">
            <span className={index === activeIndex ? 'course-workflow-dot is-active' : 'course-workflow-dot'}>{index + 1}</span>
            <span>{step}</span>
          </div>
          {workflowRole && (canManageCourses && workflowRole === 'proofreader' ? (
            <Select
              allowClear
              className="course-workflow-assignee-select"
              onChange={(adminUserId: number | undefined) => onUpdateWorkflowAssignee(workflowRole, adminUserId)}
              options={contributors.map((contributor) => ({
                label: `${contributor.displayName}${contributor.mustChangePassword ? '（待首次改密）' : ''}`,
                value: contributor.id,
              }))}
              placeholder={workflowRole === 'proofreader' ? '选择校对人' : '选择二审人'}
              size="small"
              value={assignee?.adminUserId}
            />
          ) : (
            <Typography.Text className="course-workflow-assignee-name" ellipsis type="secondary">
              {assignee?.displayName ?? (workflowRole === 'second_reviewer' ? '跟随校对人' : '未分配')}
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
        校对负责人：{workflow.proofreaderAssignee?.displayName ?? '未分配'} · 二审负责人：{workflow.secondReviewerAssignee?.displayName ?? '未分配'}
      </Typography.Text>
      {(workflow.drafts ?? []).map((draft) => (
        <Typography.Text key={`${draft.adminUserId}-${draft.status}`} type={draft.status === 'returned' ? 'warning' : 'secondary'}>
          {draft.contributorDisplayName} · {draft.status === 'submitted' ? '已提交二审' : draft.status === 'returned' ? `已退回${draft.reviewNote ? `：${draft.reviewNote}` : ''}` : draft.status === 'editing' ? '校对草稿中' : '已通过'}
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
      exercise.status !== 'published' && '发布课程',
      !exercise.audioUrl && '上传媒体',
      exercise.lineCount <= 0 && '完成字幕时间轴',
    ].filter(Boolean).join('、')
    Modal.warning({
      title: '课程暂不能录制',
      content: `“${exercise.title}”还需要：${missing}。完成后可从这里直接打开视频录制台。`,
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
      title: '课程', dataIndex: 'title', key: 'title', width: 250,
      render: (_, exercise) => <Space align="start" size={8}>
        {exercise.coverImageUrl ? <Image alt={`${exercise.title} 封面`} height={40} preview={false} src={resolveApiUrl(exercise.coverImageUrl)} width={56} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div className="course-table-cover">{exercise.mediaType === 'video' ? '视' : '音'}</div>}
        <Space direction="vertical" size={2}>
          <Space size={4}><Typography.Text strong>{exercise.title}</Typography.Text>{canManageCourses && <Tooltip title="快速修改名称"><Button icon={<Pencil size={13} />} onClick={() => openRenameDialog(exercise)} size="small" type="text" /></Tooltip>}</Space>
          <Typography.Text ellipsis={{ tooltip: exercise.summary }} type="secondary" style={{ maxWidth: 170 }}>{exercise.summary || exercise.source}</Typography.Text>
        </Space>
      </Space>,
    },
    {
      title: '内容', key: 'details', width: 105,
      render: (_, exercise) => <Typography.Text type="secondary">
        {exercise.mediaType === 'video' ? '视频' : '音频'} · {exercise.lineCount} 句
      </Typography.Text>,
    },
    {
      title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 72,
      render: (sortOrder: number) => <Typography.Text>{sortOrder}</Typography.Text>,
    },
    {
      title: '发布状态 / 协作流程', dataIndex: 'status', key: 'workflow', width: 520,
      render: (status: Exclude<CourseStatus, 'all'>, exercise) => <Space direction="vertical" size={5}>
        <Space size={4} wrap>
          <Tag color={statusColors[status]}>内容：{statusLabels[status]}</Tag>
          <Tag color={exercise.workflow?.stage === 'awaiting_review' ? 'orange' : exercise.workflow?.stage === 'returned' ? 'warning' : exercise.workflow?.stage === 'published' ? 'green' : 'blue'}>
            协作：{exercise.workflow?.stage === 'awaiting_review' ? '待审核' : exercise.workflow?.stage === 'returned' ? '待修改' : exercise.workflow?.stage === 'proofreading' ? '校对中' : exercise.workflow?.stage === 'published' ? '已完成' : exercise.workflow?.stage === 'archived' ? '已归档' : '待开始'}
          </Tag>
          {(exercise.pendingSubtitleDraftCount ?? 0) > 0 && <Tag color="orange">待二审 {exercise.pendingSubtitleDraftCount}</Tag>}
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
      title: '完整度', key: 'readiness', width: 100,
      render: (_, exercise) => <Space direction="vertical" size={1}>
        <Typography.Text type={exercise.audioUrl ? undefined : 'danger'}>{exercise.audioUrl ? '媒体' : '缺媒体'}</Typography.Text>
        <Typography.Text type={exercise.lineCount > 0 ? undefined : 'danger'}>{exercise.lineCount > 0 ? '字幕' : '缺字幕'}</Typography.Text>
      </Space>,
    },
    {
      title: '操作', key: 'actions', width: 172, fixed: 'right',
      render: (_, exercise) => <Space size={4}>
        {canEditCourseSubtitles(exercise) && <Button disabled={isSaving} icon={<FilePenLine size={15} />} onClick={() => onEditCourse(exercise)} size="small">编辑</Button>}
        {canManageCourses && <Tooltip title="在系列内上移"><Button disabled={isSaving || !canMove(exercise, 'up')} icon={<ArrowUp size={15} />} onClick={() => onMoveCourse(exercise.id, 'up')} size="small" type="text" /></Tooltip>}
        {canManageCourses && <Tooltip title="在系列内下移"><Button disabled={isSaving || !canMove(exercise, 'down')} icon={<ArrowDown size={15} />} onClick={() => onMoveCourse(exercise.id, 'down')} size="small" type="text" /></Tooltip>}
        {canManageCourses && <Tooltip title="打开视频录制台">
          <Button icon={<PlaySquare size={15} />} onClick={() => openRecorder(exercise)} size="small" type="text" />
        </Tooltip>}
        {reviewTasks.some((task) => task.exerciseId === exercise.id) && onReviewSubtitleDraft && <Tooltip title="审核字幕投稿"><Button icon={<Undo2 size={15} />} onClick={() => onReviewSubtitleDraft(exercise.id)} size="small" type="text" /></Tooltip>}
        {canManageCourses && <Dropdown menu={{ items: [
          { danger: true, disabled: isSaving, icon: <Trash2 size={15} />, key: 'delete', label: '删除课程' },
        ], onClick: ({ key }) => { if (key === 'delete') onDeleteCourse(exercise) } }}>
          <Button icon={<Ellipsis size={17} />} size="small" type="text" />
        </Dropdown>}
      </Space>,
    },
  ]

  const selectedCategoryExists = Boolean(
    selectedCategoryId && categories.some((category) => category.id === selectedCategoryId),
  )
  const createCourseDisabledReason = isSaving
    ? '后台正在保存、删除或调整课程顺序，请等待当前操作完成。'
    : isCatalogLoading
      ? '正在加载内容分类和学习系列，请稍候。'
      : catalogLoadError
        ? `目录加载失败：${catalogLoadError}`
        : categoryGroups.length === 0
          ? '当前还没有内容分类，请先到“目录结构”中新建内容分类。'
          : categories.length === 0
            ? '已有内容分类，但还没有学习系列，请先到“目录结构”中新建学习系列。'
            : !selectedCategoryExists
              ? '当前没有选中有效的学习系列，请重新选择学习系列或刷新页面。'
              : ''
  const createCourseDisabled = Boolean(createCourseDisabledReason)

  return <Card
    className="course-manager"
    extra={<Space>
      <Popover
        content={<div className="workflow-notification-list">
          {workflowNotifications.items.length === 0 ? <Typography.Text type="secondary">暂时没有工作流通知</Typography.Text> : workflowNotifications.items.map((notification) => (
            <div className={notification.isRead ? 'workflow-notification-item' : 'workflow-notification-item is-unread'} key={notification.id}>
              <Typography.Text>{workflowNotificationCopy(notification)}</Typography.Text>
              <Typography.Text type="secondary">{notification.exerciseTitle} · {formatSubmittedAt(notification.createdAt)}</Typography.Text>
              {notification.reviewNote && <Typography.Text type="secondary">意见：{notification.reviewNote}</Typography.Text>}
            </div>
          ))}
        </div>}
        onOpenChange={(open) => {
          if (open && workflowNotifications.unreadCount > 0) void onReadWorkflowNotifications()
        }}
        placement="bottomRight"
        title="工作流通知"
        trigger="click"
      >
        <Badge count={workflowNotifications.unreadCount} overflowCount={99} size="small">
          <Button aria-label="查看工作流通知" icon={<Bell size={15} />} />
        </Badge>
      </Popover>
      <Button disabled={isSaving || isLoading || isCatalogLoading} icon={<RefreshCw size={15} />} onClick={() => void onRefreshCatalog().catch(() => undefined)}>刷新</Button>
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
          <Button disabled={createCourseDisabled} icon={<Plus size={15} />} onClick={() => onCreateCourse(createTargetCategoryId)} type="primary">新建课程</Button>
        </span>
      </Tooltip>}
    </Space>}
    title={<Space><BookOpen size={18} /><span>课程管理</span></Space>}
  >
    {createCourseDisabled && (
      <Alert
        description={createCourseDisabledReason}
        message="暂时无法新建课程"
        showIcon
        style={{ marginBottom: 16 }}
        type={catalogLoadError ? 'error' : 'warning'}
      />
    )}
    <Form className="course-filter-form" layout="inline">
      <Form.Item label="内容分类"><Select value={selectedGroupId || undefined} placeholder="选择内容分类" onChange={(value) => changeGroup(Number(value))} options={categoryGroups.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
      <Form.Item label="学习系列"><Select value={selectedCategoryId || undefined} placeholder="选择学习系列" onChange={(value) => changeCategory(Number(value))} options={visibleCategories.map((item) => ({ label: item.name, value: item.id }))} /></Form.Item>
      <Form.Item label="发布状态"><Select value={selectedStatus} onChange={(value) => setSelectedStatus(value as CourseStatus)} options={[{ label: '全部状态', value: 'all' }, { label: '草稿', value: 'draft' }, { label: '已校对', value: 'proofread' }, { label: '已发布', value: 'published' }, { label: '已归档', value: 'archived' }]} /></Form.Item>
      <Form.Item><Input allowClear prefix={<Search size={15} />} placeholder="搜索课程标题、来源或摘要" value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1) }} /></Form.Item>
      <Button onClick={resetFilters} type="link">重置筛选</Button>
    </Form>
    <Space className="course-table-summary" direction="vertical" size={2}>
      <Typography.Text strong>共 {total} 门课程</Typography.Text>
      <Typography.Text type="secondary">排序仅在同一学习系列内生效。</Typography.Text>
    </Space>
    <div className="course-table-wrap">
    <Table
      columns={columns}
      dataSource={pagedExercises}
      loading={isLoading}
      locale={{ emptyText: <Empty description="当前筛选条件下还没有课程。" /> }}
      pagination={{
        current: page,
        pageSize,
        showSizeChanger: true,
        showTotal: (count) => `共 ${count} 门课程`,
        total,
        onChange: (nextPage, nextPageSize) => {
          setPage(nextPage)
          if (nextPageSize !== pageSize) setPageSize(nextPageSize)
        },
      }}
      rowKey="id"
      size="small"
      scroll={{ x: canManageCourses ? 1370 : 1160 }}
    />
    </div>
    <Modal
      okButtonProps={{ disabled: !nextTitle.trim(), loading: isRenaming }}
      onCancel={() => setRenamingExercise(null)}
      onOk={() => void saveRename()}
      open={Boolean(renamingExercise)}
      title="修改课程名称"
    >
      <Input autoFocus maxLength={160} onChange={(event) => setNextTitle(event.target.value)} onPressEnter={() => void saveRename()} value={nextTitle} />
    </Modal>
  </Card>
}
