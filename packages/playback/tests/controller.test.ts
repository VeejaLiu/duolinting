import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaybackController, secondsToUs, type PlaybackAdapter, type PlaybackEvent, type PlaybackSnapshot } from '../src/index.ts'

class FakeAdapter implements PlaybackAdapter {
  state: PlaybackSnapshot = { sourceKey: 'course:media-v1', positionUs: 0, durationUs: secondsToUs(480), playing: false, buffering: false, ended: false }
  listeners = new Set<(event: PlaybackEvent) => void>()
  playCalls = 0
  seekCalls: number[] = []
  pendingSeek: { target: number; resolve: () => void }[] = []
  holdSeek = false
  holdPlay = false
  snapshot = () => ({ ...this.state })
  pause = () => { this.state.playing = false; this.emit('pause') }
  seek = async (target: number) => {
    this.seekCalls.push(target)
    if (this.holdSeek) await new Promise<void>((resolve) => this.pendingSeek.push({ target, resolve }))
    this.state.positionUs = target
  }
  play = async () => {
    this.playCalls++
    if (this.holdPlay) await new Promise<void>(() => {})
    this.state.playing = true
    this.emit('playing')
  }
  subscribe = (listener: (event: PlaybackEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  emit(event: PlaybackEvent) { for (const listener of [...this.listeners]) listener(event) }
  time(seconds: number) { this.state.positionUs = secondsToUs(seconds); this.emit('time') }
}
const plan = { sourceKey: 'course:media-v1', startUs: secondsToUs(10), endUs: secondsToUs(14) }

test('buffering and elapsed wall time never truncate the range; no 40ms early stop', async () => {
  const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
  const session = controller.play(plan)
  assert.equal((await session.started).reason, 'started')
  let ended = false; void session.finished.then(() => { ended = true })
  adapter.state.buffering = true
  adapter.time(11)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(ended, false)
  adapter.state.buffering = false
  for (const time of [13.96, 13.999999]) { adapter.time(time); await Promise.resolve(); assert.equal(ended, false) }
  adapter.time(14)
  assert.equal((await session.finished).reason, 'range-ended')
  assert.deepEqual(adapter.seekCalls, [secondsToUs(10)])
  assert.equal(adapter.listeners.size, 0)
})

test('rapid A/B/C requests settle cancelled waits; old seeks cannot start playback', async () => {
  const adapter = new FakeAdapter(); adapter.holdSeek = true
  const controller = createPlaybackController(adapter)
  const a = controller.play(plan), b = controller.play({ ...plan, startUs: secondsToUs(11) }), c = controller.play({ ...plan, startUs: secondsToUs(12) })
  assert.equal((await a.started).reason, 'cancelled')
  assert.equal((await a.finished).reason, 'cancelled')
  assert.equal((await b.finished).reason, 'cancelled')
  adapter.pendingSeek[0].resolve(); adapter.pendingSeek[1].resolve()
  await Promise.resolve(); await Promise.resolve()
  assert.equal(adapter.playCalls, 0)
  adapter.pendingSeek[2].resolve()
  assert.equal((await c.started).reason, 'started')
  a.cancel(); b.cancel()
  assert.equal(adapter.state.playing, true)
  adapter.time(14)
  assert.equal((await c.finished).reason, 'range-ended')
  assert.equal(adapter.playCalls, 1)
})

for (const event of ['pause', 'interrupted', 'error', 'seeking'] as const) {
  test(`${event} is not a normal range completion`, async () => {
    const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
    const session = controller.play(plan); await session.started
    adapter.emit(event)
    assert.equal((await session.finished).reason, { pause: 'paused', interrupted: 'interrupted', error: 'failed', seeking: 'cancelled' }[event])
    assert.equal(adapter.listeners.size, 0)
  })
}

test('source replacement cancels the active session', async () => {
  const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
  const session = controller.play(plan); await session.started
  adapter.state.sourceKey = 'course:media-v2'; adapter.time(14)
  assert.equal((await session.finished).reason, 'cancelled')
})

test('a hung seek times out and never begins playback', async () => {
  const adapter = new FakeAdapter(); adapter.holdSeek = true
  const session = createPlaybackController(adapter, { operationTimeoutMs: 20 }).play(plan)
  assert.equal((await session.started).reason, 'timeout')
  assert.equal((await session.finished).reason, 'timeout')
  adapter.pendingSeek[0].resolve(); await Promise.resolve()
  assert.equal(adapter.playCalls, 0)
})

test('a hung start is cancellable and settles both promises', async () => {
  const adapter = new FakeAdapter(); adapter.holdPlay = true
  const controller = createPlaybackController(adapter)
  const session = controller.play(plan)
  await Promise.resolve(); await Promise.resolve()
  controller.cancel()
  assert.equal((await session.started).reason, 'cancelled')
  assert.equal((await session.finished).reason, 'cancelled')
})

test('reaching the file end before the requested range end is a failure', async () => {
  const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
  const session = controller.play(plan); await session.started
  adapter.state.positionUs = secondsToUs(13); adapter.state.ended = true; adapter.emit('ended')
  assert.equal((await session.finished).reason, 'failed')
})

test('invalid ranges are not clamped into successful playback', async () => {
  for (const endUs of [secondsToUs(9), secondsToUs(481), NaN]) {
    const adapter = new FakeAdapter()
    const session = createPlaybackController(adapter).play({ ...plan, endUs })
    assert.equal((await session.finished).reason, 'failed'); assert.equal(adapter.playCalls, 0)
  }
})

for (const rate of [0.5, 1, 1.5, 2]) {
  test(`${rate}x uses unchanged source positions`, async () => {
    const adapter = new FakeAdapter(), session = createPlaybackController(adapter).play(plan)
    await session.started
    for (let sourceTime = 10; sourceTime < 14; sourceTime += rate * 0.1) adapter.time(sourceTime)
    adapter.time(14)
    assert.equal((await session.finished).reason, 'range-ended')
    assert.deepEqual(adapter.seekCalls, [secondsToUs(10)])
  })
}

test('repeat starts another iteration only after range-ended', async () => {
  const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
  const session = controller.repeat(plan, 3, 1)
  await session.started
  adapter.time(14)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(adapter.playCalls, 2)
  adapter.emit('pause')
  assert.equal((await session.finished).reason, 'paused')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(adapter.playCalls, 2)
})

test('cancelling a repeat gap settles the group and cannot restart playback', async () => {
  const adapter = new FakeAdapter(), controller = createPlaybackController(adapter)
  const session = controller.repeat(plan, 2, 20)
  await session.started
  adapter.time(14)
  await Promise.resolve()
  controller.cancel()
  assert.equal((await session.finished).reason, 'cancelled')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(adapter.playCalls, 1)
})
