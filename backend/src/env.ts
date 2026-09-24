import * as dotenv from 'dotenv';
import * as path from 'path';
import { getOsEnvOptional, normalizePort, toBool, toNumber } from './lib/env';

dotenv.config({
    path: path.join(
        process.cwd(),
        `.env${process.env.NODE_ENV === 'test' ? '.test' : ''}`,
    ),
});

const optional = (key: string, fallback: string) =>
    getOsEnvOptional(key) ?? fallback;
// Compose passes optional override variables as empty strings when they are omitted.
// Storage overrides treat that as "not configured" so existing MINIO_* fallbacks remain valid.
const optionalNonEmpty = (key: string, fallback: string) => {
    const value = getOsEnvOptional(key);
    return value && value.trim() ? value : fallback;
};
const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = optional(
    'SECRET_JWT',
    optional('AUTH_TOKEN_SECRET', 'dev-auth-token-secret'),
).trim();
const localUploadThrottleKbps = Number(
    getOsEnvOptional('LOCAL_UPLOAD_THROTTLE_KBPS') ?? '0',
);
const localUploadConfirmationDelayMs = Number(
    getOsEnvOptional('LOCAL_UPLOAD_CONFIRMATION_DELAY_MS') ?? '0',
);
const mediaStorageProvider = optional(
    'MEDIA_STORAGE_PROVIDER',
    'minio',
).trim().toLowerCase();

if (!['minio', 'cos', 'r2'].includes(mediaStorageProvider)) {
    throw new Error(
        'MEDIA_STORAGE_PROVIDER must be one of: minio, cos, r2.',
    );
}

// 媒体 CDN 地址可以带一个固定路径前缀（例如 https://learner.example.com/media）。
// 只接受无凭据、无 query/hash 的 HTTP(S) URL，避免把错误的 URL 配置写进课程响应。
const normalizeOptionalPublicUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    const parsed = new URL(trimmed);
    if (
        (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error(
            'MEDIA_PUBLIC_BASE_URL must be a plain HTTP(S) URL without credentials, query, or hash.',
        );
    }

    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
};

const mediaPublicBaseUrl = normalizeOptionalPublicUrl(
    optional('MEDIA_PUBLIC_BASE_URL', ''),
);
const mediaRequireAuth = toBool(optional('MEDIA_REQUIRE_AUTH', 'false'));
const mediaAuthMode = optional(
    'MEDIA_AUTH_MODE',
    mediaPublicBaseUrl ? 'tencent-type-a' : 'backend-token',
).trim().toLowerCase();
const mediaAuthKey = optional('MEDIA_AUTH_KEY', '').trim();
const mediaAuthTtlSeconds = Number(optional('MEDIA_AUTH_TTL_SECONDS', '3600'));

if (!['tencent-type-a', 'backend-token'].includes(mediaAuthMode)) {
    throw new Error(
        'MEDIA_AUTH_MODE must be one of: tencent-type-a, backend-token.',
    );
}

if (
    !Number.isInteger(mediaAuthTtlSeconds) ||
    mediaAuthTtlSeconds < 60 ||
    mediaAuthTtlSeconds > 86400
) {
    throw new Error(
        'MEDIA_AUTH_TTL_SECONDS must be an integer between 60 and 86400.',
    );
}

if (mediaRequireAuth) {
    if (mediaAuthMode === 'tencent-type-a') {
        if (!mediaPublicBaseUrl) {
            throw new Error(
                'MEDIA_AUTH_MODE=tencent-type-a requires MEDIA_PUBLIC_BASE_URL.',
            );
        }
        if (!/^[A-Za-z0-9]{6,32}$/.test(mediaAuthKey)) {
            throw new Error(
                'MEDIA_AUTH_KEY must contain 6-32 letters or digits for Tencent CDN Type A authentication.',
            );
        }
    } else if (mediaAuthKey.length < 32) {
        throw new Error(
            'MEDIA_AUTH_KEY must contain at least 32 characters for backend-token authentication.',
        );
    }
}

// 这两个开关仅服务于本机开发时观察前端上传反馈。无效值与负数都回退为关闭，
// 路由层还会验证请求来自环回地址，避免 development 配置被远程访问时意外限速。
const toLocalUploadTestingNumber = (value: number) =>
    Number.isFinite(value) && value > 0 ? value : 0;

// 生产环境不能带着公开的开发密钥或空密钥启动，否则所有学习者 JWT 都失去可信根。
if (
    nodeEnv === 'production' &&
    (jwtSecret.length < 32 || jwtSecret === 'dev-auth-token-secret')
) {
    throw new Error(
        'SECRET_JWT must be a non-default secret of at least 32 characters in production.',
    );
}

