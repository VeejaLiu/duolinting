import express from 'express';
import { listCatalog, listCategoryExercises, parseContentLocale } from '../../general/catalog/catalog-service';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.get('/', async (req, res) => {
    res.status(200).send(await listCatalog(false, false, parseContentLocale(req.query.contentLocale)));
});

router.get('/category/:categoryId/exercises', async (req, res) => {
    const categoryId = toId(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid category id' });
    }

    const exercises = await listCategoryExercises(categoryId, false, parseContentLocale(req.query.contentLocale));
    res.status(200).send(exercises);
});

export default router;
