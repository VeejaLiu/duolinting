import { useEffect, useState } from 'react'

const LOADING_FEEDBACK_DELAY_MS = 350

/** Delay visual feedback only; playback, cancellation and range checks remain immediate. */
export function usePlaybackLoading(loading: boolean, requestKey: string) {
  const [visibleRequest, setVisibleRequest] = useState<string | null>(null)

  useEffect(() => {
    setVisibleRequest(null)
    if (!loading) return
    // 350ms 内的缓存定位不遮住画面。换句或结束等待时取消旧定时器，
    // 防止上一句的迟到提示覆盖已经开始播放的新句。
    const timer = setTimeout(() => setVisibleRequest(requestKey), LOADING_FEEDBACK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [loading, requestKey])

  return loading && visibleRequest === requestKey
}
