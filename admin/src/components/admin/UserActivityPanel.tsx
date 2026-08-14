import { ReloadOutlined } from '@ant-design/icons'
import { useDeferredValue, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  AdminUserActivityItem,
  AdminUserActivityLevel,
  AdminUserActivityReport,
} from '@duolinting/shared'

type UserActivityPanelProps = {
  report: AdminUserActivityReport | null
  isLoading: boolean
  onRefresh: () => void
}

const levelLabelMap: Record<AdminUserActivityLevel, string> = {
  today: '今日活跃',
  this_week: '近 7 天',
  this_month: '近 30 天',
  inactive: '沉默用户',
  never_started: '未开始学习',
}

/**
 * 活跃层级对应 antd Tag 的预设颜色，延续原自绘徽章的色彩语义：
 * 今日=蓝（主题色）、7 天=绿、30 天=金、沉默=默认灰、未开始=浅灰。
 */
const levelTagColorMap: Record<AdminUserActivityLevel, string> = {
  today: 'blue',
  this_week: 'green',
  this_month: 'gold',
  inactive: 'default',
  never_started: 'default',
}

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : '暂无学习记录'

/**
 * "最近活跃"用相对时间展示（扫读比完整时间戳更快），完整时间放在 Tooltip 里悬停查看。
 * 递进规则：1 分钟内显示"刚刚" → 分钟 → 小时 → 天；超过 30 天直接显示日期。
 */
const formatRelativeTime = (value: string | null) => {
  if (!value) {
    return '暂无学习记录'
  }

  const diffMinutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  if (diffMinutes < 1) {
    return '刚刚'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays <= 30) {
    return `${diffDays} 天前`
  }
  return new Date(value).toLocaleDateString()
}

/**
 * 搜索匹配：昵称、邮箱、最近课程名、用户 ID 任一包含关键词（忽略大小写）即命中。
 */
