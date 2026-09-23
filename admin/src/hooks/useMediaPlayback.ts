import { useEffect, useRef, type RefObject } from 'react'
import { createPlaybackController, secondsToUs, type StartedResult } from '@duolinting/playback'
import { createWebPlaybackAdapter } from '@duolinting/playback/web'

type UseMediaPlaybackOptions = {
  mediaRef: RefObject<HTMLMediaElement | null>
  sourceKey: string
}
export type SeekOutcome = 'ready' | 'cancelled' | 'timeout' | 'failed'
export type PlaybackOutcome = 'playing' | Exclude<SeekOutcome, 'ready'>
const playbackOutcome = (result: StartedResult): PlaybackOutcome =>
  result.reason === 'started' ? 'playing' : result.reason

export function useMediaPlayback({ mediaRef, sourceKey }: UseMediaPlaybackOptions) {
  const sourceRef = useRef(sourceKey)
  sourceRef.current = sourceKey
  const controllerRef = useRef<ReturnType<typeof createPlaybackController> | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createPlaybackController(createWebPlaybackAdapter(() => mediaRef.current, () => sourceRef.current))
  }
  const controller = controllerRef.current
  useEffect(() => () => controller.cancel(), [controller, sourceKey])

  const playMedia = async (startAt?: number): Promise<PlaybackOutcome> => {
    const media = mediaRef.current
    if (!media) return 'failed'
    const start = startAt ?? (media.ended ? 0 : undefined)
    const session = controller.play({ sourceKey: sourceRef.current,
      startUs: start === undefined ? undefined : secondsToUs(start) })
    return playbackOutcome(await session.started)
  }
  const playRangeSession = ({ start, end }: { start: number; end?: number }) =>
    controller.play({ sourceKey: sourceRef.current, startUs: secondsToUs(start),
      endUs: end === undefined ? undefined : secondsToUs(end) })
  // Admin 的既有按钮等待“开始”；其他端可以等待同一个 session.finished。
  const playMediaRange = async (range: { start: number; end?: number }) =>
    playbackOutcome(await playRangeSession(range).started)
  const seekMedia = async (seconds: number): Promise<SeekOutcome> => {
    const media = mediaRef.current
    const resume = Boolean(media && !media.paused && !media.ended)
    const session = resume
      ? controller.play({ sourceKey: sourceRef.current, startUs: secondsToUs(seconds) })
      : controller.seek(sourceRef.current, secondsToUs(seconds))
    const result = await session.started
    return result.reason === 'started' ? 'ready' : result.reason
  }
  return { playMedia, playMediaRange, playRangeSession, seekMedia, stopPlayback: () => controller.cancel() }
}
