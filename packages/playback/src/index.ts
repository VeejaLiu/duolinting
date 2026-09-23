/** Shared source-time contract. Microseconds describe source position, not device output precision. */
export const PLAYBACK_CONTRACT_VERSION = 1
export const secondsToUs = (seconds: number) => Math.round(seconds * 1_000_000)
export const usToSeconds = (microseconds: number) => microseconds / 1_000_000
export const SEEK_TOLERANCE_US = 50_000

export type PlaybackEvent = 'time' | 'playing' | 'pause' | 'ended' | 'error' | 'seeking' | 'interrupted'
export type PlaybackSnapshot = {
  sourceKey: string
  positionUs: number
  durationUs: number
  playing: boolean
  buffering: boolean
  ended: boolean
}
export type PlaybackAdapter = {
  snapshot(): PlaybackSnapshot
  prepare?(startUs: number | undefined, endUs: number | undefined, signal: AbortSignal): Promise<void>
  seek(positionUs: number, signal: AbortSignal): Promise<void>
  play(signal: AbortSignal): Promise<void>
  pause(): void
  subscribe(listener: (event: PlaybackEvent) => void): () => void
}
export type FinishReason = 'range-ended' | 'media-ended' | 'cancelled' | 'paused' | 'interrupted' | 'failed' | 'timeout'
export type PlaybackResult = { reason: FinishReason; positionUs: number }
export type StartedResult = { reason: 'started' | 'cancelled' | 'failed' | 'timeout'; positionUs: number }
export type PlaybackSession = {
  id: number
  started: Promise<StartedResult>
  finished: Promise<PlaybackResult>
  cancel(): void
}
export type PlaybackPlan = {
  sourceKey: string
  startUs?: number
  /** The interval is [startUs, endUs). No implicit padding or early-stop allowance. */
  endUs?: number
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

/** Adapter operations are bounded; a hung native promise cannot leave a session pending forever. */
async function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => finish(() => reject(new Error('cancelled')))
    const finish = (done: () => void) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      done()
    }
    const timer = setTimeout(() => finish(() => reject(new Error('timeout'))), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    operation.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)))
    if (signal.aborted) abort()
  })
}

