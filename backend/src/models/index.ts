import { adminListPerformance, measureAdminListStep } from '../lib/admin-list-performance';
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
        const trace = adminListPerformance.getStore();
        if (trace) {
            trace.counts.sql = (trace.counts.sql ?? 0) + 1;
            // SQL 耗时包含连接池等待；记录查询开始时的池占用峰值供后续交叉判断。
            const pool = (sequelize.connectionManager as any).pool;
            for (const [field, value] of [['poolUsingPeak', pool?.using], ['poolWaitingPeak', pool?.waiting]] as const) {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    trace.counts[field] = Math.max(trace.counts[field] ?? 0, value);
                }
            }
        }
        return (await measureAdminListStep('sql', () => sequelize.query(query.replace(/\s+/g, ' '), {
            replacements: params,
            type: QueryTypes.SELECT,
            raw: true,
        }))) as T[];
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
