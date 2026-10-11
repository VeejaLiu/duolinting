import { randomUUID } from 'node:crypto';
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../models/db-config-mysql';
import { CategoryModel } from '../../models/schema/CategoryDB';
import { CategoryGroupModel } from '../../models/schema/CategoryGroupDB';
import { ExerciseModel } from '../../models/schema/ExerciseDB';
import { buildStoredMediaUrl, deleteMediaObject, isMissingObjectError, promoteImportFile, signImportUpload, statMediaObject } from '../media/media-service';
import { ContentImport, ImportToken } from './models';
import { hash, ImportError, type ImportFile, type ImportRequest, parseImportRequest, sourceIdentity } from './contracts';
import { importActor, type ImportActor } from './tokens';
import { validateImport } from './validation';

const DAY = 86400000;
const filesOf = (row: ContentImport) => row.get('files_json') as (ImportFile & { objectName: string })[];
const expiry = (row: ContentImport) => new Date(row.get('expires_at') as string).getTime();
function assertCategory(actor: ImportActor, categoryId: number) {
    if (!actor.allCategories && !actor.categoryIds.includes(categoryId)) throw new ImportError('CATEGORY_FORBIDDEN', 'Token cannot import into this series', 403);
}
async function owned(id: number, actor: ImportActor) {
    const row = await ContentImport.findOne({ where: { id, token_id: actor.id } });
    if (!row) throw new ImportError('IMPORT_NOT_FOUND', 'Import task not found', 404);
    return row;
}
export async function importCatalog(actor: ImportActor) {
    const categories = await CategoryModel.findAll({ where: actor.allCategories ? {} : { id: actor.categoryIds }, attributes: ['id', 'group_id', 'name', 'sort_order'], order: [['sort_order', 'ASC']], raw: true });
    const groups = await CategoryGroupModel.findAll({ where: { id: [...new Set(categories.map(category => category.group_id))] }, attributes: ['id', 'name', 'sort_order'], order: [['sort_order', 'ASC']], raw: true });
    return { categoryGroups: groups.map(group => ({ id: Number(group.id), name: group.name })), categories: categories.map(category => ({ id: Number(category.id), groupId: Number(category.group_id), name: category.name, sortOrder: category.sort_order })) };
}
export async function importView(row: ContentImport, withUploads = false) {
    const data = row.get({ plain: true });
    const expired = data.status !== 'ready' && data.status !== 'validating' && expiry(row) <= Date.now();
    const status = expired ? 'expired' : data.status;
    const result: Record<string, any> = { id: Number(data.id), status, expiresAt: data.expires_at, exerciseId: data.exercise_id ? Number(data.exercise_id) : null, createdAs: data.exercise_id ? 'draft' : null, adminPath: data.exercise_id ? `/importer/${data.exercise_id}` : null, validation: data.result_json ? { media: data.result_json.media, subtitle: data.result_json.subtitle, warnings: data.result_json.warnings } : null, error: expired ? { code: 'IMPORT_EXPIRED', message: 'Create a new import with a new idempotency key', retryable: false } : data.error_json };
    if (withUploads && ['awaiting_upload', 'failed'].includes(status)) {
        const ttl = Math.max(1, Math.min(600, Math.floor((expiry(row) - Date.now()) / 1000)));
        result.uploads = [];
        for (const file of filesOf(row)) result.uploads.push({ role: file.role, method: 'PUT', url: await signImportUpload(file.objectName, ttl), headers: { 'Content-Type': file.contentType }, expiresInSeconds: ttl });
    }
    return result;
}
export async function createImport(actor: ImportActor, idempotencyKey: string, input: unknown) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw new ImportError('IDEMPOTENCY_KEY_REQUIRED', 'Provide an ASCII Idempotency-Key header (1–128 characters)');
    const request = parseImportRequest(input);
    assertCategory(actor, request.categoryId);
    const requestHash = hash(JSON.stringify(request));
    const prior = await ContentImport.findOne({ where: { token_id: actor.id, idempotency_key: idempotencyKey } });
    if (prior) {
        if (prior.get('request_hash') !== requestHash) throw new ImportError('IDEMPOTENCY_CONFLICT', 'Idempotency key already used for different metadata', 409);
        return importView(prior, true);
    }
    if (!await CategoryModel.findByPk(request.categoryId)) throw new ImportError('CATEGORY_NOT_FOUND', 'Learning series not found', 404);
    const identity = sourceIdentity(request.sourceUrl).identity;
    // Also recognize legacy manually created courses. Canonicalization catches youtu.be/watch/shorts aliases.
    const legacy = await ExerciseModel.findAll({ where: { source_url: { [Op.ne]: null } }, attributes: ['id', 'source_url'], raw: true });
    if (legacy.some(course => { try { return sourceIdentity(course.source_url!).identity === identity; } catch { return false; } })) throw new ImportError('SOURCE_ALREADY_EXISTS', 'This source already has a course; imports cannot overwrite it', 409);
    const sourceHash = hash(identity);
    const existing = await ContentImport.findOne({ where: { source_hash: sourceHash } });
    if (existing) {
        // A failed/expired task reserves its source until its lifetime ends. Ready tasks reserve it permanently.
        if (existing.get('status') === 'ready' || expiry(existing) > Date.now() || (existing.get('status') === 'validating' && new Date(existing.get('lease_until') as string).getTime() > Date.now())) throw new ImportError('SOURCE_ALREADY_IMPORTED', 'This source has an existing import task', 409);
        // Preserve the expired task for audit/idempotency, while freeing its source reservation atomically.
        await ContentImport.update({ source_hash: hash(`expired:${existing.id}`), status: 'expired' }, { where: { id: existing.id, source_hash: sourceHash, expires_at: { [Op.lte]: new Date() }, status: { [Op.ne]: 'ready' } } });
    }
    const prefix = `imports/staging/${randomUUID()}`;
    try {
        const row = await ContentImport.create({ token_id: actor.id, idempotency_key: idempotencyKey, request_hash: requestHash, source_hash: sourceHash, request_json: request, files_json: request.files.map(file => ({ ...file, objectName: `${prefix}/${file.role}` })), artifacts_json: [], status: 'awaiting_upload', expires_at: new Date(Date.now() + DAY) });
        return importView(row, true);
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            const winner = await ContentImport.findOne({ where: { token_id: actor.id, idempotency_key: idempotencyKey } });
            if (winner && winner.get('request_hash') === requestHash) return importView(winner, true);
            throw new ImportError('IMPORT_CONFLICT', 'Source or idempotency key already reserved', 409);
        }
        throw error;
    }
}
export async function getImport(id: number, actor: ImportActor) { return importView(await owned(id, actor)); }
export async function renewUploads(id: number, actor: ImportActor) {
    const row = await owned(id, actor);
    if (row.get('status') === 'validating') throw new ImportError('IMPORT_BUSY', 'Validation in progress', 409, true);
    return importView(row, true);
}
export async function processImport(id: number, actor: ImportActor) {
    const attempt = randomUUID();
    const row = await sequelize.transaction(async transaction => {
        const task = await ContentImport.findOne({ where: { id, token_id: actor.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!task) throw new ImportError('IMPORT_NOT_FOUND', 'Import task not found', 404);
        assertCategory(actor, (task.get('request_json') as ImportRequest).categoryId);
        if (task.get('status') === 'ready') return task;
        if (task.get('status') === 'validating' && new Date(task.get('lease_until') as string).getTime() > Date.now()) throw new ImportError('IMPORT_BUSY', 'Validation in progress; poll the task', 409, true);
        if (expiry(task) <= Date.now()) throw new ImportError('IMPORT_EXPIRED', 'Task expired; create a new import', 410);
        const keys = filesOf(task).map(file => `imports/accepted/${id}/${attempt}/${file.role}`);
        // Persist every promotion before doing I/O so cleanup can recover files after a process crash.
        await task.update({ status: 'validating', attempt_id: attempt, lease_until: new Date(Date.now() + 10 * 60000), error_json: null, artifacts_json: [...task.get('artifacts_json') as string[], ...keys] }, { transaction });
        return task;
    });
    if (row.get('status') === 'ready') return importView(row);
    const request = row.get('request_json') as ImportRequest;
    const keys: Record<string, string> = {};
    let committed = false;
    try {
        for (const file of filesOf(row)) {
            // Reject oversized staging files before an expensive storage-side copy; recheck the accepted copy below.
            const staged = await statMediaObject(file.objectName);
            if (staged.size !== file.sizeBytes) throw new ImportError('FILE_SIZE_MISMATCH', `Wrong file size for ${file.role}`, 422, true);
            const destination = `imports/accepted/${id}/${attempt}/${file.role}`;
            keys[file.role] = destination;
            await promoteImportFile(file.objectName, destination);
        }
        const checked = await validateImport(request, keys);
        await sequelize.transaction(async transaction => {
            const task = await ContentImport.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!task || task.get('attempt_id') !== attempt || task.get('status') !== 'validating' || expiry(task) <= Date.now()) throw new ImportError('IMPORT_LEASE_LOST', 'Task expired or another validation attempt took over', 409, true);
            // Revocation during a long upload/validation must also prevent the final database write.
            const token = await ImportToken.findByPk(actor.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!token || token.get('revoked_at') || new Date(token.get('expires_at') as string).getTime() <= Date.now()) throw new ImportError('IMPORT_TOKEN_REVOKED', 'Import token is no longer valid', 401);
            assertCategory(importActor(token), request.categoryId);
            if (!await CategoryModel.findByPk(request.categoryId, { transaction, lock: transaction.LOCK.SHARE })) throw new ImportError('CATEGORY_NOT_FOUND', 'Learning series no longer exists', 404);
            const seconds = Math.round(checked.media.durationSeconds);
            // This path is creation-only. The literal draft is owned by the server; no caller-controlled status or ID.
            const exercise = await ExerciseModel.create({ category_id: request.categoryId, title: request.title, source: request.source.provider, source_url: request.sourceUrl, difficulty: request.difficulty, duration_label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, media_type: request.mediaType, audio_object_name: keys.media, audio_url: buildStoredMediaUrl(keys.media), cover_image_url: keys.cover ? buildStoredMediaUrl(keys.cover) : null, summary: request.summary, localizations_json: {}, transcript_json: checked.lines, status: 'draft', sort_order: request.sortOrder } as any, { transaction });
            await task.update({ status: 'ready', exercise_id: exercise.id, lease_until: null, result_json: { media: checked.media, subtitle: checked.subtitle, warnings: checked.warnings, acceptedKeys: keys }, error_json: null }, { transaction });
        });
        committed = true;
        return getImport(id, actor);
    } catch (error) {
        // Once committed, a failed response/read must never delete accepted course objects.
        if (committed) throw error;
        const failure = error instanceof ImportError ? error : isMissingObjectError(error) ? new ImportError('UPLOAD_INCOMPLETE', 'One or more uploaded files are missing', 422, true) : new ImportError('IMPORT_PROCESSING_FAILED', 'Storage or validation failed; retry completion', 503, true);
        await ContentImport.update({ status: 'failed', lease_until: null, error_json: { code: failure.code, message: failure.message, retryable: failure.retryable } }, { where: { id, attempt_id: attempt, status: 'validating' } });
        await Promise.allSettled(Object.values(keys).map(deleteMediaObject));
        throw failure;
    }
}
/** Maintenance runs after all signed PUT URLs and validation leases expire; accepted course media is retained. */
export async function cleanupImports() {
    const rows = await ContentImport.findAll({ where: { expires_at: { [Op.lt]: new Date(Date.now() - 10 * 60000) }, cleaned_at: null }, limit: 100 });
    let cleaned = 0;
    for (const row of rows) {
        if (row.get('status') === 'validating' && new Date(row.get('lease_until') as string).getTime() > Date.now()) continue;
        const accepted = row.get('status') === 'ready' ? Object.values((row.get('result_json') as any)?.acceptedKeys ?? {}) : [];
        const obsolete = [...filesOf(row).map(file => file.objectName), ...row.get('artifacts_json') as string[]].filter(key => !accepted.includes(key));
        await Promise.all(obsolete.map(deleteMediaObject));
        await row.update({ cleaned_at: new Date(), ...(row.get('status') === 'ready' ? {} : { status: 'expired' }) });
        cleaned++;
    }
    return { cleaned };
}

/** Completion only queues durable work; the caller can disconnect without losing the import. */
export async function completeImport(id: number, actor: ImportActor) {
    const row = await sequelize.transaction(async transaction => {
        const task = await ContentImport.findOne({ where: { id, token_id: actor.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!task) throw new ImportError('IMPORT_NOT_FOUND', 'Import task not found', 404);
        assertCategory(actor, (task.get('request_json') as ImportRequest).categoryId);
        if (task.get('status') === 'ready') return task;
        if (expiry(task) <= Date.now()) throw new ImportError('IMPORT_EXPIRED', 'Task expired; create a new import', 410);
        if (task.get('status') !== 'validating') await task.update({ status: 'queued', error_json: null }, { transaction });
        return task;
    });
    return importView(row);
}
