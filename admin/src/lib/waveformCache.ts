/** v1 stores 10 ms peak buckets at an 8 kHz decode rate; bump the key if this format changes. */
export type CachedWaveform = { duration: number; peaks: number[] }
const PREFIX = 'waveform-v1:'
const MAX_PEAKS = 2_000_000
const memory = new Map<string, CachedWaveform>()
const pending = new Map<string, Promise<CachedWaveform>>()
const sources = new Map<string, Promise<CachedWaveform>>()
// File/Blob contents are immutable. Reuse a selected file's result even when its
// object URL changes, without rereading/hash-checking it on every editor mount.
const files = new WeakMap<Blob, Promise<CachedWaveform>>()

export function validWaveform(value: unknown): value is CachedWaveform {
  const wave = value as CachedWaveform | null
  return Boolean(wave && Number.isFinite(wave.duration) && wave.duration > 0 &&
    Array.isArray(wave.peaks) && wave.peaks.length > 0 && wave.peaks.length <= MAX_PEAKS &&
    Math.abs(wave.peaks.length - Math.ceil(wave.duration * 100)) <= 1 &&
    wave.peaks.every((peak) => Number.isFinite(peak) && Math.abs(peak) <= 1))
}

// Only peak summaries are persisted, never media bytes or signed URLs. Storage denial,
// blocked upgrades and quota errors must not prevent editing. Bound all IDB waits.
async function storage(key: string, value?: CachedWaveform): Promise<unknown> {
  return new Promise((resolve) => {
    let db: IDBDatabase | undefined
    let finished = false
    const finish = (result?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      db?.close()
      resolve(result)
    }
    const timer = setTimeout(() => finish(), 1500)
    try {
      const request = indexedDB.open('duolinting-waveforms', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('peaks', { keyPath: 'key' })
      request.onerror = () => finish()
      request.onblocked = () => finish()
      request.onsuccess = () => {
        db = request.result
        if (finished) { db.close(); return }
        try {
          const tx = db.transaction('peaks', value ? 'readwrite' : 'readonly')
          const store = tx.objectStore('peaks')
          let result: unknown
          tx.oncomplete = () => finish(result)
          tx.onerror = tx.onabort = () => finish()
          if (value) {
            store.put({ key, value, updatedAt: Date.now() })
            // Limit persistent summaries to 64 MiB (including URL-validator aliases).
            const all = store.getAll()
            all.onsuccess = () => {
              const rows = all.result.sort((a, b) => b.updatedAt - a.updatedAt)
              let bytes = 0
              for (const row of rows) {
                bytes += (row.value?.peaks?.length ?? MAX_PEAKS) * 8 + 256
                if (bytes > 64 * 1024 * 1024) store.delete(row.key)
              }
            }
          } else {
            const read = store.get(key)
            read.onsuccess = () => { result = read.result?.value }
          }
        } catch { finish() }
      }
    } catch { finish() }
  })
}

async function read(key: string) {
  const cached = memory.get(key) ?? await storage(key)
  if (!validWaveform(cached)) return undefined
  remember(key, cached)
  return cached
}
function remember(key: string, value: CachedWaveform) {
  memory.delete(key)
  memory.set(key, value)
  let bytes = 0
  for (const wave of memory.values()) bytes += wave.peaks.length * 8
  while (bytes > 16 * 1024 * 1024 && memory.size > 1) {
    const oldest = memory.keys().next().value!
    bytes -= memory.get(oldest)!.peaks.length * 8
    memory.delete(oldest)
  }
}
async function save(key: string, wave: CachedWaveform) {
  remember(key, wave)
  await storage(key, wave)
}
async function digest(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function decode(bytes: ArrayBuffer): Promise<CachedWaveform> {
  const context = new AudioContext({ sampleRate: 8000 })
  try {
    const audio = await context.decodeAudioData(bytes)
    const samples = audio.getChannelData(0)
    const count = Math.ceil(audio.duration * 100)
    if (count > MAX_PEAKS) throw new Error('Waveform exceeds cache limit')
    const peaks = new Array<number>(count)
    // A bucket retains its largest absolute signed sample, matching WaveSurfer's
    // peak export. Buckets cover the decoded timeline uniformly, including the tail.
    for (let i = 0; i < count; i++) {
      let peak = 0
      const end = Math.floor((i + 1) * samples.length / count)
      for (let j = Math.floor(i * samples.length / count); j < end; j++) {
        if (Math.abs(samples[j]) > Math.abs(peak)) peak = samples[j]
      }
      peaks[i] = Math.max(-1, Math.min(1, peak))
    }
    const result = { duration: audio.duration, peaks }
    if (!validWaveform(result)) throw new Error('Invalid decoded waveform')
    return result
  } finally { await context.close().catch(() => undefined) }
}

async function validatorKey(url: string, etag: string) {
  const address = new URL(url, typeof location === 'undefined' ? 'http://localhost' : location.href)
  // Backend signatures expire independently of the media. HEAD has already checked
  // access; retaining the object path/key while removing only its auth fields lets
  // a freshly signed URL reuse the same validated summary without another download.
  if (/\/api\/v1\/media\/objects(?:\/|$)/.test(address.pathname)) {
    address.searchParams.delete('expires')
    address.searchParams.delete('mediaToken')
  }
  return PREFIX + await digest(new TextEncoder().encode(`${address.href}\n${etag}`).buffer)
}

async function prepare(url: string, file?: Blob): Promise<CachedWaveform> {
  let alias: string | undefined
  if (!file && !url.startsWith('blob:')) {
    try {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(10000) })
      const etag = head.headers.get('etag')
      // Strong validators detect same-URL replacement; timestamps/size alone do not.
      if (head.ok && etag && !etag.startsWith('W/')) {
        alias = await validatorKey(url, etag)
        const hit = await read(alias)
        if (hit) return hit
      }
    } catch { /* No HEAD/CORS validator: hash the actual bytes instead. */ }
  }
  const response = file ? undefined : await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(120000) })
  if (response && !response.ok) throw new Error(`Media fetch failed: ${response.status}`)
  const bytes = file ? await file.arrayBuffer() : await response!.arrayBuffer()
  const key = PREFIX + 'sha256:' + await digest(bytes)
  // Deduplicate decodes even for different blob URLs/files containing identical bytes.
  let work = pending.get(key)
  if (!work) {
    const generate = async () => {
      const hit = await read(key)
      if (hit) return hit
      const wave = await decode(bytes)
      await save(key, wave)
      return wave
    }
    // Across tabs, the second editor rechecks IndexedDB after the first has saved.
    // Unsupported Web Locks still use the page-local single-flight promise above.
    work = typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(key, generate)
      : generate()
    pending.set(key, work)
    void work.finally(() => pending.delete(key)).catch(() => undefined)
  }
  const wave = await work
  // HEAD can race with replacement. Persist only under the GET's own validator.
  if (alias && response?.headers.get('etag')) {
    const actualAlias = await validatorKey(url, response.headers.get('etag')!)
    await save(actualAlias, wave)
  }
  return wave
}

export function getCachedWaveform(url: string, file?: Blob): Promise<CachedWaveform> {
  if (file) {
    const existing = files.get(file)
    if (existing) return existing
    const work = prepare(url, file)
    files.set(file, work)
    void work.catch(() => files.delete(file))
    return work
  }
  let work = sources.get(url)
  if (!work) {
    work = prepare(url, file)
    sources.set(url, work)
    void work.finally(() => sources.delete(url)).catch(() => undefined)
  }
  return work
}
