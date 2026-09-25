import express from 'express';
import { listCatalog, listCategoryExercises, parseContentLocale } from '../../general/catalog/catalog-service';
import { getPreviewExerciseIdsForLearner } from '../../general/admin/collaboration-service';
import { optionalUserTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.get('/', optionalUserTokenMiddleware, async (req: any, res) => {
    const previewExerciseIds = await getPreviewExerciseIdsForLearner(req.user?.userId);
    // Public directory covers get object-scoped URLs; this endpoint contains no course audio/video.
    res.setHeader('Cache-Control', 'private, no-cache');
    res.status(200).send(await listCatalog(
        false,
        false,
        (parseContentLocale(req.query.contentLocale) ?? 'en-US'),
        previewExerciseIds,
        true,
    ));
});

router.get('/category/:categoryId/exercises', optionalUserTokenMiddleware, async (req: any, res) => {
    const categoryId = toId(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid category id' });
    }

    const previewExerciseIds = await getPreviewExerciseIdsForLearner(req.user?.userId);
    // Keep course media gated while allowing the published course thumbnail itself to load.
    res.setHeader('Cache-Control', 'private, no-cache');
    const exercises = await listCategoryExercises(
        categoryId,
        false,
        (parseContentLocale(req.query.contentLocale) ?? 'en-US'),
        previewExerciseIds,
        Boolean(req.user?.userId),
        true,
    );
    res.status(200).send(exercises);
});

export default router;
