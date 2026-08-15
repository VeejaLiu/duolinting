import * as dotenv from 'dotenv';
import * as path from 'path';
import { getOsEnvOptional, normalizePort, toBool, toNumber } from './lib/env';

dotenv.config({
    path: path.join(process.cwd(), `.env${process.env.NODE_ENV === 'test' ? '.test' : ''}`),
});

const optional = (key: string, fallback: string) => getOsEnvOptional(key) ?? fallback;
const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = optional('SECRET_JWT', optional('AUTH_TOKEN_SECRET', 'dev-auth-token-secret')).trim();
const localUploadThrottleKbps = Number(getOsEnvOptional('LOCAL_UPLOAD_THROTTLE_KBPS') ?? '0');
const localUploadConfirmationDelayMs = Number(getOsEnvOptional('LOCAL_UPLOAD_CONFIRMATION_DELAY_MS') ?? '0');

// 这两个开关仅服务于本机开发时观察前端上传反馈。无效值与负数都回退为关闭，
// 路由层还会验证请求来自环回地址，避免 development 配置被远程访问时意外限速。
const toLocalUploadTestingNumber = (value: number) =>
    Number.isFinite(value) && value > 0 ? value : 0;

// 生产环境不能带着公开的开发密钥或空密钥启动，否则所有学习者 JWT 都失去可信根。
if (nodeEnv === 'production' && (jwtSecret.length < 32 || jwtSecret === 'dev-auth-token-secret')) {
    throw new Error('SECRET_JWT must be a non-default secret of at least 32 characters in production.');
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
        host: optional('APP_HOST', nodeEnv === 'development' ? '0.0.0.0' : '127.0.0.1'),
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
    minio: {
        endpoint: optional('MINIO_ENDPOINT', 'localhost'),
        port: toNumber(optional('MINIO_PORT', '9000')),
        useSSL: toBool(optional('MINIO_USE_SSL', 'false')),
        accessKey: optional('MINIO_ACCESS_KEY', 'minioadmin'),
        secretKey: optional('MINIO_SECRET_KEY', 'minioadmin'),
        bucket: optional('MINIO_BUCKET', 'duolinting-media'),
        region: optional('MINIO_REGION', 'us-east-1'),
        publicBaseUrl: optional('MINIO_PUBLIC_BASE_URL', 'http://127.0.0.1:9000'),
    },
    resend: {
        API_KEY: getOsEnvOptional('RESEND_API_KEY') ?? '',
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
