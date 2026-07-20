// ============================================
// FILE: buildingAccess.js
// MỤC ĐÍCH: Middleware kiểm tra quyền truy cập vào tòa nhà (Phase 3.1)
// LOGIC:
// - SUPER_ADMIN: full access
// - ORG_ADMIN: mọi building trong organization_id
// - BUILDING_ADMIN: assigned_buildings + cùng organization
// ============================================

const User = require('../models/User');
const Building = require('../models/Building');
const { getClientIp } = require('../utils/ipHelper');

function getBuildingIdFromRequest(req) {
    return (
        req.params.buildingId ||
        req.params.id ||
        req.body.buildingId ||
        req.body.building_id ||
        req.query.buildingId ||
        req.query.building_id ||
        null
    );
}

function logAccessDenied(req, buildingId, reason) {
    try {
        const ActivityLog = require('../models/ActivityLog');
        ActivityLog.create({
            user_id: req.user.userId,
            action: 'BUILDING_ACCESS_DENIED',
            target_type: 'building',
            target_id: String(buildingId),
            target: String(buildingId),
            details: { path: req.originalUrl, method: req.method, reason },
            ip_address: getClientIp(req)
        }).catch(() => {});
    } catch (logErr) {
        console.warn('[buildingAccess] Failed to log BUILDING_ACCESS_DENIED:', logErr.message);
    }
}

async function requireBuildingAccess(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Chưa xác thực.' });
        }

        if (req.user.role === 'SUPER_ADMIN') {
            return next();
        }

        const buildingId = getBuildingIdFromRequest(req);
        if (!buildingId) {
            return res.status(400).json({ message: 'Thiếu buildingId để kiểm tra quyền.' });
        }

        const building = await Building.findById(buildingId)
            .select('organization_id owner_user_id is_active name')
            .lean();

        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà.' });
        }

        const user = await User.findById(req.user.userId)
            .select('assigned_buildings role is_active organization_id')
            .lean();

        // REGISTERED_USER: chỉ truy cập building trong Personal Workspace của chính mình
        if (req.user.role === 'REGISTERED_USER') {
            if (!user || !user.is_active) {
                return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
            }
            if (String(building.owner_user_id || '') !== String(req.user.userId)) {
                logAccessDenied(req, buildingId, 'not_owner');
                return res.status(403).json({ message: 'Bạn không có quyền truy cập tòa nhà này.' });
            }
            return next();
        }

        if (!user || !user.is_active) {
            return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
        }

        if (building.is_active === false) {
            logAccessDenied(req, buildingId, 'building_inactive');
            return res.status(403).json({ message: 'Tòa nhà đã bị vô hiệu hóa.' });
        }

        if (req.user.role === 'ORG_ADMIN') {
            if (!user.organization_id) {
                return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
            }
            if (String(building.organization_id) !== String(user.organization_id)) {
                logAccessDenied(req, buildingId, 'org_mismatch');
                return res.status(403).json({ message: 'Bạn chỉ được truy cập tòa nhà trong tổ chức của mình.' });
            }
            return next();
        }

        if (req.user.role === 'BUILDING_ADMIN') {
            const assignedIds = (user.assigned_buildings || []).map(id => String(id));
            if (!assignedIds.includes(String(buildingId))) {
                logAccessDenied(req, buildingId, 'not_assigned');
                return res.status(403).json({ message: 'Bạn không có quyền truy cập tòa nhà này.' });
            }
            if (user.organization_id && building.organization_id &&
                String(building.organization_id) !== String(user.organization_id)) {
                logAccessDenied(req, buildingId, 'org_mismatch');
                return res.status(403).json({ message: 'Tòa nhà không thuộc tổ chức của bạn.' });
            }
            return next();
        }

        logAccessDenied(req, buildingId, 'unknown_role');
        return res.status(403).json({ message: 'Bạn không có quyền truy cập tòa nhà này.' });

    } catch (error) {
        console.error('[buildingAccess] Middleware error:', error);
        return res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập.' });
    }
}

module.exports = { requireBuildingAccess, getBuildingIdFromRequest };
