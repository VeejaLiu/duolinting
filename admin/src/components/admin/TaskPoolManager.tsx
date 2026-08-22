import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Space,
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
  AdminUser,
  AdminWorkflowOverview,
  ClaimableWorkflowTask,
} from '@duolinting/shared'
import { apiClient } from '../../lib/apiClient'

type TaskPoolManagerProps = {
  adminToken: string
  adminUser: AdminUser
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
  /** 领取成功后通知父级刷新课程列表与任务中心。 */
  onClaimed?: () => void
  workflowInbox: AdminSubtitleWorkflowTaskInbox
  reviewTasks: AdminReviewTask[]
  onReviewSubtitleDraft?: (exerciseId: number) => void
  onEditCourse: (exerciseId: number) => void
}

const difficultyLabel = (value: string) =>
  value === 'beginner' ? '入门' : value === 'intermediate' ? '进阶' : '高级'

const difficultyColor = (value: string) =>
  value === 'beginner' ? 'green' : value === 'intermediate' ? 'blue' : 'orange'

const difficultyTag = (task: ClaimableWorkflowTask) => (
  <Tag color={difficultyColor(task.difficulty)} variant="filled">
    {difficultyLabel(task.difficulty)}
  </Tag>
)

const formatDateTime = (value?: string) => value
  ? new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value))
  : ''

