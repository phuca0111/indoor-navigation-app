// ============================================
// FILE: buildingAccess.js
// MỤC ĐÍCH: Middleware kiểm tra quyền truy cập vào tòa nhà
// LOGIC:
// - SUPER_ADMIN: full access
// - BUILDING_ADMIN: chỉ được truy cập building có trong assigned_buildings
// ============================================

const User = require('../models/User');
const Building = require('../models/Building');
const { getClientIp } = require('../utils/ipHelper');

// WHY: Tiện ích trích xuất buildingId từ nhiều nguồn trong request
// WHERE: Dùng trong requireBuildingAccess để xác định building cần check
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

// WHY: Middleware bảo vệ các route cần quyền truy cập building cụ thể
// REQUIRE: req.user phải tồn tại (được gắn bởi auth middleware trước)
// CHILD: getBuildingIdFromRequest
async function requireBuildingAccess(req, res, next) {
    try {
        // 1. Yêu cầu xác thực (auth middleware phải chạy trước)
        if (!req.user) {
            return res.status(401).json({ message: "Chưa xác thực." });
        }

        // 2. SUPER_ADMIN được truy cập mọi building
        if (req.user.role === 'SUPER_ADMIN') {
            return next();
        }

        // 3. Lấy buildingId từ request
        const buildingId = getBuildingIdFromRequest(req);
        if (!buildingId) {
            return res.status(400).json({ message: "Thiếu buildingId để kiểm tra quyền." });
        }

        // 4. Load user từ DB (có assigned_buildings, role, is_active)
        const user = await User.findById(req.user.userId)
            .select('assigned_buildings role is_active')
            .lean();

        if (!user || !user.is_active) {
            return res.status(401).json({ message: "Tài khoản không hợp lệ hoặc đã bị khóa." });
        }

        // 5. Kiểm tra assigned_buildings
        const assignedIds = (user.assigned_buildings || []).map(id => String(id));
        const hasAccess = assignedIds.includes(String(buildingId));

        if (!hasAccess) {
            // Ghi log truy cập bị từ chối (fire-and-forget, không fail request)
            try {
                const ActivityLog = require('../models/ActivityLog');
                ActivityLog.create({
                    user_id: req.user.userId,
                    action: 'BUILDING_ACCESS_DENIED',
                    target_type: 'building',
                    target_id: String(buildingId),
                    target: String(buildingId),
                    details: { path: req.originalUrl, method: req.method },
                    ip_address: getClientIp(req)
                }).catch(() => {});
            } catch (logErr) {
                console.warn('[buildingAccess] Failed to log BUILDING_ACCESS_DENIED:', logErr.message);
            }
            return res.status(403).json({ message: "Bạn không có quyền truy cập tòa nhà này." });
        }

        // 8. Kiểm tra active
        if (building.is_active === false) {
            try {
                const ActivityLog = require('../models/ActivityLog');
                ActivityLog.create({
                    user_id: req.user.userId,
                    action: 'BUILDING_ACCESS_DENIED',
                    target_type: 'building',
                    target_id: String(buildingId),
                    target: String(buildingId),
                    details: { path: req.originalUrl, method: req.method, reason: 'building_inactive' },
                    ip_address: getClientIp(req)
                }).catch(() => {});
            } catch (logErr) {
                console.warn('[buildingAccess] Failed to log BUILDING_ACCESS_DENIED:', logErr.message);
            }
            return res.status(403).json({ message: "Tòa nhà đã bị vô hiệu hóa." });
        }

        // 9. Building active và thuộc org, cho phép truy cập
        return next();

    } catch (error) {
        console.error('[buildingAccess] Middleware error:', error);
        return res.status(500).json({ message: "Lỗi kiểm tra quyền truy cập." });
    }
}

module.exports = { requireBuildingAccess, getBuildingIdFromRequest };
