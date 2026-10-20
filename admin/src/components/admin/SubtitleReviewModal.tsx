import type { ListeningExercise, SubtitleDraft, TranscriptLine } from '@duolinting/shared'
import { Alert, Button, Empty, Form, Input, Modal, Select, Switch, Tag } from 'antd'
import { Headphones, Pause, Play } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useMediaPlayback } from '../../hooks/useMediaPlayback'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import {
  buildSubtitleReviewRows, formatReviewTime, reviewTextChange, reviewTranslations,
  type SubtitleReviewRow,
} from '../../lib/subtitleReview'

type Version = 'before' | 'after'
type ReviewModalProps = {
  exercise: ListeningExercise
  onClose: () => void
  onApprove: (draftId: number) => Promise<boolean>
  onReturn: (draftId: number, note: string) => Promise<boolean>
}

type ReviewWorkbenchProps = ReviewModalProps & {
  draft: SubtitleDraft
  drafts: SubtitleDraft[]
  onDraftChange: (draftId: number) => void
}

const isPlayable = (line: TranscriptLine) =>
  Number.isFinite(line.start) && Number.isFinite(line.end) && line.start >= 0 && line.end > line.start

export function SubtitleReviewModal(props: ReviewModalProps) {
  const drafts = props.exercise.subtitleDrafts?.filter((draft) => draft.status === 'submitted') ?? []
  const [draftId, setDraftId] = useState(drafts[0]?.id)
  const draft = drafts.find((item) => item.id === draftId) ?? drafts[0]
  return draft ? <SubtitleReviewWorkbench {...props} draft={draft} drafts={drafts} key={draft.id} onDraftChange={setDraftId} /> : null
}

