import { QueryTypes } from 'sequelize';
import { Logger } from '../lib/logger';
import { sequelize } from './db-config-mysql';

const logger = new Logger(__filename);

export async function doRawQuery<T = any>({
    query,
    params = [],
}: {
    query: string;
    params?: any[] | Record<string, any>;
}): Promise<T[]> {
    try {
        return (await sequelize.query(query.replace(/\s+/g, ' '), {
            replacements: params,
            type: QueryTypes.SELECT,
            raw: true,
        })) as T[];
    } catch (e) {
        logger.error(`[doRawQuery] query:[${query}] params:[${JSON.stringify(params)}] ${e}`);
        throw e;
    }
}

export async function doRawUpdate(query: string, params: any[] | Record<string, any> = []): Promise<any> {
    try {
        return await sequelize.query(query.replace(/\s+/g, ' '), {
            replacements: params,
            type: QueryTypes.UPDATE,
            raw: true,
        });
    } catch (e) {
        logger.error(`[doRawUpdate] ${e}`);
        throw e;
    }
}

export async function doRawInsert(query: string, params: any[] | Record<string, any> = []): Promise<any> {
    try {
        return await sequelize.query(query.replace(/\s+/g, ' '), {
            replacements: params,
            type: QueryTypes.INSERT,
            raw: true,
        });
    } catch (e) {
        logger.error(`[doRawInsert] ${e}`);
        throw e;
    }
}

export async function checkDatabase() {
    return doRawQuery<{ ok: number }>({ query: 'select 1 as ok' });
}
