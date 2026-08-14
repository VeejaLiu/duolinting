import { ArrowDown, ArrowUp, BookOpen, Ellipsis, FilePenLine, Pencil, PlaySquare, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Dropdown, Empty, Form, Image, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { CatalogExerciseSummary, ExerciseCategory, MaterialCategory } from '@duolinting/shared'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'

type CourseManagerProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  isCatalogLoading: boolean
  catalogLoadError: string
  onRefreshCatalog: () => Promise<void>
  categoryDraftName: string
  isSaving: boolean
  onCreateCourse: (categoryId: number) => void
  onDeleteCourse: (exercise: CatalogExerciseSummary) => void
  onEditCourse: (exercise: CatalogExerciseSummary) => void
  onMoveCourse: (exerciseId: number, direction: 'up' | 'down') => void
  onOpenRecorder: (exerciseId: number) => void
  onRenameCourse: (exercise: CatalogExerciseSummary, title: string) => Promise<void>
}

type CourseStatus = 'all' | 'draft' | 'published' | 'archived'

const difficultyLabels = { beginner: '入门', intermediate: '进阶', advanced: '高阶' }
const statusLabels = { draft: '草稿', published: '已发布', archived: '已归档' }
const statusColors = { draft: 'default', published: 'success', archived: 'purple' } as const
const LAST_CATEGORY_STORAGE_KEY = 'duolinting.admin.last-course-category-id'

export function CourseManager({
  adminToken, categoryGroups, categories, isCatalogLoading, catalogLoadError, onRefreshCatalog, categoryDraftName, isSaving, onCreateCourse,
  onDeleteCourse, onEditCourse, onMoveCourse, onOpenRecorder, onRenameCourse,
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

  const columns: ColumnsType<CatalogExerciseSummary> = [
    {
      title: '课程', dataIndex: 'title', key: 'title', width: 250,
      render: (_, exercise) => <Space align="start" size={8}>
        {exercise.coverImageUrl ? <Image alt={`${exercise.title} 封面`} height={40} preview={false} src={resolveApiUrl(exercise.coverImageUrl)} width={56} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div className="course-table-cover">{exercise.mediaType === 'video' ? '视' : '音'}</div>}
        <Space direction="vertical" size={2}>
          <Space size={4}><Typography.Text strong>{exercise.title}</Typography.Text><Tooltip title="快速修改名称"><Button icon={<Pencil size={13} />} onClick={() => openRenameDialog(exercise)} size="small" type="text" /></Tooltip></Space>
          <Typography.Text ellipsis={{ tooltip: exercise.summary }} type="secondary" style={{ maxWidth: 170 }}>{exercise.summary || exercise.source}</Typography.Text>
        </Space>
      </Space>,
    },
    {
      title: '归属', key: 'location', width: 160,
      render: (_, exercise) => {
        const category = categories.find((item) => item.id === exercise.categoryId)
        const group = categoryGroups.find((item) => item.id === category?.groupId)
        return <Space direction="vertical" size={1}><Typography.Text>{group?.name ?? '未分组'}</Typography.Text><Typography.Text type="secondary">{category?.name ?? (categoryDraftName || '未归档系列')}</Typography.Text></Space>
      },
    },
    {
      title: '内容', key: 'details', width: 140,
      render: (_, exercise) => <Space size={[4, 6]} wrap>
        <Tag>{exercise.mediaType === 'video' ? '视频' : '音频'}</Tag>
        <Tag>{difficultyLabels[exercise.difficulty]}</Tag>
        <Typography.Text type="secondary">{exercise.durationLabel}</Typography.Text>
        <Typography.Text type="secondary">{exercise.lineCount} 句</Typography.Text>
      </Space>,
    },
    {
      title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 72,
      render: (sortOrder: number) => <Typography.Text>{sortOrder}</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 78, render: (status: Exclude<CourseStatus, 'all'>) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag> },
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
        <Button disabled={isSaving} icon={<FilePenLine size={15} />} onClick={() => onEditCourse(exercise)} size="small">编辑</Button>
        <Tooltip title="在系列内上移"><Button disabled={isSaving || !canMove(exercise, 'up')} icon={<ArrowUp size={15} />} onClick={() => onMoveCourse(exercise.id, 'up')} size="small" type="text" /></Tooltip>
        <Tooltip title="在系列内下移"><Button disabled={isSaving || !canMove(exercise, 'down')} icon={<ArrowDown size={15} />} onClick={() => onMoveCourse(exercise.id, 'down')} size="small" type="text" /></Tooltip>
        <Tooltip title="打开视频录制台">
          <Button icon={<PlaySquare size={15} />} onClick={() => openRecorder(exercise)} size="small" type="text" />
        </Tooltip>
        <Dropdown menu={{ items: [
          { danger: true, disabled: isSaving, icon: <Trash2 size={15} />, key: 'delete', label: '删除课程' },
        ], onClick: ({ key }) => { if (key === 'delete') onDeleteCourse(exercise) } }}>
          <Button icon={<Ellipsis size={17} />} size="small" type="text" />
        </Dropdown>
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
      <Button disabled={isSaving || isLoading || isCatalogLoading} icon={<RefreshCw size={15} />} onClick={() => void onRefreshCatalog().catch(() => undefined)}>刷新</Button>
      <Tooltip title={createCourseDisabled ? createCourseDisabledReason : undefined}>
        <span>
          <Button disabled={createCourseDisabled} icon={<Plus size={15} />} onClick={() => onCreateCourse(createTargetCategoryId)} type="primary">新建课程</Button>
        </span>
      </Tooltip>
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
      <Form.Item label="发布状态"><Select value={selectedStatus} onChange={(value) => setSelectedStatus(value as CourseStatus)} options={[{ label: '全部状态', value: 'all' }, { label: '草稿', value: 'draft' }, { label: '已发布', value: 'published' }, { label: '已归档', value: 'archived' }]} /></Form.Item>
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
      scroll={{ x: 860 }}
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
