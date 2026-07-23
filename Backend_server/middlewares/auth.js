// ============================================
// FILE: auth.js (Middleware)
// MỤC ĐÍCH: JWT auth + RBAC theo permission (B1)
// ============================================

const jwt = require('jsonwebtoken');
const { resolveEffectivePrincipal } = require('../application/identity/principalApplicationService');
const { ActorContext } = require('../application/identity/ActorContext');
const {
  P,
  roleHasPermission,
  roleHasAnyPermission,
  roleHasAllPermissions
} = require('../utils/permissions');

async function attachPrincipalFromAuthHeader(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const err = new Error('Truy cập bị từ chối! Bạn chưa đăng nhập (không có token).');
        err.status = 401;
        err.code = 'UNAUTHORIZED';
        throw err;
    }

    const token = authHeader.split(' ')[1];
    const thongTinTrongThe = jwt.verify(token, process.env.JWT_SECRET);

    if (thongTinTrongThe.jti) {
        const { has: isBlacklisted } = require('../services/tokenBlacklist');
        if (await isBlacklisted(thongTinTrongThe.jti)) {
            const err = new Error('Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.');
            err.status = 401;
            err.code = 'TOKEN_REVOKED';
            throw err;
        }
    }

    const principal = await resolveEffectivePrincipal(thongTinTrongThe);
    req.effectivePrincipal = principal;
    req.actorContext = ActorContext.fromRequest(req, principal);
    req.user = principal.toLegacyClaims();
}

const auth = async (req, res, next) => {
    try {
        await attachPrincipalFromAuthHeader(req);
        next();
    } catch (error) {
        res.status(error.status || 401).json({
            message: error.message || 'Thẻ không hợp lệ hoặc đã hết hạn! Vui lòng đăng nhập lại.',
            code: error.code || 'TOKEN_INVALID'
        });
    }
};

/**
 * Gắn req.user nếu có Bearer token hợp lệ; không có / lỗi token → vẫn next() (public).
 * Dùng cho Place Registry: guest xem public, MAP_MOD/SUPER xem bản admin (có buildings).
 */
const optionalAuth = async (req, res, next) => {
    try {
        if (!req.headers.authorization) return next();
        await attachPrincipalFromAuthHeader(req);
        return next();
    } catch (_error) {
        // Token xấu: coi như guest, không chặn route public
        return next();
    }
};

function denyPermission(res, needed) {
    return res.status(403).json({
        message: 'Bạn không có quyền thực hiện thao tác này.',
        code: 'PERMISSION_DENIED',
        required: needed
    });
}

/**
 * Cần TẤT CẢ permission trong danh sách.
 * @param {...string} permissions
 */
function requirePermission(...permissions) {
    const needed = permissions.filter(Boolean);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Chưa đăng nhập.', code: 'UNAUTHORIZED' });
        }
        if (!needed.length || !roleHasAllPermissions(req.user.role, needed)) {
            return denyPermission(res, needed);
        }
        next();
    };
}

/**
 * Cần ÍT NHẤT MỘT permission.
 * @param {...string} permissions
 */
function requireAnyPermission(...permissions) {
    const needed = permissions.filter(Boolean);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Chưa đăng nhập.', code: 'UNAUTHORIZED' });
        }
        if (!needed.length || !roleHasAnyPermission(req.user.role, needed)) {
            return denyPermission(res, needed);
        }
        next();
    };
}

/**
 * Super Admin — dùng permission platform.orgs.manage
 * (chỉ SUPER_ADMIN có '*' nên pass; role khác 403 + code PERMISSION_DENIED).
 */
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Chưa đăng nhập.', code: 'UNAUTHORIZED' });
    }
    if (!roleHasPermission(req.user.role, P.PLATFORM_ORGS_MANAGE)) {
        return res.status(403).json({
            message: 'Bạn không có quyền Super Admin để thực hiện thao tác này!',
            code: 'PERMISSION_DENIED',
            required: [P.PLATFORM_ORGS_MANAGE]
        });
    }
    next();
};

/** Super hoặc Finance Admin — module Thu–Chi */
const requireFinanceAccess = requirePermission(P.FINANCE_ACCESS);

/** Super Admin hoặc Org Admin */
const requireAdmin = requireAnyPermission(P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE);

/** Tạo tòa nhà: SUPER / ORG / REGISTERED_USER */
const requireBuildingCreator = requirePermission(P.BUILDINGS_CREATE);

module.exports = {
    auth,
    optionalAuth,
    requireSuperAdmin,
    requireFinanceAccess,
    requireAdmin,
    requireBuildingCreator,
    requirePermission,
    requireAnyPermission,
    P
};
