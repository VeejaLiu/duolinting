import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Pagination,
  Space,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Inbox,
  Lock,
  RefreshCw,
  TimerReset,
  UserCheck,
  UserX,
} from 'lucide-react'
import type {
  AdminReviewTask,
  AdminSubtitleWorkflowTaskInbox,
  AdminTaskClaimPolicy,
  AdminUser,
  AdminWorkflowOverview,
  ClaimableWorkflowTask,
  ExerciseCategory,
  MaterialCategory,
} from '@duolinting/shared'
import { apiClient } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type TaskPoolManagerProps = {
  adminToken: string
  adminUser: AdminUser
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  /** 领取成功后通知父级刷新课程列表与任务中心。 */
  onClaimed?: () => void | Promise<void>
  /** 放弃任务后通知父级刷新课程列表与任务中心。 */
  onReleased?: () => void | Promise<void>
  onRequestConfirm: (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) => Promise<boolean>
  workflowInbox: AdminSubtitleWorkflowTaskInbox
  reviewTasks: AdminReviewTask[]
  onReviewSubtitleDraft?: (exerciseId: number) => void
  onEditCourse: (exerciseId: number) => void
}

const difficultyLabel = (value: string, t: (key: string) => string) =>
  t(value === 'beginner' ? '入门' : value === 'intermediate' ? '进阶' : '高级')

const difficultyColor = (value: string) =>
  value === 'beginner' ? 'green' : value === 'intermediate' ? 'blue' : 'orange'

const difficultyTag = (task: ClaimableWorkflowTask, t: (key: string) => string) => (
  <Tag color={difficultyColor(task.difficulty)} variant="filled">
    {difficultyLabel(task.difficulty, t)}
  </Tag>
)

const formatDateTime = (value: string | undefined, locale: string) => value
  ? new Intl.DateTimeFormat(locale, {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value))
  : ''

