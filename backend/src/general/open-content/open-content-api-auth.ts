import { authenticateOpenContentApiKey } from './open-content-api-key-service';

/**
 * 开放内容接口使用独立 Key，故意不接受后台 Bearer Token，避免管理员会话被当成长期下载凭据。
 * 兼容 X-API-Key 方便通用 CLI；新集成优先使用带产品名的请求头。
 */
export async function requireOpenContentApiKey(req: any, res: any, next: any) {
    const header = req.headers['x-duolinting-api-key'] ?? req.headers['x-api-key'];
    const apiKey = Array.isArray(header) ? header[0] : header;
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return res.status(401).send({ success: false, message: 'Open content API key required' });
    }

    const authenticatedKey = await authenticateOpenContentApiKey(apiKey.trim());
    if (!authenticatedKey) {
        return res.status(401).send({ success: false, message: 'Open content API key is not valid' });
    }

    req.openContentApiKey = authenticatedKey;
    next();
}
