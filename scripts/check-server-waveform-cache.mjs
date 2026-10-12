import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the actual cache services with isolated storage/network doubles. Never
// read .env, connect to a database, or modify course/media records in this check.
const require = createRequire(import.meta.url)
async function load(path, dependencies, extra = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, __filename: path,
    require: (name) => dependencies[name] ?? require(name),
    setTimeout: (fn) => { fn(); return 0 }, ...extra,
  }, { filename: path })
  return module.exports
}
const format = await load('backend/src/general/media/waveform-format.ts', {})
const rows = new Map()
let object = 'media/one.mp4', etag = 'one', databaseDown = false
let writes = 0, locks = 0
let serial = Promise.resolve()
const key = (objectName, version) => `${objectName}:${version}`
const sequelize = {
  transaction(fn) {
    const work = serial.catch(() => {}).then(() => fn({ testTransaction: true }))
    serial = work
    return work
  },
  async query(sql, { replacements: r, transaction }) {
    if (sql.startsWith('select audio_url')) {
      assert.ok(transaction)
      assert.match(sql, /for update/)
      locks++
      return [{ audio_url: object }]
    }
    if (databaseDown) throw new Error('simulated unavailable database')
    if (sql.startsWith('select waveform_json')) {
      const row = rows.get(key(r.objectName, r.etag))
      return row ? [{ waveform_json: row }] : []
    }
    assert.match(sql, /on duplicate key update/)
    assert.ok(transaction)
    rows.set(key(r.objectName, r.etag), r.waveform)
    writes++
    return []
  },
}
const cache = await load('backend/src/general/media/media-waveform.ts', {
  sequelize: { QueryTypes: { SELECT: 'SELECT' } },
  '../../models/db-config-mysql': { sequelize },
  './media-service': {
    getManagedMediaObjectName: (url) => url.startsWith('media/') ? url : '',
    statMediaObject: async () => ({ etag, size: 1024 }),
  },
  '../../lib/logger': { Logger: class { warn() {} } },
  './waveform-format': format,
})
const wave = { duration: 1, peaks: new Array(100).fill(0.25) }
let state = await cache.mediaWaveformState(object)
assert.equal(state.waveform, undefined)
assert.equal(state.waveformSourceRevision.length, 64)
await cache.syncExerciseWaveform(1, object, { sourceRevision: state.waveformSourceRevision, waveform: wave })
const shared = await cache.mediaWaveformState(object)
assert.equal(shared.waveform.peaks.length, 100)
assert.equal(shared.waveform.mediaRevision, state.waveformSourceRevision)
assert.equal(shared.waveform.durationUs, 1_000_000)
console.log('PASS: browser fill becomes a shared current-media waveform with 10 ms buckets')
const previousRevision = state.waveformSourceRevision
etag = 'two'
state = await cache.mediaWaveformState(object)
assert.equal(state.waveform, undefined)
assert.notEqual(state.waveformSourceRevision, previousRevision)
const beforeStale = writes
await assert.rejects(cache.syncExerciseWaveform(1, object, { sourceRevision: previousRevision, waveform: wave }), cache.WaveformCacheConflict)
assert.equal(writes, beforeStale)
await cache.syncExerciseWaveform(1, object, { sourceRevision: state.waveformSourceRevision, waveform: wave })
assert.ok((await cache.mediaWaveformState(object)).waveform)
object = 'media/replacement.mp4'
await assert.rejects(cache.syncExerciseWaveform(1, 'media/one.mp4', { sourceRevision: previousRevision, waveform: wave }), cache.WaveformCacheConflict)
assert.equal((await cache.mediaWaveformState(object)).waveform, undefined)
console.log('PASS: same-object byte changes and course-media replacement reject old fills')
state = await cache.mediaWaveformState(object)
rows.set(key(object, etag), '{broken json')
assert.equal((await cache.mediaWaveformState(object)).waveform, undefined)
await cache.syncExerciseWaveform(1, object, { sourceRevision: state.waveformSourceRevision, waveform: wave })
assert.ok((await cache.mediaWaveformState(object)).waveform)
for (const bad of [{ duration: NaN, peaks: [0] }, {duration: 1, peaks: []}, {duration: 1, peaks: new Array(100).fill(Infinity)}, {duration: 1, peaks: [0.2]}]) {
  assert.equal(format.validWaveformPeaks(bad), false)
  await assert.rejects(cache.syncExerciseWaveform(1, object, {sourceRevision: state.waveformSourceRevision, waveform: bad}), /Invalid waveform summary/)
}
console.log('PASS: corrupt summaries are repaired; non-finite/misaligned input is rejected')
databaseDown = true
const failedRead = await cache.mediaWaveformState(object)
assert.equal(failedRead.waveform, undefined)
assert.equal(failedRead.waveformSourceRevision, state.waveformSourceRevision)
databaseDown = false
await Promise.all([1, 2, 3].map(() => cache.syncExerciseWaveform(1, object, {sourceRevision: state.waveformSourceRevision, waveform: wave})))
assert.equal([...rows.keys()].filter(k => k.startsWith(object)).length, 1)
assert.ok(locks > 0)
console.log('PASS: cache database failures retain source versions; concurrent fills are idempotent')