export const env = {
    node: nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    isDevelopment: nodeEnv === 'development',
    app: {
        name: optional('APP_NAME', '多邻听后端'),
        version: '0.1.0',
        description: '多邻听统一后端服务',
        host: optional(
            'APP_HOST',
            nodeEnv === 'development' ? '0.0.0.0' : '127.0.0.1',
        ),
        schema: optional('APP_SCHEMA', 'http'),
        routePrefix: optional('APP_ROUTE_PREFIX', '/api'),
        port: normalizePort(process.env.PORT || optional('APP_PORT', '8100')),
        banner: toBool(optional('APP_BANNER', 'true')),
        env: optional('APP_ENV', 'development'),
        backend_url: optional('APP_BACKEND_URL', 'http://127.0.0.1:8100'),
    },
    cors: {
        origins: optional(
            'CORS_ORIGINS',
            'http://127.0.0.1:8101,http://localhost:8101,http://127.0.0.1:8102,http://localhost:8102',
        ),
    },
    log: {
        level: optional('LOG_LEVEL', 'info'),
        json: toBool(optional('LOG_JSON', 'false')),
        output: optional('LOG_OUTPUT', 'dev'),
    },
    monitor: {
        enabled: toBool(optional('MONITOR_ENABLED', 'false')),
        route: optional('MONITOR_ROUTE', '/status'),
        username: optional('MONITOR_USERNAME', 'admin'),
        password: optional('MONITOR_PASSWORD', 'admin'),
    },
    secret: {
        jwt: jwtSecret,
    },
    mysql: {
        host: optional('MYSQL_HOST', '127.0.0.1'),
        port: toNumber(optional('MYSQL_PORT', '3306')),
        database: optional('MYSQL_DATABASE', 'duolinting_app_dev'),
        username: optional('MYSQL_USERNAME', optional('MYSQL_USER', 'root')),
        password: getOsEnvOptional('MYSQL_PASSWORD') ?? '',
        logging: toBool(optional('MYSQL_LOGGING', 'false')),
    },
    media: {
        // 留空时保持历史 /api/v1/media/objects?key=... 路径；配置后课程 API
        // 返回 CDN 直连地址，媒体流不再经过 Express。
        publicBaseUrl: mediaPublicBaseUrl,
        access: {
            // requireAuth 关闭时保留本地开发/旧部署行为。生产开启后，只有已认证
            // API 响应才会携带短时媒体地址，猜测对象键不能直接读取媒体。
            requireAuth: mediaRequireAuth,
            mode: mediaAuthMode as 'tencent-type-a' | 'backend-token',
            key: mediaAuthKey,
            ttlSeconds: mediaAuthTtlSeconds,
        },
        storage: {
            // MinIO、腾讯 COS 和 Cloudflare R2 都通过 S3 兼容接口访问。
            // 新变量优先；MINIO_* 回退保证本地开发和旧生产配置无需同步改名。
            provider: mediaStorageProvider as 'minio' | 'cos' | 'r2',
            endpoint: optionalNonEmpty(
                'MEDIA_STORAGE_ENDPOINT',
                optional('MINIO_ENDPOINT', 'localhost'),
            ),
            port: toNumber(
                optionalNonEmpty(
                    'MEDIA_STORAGE_PORT',
                    optional('MINIO_PORT', '9000'),
                ),
            ),
            useSSL: toBool(
                optionalNonEmpty(
                    'MEDIA_STORAGE_USE_SSL',
                    optional('MINIO_USE_SSL', 'false'),
                ),
            ),
            accessKey: optionalNonEmpty(
                'MEDIA_STORAGE_ACCESS_KEY',
                optional('MINIO_ACCESS_KEY', 'minioadmin'),
            ),
            secretKey: optionalNonEmpty(
                'MEDIA_STORAGE_SECRET_KEY',
                optional('MINIO_SECRET_KEY', 'minioadmin'),
            ),
            bucket: optionalNonEmpty(
                'MEDIA_STORAGE_BUCKET',
                optional('MINIO_BUCKET', 'duolinting-media'),
            ),
            region: optionalNonEmpty(
                'MEDIA_STORAGE_REGION',
                optional('MINIO_REGION', 'us-east-1'),
            ),
            // MinIO 默认 path-style；COS/R2 使用各自的虚拟主机式 S3 endpoint。
            pathStyle: toBool(
                optionalNonEmpty(
                    'MEDIA_STORAGE_PATH_STYLE',
                    mediaStorageProvider === 'minio' ? 'true' : 'false',
                ),
            ),
            // 旧 MinIO CDN 路径包含 bucket；COS/R2 自定义域名直接映射对象键。
            publicUrlIncludesBucket: toBool(
                optionalNonEmpty(
                    'MEDIA_PUBLIC_URL_INCLUDES_BUCKET',
                    mediaStorageProvider === 'minio' ? 'true' : 'false',
                ),
            ),
        },
    },
    resend: {
        API_KEY: getOsEnvOptional('RESEND_API_KEY') ?? '',
        FROM_EMAIL: getOsEnvOptional('RESEND_FROM_EMAIL') ?? '',
        FROM_NAME: optional('RESEND_FROM_NAME', 'DuolinTing'),
        REPLY_TO: getOsEnvOptional('RESEND_REPLY_TO') ?? '',
    },
    localUploadTesting: {
        // 以 KB/s 配置而不是 bytes，便于手动调节；生产环境始终强制为 0。
        throttleBytesPerSecond:
            nodeEnv === 'development'
                ? toLocalUploadTestingNumber(localUploadThrottleKbps) * 1024
                : 0,
        // 在服务端已经写入媒体后延迟响应，用于验证前端“等待服务器确认”状态。
        confirmationDelayMs:
            nodeEnv === 'development'
                ? toLocalUploadTestingNumber(localUploadConfirmationDelayMs)
                : 0,
    },
};