function SubtitleReviewWorkbench({ exercise, draft, drafts, onDraftChange, onClose, onApprove, onReturn }: ReviewWorkbenchProps) {
  const { t, uiLocale } = useAdminLanguage()
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const playRequestRef = useRef(0)
  const activePreviewRef = useRef(false)
  const actionLockRef = useRef(false)
  const [form] = Form.useForm<{ note: string }>()
  const [showComparison, setShowComparison] = useState(true)
  const [changesOnly, setChangesOnly] = useState(false)
  const [returning, setReturning] = useState(false)
  const [pendingAction, setPendingAction] = useState<'approve' | 'return' | null>(null)
  const [version, setVersion] = useState<Version>('after')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [previewKey, setPreviewKey] = useState('')
  const [pendingPlay, setPendingPlay] = useState('')
  const [mediaError, setMediaError] = useState('')
  const { playMedia, playRangeSession, stopPlayback } = useMediaPlayback({ mediaRef, sourceKey: exercise.audioUrl })
  const rows = useMemo(() => buildSubtitleReviewRows(exercise.lines, draft.lines), [exercise.lines, draft.lines])
  const visibleRows = useMemo(() => changesOnly ? rows.filter((row) => row.kind !== 'unchanged') : rows, [changesOnly, rows])
  const counts = rows.reduce((result, row) => ({ ...result, [row.kind]: result[row.kind] + 1 }),
    { unchanged: 0, modified: 0, added: 0, removed: 0 })
  // 句子区间是 [start, end)，句尾暂停时 currentTime 可能已落在下一句或空白处。
  // 审核试听保留选中的版本/句子，连续播放和原生播放器重新播放时才恢复时间轴跟随。
  const currentRow = rows.find((row) => row.key === previewKey) ?? rows.find((row) => {
    const line = row[version]
    return line && currentTime >= line.start && currentTime < line.end
  })
  const currentLine = currentRow?.[version]
  const currentIndex = version === 'before' ? currentRow?.beforeIndex : currentRow?.afterIndex

  const playLine = useCallback(async (row: SubtitleReviewRow, targetVersion: Version) => {
    const line = row[targetVersion]
    if (!line || !exercise.audioUrl || !isPlayable(line)) return
    const requestId = ++playRequestRef.current
    activePreviewRef.current = true
    setSelectedKey(row.key)
    setPreviewKey(row.key)
    setVersion(targetVersion)
    setCurrentTime(line.start)
    setMediaError('')
    setPendingPlay(`${row.key}:${targetVersion}`)
    // 直接使用该版本的源时间，不补前后空白、不取整；共享控制器负责取消旧试听和句尾停止。
    const session = playRangeSession({ start: line.start, end: line.end })
    const started = await session.started
    if (requestId !== playRequestRef.current) return
    setPendingPlay('')
    if (started.reason === 'failed' || started.reason === 'timeout') {
      activePreviewRef.current = false
      setMediaError(t('逐句试听未就绪，请稍后重试'))
      return
    }
    const finished = await session.finished
    if (requestId !== playRequestRef.current) return
    activePreviewRef.current = false
    if (finished.reason === 'cancelled' || finished.reason === 'interrupted') setPreviewKey('')
    if (finished.reason === 'failed' || finished.reason === 'timeout') {
      setMediaError(t('逐句试听未就绪，请稍后重试'))
    }
  }, [exercise.audioUrl, playRangeSession, t])

  const togglePlayback = async () => {
    const requestId = ++playRequestRef.current
    setPendingPlay('')
    if (isPlaying) { stopPlayback(); return }
    activePreviewRef.current = false
    setPreviewKey('')
    setVersion('after')
    setMediaError('')
    const outcome = await playMedia()
    if (requestId === playRequestRef.current && (outcome === 'failed' || outcome === 'timeout')) {
      setMediaError(t('逐句试听未就绪，请稍后重试'))
    }
  }

  const handleMediaPlay = () => {
    // 原生 controls 的继续播放不再受上一次试听句子锁定，改为跟随送审稿时间轴。
    if (!activePreviewRef.current) {
      setPreviewKey('')
      setVersion('after')
    }
    setIsPlaying(true)
  }

  const locateCurrentLine = () => {
    if (!currentRow) return
    setChangesOnly(false)
    setSelectedKey(currentRow.key)
    // 筛选关闭后再定位，只滚动字幕容器，避免把固定播放器和审核底栏一起卷走。
    requestAnimationFrame(() => {
      const list = listRef.current
      const row = list?.querySelector<HTMLElement>(`[data-review-key="${currentRow.key}"]`)
      if (list && row) list.scrollTo({
        top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - 12,
        behavior: 'smooth',
      })
    })
  }

  const submitDecision = async (action: 'approve' | 'return') => {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const values = action === 'return' ? await form.validateFields().catch(() => null) : null
      if (action === 'return' && !values) return
      const note = values?.note.trim() ?? ''
      setPendingAction(action)
      ++playRequestRef.current
      setPendingPlay('')
      stopPlayback()
      const succeeded = action === 'approve' ? await onApprove(draft.id) : await onReturn(draft.id, note)
      if (succeeded) stopPlayback()
    } finally {
      actionLockRef.current = false
      setPendingAction(null)
    }
  }

  const renderLine = useCallback((row: SubtitleReviewRow, targetVersion: Version) => {
    const line = row[targetVersion]
    const index = targetVersion === 'before' ? row.beforeIndex : row.afterIndex
    const isBefore = targetVersion === 'before'
    const label = isBefore ? t('课程原字幕') : t('本次送审稿')
    const textChange = row.before && row.after && row.textChanged
      ? reviewTextChange(row.before.text, row.after.text)[targetVersion] : null
    const translations = line ? reviewTranslations(line) : []
    return <div className={`subtitle-review-version subtitle-review-version-${targetVersion}`}>
      <div className="subtitle-review-version-label">{label}{index !== undefined && <span>{t('第 {{index}} 句', { index: index + 1 })}</span>}</div>
      {line ? <>
        <button
          aria-label={t('试听{{version}}第 {{index}} 句：{{text}}', { version: label, index: (index ?? 0) + 1, text: line.text })}
          className="subtitle-review-sentence"
          disabled={!exercise.audioUrl || !isPlayable(line)}
          onClick={() => void playLine(row, targetVersion)}
          type="button"
        >
          <span className={`subtitle-review-time${row.timingChanged ? ' is-changed' : ''}`}>
            <Play aria-hidden size={13} /> {formatReviewTime(line.start)} – {formatReviewTime(line.end)}
            {pendingPlay === `${row.key}:${targetVersion}` && <span>{t('加载中…')}</span>}
          </span>
          <span className="subtitle-review-text">
            {textChange ? <>{textChange.prefix}<mark>{textChange.changed}</mark>{textChange.suffix}</> : line.text || t('未填写字幕')}
          </span>
        </button>
        {!isPlayable(line) && <span className="subtitle-review-invalid">{t('时间范围无效，无法试听')}</span>}
        {Boolean(translations.length || line.answers?.length || line.keywords?.length) && <details className="subtitle-review-extra" open={row.detailsChanged}>
          <summary>{t('译文与学习信息')}</summary>
          {translations.map(([locale, translation]) => <div className="subtitle-review-translation" key={locale}>
            <span>{locale}</span><span lang={locale}>{translation}</span>
          </div>)}
          {Boolean(line.answers?.length) && <div className="subtitle-review-details">{t('可接受答案')}：{line.answers.join(' / ')}</div>}
          {Boolean(line.keywords?.length) && <div className="subtitle-review-details">{t('关键词')}：{line.keywords.join(', ')}</div>}
        </details>}
      </> : <div className="subtitle-review-missing">{t(isBefore ? '此句为新增字幕' : '此句已从送审稿删除')}</div>}
    </div>
  }, [exercise.audioUrl, pendingPlay, playLine, t])

  // 播放位置会频繁更新，但字幕内容不会随之变化。只在选句、改动筛选或句子高亮变化时
  // 重建长列表，避免媒体 timeupdate 反复渲染整份双栏字幕，影响播放和底部按钮响应。
  const transcriptRows = useMemo(() => visibleRows.map((row) => <article
    className={`subtitle-review-row is-${row.kind}${selectedKey === row.key ? ' is-selected' : ''}${isPlaying && currentRow?.key === row.key ? ' is-playing' : ''}`}
    data-review-key={row.key} key={row.key}
  >
    <div className="subtitle-review-row-heading">
      <strong>{row.afterIndex !== undefined ? t('第 {{index}} 句', { index: row.afterIndex + 1 }) : t('原第 {{index}} 句', { index: (row.beforeIndex ?? 0) + 1 })}</strong>
      {row.kind === 'added' && <Tag color="green">{t('新增字幕')}</Tag>}
      {row.kind === 'removed' && <Tag color="red">{t('删除字幕')}</Tag>}
      {row.textChanged && <Tag color="gold">{t('文字修改')}</Tag>}
      {row.timingChanged && <Tag color="orange">{t('时间调整')}</Tag>}
      {row.detailsChanged && <Tag color="purple">{t('译文或学习信息修改')}</Tag>}
      {row.kind === 'unchanged' && <span>{t('未改动')}</span>}
    </div>
    <div className={`subtitle-review-versions${showComparison || row.kind === 'removed' ? ' with-comparison' : ''}`}>
      {(showComparison || row.kind === 'removed') && renderLine(row, 'before')}
      {renderLine(row, 'after')}
    </div>
  </article>), [currentRow, isPlaying, renderLine, selectedKey, showComparison, t, visibleRows])

  const submittedAt = draft.submittedAt ? new Date(draft.submittedAt) : null
  const footer = <div className="subtitle-review-footer">
    {returning && <Form className="subtitle-review-return-form" form={form} layout="vertical" onFinish={() => void submitDecision('return')}>
      <Form.Item label={t('修改意见')} name="note" rules={[{ required: true, whitespace: true, message: t('请填写修改意见后再退回') }]}>
        <Input.TextArea autoFocus autoSize={{ minRows: 2, maxRows: 4 }} disabled={Boolean(pendingAction)} maxLength={4000}
          placeholder={t('请说明需要修改的句子、文字或时间范围')} showCount />
      </Form.Item>
    </Form>}
    <div className="subtitle-review-footer-bar">
      <p>{t(returning ? '退回后，校对人会收到修改意见；当前已发布版本保持不变。' : '审核通过后将替换课程正式字幕并发布。')}</p>
      <div className="subtitle-review-actions">
        {returning ? <>
          <Button disabled={Boolean(pendingAction)} onClick={() => setReturning(false)}>{t('取消退回')}</Button>
          <Button loading={pendingAction === 'return'} onClick={() => void submitDecision('return')} type="primary">{t('确认退回')}</Button>
        </> : <>
          <Button disabled={Boolean(pendingAction)} onClick={() => { stopPlayback(); setReturning(true) }}>{t('退回修改')}</Button>
          <Button loading={pendingAction === 'approve'} onClick={() => void submitDecision('approve')} type="primary">{t('审核通过并发布')}</Button>
        </>}
      </div>
    </div>
  </div>

  return <Modal
    className="subtitle-review-modal"
    wrapClassName="subtitle-review-modal-wrap"
    classNames={{ container: 'subtitle-review-modal-container', body: 'subtitle-review-modal-body', footer: 'subtitle-review-modal-footer' }}
    closable={{ disabled: Boolean(pendingAction) }}
    footer={footer}
    keyboard={!pendingAction}
    mask={{ closable: false }}
    onCancel={() => { if (!actionLockRef.current) { stopPlayback(); onClose() } }}
    open
    style={{ top: 20, paddingBottom: 0 }}
    title={<div className="subtitle-review-heading">
      <strong>{t('二次审核：{{title}}', { title: exercise.title })}</strong>
      <span>{t('提交人：{{name}}', { name: draft.contributorDisplayName })} · {t('共 {{count}} 句', { count: draft.lines.length })}
        {submittedAt && Number.isFinite(submittedAt.getTime()) && <> · {submittedAt.toLocaleString(uiLocale)}</>}
      </span>
    </div>}
    width="min(1440px, calc(100vw - 40px))"
  >
    <div className="subtitle-review-workbench">
      <section aria-label={t('课程媒体')} className="subtitle-review-player-panel">
        <div className="subtitle-review-panel-heading"><Headphones aria-hidden size={17} /><strong>{t('课程媒体')}</strong></div>
        {exercise.audioUrl ? <div className={`subtitle-review-media subtitle-review-media-${exercise.mediaType}`}>
          {exercise.mediaType === 'video' ? <video
            controls playsInline preload="metadata" ref={(media) => { mediaRef.current = media }} src={exercise.audioUrl}
            onError={() => setMediaError(t('媒体加载失败，请检查网络后重试'))}
            onPause={() => setIsPlaying(false)} onPlay={handleMediaPlay} onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          /> : <>
            <div className="subtitle-review-audio-cover">{exercise.coverImageUrl ? <img alt="" src={exercise.coverImageUrl} /> : <Headphones aria-hidden size={52} />}</div>
            <audio controls preload="metadata" ref={(media) => { mediaRef.current = media }} src={exercise.audioUrl}
              onError={() => setMediaError(t('媒体加载失败，请检查网络后重试'))}
              onPause={() => setIsPlaying(false)} onPlay={handleMediaPlay} onEnded={() => setIsPlaying(false)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} />
          </>}
        </div> : <Empty description={t('该课程还没有上传媒体')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        <div className="subtitle-review-playback-controls">
          <Button disabled={!exercise.audioUrl} icon={isPlaying ? <Pause size={14} /> : <Play size={14} />} onClick={() => void togglePlayback()}>{t(isPlaying ? '暂停播放' : '连续播放')}</Button>
          <Button disabled={!currentRow} onClick={locateCurrentLine}>{t('定位当前句')}</Button>
        </div>
        <p className="subtitle-review-hint">{t('点击右侧句子试听，到句尾自动停止；原字幕和送审稿按各自时间范围播放。')}</p>
        {mediaError && <Alert title={mediaError} showIcon type="error" />}
        <div aria-live="polite" className="subtitle-review-current-line">
          <span>{t(version === 'before' ? '课程原字幕' : '本次送审稿')} · {formatReviewTime(currentTime)}{currentIndex !== undefined && ` · ${t('第 {{index}} 句', { index: currentIndex + 1 })}`}</span>
          <strong>{currentLine?.text || t('播放时在这里显示当前字幕')}</strong>
        </div>
      </section>
      <section aria-label={t('字幕审核')} className="subtitle-review-transcript-panel">
        <div className="subtitle-review-toolbar">
          <div className="subtitle-review-summary">
            <strong>{t('逐句核对')}</strong>
            <Tag color="gold">{t('修改 {{count}}', { count: counts.modified })}</Tag>
            <Tag color="green">{t('新增 {{count}}', { count: counts.added })}</Tag>
            <Tag color="red">{t('删除 {{count}}', { count: counts.removed })}</Tag>
          </div>
          {drafts.length > 1 && <Select aria-label={t('选择送审稿')} disabled={Boolean(pendingAction)} onChange={(nextDraftId) => {
            ++playRequestRef.current
            stopPlayback()
            onDraftChange(nextDraftId)
          }}
            options={drafts.map((item) => ({ value: item.id, label: `${item.contributorDisplayName} · #${item.id}` }))} value={draft.id} />}
          <div className="subtitle-review-filters">
            <label><Switch checked={showComparison} onChange={setShowComparison} size="small" />{t('修改前后对比')}</label>
            <label><Switch checked={changesOnly} onChange={setChangesOnly} size="small" />{t('只看改动')}</label>
          </div>
        </div>
        <div aria-label={t('逐句字幕')} className="subtitle-review-list" ref={listRef}>
          {transcriptRows.length ? transcriptRows : <Empty description={t(changesOnly ? '送审稿与课程原字幕一致' : '没有可审核的字幕')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </div>
      </section>
    </div>
  </Modal>
}
