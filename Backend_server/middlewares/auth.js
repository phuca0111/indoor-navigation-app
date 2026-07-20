// ============================================
// FILE: auth.js (Middleware)
// MỤC ĐÍCH: ÔNG BẢO VỆ GÁC CỔNG - Soi thẻ JWT trước khi cho vào
// MỌI API CẦN BẢO MẬT ĐỀU PHẢI ĐI QUA ÔNG NÀY TRƯỚC
// ============================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { assertUserOrgActive } = require('../utils/orgAccess');
const { isUserQuotaLocked } = require('../utils/overQuotaLock');

// Hàm bảo vệ: Kiểm tra thẻ JWT có hợp lệ không
const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ message: 'Truy cập bị từ chối! Bạn chưa đăng nhập (không có token).' });
        }

        const token = authHeader.split(' ')[1];
        const thongTinTrongThe = jwt.verify(token, process.env.JWT_SECRET);
        req.user = thongTinTrongThe;

        // Phase 7: access JWT phải khớp session_version hiện tại (logout-all / đổi MK)
        const sessionUser = await User.findById(req.user.userId)
            .select('organization_id is_active role session_version')
            .lean();
        if (!sessionUser || sessionUser.is_active === false) {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa.', code: 'USER_INACTIVE' });
        }
        const userSv = Number(sessionUser.session_version) || 0;
        // Token không có sv coi như version 0 (JWT cấp trước Phase 7)
        const tokenSv = (req.user.sv === undefined || req.user.sv === null)
          ? 0
          : Number(req.user.sv);
        if (tokenSv !== userSv) {
            console.log(`[Auth] SESSION_REVOKED user=${req.user.userId} tokenSv=${tokenSv} userSv=${userSv}`);
            return res.status(401).json({
                message: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
                code: 'SESSION_REVOKED'
            });
        }

        if (['ORG_ADMIN', 'BUILDING_ADMIN'].includes(req.user.role)) {
            const orgCheck = await assertUserOrgActive(sessionUser);
            if (!orgCheck.ok) {
                return res.status(403).json({ message: orgCheck.message, code: orgCheck.code });
            }
            const org = await Organization.findById(sessionUser.organization_id);
            if (org && await isUserQuotaLocked(sessionUser._id, org)) {
                return res.status(403).json({
                    message: 'Tài khoản bị khóa do vượt hạn mức gói. Liên hệ ORG Admin hoặc nâng cấp PRO.',
                    code: 'OVER_QUOTA_USER_LOCKED'
                });
            }
            req.user.organization_id = String(sessionUser.organization_id);
        }

        next();
    } catch (error) {
        res.status(401).json({ message: 'Thẻ không hợp lệ hoặc đã hết hạn! Vui lòng đăng nhập lại.' });
    }
};

// Hàm kiểm tra vai trò: Chỉ cho Super Admin đi qua
const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ message: 'Bạn không có quyền Super Admin để thực hiện thao tác này!' });
    }
    next();
};

/** Phase 9.8 — Super hoặc Finance Admin (chỉ module Thu–Chi) */
const requireFinanceAccess = (req, res, next) => {
    if (!req.user || !['SUPER_ADMIN', 'FINANCE_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({
            message: 'Chỉ Super Admin hoặc Finance Admin được truy cập Thu – Chi.',
            code: 'FINANCE_ACCESS_DENIED'
        });
    }
    next();
};

// Super Admin hoặc Org Admin (quản lý trong phạm vi organization)
const requireAdmin = (req, res, next) => {
    if (!req.user || !['SUPER_ADMIN', 'ORG_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác quản trị này!' });
    }
    next();
};

// Người được phép tạo tòa nhà: SUPER/ORG (trong tổ chức) + REGISTERED_USER (Personal Workspace)
const requireBuildingCreator = (req, res, next) => {
    if (!req.user || !['SUPER_ADMIN', 'ORG_ADMIN', 'REGISTERED_USER'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo tòa nhà!' });
    }
    next();
};

module.exports = { auth, requireSuperAdmin, requireFinanceAccess, requireAdmin, requireBuildingCreator };
