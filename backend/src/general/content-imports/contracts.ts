import { createHash } from 'node:crypto';
import type { TranscriptLine } from '../../domain';

export class ImportError extends Error {
    constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
export type ImportFile = { role: 'media' | 'subtitle' | 'cover'; fileName: string; contentType: string; sizeBytes: number; sha256?: string; objectName?: string };
export type ImportRequest = {
    categoryId: number; sortOrder: number; title: string; summary: string;
    mediaType: 'audio' | 'video'; language: 'en'; difficulty: 'beginner' | 'intermediate' | 'advanced';
    sourceUrl: string; source: { provider: string; externalId: string }; durationSeconds: number;
    files: ImportFile[];
};
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const LIMITS = { media: 512 * 1024 * 1024, subtitle: 2 * 1024 * 1024, cover: 10 * 1024 * 1024 };
export function record(value: unknown, keys: string[]): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ImportError('INVALID_REQUEST', 'Expected a JSON object');
    const extra = Object.keys(value).find(key => !keys.includes(key));
    // 严格白名单拒绝 status、id、exerciseId、对象键等字段，禁止工具表达发布或覆盖意图。
    if (extra) throw new ImportError('UNKNOWN_FIELD', `Unsupported field: ${extra}`);
    return value as Record<string, any>;
}
function text(value: unknown, name: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ImportError('INVALID_REQUEST', `Invalid ${name}`);
    return value.trim();
}
export function sourceIdentity(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new ImportError('INVALID_SOURCE', 'sourceUrl must be an HTTP(S) URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ImportError('INVALID_SOURCE', 'sourceUrl must be an HTTP(S) URL without credentials');
    const host = url.hostname.toLowerCase();
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
        const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new ImportError('INVALID_SOURCE', 'Invalid YouTube video ID');
        return { provider: 'youtube', externalId: id, url: `https://www.youtube.com/watch?v=${id}`, identity: `youtube:${id}` };
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return { provider: 'url', externalId: url.toString(), url: url.toString(), identity: `url:${url}` };
}
export function parseImportRequest(value: unknown): ImportRequest {
    const body = record(value, ['categoryId', 'sortOrder', 'title', 'summary', 'mediaType', 'language', 'difficulty', 'sourceUrl', 'source', 'durationSeconds', 'files']);
    if (!Number.isSafeInteger(body.categoryId) || body.categoryId < 1 || !Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 2147483647) throw new ImportError('INVALID_REQUEST', 'Invalid categoryId or sortOrder');
    if (!['audio', 'video'].includes(body.mediaType) || !['beginner', 'intermediate', 'advanced'].includes(body.difficulty)) throw new ImportError('INVALID_REQUEST', 'Invalid mediaType or difficulty');
    // 现有学习产品以英文原文为基准；其他素材语言需要独立产品支持，不能静默当作英文。
    if (body.language !== 'en') throw new ImportError('UNSUPPORTED_LANGUAGE', 'This version imports English source subtitles only (language=en)');
    if (typeof body.durationSeconds !== 'number' || !Number.isFinite(body.durationSeconds) || body.durationSeconds <= 0 || body.durationSeconds > 21600) throw new ImportError('INVALID_REQUEST', 'durationSeconds must be seconds in (0, 21600]');
    const source = sourceIdentity(text(body.sourceUrl, 'sourceUrl', 2048));
    if (body.source !== undefined) {
        const supplied = record(body.source, ['provider', 'externalId']);
        if (supplied.provider !== source.provider || supplied.externalId !== source.externalId) throw new ImportError('SOURCE_MISMATCH', 'source must match sourceUrl');
    }
    if (!Array.isArray(body.files) || body.files.length < 2 || body.files.length > 3) throw new ImportError('INVALID_REQUEST', 'Provide media, subtitle, and optionally cover files');
    const roles = new Set<string>();
    const files = body.files.map((value: unknown): ImportFile => {
        const file = record(value, ['role', 'fileName', 'contentType', 'sizeBytes', 'sha256', 'language']);
        if (!['media', 'subtitle', 'cover'].includes(file.role) || roles.has(file.role)) throw new ImportError('INVALID_REQUEST', 'Each file role must be unique');
        roles.add(file.role);
        const role = file.role as ImportFile['role'];
        const contentType = text(file.contentType, 'contentType', 100).toLowerCase();
        const accepted = role === 'subtitle' ? ['application/x-subrip', 'text/plain'] : role === 'cover' ? ['image/jpeg', 'image/png', 'image/webp'] : body.mediaType === 'video' ? ['video/mp4'] : ['audio/mp4', 'audio/m4a', 'audio/x-m4a'];
        if (!accepted.includes(contentType)) throw new ImportError('UNSUPPORTED_FILE_TYPE', `Unsupported contentType for ${role}`);
        if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > LIMITS[role]) throw new ImportError('FILE_TOO_LARGE', `Invalid sizeBytes for ${role}`);
        const fileName = text(file.fileName, 'fileName', 180);
        if (role === 'subtitle' && (!/\.srt$/i.test(fileName) || (file.language !== undefined && file.language !== 'en'))) throw new ImportError('INVALID_SUBTITLE', 'Provide an English .srt file');
        if (file.language !== undefined && role !== 'subtitle') throw new ImportError('INVALID_REQUEST', 'File language is only supported for subtitles');
        if (file.sha256 !== undefined && (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256))) throw new ImportError('INVALID_REQUEST', 'sha256 must contain 64 lowercase hex digits');
        return { role, fileName, contentType, sizeBytes: file.sizeBytes, ...(file.sha256 ? { sha256: file.sha256 } : {}) };
    }).sort((a: ImportFile, b: ImportFile) => a.role.localeCompare(b.role));
    if (!roles.has('media') || !roles.has('subtitle')) throw new ImportError('INVALID_REQUEST', 'Both media and subtitle are required');
    if (body.summary !== undefined && (typeof body.summary !== 'string' || body.summary.length > 10000)) throw new ImportError('INVALID_REQUEST', 'Invalid summary');
    return { categoryId: body.categoryId, sortOrder: body.sortOrder, title: text(body.title, 'title', 180), summary: body.summary?.trim() ?? '', mediaType: body.mediaType, language: 'en', difficulty: body.difficulty, sourceUrl: source.url, source: { provider: source.provider, externalId: source.externalId }, durationSeconds: body.durationSeconds, files };
}
export function parseSrt(buffer: Buffer, duration: number) {
    let input: string;
    try { input = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim(); }
    catch { throw new ImportError('SUBTITLE_ENCODING', 'SRT must be UTF-8'); }
    if (!input) throw new ImportError('EMPTY_SUBTITLE', 'SRT has no cues');
    const warnings: string[] = [];
    const timestamp = (h: string, m: string, s: string, ms: string) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const lines: TranscriptLine[] = input.split(/\n[ \t]*\n/).map((block, index) => {
        const parts = block.split('\n');
        if (/^\d+$/.test(parts[0].trim())) parts.shift();
        const match = /^(\d{2,3}):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d{2,3}):([0-5]\d):([0-5]\d)[,.](\d{3})\s*$/.exec(parts.shift()?.trim() ?? '');
        if (!match) throw new ImportError('SUBTITLE_PARSE_ERROR', `Invalid timestamp at cue ${index + 1}`);
        const start = timestamp(match[1], match[2], match[3], match[4]);
        const end = timestamp(match[5], match[6], match[7], match[8]);
        const text = parts.join(' ').replace(/<[^>]*>/g, '').trim();
        // 字幕时间是相对媒体开头的秒数（含毫秒），绝不自动移动或截断时间轴。
        if (!(start < end) || end > duration + 0.25 || !text || text.length > 10000) throw new ImportError('SUBTITLE_TIMELINE_ERROR', `Invalid text or time range at cue ${index + 1}`);
        return { id: `line-${index + 1}`, start, end, text, translation: '', translations: {}, answers: [text], keywords: [] };
    });
    if (lines.length > 10000) throw new ImportError('SUBTITLE_TOO_MANY_CUES', 'Maximum 10000 subtitle cues');
    lines.forEach((line, index) => {
        if (index && line.start < lines[index - 1].start) throw new ImportError('SUBTITLE_ORDER_ERROR', `Cue ${index + 1} starts before the previous cue`);
        if (index && line.start < lines[index - 1].end && !warnings.includes('OVERLAPPING_CUES')) warnings.push('OVERLAPPING_CUES');
    });
    warnings.push('HUMAN_SUBTITLE_REVIEW_REQUIRED');
    return { lines, warnings };
}
