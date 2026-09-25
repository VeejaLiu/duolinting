import express from 'express';
import { listSponsors } from '../../general/sponsor/sponsor-service';
import { listPublicDonations } from '../../general/sponsor/donation-service';

const router = express.Router();

router.get('/', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).send({ items: await listSponsors() });
});

router.get('/donations', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).send({ items: await listPublicDonations() });
});

export default router;
