import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaybackController } from '../src/index.ts'
import { createWebPlaybackAdapter } from '../src/web.ts'

const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
Object.assign(globalThis, { document: doc, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 5),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) })
class Media extends EventTarget {
  position = 10
  duration = 30
  readyState = 4
  paused = true
  ended = false
  seeking = false
  assignments = 0
  get currentTime() { return this.position }
  set currentTime(value: number) {
    this.assignments++; this.position = value; this.seeking = true
    queueMicrotask(() => { this.dispatchEvent(new Event('seeking')); this.seeking = false; this.dispatchEvent(new Event('seeked')) })
  }
  pause() { this.paused = true; queueMicrotask(() => this.dispatchEvent(new Event('pause'))) }
  async play() { this.paused = false; this.dispatchEvent(new Event('playing')) }
}
const make = () => {
  const media = new Media()
  return { media, controller: createPlaybackController(createWebPlaybackAdapter(() => media as unknown as HTMLMediaElement, () => 'v1')) }
}

test('web same-position start does not issue a redundant seek or self-cancel', async () => {
  const { media, controller } = make()
  const session = controller.play({ sourceKey: 'v1', startUs: 10_000_000, endUs: 11_000_000 })
  assert.equal((await session.started).reason, 'started')
  assert.equal(media.assignments, 0)
  media.position = 11; media.dispatchEvent(new Event('timeupdate'))
  assert.equal((await session.finished).reason, 'range-ended')
})

test('web programmatic seek completes before play; queued pause cannot interrupt a new play', async () => {
  const { media, controller } = make()
  const session = controller.play({ sourceKey: 'v1', startUs: 12_000_000, endUs: 13_000_000 })
  assert.equal((await session.started).reason, 'started')
  assert.equal(media.currentTime, 12)
  media.dispatchEvent(new Event('pause')) // queued old event; current state is playing
  media.position = 13; media.dispatchEvent(new Event('timeupdate'))
  assert.equal((await session.finished).reason, 'range-ended')
})

test('web user seek cancels the old range', async () => {
  const { media, controller } = make()
  const session = controller.play({ sourceKey: 'v1', startUs: 10_000_000, endUs: 11_000_000 })
  await session.started
  media.currentTime = 20
  assert.equal((await session.finished).reason, 'cancelled')
})

test('web backgrounding interrupts instead of completing the range', async () => {
  const { controller } = make()
  const session = controller.play({ sourceKey: 'v1', startUs: 10_000_000, endUs: 11_000_000 })
  await session.started
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal((await session.finished).reason, 'interrupted')
  doc.visibilityState = 'visible'
})
