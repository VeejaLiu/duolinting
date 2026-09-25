import { Client } from 'minio';
import {
    createHash,
    createHmac,
    randomBytes,
    randomUUID,
    timingSafeEqual,
} from 'node:crypto';
import sharp from 'sharp';
import { env } from '../../env';
import { Logger } from '../../lib/logger';

const logger = new Logger(__filename);
const storage = env.media.storage;

const objectStorage = new Client({
    endPoint: storage.endpoint,
    port: storage.port,
    useSSL: storage.useSSL,
    accessKey: storage.accessKey,
    secretKey: storage.secretKey,
    region: storage.region,
    pathStyle: storage.pathStyle,
});

const publicReadPolicy = (bucket: string) =>
    JSON.stringify({
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`],
            },
        ],
    });

const extensionByContentType: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-m4a': 'm4a',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
};

export const SUPPORTED_MEDIA_CONTENT_TYPES = new Set(
    Object.keys(extensionByContentType),
);

const buildObjectPrefix = (
    mediaType: 'audio' | 'video' | 'image',
    now = new Date(),
) => {
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${mediaType}/${year}/${month}/${day}`;
};

const buildObjectName = (
    mediaType: 'audio' | 'video' | 'image',
    contentType: string,
) => {
    // 存储键完全不采用用户文件名，避免空格、超长名称、Unicode 和路径字符造成兼容问题。
    // 扩展名仅由可信 MIME 类型映射；未知子类型不加扩展名，Content-Type 仍用于媒体响应。
    const uniqueId = randomUUID().replace(/-/g, '').slice(0, 16);
    const extension = extensionByContentType[contentType.toLowerCase()];
    return `${buildObjectPrefix(mediaType)}/${Date.now()}-${uniqueId}${extension ? `.${extension}` : ''}`;
};

const legacyObjectRoute = '/api/v1/media/objects';

/**
 * 数据库中的媒体引用固定采用这个 API 相对路径，便于内部对象识别、旧数据兼容和
 * 后台替换时清理原对象。它不是实际交给播放器的最终地址。
 */
export const buildStoredMediaUrl = (objectName: string) =>
    `${legacyObjectRoute}?key=${encodeURIComponent(objectName)}`;

/**
 * 把系统管理的对象键解析出来。MinIO 的历史 CDN 路径包含 bucket，COS/R2
 * 自定义域名则直接映射 objectName；只有匹配当前受控入口的 URL 才会被当作
 * 可删除的托管对象。
 */
export const getManagedMediaObjectName = (value: string | null | undefined) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }

    try {
        const parsed = new URL(rawValue, env.app.backend_url);
        if (parsed.pathname === legacyObjectRoute) {
            return parsed.searchParams.get('key') ?? '';
        }

        const legacyPathPrefix = `${legacyObjectRoute}/`;
        if (parsed.pathname.startsWith(legacyPathPrefix)) {
            return decodeURIComponent(
                parsed.pathname.slice(legacyPathPrefix.length),
            );
        }

        if (env.media.publicBaseUrl) {
            const publicBase = new URL(env.media.publicBaseUrl);
            const basePath = publicBase.pathname.replace(/\/$/, '');
            const publicPathPrefix = storage.publicUrlIncludesBucket
                ? `${basePath}/${storage.bucket}/`
                : `${basePath}/`;
            if (
                parsed.origin === publicBase.origin &&
                parsed.pathname.startsWith(publicPathPrefix)
            ) {
                return decodeURIComponent(
                    parsed.pathname.slice(publicPathPrefix.length),
                );
            }
        }
    } catch {
        // 保留非本系统的旧媒体 URL；它们可能是合法的第三方音频或视频地址。
    }

    return '';
};

