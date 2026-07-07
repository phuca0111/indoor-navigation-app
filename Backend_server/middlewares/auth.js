// ============================================
// FILE: auth.js (Middleware)
// MỤC ĐÍCH: ÔNG BẢO VỆ GÁC CỔNG - Soi thẻ JWT trước khi cho vào
// MỌI API CẦN BẢO MẬT ĐỀU PHẢI ĐI QUA ÔNG NÀY TRƯỚC
// ============================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { assertUserOrgActive } = require('../utils/orgAccess');

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

        if (['ORG_ADMIN', 'BUILDING_ADMIN'].includes(req.user.role)) {
            const dbUser = await User.findById(req.user.userId)
                .select('organization_id is_active role')
                .lean();
            if (!dbUser || !dbUser.is_active) {
                return res.status(403).json({ message: 'Tài khoản đã bị khóa.', code: 'USER_INACTIVE' });
            }
            const orgCheck = await assertUserOrgActive(dbUser);
            if (!orgCheck.ok) {
                return res.status(403).json({ message: orgCheck.message, code: orgCheck.code });
            }
            req.user.organization_id = String(dbUser.organization_id);
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

// Super Admin hoặc Org Admin (quản lý trong phạm vi organization)
const requireAdmin = (req, res, next) => {
    if (!req.user || !['SUPER_ADMIN', 'ORG_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác quản trị này!' });
    }
    next();
};

module.exports = { auth, requireSuperAdmin, requireAdmin };
