import express from 'express';
import { getExercise, parseContentLocale } from '../../general/catalog/catalog-service';
import { isPreviewVolunteer } from '../../general/admin/collaboration-service';
import { optionalUserTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';

const router = express.Router();
const toId = (value: string) => Number.parseInt(value, 10);

router.get('/:exerciseId', optionalUserTokenMiddleware, async (req: any, res) => {
    const exerciseId = toId(req.params.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid exercise id' });
    }

    const includePreview = await isPreviewVolunteer(req.user?.userId);
    const exercise = await getExercise(exerciseId, false, parseContentLocale(req.query.contentLocale), includePreview);
    if (!exercise) {
        return res.status(404).send({ success: false, message: 'Exercise not found' });
    }

    res.status(200).send(exercise);
});

export default router;
