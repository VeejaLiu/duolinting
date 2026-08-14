import { CheckCircle2, Clock3, Filter, MessageSquareWarning, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AcceptedAnswerFeedback, FeedbackStatus } from '@duolinting/shared'

type AcceptedAnswerFeedbackPanelProps = {
  items: AcceptedAnswerFeedback[]
  isLoading: boolean
  isSaving: boolean
  onStatusChange: (feedbackId: number, status: FeedbackStatus) => void
}

const statusLabels: Record<FeedbackStatus, string> = {
  open: '待处理',
  reviewed: '已处理',
  dismissed: '已忽略',
}

export function AcceptedAnswerFeedbackPanel({
  items,
  isLoading,
  isSaving,
  onStatusChange,
}: AcceptedAnswerFeedbackPanelProps) {
  const [selectedStatus, setSelectedStatus] = useState<FeedbackStatus | 'all'>('open')

  const filteredItems = useMemo(
    () =>
      selectedStatus === 'all'
        ? items
        : items.filter((item) => item.status === selectedStatus),
    [items, selectedStatus],
  )

  return (
    <section className="admin-section">
      <div className="panel-title">
        <MessageSquareWarning size={17} aria-hidden="true" />
        <span>答案反馈</span>
      </div>

      <div className="course-toolbar">
        <div className="course-filters">
          <div className="filter-label">
            <Filter size={14} aria-hidden="true" />
            <span>筛选</span>
          </div>
          <label className="field">
            <span>处理状态</span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value as FeedbackStatus | 'all')
              }
            >
              <option value="all">全部</option>
              <option value="open">待处理</option>
              <option value="reviewed">已处理</option>
              <option value="dismissed">已忽略</option>
            </select>
          </label>
        </div>
      </div>

      <div className="course-summary-bar">
        <span>{filteredItems.length} 条反馈</span>
        <span>右侧可直接更新处理状态</span>
      </div>

      <div className="feedback-list">
        {filteredItems.map((item) => (
          <article className="feedback-card" key={item.id}>
            <div className="feedback-card-main">
              <div className="course-list-head">
                <strong>{item.exerciseTitle}</strong>
                <span className={`publish-status ${item.status}`}>
                  {statusLabels[item.status]}
                </span>
              </div>
              <div className="course-meta">
                <span>用户：{item.user.displayName}</span>
                <span>{item.user.email}</span>
                <span>句子：{item.lineId}</span>
              </div>
              <div className="feedback-block">
                <span className="feedback-label">原句</span>
                <p>{item.lineText}</p>
              </div>
              <div className="feedback-block">
                <span className="feedback-label">译文</span>
                <p>{item.lineTranslation || '无'}</p>
              </div>
              <div className="feedback-block">
                <span className="feedback-label">学员答案</span>
                <p>{item.submittedAnswer}</p>
              </div>
              <div className="feedback-block">
                <span className="feedback-label">当前可接受答案</span>
                <p>{item.acceptedAnswers.join(' / ') || '无'}</p>
              </div>
              <div className="course-meta">
                <span>
                  <Clock3 size={14} aria-hidden="true" /> {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="row-actions feedback-actions">
              <button
                className="mini-command"
                disabled={isSaving || item.status === 'reviewed'}
                onClick={() => onStatusChange(item.id, 'reviewed')}
                type="button"
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                已处理
              </button>
              <button
                className="mini-command secondary"
                disabled={isSaving || item.status === 'open'}
                onClick={() => onStatusChange(item.id, 'open')}
                type="button"
              >
                <Clock3 size={15} aria-hidden="true" />
                待处理
              </button>
              <button
                className="mini-command danger"
                disabled={isSaving || item.status === 'dismissed'}
                onClick={() => onStatusChange(item.id, 'dismissed')}
                type="button"
              >
                <XCircle size={15} aria-hidden="true" />
                忽略
              </button>
            </div>
          </article>
        ))}
        {!isLoading && filteredItems.length === 0 && (
          <div className="admin-empty-state course-empty-state">
            <p>当前筛选条件下还没有反馈。</p>
          </div>
        )}
        {isLoading && (
          <div className="admin-empty-state course-empty-state">
            <p>反馈加载中...</p>
          </div>
        )}
      </div>
    </section>
  )
}
