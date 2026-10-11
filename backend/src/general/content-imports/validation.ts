import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { getMediaObject } from '../media/media-service';
import { ImportError, type ImportFile, type ImportRequest, LIMITS, parseSrt } from './contracts';

const execute = promisify(execFile);
/** Streams are bounded by the declared size and a deadline, so large media never enter Node's heap. */
async function download(file: ImportFile, key: string, destination: string) {
    const object = await getMediaObject(key);
    if (String(object.contentType).split(';')[0].trim().toLowerCase() !== file.contentType) {
        object.stream.destroy();
        throw new ImportError('FILE_CONTENT_TYPE_MISMATCH', `Upload Content-Type must match the declared ${file.role} type`, 422, true);
    }
    if (object.size !== file.sizeBytes) { object.stream.destroy(); throw new ImportError('FILE_SIZE_MISMATCH', `Wrong file size for ${file.role}`, 422, true); }
    let bytes = 0;
    const digest = createHash('sha256');
    const check = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > LIMITS[file.role] || bytes > file.sizeBytes) { callback(new ImportError('FILE_TOO_LARGE', `File exceeds declared size: ${file.role}`, 422)); return; }
        digest.update(chunk); callback(null, chunk);
    } });
    await pipeline(object.stream, check, createWriteStream(destination), { signal: AbortSignal.timeout(90000) });
    if (bytes !== file.sizeBytes || (file.sha256 && digest.digest('hex') !== file.sha256)) throw new ImportError('FILE_CHECKSUM_MISMATCH', `Incomplete or incorrect ${file.role} upload`, 422, true);
}
export async function validateImport(request: ImportRequest, keys: Record<string, string>) {
    const directory = await mkdtemp(path.join(tmpdir(), 'duolinting-import-'));
    try {
        for (const file of request.files) await download(file, keys[file.role], path.join(directory, file.role));
        let probe: any;
        try {
            // Only local-file protocols are permitted: crafted media cannot make ffprobe fetch arbitrary URLs.
            const result = await execute('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', path.join(directory, 'media')], { timeout: 30000, maxBuffer: 1024 * 1024 });
            probe = JSON.parse(result.stdout);
        } catch (error: any) {
            if (error.code === 'ENOENT') throw new ImportError('MEDIA_PROBE_UNAVAILABLE', 'Install ffprobe on the backend host', 503, true);
            throw new ImportError('INVALID_MEDIA', 'Media cannot be inspected', 422, true);
        }
        const duration = Number(probe.format?.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 21600 || !String(probe.format?.format_name).split(',').includes('mp4')) throw new ImportError('INVALID_MEDIA', 'Expected MP4/M4A with a valid duration up to 6 hours', 422);
        const streams = Array.isArray(probe.streams) ? probe.streams : [];
        const audio = streams.find((stream: any) => stream.codec_type === 'audio');
        const video = streams.find((stream: any) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
        if (!audio || audio.codec_name !== 'aac' || (request.mediaType === 'video' ? !video || video.codec_name !== 'h264' || !['yuv420p', 'yuvj420p'].includes(video.pix_fmt) : Boolean(video))) throw new ImportError('UNSUPPORTED_MEDIA_CODEC', 'Use AAC audio; video must use H.264 8-bit 4:2:0 with an audio track', 422);
        if (Math.abs(duration - request.durationSeconds) > Math.max(2, duration * 0.01)) throw new ImportError('DURATION_MISMATCH', 'Reported duration differs from the actual media duration', 422);
        if (keys.cover) {
            try {
                const image = await sharp(await readFile(path.join(directory, 'cover')), { limitInputPixels: 40000000 }).metadata();
                const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[image.format as 'jpeg' | 'png' | 'webp'];
                if (!mime || mime !== request.files.find(file => file.role === 'cover')?.contentType || !image.width || !image.height) throw new Error('Invalid image');
            } catch { throw new ImportError('INVALID_COVER', 'Cover must be a valid JPEG, PNG, or WebP image', 422); }
        }
        const subtitles = parseSrt(await readFile(path.join(directory, 'subtitle')), duration);
        return { ...subtitles, media: { durationSeconds: duration, audioCodec: audio.codec_name, videoCodec: video?.codec_name ?? null, width: video?.width ?? null, height: video?.height ?? null, sizeBytes: request.files.find(file => file.role === 'media')!.sizeBytes }, subtitle: { cueCount: subtitles.lines.length, encoding: 'UTF-8', timelineChecked: true } };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