const matchesSearch = (item: AdminUserActivityItem, rawQuery: string) => {
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return true
  }

  return [
    item.displayName,
    item.email,
    item.lastExerciseTitle,
    String(item.userId),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

/**
 * 汇总卡配置：valueStyle 颜色保留原自绘卡片的色彩语义
 * （今日=主题蓝、7 天=绿、30 天=琥珀、沉默=红，其余用默认深色）。
 */
const summaryCardDefinitions: Array<{
  key: string
  title: string
  pick: (summary: AdminUserActivityReport['summary']) => number
  color?: string
}> = [
  { key: 'totalUsers', title: '总用户数', pick: (s) => s.totalUsers },
  { key: 'activeTodayCount', title: '今日活跃', pick: (s) => s.activeTodayCount, color: '#1cb0f6' },
  { key: 'active7dCount', title: '近 7 天活跃', pick: (s) => s.active7dCount, color: '#0d8f74' },
  { key: 'active30dCount', title: '近 30 天活跃', pick: (s) => s.active30dCount, color: '#b45309' },
  { key: 'inactiveCount', title: '沉默用户', pick: (s) => s.inactiveCount, color: '#ef4444' },
  { key: 'neverStartedCount', title: '未开始学习', pick: (s) => s.neverStartedCount },
  { key: 'totalLineTouches', title: '逐句记录数', pick: (s) => s.totalLineTouches },
  { key: 'totalFeedbackCount', title: '答案反馈总数', pick: (s) => s.totalFeedbackCount },
]

const levelOptions: Array<{ value: AdminUserActivityLevel | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今日活跃' },
  { value: 'this_week', label: '近 7 天' },
  { value: 'this_month', label: '近 30 天' },
  { value: 'inactive', label: '沉默用户' },
  { value: 'never_started', label: '未开始学习' },
]

export function UserActivityPanel({
  report,
  isLoading,
  onRefresh,
}: UserActivityPanelProps) {
  const [selectedLevel, setSelectedLevel] = useState<AdminUserActivityLevel | 'all'>('all')
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue)

  const filteredItems = useMemo(() => {
    if (!report) {
      return []
    }

    return report.items.filter(
      (item) =>
        (selectedLevel === 'all' || item.activityLevel === selectedLevel) &&
        matchesSearch(item, deferredSearchValue),
    )
  }, [deferredSearchValue, report, selectedLevel])

  const columns: ColumnsType<AdminUserActivityItem> = [
    {
      title: '用户',
      key: 'user',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{item.displayName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ID：{item.userId} · {item.email}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '活跃层级',
      dataIndex: 'activityLevel',
      key: 'activityLevel',
      width: 110,
      render: (level: AdminUserActivityLevel) => (
        <Tag color={levelTagColorMap[level]}>{levelLabelMap[level]}</Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      width: 180,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '最近活跃',
      dataIndex: 'lastActiveAt',
      key: 'lastActiveAt',
      width: 140,
      render: (value: string | null) => (
        <Tooltip title={value ? formatDateTime(value) : undefined}>
          {formatRelativeTime(value)}
        </Tooltip>
      ),
    },
    {
      title: '最近课程',
      dataIndex: 'lastExerciseTitle',
      key: 'lastExerciseTitle',
      ellipsis: true,
      render: (value: string | null) => value || '暂无',
    },
    {
      title: '学习指标',
      key: 'studyMetrics',
      width: 220,
      render: (_, item) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          课程 {item.studiedExerciseCount} · 逐句 {item.touchedLineCount} · 掌握{' '}
          {item.masteredLineCount} · 反馈 {item.feedbackCount}
        </Typography.Text>
      ),
    },
    {
      title: '其他统计',
      key: 'otherMetrics',
      width: 240,
      render: (_, item) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          不清楚 {item.unclearLineCount} · 复读 {item.repeatTotal} · 笔记 {item.noteCount} · 听写{' '}
          {item.dictationCount}
        </Typography.Text>
      ),
    },
  ]

  return (
    <section className="admin-section">
      <div className="panel-title">
        <span>用户活跃度</span>
      </div>

      <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap size="middle">
          <Space size={8}>
            <Typography.Text type="secondary">活跃层级</Typography.Text>
            <Select
              options={levelOptions}
              style={{ width: 160 }}
              value={selectedLevel}
              onChange={(value) => setSelectedLevel(value)}
            />
          </Space>
          <Input.Search
            allowClear
            placeholder="昵称 / 邮箱 / 用户 ID / 最近课程"
            style={{ width: 320 }}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </Space>
        <Button
          icon={<ReloadOutlined />}
          loading={isLoading}
          onClick={onRefresh}
          type="default"
        >
          刷新
        </Button>
      </Space>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        来源表：users、exercise_progress、line_progress、accepted_answer_feedback
      </Typography.Text>

      {report && (
        <>
          <Row gutter={[12, 12]}>
            {summaryCardDefinitions.map((definition) => (
              <Col key={definition.key} lg={6} md={8} xs={12}>
                <Card size="small">
                  <Statistic
                    title={definition.title}
                    value={definition.pick(report.summary)}
                    valueStyle={definition.color ? { color: definition.color } : undefined}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <Space wrap size="middle">
            <Typography.Text type="secondary">{filteredItems.length} 位用户</Typography.Text>
            <Typography.Text type="secondary">
              已有学习记录 {report.summary.usersWithProgressCount} 人，提交过答案反馈{' '}
              {report.summary.usersWithFeedbackCount} 人
            </Typography.Text>
            <Typography.Text type="secondary">
              数据更新于 {formatDateTime(report.generatedAt)}
            </Typography.Text>
          </Space>
        </>
      )}

      <Table<AdminUserActivityItem>
        columns={columns}
        dataSource={filteredItems}
        loading={isLoading}
        locale={{ emptyText: <Empty description="当前筛选条件下没有用户数据。" /> }}
        pagination={{
          pageSize: 15,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 位用户`,
        }}
        rowKey="userId"
        scroll={{ x: 1100 }}
        size="small"
      />
    </section>
  )
}
