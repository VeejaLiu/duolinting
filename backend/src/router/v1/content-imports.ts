import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireAdminPasswordChanged, requireAdminToken, requireSuperAdmin } from '../../general/admin/admin-auth';
import { ImportError, record } from '../../general/content-imports/contracts';
import { ImportToken } from '../../general/content-imports/models';
import { cleanupImports, completeImport, createImport, getImport, importCatalog, renewUploads } from '../../general/content-imports/service';
import { issueToken, requireImportToken, revokeToken, tokenView } from '../../general/content-imports/tokens';
import { createRateLimit } from '../../lib/rate-limit';

const router = express.Router();
const handle: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof ImportError)) { next(error); return; }
    res.status(error.status).send({ code: error.code, message: error.message, retryable: error.retryable });
};
const validId: RequestHandler = (req, _res, next) => {
    if (!/^\d+$/.test(String(req.params.id)) || !Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1) throw new ImportError('INVALID_ID', 'Invalid ID');
    next();
};
// 管理接口只接受真正的超级管理员会话；导入 Token 没有进入这些接口的能力。
export const importManagementRouter = express.Router();
importManagementRouter.use(requireAdminToken, requireAdminPasswordChanged, requireSuperAdmin, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
importManagementRouter.get('/tokens', async (_req, res) => res.send({ items: (await ImportToken.findAll({ order: [['created_at', 'DESC']] })).map(tokenView) }));
importManagementRouter.post('/tokens', async (req: any, res) => res.status(201).send(await issueToken(req.body, req.admin.id)));
importManagementRouter.delete('/tokens/:id', validId, async (req, res) => { await revokeToken(Number(req.params.id)); res.send({ ok: true }); });
importManagementRouter.post('/cleanup', async (req, res) => { record(req.body ?? {}, []); res.send(await cleanupImports()); });
importManagementRouter.use(handle);

router.use(createRateLimit({ namespace: 'content-import-auth', windowMs: 60000, maxAttempts: 120, keys: req => [`ip:${req.ip}`], resetOnSuccess: false }), requireImportToken);
router.get('/catalog', async (_req, res) => res.send(await importCatalog(res.locals.importActor)));
router.post('/', createRateLimit({ namespace: 'content-import-create', windowMs: 60000, maxAttempts: 10, keys: req => [`ip:${req.ip}`], resetOnSuccess: false }), async (req, res) => res.status(201).send(await createImport(res.locals.importActor, req.get('Idempotency-Key') ?? '', req.body)));
router.get('/:id', validId, async (req, res) => res.send(await getImport(Number(req.params.id), res.locals.importActor)));
router.post('/:id/upload-urls', validId, async (req, res) => { record(req.body ?? {}, []); res.send(await renewUploads(Number(req.params.id), res.locals.importActor)); });
router.post('/:id/complete', validId, async (req, res) => { record(req.body ?? {}, []); const result = await completeImport(Number(req.params.id), res.locals.importActor); res.status(result.status === 'ready' ? 200 : 202).send(result); });
router.use(handle);
export default router;
