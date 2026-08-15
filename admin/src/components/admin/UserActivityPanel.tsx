import { ReloadOutlined } from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { Alert, Button, Card, Col, Empty, Progress, Row, Space, Statistic, Tag, Typography } from 'antd'
import type { AdminGrowthClientDistribution, AdminGrowthReport, AdminGrowthTrendPoint } from '@duolinting/shared'

type GrowthAnalyticsPanelProps = {
  report: AdminGrowthReport | null
  isLoading: boolean
  onRefresh: () => void
}

const clientLabels: Record<AdminGrowthClientDistribution['clientType'], string> = {
  web_app: '电脑 Web',
  mobile_web: 'Mobile Web',
  mobile_app: '原生 App',
}

const clientColors: Record<AdminGrowthClientDistribution['clientType'], string> = {
  web_app: '#1cb0f6',
  mobile_web: '#58cc02',
  mobile_app: '#ff9600',
}

type TrendSeries = {
  key: string
  label: string
  color: string
  values: number[]
}

/**
 * Ant Design Charts 的 Line 负责坐标轴、图例、响应式布局和共享 Tooltip。
 * 趋势点由后端补齐为连续自然日，故日期轴的间隔代表真实的每日时间序列。
 */
function GrowthTrendChart({
  title,
  description,
  trend,
  series,
  emptyDescription,
}: {
  title: string
  description: string
  trend: AdminGrowthTrendPoint[]
  series: TrendSeries[]
  emptyDescription: string
}) {
  const chartData = series.flatMap((item) => trend.map((point, index) => ({
    date: point.date,
    metric: item.label,
    value: item.values[index],
  })))
  const hasData = chartData.some((item) => item.value > 0)

  return (
    <Card title={title} size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{description}</Typography.Text>
        {hasData ? (
          <Line
            data={chartData}
            xField="date"
            yField="value"
            colorField="metric"
            height={270}
            scale={{ color: { range: series.map((item) => item.color) }, y: { nice: true } }}
            point={{ size: 3 }}
            /**
             * G2 的 Tooltip 只会自动推断编码通道；这里的 yField 是 value，
             * 因此显式声明字段与格式化器，保证浮层显示“指标：N 人”而非仅图例。
             */
            tooltip={{
              title: { field: 'date' },
              items: [
                {
                  name: { field: 'metric' },
                  field: 'value',
                  valueFormatter: (value: number) => `${new Intl.NumberFormat('zh-CN').format(value)} 人`,
                },
              ],
              shared: true,
            }}
          />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />}
      </Space>
    </Card>
  )
}

/** 端侧活跃按端独立去重；跨端用户会出现在多个端，用来观察产品触点覆盖。 */
function ClientDistributionCard({ item, mau }: { item: AdminGrowthClientDistribution; mau: number }) {
  const share = mau > 0 ? Math.round((item.active30dCount / mau) * 1000) / 10 : 0
  return (
    <Card size="small">
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space>
          <Tag color={clientColors[item.clientType]}>{clientLabels[item.clientType]}</Tag>
          <Typography.Text type="secondary">近 30 天触点覆盖</Typography.Text>
        </Space>
        <Statistic value={item.active30dCount} suffix="人" valueStyle={{ color: clientColors[item.clientType] }} />
        <Progress percent={share} showInfo={false} strokeColor={clientColors[item.clientType]} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          今日 {item.activeTodayCount} · 近 7 天 {item.active7dCount} · 占 MAU {share}%
        </Typography.Text>
      </Space>
    </Card>
  )
}

export function UserActivityPanel({ report, isLoading, onRefresh }: GrowthAnalyticsPanelProps) {
  const cards = report
    ? [
        { title: '累计注册用户', value: report.summary.totalUsers },
        { title: '今日新增注册', value: report.summary.registeredTodayCount, color: '#1cb0f6' },
        { title: '近 7 天新增', value: report.summary.registered7dCount, color: '#0d8f74' },
        { title: '近 30 天新增', value: report.summary.registered30dCount, color: '#b45309' },
        { title: 'DAU', value: report.summary.dau, color: '#1cb0f6' },
        { title: 'WAU', value: report.summary.wau, color: '#0d8f74' },
        { title: 'MAU', value: report.summary.mau, color: '#b45309' },
        { title: 'DAU / MAU', value: report.summary.dauMauPercent, suffix: '%', color: '#7c3aed' },
      ]
    : []

  return (
    <section className="admin-section">
      <div className="panel-title"><span>增长分析</span></div>
      <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary">关注注册增长、日活留存和产品端侧分布，不展示个人学习内容。</Typography.Text>
        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={onRefresh} type="default">刷新</Button>
      </Space>

      {report && !report.trackingStartedAt ? (
        <Alert showIcon type="info" message="访问追踪将在用户完成登录后开始积累"
          description="注册趋势可立即查看；DAU、WAU、MAU 与端侧活跃分布会从本次上线后的已登录访问开始形成准确历史。" />
      ) : null}
      {report?.trackingStartedAt ? (
        <Alert showIcon type="info" message={`访问追踪开始于 ${report.trackingStartedAt}`}
          description="DAU、WAU、MAU 按已登录用户去重；端侧分布允许同一用户同时出现在多个端。" />
      ) : null}

      {report ? (
        <>
          <Row gutter={[12, 12]}>
            {cards.map((card) => (
              <Col key={card.title} lg={6} md={8} xs={12}>
                <Card size="small"><Statistic suffix={card.suffix} title={card.title} value={card.value}
                  valueStyle={card.color ? { color: card.color } : undefined} /></Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[16, 16]}>
            <Col lg={14} xs={24}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <GrowthTrendChart
                  title="新增注册与日活"
                  description="每日新增注册与当日去重活跃用户（DAU）。"
                  trend={report.trend}
                  series={[
                    { key: 'registered', label: '新增注册', color: '#1cb0f6', values: report.trend.map((point) => point.registeredUserCount) },
                    { key: 'dau', label: 'DAU', color: '#7c3aed', values: report.trend.map((point) => point.activeUserCount) },
                  ]}
                  emptyDescription="近 30 天暂无新增注册或已登录访问数据"
                />
                <GrowthTrendChart
                  title="注册规模与活跃用户"
                  description="累计注册按截止当日计算；WAU/MAU 分别为截至当日滚动 7 / 30 天的去重活跃用户。"
                  trend={report.trend}
                  series={[
                    { key: 'total-registered', label: '累计注册', color: '#1cb0f6', values: report.trend.map((point) => point.totalRegisteredUserCount) },
                    { key: 'wau', label: 'WAU', color: '#58cc02', values: report.trend.map((point) => point.weeklyActiveUserCount) },
                    { key: 'mau', label: 'MAU', color: '#ff9600', values: report.trend.map((point) => point.monthlyActiveUserCount) },
                  ]}
                  emptyDescription="近 30 天暂无注册或已登录访问数据"
                />
                <GrowthTrendChart
                  title="各端每日活跃"
                  description="每条线按端内用户去重；同一用户跨端访问会分别出现在对应端，不可相加为总 DAU。"
                  trend={report.trend}
                  series={[
                    { key: 'web-app', label: '电脑 Web', color: clientColors.web_app, values: report.trend.map((point) => point.webAppActiveUserCount) },
                    { key: 'mobile-web', label: 'Mobile Web', color: clientColors.mobile_web, values: report.trend.map((point) => point.mobileWebActiveUserCount) },
                    { key: 'mobile-app', label: '原生 App', color: clientColors.mobile_app, values: report.trend.map((point) => point.mobileAppActiveUserCount) },
                  ]}
                  emptyDescription="近 30 天暂无已登录访问数据"
                />
              </Space>
            </Col>
            <Col lg={10} xs={24}>
              <Card title="端侧活跃分布" size="small">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {report.clientDistribution.map((item) => <ClientDistributionCard item={item} key={item.clientType} mau={report.summary.mau} />)}
                </Space>
              </Card>
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            数据更新于 {new Date(report.generatedAt).toLocaleString()}。DAU/WAU/MAU 仅覆盖已登录用户；未登录访客不纳入统计。
          </Typography.Text>
        </>
      ) : <Empty description={isLoading ? '增长数据加载中…' : '暂无增长数据。'} />}
    </section>
  )
}
