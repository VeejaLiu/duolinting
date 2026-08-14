import { getAdminByToken } from './admin-service';

export async function requireAdminToken(req: any, res: any, next: any) {
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!bearerToken) {
        return res.status(401).send({ success: false, message: 'Admin login required' });
    }

    const admin = await getAdminByToken(bearerToken);
    if (!admin) {
        return res.status(401).send({ success: false, message: 'Admin session is not valid' });
    }

    req.admin = admin;
    next();
}
