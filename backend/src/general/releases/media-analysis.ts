import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { getManagedMediaObjectName, getMediaObject, statMediaObject, storeReleaseMediaFile } from '../media/media-service';
import { digest } from './release-contract';
import type { CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

type Analysis = { mediaType: 'audio' | 'video'; mediaUrl: string; mediaRevision: string; durationUs: number; waveform: CourseWaveform; audioCodec: string; videoCodec?: string };
const pending = new Map<string, Promise<Analysis>>();
let queue: Promise<unknown> = Promise.resolve();
const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;

function probe(file: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',file]);
        let output = '';
        const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('媒体分析超时')); }, 60000);
        child.stdout.on('data', (data) => { output += data; if (output.length > 1_000_000) child.kill('SIGKILL'); });
        child.stderr.resume();
        child.once('error', (error) => { clearTimeout(timeout); reject(error); });
        child.once('close', (code) => { clearTimeout(timeout); if (code !== 0) reject(new Error('无法分析媒体，请检查文件格式')); else { try { resolve(JSON.parse(output)); } catch (error) { reject(error); } } });
    });
}
export function analysePeaks(file: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        // Only decode/analyse the first audio track. No converted playback file is produced.
        // Preserve container presentation offsets, including silence before the selected track.
        const child = spawn('ffmpeg', ['-v','error','-nostdin','-protocol_whitelist','file,pipe',
            '-copyts','-start_at_zero','-i',file,'-map','0:a:0','-af','aresample=8000:async=1:first_pts=0',
            '-ac','1','-ar','8000','-f','f32le','pipe:1']);
        const peaks: number[] = []; let rest = Buffer.alloc(0), count = 0, peak = 0;
        const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('波形分析超时')); }, 120000);
        child.stdout.on('data', (data: Buffer) => {
            const bytes = Buffer.concat([rest, data]); const length = bytes.length - bytes.length % 4;
            for (let i = 0; i < length; i += 4) {
                peak = Math.max(peak, Math.abs(bytes.readFloatLE(i))); count++;
                if (count === 80) { peaks.push(Math.round(Math.min(1, peak) * 10000) / 10000); count = 0; peak = 0; }
            }
            rest = bytes.subarray(length);
            if (peaks.length > 720000) child.kill('SIGKILL');
        });
        child.stderr.resume();
        child.once('error', (error) => { clearTimeout(timeout); reject(error); });
        child.once('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) return reject(new Error('波形分析失败或媒体超过两小时'));
            if (count) peaks.push(Math.round(Math.min(1, peak) * 10000) / 10000);
            resolve(peaks);
        });
    });
}

export async function ensureMediaAnalysis(url: string, mediaType: 'audio' | 'video'): Promise<Analysis> {
    const objectName = getManagedMediaObjectName(url);
    if (!objectName) throw new Error('正式发布需要上传到本站的不可变媒体文件');
    const stat = await statMediaObject(objectName);
    const key = `${objectName}:${stat.etag}:${mediaType}`;
    const existing = pending.get(key); if (existing) return existing;
    const task = queue.catch(() => {}).then(async () => {
        const rows = await sequelize.query<{ analysis_json: unknown; waveform_json: unknown }>(
            'select analysis_json, waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1',
            { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT });
        if (rows[0]) {
            const analysis = json<Omit<Analysis,'waveform'>>(rows[0].analysis_json);
            if (analysis.mediaType !== mediaType) throw new Error('课程媒体类型与文件不一致');
            return { ...analysis, waveform: json<CourseWaveform>(rows[0].waveform_json) };
        }
        const dir = await mkdtemp(join(tmpdir(), 'duolinting-analysis-'));
        try {
            const media = await getMediaObject(objectName);
            if (media.size > 120 * 1024 * 1024) throw new Error('媒体文件超过分析上限');
            const file = join(dir, 'media'); const hash = createHash('sha256');
            media.stream.on('data', (data) => hash.update(data));
            await pipeline(media.stream, createWriteStream(file));
            if ((await statMediaObject(objectName)).etag !== stat.etag) throw new Error('媒体上传尚未稳定，请稍后重试');
            const info = await probe(file);
            const audioTracks = info.streams.filter((item: any) => item.codec_type === 'audio');
            const videoTracks = info.streams.filter((item: any) => item.codec_type === 'video' && !item.disposition?.attached_pic);
            if (audioTracks.length !== 1 || videoTracks.length > 1) throw new Error('请由内容准备者提供只有一条声音轨道和至多一条视频轨道的文件');
            const audio = audioTracks[0], video = videoTracks[0];
            const duration = Number(info.format.duration);
            if (Math.abs(Number(info.format.start_time ?? 0)) > 0.05 || (video && Math.abs(Number(audio.start_time ?? 0)-Number(video.start_time ?? 0)) > 0.05)) throw new Error('媒体时间起点不一致，请内容准备者处理后重新上传');
            if (!audio || !Number.isFinite(duration) || duration <= 0) throw new Error('媒体没有有效音轨或时长');
            if (audio.codec_name !== 'aac' || audio.profile !== 'LC' || !String(info.format.format_name).includes('mp4')) throw new Error('请由内容准备者提供 AAC/M4A 音频或 H.264/AAC MP4 视频');
            if (mediaType === 'audio' && (video || audio.channels !== 1)) throw new Error('音频课程请提供单声道 AAC/M4A 文件');
            if (mediaType === 'video' && (!video || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p')) throw new Error('视频课程请提供 H.264/AAC、yuv420p 的 MP4 文件');
            const mediaRevision = hash.digest('hex');
            const durationUs = Math.round(duration * 1_000_000);
            const timelineId = digest({ mediaRevision, originUs: 0, audioTrack: 0, version: 1 });
            const peaks = await analysePeaks(file);
            const waveform: CourseWaveform = { mediaRevision, timelineId, durationUs, bucketDurationUs: 10000,
                peaks, revision: digest({ mediaRevision, timelineId, bucketDurationUs: 10000, peaks }) };
            const mediaUrl = await storeReleaseMediaFile(mediaRevision, mediaType === 'audio' ? 'audio/mp4' : 'video/mp4', file);
            const analysis = { mediaType, mediaUrl, mediaRevision, durationUs, audioCodec: audio.codec_name, videoCodec: video?.codec_name };
            await sequelize.query('insert into media_analyses (object_name,source_etag,media_revision,analysis_json,waveform_json) values (:objectName,:etag,:mediaRevision,cast(:analysis as json),cast(:waveform as json)) on duplicate key update object_name=values(object_name)',
                { replacements: { objectName, etag: stat.etag, mediaRevision, analysis: JSON.stringify(analysis), waveform: JSON.stringify(waveform) } });
            return { ...analysis, waveform };
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
    queue = task; pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
}

export async function cachedMediaWaveform(url: string): Promise<CourseWaveform | undefined> {
    const objectName = getManagedMediaObjectName(url); if (!objectName) return undefined;
    const stat = await statMediaObject(objectName).catch(() => null); if (!stat) return undefined;
    const [row] = await sequelize.query<{ waveform_json: unknown }>('select waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1', { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT });
    return row ? json<CourseWaveform>(row.waveform_json) : undefined;
}