/** 把 ISO 期限转为「还剩 1 天 6 小时」这类提示，超期显示为红色。 */
const formatClaimDeadline = (expiresAt: string | undefined, t: (key: string, values?: Record<string, string | number>) => string) => {
  if (!expiresAt) return null
  const remaining = new Date(expiresAt).getTime() - Date.now()
  const totalMinutes = Math.floor(remaining / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const text = remaining <= 0
    ? t('已超时')
    : days > 0
      ? t('还剩 {{days}} 天 {{hours}} 小时', { days, hours })
      : hours > 0
        ? t('还剩 {{hours}} 小时', { hours })
        : t('还剩 {{minutes}} 分钟', { minutes: Math.max(totalMinutes, 0) })
  return { text, expired: remaining <= 0 }
}

/** 统计卡：一个数值 + 一句说明，悬停高亮，用于概览与我的任务顶部。 */
function StatCard({ value, label, tone }: { value: number; label: string; tone?: 'blue' | 'orange' | 'gold' | 'green' | 'cyan' | 'default' }) {
  return (
    <div className="task-stat-card">
      <Typography.Text className="task-stat-value" style={{ color: tone === 'blue' ? '#1d4ed8' : tone === 'orange' ? '#c2410c' : tone === 'gold' ? '#a16207' : tone === 'green' ? '#15803d' : tone === 'cyan' ? '#0e7490' : '#1f2937' }}>
        {value}
      </Typography.Text>
      <Typography.Text className="task-stat-label">{label}</Typography.Text>
    </div>
  )
}

export function TaskPoolManager({
  adminToken,
  adminUser,
  categoryGroups,
  categories,
  onNotify,
  onClaimed,
  onReleased,
  onRequestConfirm,
  workflowInbox,
  reviewTasks,
  onReviewSubtitleDraft,
  onEditCourse,
}: TaskPoolManagerProps) {
  const { t, uiLocale } = useAdminLanguage()
  const [pool, setPool] = useState<ClaimableWorkflowTask[]>([])
  const [policy, setPolicy] = useState<AdminTaskClaimPolicy | null>(null)
  const [overview, setOverview] = useState<AdminWorkflowOverview | null>(null)
  // 初始为 true，避免首帧把空列表误显成「没有任务」的空态。
  const [loading, setLoading] = useState(true)
  const [busyExerciseId, setBusyExerciseId] = useState<number | null>(null)
  const [poolPage, setPoolPage] = useState(1)
  const [poolPageSize, setPoolPageSize] = useState(20)
  const [poolTotal, setPoolTotal] = useState(0)
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>()
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const isSuperAdmin = adminUser.role === 'super_admin'
  const [activeTab, setActiveTab] = useState<string>(isSuperAdmin ? 'overview' : 'claimable')
  const categoryOptions = useMemo(
    () => categories
      .filter((category) => !selectedGroupId || category.groupId === selectedGroupId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'))
      .map((category) => ({ label: category.name, value: category.id })),
    [categories, selectedGroupId],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (isSuperAdmin) {
        const overviewResult = await apiClient.getWorkflowOverview(adminToken)
        setOverview(overviewResult)
      }
      const poolResult = await apiClient.getClaimableWorkflowTasks(adminToken, {
        page: poolPage,
        pageSize: poolPageSize,
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
        ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
      })
      setPolicy(poolResult.policy)
      const lastPage = Math.max(1, Math.ceil(poolResult.total / poolPageSize))
      if (poolPage > lastPage) {
        setPool([])
        setPoolTotal(poolResult.total)
        setPoolPage(lastPage)
        return
      }
      setPool(poolResult.items)
      setPoolTotal(poolResult.total)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('任务池加载失败'), 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, isSuperAdmin, onNotify, poolPage, poolPageSize, selectedCategoryId, selectedGroupId, t])

  useEffect(() => {
    // Deferred startup read keeps the effect limited to initiating I/O; state updates
    // happen only when the asynchronous request resolves.
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const claim = async (exerciseId: number) => {
    setBusyExerciseId(exerciseId)
    try {
      await apiClient.claimWorkflowTask(exerciseId, adminToken)
      onNotify(t('已领取该课程，进入「我的任务」即可开始校对'), 'success')
      // 先刷新任务中心再切到「我的任务」，避免刚领取的任务短暂看不到。
      await onClaimed?.()
      setActiveTab('mine')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('领取任务失败'), 'error')
      await refresh()
    } finally {
      setBusyExerciseId(null)
    }
  }

  const release = async (exerciseId: number) => {
    const confirmed = await onRequestConfirm({
      title: t('放弃任务'),
      message: t('放弃后该课程会回到任务池，其他贡献者可以重新领取；你已保存的校对草稿会保留。'),
      confirmLabel: t('确认放弃'),
      tone: 'danger',
    })
    if (!confirmed) return
    setBusyExerciseId(exerciseId)
    try {
      await apiClient.releaseWorkflowTask(exerciseId, adminToken)
      onNotify(t('已放弃该课程，任务已回到任务池'), 'success')
      await onReleased?.()
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('放弃任务失败'), 'error')
    } finally {
      setBusyExerciseId(null)
    }
  }

  const activeTaskCount = workflowInbox.items.filter((task) => task.stage !== 'completed').length
  const isClaimLimitReached = !!policy && policy.myActiveClaimCount >= policy.maxConcurrentClaims

  const claimableTab = (
    <Space direction="vertical" size={12} style={{ display: 'flex' }}>
      <div className="task-pool-filters">
        <Typography.Text type="secondary">{t('筛选任务')}</Typography.Text>
        <Select<number>
          allowClear
          className="task-pool-filter-select"
          onChange={(value) => {
            setSelectedGroupId(value)
            setSelectedCategoryId(undefined)
            setPoolPage(1)
          }}
          options={categoryGroups
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'))
            .map((group) => ({ label: group.name, value: group.id }))}
          placeholder={t('全部分类')}
          showSearch
          optionFilterProp="label"
          value={selectedGroupId}
        />
        <Select<number>
          allowClear
          className="task-pool-filter-select"
          disabled={categoryOptions.length === 0}
          onChange={(value) => {
            setSelectedCategoryId(value)
            setPoolPage(1)
          }}
          options={categoryOptions}
          placeholder={t('全部系列')}
          showSearch
          optionFilterProp="label"
          value={selectedCategoryId}
        />
      </div>

      {!isSuperAdmin && policy && (
        <Typography.Text
          style={{ fontSize: 12 }}
          type={isClaimLimitReached ? 'danger' : 'secondary'}
        >
          {isClaimLimitReached
            ? t('你已持有 {{current}}/{{max}} 门课程，需先完成或放弃现有任务才能继续领取', { current: policy.myActiveClaimCount, max: policy.maxConcurrentClaims })
            : t('当前持有 {{current}}/{{max}} 门课程，领取后保存草稿自动续期 {{hours}} 小时', { current: policy.myActiveClaimCount, max: policy.maxConcurrentClaims, hours: policy.claimWindowHours })}
        </Typography.Text>
      )}

      <div className="task-pool-list">
        {loading && pool.length === 0 ? (
          <Spin style={{ display: 'block', margin: '32px auto' }} />
        ) : pool.length === 0 ? (
          <Empty
            description={isSuperAdmin
              ? t('当前筛选条件下没有任务。请到「课程管理」补充课程草稿，或检查是否有媒体未就绪的课程。')
              : t('当前筛选条件下没有可领取的任务。')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          pool.map((task) => (
            <div className="task-pool-item" key={task.exerciseId}>
              <div className="task-pool-item-main">
                <Typography.Text className="task-pool-item-title">{task.exerciseTitle}</Typography.Text>
                <Space size={6} wrap>
                  {difficultyTag(task, t)}
                  <Tag variant="outlined">{t(task.mediaType === 'video' ? '视频' : '音频')}</Tag>
                  <Tag>{task.categoryName}</Tag>
                  <Tag variant="outlined">{t('{{count}} 句字幕', { count: task.lineCount })}</Tag>
                  {task.claimReleaseCount > 0 && <Tag color="gold" variant="outlined">{t('曾释放 {{count}} 次', { count: task.claimReleaseCount })}</Tag>}
                </Space>
              </div>
              {isSuperAdmin ? (
                // 超级管理员不参与协作流程，只查看任务池；不给领取入口。
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {t('仅字幕贡献者可领取')}
                </Typography.Text>
              ) : (
                <Tooltip title={isClaimLimitReached
                  ? t('你已持有 {{count}} 门课程，需先完成或放弃现有任务', { count: policy?.maxConcurrentClaims ?? 0 })
                  : task.claimReleaseCount > 0
                    ? t('该课程曾被领取后释放 {{count}} 次', { count: task.claimReleaseCount })
                    : t('领取后锁定给你，保存草稿会自动续期')}>
                  <Button
                    disabled={isClaimLimitReached}
                    icon={<Lock size={14} />}
                    loading={busyExerciseId === task.exerciseId}
                    onClick={() => void claim(task.exerciseId)}
                    size="middle"
                    type="primary"
                  >
                    {t('领取任务')}
                  </Button>
                </Tooltip>
              )}
            </div>
          ))
        )}
      </div>

      {poolTotal > 0 && (
        <div className="task-pool-pagination">
          <Pagination
            current={poolPage}
            pageSize={poolPageSize}
            pageSizeOptions={[10, 20, 50]}
            showSizeChanger
            showTotal={(total) => t('共 {{total}} 个任务', { total })}
            total={poolTotal}
            onChange={(nextPage, nextPageSize) => {
              setPoolPage(nextPageSize !== poolPageSize ? 1 : nextPage)
              setPoolPageSize(nextPageSize)
            }}
          />
        </div>
      )}
    </Space>
  )

  const myTasksTab = (
    <Space direction="vertical" size={12} style={{ display: 'flex' }}>
      {reviewTasks.length > 0 && (
        <Alert
          className="review-task-inbox"
          description={<div className="review-task-list">
            {reviewTasks.map((task) => (
              <div className="review-task-item" key={task.draftId}>
                <div>
                  <Typography.Text strong>{task.exerciseTitle}</Typography.Text>
                  <Typography.Text type="secondary">{t('{{name}} 提交 · {{time}}', { name: task.contributorDisplayName, time: formatDateTime(task.submittedAt, uiLocale) })}</Typography.Text>
                </div>
                <Button onClick={() => onReviewSubtitleDraft?.(task.exerciseId)} size="small" type="primary">{t('开始审核')}</Button>
              </div>
            ))}
          </div>}
          icon={<ClipboardCheck size={18} />}
          message={t('我的待审核 · {{count}} 份', { count: reviewTasks.length })}
          showIcon
          type="warning"
        />
      )}

      <div className="task-stat-grid">
        <StatCard value={workflowInbox.counts.proofreading} label={t('待校对')} tone="blue" />
        <StatCard value={workflowInbox.counts.awaitingReview} label={t('待审核')} tone="orange" />
        <StatCard value={workflowInbox.counts.returned} label={t('待修改')} tone="gold" />
        <StatCard value={workflowInbox.counts.completedProofreading} label={t('已完成校对')} tone="green" />
        <StatCard value={workflowInbox.counts.completedSecondReview} label={t('已完成二审')} tone="cyan" />
      </div>

      <Typography.Text className="task-section-title" strong>{t('当前任务')}</Typography.Text>
      {workflowInbox.items.filter((task) => task.stage !== 'completed' && task.stage !== 'awaiting_review').length === 0 ? (
        <Empty description={t('当前没有待校对或待修改的字幕任务。')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="my-task-list">
          {workflowInbox.items.filter((task) => task.stage !== 'completed' && task.stage !== 'awaiting_review').map((task) => (
            <div className="my-task-item" key={`${task.exerciseId}-${task.draftId}-${task.role}-${task.stage}`}>
              <div className="my-task-item-main">
                <Typography.Text className="my-task-item-title">{task.exerciseTitle}</Typography.Text>
                <Typography.Text type="secondary">
                  {t('校对 · {{name}} · {{status}}', { name: task.contributorDisplayName, status: task.stage === 'returned' ? `${t('退回修改')}${task.reviewNote ? `：${task.reviewNote}` : ''}` : t('校对中') })}
                </Typography.Text>
              </div>
              <Space className="my-task-item-actions" size={8}>
                {(() => {
                  const deadline = formatClaimDeadline(task.claimExpiresAt, t)
                  return deadline
                    ? <Tag color={deadline.expired ? 'red' : 'blue'} icon={<Clock size={12} />} variant="outlined">{deadline.text}</Tag>
                    : null
                })()}
                <Button
                  onClick={() => onEditCourse(task.exerciseId)}
                  size="small"
                  type="primary"
                >{task.stage === 'returned' ? t('继续修改') : t('开始校对')}</Button>
                {task.assignmentSource === 'self_claimed' && (
                  <Button
                    danger
                    loading={busyExerciseId === task.exerciseId}
                    onClick={() => void release(task.exerciseId)}
                    size="small"
                  >{t('放弃任务')}</Button>
                )}
              </Space>
            </div>
          ))}
        </div>
      )}

      <Typography.Text className="task-section-title" strong>{t('历史贡献')}</Typography.Text>
      {workflowInbox.items.filter((task) => task.stage === 'completed').length === 0 ? (
        <Typography.Text type="secondary">{t('还没有已完成的字幕任务。')}</Typography.Text>
      ) : (
        <div className="my-task-list my-task-history-list">
          {workflowInbox.items.filter((task) => task.stage === 'completed').map((task) => (
            <div className="my-task-item is-completed" key={`${task.exerciseId}-${task.draftId}-${task.role}-history`}>
              <div className="my-task-item-main">
                <Typography.Text className="my-task-item-title">
                  <CheckCircle2 size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                  {task.exerciseTitle}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {task.role === 'second_reviewer' ? t('已完成二次审核') : t('已完成字幕校对')}{task.updatedAt ? ` · ${formatDateTime(task.updatedAt, uiLocale)}` : ''}
                </Typography.Text>
              </div>
            </div>
          ))}
        </div>
      )}
    </Space>
  )

  const overviewTab = (
    <Space direction="vertical" size={12} style={{ display: 'flex' }}>
      <div className="task-stat-grid">
        <StatCard value={overview?.claimableCount ?? 0} label={t('可领取')} tone="blue" />
        <StatCard value={overview?.unreadyDraftCount ?? 0} label={t('媒体未就绪草稿')} tone="default" />
        <StatCard value={overview?.claimBlockedCount ?? 0} label={t('禁止领取草稿')} tone="default" />
        <StatCard value={overview?.awaitingReviewCount ?? 0} label={t('待二审')} tone="orange" />
        <StatCard value={overview?.idleContributorCount ?? 0} label={t('空闲贡献者')} tone="green" />
      </div>
      {overview && overview.claimableCount === 0 && overview.idleContributorCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('任务池已空，但有贡献者空闲。请补充课程草稿或检查是否有媒体未就绪的课程。')}
        />
      )}

      <Card size="small" title={<Space><TimerReset size={16} /><span>{t('超期未提交')}</span></Space>} className="task-sub-card">
        <Table
          dataSource={overview?.overdueTasks ?? []}
          loading={loading}
          rowKey={(row) => `${row.exerciseId}-${row.contributorDisplayName}`}
          pagination={false}
          size="small"
          locale={{ emptyText: t('没有超期任务。') }}
          columns={[
            { title: t('课程'), dataIndex: 'exerciseTitle', key: 'exerciseTitle' },
            { title: t('负责人'), dataIndex: 'contributorDisplayName', key: 'contributorDisplayName' },
            {
              title: t('来源'),
              dataIndex: 'source',
              key: 'source',
              width: 110,
              render: (value: string) => value === 'self_claimed'
                ? <Tag color="blue">{t('自助领取')}</Tag>
                : <Tag>{t('管理员指派')}</Tag>,
            },
            {
              title: t('阶段'),
              dataIndex: 'stage',
              key: 'stage',
              width: 100,
              render: (value: string) => value === 'returned' ? <Tag color="gold">{t('待修改')}</Tag> : <Tag color="processing">{t('校对中')}</Tag>,
            },
            {
              title: t('超时'),
              dataIndex: 'overdueHours',
              key: 'overdueHours',
              width: 120,
              render: (value: number) => <Tag color="red">{t('已超 {{hours}} 小时', { hours: value })}</Tag>,
            },
          ]}
        />
      </Card>

      <Card size="small" title={<Space><UserCheck size={16} /><span>{t('贡献者负载')}</span></Space>} className="task-sub-card">
        <Table
          dataSource={overview?.contributors ?? []}
          loading={loading}
          rowKey="adminUserId"
          pagination={false}
          size="small"
          columns={[
            { title: t('贡献者'), dataIndex: 'displayName', key: 'displayName' },
            { title: t('进行中'), dataIndex: 'activeClaimCount', key: 'activeClaimCount', width: 90 },
            { title: t('待审核'), dataIndex: 'awaitingReviewCount', key: 'awaitingReviewCount', width: 90 },
            { title: t('超期'), dataIndex: 'overdueCount', key: 'overdueCount', width: 90, render: (value: number) => value > 0 ? <Tag color="red">{value}</Tag> : <span>0</span> },
            { title: t('已完成'), dataIndex: 'completedCount', key: 'completedCount', width: 90 },
            {
              title: t('状态'),
              dataIndex: 'isIdle',
              key: 'isIdle',
              width: 120,
              render: (value: boolean) => value
                ? <Tag color="green" icon={<UserCheck size={12} />}>{t('空闲')}</Tag>
                : <Tag color="default" icon={<UserX size={12} />}>{t('忙碌')}</Tag>,
            },
          ]}
        />
      </Card>
    </Space>
  )

  const tabItems = [
    ...(isSuperAdmin ? [{ key: 'overview', label: t('任务池概览'), children: overviewTab }] : []),
    {
      key: 'claimable',
      label: <Space size={6}><Inbox size={14} />{t('可领取')}<Badge count={poolTotal} color="#1cb0f6" showZero overflowCount={99} /></Space>,
      children: claimableTab,
    },
    ...(!isSuperAdmin ? [{
      key: 'mine',
      label: <Space size={6}><ClipboardCheck size={14} />{t('我的任务')}<Badge count={activeTaskCount} color="#1cb0f6" showZero overflowCount={99} /></Space>,
      children: myTasksTab,
    }] : []),
  ]

  return (
    <Card
      className="task-pool"
      extra={<Button icon={<RefreshCw size={15} />} onClick={() => void refresh()} size="small" type="text">{t('刷新')}</Button>}
      title={
        <Space size={8}>
          <Inbox size={18} />
          <span>{t('任务广场')}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
            {isSuperAdmin
              ? t('任务池供字幕贡献者自助领取；作为管理员，你不参与领取与审核')
              : t('领取后锁定给你，保存草稿自动续期 48 小时，超时未保存自动释放')}
          </Typography.Text>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        className="task-pool-tabs"
        items={tabItems}
        onChange={setActiveTab}
      />
    </Card>
  )
}
