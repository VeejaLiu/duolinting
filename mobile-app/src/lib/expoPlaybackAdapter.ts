import TimedPlayback from '../../modules/timed-playback'
import { Platform } from 'react-native'
import type { AudioPlayer } from 'expo-audio'
import type { VideoPlayer } from 'expo-video'
import { secondsToUs, usToSeconds, SEEK_TOLERANCE_US, waitForState,
  type PlaybackAdapter, type PlaybackEvent } from '@duolinting/playback'
import { createWebPlaybackAdapter } from '@duolinting/playback/web'

export function isReleasedPlayerError(error: unknown) {
  return /NativeSharedObjectNotFoundException|Unable to find the native shared object|Cannot use shared object that was already released|ERR_USING_RELEASED_SHARED_OBJECT/.test(String(error))
}

let nativeRequestSequence = 0

export function createExpoPlaybackAdapter(
  audio: AudioPlayer, video: VideoPlayer, kind: 'audio' | 'video', getSource: () => string,
): PlaybackAdapter {
  const getWebMedia = () => {
    if (kind === 'audio') return (audio as unknown as { media?: HTMLMediaElement }).media ?? null
    const videos = Array.from((video as unknown as { _mountedVideos?: Set<HTMLMediaElement> })._mountedVideos ?? [])
    // Expo Web 的 VideoView 可能注册多个元素；只允许主元素出声。
    for (const element of videos) { element.onplay = null; element.onpause = null }
    for (const element of videos.slice(1)) element.pause()
    return videos[0] ?? null
  }
  if (Platform.OS === 'web') return createWebPlaybackAdapter(getWebMedia, getSource)

  let ended = false
  let nativeId: string | null = null
  const player = kind === 'audio' ? audio : video
  const ready = () => kind === 'audio' ? audio.isLoaded : video.status === 'readyToPlay'
  const snapshot: PlaybackAdapter['snapshot'] = () => {
    const native = nativeId ? TimedPlayback?.snapshot(nativeId) : null
    if (native) return { ...native, sourceKey: getSource() }
    return ({
    sourceKey: getSource(), positionUs: secondsToUs(ended ? player.duration : player.currentTime),
    durationUs: Number.isFinite(player.duration) ? secondsToUs(player.duration) : 0,
    playing: player.playing, buffering: kind === 'audio' ? audio.isBuffering : video.status === 'loading', ended,
  }) }
  const prepare = async (startUs: number | undefined, endUs: number | undefined, signal: AbortSignal) => {
    const native = TimedPlayback
    if (!native) throw new Error('Native playback module requires an app update')
    await waitForState(ready, signal)
    if (signal.aborted) throw new Error('cancelled')
    const id = `${kind}-${Date.now()}-${++nativeRequestSequence}`
    const previous = nativeId
    nativeId = id; ended = false
    if (previous) await native.clear(previous)
    const cancel = () => { void native.clear(id).catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await native.configure(player, id, usToSeconds(startUs ?? secondsToUs(player.currentTime)), endUs === undefined ? null : usToSeconds(endUs))
      if (signal.aborted) throw new Error('cancelled')
      if (startUs !== undefined && Math.abs(result.positionUs-startUs)>SEEK_TOLERANCE_US) throw new Error('Native seek position mismatch')
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
      if (id) void TimedPlayback?.clear(id).catch(() => {})
    },
    subscribe(listener) {
      let disposed = false
      let wasPlaying = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const emit = (event: PlaybackEvent) => { if (!disposed) listener(event) }
      const inspect = () => {
        if (disposed) return
        try {
          const state = snapshot()
          if (kind === 'video' && video.status === 'error') { emit('error'); return }
          emit('time')
          if (state.playing && !wasPlaying) emit('playing')
          if (!state.playing && wasPlaying && !state.buffering && !ended) emit('pause')
          wasPlaying = state.playing
        } catch { emit('error') }
      }
      // 20ms 仅安排下一次读取；是否结束始终由共享核心比较真实源时间。
      const tick = () => { inspect(); if (!disposed) timer = setTimeout(tick, 20) }
      const nativeSubscription = TimedPlayback?.addListener('onRangeEnd', ({ id }) => { if (id === nativeId) emit('ended') })
      const subscriptions = kind === 'audio'
        ? [audio.addListener('playbackStatusUpdate', (status) => {
          if (nativeId && status.didJustFinish) { emit('time'); return }
          ended = status.didJustFinish
          if (status.playbackState === 'error') emit('error')
          else if (ended) emit('ended')
          else inspect()
        })]
        : [video.addListener('playToEnd', () => { if (nativeId) { emit('time'); return } ended = true; emit('ended') }),
          video.addListener('statusChange', ({ status }) => { if (status === 'error') emit('error'); else inspect() })]
      timer = setTimeout(tick, 0)
      return () => { disposed = true; clearTimeout(timer); nativeSubscription?.remove(); subscriptions.forEach((entry) => entry.remove()) }
    },
  }
}
