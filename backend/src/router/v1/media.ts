import express from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import { requireAdminToken, requireSuperAdmin } from '../../general/admin/admin-auth';
import {
    createUploadIntent,
    getMediaObject,
    isInvalidStorageCredentialError,
    isMissingObjectError,
    statMediaObject,
    uploadMediaObject,
    SUPPORTED_MEDIA_CONTENT_TYPES,
} from '../../general/media/media-service';
import { env } from '../../env';
import { validateErrorCheck } from '../../lib/express-validator/express-validator-middleware';
import { Logger } from '../../lib/logger';

const router = express.Router();
const logger = new Logger(__filename);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // 与 nginx 各层代理的 client_max_body_size 200m 对齐
        fileSize: 200 * 1024 * 1024,
    },
});

const isLoopbackRequest = (req: express.Request) => {
    const address = req.socket.remoteAddress;
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
};

const applyLocalUploadThrottle: express.RequestHandler = (req, res, next) => {
    const bytesPerSecond = env.localUploadTesting.throttleBytesPerSecond;
    // 仅对显式开启的、从本机进入的开发请求限速。即使 NODE_ENV 意外保持 development，
    // 远程浏览器、局域网设备和生产服务也不会被这个测试辅助逻辑影响。
    if (!env.isDevelopment || !isLoopbackRequest(req) || bytesPerSecond <= 0) {
        next();
        return;
    }

    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const resumeAfterChunk = (chunk: Buffer) => {
        // 暂停 Node 的入站流，让 TCP 背压传递回浏览器；这样 XHR 的上传进度会按真实传输速率增长，
        // 而不是只延迟接口响应。每个分块按其字节数换算等待时间，保持近似恒定速率。
        const delayMs = Math.max(1, Math.ceil((chunk.length / bytesPerSecond) * 1000));
        req.pause();
        resumeTimer = setTimeout(() => {
            resumeTimer = undefined;
            req.resume();
        }, delayMs);
    };
    const clearThrottle = () => {
        if (resumeTimer) {
            clearTimeout(resumeTimer);
            resumeTimer = undefined;
        }
        req.off('data', resumeAfterChunk);
    };

    req.on('data', resumeAfterChunk);
    req.once('aborted', clearThrottle);
    req.once('close', clearThrottle);
    logger.info(
        `[media] local upload throttle requestId=${res.locals.requestId ?? '-'} rate=${Math.round(bytesPerSecond / 1024)}KB/s`,
    );
    next();
};

const waitForLocalUploadConfirmation = async (req: express.Request) => {
    const delayMs = env.localUploadTesting.confirmationDelayMs;
    if (!env.isDevelopment || !isLoopbackRequest(req) || delayMs <= 0) {
        return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};

const parseRangeHeader = (rangeHeader: string | undefined, size: number) => {
    if (!rangeHeader) {
        return null;
    }

    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
        return null;
    }

    const [, startText, endText] = match;
    if (!startText && !endText) {
        return null;
    }

    if (!startText) {
        const suffixLength = Number(endText);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
            return null;
        }
        return {
            start: Math.max(size - suffixLength, 0),
            end: size - 1,
        };
    }

    const start = Number(startText);
    const end = endText ? Number(endText) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        return null;
    }

    return {
        start,
        end: Math.min(end, size - 1),
    };
};

const sendMediaObject = async (req: express.Request, res: express.Response, objectName: string) => {
    const stat = await statMediaObject(objectName);
    const range = parseRangeHeader(req.headers.range, stat.size);

    // 对象名在上传时带时间戳前缀天然唯一，内容不会原地变化，
    // 可按 immutable 长缓存：客户端磁盘缓存 + 浏览器缓存可直接复用，节省带宽。
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // 媒体响应的 Content-Type 来自服务端白名单/规范化结果；同时禁止浏览器
    // 根据内容重新嗅探为 HTML 或脚本，阻断同源主动内容执行。
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!range) {
        const media = await getMediaObject(objectName);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', media.contentType);
        res.setHeader('Content-Length', String(media.size));
        media.stream.pipe(res);
        return;
    }

    const partialMedia = await getMediaObject(objectName, range);
    const partialRange = partialMedia.range;
    if (!partialRange) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', partialMedia.contentType);
        res.setHeader('Content-Length', String(partialMedia.size));
        partialMedia.stream.pipe(res);
        return;
    }

    res.status(206);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', partialMedia.contentType);
    res.setHeader('Content-Length', String(partialRange.length));
    res.setHeader('Content-Range', `bytes ${partialRange.start}-${partialRange.end}/${partialMedia.size}`);
    partialMedia.stream.pipe(res);
};

