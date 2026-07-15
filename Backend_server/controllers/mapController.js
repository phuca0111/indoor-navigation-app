// ============================================
// FILE: mapController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Lưu / Tải / Publish Bản Đồ JSON
// ĐÂY LÀ FILE CỐT LÕI: Nối Web Map Editor với Database
// ============================================

const Floor      = require('../models/Floor');
const Building   = require('../models/Building');
const Organization = require('../models/Organization');
const ActivityLog = require('../models/ActivityLog');
const { assertBuildingWritable, isBuildingQuotaLocked } = require('../utils/overQuotaLock');
const { assertFloorInRange } = require('../services/floorLifecycle');
const { assertOrgCanPublish } = require('../services/publishPermit');
const { assertCanPublish } = require('../services/floorEditLock');
const {
    validateMapData,
    resolvePublishMapData,
    applyPublish,
    syncQrCodes
} = require('../services/publishService');

function logActivity(data) {
    return ActivityLog.create(data).catch(() => {});
}

async function assertPublicBuildingAccess(buildingId, res) {
    const building = await Building.findById(buildingId).select('status is_active organization_id').lean();
    if (!building || building.is_active === false || building.status !== 'PUBLISHED') {
        res.status(404).json({ message: 'Không tìm thấy bản đồ hoặc tòa nhà chưa được xuất bản.' });
        return false;
    }
    if (building.organization_id) {
        const org = await Organization.findById(building.organization_id);
        if (org && await isBuildingQuotaLocked(buildingId, org)) {
            res.status(403).json({
                message: 'Bản đồ tòa nhà tạm khóa do vượt hạn mức gói. Liên hệ quản trị tổ chức.',
                code: 'OVER_QUOTA_LOCKED'
            });
            return false;
        }
    }
    return true;
}

// Sync qr_anchors — re-export từ publishService (giữ tương thích import nội bộ)
// (logic chính nằm trong services/publishService.js)

function resolveEditSessionId(req) {
    const header = req.headers['x-edit-session'];
    if (header && String(header).trim()) return String(header).trim();
    if (req.body?.edit_session_id) return String(req.body.edit_session_id).trim();
    return '';
}

// ==========================================
// Phase 8: LƯU NHÁP (không version bump / không public)
// ==========================================
const saveDraft = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }

        const map_data = req.body?.map_data;
        if (map_data === undefined || map_data === null) {
            return res.status(400).json({ message: 'Thiếu map_data trong body.' });
        }

        const buildingMeta = await Building.findById(buildingId)
            .select('organization_id total_floors')
            .lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        try {
            assertFloorInRange(floorNum, buildingMeta.total_floors);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code || 'FLOOR_OUT_OF_RANGE',
                floor_number: e.floor_number,
                total_floors: e.total_floors
            });
        }

        if (req.user?.role !== 'SUPER_ADMIN') {
            if (buildingMeta.organization_id) {
                const org = await Organization.findById(buildingMeta.organization_id);
                const writable = await assertBuildingWritable(buildingId, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        const userId = req.user ? req.user.userId : null;
        const now = new Date();

        let floorDoc = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        });

        if (floorDoc) {
            floorDoc.draft_map_data = map_data;
            floorDoc.draft_updated_at = now;
            floorDoc.draft_updated_by = userId;
            await floorDoc.save();
        } else {
            floorDoc = await Floor.create({
                building_id: buildingId,
                floor_number: floorNum,
                floor_name: 'Tầng ' + floorNum,
                version: 0,
                map_data: { rooms: [], nodes: [], edges: [] },
                draft_map_data: map_data,
                draft_updated_at: now,
                draft_updated_by: userId
            });
        }

        logActivity({
            user_id: userId,
            action: 'SAVE_DRAFT',
            target_type: 'floor',
            target_id: String(floorDoc._id),
            target: `Building ${buildingId} - Tầng ${floor}`,
            details: 'Lưu nháp server (không xuất bản)',
            ip_address: req.ip || ''
        });

        res.status(200).json({
            message: 'Đã lưu nháp tầng ' + floor + '.',
            draft_updated_at: floorDoc.draft_updated_at,
            draft_updated_by: floorDoc.draft_updated_by
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lưu nháp: ' + error.message });
    }
};

// ==========================================
// Phase 8: LẤY NHÁP
// ==========================================
const getDraft = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }

        const floorDoc = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        }).select('draft_map_data draft_updated_at draft_updated_by version published_at');

        if (!floorDoc || floorDoc.draft_map_data == null) {
            return res.status(200).json({
                draft_map_data: null,
                draft_updated_at: null,
                draft_updated_by: null,
                published_version: floorDoc?.version ?? null
            });
        }

        res.status(200).json({
            draft_map_data: floorDoc.draft_map_data,
            draft_updated_at: floorDoc.draft_updated_at,
            draft_updated_by: floorDoc.draft_updated_by,
            published_version: floorDoc.version
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải nháp: ' + error.message });
    }
};

