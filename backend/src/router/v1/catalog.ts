import express from 'express';
import { listCatalog, listCategoryExercises, parseContentLocale } from '../../general/catalog/catalog-service';
import { isPreviewVolunteer } from '../../general/admin/collaboration-service';
import { optionalUserTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.get('/', optionalUserTokenMiddleware, async (req: any, res) => {
    const includePreview = await isPreviewVolunteer(req.user?.userId);
    res.status(200).send(await listCatalog(false, false, parseContentLocale(req.query.contentLocale), includePreview));
});

router.get('/category/:categoryId/exercises', optionalUserTokenMiddleware, async (req: any, res) => {
    const categoryId = toId(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid category id' });
    }

    const includePreview = await isPreviewVolunteer(req.user?.userId);
    const exercises = await listCategoryExercises(categoryId, false, parseContentLocale(req.query.contentLocale), includePreview);
    res.status(200).send(exercises);
});

export default router;
