import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import type { RequestHandler } from 'express';
import { CategoryModel } from '../../models/schema/CategoryDB';
import { ImportToken } from './models';
import { hash, ImportError, record } from './contracts';

export type ImportActor = { id: number; allCategories: boolean; categoryIds: number[] };
export function importActor(row: ImportToken): ImportActor {
    return { id: Number(row.id), allCategories: row.get('all_categories') === true, categoryIds: row.get('category_ids_json') as number[] };
}
export function tokenView(row: ImportToken) {
    const data = row.get({ plain: true });
    return { id: Number(data.id), name: data.name, keyPrefix: data.key_prefix, allCategories: data.all_categories === true, categoryIds: data.category_ids_json, expiresAt: data.expires_at, revokedAt: data.revoked_at, lastUsedAt: data.last_used_at, createdAt: data.created_at };
}
export async function issueToken(value: unknown, adminId: number) {
    const body = record(value, ['name', 'categoryIds', 'allCategories', 'expiresAt']);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) throw new ImportError('INVALID_REQUEST', 'Invalid token name');
    if (body.allCategories !== undefined && typeof body.allCategories !== 'boolean') throw new ImportError('INVALID_REQUEST', 'allCategories must be boolean');
    if (body.categoryIds !== undefined && !Array.isArray(body.categoryIds)) throw new ImportError('INVALID_REQUEST', 'categoryIds must be an array');
    // 新建凭据时，未选择系列默认全部；授权结果仍显式存储，不重新解释旧凭据的空白名单。
    const allCategories = body.allCategories ?? ((body.categoryIds?.length ?? 0) === 0);
    let categoryIds: number[] = [];
    if (allCategories) {
        // 保留显式 allCategories 参数的兼容性；不能同时指定全部权限和非空白名单。
        if (body.categoryIds !== undefined && (!Array.isArray(body.categoryIds) || body.categoryIds.length > 0)) throw new ImportError('INVALID_REQUEST', 'Do not combine allCategories with a series list');
    } else {
        if (!Array.isArray(body.categoryIds) || !body.categoryIds.length || body.categoryIds.length > 100 || body.categoryIds.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1)) throw new ImportError('INVALID_REQUEST', 'Select 1–100 series IDs');
        categoryIds = [...new Set<number>(body.categoryIds)].sort((a, b) => a - b);
        if (await CategoryModel.count({ where: { id: categoryIds } }) !== categoryIds.length) throw new ImportError('CATEGORY_NOT_FOUND', 'Unknown learning series');
    }
    const expiry = body.expiresAt === undefined ? new Date(Date.now() + 90 * 86400000) : typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : new Date(NaN);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 366 * 86400000) throw new ImportError('INVALID_REQUEST', 'Token expiry must be in the next 366 days');
    const secret = `dltimp_${randomBytes(32).toString('base64url')}`;
    const row = await ImportToken.create({ name: body.name.trim(), key_prefix: `${secret.slice(0, 16)}...`, key_hash: hash(secret), category_ids_json: categoryIds, all_categories: allCategories, created_by_admin_id: adminId, expires_at: expiry });
    return { token: tokenView(row), secret };
}
export const requireImportToken: RequestHandler = async (req, res, next) => {
    const match = /^Bearer (dltimp_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    const row = match ? await ImportToken.findOne({ where: { key_hash: hash(match[1]), revoked_at: null, expires_at: { [Op.gt]: new Date() } } }) : null;
    if (!row) { res.status(401).send({ code: 'IMPORT_TOKEN_REQUIRED', message: 'A valid draft-import token is required', retryable: false }); return; }
    await row.update({ last_used_at: new Date() });
    res.locals.importActor = importActor(row);
    res.set('Cache-Control', 'no-store');
    next();
};
export async function revokeToken(id: number) {
    const row = await ImportToken.findByPk(id);
    if (!row) throw new ImportError('TOKEN_NOT_FOUND', 'Token not found', 404);
    await row.update({ revoked_at: new Date() });
}