let calls = [], failures = 0, stop = false
let remoteWave = wave
let response = { waveformSourceRevision: state.waveformSourceRevision }
const client = await load('admin/src/lib/serverWaveformCache.ts', {
  './apiClient': { syncWaveformCache: async (...args) => {
    calls.push(args[3] ? 'write' : 'read')
    if (failures > 0) { failures--; throw Object.assign(new Error('unavailable'), {status: 503}) }
    return response
  } },
  './waveformCache': {
    validWaveform: format.validWaveformPeaks,
    getCachedWaveform: async () => { calls.push('verify-bytes'); return remoteWave },
  },
})
const options = { exerciseId: 1, adminToken: 'test-only', mediaUrl: object, sourceUrl: object, wave, stopped: () => stop }
assert.equal(await client.persistServerWaveform({...options, sourceRevision: state.waveformSourceRevision}), true)
assert.deepEqual(calls, ['write'])
calls=[]
assert.equal(await client.persistServerWaveform({...options, file: {testBlob:true}}), true)
assert.deepEqual(calls, ['read', 'write'])
calls=[]
assert.equal(await client.persistServerWaveform(options), true)
assert.deepEqual(calls, ['read', 'verify-bytes', 'write'])
response = { ...response, waveform: shared.waveform }
calls=[]
assert.equal(await client.persistServerWaveform(options), true)
assert.deepEqual(calls, ['read'])
console.log('PASS: local upload fills silently; remote fallback verifies bytes; existing server hits skip writes')
response = {waveformSourceRevision: state.waveformSourceRevision}
failures=2; calls=[]
assert.equal(await client.persistServerWaveform({...options, sourceRevision: state.waveformSourceRevision}), true)
assert.equal(calls.length,3)
failures=3; calls=[]
assert.equal(await client.persistServerWaveform({...options, sourceRevision: state.waveformSourceRevision}), false)
assert.equal(calls.length,3)
const conflictClient = await load('admin/src/lib/serverWaveformCache.ts', {
  './apiClient': {syncWaveformCache: async () => { calls.push('conflict'); throw Object.assign(new Error('changed'), {status:409}) }},
  './waveformCache': {validWaveform: format.validWaveformPeaks, getCachedWaveform: async () => remoteWave},
})
calls=[]
assert.equal(await conflictClient.persistServerWaveform({...options, sourceRevision: state.waveformSourceRevision}),false)
assert.deepEqual(calls,['conflict'])
stop=true; calls=[]
assert.equal(await client.persistServerWaveform(options), false)
assert.equal(calls.length,0)
console.log('PASS: temporary failures retry quietly; exhausted retries and disposed editors never reject')

let waveformReads = 0
const sourceResolver = await load('admin/src/lib/waveformSource.ts', {
  './waveformCache': {
    validWaveform: format.validWaveformPeaks,
    getCachedWaveform: async () => { waveformReads++; return remoteWave },
  },
})
const instant = await sourceResolver.resolveWaveformSource('https://media.test/stalled-video', undefined, shared.waveform)
assert.equal(instant.mediaUrl, '')
assert.equal(instant.serverHit, true)
assert.equal(waveformReads, 0)
const selected = await sourceResolver.resolveWaveformSource('blob:new-video', {localFile:true}, shared.waveform)
assert.equal(selected.mediaUrl, '')
assert.equal(selected.serverHit, false)
assert.equal(waveformReads, 1)
const fallbackResolver = await load('admin/src/lib/waveformSource.ts', {
  './waveformCache': {validWaveform: format.validWaveformPeaks, getCachedWaveform: async () => { throw new Error('unsupported codec') }},
})
const fallback = await fallbackResolver.resolveWaveformSource('https://media.test/unsupported')
assert.equal(fallback.mediaUrl, 'https://media.test/unsupported')
assert.equal(fallback.waveform, undefined)
console.log('PASS: server/local peaks render without a media URL or buffering; only decode failure uses the original loader')

const {webcrypto} = await import('node:crypto')
let fileReads = 0, localDecodes = 0, downloads = 0, decoderCloses = 0
const browserCache = await load('admin/src/lib/waveformCache.ts', {}, {
  crypto: webcrypto, TextEncoder, clearTimeout, setTimeout,
  fetch: async () => { downloads++; throw new Error('local files must not download') },
  AudioContext: class {
    async decodeAudioData() { localDecodes++; return {duration:1, getChannelData:()=>new Float32Array(8000).fill(.25)} }
    async close() { decoderCloses++ }
  },
})
const localFile = {arrayBuffer:async()=>{fileReads++;return new Uint8Array([70,80,90]).buffer}}
const firstLocal = await browserCache.getCachedWaveform('blob:before-upload',localFile)
const reopenedLocal = await browserCache.getCachedWaveform('blob:after-binding',localFile)
assert.equal(firstLocal,reopenedLocal)
assert.equal(fileReads,1)
assert.equal(localDecodes,1)
assert.equal(downloads,0)
assert.equal(decoderCloses,1)
console.log('PASS: first local selection decodes without network/player readiness; remount/binding reuses the same file result')

