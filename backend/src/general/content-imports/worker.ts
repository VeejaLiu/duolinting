import { Op } from 'sequelize';
import { Logger } from '../../lib/logger';
import { ContentImport, ImportToken } from './models';
import { importActor } from './tokens';
import { cleanupImports, processImport } from './service';

const logger = new Logger(__filename);
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;
let lastCleanup = 0;
/** Database leases recover queued/crashed tasks; each process validates at most one media file at a time. */
export function startImportWorker() {
    if (!stopped) return;
    stopped = false;
    const tick = async () => {
        let delay = 5000;
        try {
            const row = await ContentImport.findOne({ where: { expires_at: { [Op.gt]: new Date() }, [Op.or]: [{ status: 'queued' }, { status: 'validating', lease_until: { [Op.lt]: new Date() } }] }, order: [['id', 'ASC']] });
            if (row) {
                const token = await ImportToken.findByPk(Number(row.get('token_id')));
                if (!token || token.get('revoked_at') || new Date(token.get('expires_at') as string).getTime() <= Date.now()) {
                    await ContentImport.update({ status: 'failed', lease_until: null, error_json: { code: 'IMPORT_TOKEN_REVOKED', message: 'Import token is no longer valid', retryable: false } }, { where: { id: row.id, [Op.or]: [{ status: 'queued' }, { status: 'validating', lease_until: { [Op.lt]: new Date() } }] } });
                } else {
                    try { await processImport(Number(row.id), importActor(token)); }
                    catch { /* processImport persists actionable failures; no credential or ffprobe output is logged. */ }
                }
            }
            if (Date.now() - lastCleanup > 3600000) { await cleanupImports(); lastCleanup = Date.now(); }
        } catch {
            delay = 60000;
            logger.warn('[content-imports] Worker unavailable; check database migration and storage configuration');
        } finally {
            if (!stopped) { timer = setTimeout(() => void tick(), delay); timer.unref(); }
        }
    };
    timer = setTimeout(() => void tick(), 5000);
    timer.unref();
}
export function stopImportWorker() { stopped = true; if (timer) clearTimeout(timer); }
