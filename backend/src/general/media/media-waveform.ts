import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { getManagedMediaObjectName, statMediaObject } from './media-service';
import { Logger } from '../../lib/logger';
import { courseWaveform, parseCourseWaveform, validWaveformPeaks, waveformSourceRevision } from './waveform-format';
import type { CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

const logger = new Logger(__filename);
export type MediaWaveformState = { waveformSourceRevision?: string; waveform?: CourseWaveform };

// The request process only reads/writes summaries; browsers do all audio decoding.
export async function mediaWaveformState(url: string): Promise<MediaWaveformState> {
    const objectName = getManagedMediaObjectName(url);
    if (!objectName) return {};
    const stat = await statMediaObject(objectName).catch(() => null);
    if (!stat) return {};
    const waveformSourceRevisionValue = waveformSourceRevision(objectName, stat.etag);
    try {
        const [row] = await sequelize.query<{ waveform_json: unknown }>(
            'select waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1',
            { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT },
        );
        const waveform = row ? parseCourseWaveform(row.waveform_json) : undefined;
        return { waveformSourceRevision: waveformSourceRevisionValue, waveform };
    } catch {
        // Still provide the source version so a browser can retry persistence later.
        logger.warn('[media] Waveform cache unavailable; falling back to browser analysis');
        return { waveformSourceRevision: waveformSourceRevisionValue };
    }
}

export class WaveformCacheConflict extends Error {}

/** Read or silently fill the cache of the course's CURRENT media, never an arbitrary object. */
export async function syncExerciseWaveform(
    exerciseId: number,
    mediaUrl: string,
    input?: { sourceRevision: string; waveform: unknown },
): Promise<MediaWaveformState> {
    if (input && (!/^[a-f0-9]{64}$/.test(input.sourceRevision) || !validWaveformPeaks(input.waveform))) {
        throw new TypeError('Invalid waveform summary');
    }
    return sequelize.transaction(async (transaction) => {
        // Serialize against course-media edits. Any upload finishing after a replacement
        // must match both the current object and its ETag before it can enter the cache.
        const [row] = await sequelize.query<{ audio_url: string }>(
            'select audio_url from exercises where id=:exerciseId for update',
            { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction },
        );
        const objectName = row && getManagedMediaObjectName(row.audio_url);
        if (!objectName || objectName !== getManagedMediaObjectName(mediaUrl)) {
            throw new WaveformCacheConflict('Course media changed');
        }
        const stat = await statMediaObject(objectName);
        const revision = waveformSourceRevision(objectName, stat.etag);
        if (input) {
            if (input.sourceRevision !== revision) throw new WaveformCacheConflict('Media bytes changed');
            const waveform = courseWaveform(input.waveform as Parameters<typeof courseWaveform>[0], revision);
            // Unique (object_name, source_etag) makes repeated/concurrent fills idempotent.
            // Older ETags remain unreachable through current-media reads. Updating a row
            // also repairs malformed legacy summaries without any runtime schema changes.
            await sequelize.query(`insert into media_analyses
                (object_name, source_etag, media_revision, analysis_json, waveform_json)
                values (:objectName, :etag, :revision, :analysis, :waveform)
                on duplicate key update media_revision=values(media_revision),
                analysis_json=values(analysis_json), waveform_json=values(waveform_json)`, {
                replacements: {
                    objectName, etag: stat.etag, revision,
                    analysis: JSON.stringify({ format: 'browser-waveform-v1', sampleRate: 8000, channel: 0, bucketDurationUs: 10000 }),
                    waveform: JSON.stringify(waveform),
                }, transaction,
            });
            return { waveformSourceRevision: revision };
        }
        const [cached] = await sequelize.query<{ waveform_json: unknown }>(
            'select waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1',
            { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT, transaction },
        );
        return { waveformSourceRevision: revision, waveform: cached ? parseCourseWaveform(cached.waveform_json) : undefined };
    });
}