assert.equal(sourceResolver.waveformMediaIdentity('media?token=old','bytes-v1',shared.waveform),
  sourceResolver.waveformMediaIdentity('media?token=new','bytes-v1',{...shared.waveform,peaks:[...shared.waveform.peaks]}))
assert.notEqual(sourceResolver.waveformMediaIdentity('media','bytes-v1'),sourceResolver.waveformMediaIdentity('media','bytes-v2'))
assert.equal(sourceResolver.waveformMediaIdentity('','bytes-v1'),'')
console.log('PASS: fresh cache objects/signed URLs preserve waveform identity; actual media revisions change it')

let seekTargets=[]
const fakeMedia=Object.assign(new EventTarget(),{readyState:0,currentTime:0,seeking:false,preload:'metadata'})
const webModule={createWebPlaybackAdapter:()=>({seek:async(target)=>{assert.equal(fakeMedia.preload,'auto');seekTargets.push(target)},snapshot:()=>({}),play:async()=>{},pause:()=>{},subscribe:()=>()=>{}})}
const {createAdminPlaybackAdapter}=await load('admin/src/lib/adminPlaybackAdapter.ts',{'@duolinting/playback/web':webModule})
const adminAdapter=createAdminPlaybackAdapter(()=>fakeMedia,()=> 'media')
const firstSignal=new AbortController()
const preparing=adminAdapter.prepare(15_000_000,16_000_000,firstSignal.signal)
assert.equal(fakeMedia.preload,'auto')
assert.equal(seekTargets.length,0)
fakeMedia.readyState=1;fakeMedia.dispatchEvent(new Event('loadedmetadata'))
await preparing
assert.deepEqual(seekTargets,[15_000_000])
firstSignal.abort();assert.equal(fakeMedia.preload,'metadata')
fakeMedia.readyState=0
const cancelledSignal=new AbortController();const pendingMetadata=adminAdapter.prepare(5_000_000,6_000_000,cancelledSignal.signal)
cancelledSignal.abort();await assert.rejects(pendingMetadata,/cancelled/)
fakeMedia.readyState=1;fakeMedia.dispatchEvent(new Event('loadedmetadata'))
assert.equal(seekTargets.length,1)
const older=new AbortController(),newer=new AbortController()
await adminAdapter.prepare(5_000_000,6_000_000,older.signal)
await adminAdapter.prepare(15_000_000,16_000_000,newer.signal)
older.abort();assert.equal(fakeMedia.preload,'auto')
newer.abort();assert.equal(fakeMedia.preload,'metadata')
console.log('PASS: explicit play/seek enables buffering after metadata; cancellation restores preload and cannot overwrite a newer operation')

let originalPixelReads=0,scratchPixelReads=0,frequentReadOption=false
const rect={left:0,top:0,right:600,bottom:200,width:600,height:200}
const canvas={width:600,height:200,isConnected:true,getBoundingClientRect:()=>rect,getContext:()=>({isContextLost:()=>false,getImageData:()=>{originalPixelReads++;throw new Error('GPU readback forbidden')}})}
const container={isConnected:true,getBoundingClientRect:()=>rect,firstElementChild:{shadowRoot:{querySelectorAll:selector=>selector==='canvas'?[canvas]:[]}}}
const {getWaveformDomSnapshot}=await load('admin/src/lib/mediaDiagnostics.ts',{}, {
 URLSearchParams,performance:{now:()=>0},window:{location:{search:''},getComputedStyle:()=>({display:'block',opacity:'1',visibility:'visible'})},
 document:{createElement:()=>({width:0,height:0,getContext:(_type,options)=>{frequentReadOption=options.willReadFrequently;return {drawImage:()=>{},getImageData:(_x,_y,w,h)=>{assert.ok(w<=256&&h<=64);scratchPixelReads++;const data=new Uint8ClampedArray(w*h*4);data[3]=255;return {data}}}}})},
})
assert.equal(getWaveformDomSnapshot(container).canvases[0].nonTransparentProbePixels,null)
assert.equal(originalPixelReads,0);assert.equal(scratchPixelReads,0)
assert.equal(getWaveformDomSnapshot(container,{probePixels:true}).canvases[0].nonTransparentProbePixels,1)
assert.equal(originalPixelReads,0);assert.equal(scratchPixelReads,1);assert.equal(frequentReadOption,true)
console.log('PASS: routine diagnostics never read pixels; explicit probes use one bounded CPU canvas read')
