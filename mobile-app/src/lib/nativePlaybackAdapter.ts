import type { AudioPlayer } from 'expo-audio'
import type { VideoPlayer } from 'expo-video'
import type { TimedPlaybackModule } from '../../modules/timed-playback'
import { secondsToUs, usToSeconds, SEEK_TOLERANCE_US, waitForState,
  type PlaybackAdapter, type PlaybackEvent } from '@duolinting/playback'

export function isReleasedPlayerError(error: unknown) {
  return /NativeSharedObjectNotFoundException|Unable to find the native shared object|Cannot use shared object that was already released|ERR_USING_RELEASED_SHARED_OBJECT/.test(String(error))
}

let nativeRequestSequence = 0

export function createNativePlaybackAdapter(
  audio: AudioPlayer, video: VideoPlayer, kind: 'audio' | 'video', getSource: () => string,
  native: TimedPlaybackModule | null, recoverSource?: () => Promise<void>,
): PlaybackAdapter {
  let ended = false
  let audioFailed = false
  let recovering = false
  let recovery: Promise<void> | null = null
  let nativeId: string | null = null
  const player = kind === 'audio' ? audio : video
  const ready = () => {
    if (audioFailed || (kind === 'video' && video.status === 'error')) throw new Error('Media loading failed')
    return kind === 'audio' ? audio.isLoaded : video.status === 'readyToPlay'
  }
  const snapshot: PlaybackAdapter['snapshot'] = () => {
    const state = nativeId ? native?.snapshot(nativeId) : null
    if (state) return { ...state, sourceKey: getSource() }
    return {
      sourceKey: getSource(), positionUs: secondsToUs(ended ? player.duration : player.currentTime),
      durationUs: Number.isFinite(player.duration) ? secondsToUs(player.duration) : 0,
      playing: player.playing, buffering: kind === 'audio' ? audio.isBuffering : video.status === 'loading', ended,
    }
  }
  const prepare = async (startUs: number | undefined, endUs: number | undefined, signal: AbortSignal) => {
    if (!native) throw new Error('Native playback module requires an app update')
    if (signal.aborted) throw new Error('cancelled')
    // ExoPlayer 在终止错误后不会因 play() 自动重新 prepare。仅在确实报错时
    // 重载同一源；普通切句与重播继续复用播放器和已下载片段。
    if (recoverSource && (recovery || audioFailed || (kind === 'video' && video.status === 'error'))) {
      // 快速切句共享正在进行的源恢复，避免多次 replace 互相取消。
      if (!recovery) {
        recovering = true
        audioFailed = false
        recovery = Promise.resolve().then(recoverSource).finally(() => { recovering = false; recovery = null })
      }
      await recovery
      if (signal.aborted) throw new Error('cancelled')
    }
    await waitForState(ready, signal)
    if (signal.aborted) throw new Error('cancelled')
    const previous = nativeId
    if (previous) await native.clear(previous)
    // clear 是跨原生桥的异步操作。等待期间若用户切到了别句，旧请求不得再
    // configure 同一个播放器，否则会取消新句的原生边界并跳回旧句。
    if (signal.aborted) throw new Error('cancelled')
    const id = `${kind}-${Date.now()}-${++nativeRequestSequence}`
    nativeId = id; ended = false
    const cancel = () => { void native.clear(id).catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await native.configure(player, id, usToSeconds(startUs ?? secondsToUs(player.currentTime)), endUs === undefined ? null : usToSeconds(endUs))
      if (signal.aborted) throw new Error('cancelled')
      if (startUs !== undefined && Math.abs(result.positionUs - startUs) > SEEK_TOLERANCE_US) throw new Error('Native seek position mismatch')
    } finally { signal.removeEventListener('abort', cancel) }
  }
  return {
    snapshot,
    prepare,
    seek: (positionUs, signal) => prepare(positionUs, undefined, signal),
    async play(signal) {
      if (signal.aborted) throw new Error('cancelled')
      player.play()
      await waitForState(() => player.playing && !snapshot().buffering, signal)
    },
    pause() {
      try { player.pause() } catch (error) { if (!isReleasedPlayerError(error)) throw error }
      const id = nativeId; nativeId = null
      if (id) void native?.clear(id).catch(() => {})
    },
    subscribe(listener) {
      let disposed = false
      let wasPlaying = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const emit = (event: PlaybackEvent) => { if (!disposed) listener(event) }
      const inspect = () => {
        if (disposed || recovering) return
        try {
          const state = snapshot()
          if (audioFailed || (kind === 'video' && video.status === 'error')) { emit('error'); return }
          emit('time')
          if (state.playing && !wasPlaying) emit('playing')
          if (!state.playing && wasPlaying && !state.buffering && !ended) emit('pause')
          wasPlaying = state.playing
        } catch { emit('error') }
      }
      // 20ms 仅安排下一次读取；是否结束始终由共享核心比较真实源时间。
      const tick = () => { inspect(); if (!disposed) timer = setTimeout(tick, 20) }
      const nativeSubscription = native?.addListener('onRangeEnd', ({ id }) => { if (id === nativeId) emit('ended') })
      const subscriptions = kind === 'audio'
        ? [audio.addListener('playbackStatusUpdate', (status) => {
          if (recovering) return
          audioFailed = status.playbackState === 'error'
          if (nativeId && status.didJustFinish) { emit('time'); return }
          ended = status.didJustFinish
          if (audioFailed) emit('error')
          else if (ended) emit('ended')
          else inspect()
        })]
        : [video.addListener('playToEnd', () => { if (nativeId) { emit('time'); return } ended = true; emit('ended') }),
          video.addListener('statusChange', () => inspect())]
      timer = setTimeout(tick, 0)
      return () => { disposed = true; clearTimeout(timer); nativeSubscription?.remove(); subscriptions.forEach((entry) => entry.remove()) }
    },
  }
}