// ==========================================
// HÀM 1: LƯU BẢN ĐỒ (Web Editor bấm Publish)
// ==========================================
// Web Map Editor gom cục JSON (rooms, nodes, edges...) bắn lên đây
const saveMap = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;   // Lấy ID tòa nhà và tầng từ URL
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }

        const buildingMeta = await Building.findById(buildingId)
            .select('organization_id total_floors')
            .lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        try {
            assertFloorInRange(floorNum, buildingMeta.total_floors);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code || 'FLOOR_OUT_OF_RANGE',
                floor_number: e.floor_number,
                total_floors: e.total_floors
            });
        }

        if (req.user?.role !== 'SUPER_ADMIN') {
            if (buildingMeta.organization_id) {
                const org = await Organization.findById(buildingMeta.organization_id);
                const writable = await assertBuildingWritable(buildingId, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        // Phase 8.4 — publish permit (sau writable checks)
        if (buildingMeta.organization_id) {
            const orgForPermit = await Organization.findById(buildingMeta.organization_id);
            if (orgForPermit) {
                const permit = assertOrgCanPublish(orgForPermit);
                if (!permit.ok) {
                    return res.status(403).json({
                        message: permit.message,
                        code: permit.code
                    });
                }
            }
        }

        // Phase 8.3 — floor lock (advisory: chỉ chặn nếu người khác giữ)
        const editSessionId = resolveEditSessionId(req);
        const lockCheck = await assertCanPublish(
            buildingId,
            floorNum,
            req.user?.userId,
            editSessionId || null
        );
        if (!lockCheck.ok) {
            return res.status(409).json({
                message: lockCheck.message,
                code: lockCheck.code,
                holder: lockCheck.holder
            });
        }

        // Phase 8.2 — map_data từ body hoặc từ draft (+ Draft collection 2a)
        const resolved = await resolvePublishMapData(buildingId, floorNum, req.body || {});
        if (!resolved.ok) {
            return res.status(400).json({
                message: resolved.message,
                code: resolved.code
            });
        }
        const map_data = resolved.map_data;

        const validation = validateMapData(map_data);
        if (!validation.ok) {
            return res.status(400).json({
                message: 'Validate map thất bại.',
                code: 'VALIDATE_FAILED',
                errors: validation.errors
            });
        }

        const userId = req.user ? req.user.userId : null;
        const result = await applyPublish({
            buildingId,
            floorNum,
            map_data,
            userId,
            ip: req.ip || ''
        });

        const status = result.created ? 201 : 200;
        const message = result.created
            ? 'Tạo bản đồ Tầng ' + floor + ' thành công!'
            : 'Cập nhật bản đồ Tầng ' + floor + ' thành công! (Version ' + result.version + ')';

        res.status(status).json({
            message,
            map: result.floor,
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lưu bản đồ: ' + error.message });
    }
};

// ==========================================
// HÀM 2: TẢI BẢN ĐỒ VỀ (Web Editor mở lên sửa tiếp)
// ==========================================
const loadMap = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);

        if (!req.user) {
            const allowed = await assertPublicBuildingAccess(buildingId, res);
            if (!allowed) return;
        }

        const buildingMeta = await Building.findById(buildingId).select('total_floors').lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        if (Number.isFinite(floorNum)) {
            const n = Number(buildingMeta.total_floors) || 1;
            if (floorNum < 0 || floorNum >= n) {
                return res.status(404).json({
                    message: `Tầng ${floorNum} ngoài phạm vi (0..${n - 1}).`,
                    code: 'FLOOR_OUT_OF_RANGE'
                });
            }
        }

        const map = await Floor.findOne({
            building_id: buildingId,
            floor_number: Number.isFinite(floorNum) ? { $in: [floorNum, String(floorNum)] } : floor
        });

        if (!map) {
            console.log(`⚠️ LOAD: Không tìm thấy bản đồ [Tòa nhà: ${buildingId}, Tầng: ${floor}]`);
            return res.status(404).json({ message: 'Chưa có bản đồ cho tầng này!' });
        }

        // Log LOAD_MAP (chỉ route private có req.user; public route bỏ qua)
        if (req.user?.userId) {
            logActivity({
                user_id: req.user.userId,
                action: 'LOAD_MAP',
                target_type: 'floor',
                target_id: String(map._id),
                target: `Building ${buildingId} - Tầng ${floor}`,
                details: { version: map.version, message: 'Tải bản đồ lên Editor' },
                ip_address: req.ip || ''
            });
        }

        console.log(`📥 LOAD: Tải bản đồ thành công [Tòa nhà: ${buildingId}, Tầng: ${floor}] - Phòng: ${map.map_data?.rooms?.length || 0}`);
        res.status(200).json(map);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải bản đồ: ' + error.message });
    }
};

// ==========================================
// HÀM 3: APP ANDROID TẢI BẢN ĐỒ OFFLINE
// ==========================================
// App gọi hàm này để kéo toàn bộ bản đồ mọi tầng của 1 tòa nhà về cache
const downloadMap = async (req, res) => {
    try {
        const { buildingId } = req.params;

        const allowed = await assertPublicBuildingAccess(buildingId, res);
        if (!allowed) return;

        // Lấy tất cả tầng của tòa nhà này
        const maps = await Floor.find({ building_id: buildingId });

        if (!maps.length) {
            return res.status(404).json({ message: 'Tòa nhà này chưa có bản đồ!' });
        }

        const buildingMeta = await Building.findById(buildingId).select('total_floors').lean();
        // total_floors = metadata tòa (0..N-1); floors_count = số Floor document thực tế
        res.status(200).json({
            building_id: buildingId,
            total_floors: buildingMeta?.total_floors ?? maps.length,
            floors_count: maps.length,
            floors: maps
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải bản đồ: ' + error.message });
    }
};

module.exports = { saveMap, loadMap, downloadMap, syncQrCodes, saveDraft, getDraft };
