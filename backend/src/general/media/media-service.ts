import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '../../env';
import { Logger } from '../../lib/logger';

const logger = new Logger(__filename);

const objectStorage = new Client({
    endPoint: env.minio.endpoint,
    port: env.minio.port,
    useSSL: env.minio.useSSL,
    accessKey: env.minio.accessKey,
    secretKey: env.minio.secretKey,
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
 * 把系统管理的对象键解析出来。CDN 路径固定为
 * <MEDIA_PUBLIC_BASE_URL>/<bucket>/<objectName>，objectName 包含媒体类型/日期等
 * 层级；只有匹配当前受控前缀的 URL 才会被当作可删除的 MinIO 对象。
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
            const publicPathPrefix = `${publicBase.pathname.replace(/\/$/, '')}/${env.minio.bucket}/`;
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

/**
 * 播放器使用 CDN 直连地址时，Cloudflare 可按不可变对象键缓存完整媒体及 Range
 * 响应；未配置 CDN 时回退至历史 API 路径，保证本地和旧部署无需改动。
 */
export const buildPublicMediaUrl = (objectName: string) => {
    if (!env.media.publicBaseUrl) {
        return buildStoredMediaUrl(objectName);
    }

    return `${env.media.publicBaseUrl}/${env.minio.bucket}/${objectName}`;
};

/**
 * CDN 模式下 nginx 以匿名 GET 向 MinIO 回源。媒体地址在学习端本来就是公开的，
 * 此策略仅开放已知对象键的读取权限，未授予 ListBucket、上传或删除权限。外部流量
 * 必须仍经 nginx / Cloudflare；生产编排不应把 MinIO 的服务端口作为播放入口暴露。
 */
const ensureMediaBucket = async () => {
    const exists = await objectStorage.bucketExists(env.minio.bucket);
    if (!exists) {
        logger.info(`[media] create bucket bucket=${env.minio.bucket}`);
        await objectStorage.makeBucket(env.minio.bucket, env.minio.region);
    }

    if (env.media.publicBaseUrl) {
        await objectStorage.setBucketPolicy(
            env.minio.bucket,
            publicReadPolicy(env.minio.bucket),
        );
    }
};

/** Called before serving traffic so previously uploaded objects work through the CDN immediately. */
export const preparePublicMediaDelivery = async () => {
    if (!env.media.publicBaseUrl) {
        return;
    }

    await ensureMediaBucket();
    logger.info(`[media] public delivery ready bucket=${env.minio.bucket}`);
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
        env.minio.bucket,
        objectName,
        60 * 10,
    );

    return {
        bucket: env.minio.bucket,
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
    await objectStorage.putObject(env.minio.bucket, objectName, buffer, size, {
        'Content-Type': contentType,
    });
    logger.info(
        `[media] upload complete object=${objectName} mediaType=${mediaType} size=${size}`,
    );

    return {
        bucket: env.minio.bucket,
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
    const stat = await objectStorage.statObject(env.minio.bucket, objectName);

    return {
        contentType:
            stat.metaData?.['content-type'] ?? 'application/octet-stream',
        size: stat.size,
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
            env.minio.bucket,
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

    const stream = await objectStorage.getObject(env.minio.bucket, objectName);

    return {
        stream,
        contentType: stat.contentType,
        size: stat.size,
    };
}

export async function deleteMediaObject(objectName: string) {
    logger.info(`[media] delete object=${objectName}`);
    try {
        await objectStorage.removeObject(env.minio.bucket, objectName);
    } catch (error) {
        if (isMissingObjectError(error)) {
            logger.warn(`[media] object already missing object=${objectName}`);
            return;
        }
        throw error;
    }
}
