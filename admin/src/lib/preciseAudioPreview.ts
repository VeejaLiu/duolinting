// PCM WAV 按采样帧寻址，避免部分 VBR MP3 在原生播放器中 seek 后
// currentTime 看似正确、实际声音却偏移。输出仅作编辑预览，不写回课程媒体。
const PREVIEW_SAMPLE_RATE = 48000
const MAX_PCM_BYTES = 256 * 1024 * 1024
const MAX_PREFLIGHT_SECONDS = MAX_PCM_BYTES / (PREVIEW_SAMPLE_RATE * 2 * 2)

export class AudioPreviewTooLargeError extends Error {}

const ensureActive = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError')
}

async function probeDuration(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement('audio')
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      media.onloadedmetadata = null
      media.onerror = null
      media.removeAttribute('src')
      media.load()
    }
    const fail = (error: Error) => { cleanup(); reject(error) }
    const abort = () => fail(new DOMException('Preview cancelled', 'AbortError'))
    const timer = setTimeout(() => fail(new Error('Audio metadata timed out')), 15000)
    media.onloadedmetadata = () => { const duration = media.duration; cleanup(); resolve(duration) }
    media.onerror = () => fail(new Error('Audio metadata unavailable'))
    signal.addEventListener('abort', abort, { once: true })
    media.preload = 'metadata'
    media.src = url
    if (signal.aborted) abort()
  })
}

export async function encodePcmWave(buffer: AudioBuffer, signal: AbortSignal): Promise<Blob> {
  ensureActive(signal)
  const channels = buffer.numberOfChannels
  const byteLength = buffer.length * channels * 2
  if (channels > 2 || byteLength > MAX_PCM_BYTES) throw new AudioPreviewTooLargeError()

  // RIFF/WAVE：16 位有符号小端 PCM；每帧按声道交错存储。
  // 不裁剪静音、不改变时长，字幕的源时间坐标保持不变。
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF'); view.setUint32(4, 36 + byteLength, true)
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, byteLength, true)
  const parts: BlobPart[] = [header]
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  // 每批约 1 MB，批次间让出主线程；不额外分配整份交错 PCM 数组。
  const framesPerChunk = Math.floor(1024 * 1024 / (channels * 2))
  for (let start = 0; start < buffer.length; start += framesPerChunk) {
    ensureActive(signal)
    const frames = Math.min(framesPerChunk, buffer.length - start)
    const chunk = new ArrayBuffer(frames * channels * 2)
    const pcm = new DataView(chunk)
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, data[channel][start + frame]))
        pcm.setInt16((frame * channels + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
      }
    }
    parts.push(chunk)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  ensureActive(signal)
  return new Blob(parts, { type: 'audio/wav' })
}

export async function preparePreciseAudioPreview(url: string, signal: AbortSignal): Promise<Blob> {
  ensureActive(signal)
  // 先检查时长，再进行完整解码，限制长文件的峰值内存。
  const duration = await probeDuration(url, signal)
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_PREFLIGHT_SECONDS) {
    throw new AudioPreviewTooLargeError()
  }
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Audio download failed')
  const encoded = await response.arrayBuffer()
  ensureActive(signal)
  // OfflineAudioContext 只解码，不打开第二个有声播放器或要求用户解锁音频设备。
  const decoder = new OfflineAudioContext(2, 1, PREVIEW_SAMPLE_RATE)
  const buffer = await decoder.decodeAudioData(encoded)
  ensureActive(signal)
  return encodePcmWave(buffer, signal)
}
