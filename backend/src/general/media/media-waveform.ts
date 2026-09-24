import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { getManagedMediaObjectName, statMediaObject } from '../media/media-service';
import type { CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;

// Backend only reads waveforms produced by an external or precomputed analysis job.
// It never downloads, decodes, encodes, or transforms media in the request process.
export async function cachedMediaWaveform(url: string): Promise<CourseWaveform | undefined> {
    const objectName = getManagedMediaObjectName(url); if (!objectName) return undefined;
    const stat = await statMediaObject(objectName).catch(() => null); if (!stat) return undefined;
    const [row] = await sequelize.query<{ waveform_json: unknown }>('select waveform_json from media_analyses where object_name=:objectName and source_etag=:etag limit 1', { replacements: { objectName, etag: stat.etag }, type: QueryTypes.SELECT });
    return row ? json<CourseWaveform>(row.waveform_json) : undefined;
}