router.get('/objects/:objectName', async (req, res) => {
    try {
        const objectName = req.params.objectName;
        await sendMediaObject(req, res, objectName);
    } catch (error) {
        logger.error(
            `[media] read failed requestId=${res.locals.requestId ?? '-'} object=${req.params.objectName} message=${error instanceof Error ? error.message : String(error)}`,
        );
        if (isMissingObjectError(error)) {
            return res.status(404).send({ success: false, message: 'Media object not found' });
        }
        if (isInvalidStorageCredentialError(error)) {
            return res.status(502).send({ success: false, message: 'Media storage credentials are invalid' });
        }
        res.status(502).send({ success: false, message: 'Media object read failed' });
    }
});

router.get('/objects', async (req, res) => {
    try {
        const objectName = typeof req.query.key === 'string' ? req.query.key : '';
        if (!objectName) {
            return res.status(400).send({ success: false, message: 'Missing media object key' });
        }

        await sendMediaObject(req, res, objectName);
    } catch (error) {
        logger.error(
            `[media] read failed requestId=${res.locals.requestId ?? '-'} object=${String(req.query.key ?? '')} message=${error instanceof Error ? error.message : String(error)}`,
        );
        if (isMissingObjectError(error)) {
            return res.status(404).send({ success: false, message: 'Media object not found' });
        }
        if (isInvalidStorageCredentialError(error)) {
            return res.status(502).send({ success: false, message: 'Media storage credentials are invalid' });
        }
        res.status(502).send({ success: false, message: 'Media object read failed' });
    }
});

router.post(
    '/upload-intents',
    requireAdminToken,
    requireSuperAdmin,
    body('fileName').isString().isLength({ min: 1 }),
    body('contentType').isString().isLength({ min: 1 }),
    validateErrorCheck,
    async (req, res) => {
        const result = await createUploadIntent(req.body);
        res.status(200).send(result);
    },
);

const uploadMedia = async (req: express.Request, res: express.Response) => {
    try {
        const file = req.file;
        if (!file) {
            logger.warn(`[media] upload failed requestId=${res.locals.requestId ?? '-'} reason=missing-file`);
            return res.status(400).send({ success: false, message: 'Missing media file' });
        }

        if (!SUPPORTED_MEDIA_CONTENT_TYPES.has(file.mimetype.toLowerCase())) {
            logger.warn(
                `[media] upload failed requestId=${res.locals.requestId ?? '-'} file=${file.originalname} contentType=${file.mimetype} reason=unsupported-type`,
            );
            return res.status(400).send({ success: false, message: 'Only audio, video, and image files are supported' });
        }

        logger.info(
            `[media] upload request requestId=${res.locals.requestId ?? '-'} file=${file.originalname} contentType=${file.mimetype} size=${file.size}`,
        );
        const result = await uploadMediaObject({
            fileName: file.originalname,
            contentType: file.mimetype,
            buffer: file.buffer,
            size: file.size,
        });
        await waitForLocalUploadConfirmation(req);
        res.status(201).send(result);
    } catch (error) {
        logger.error(
            `[media] upload failed requestId=${res.locals.requestId ?? '-'} message=${error instanceof Error ? error.message : String(error)}`,
        );
        res.status(502).send({
            success: false,
            message: error instanceof Error ? `Media upload failed: ${error.message}` : 'Media upload failed',
        });
    }
};

router.post('/files', requireAdminToken, requireSuperAdmin, applyLocalUploadThrottle, upload.single('media'), uploadMedia);
router.post('/audio', requireAdminToken, requireSuperAdmin, applyLocalUploadThrottle, upload.single('audio'), uploadMedia);

export default router;
