import crypto from 'node:crypto';
import { Op } from 'sequelize';
import type {
    AdminOpenContentApiKey,
    CreateOpenContentApiKeyResponse,
    UpdateOpenContentApiKeyRequest,
} from '../../domain';
import { AdminOpenContentApiKeyModel } from '../../models/schema/AdminOpenContentApiKeyDB';

const hashApiKey = (apiKey: string) =>
    crypto.createHash('sha256').update(apiKey).digest('hex');

const mapApiKey = (row: any): AdminOpenContentApiKey => ({
    id: Number(row.id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    lastUsedAt: row.last_used_at
        ? new Date(row.last_used_at).toISOString()
        : null,
});

const parseFutureExpiry = (value: string | null | undefined) => {
    if (value === null || value === undefined) {
        return value === null ? null : undefined;
    }

    const expiresAt = new Date(value);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new Error('到期时间必须晚于当前时间');
    }
    return expiresAt;
};

export async function listOpenContentApiKeys(): Promise<AdminOpenContentApiKey[]> {
    const rows = await AdminOpenContentApiKeyModel.findAll({
        order: [['created_at', 'DESC']],
        raw: true,
    });
    return rows.map(mapApiKey);
}

export async function createOpenContentApiKey({
    name,
    expiresAt,
    createdByAdminId,
}: {
    name: string;
    expiresAt?: string | null;
    createdByAdminId: number;
}): Promise<CreateOpenContentApiKeyResponse> {
    const normalizedName = name.trim();
    if (!normalizedName) {
        throw new Error('请填写 API Key 名称');
    }

    const parsedExpiry = parseFutureExpiry(expiresAt);
    // 32 字节随机数经 base64url 编码后不可预测，前缀仅用于后台人工辨认。
    const apiKey = `dltak_${crypto.randomBytes(32).toString('base64url')}`;
    const created = await AdminOpenContentApiKeyModel.create({
        name: normalizedName,
        key_prefix: `${apiKey.slice(0, 16)}...`,
        key_hash: hashApiKey(apiKey),
        created_by_admin_id: createdByAdminId,
        expires_at: parsedExpiry ?? null,
        last_used_at: null,
    });

    return {
        apiKey: mapApiKey(created.get({ plain: true })),
        // 这份明文不进入列表、日志或任何持久化存储，只在本次创建响应返回。
        secret: apiKey,
    };
}

export async function updateOpenContentApiKey(
    id: number,
    input: UpdateOpenContentApiKeyRequest,
): Promise<AdminOpenContentApiKey | null> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) {
        const normalizedName = input.name.trim();
        if (!normalizedName) {
            throw new Error('请填写 API Key 名称');
        }
        payload.name = normalizedName;
    }
    if (input.expiresAt !== undefined) {
        payload.expires_at = parseFutureExpiry(input.expiresAt);
    }

    const key = await AdminOpenContentApiKeyModel.findByPk(id);
    if (!key) {
        return null;
    }
    if (Object.keys(payload).length > 0) {
        await key.update(payload);
    }
    return mapApiKey(key.get({ plain: true }));
}

export async function deleteOpenContentApiKey(id: number) {
    return (await AdminOpenContentApiKeyModel.destroy({ where: { id } })) > 0;
}

/** 返回有效记录并记下最后使用时间；调用方从不接触或记录原始 Key。 */
export async function authenticateOpenContentApiKey(apiKey: string) {
    const keyHash = hashApiKey(apiKey);
    const key = await AdminOpenContentApiKeyModel.findOne({
        where: {
            key_hash: keyHash,
            [Op.or]: [
                { expires_at: null },
                { expires_at: { [Op.gt]: new Date() } },
            ],
        },
    });
    if (!key) {
        return null;
    }

    await key.update({ last_used_at: new Date() });
    return { id: Number(key.id) };
}
