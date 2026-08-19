import express from 'express';
import { requireOpenContentApiKey } from '../../general/open-content/open-content-api-auth';
import {
    getOpenContentCatalog,
    getOpenContentDltjson,
} from '../../general/open-content/open-content-service';

const router = express.Router();
const toId = (value: string | string[]) =>
    Number.parseInt(Array.isArray(value) ? value[0] : value, 10);

router.use(requireOpenContentApiKey);

router.get('/catalog', async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(await getOpenContentCatalog());
});

router.get('/courses/:courseId/dltjson', async (req, res) => {
    const courseId = toId(req.params.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
        return res.status(400).send({ success: false, message: 'Invalid course id' });
    }

    const dltjson = await getOpenContentDltjson(courseId);
    if (!dltjson) {
        return res.status(404).send({ success: false, message: 'Published course not found' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.attachment(`course-${courseId}.dltjson`);
    res.status(200).json(dltjson);
});

export default router;
