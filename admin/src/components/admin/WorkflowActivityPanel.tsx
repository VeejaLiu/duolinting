import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Col, Empty, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminWorkflowActivity,
  AdminWorkflowActivityPage,
  AdminWorkflowActivityType,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient } from '../../lib/apiClient'

type WorkflowActivityPanelProps = {
  adminToken: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

const pageSize = 20

const eventOptions: Array<{ label: string; value: AdminWorkflowActivityType }> = [
  { value: 'workflow_assigned', label: '分配任务' },
  { value: 'workflow_unassigned', label: '取消分配' },
  { value: 'subtitle_submitted', label: '提交字幕' },
  { value: 'subtitle_returned', label: '退回修改' },
  { value: 'subtitle_approved', label: '审核通过' },
]

const roleLabel = (role: AdminWorkflowActivity['workflowRole']) =>
  role === 'second_reviewer' ? '二审' : '校对'

const eventLabel = (event: AdminWorkflowActivity) => {
  const actor = event.actorDisplayName ?? '系统'
  const target = event.targetDisplayName ?? '未指定成员'
  switch (event.type) {
    case 'workflow_assigned':
      return `${actor} 将${roleLabel(event.workflowRole)}任务分配给 ${target}`
    case 'workflow_unassigned':
      return `${actor} 取消了 ${target} 的${roleLabel(event.workflowRole)}任务`
    case 'subtitle_submitted':
      return `${actor} 提交了字幕稿，交由 ${target} 二审`
    case 'subtitle_returned':
      return `${actor} 退回了 ${target} 的字幕稿`
    case 'subtitle_approved':
      return `${actor} 审核通过了 ${target} 的字幕稿`
  }
}

const eventTagColor: Record<AdminWorkflowActivityType, string> = {
  workflow_assigned: 'blue',
  workflow_unassigned: 'default',
  subtitle_submitted: 'orange',
  subtitle_returned: 'gold',
  subtitle_approved: 'green',
}

const eventTagLabel: Record<AdminWorkflowActivityType, string> = {
  workflow_assigned: '已分配',
  workflow_unassigned: '已取消',
  subtitle_submitted: '已提交',
  subtitle_returned: '已退回',
  subtitle_approved: '已通过',
}

/** 工作流数据通过独立接口按需请求，切换到其它后台页面不会产生协作动态请求。 */
export function WorkflowActivityPanel({ adminToken, onNotify }: WorkflowActivityPanelProps) {
  const [page, setPage] = useState(1)
  const [memberId, setMemberId] = useState<number | undefined>()
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
        memberId,
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
  }, [adminToken, eventType, memberId, onNotify, page])

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

  const resetToFirstPage = (callback: () => void) => {
    callback()
    setPage(1)
  }

  const columns: ColumnsType<AdminWorkflowActivity> = [
    {
      title: '时间',
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      width: 174,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '动态',
      dataIndex: 'type',
      key: 'type',
      width: 104,
      render: (value: AdminWorkflowActivityType) => (
        <Tag color={eventTagColor[value]}>{eventTagLabel[value]}</Tag>
      ),
    },
    {
      title: '课程',
      dataIndex: 'exerciseTitle',
      key: 'exerciseTitle',
      width: 260,
      render: (title: string, event) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong ellipsis={{ tooltip: title }}>{title}</Typography.Text>
          <Typography.Text type="secondary">课程 #{event.exerciseId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '操作记录',
      key: 'description',
      render: (_, event) => <Typography.Text>{eventLabel(event)}</Typography.Text>,
    },
    {
      title: '审核意见',
      dataIndex: 'reviewNote',
      key: 'reviewNote',
      width: 250,
      render: (reviewNote?: string) => reviewNote ? (
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: 'collapsible', symbol: '展开' }} style={{ marginBottom: 0 }}>
          {reviewNote}
        </Typography.Paragraph>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
  ]

  return (
    <section className="admin-section workflow-activity-panel">
      <div className="panel-title"><span>协作动态</span></div>
      <div className="workflow-activity-toolbar">
        <Space wrap>
          <Select
            allowClear
            className="workflow-activity-filter"
            onChange={(value) => resetToFirstPage(() => setMemberId(value))}
            options={data?.members.map((member) => ({
              label: member.isActive ? member.displayName : `${member.displayName}（已停用）`,
              value: member.adminUserId,
            })) ?? []}
            placeholder="全部成员"
            value={memberId}
          />
          <Select
            allowClear
            className="workflow-activity-filter"
            onChange={(value) => resetToFirstPage(() => setEventType(value))}
            options={eventOptions}
            placeholder="全部动态"
            value={eventType}
          />
        </Space>
        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadActivity()}>
          刷新
        </Button>
      </div>

      <div className="workflow-activity-member-grid" aria-label="当前工作量">
        {(data?.members ?? []).map((member) => (
          <Card className="workflow-activity-member-card" key={member.adminUserId} size="small">
            <Space align="center" size={8} wrap>
              <Typography.Text strong>{member.displayName}</Typography.Text>
              <Tag color={member.role === 'subtitle_contributor' ? 'blue' : 'purple'}>
                {member.role === 'subtitle_contributor' ? '字幕贡献者' : '超级管理员'}
              </Tag>
              {!member.isActive && <Tag>已停用</Tag>}
            </Space>
            <Row gutter={8} style={{ marginTop: 12 }}>
              <Col span={6}><Statistic title="校对" value={member.proofreaderAssignments} valueStyle={{ fontSize: 20 }} /></Col>
              <Col span={6}><Statistic title="二审" value={member.reviewerAssignments} valueStyle={{ fontSize: 20 }} /></Col>
              <Col span={6}><Statistic title="待审" value={member.awaitingReviewCount} valueStyle={{ color: '#d97706', fontSize: 20 }} /></Col>
              <Col span={6}><Statistic title="退回" value={member.returnedCount} valueStyle={{ color: '#b45309', fontSize: 20 }} /></Col>
            </Row>
          </Card>
        ))}
      </div>

      <Card className="workflow-activity-timeline" size="small" title="团队时间线">
        {data || isLoading ? (
          <Table<AdminWorkflowActivity>
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading}
            pagination={{
              current: page,
              pageSize,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条记录`,
              total: data?.total ?? 0,
              onChange: (nextPage) => setPage(nextPage),
            }}
            rowKey="id"
            scroll={{ x: 980 }}
          />
        ) : <Empty description="暂无协作动态" />}
      </Card>
    </section>
  )
}
