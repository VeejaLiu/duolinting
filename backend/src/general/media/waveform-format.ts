import { createHash } from 'node:crypto';
import type { CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

export type WaveformPeaks = { duration: number; peaks: number[] };
export function validWaveformPeaks(value: unknown): value is WaveformPeaks {
    const wave = value as WaveformPeaks | null;
    return Boolean(wave && Number.isFinite(wave.duration) && wave.duration > 0 &&
        Array.isArray(wave.peaks) && wave.peaks.length > 0 && wave.peaks.length <= 2_000_000 &&
        Math.abs(wave.peaks.length - Math.ceil(wave.duration * 100)) <= 1 &&
        wave.peaks.every((peak) => Number.isFinite(peak) && Math.abs(peak) <= 1));
}

// Opaque version of the managed object bytes. Never includes signed URL expiry.
export const waveformSourceRevision = (objectName: string, etag: string) =>
    createHash('sha256').update(`${objectName}\n${etag}`).digest('hex');

export function courseWaveform(wave: WaveformPeaks, sourceRevision: string): CourseWaveform {
    return {
        revision: createHash('sha256').update(JSON.stringify(wave)).digest('hex'),
        mediaRevision: sourceRevision,
        timelineId: sourceRevision,
        durationUs: Math.round(wave.duration * 1_000_000),
        bucketDurationUs: 10000,
        peaks: wave.peaks,
    };
}

export function parseCourseWaveform(value: unknown): CourseWaveform | undefined {
    try {
        const wave = (typeof value === 'string' ? JSON.parse(value) : value) as CourseWaveform | null;
        return wave && Number.isSafeInteger(wave.durationUs) && wave.bucketDurationUs === 10000 &&
            validWaveformPeaks({ duration: wave.durationUs / 1_000_000, peaks: wave.peaks })
            ? wave : undefined;
    } catch { return undefined; }
}
