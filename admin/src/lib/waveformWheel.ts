type ScrollViewport = Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>

/** Translate wheel gestures into timeline panning without trapping page scrolling at either edge. */
export function bindWaveformWheelScroll(host: EventTarget, viewport: ScrollViewport | null): () => void {
  if (!viewport) return () => {}

  const onWheel = (event: Event) => {
    const wheel = event as WheelEvent
    // Ctrl-wheel also represents trackpad pinch. Leave browser zoom and already handled gestures alone.
    if (wheel.ctrlKey || wheel.metaKey || wheel.defaultPrevented || !wheel.cancelable) return
    if (viewport.clientWidth <= 0) return

    // Mouse wheels normally report deltaY; touchpads can report both axes. Use one dominant axis
    // so diagonal gestures are not added twice. deltaMode is 0=pixels, 1=lines, 2=pages;
    // a line is 16 CSS pixels, while a horizontal page is the current visible timeline width.
    const delta = Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) ? wheel.deltaX : wheel.deltaY
    const unit = wheel.deltaMode === 0 ? 1 : wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? viewport.clientWidth : 0
    if (!Number.isFinite(delta) || delta === 0 || unit === 0) return
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const current = Math.min(maxScroll, Math.max(0, viewport.scrollLeft))
    const next = Math.min(maxScroll, Math.max(0, current + delta * unit))
    if (next === current) return

    wheel.preventDefault()
    viewport.scrollLeft = next
  }

  // A native, non-passive listener can cancel page scrolling; React's delegated wheel listener cannot.
  host.addEventListener('wheel', onWheel, { passive: false })
  return () => host.removeEventListener('wheel', onWheel)
}
