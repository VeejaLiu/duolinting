import express from 'express';
import { env } from '../env';
import { checkDatabase } from '../models';
import v1Router from './v1';

const router = express.Router();

router.get('/', (req, res) => {
    res.send(`Welcome to ${env.app.name}!`);
});

router.get('/health_check', (req, res) => {
    res.send('ok');
});

router.get('/health', (req, res) => {
    res.send({ ok: true, service: 'duolinting-backend' });
});

router.get('/health/dependencies', async (req, res) => {
    try {
        await checkDatabase();
        res.send({ ok: true, mysql: 'reachable' });
    } catch {
        res.status(503).send({ ok: false, mysql: 'unreachable' });
    }
});

router.use('/v1', v1Router);

// Compatibility aliases for the first prototype frontend.
router.use('/', v1Router);

export default router;
