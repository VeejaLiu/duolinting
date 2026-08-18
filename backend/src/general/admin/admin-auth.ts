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

/** Route-level enforcement keeps a contributor from bypassing hidden frontend controls with a raw API call. */
export function requireSuperAdmin(req: any, res: any, next: any) {
    if (req.admin?.role !== 'super_admin') {
        return res.status(403).send({ success: false, message: 'Super administrator permission required' });
    }
    next();
}

/**
 * 新开通的后台账号持有的是管理员会话，但仅允许其读取本人信息和修改临时密码。
 * 这项后端拦截不能只依赖前端弹窗，否则可绕过界面直接调用内容管理接口。
 */
export function requireAdminPasswordChanged(req: any, res: any, next: any) {
    if (req.admin?.mustChangePassword) {
        return res.status(403).send({
            success: false,
            code: 'ADMIN_PASSWORD_CHANGE_REQUIRED',
            message: '请先修改初始密码后再使用管理后台',
        });
    }
    next();
}