export function createPlaybackController(adapter: PlaybackAdapter, options: { operationTimeoutMs?: number } = {}) {
  let nextId = 0
  let stopActive: ((reason: FinishReason, pause: boolean) => void) | null = null
  let stopRepeating: ((reason: FinishReason) => void) | null = null
  const cancel = (reason: FinishReason = 'cancelled') => {
    stopRepeating?.(reason)
    if (stopActive) stopActive(reason, true)
    else { try { adapter.pause() } catch { /* A released platform object is already stopped. */ } }
  }
  const open = (plan: PlaybackPlan, seekOnly = false, repeating = false): PlaybackSession => {
    if (repeating) stopActive?.('cancelled', true)
    else cancel()
    const started = deferred<StartedResult>()
    const finished = deferred<PlaybackResult>()
    const abort = new AbortController()
    const id = ++nextId
    let done = false
    let began = false
    let unsubscribe = () => {}
    const read = () => adapter.snapshot()
    const position = () => { try { return read().positionUs } catch { return 0 } }
    const stop = (reason: FinishReason, pause: boolean) => {
      if (done) return
      done = true
      unsubscribe()
      abort.abort()
      if (stopActive === stop) stopActive = null
      if (pause) { try { adapter.pause() } catch { /* Native object may already be released. */ } }
      const positionUs = position()
      started.resolve({ reason: reason === 'timeout' || reason === 'failed' ? reason : 'cancelled', positionUs })
      finished.resolve({ reason, positionUs })
    }
    stopActive = stop
    const observe = (event: PlaybackEvent) => {
      if (done) return
      try {
        const snapshot = read()
        if (snapshot.sourceKey !== plan.sourceKey) return stop('cancelled', true)
        if (event === 'error') return stop('failed', true)
        if (event === 'interrupted') return stop('interrupted', true)
        // During seek/start the adapter owns transitional pause/seeking events.
        if (!began) return
        if (event === 'seeking') return stop('cancelled', true)
        if (event === 'pause') return stop('paused', false)
        if (plan.endUs !== undefined && snapshot.positionUs >= plan.endUs) return stop('range-ended', true)
        if (event === 'ended') return stop(plan.endUs === undefined ? 'media-ended' : 'failed', false)
      } catch { stop('failed', true) }
    }
    const run = async () => {
      try {
        const snapshot = read()
        if (!plan.sourceKey || snapshot.sourceKey !== plan.sourceKey) return stop('cancelled', true)
        const startUs = plan.startUs ?? snapshot.positionUs
        if (!Number.isSafeInteger(startUs) || startUs < 0 ||
          (plan.endUs !== undefined && (!Number.isSafeInteger(plan.endUs) || plan.endUs <= startUs))) {
          return stop('failed', true)
        }
        // Do not silently shorten a published range to fit a different media resource.
        if (snapshot.durationUs > 0 && (startUs > snapshot.durationUs ||
          (plan.endUs !== undefined && plan.endUs > snapshot.durationUs))) return stop('failed', true)
        unsubscribe = adapter.subscribe(observe)
        const timeout = options.operationTimeoutMs ?? 5000
        if (adapter.prepare) await bounded(adapter.prepare(plan.startUs, plan.endUs, abort.signal), abort.signal, timeout)
        else if (plan.startUs !== undefined) await bounded(adapter.seek(startUs, abort.signal), abort.signal, timeout)
        if (done) return
        if (read().sourceKey !== plan.sourceKey) return stop('cancelled', true)
        if (seekOnly) {
          started.resolve({ reason: 'started', positionUs: position() })
          return stop('paused', false)
        }
        await bounded(adapter.play(abort.signal), abort.signal, timeout)
        if (done) return
        if (read().sourceKey !== plan.sourceKey) return stop('cancelled', true)
        began = true
        started.resolve({ reason: 'started', positionUs: position() })
        observe('time')
      } catch (error) {
        if (!done) stop(error instanceof Error && error.message === 'timeout' ? 'timeout' : 'failed', true)
      }
    }
    void run()
    return { id, started: started.promise, finished: finished.promise, cancel: () => stop('cancelled', true) }
  }
  const repeat = (plan: PlaybackPlan, count = 1, gapMs = 0): PlaybackSession => {
    cancel()
    const id = ++nextId, started = deferred<StartedResult>(), finished = deferred<PlaybackResult>()
    let done = false, active: PlaybackSession | null = null, timer: ReturnType<typeof setTimeout> | undefined
    const position = () => { try { return adapter.snapshot().positionUs } catch { return 0 } }
    const stop = (reason: FinishReason) => {
      if (done) return
      done = true; clearTimeout(timer)
      active?.cancel()
      if (stopRepeating === stop) stopRepeating = null
      started.resolve({ reason: reason === 'failed' || reason === 'timeout' ? reason : 'cancelled', positionUs: position() })
      finished.resolve({ reason, positionUs: position() })
    }
    stopRepeating = stop
    const run = async (iteration: number) => {
      if (done) return
      active = open(plan, false, true)
      const began = await active.started
      if (done) return
      if (iteration === 0) started.resolve(began)
      const result = await active.finished
      if (done) return
      if (result.reason !== 'range-ended' || iteration + 1 >= count) { stop(result.reason); return }
      timer = setTimeout(() => void run(iteration + 1), gapMs)
    }
    if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isFinite(gapMs) || gapMs < 0 || gapMs > 60000 || plan.endUs === undefined) stop('failed')
    else void run(0)
    return { id, started: started.promise, finished: finished.promise, cancel: () => stop('cancelled') }
  }
  return { play: (plan: PlaybackPlan) => open(plan), repeat, seek: (sourceKey: string, positionUs: number) => open({ sourceKey, startUs: positionUs }, true), cancel }
}

/** Polling is for platform state confirmation only; elapsed time never completes a media range. */
export async function waitForState(check: () => boolean, signal: AbortSignal, intervalMs = 20): Promise<void> {
  while (!signal.aborted) {
    if (check()) return
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, intervalMs)
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    })
  }
  throw new Error('cancelled')
}
