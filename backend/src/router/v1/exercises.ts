import express from 'express';
import { getExercise, parseContentLocale } from '../../general/catalog/catalog-service';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.get('/:exerciseId', async (req, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }

    const exercise = await getExercise(exerciseId, false, parseContentLocale(req.query.contentLocale));
    if (!exercise) {
        return res.status(404).send({ success: false, message: 'Exercise not found' });
    }

    res.status(200).send(exercise);
});

export default router;
