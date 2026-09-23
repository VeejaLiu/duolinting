import { useEffect, useRef, useState } from 'react'
import { AudioPreviewTooLargeError, preparePreciseAudioPreview } from '../lib/preciseAudioPreview'

export function usePreciseAudioPreview(sourceUrl: string, mediaType: string, file: File | null) {
  const needsPreview = Boolean(sourceUrl && mediaType === 'audio' && (
    file?.type === 'audio/mpeg' || /\.mp3(?:[?#]|$)/i.test(file?.name ?? '') || /\.mp3(?:[?#]|$)/i.test(sourceUrl)
  ))
  const [attempt, setAttempt] = useState(0)
  const requestRef = useRef(0)
  const [result, setResult] = useState({ source: '', attempt: -1, request: -1, url: '', error: '' })
  useEffect(() => {
    if (!needsPreview) return
    const request = ++requestRef.current
    const controller = new AbortController()
    let objectUrl = ''
    void preparePreciseAudioPreview(sourceUrl, controller.signal).then((blob) => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setResult({ source: sourceUrl, attempt, request, url: objectUrl, error: '' })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setResult({ source: sourceUrl, attempt, request, url: '', error: error instanceof AudioPreviewTooLargeError
        ? '音频过长，无法准备精确预览。请使用 WAV 文件进行校对。'
        : '精确音频预览准备失败，请重试。' })
    })
    return () => {
      controller.abort()
      requestRef.current += 1
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sourceUrl, needsPreview, attempt])
  const current = result.source === sourceUrl && result.attempt === attempt && result.request === requestRef.current ? result : null
  return {
    url: needsPreview ? current?.url ?? '' : sourceUrl,
    preparing: needsPreview && !current,
    error: needsPreview ? current?.error ?? '' : '',
    retry: () => setAttempt((value) => value + 1),
  }
}