/** 把 ISO 期限转为「还剩 1 天 6 小时」这类提示，超期显示为红色。 */
const formatClaimDeadline = (expiresAt?: string) => {
  if (!expiresAt) return null
  const remaining = new Date(expiresAt).getTime() - Date.now()
  const totalMinutes = Math.floor(remaining / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const text = remaining <= 0
    ? '已超时'
    : days > 0
      ? `还剩 ${days} 天 ${hours} 小时`
      : hours > 0
        ? `还剩 ${hours} 小时`
        : `还剩 ${Math.max(totalMinutes, 0)} 分钟`
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
  onNotify,
  onClaimed,
  workflowInbox,
  reviewTasks,
  onReviewSubtitleDraft,
  onEditCourse,
}: TaskPoolManagerProps) {
  const [pool, setPool] = useState<ClaimableWorkflowTask[]>([])
  const [overview, setOverview] = useState<AdminWorkflowOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyExerciseId, setBusyExerciseId] = useState<number | null>(null)
  const isSuperAdmin = adminUser.role === 'super_admin'
  const [activeTab, setActiveTab] = useState<string>(isSuperAdmin ? 'overview' : 'claimable')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (isSuperAdmin) {
        const overviewResult = await apiClient.getWorkflowOverview(adminToken)
        setOverview(overviewResult)
      }
      const poolResult = await apiClient.getClaimableWorkflowTasks(adminToken, 1, 50)
      setPool(poolResult.items)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '任务池加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, isSuperAdmin, onNotify])

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
      onNotify('已领取该课程，进入「我的任务」即可开始校对', 'success')
      onClaimed?.()
      setActiveTab('mine')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '领取任务失败', 'error')
      await refresh()
    } finally {
      setBusyExerciseId(null)
    }
  }

  const activeTaskCount = workflowInbox.items.filter((task) => task.stage !== 'completed').length

  const claimableTab = (
    <div className="task-pool-list">
      {pool.length === 0 ? (
        <Empty
          description={isSuperAdmin
            ? '任务池为空。请到「课程管理」补充课程草稿，或检查是否有媒体未就绪的课程。'
            : '当前没有可领取的任务，管理员补充课程草稿后会出现在这里。'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        pool.map((task) => (
          <div className="task-pool-item" key={task.exerciseId}>
            <div className="task-pool-item-main">
              <Typography.Text className="task-pool-item-title">{task.exerciseTitle}</Typography.Text>
              <Space size={6} wrap>
                {difficultyTag(task)}
                <Tag variant="outlined">{task.mediaType === 'video' ? '视频' : '音频'}</Tag>
                <Tag>{task.categoryName}</Tag>
                <Tag variant="outlined">{task.lineCount} 句字幕</Tag>
                {task.claimReleaseCount > 0 && <Tag color="gold" variant="outlined">曾释放 {task.claimReleaseCount} 次</Tag>}
              </Space>
            </div>
            {isSuperAdmin ? (
              // 超级管理员不参与协作流程，只查看任务池；不给领取入口。
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                仅字幕贡献者可领取
              </Typography.Text>
            ) : (
              <Tooltip title={task.claimReleaseCount > 0 ? `该课程曾被领取后释放 ${task.claimReleaseCount} 次` : '领取后锁定给你，保存草稿会自动续期'}>
                <Button
                  icon={<Lock size={14} />}
                  loading={busyExerciseId === task.exerciseId}
                  onClick={() => void claim(task.exerciseId)}
                  size="middle"
                  type="primary"
                >
                  领取任务
                </Button>
              </Tooltip>
            )}
          </div>
        ))
      )}
    </div>
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
                  <Typography.Text type="secondary">{task.contributorDisplayName} 提交 · {formatDateTime(task.submittedAt)}</Typography.Text>
                </div>
                <Button onClick={() => onReviewSubtitleDraft?.(task.exerciseId)} size="small" type="primary">开始审核</Button>
              </div>
            ))}
          </div>}
          icon={<ClipboardCheck size={18} />}
          message={`我的待审核 · ${reviewTasks.length} 份`}
          showIcon
          type="warning"
        />
      )}

      <div className="task-stat-grid">
        <StatCard value={workflowInbox.counts.proofreading} label="待校对" tone="blue" />
        <StatCard value={workflowInbox.counts.awaitingReview} label="待审核" tone="orange" />
        <StatCard value={workflowInbox.counts.returned} label="待修改" tone="gold" />
        <StatCard value={workflowInbox.counts.completedProofreading} label="已完成校对" tone="green" />
        <StatCard value={workflowInbox.counts.completedSecondReview} label="已完成二审" tone="cyan" />
      </div>

      <Typography.Text className="task-section-title" strong>当前任务</Typography.Text>
      {workflowInbox.items.filter((task) => task.stage !== 'completed').length === 0 ? (
        <Empty description="当前没有待处理字幕任务。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="my-task-list">
          {workflowInbox.items.filter((task) => task.stage !== 'completed').map((task) => (
            <div className="my-task-item" key={`${task.exerciseId}-${task.draftId}-${task.role}-${task.stage}`}>
              <div className="my-task-item-main">
                <Typography.Text className="my-task-item-title">{task.exerciseTitle}</Typography.Text>
                <Typography.Text type="secondary">
                  {task.role === 'second_reviewer' ? '审核' : '校对'} · {task.contributorDisplayName} · {task.stage === 'awaiting_review' ? '等待审核' : task.stage === 'returned' ? `退回修改${task.reviewNote ? `：${task.reviewNote}` : ''}` : '校对中'}
                </Typography.Text>
              </div>
              <Space className="my-task-item-actions" size={8}>
                {task.stage === 'awaiting_review' && reviewTasks.some((item) => item.draftId === task.draftId) && (
                  <Button onClick={() => onReviewSubtitleDraft?.(task.exerciseId)} size="small" type="primary">开始审核</Button>
                )}
                {(task.stage === 'proofreading' || task.stage === 'returned') && (
                  <>
                    {(() => {
                      const deadline = formatClaimDeadline(task.claimExpiresAt)
                      return deadline
                        ? <Tag color={deadline.expired ? 'red' : 'blue'} icon={<Clock size={12} />} variant="outlined">{deadline.text}</Tag>
                        : null
                    })()}
                    <Button
                      onClick={() => onEditCourse(task.exerciseId)}
                      size="small"
                      type="primary"
                    >{task.stage === 'returned' ? '继续修改' : '开始校对'}</Button>
                  </>
                )}
              </Space>
            </div>
          ))}
        </div>
      )}

      <Typography.Text className="task-section-title" strong>历史贡献</Typography.Text>
      {workflowInbox.items.filter((task) => task.stage === 'completed').length === 0 ? (
        <Typography.Text type="secondary">还没有已完成的字幕任务。</Typography.Text>
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
                  {task.role === 'second_reviewer' ? '已完成二次审核' : '已完成字幕校对'}{task.updatedAt ? ` · ${formatDateTime(task.updatedAt)}` : ''}
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
        <StatCard value={overview?.claimableCount ?? 0} label="可领取" tone="blue" />
        <StatCard value={overview?.unreadyDraftCount ?? 0} label="媒体未就绪草稿" tone="default" />
        <StatCard value={overview?.claimBlockedCount ?? 0} label="禁止领取草稿" tone="default" />
        <StatCard value={overview?.awaitingReviewCount ?? 0} label="待二审" tone="orange" />
        <StatCard value={overview?.idleContributorCount ?? 0} label="空闲贡献者" tone="green" />
      </div>
      {overview && overview.claimableCount === 0 && overview.idleContributorCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message="任务池已空，但有贡献者空闲。请补充课程草稿或检查是否有媒体未就绪的课程。"
        />
      )}

      <Card size="small" title={<Space><TimerReset size={16} /><span>超期未提交</span></Space>} className="task-sub-card">
        <Table
          dataSource={overview?.overdueTasks ?? []}
          loading={loading}
          rowKey={(row) => `${row.exerciseId}-${row.contributorDisplayName}`}
          pagination={false}
          size="small"
          locale={{ emptyText: '没有超期任务。' }}
          columns={[
            { title: '课程', dataIndex: 'exerciseTitle', key: 'exerciseTitle' },
            { title: '负责人', dataIndex: 'contributorDisplayName', key: 'contributorDisplayName' },
            {
              title: '来源',
              dataIndex: 'source',
              key: 'source',
              width: 110,
              render: (value: string) => value === 'self_claimed'
                ? <Tag color="blue">自助领取</Tag>
                : <Tag>管理员指派</Tag>,
            },
            {
              title: '阶段',
              dataIndex: 'stage',
              key: 'stage',
              width: 100,
              render: (value: string) => value === 'returned' ? <Tag color="gold">待修改</Tag> : <Tag color="processing">校对中</Tag>,
            },
            {
              title: '超时',
              dataIndex: 'overdueHours',
              key: 'overdueHours',
              width: 120,
              render: (value: number) => <Tag color="red">已超 {value} 小时</Tag>,
            },
          ]}
        />
      </Card>

      <Card size="small" title={<Space><UserCheck size={16} /><span>贡献者负载</span></Space>} className="task-sub-card">
        <Table
          dataSource={overview?.contributors ?? []}
          loading={loading}
          rowKey="adminUserId"
          pagination={false}
          size="small"
          columns={[
            { title: '贡献者', dataIndex: 'displayName', key: 'displayName' },
            { title: '进行中', dataIndex: 'activeClaimCount', key: 'activeClaimCount', width: 90 },
            { title: '待审核', dataIndex: 'awaitingReviewCount', key: 'awaitingReviewCount', width: 90 },
            { title: '超期', dataIndex: 'overdueCount', key: 'overdueCount', width: 90, render: (value: number) => value > 0 ? <Tag color="red">{value}</Tag> : <span>0</span> },
            { title: '已完成', dataIndex: 'completedCount', key: 'completedCount', width: 90 },
            {
              title: '状态',
              dataIndex: 'isIdle',
              key: 'isIdle',
              width: 120,
              render: (value: boolean) => value
                ? <Tag color="green" icon={<UserCheck size={12} />}>空闲</Tag>
                : <Tag color="default" icon={<UserX size={12} />}>忙碌</Tag>,
            },
          ]}
        />
      </Card>
    </Space>
  )

  const tabItems = [
    ...(isSuperAdmin ? [{ key: 'overview', label: '任务池概览', children: overviewTab }] : []),
    {
      key: 'claimable',
      label: <Space size={6}><Inbox size={14} />可领取<Badge count={pool.length} color="#1cb0f6" showZero overflowCount={99} /></Space>,
      children: claimableTab,
    },
    ...(!isSuperAdmin ? [{
      key: 'mine',
      label: <Space size={6}><ClipboardCheck size={14} />我的任务<Badge count={activeTaskCount} color="#1cb0f6" showZero overflowCount={99} /></Space>,
      children: myTasksTab,
    }] : []),
  ]

  return (
    <Card
      className="task-pool"
      extra={<Button icon={<RefreshCw size={15} />} onClick={() => void refresh()} size="small" type="text">刷新</Button>}
      title={
        <Space size={8}>
          <Inbox size={18} />
          <span>任务广场</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
            {isSuperAdmin
              ? '任务池供字幕贡献者自助领取；作为管理员，你不参与领取与审核'
              : '领取后锁定给你，保存草稿自动续期 48 小时，超时未保存自动释放'}
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
