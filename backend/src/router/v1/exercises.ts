import { authorizedPreview, publishedCourse, recordReleaseCheck, releaseWaveform } from '../../general/releases/release-service';
import express from 'express';
import { getExercise, parseContentLocale } from '../../general/catalog/catalog-service';
import { getPreviewExerciseIdsForLearner } from '../../general/admin/collaboration-service';
import { optionalUserTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.post('/preview', optionalUserTokenMiddleware, async (req: any, res) => {
    if (!req.user?.userId) return res.status(401).send({ message: '请先登录学习账号' });
    try {
        const course = await authorizedPreview(req.body.token, req.user.userId, parseContentLocale(req.body.contentLocale));
        res.setHeader('Cache-Control','no-store');
        return res.send({ ...course, waveform: await releaseWaveform(course) });
    } catch { return res.status(403).send({ message: '预览链接已过期或当前账号无权访问' }); }
});
router.post('/preview/check', optionalUserTokenMiddleware, async (req: any, res) => {
    if (!req.user?.userId) return res.status(401).send({ message: '请先登录学习账号' });
    if (!['ios','android'].includes(req.body.platform)) return res.status(400).send({ message: '需要在 iOS 或 Android App 中完成验收' });
    try {
        const course = await authorizedPreview(req.body.token, req.user.userId);
        await recordReleaseCheck(course.release!.courseReleaseId, req.body.platform, { userId: req.user.userId }, req.body);
        return res.send({ ok: true });
    } catch { return res.status(403).send({ message: '预览链接或验收记录无效' }); }
});

router.get('/:exerciseId', optionalUserTokenMiddleware, async (req: any, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }

    const releaseId = req.query.releaseId === undefined ? undefined : Number(req.query.releaseId);
    if (releaseId !== undefined && (!Number.isSafeInteger(releaseId) || releaseId <= 0)) return res.status(400).send({ message: 'Invalid release id' });
    const previewExerciseIds = await getPreviewExerciseIdsForLearner(req.user?.userId);
    const locale = parseContentLocale(req.query.contentLocale) ?? 'en-US';
    const exercise = releaseId ? await publishedCourse(exerciseId, releaseId, locale) : await getExercise(exerciseId, false, locale, previewExerciseIds, undefined, req.user?.userId);
    if (!exercise) {
        return res.status(404).send({ success: false, message: 'Exercise not found' });
    }

    const supportedVersion = Number(req.query.playbackContractVersion ?? 0);
    if (!Number.isSafeInteger(supportedVersion) || (exercise.release && exercise.release.playbackContractVersion > supportedVersion)) return res.status(426).send({ message: '请升级客户端后播放此课程' });
    res.setHeader('Cache-Control', 'private, no-cache');
    res.status(200).send({ ...exercise, waveform: exercise.waveform ?? await releaseWaveform(exercise) });
});

export default router;
