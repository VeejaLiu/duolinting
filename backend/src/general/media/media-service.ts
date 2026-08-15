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

export const SUPPORTED_MEDIA_CONTENT_TYPES = new Set(Object.keys(extensionByContentType));

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

const buildPublicUrl = (objectName: string) =>
    `/api/v1/media/objects?key=${encodeURIComponent(objectName)}`;

export const isMissingObjectError = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    const message = error instanceof Error ? error.message : String(error);
    return code === 'NoSuchKey' || code === 'NotFound' || message.includes('Not Found');
};

export const isInvalidStorageCredentialError = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    const message = error instanceof Error ? error.message : String(error);
    return code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch' || message.includes('Access Key Id');
};

export async function createUploadIntent({ fileName, contentType }: { fileName: string; contentType: string }) {
    logger.info(`[media] create upload intent file=${fileName} contentType=${contentType}`);
    const exists = await objectStorage.bucketExists(env.minio.bucket);
    if (!exists) {
        logger.info(`[media] create bucket bucket=${env.minio.bucket}`);
        await objectStorage.makeBucket(env.minio.bucket, env.minio.region);
    }

    const mediaType = getMediaType(contentType);
    if (!mediaType) {
        throw new Error('Only audio, video, and image files are supported');
    }

    const objectName = buildObjectName(mediaType, contentType);
    const uploadUrl = await objectStorage.presignedPutObject(env.minio.bucket, objectName, 60 * 10);

    return {
        bucket: env.minio.bucket,
        objectName,
        uploadUrl,
        publicUrl: buildPublicUrl(objectName),
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

    logger.info(`[media] upload start file=${fileName} contentType=${contentType} size=${size}`);

    // 封面由 Admin 浏览器在上传前缩放并转为 JPEG，避免原图占用上行带宽。
    // 后端仍解析一次元数据以拒绝伪造 MIME 类型或损坏的图片，但绝不在此重新编码。
    if (mediaType === 'image') {
        try {
            await sharp(buffer).metadata();
        } catch (error) {
            logger.warn(`[media] image validation failed file=${fileName} message=${error instanceof Error ? error.message : String(error)}`);
            throw new Error('Invalid image content', { cause: error });
        }
    }

    const exists = await objectStorage.bucketExists(env.minio.bucket);
    if (!exists) {
        logger.info(`[media] create bucket bucket=${env.minio.bucket}`);
        await objectStorage.makeBucket(env.minio.bucket, env.minio.region);
    }

    const objectName = buildObjectName(mediaType, contentType);
    await objectStorage.putObject(env.minio.bucket, objectName, buffer, size, {
        'Content-Type': contentType,
    });
    logger.info(`[media] upload complete object=${objectName} mediaType=${mediaType} size=${size}`);

    return {
        bucket: env.minio.bucket,
        objectName,
        publicUrl: buildPublicUrl(objectName),
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
        contentType: stat.metaData?.['content-type'] ?? 'application/octet-stream',
        size: stat.size,
    };
}

export async function getMediaObject(objectName: string, range?: MediaObjectRange) {
    logger.info(`[media] read object=${objectName}`);
    const stat = await statMediaObject(objectName);

    if (range) {
        const start = Math.max(0, Math.min(range.start, stat.size - 1));
        const end = Math.max(start, Math.min(range.end, stat.size - 1));
        const length = end - start + 1;
        const stream = await objectStorage.getPartialObject(env.minio.bucket, objectName, start, length);

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
