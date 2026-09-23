import { createHash } from 'node:crypto';
import type { ListeningExercise } from '../../domain';
import type { CourseReleaseManifest } from '@duolinting/shared' with { 'resolution-mode': 'import' };

const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])])) : value;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function validateReleaseLines(lines: ListeningExercise['lines'], durationUs: number) {
    if (!lines.length) throw new Error('发布版本必须包含字幕');
    const ids = new Set<string>();
    for (const line of lines) {
        if (typeof line.id !== 'string' || !line.id || line.id.length > 96 || ids.has(line.id)) throw new Error('字幕行 ID 必须稳定且唯一');
        ids.add(line.id);
        if (!Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < 0 || line.end <= line.start ||
            Math.round(line.end * 1_000_000) > durationUs || !line.text.trim()) throw new Error('字幕时间必须在媒体范围内，且文本不能为空');
    }
}
export function createManifest(course: ListeningExercise, mediaRevision: string, durationUs: number, waveformRevision: string): Omit<CourseReleaseManifest, 'courseReleaseId' | 'state'> {
    validateReleaseLines(course.lines, durationUs);
    return {
        mediaRevision, timelineId: digest({ mediaRevision, originUs: 0, audioTrack: 0, version: 1 }),
        subtitleRevision: digest(course.lines), waveformRevision, playbackContractVersion: 1,
        timelineOriginUs: 0, audioTrackIndex: 0, durationUs, verifiedMedia: true,
    };
}
