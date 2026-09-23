/** Evaluation-only backend. Production clients deliberately do not import this module.
 * Decodes at most 30 seconds into memory; never creates or transcodes a media file.
 * This prototype supports 1x playback only. Device/output validation is required before adoption.
 */
import { Input, UrlSource, ALL_FORMATS, AudioBufferSink, CanvasSink } from 'mediabunny'
import { secondsToUs, usToSeconds, type PlaybackAdapter, type PlaybackEvent } from '../index.js'

export async function createMediabunnyPrototype(url: string, sourceKey: string, context: AudioContext, destination: AudioNode = context.destination) {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS })
  const audio = (await input.getAudioTracks())[0]
  if (!audio || !(await audio.canDecode())) { input.dispose(); throw new Error('Browser cannot decode this audio') }
  const sink = new AudioBufferSink(audio)
  const durationUs = secondsToUs(await input.computeDuration())
  const video = (await input.getVideoTracks())[0]
  const videoSink = video ? new CanvasSink(video, { width: 640 }) : null
  let buffer: AudioBuffer | null = null, node: AudioBufferSourceNode | null = null
  let startUs = 0, endUs = 0, positionUs = 0, beganAt = 0, playing = false, ended = false
  let frame = 0
  const listeners = new Set<(event: PlaybackEvent) => void>()
  const emit = (event: PlaybackEvent) => { for (const listener of [...listeners]) listener(event) }
  const position = () => playing ? Math.min(endUs, startUs + secondsToUs(Math.max(0, context.currentTime-beganAt))) : positionUs
  const pause = () => {
    positionUs = position(); playing = false; cancelAnimationFrame(frame)
    if (node) { node.onended = null; try { node.stop() } catch { /* Already ended. */ } node.disconnect(); node = null }
  }
  const prepare = async (start: number | undefined, end: number | undefined, signal: AbortSignal) => {
    pause(); buffer = null
    if (start === undefined || end === undefined || end <= start || end-start > 30_000_000) throw new Error('Prototype requires a bounded range of at most 30 seconds')
    startUs = start; endUs = end; positionUs = start; ended = false
    for await (const chunk of sink.buffers(usToSeconds(start), usToSeconds(end))) {
      if (signal.aborted) throw new Error('cancelled')
      if (!buffer) buffer = new AudioBuffer({ numberOfChannels: chunk.buffer.numberOfChannels, sampleRate: chunk.buffer.sampleRate,
        length: Math.max(1, Math.round(usToSeconds(end-start)*chunk.buffer.sampleRate)) })
      const rate = buffer.sampleRate
      if (rate !== chunk.buffer.sampleRate) throw new Error('Sample rate changed inside a range')
      const offset = Math.round((chunk.timestamp-usToSeconds(start))*rate)
      const sourceStart = Math.max(0,-offset), targetStart = Math.max(0,offset)
      const length = Math.min(chunk.buffer.length-sourceStart,buffer.length-targetStart)
      if (length>0) for(let channel=0;channel<buffer.numberOfChannels;channel++) {
        buffer.getChannelData(channel).set(chunk.buffer.getChannelData(channel).subarray(sourceStart,sourceStart+length),targetStart)
      }
    }
    if (signal.aborted) throw new Error('cancelled')
    buffer ??= new AudioBuffer({numberOfChannels:1,sampleRate:context.sampleRate,length:Math.round(usToSeconds(end-start)*context.sampleRate)})
  }
  const adapter: PlaybackAdapter = {
    snapshot: () => ({ sourceKey, positionUs: position(), durationUs, playing, buffering: false, ended }),
    prepare,
    seek: async () => { throw new Error('Use a bounded range with the prototype') },
    async play(signal) {
      await context.resume()
      if (signal.aborted || !buffer) throw new Error('cancelled')
      node = context.createBufferSource(); node.buffer = buffer; node.connect(destination)
      beganAt = context.currentTime+0.02; playing = true
      node.onended = () => { positionUs=endUs;playing=false;ended=true;emit('ended') }
      node.start(beganAt)
      const tick=()=>{ if(!playing)return;emit('time');if(playing)frame=requestAnimationFrame(tick) }
      frame=requestAnimationFrame(tick);emit('playing')
    },
    pause,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    adapter,
    async drawVideoFrame(canvas: HTMLCanvasElement, timeUs: number) {
      if (!videoSink) return null
      const frame = await videoSink.getCanvas(usToSeconds(timeUs))
      if (!frame) return null
      const graphics=canvas.getContext('2d');graphics?.drawImage(frame.canvas,0,0,canvas.width,canvas.height)
      return { timestampUs: secondsToUs(frame.timestamp), durationUs: secondsToUs(frame.duration) }
    },
    dispose() { pause(); listeners.clear(); buffer=null; input.dispose() },
  }
}
