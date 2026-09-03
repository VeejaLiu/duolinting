import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminWorkflowActivity,
  AdminWorkflowActivityPage,
  AdminWorkflowActivityType,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type WorkflowActivityPanelProps = {
  adminToken: string
  currentAdminId: number
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

const pageSize = 20

const eventOptions: Array<{ label: string; value: AdminWorkflowActivityType }> = [
  { value: 'workflow_assigned', label: '分配任务' },
  { value: 'workflow_unassigned', label: '取消分配' },
  { value: 'workflow_claimed', label: '领取任务' },
  { value: 'workflow_claim_released', label: '放弃任务' },
  { value: 'workflow_claim_expired', label: '任务超时释放' },
  { value: 'subtitle_submitted', label: '提交字幕' },
  { value: 'subtitle_returned', label: '退回修改' },
  { value: 'subtitle_approved', label: '审核通过' },
  { value: 'subtitle_reverted', label: '回退课程' },
]

const roleLabel = (role: AdminWorkflowActivity['workflowRole'], t: (key: string) => string) =>
  t(role === 'second_reviewer' ? '二审' : '校对')

const eventLabel = (event: AdminWorkflowActivity, t: (key: string, values?: Record<string, string | number>) => string) => {
  const actor = event.actorDisplayName ?? t('系统')
  const target = event.targetDisplayName ?? t('未指定成员')
  switch (event.type) {
    case 'workflow_assigned':
      return t('{{actor}} 将{{role}}任务分配给 {{target}}', { actor, role: roleLabel(event.workflowRole, t), target })
    case 'workflow_unassigned':
      return t('{{actor}} 取消了 {{target}} 的{{role}}任务', { actor, target, role: roleLabel(event.workflowRole, t) })
    case 'workflow_claimed':
      return t('{{actor}} 领取了课程任务', { actor })
    case 'workflow_claim_released':
      return t('{{actor}} 放弃了课程任务，任务回到任务池', { actor })
    case 'workflow_claim_expired':
      return t('课程任务超时未提交，已自动释放回任务池（原负责人 {{target}}）', { target })
    case 'subtitle_submitted':
      return t('{{actor}} 提交了字幕稿，交由 {{target}} 二审', { actor, target })
    case 'subtitle_returned':
      return t('{{actor}} 退回了 {{target}} 的字幕稿', { actor, target })
    case 'subtitle_approved':
      return t('{{actor}} 审核通过了 {{target}} 的字幕稿', { actor, target })
    case 'subtitle_reverted':
      return t('{{actor}} 将 {{target}} 的已发布字幕回退到草稿{{note}}', { actor, target, note: event.reviewNote ? `：${event.reviewNote}` : '' })
  }
}

const eventTagColor: Record<AdminWorkflowActivityType, string> = {
  workflow_assigned: 'blue',
  workflow_unassigned: 'default',
  workflow_claimed: 'cyan',
  workflow_claim_released: 'purple',
  workflow_claim_expired: 'red',
  subtitle_submitted: 'orange',
  subtitle_returned: 'gold',
  subtitle_approved: 'green',
  subtitle_reverted: 'magenta',
}

const eventTagLabel: Record<AdminWorkflowActivityType, string> = {
  workflow_assigned: '已分配',
  workflow_unassigned: '已取消',
  workflow_claimed: '已领取',
  workflow_claim_released: '已放弃',
  workflow_claim_expired: '已超时释放',
  subtitle_submitted: '已提交',
  subtitle_returned: '已退回',
  subtitle_approved: '已通过',
  subtitle_reverted: '已回退',
}

/** 工作流数据通过独立接口按需请求，切换到其它后台页面不会产生协作动态请求。 */
export function WorkflowActivityPanel({ adminToken, currentAdminId, onNotify }: WorkflowActivityPanelProps) {
  const { t, uiLocale } = useAdminLanguage()
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState<AdminWorkflowActivityType | undefined>()
  const [data, setData] = useState<AdminWorkflowActivityPage | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const requestVersionRef = useRef(0)

  const loadActivity = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current
    setIsLoading(true)
    try {
      const response = await apiClient.getWorkflowActivity(adminToken, {
        page,
        pageSize,
        eventType,
      })
      // 筛选连续变化时，旧请求可能比新请求晚返回；只有最后一次请求能更新页面。
      if (requestVersion === requestVersionRef.current) {
        setData(response)
      }
    } catch (error) {
      if (requestVersion === requestVersionRef.current) {
        onNotify(
          `协作动态加载失败：${error instanceof Error ? error.message : '未知错误'}`,
          'error',
        )
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsLoading(false)
      }
    }
  }, [adminToken, eventType, onNotify, page])

  useEffect(() => {
    // 延后到浏览器下一轮任务再开始请求，避免在 effect 同步阶段切换 loading 状态。
    const timer = window.setTimeout(() => {
      void loadActivity()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      requestVersionRef.current += 1
    }
  }, [loadActivity])

  const resetToFirstPage = (nextEventType: AdminWorkflowActivityType | undefined) => {
    setEventType(nextEventType)
    setPage(1)
  }

  const isCurrentUserRelated = (event: AdminWorkflowActivity) =>
    event.actorAdminUserId === currentAdminId || event.targetAdminUserId === currentAdminId

  const columns: ColumnsType<AdminWorkflowActivity> = [
    {
      title: t('时间'),
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      width: 174,
      render: (value: string) => new Date(value).toLocaleString(uiLocale),
    },
    {
      title: t('动态'),
      dataIndex: 'type',
      key: 'type',
      width: 104,
      render: (value: AdminWorkflowActivityType) => (
        <Tag color={eventTagColor[value]}>{t(eventTagLabel[value])}</Tag>
      ),
    },
    {
      title: t('课程'),
      dataIndex: 'exerciseTitle',
      key: 'exerciseTitle',
      width: 260,
      render: (title: string, event) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong ellipsis={{ tooltip: title }}>{title}</Typography.Text>
          <Typography.Text type="secondary">{t('课程 #{{id}}', { id: event.exerciseId })}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('操作记录'),
      key: 'description',
      render: (_, event) => (
        <Space size={8} wrap>
          <Typography.Text strong={isCurrentUserRelated(event)}>{eventLabel(event, t)}</Typography.Text>
          {isCurrentUserRelated(event) && <Tag color="blue">{t('与我相关')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('审核意见'),
      dataIndex: 'reviewNote',
      key: 'reviewNote',
      width: 250,
      render: (reviewNote?: string) => reviewNote ? (
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: 'collapsible', symbol: t('展开') }} style={{ marginBottom: 0 }}>
          {reviewNote}
        </Typography.Paragraph>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
  ]

  return (
    <section className="admin-section workflow-activity-panel">
      <div className="panel-title"><span>{t('协作动态')}</span></div>
      <div className="workflow-activity-toolbar">
        <Space wrap>
          <Select
            allowClear
            className="workflow-activity-filter"
            onChange={resetToFirstPage}
            options={eventOptions.map((option) => ({ ...option, label: t(option.label) }))}
            placeholder={t('全部动态')}
            value={eventType}
          />
        </Space>
        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadActivity()}>
          {t('刷新')}
        </Button>
      </div>

      <Card className="workflow-activity-timeline" size="small" title={t('团队时间线')}>
        {data || isLoading ? (
          <Table<AdminWorkflowActivity>
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading}
            pagination={{
              current: page,
              pageSize,
              showSizeChanger: false,
              showTotal: (total) => t('共 {{total}} 条记录', { total }),
              total: data?.total ?? 0,
              onChange: (nextPage) => setPage(nextPage),
            }}
            rowClassName={(event) => isCurrentUserRelated(event) ? 'workflow-activity-row-is-current-user' : ''}
            rowKey="id"
            scroll={{ x: 980 }}
          />
        ) : <Empty description={t('暂无协作动态')} />}
      </Card>
    </section>
  )
}