const buildUnsignedPublicMediaUrl = (objectName: string) => {
    if (!env.media.publicBaseUrl) {
        return buildStoredMediaUrl(objectName);
    }

    const publicObjectPath = storage.publicUrlIncludesBucket
        ? `${storage.bucket}/${objectName}`
        : objectName;
    const encodedPath = publicObjectPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${env.media.publicBaseUrl}/${encodedPath}`;
};

const buildBackendTokenUrl = (objectName: string, now: Date) => {
    // 后端回退地址将过期时间和对象键一起签名。Token 只允许十六进制字符，
    // expires 使用 Unix 秒，便于路由层在不解析会话 JWT 的情况下恒定时间校验。
    const expires = Math.floor(now.getTime() / 1000) + env.media.access.ttlSeconds;
    const token = createHmac('sha256', env.media.access.key)
        .update(`${objectName}\n${expires}`)
        .digest('hex');
    const params = new URLSearchParams({
        key: objectName,
        expires: String(expires),
        mediaToken: token,
    });
    return `${legacyObjectRoute}?${params.toString()}`;
};

const buildTencentTypeAUrl = (objectName: string, now: Date) => {
    const unsignedUrl = new URL(buildUnsignedPublicMediaUrl(objectName));
    const timestamp = Math.floor(now.getTime() / 1000);
    const random = randomBytes(8).toString('hex');
    const uid = '0';
    // 腾讯云 CDN Type A: md5(path-timestamp-rand-uid-key)。path 使用浏览器
    // 实际请求的百分号编码 pathname，避免 Unicode/空格在签名端与 CDN 端不一致。
    const digest = createHash('md5')
        .update(
            `${unsignedUrl.pathname}-${timestamp}-${random}-${uid}-${env.media.access.key}`,
        )
        .digest('hex');
    unsignedUrl.searchParams.set(
        'sign',
        `${timestamp}-${random}-${uid}-${digest}`,
    );
    return unsignedUrl.toString();
};

/**
 * 为具体对象生成直连或短时签名地址。调用方必须在序列化时按资源类型控制可见性：
 * 普通游客目录可签发封面地址，但应隐藏可播放媒体；开放内容 API 另有显式公开策略。
 */
export const buildPublicMediaUrl = (
    objectName: string,
    now = new Date(),
) => {
    if (!env.media.access.requireAuth) {
        return buildUnsignedPublicMediaUrl(objectName);
    }

    if (env.media.access.mode === 'tencent-type-a') {
        return buildTencentTypeAUrl(objectName, now);
    }

    return buildBackendTokenUrl(objectName, now);
};

export const isAuthorizedBackendMediaRequest = ({
    objectName,
    expires,
    token,
    now = new Date(),
}: {
    objectName: string;
    expires: string;
    token: string;
    now?: Date;
}) => {
    if (!env.media.access.requireAuth) {
        return true;
    }
    if (env.media.access.mode !== 'backend-token') {
        return false;
    }

    const expiresAt = Number(expires);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
        !Number.isSafeInteger(expiresAt) ||
        expiresAt < nowSeconds ||
        expiresAt > nowSeconds + env.media.access.ttlSeconds
    ) {
        return false;
    }

    const expected = createHmac('sha256', env.media.access.key)
        .update(`${objectName}\n${expiresAt}`)
        .digest('hex');
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return false;
    }

    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
};

/**
 * 本地/旧 MinIO CDN 模式需要应用创建 bucket 并写匿名只读策略。托管 COS/R2
 * bucket 必须预先由基础设施创建；其公开策略、CDN 私有回源和服务授权不能由
 * 应用启动过程修改，避免运行凭据拥有 bucket 管理权限。
 */
const ensureMediaBucket = async () => {
    // 托管对象存储由云端基础设施预创建，应用凭据只拥有对象级权限。
    // 不对 COS/R2 调用 bucketExists，可避免为运行时账号授予存储桶读取或管理权限。
    if (storage.provider !== 'minio') {
        return;
    }

    const exists = await objectStorage.bucketExists(storage.bucket);
    if (!exists) {
        logger.info(`[media] create bucket bucket=${storage.bucket}`);
        await objectStorage.makeBucket(storage.bucket, storage.region);
    }

    if (env.media.publicBaseUrl) {
        await objectStorage.setBucketPolicy(
            storage.bucket,
            publicReadPolicy(storage.bucket),
        );
    }
};

/** Called before serving traffic so previously uploaded objects work through the CDN immediately. */
export const preparePublicMediaDelivery = async () => {
    if (!env.media.publicBaseUrl) {
        return;
    }

    await ensureMediaBucket();
    logger.info(
        `[media] public delivery ready provider=${storage.provider} bucket=${storage.bucket}`,
    );
};

export const isMissingObjectError = (error: unknown) => {
    const code =
        typeof error === 'object' && error && 'code' in error
            ? String((error as { code?: unknown }).code)
            : '';
    const message = error instanceof Error ? error.message : String(error);
    return (
        code === 'NoSuchKey' ||
        code === 'NotFound' ||
        message.includes('Not Found')
    );
};

export const isInvalidStorageCredentialError = (error: unknown) => {
    const code =
        typeof error === 'object' && error && 'code' in error
            ? String((error as { code?: unknown }).code)
            : '';
    const message = error instanceof Error ? error.message : String(error);
    return (
        code === 'InvalidAccessKeyId' ||
        code === 'SignatureDoesNotMatch' ||
        message.includes('Access Key Id')
    );
};

export async function createUploadIntent({
    fileName,
    contentType,
}: {
    fileName: string;
    contentType: string;
}) {
    logger.info(
        `[media] create upload intent file=${fileName} contentType=${contentType}`,
    );
    await ensureMediaBucket();

    const mediaType = getMediaType(contentType);
    if (!mediaType) {
        throw new Error('Only audio, video, and image files are supported');
    }

    const objectName = buildObjectName(mediaType, contentType);
    const uploadUrl = await objectStorage.presignedPutObject(
        storage.bucket,
        objectName,
        60 * 10,
    );

    return {
        bucket: storage.bucket,
        objectName,
        uploadUrl,
        publicUrl: buildPublicMediaUrl(objectName),
        acceptedContentType: contentType,
        expiresInSeconds: 60 * 10,
    };
}

const getMediaType = (contentType: string) => {
    if (!SUPPORTED_MEDIA_CONTENT_TYPES.has(contentType.toLowerCase())) {
        return null;
    }
    if (contentType.startsWith('audio/')) {
        return 'audio';
    }
    if (contentType.startsWith('video/')) {
        return 'video';
    }
    if (contentType.startsWith('image/')) {
        return 'image';
    }
    return null;
};

export async function uploadMediaObject({
    fileName,
    contentType,
    buffer,
    size,
}: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
    size: number;
}) {
    const uploadStartedAt = process.hrtime.bigint();
    const mediaType = getMediaType(contentType);
    if (!mediaType) {
        throw new Error('Only audio, video, and image files are supported');
    }

    logger.info(
        `[media] upload start file=${fileName} contentType=${contentType} size=${size}`,
    );

    // 封面由 Admin 浏览器在上传前缩放并转为 JPEG，避免原图占用上行带宽。
    // 后端仍解析一次元数据以拒绝伪造 MIME 类型或损坏的图片，但绝不在此重新编码。
    if (mediaType === 'image') {
        try {
            await sharp(buffer).metadata();
        } catch (error) {
            logger.warn(
                `[media] image validation failed file=${fileName} message=${error instanceof Error ? error.message : String(error)}`,
            );
            throw new Error('Invalid image content', { cause: error });
        }
    }

    await ensureMediaBucket();

    const objectName = buildObjectName(mediaType, contentType);
    await objectStorage.putObject(storage.bucket, objectName, buffer, size, {
        'Content-Type': contentType,
    });
    logger.info(
        `[media] upload complete object=${objectName} mediaType=${mediaType} size=${size} durationMs=${(Number(process.hrtime.bigint() - uploadStartedAt) / 1_000_000).toFixed(1)}`,
    );

    return {
        bucket: storage.bucket,
        objectName,
        publicUrl: buildPublicMediaUrl(objectName),
        contentType,
        mediaType,
        size,
    };
}

type MediaObjectRange = {
    start: number;
    end: number;
};

export async function statMediaObject(objectName: string) {
    const stat = await objectStorage.statObject(storage.bucket, objectName);

    return {
        contentType:
            stat.metaData?.['content-type'] ?? 'application/octet-stream',
        size: stat.size,
        etag: stat.etag,
    };
}

export async function getMediaObject(
    objectName: string,
    range?: MediaObjectRange,
) {
    logger.info(`[media] read object=${objectName}`);
    const stat = await statMediaObject(objectName);

    if (range) {
        const start = Math.max(0, Math.min(range.start, stat.size - 1));
        const end = Math.max(start, Math.min(range.end, stat.size - 1));
        const length = end - start + 1;
        const stream = await objectStorage.getPartialObject(
            storage.bucket,
            objectName,
            start,
            length,
        );

        return {
            stream,
            contentType: stat.contentType,
            size: stat.size,
            range: {
                start,
                end,
                length,
            },
        };
    }

    const stream = await objectStorage.getObject(storage.bucket, objectName);

    return {
        stream,
        contentType: stat.contentType,
        size: stat.size,
    };
}

export async function deleteMediaObject(objectName: string) {
    logger.info(`[media] delete object=${objectName}`);
    try {
        await objectStorage.removeObject(storage.bucket, objectName);
    } catch (error) {
        if (isMissingObjectError(error)) {
            logger.warn(`[media] object already missing object=${objectName}`);
            return;
        }
        throw error;
    }
}
