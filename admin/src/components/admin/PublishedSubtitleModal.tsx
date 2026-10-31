import type { ListeningExercise } from '@duolinting/shared'
import { Alert, Button, Empty, Modal, Spin, Tag } from 'antd'
import { Headphones } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient, ApiClientError } from '../../lib/apiClient'
import { courseTitle } from '../../lib/localizedContent'
import { formatReviewTime, reviewTranslations } from '../../lib/subtitleReview'

/** All completion entry points share this read-only view; opening it never mounts the subtitle editor. */
export function PublishedSubtitleModal({ adminToken, exerciseId, onClose }: {
  adminToken: string
  exerciseId: number
  onClose: () => void
}) {
  const { t, uiLocale } = useAdminLanguage()
  const [exercise, setExercise] = useState<ListeningExercise | null>(null)
  const [error, setError] = useState('')
  const [mediaError, setMediaError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const attachMedia = useCallback((media: HTMLMediaElement | null) => {
    // A detached native player can keep playing. Pause the old element before close/retry clears its ref.
    if (mediaRef.current && mediaRef.current !== media) mediaRef.current.pause()
    mediaRef.current = media
  }, [])
  const retry = () => { setError(''); setExercise(null); setMediaError(false); setAttempt((value) => value + 1) }

  useEffect(() => {
    let cancelled = false
    void apiClient.getAdminExercise(exerciseId, adminToken).then((detail) => {
      if (cancelled) return
      if (detail.status !== 'published') {
        setError(t('这门课程当前未发布，暂时无法查看正式字幕。'))
        return
      }
      setExercise(detail)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof ApiClientError && reason.status === 403
        ? t('这门课程当前不可查看，可能已撤回发布或调整了访问权限。')
        : reason instanceof Error ? reason.message : t('已发布字幕加载失败，请重试'))
    })
    return () => { cancelled = true }
  }, [adminToken, attempt, exerciseId, t])

  return <Modal
    className="subtitle-review-modal"
    wrapClassName="subtitle-review-modal-wrap"
    classNames={{ container: 'subtitle-review-modal-container', body: 'subtitle-review-modal-body', footer: 'subtitle-review-modal-footer' }}
    footer={<Button onClick={onClose}>{t('关闭')}</Button>}
    mask={{ closable: false }}
    onCancel={onClose}
    open
    style={{ top: 20, paddingBottom: 0 }}
    title={<div className="subtitle-review-heading">
      <strong>{exercise ? t('已发布字幕：{{title}}', { title: courseTitle(exercise, uiLocale) }) : t('查看已发布字幕')}</strong>
      <span>{t('显示课程当前正式字幕，仅供查看。')}</span>
    </div>}
    width="min(1440px, calc(100vw - 40px))"
  >
    {error ? <Alert
      style={{ margin: 24 }}
      action={<Button onClick={retry}>{t('重试')}</Button>}
      showIcon title={error} type="error"
    /> : !exercise ? <Spin tip={t('加载中…')}><div style={{ minHeight: 160 }} /></Spin> : <div className="subtitle-review-workbench">
      <section aria-label={t('课程媒体')} className="subtitle-review-player-panel">
        <div className="subtitle-review-panel-heading"><Headphones aria-hidden size={17} /><strong>{t('课程媒体')}</strong><Tag color="success">{t('已发布')}</Tag></div>
        {exercise.audioUrl ? <div className={`subtitle-review-media subtitle-review-media-${exercise.mediaType}`}>
          {exercise.mediaType === 'video'
            ? <video controls playsInline preload="metadata" ref={attachMedia} src={exercise.audioUrl} onError={() => setMediaError(true)} />
            : <audio controls preload="metadata" ref={attachMedia} src={exercise.audioUrl} onError={() => setMediaError(true)} />}
        </div> : <Empty description={t('该课程还没有上传媒体')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        {mediaError && <Alert showIcon title={t('媒体加载失败，请检查网络后重试')} type="error" />}
      </section>
      <section aria-label={t('逐句字幕')} className="subtitle-review-transcript-panel">
        <div className="subtitle-review-toolbar"><strong>{t('共 {{count}} 句', { count: exercise.lines.length })}</strong></div>
        <div className="subtitle-review-list">
          {exercise.lines.length ? exercise.lines.map((line, index) => <article className="subtitle-review-row" key={line.id}>
            <div className="subtitle-review-row-heading"><strong>{t('第 {{index}} 句', { index: index + 1 })}</strong></div>
            <div className="subtitle-review-version">
              <span className="subtitle-review-time">{formatReviewTime(line.start)} – {formatReviewTime(line.end)}</span>
              <p className="subtitle-review-text">{line.text}</p>
              {reviewTranslations(line).map(([locale, translation]) => <div className="subtitle-review-translation" key={locale}>
                <span>{locale}</span><span lang={locale}>{translation}</span>
              </div>)}
              {Boolean(line.answers?.length) && <div className="subtitle-review-details">{t('可接受答案')}：{line.answers.join(' / ')}</div>}
              {Boolean(line.keywords?.length) && <div className="subtitle-review-details">{t('关键词')}：{line.keywords.join(', ')}</div>}
            </div>
          </article>) : <Empty description={t('该版本没有字幕行')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </div>
      </section>
    </div>}
  </Modal>
}
