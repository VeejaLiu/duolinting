import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const { analysePeaks }=require('../backend/src/general/releases/media-analysis.ts')
const spec=JSON.parse(await readFile(new URL('../packages/playback/fixtures/source-markers.json',import.meta.url),'utf8'))
const directory=await mkdtemp(join(tmpdir(),'waveform-check-'))
try {
 const file=join(directory,'markers.m4a')
 const gates=spec.markerStartSeconds.map(t=>`between(t\\,${t}\\,${t+spec.markerDurationSeconds})`).join('+')
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`aevalsrc=0.5*sin(2*PI*${spec.frequencyHz}*t)*(${gates}):s=48000:d=${spec.durationSeconds}`,'-ac','1','-c:a','aac','-b:a','160k','-movflags','+faststart',file])
 const peaks=await analysePeaks(file)
 assert.ok(Math.abs(peaks.length/100-spec.durationSeconds)<0.05)
 for(const start of spec.markerStartSeconds){
  const from=Math.round((start-0.1)*100),to=Math.round((start+0.2)*100)
  const found=peaks.findIndex((value,index)=>index>=from&&index<to&&value>0.05)/100
  assert.ok(Math.abs(found-start)<=spec.waveformToleranceSeconds,`${start}: observed ${found}`)
 }
 console.log('PASS: 480-second source; beginning/middle/end markers aligned within 30 ms; 10 ms waveform buckets')
}finally{await rm(directory,{recursive:true,force:true})}
