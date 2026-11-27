import assert from 'node:assert/strict'
import test from 'node:test'
import { bindWaveformWheelScroll } from '../src/lib/waveformWheel.ts'

const wheel = (values: Partial<WheelEvent> = {}, cancelable = true) => Object.assign(
  new Event('wheel', { cancelable }),
  { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...values },
)

const setup = (scrollLeft = 100, scrollWidth = 1600, clientWidth = 400) => {
  const host = new EventTarget()
  const viewport = { scrollLeft, scrollWidth, clientWidth }
  const cleanup = bindWaveformWheelScroll(host, viewport)
  return { host, viewport, cleanup }
}

test('a regular mouse wheel pans the waveform in both directions and consumes the page scroll', () => {
  const { host, viewport } = setup()
  const forward = wheel({ deltaY: 120 })
  host.dispatchEvent(forward)
  assert.equal(viewport.scrollLeft, 220)
  assert.equal(forward.defaultPrevented, true)
  const backward = wheel({ deltaY: -60 })
  host.dispatchEvent(backward)
  assert.equal(viewport.scrollLeft, 160)
  assert.equal(backward.defaultPrevented, true)
})

test('horizontal and diagonal trackpad gestures pan once using their dominant axis', () => {
  const { host, viewport } = setup()
  const horizontal = wheel({ deltaX: 40 })
  host.dispatchEvent(horizontal)
  assert.equal(viewport.scrollLeft, 140)
  assert.equal(horizontal.defaultPrevented, true)
  host.dispatchEvent(wheel({ deltaX: 60, deltaY: 20 }))
  assert.equal(viewport.scrollLeft, 200)
  host.dispatchEvent(wheel({ deltaX: 10, deltaY: -40 }))
  assert.equal(viewport.scrollLeft, 160)
})

test('line and page wheel units become pixels while fractional pixel gestures retain precision', () => {
  const { host, viewport } = setup()
  host.dispatchEvent(wheel({ deltaY: 3, deltaMode: 1 }))
  assert.equal(viewport.scrollLeft, 148)
  host.dispatchEvent(wheel({ deltaY: 1, deltaMode: 2 }))
  assert.equal(viewport.scrollLeft, 548)
  host.dispatchEvent(wheel({ deltaX: 0.25 }))
  assert.equal(viewport.scrollLeft, 548.25)
})

test('a waveform with no overflow leaves normal page scrolling available', () => {
  const { host, viewport } = setup(0, 400, 400)
  const event = wheel({ deltaY: 100 })
  host.dispatchEvent(event)
  assert.equal(viewport.scrollLeft, 0)
  assert.equal(event.defaultPrevented, false)
})

test('panning clamps at both ends and releases subsequent outward wheel events to the page', () => {
  const { host, viewport } = setup(1190)
  const forward = wheel({ deltaY: 100 })
  host.dispatchEvent(forward)
  assert.equal(viewport.scrollLeft, 1200)
  assert.equal(forward.defaultPrevented, true)
  const atEnd = wheel({ deltaY: 100 })
  host.dispatchEvent(atEnd)
  assert.equal(atEnd.defaultPrevented, false)
  const backward = wheel({ deltaY: -2000 })
  host.dispatchEvent(backward)
  assert.equal(viewport.scrollLeft, 0)
  assert.equal(backward.defaultPrevented, true)
  const atStart = wheel({ deltaY: -100 })
  host.dispatchEvent(atStart)
  assert.equal(atStart.defaultPrevented, false)
})

test('browser zoom and pinch gestures remain available, including Command-wheel', () => {
  const { host, viewport } = setup()
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    const event = wheel({ deltaY: 80, ...modifier })
    host.dispatchEvent(event)
    assert.equal(viewport.scrollLeft, 100)
    assert.equal(event.defaultPrevented, false)
  }
})

test('already handled or noncancelable events do not cause duplicate scrolling', () => {
  const { host, viewport } = setup()
  const handled = wheel({ deltaY: 80 })
  handled.preventDefault()
  host.dispatchEvent(handled)
  host.dispatchEvent(wheel({ deltaX: 80 }, false))
  assert.equal(viewport.scrollLeft, 100)
})

test('zoom and viewport resizing use the current scroll geometry', () => {
  const { host, viewport } = setup(400, 800, 400)
  const atEnd = wheel({ deltaY: 40 })
  host.dispatchEvent(atEnd)
  assert.equal(atEnd.defaultPrevented, false)
  viewport.scrollWidth = 2400
  host.dispatchEvent(wheel({ deltaY: 40 }))
  assert.equal(viewport.scrollLeft, 440)
  viewport.clientWidth = 800
  host.dispatchEvent(wheel({ deltaY: 1, deltaMode: 2 }))
  assert.equal(viewport.scrollLeft, 1240)
})

test('unmounting removes the listener so reopening cannot accumulate panning handlers', () => {
  const { host, viewport, cleanup } = setup()
  cleanup()
  const closed = wheel({ deltaY: 40 })
  host.dispatchEvent(closed)
  assert.equal(viewport.scrollLeft, 100)
  assert.equal(closed.defaultPrevented, false)
  bindWaveformWheelScroll(host, viewport)
  host.dispatchEvent(wheel({ deltaY: 40, shiftKey: true }))
  assert.equal(viewport.scrollLeft, 140)
})
