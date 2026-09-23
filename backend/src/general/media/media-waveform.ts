import { spawn } from 'node:child_process';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { getManagedMediaObjectName, statMediaObject } from '../media/media-service';
import type { CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;

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

export async function cachedMediaWaveform(url: string): Promise<CourseWaveform | undefined> {
    const objectName = getManagedMediaObjectName(url); if (!objectName) return undefined;
    const stat = await statMediaObject(objectName).catch(() => null); if (!stat) return undefined;
    const [row] = await sequelize.query<{ waveform_json: unknown }>('select waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1', { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT });
    return row ? json<CourseWaveform>(row.waveform_json) : undefined;
}
