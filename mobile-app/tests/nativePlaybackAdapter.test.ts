import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioPlayer } from 'expo-audio'
import type { VideoPlayer } from 'expo-video'
import { createPlaybackController, secondsToUs } from '@duolinting/playback'
import type { NativePlaybackSnapshot, TimedPlaybackModule } from '../modules/timed-playback'
import { createNativePlaybackAdapter } from '../src/lib/nativePlaybackAdapter'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function fixture(initialStatus = 'readyToPlay') {
  const videoListeners = new Map<string, Set<(value: unknown) => void>>()
  const rangeListeners = new Set<(value: { id: string }) => void>()
  const video = {
    status: initialStatus,
    currentTime: 0,
    duration: 120,
    playing: false,
    playCalls: 0,
    play() { this.playing = true; this.playCalls++ },
    pause() { this.playing = false },
    addListener(event: string, listener: (value: unknown) => void) {
      const listeners = videoListeners.get(event) ?? new Set()
      listeners.add(listener); videoListeners.set(event, listeners)
      return { remove: () => listeners.delete(listener) }
    },
  }
  const configured: { id: string; start: number; end: number | null }[] = []
  const cleared: string[] = []
  let clearWait: Promise<void> | null = null
  let recoverWait: Promise<void> | null = null
  let recoverFailure = false
  let recoverCalls = 0
  const native: TimedPlaybackModule = {
    async configure(_player, id, start, end) {
      configured.push({ id, start, end }); video.currentTime = start
      return this.snapshot(id)!
    },
    snapshot(): NativePlaybackSnapshot {
      return { positionUs: secondsToUs(video.currentTime), durationUs: secondsToUs(video.duration),
        playing: video.playing, buffering: video.status === 'loading', ended: false }
    },
    async clear(id) { cleared.push(id); if (clearWait) await clearWait; video.pause() },
    addListener(_event, listener) { rangeListeners.add(listener); return { remove: () => rangeListeners.delete(listener) } },
  }
  const recover = async () => {
    recoverCalls++
    if (recoverWait) await recoverWait
    if (recoverFailure) throw new Error('Network unavailable')
    video.status = 'readyToPlay'
  }
  const adapter = createNativePlaybackAdapter({} as AudioPlayer, video as unknown as VideoPlayer,
    'video', () => 'course:media', native, recover)
  const controller = createPlaybackController(adapter, { operationTimeoutMs: 200 })
  const plan = { sourceKey: 'course:media', startUs: secondsToUs(10), endUs: secondsToUs(14) }
  const status = (value: string) => {
    video.status = value
    for (const listener of videoListeners.get('statusChange') ?? []) listener({ status: value })
  }
  return { adapter, controller, plan, video, configured, cleared, status,
    recoverCalls: () => recoverCalls,
    waitOnClear: (promise: Promise<void> | null) => { clearWait = promise },
    waitOnRecovery: (promise: Promise<void>) => { recoverWait = promise },
    failRecovery: () => { recoverFailure = true },
    listenerCount: () => [...videoListeners.values()].reduce((count, entries) => count + entries.size, rangeListeners.size),
  }
}

test('replaying a loaded sentence keeps the player/source and exact boundaries', async () => {
  const f = fixture()
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = f.controller.repeat(f.plan)
    assert.equal((await session.started).reason, 'started')
    f.video.currentTime = 14
    // Native range boundary and controller position polling use source time.
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal((await session.finished).reason, 'range-ended')
  }
  assert.deepEqual(f.configured.map(({ start, end }) => ({ start, end })), [{ start: 10, end: 14 }, { start: 10, end: 14 }])
  assert.equal(f.video.playCalls, 2)
  assert.equal(f.recoverCalls(), 0)
  assert.equal(f.listenerCount(), 0)
})

test('cancel during initial buffering lets only the newly selected sentence start', async () => {
  const f = fixture('loading')
  const previous = f.controller.repeat(f.plan)
  const current = f.controller.repeat({ ...f.plan, startUs: secondsToUs(20), endUs: secondsToUs(24) })
  f.status('readyToPlay')
  assert.equal((await previous.finished).reason, 'cancelled')
  assert.equal((await current.started).reason, 'started')
  assert.deepEqual(f.configured.map(({ start }) => start), [20])
  current.cancel()
  assert.equal(f.listenerCount(), 0)
})

test('retry recovers a terminal video error; a subsequent playback error still fails', async () => {
  const f = fixture('error')
  const session = f.controller.repeat(f.plan)
  assert.equal((await session.started).reason, 'started')
  assert.equal(f.recoverCalls(), 1)
  f.status('error')
  assert.equal((await session.finished).reason, 'failed')
  assert.equal(f.listenerCount(), 0)
})

