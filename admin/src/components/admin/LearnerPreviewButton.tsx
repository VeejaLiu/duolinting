import { Alert, Button, Modal, QRCode, Select, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ContentLocale, ListeningExercise, TranscriptLine } from '@duolinting/shared'
import { transcriptTranslation } from '@duolinting/shared'
import { createPlaybackController, secondsToUs, type PlaybackSession } from '@duolinting/playback'
import { createWebPlaybackAdapter } from '@duolinting/playback/web'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type Preview = { course: ListeningExercise; mobilePreviewToken: string | null }
export function LearnerPreviewButton({ exerciseId, audioUrl, lines, adminToken }: {
  exerciseId?: number; audioUrl: string; lines: TranscriptLine[]; adminToken: string
}) {
  const { t } = useAdminLanguage()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [index, setIndex] = useState(0), [rate, setRate] = useState(1), [repeats, setRepeats] = useState(1)
  const [locale, setLocale] = useState<ContentLocale>('zh-CN')
  const media = useRef<HTMLMediaElement | null>(null), source = useRef(''), session = useRef<PlaybackSession | null>(null)
  const loop = useRef(0), request = useRef(0)
  const controller = useRef<ReturnType<typeof createPlaybackController> | null>(null)
  if (!controller.current) controller.current = createPlaybackController(createWebPlaybackAdapter(() => media.current, () => source.current))
  source.current = preview?.course.release ? `release:${preview.course.release.courseReleaseId}` : ''
  useEffect(() => () => { request.current++; loop.current++; controller.current?.cancel() }, [])
  const stop = () => { loop.current++; controller.current?.cancel(); session.current = null }
  const load = async () => {
    if (!exerciseId) return
    const id = ++request.current; stop(); setOpen(true); setBusy(true); setError(''); setPreview(null)
    try {
      const result = await apiClient.createLearnerPreview(exerciseId, lines, audioUrl, adminToken)
      if (request.current === id) { setPreview(result); setIndex(0) }
    } catch (cause) { if (request.current === id) setError(cause instanceof Error ? cause.message : t('预览失败')) }
    finally { if (request.current === id) setBusy(false) }
  }
  const play = async () => {
    const line = preview?.course.lines[index]
    if (!line || !media.current) return
    stop(); setError('')
    const generation = ++loop.current
    media.current.playbackRate = rate; media.current.preservesPitch = true
    const next = controller.current!.repeat({ sourceKey: source.current, startUs: secondsToUs(line.start), endUs: secondsToUs(line.end) }, repeats)
    session.current = next
    const result = await next.finished
    if (generation !== loop.current) return
    if (result.reason !== 'range-ended') { if (result.reason === 'failed' || result.reason === 'timeout') setError(t('播放失败，请重试')); return }
  }
  const line = preview?.course.lines[index]
  return <>
    <Button disabled={!exerciseId || !audioUrl || !lines.length} onClick={() => void load()}>{t('学习者预览')}</Button>
    <Modal title={t('学习者预览')} open={open} width={900} footer={null} destroyOnHidden onCancel={() => { request.current++; stop(); setOpen(false); setPreview(null); setBusy(false) }}>
      {busy && <Typography.Paragraph>{t('正在准备发布预览与波形…')}</Typography.Paragraph>}
      {error && <Alert type="error" message={error} />}
      {preview && <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Typography.Text>{preview.course.title} · {t('版本')} {preview.course.release?.courseReleaseId}</Typography.Text>
        {preview.course.mediaType === 'video'
          ? <video ref={(value) => { media.current = value }} src={resolveApiUrl(preview.course.audioUrl)} playsInline style={{ width: '100%', maxHeight: 320 }} />
          : <audio ref={(value) => { media.current = value }} src={resolveApiUrl(preview.course.audioUrl)} preload="metadata" />}
        {preview.course.waveform && <svg viewBox="0 0 600 72" style={{ width: '100%', background: '#f8fafc' }} aria-label={t('媒体波形')}>
          {Array.from({ length: 150 }, (_, i) => {
            const peaks = preview.course.waveform!.peaks, start = Math.floor(i * peaks.length / 150), end = Math.floor((i + 1) * peaks.length / 150)
            let max = 0; for (let j = start; j < end; j++) max = Math.max(max, peaks[j])
            return <rect key={i} x={i*4} y={36-max*34} width={2} height={Math.max(1,max*68)} fill="#1cb0f6" />
          })}
        </svg>}
        <Select style={{ width: '100%' }} value={index} onChange={(value) => { stop(); setIndex(value) }} options={preview.course.lines.map((item, i) => ({ value: i, label: `${i+1}. ${item.text}` }))} />
        <Typography.Paragraph strong>{line?.text}</Typography.Paragraph>
        <Typography.Paragraph>{line && transcriptTranslation(line, locale)}</Typography.Paragraph>
        <Space wrap>
          <Select value={locale} onChange={setLocale} options={['zh-CN','en-US','th-TH','ja-JP','fr-FR','es-ES'].map((value) => ({ value, label: value }))} />
          <Select value={rate} onChange={(value) => { stop(); setRate(value) }} options={[0.5,1,1.5,2].map((value) => ({ value, label: `${value}×` }))} />
          <Select value={repeats} onChange={(value) => { stop(); setRepeats(value) }} options={[1,2,3].map((value) => ({ value, label: `${t('播放次数')} ${value}` }))} />
          <Button onClick={() => void play()}>{t('整句试听')}</Button><Button onClick={stop}>{t('停止')}</Button>
        </Space>
        {preview.mobilePreviewToken ? <Space align="start"><QRCode value={`duolinting://preview/${preview.mobilePreviewToken}`} /><Typography.Text copyable>{`duolinting://preview/${preview.mobilePreviewToken}`}</Typography.Text></Space>
          : <Typography.Text>{t('绑定学习账号后可生成手机测试入口')}</Typography.Text>}
        <Typography.Text type="secondary">{t('手机预览需登录有权限的学习账号，链接 24 小时后失效。')}</Typography.Text>
      </Space>}
    </Modal>
  </>
}