test('rapid sentence changes share source recovery and discard cancelled requests', async () => {
  const f = fixture('error'), pending = deferred()
  f.waitOnRecovery(pending.promise)
  const first = f.controller.repeat(f.plan)
  const second = f.controller.repeat({ ...f.plan, startUs: secondsToUs(20), endUs: secondsToUs(24) })
  const latest = f.controller.repeat({ ...f.plan, startUs: secondsToUs(30), endUs: secondsToUs(34) })
  // The old error must not terminate the latest request while recovery is pending.
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(f.recoverCalls(), 1)
  pending.resolve()
  assert.equal((await first.finished).reason, 'cancelled')
  assert.equal((await second.finished).reason, 'cancelled')
  assert.equal((await latest.started).reason, 'started')
  assert.deepEqual(f.configured.map(({ start }) => start), [30])
  assert.equal(f.video.playCalls, 1)
  latest.cancel()
})

test('cancelling while native clear is pending cannot configure a stale range', async () => {
  const f = fixture(), initial = new AbortController(), cancelled = new AbortController(), pending = deferred()
  await f.adapter.prepare!(secondsToUs(10), secondsToUs(14), initial.signal)
  f.waitOnClear(pending.promise)
  const preparing = f.adapter.prepare!(secondsToUs(20), secondsToUs(24), cancelled.signal)
  const rejected = assert.rejects(preparing, /cancelled/)
  await Promise.resolve()
  cancelled.abort(); pending.resolve()
  await rejected
  assert.deepEqual(f.configured.map(({ start }) => start), [10])
  f.waitOnClear(null); f.adapter.pause()
})

test('source recovery failure settles promptly and remains retryable', async () => {
  const f = fixture('error')
  f.failRecovery()
  const session = f.controller.repeat(f.plan)
  assert.equal((await session.started).reason, 'failed')
  assert.equal((await session.finished).reason, 'failed')
  assert.equal(f.configured.length, 0)
  assert.equal(f.listenerCount(), 0)
})

test('buffering after playback starts remains cancellable and allows a new sentence', async () => {
  const f = fixture()
  const stalled = f.controller.repeat(f.plan)
  await stalled.started
  f.video.playing = false; f.status('loading')
  f.controller.cancel('paused')
  assert.equal((await stalled.finished).reason, 'paused')
  f.status('readyToPlay')
  const next = f.controller.repeat({ ...f.plan, startUs: secondsToUs(20), endUs: secondsToUs(24) })
  assert.equal((await next.started).reason, 'started')
  assert.equal(f.recoverCalls(), 0)
  next.cancel()
})

test('a missing native module fails promptly instead of leaving loading pending', async () => {
  const f = fixture()
  const adapter = createNativePlaybackAdapter({} as AudioPlayer, f.video as unknown as VideoPlayer,
    'video', () => 'course:media', null)
  const session = createPlaybackController(adapter).repeat(f.plan)
  assert.equal((await session.started).reason, 'failed')
  assert.equal((await session.finished).reason, 'failed')
  assert.equal(f.video.playCalls, 0)
  assert.equal(f.listenerCount(), 0)
})

test('audio playback still supports exact ranges and recovery after a player error', async () => {
  const listeners = new Set<(value: unknown) => void>()
  const audio = {
    isLoaded: true, isBuffering: false, playing: false, currentTime: 0, duration: 120,
    play() { this.playing = true }, pause() { this.playing = false },
    addListener(_event: string, listener: (value: unknown) => void) {
      listeners.add(listener); return { remove: () => listeners.delete(listener) }
    },
  }
  const starts: number[] = []
  let recoverCalls = 0
  const native: TimedPlaybackModule = {
    async configure(_player, id, start, end) {
      assert.equal(end, 14); starts.push(start); audio.currentTime = start
      return this.snapshot(id)!
    },
    snapshot() { return { positionUs: secondsToUs(audio.currentTime), durationUs: secondsToUs(audio.duration),
      playing: audio.playing, buffering: audio.isBuffering, ended: false } },
    async clear() { audio.pause() },
    addListener() { return { remove() {} } },
  }
  const adapter = createNativePlaybackAdapter(audio as unknown as AudioPlayer, {} as VideoPlayer,
    'audio', () => 'course:audio', native, async () => { recoverCalls++; audio.isLoaded = true })
  const controller = createPlaybackController(adapter)
  const plan = { sourceKey: 'course:audio', startUs: secondsToUs(10), endUs: secondsToUs(14) }
  const first = controller.repeat(plan)
  assert.equal((await first.started).reason, 'started')
  audio.isLoaded = false
  for (const listener of listeners) listener({ playbackState: 'error', didJustFinish: false })
  assert.equal((await first.finished).reason, 'failed')
  const retried = controller.repeat(plan)
  assert.equal((await retried.started).reason, 'started')
  assert.deepEqual(starts, [10, 10])
  assert.equal(recoverCalls, 1)
  retried.cancel()
  assert.equal(listeners.size, 0)
})
